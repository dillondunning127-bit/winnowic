// supabase/functions/daily-nudge/index.ts
// Winnowic Daily Email Nudge System
//
// Runs on a daily cron schedule.
// Sends two email types:
//   1. Inactivity nudge  — logged-in user with a goal hasn't practiced in 3+ days
//   2. Streak warning    — user has batch streak ≥ 3, hasn't completed today's batch
//
// Deploy:
//   supabase functions deploy daily-nudge
//
// Set secrets (run once in terminal):
//   supabase secrets set RESEND_API_KEY=re_xxxx
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
//
// Schedule (add in Supabase dashboard → Edge Functions → daily-nudge → Schedule):
//   Cron: 0 20 * * *   (runs at 8pm UTC daily — adjust for your users' timezone)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY      = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// Use your verified domain once set up, or onboarding@resend.dev for now
const FROM_EMAIL = "Winnowic <noreply@winnowic.com>";
const APP_URL    = "https://www.winnowic.com"; // update if different

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const results = await runNudges();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  } catch (err) {
    console.error("daily-nudge fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500
    });
  }
});

// ─────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────

async function runNudges() {
  const today     = new Date().toISOString().split("T")[0];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Get all users who have set a goal (these are our engaged users) ──
  const { data: goals, error: goalsError } = await supabase
    .from("user_goals")
    .select("user_id, exam, test_date, target_score");

  if (goalsError || !goals?.length) {
    console.log("No goals found or error:", goalsError);
    return { sent: 0 };
  }

  // ── 2. Get auth emails for those users (requires service role) ──
  const userIds = [...new Set(goals.map(g => g.user_id))];
  const emailMap: Record<string, string> = {};

  for (const uid of userIds) {
    const { data } = await supabase.auth.admin.getUserById(uid);
    if (data?.user?.email) {
      emailMap[uid] = data.user.email;
    }
  }

  // ── 3. Get most recent session per user ──
  const { data: sessions } = await supabase
    .from("study_sessions")
    .select("user_id, started_at")
    .in("user_id", userIds)
    .order("started_at", { ascending: false });

  const lastSessionMap: Record<string, string> = {};
  for (const s of (sessions || [])) {
    if (!lastSessionMap[s.user_id]) {
      lastSessionMap[s.user_id] = s.started_at;
    }
  }

  // ── 4. Get today's completed batches ──
  const { data: todayBatches } = await supabase
    .from("daily_batches")
    .select("user_id, exam, completed_at")
    .eq("batch_date", today)
    .not("completed_at", "is", null);

  const completedTodaySet = new Set(
    (todayBatches || []).map(b => `${b.user_id}__${b.exam}`)
  );

  // ── 5. Get batch streaks for streak-warning candidates ──
  const { data: recentBatches } = await supabase
    .from("daily_batches")
    .select("user_id, exam, batch_date, completed_at")
    .in("user_id", userIds)
    .gte("batch_date", getPastDate(60))
    .order("batch_date", { ascending: false });

  // ── 6. Decide who gets which email ──
  let sent = 0;
  const alreadyEmailed = new Set<string>(); // one email per user per day

  for (const goal of goals) {
    const { user_id, exam, test_date, target_score } = goal;
    const email = emailMap[user_id];
    if (!email) continue;
    if (alreadyEmailed.has(user_id)) continue;

    const lastSession   = lastSessionMap[user_id];
    const daysInactive  = lastSession
      ? Math.floor((Date.now() - new Date(lastSession).getTime()) / 86400000)
      : 999;
    const daysUntilTest = test_date
      ? Math.ceil((new Date(test_date).getTime() - Date.now()) / 86400000)
      : null;

    const batchKey      = `${user_id}__${exam}`;
    const doneToday     = completedTodaySet.has(batchKey);

    // Compute streak for this user+exam
    const userBatches   = (recentBatches || [])
      .filter(b => b.user_id === user_id && b.exam === exam);
    const streak        = computeStreak(userBatches, today);

    // ── STREAK WARNING (higher priority — send if streak ≥ 3 and not done today) ──
    if (streak >= 3 && !doneToday) {
      await sendStreakWarningEmail({
        email,
        exam,
        streak,
        daysUntilTest,
        targetScore: target_score
      });
      alreadyEmailed.add(user_id);
      sent++;
      continue;
    }

    // ── INACTIVITY NUDGE (inactive 3+ days, has a goal) ──
    if (daysInactive >= 3 && !doneToday) {
      await sendInactivityEmail({
        email,
        exam,
        daysInactive,
        daysUntilTest,
        targetScore: target_score
      });
      alreadyEmailed.add(user_id);
      sent++;
    }
  }

  console.log(`daily-nudge complete: ${sent} emails sent`);
  return { sent, date: today };
}

