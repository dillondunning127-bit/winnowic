// js/sessions.js
// Winnowic Session Tracking
// Fixes the core retention blind spot: you can see attempts but not sessions.
//
// Usage in quiz.js:
//   import { startSession, endSession } from './sessions.js';
//   — call startSession() at the top of startQuiz()
//   — call endSession()   inside showFinalScore(), before return

import { supabase } from './supabase.js';

let currentSessionId = null;
let sessionStartTime  = null;

// ─────────────────────────────────────────────
// Call at the start of startQuiz()
// mode: 'normal' | 'adaptive' | 'diagnostic' | 'daily_batch'
// source: 'organic' | 'email_nudge' | 'daily_batch_email'
// ─────────────────────────────────────────────
export async function startSession(exam, mode, source = 'organic') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // anonymous users — skip silently

  sessionStartTime = Date.now();

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id:        user.id,
      exam:           exam,
      mode:           mode,
      session_source: source,
      started_at:     new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    console.error('startSession error:', error);
    return;
  }

  currentSessionId = data.id;

}

// ─────────────────────────────────────────────
// Call inside showFinalScore(), before early returns
// questionsAttempted: answerResults.length or equivalent
// ─────────────────────────────────────────────
export async function endSession(questionsAttempted = 0) {
  if (!currentSessionId) return;

  const durationMs = sessionStartTime
    ? Date.now() - sessionStartTime
    : null;

  const { error } = await supabase
    .from('study_sessions')
    .update({
      ended_at:             new Date().toISOString(),
      questions_attempted:  questionsAttempted,
      duration_seconds:     durationMs ? Math.round(durationMs / 1000) : null
    })
    .eq('id', currentSessionId);

  if (error) {
    console.error('endSession error:', error);
  } else {
   
  }

  currentSessionId = null;
  sessionStartTime  = null;
}

// ─────────────────────────────────────────────
// Utility: get D1 / D7 / D30 retention counts
// (use in your internal admin dashboard)
// ─────────────────────────────────────────────
export async function getRetentionStats() {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('user_id, started_at');

  if (error || !data) return null;

  // Group first session date per user
  const firstSession = {};
  for (const s of data) {
    const uid = s.user_id;
    const date = new Date(s.started_at);
    if (!firstSession[uid] || date < firstSession[uid]) {
      firstSession[uid] = date;
    }
  }

  // Group all session dates per user
  const allDates = {};
  for (const s of data) {
    if (!allDates[s.user_id]) allDates[s.user_id] = [];
    allDates[s.user_id].push(new Date(s.started_at));
  }

  let d1 = 0, d7 = 0, d30 = 0, total = 0;

  for (const [uid, first] of Object.entries(firstSession)) {
    total++;
    const userDates = allDates[uid];
    const returnedD1  = userDates.some(d => daysBetween(first, d) === 1);
    const returnedD7  = userDates.some(d => daysBetween(first, d) >= 2  && daysBetween(first, d) <= 7);
    const returnedD30 = userDates.some(d => daysBetween(first, d) >= 8  && daysBetween(first, d) <= 30);
    if (returnedD1)  d1++;
    if (returnedD7)  d7++;
    if (returnedD30) d30++;
  }

  return {
    totalUsers: total,
    d1RetentionPct:  total ? Math.round((d1  / total) * 100) : 0,
    d7RetentionPct:  total ? Math.round((d7  / total) * 100) : 0,
    d30RetentionPct: total ? Math.round((d30 / total) * 100) : 0
  };
}

function daysBetween(a, b) {
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}