// ─────────────────────────────────────────────
// Email: Streak Warning
// ─────────────────────────────────────────────

async function sendStreakWarningEmail({
  email, exam, streak, daysUntilTest, targetScore
}: {
  email: string;
  exam: string;
  streak: number;
  daysUntilTest: number | null;
  targetScore: number | null;
}) {
  const examLabel  = formatExam(exam);
  const goalLine   = buildGoalLine(daysUntilTest, targetScore, examLabel);
  const quizUrl    = `${APP_URL}/quiz.html`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#FFD84D; font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFD84D; padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="
        background:#ffffff;
        border-radius:20px;
        overflow:hidden;
        box-shadow:0 4px 24px rgba(0,0,0,0.10);
        max-width:560px;
        width:100%;
      ">
        <!-- Header -->
        <tr>
          <td style="background:#0B1F3B; padding:28px 36px 24px; text-align:center;">
            <div style="font-size:32px; margin-bottom:8px;">🔥</div>
            <div style="color:#FFD84D; font-size:22px; font-weight:700; letter-spacing:-0.3px;">
              Don't lose your ${streak}-day streak!
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 28px;">
            <p style="margin:0 0 16px; font-size:15px; color:#333; line-height:1.6;">
              You've built a <strong>${streak}-day streak</strong> on ${examLabel} — 
              that's real momentum. Your daily batch is ready and waiting.
            </p>
            ${goalLine ? `
            <div style="
              background:#FFF8E1;
              border-left:4px solid #FFD84D;
              border-radius:8px;
              padding:12px 16px;
              margin-bottom:20px;
              font-size:14px;
              color:#555;
            ">
              📅 ${goalLine}
            </div>` : ""}
            <p style="margin:0 0 24px; font-size:15px; color:#333; line-height:1.6;">
              It only takes <strong>10 questions</strong> to keep your streak alive. 
              Your batch is personalized to your weak areas — this is the most 
              efficient studying you can do today.
            </p>
            <div style="text-align:center; margin-bottom:8px;">
              <a href="${quizUrl}?mode=daily_batch&exam=${exam}"
                 style="
                   display:inline-block;
                   background:#0B1F3B;
                   color:#FFD84D;
                   text-decoration:none;
                   font-weight:700;
                   font-size:15px;
                   padding:14px 32px;
                   border-radius:12px;
                   letter-spacing:0.2px;
                 ">
                Do Today's Batch →
              </a>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:0 36px 28px; text-align:center;">
            <p style="font-size:12px; color:#aaa; margin:0;">
              Winnowic · You're receiving this because you set a study goal.<br>
              <a href="${APP_URL}" style="color:#aaa;">Visit Winnowic</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: email,
    subject: `🔥 Your ${streak}-day streak is on the line`,
    html
  });
}

// ─────────────────────────────────────────────
// Email: Inactivity Nudge
// ─────────────────────────────────────────────

async function sendInactivityEmail({
  email, exam, daysInactive, daysUntilTest, targetScore
}: {
  email: string;
  exam: string;
  daysInactive: number;
  daysUntilTest: number | null;
  targetScore: number | null;
}) {
  const examLabel = formatExam(exam);
  const goalLine  = buildGoalLine(daysUntilTest, targetScore, examLabel);
  const quizUrl   = `${APP_URL}/quiz.html`;

  const urgency = daysUntilTest !== null && daysUntilTest <= 14
    ? `Your ${examLabel} is in <strong>${daysUntilTest} days</strong>. `
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#FFD84D; font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFD84D; padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="
        background:#ffffff;
        border-radius:20px;
        overflow:hidden;
        box-shadow:0 4px 24px rgba(0,0,0,0.10);
        max-width:560px;
        width:100%;
      ">
        <!-- Header -->
        <tr>
          <td style="background:#0B1F3B; padding:28px 36px 24px; text-align:center;">
            <div style="color:#FFD84D; font-size:22px; font-weight:700; letter-spacing:-0.3px;">
              Your ${examLabel} batch is waiting
            </div>
            <div style="color:rgba(255,216,77,0.7); font-size:14px; margin-top:6px;">
              ${daysInactive} days since your last session
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 28px;">
            <p style="margin:0 0 16px; font-size:15px; color:#333; line-height:1.6;">
              ${urgency}Today's batch has 10 questions targeted at your 
              weakest ${examLabel} units — built specifically from your 
              past performance.
            </p>
            ${goalLine ? `
            <div style="
              background:#FFF8E1;
              border-left:4px solid #FFD84D;
              border-radius:8px;
              padding:12px 16px;
              margin-bottom:20px;
              font-size:14px;
              color:#555;
            ">
              📅 ${goalLine}
            </div>` : ""}
            <p style="margin:0 0 24px; font-size:15px; color:#333; line-height:1.6;">
              Consistent daily practice — even just 10 questions — is the 
              single most effective way to improve your score before test day.
            </p>
            <div style="text-align:center; margin-bottom:8px;">
              <a href="${quizUrl}?mode=daily_batch&exam=${exam}"
                 style="
                   display:inline-block;
                   background:#0B1F3B;
                   color:#FFD84D;
                   text-decoration:none;
                   font-weight:700;
                   font-size:15px;
                   padding:14px 32px;
                   border-radius:12px;
                   letter-spacing:0.2px;
                 ">
                Start Today's Batch →
              </a>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:0 36px 28px; text-align:center;">
            <p style="font-size:12px; color:#aaa; margin:0;">
              Winnowic · You're receiving this because you set a study goal.<br>
              <a href="${APP_URL}" style="color:#aaa;">Visit Winnowic</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: email,
    subject: `Your ${examLabel} daily batch is ready`,
    html
  });
}

// ─────────────────────────────────────────────
// Resend API call
// ─────────────────────────────────────────────

async function sendEmail({
  to, subject, html
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html
    })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend error for ${to}:`, body);
  } else {
    console.log(`Email sent to ${to}: "${subject}"`);
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function computeStreak(
  batches: { batch_date: string; completed_at: string | null }[],
  today: string
): number {
  const completed = batches
    .filter(b => b.completed_at !== null)
    .map(b => b.batch_date)
    .sort()
    .reverse();

  if (completed.length === 0) return 0;

  let streak = 0;
  let expected = today;

  for (const date of completed) {
    if (date === expected) {
      streak++;
      expected = getPastDate(streak);
    } else {
      break;
    }
  }

  return streak;
}

function getPastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

function formatExam(exam: string): string {
  const map: Record<string, string> = {
    SAT_MATH:   "SAT Math",
    AP_PRECALC: "AP Precalculus",
    AP_CALC_AB: "AP Calc AB",
    AP_CALC_BC: "AP Calc BC"
  };
  return map[exam] || exam.replace(/_/g, " ");
}

function buildGoalLine(
  daysUntilTest: number | null,
  targetScore: number | null,
  examLabel: string
): string {
  if (!daysUntilTest && !targetScore) return "";

  const parts = [];
  if (daysUntilTest !== null) {
    if (daysUntilTest <= 0)       parts.push(`${examLabel} was ${Math.abs(daysUntilTest)} days ago`);
    else if (daysUntilTest === 1) parts.push(`${examLabel} is tomorrow`);
    else                          parts.push(`${examLabel} in ${daysUntilTest} days`);
  }
  if (targetScore) parts.push(`target score: ${targetScore}`);

  return parts.join(" · ");
}
