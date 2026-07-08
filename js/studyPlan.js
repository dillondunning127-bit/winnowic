// js/studyPlan.js
// Winnowic Study Plan Generator — Persistent plan storage + week/day progress tracking

import { supabase } from './supabase.js';
import { getPredictedScore } from './diagnostics.js';
import { getUserGoal, saveUserGoal, getDaysUntilTest } from './goals.js';

const EXAM = 'SAT_MATH';
const UNITS_ORDER = [
    'ALGEBRA',
    'ADVANCED_MATH',
    'PROBLEM_SOLVING_DATA_ANALYSIS',
    'GEOMETRY_TRIGONOMETRY',
    'INFORMATION_AND_IDEAS'
];

function formatUnit(unit) {
    return unit.replaceAll('_', ' ')
        .replace('UNIT', 'Unit ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const loading  = document.getElementById('plan-loading');
    const authWall = document.getElementById('plan-auth-wall');
    const content  = document.getElementById('plan-content');

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (!user) {
        sessionStorage.setItem('studyPlanReturn', 'true');
        loading.style.display = 'none';
        authWall.style.display = 'block';
        return;
    }

    const unitAccuracy = await getUnitAccuracy(user.id);
    let goal = await getUserGoal(EXAM);

    loading.style.display = 'none';
    content.style.display = 'block';

    renderPlan(content, user, unitAccuracy, goal);
});

// ─────────────────────────────────────────────
// Get unit accuracy
// ─────────────────────────────────────────────
async function getUnitAccuracy(userId) {
    const { data: attempts } = await supabase
        .from('topic_attempts')
        .select('unit, is_correct')
        .eq('user_id', userId)
        .contains('exams', [EXAM])
        .order('created_at', { ascending: false })
        .limit(300);

    if (attempts && attempts.length >= 10) {
        return computeAccuracyFromAttempts(attempts);
    }

    const raw = sessionStorage.getItem('diagnosticResults');
    if (raw) {
        const data = JSON.parse(raw);
        const mapped = data.map(r => ({ unit: r.unit, is_correct: r.correct }));
        return computeAccuracyFromAttempts(mapped);
    }

    return {};
}

function computeAccuracyFromAttempts(attempts) {
    const map = {};
    for (const a of attempts) {
        if (!map[a.unit]) map[a.unit] = { correct: 0, total: 0 };
        map[a.unit].total++;
        if (a.is_correct) map[a.unit].correct++;
    }
    const result = {};
    for (const [unit, s] of Object.entries(map)) {
        result[unit] = Math.round((s.correct / s.total) * 100);
    }
    return result;
}

// ─────────────────────────────────────────────
// Persistence — saved plan helpers
// ─────────────────────────────────────────────

// Load the user's saved plan for this exam, if one exists.
async function loadSavedPlan(userId, exam) {
    const { data, error } = await supabase
        .from('study_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('exam', exam)
        .maybeSingle();

    if (error) {
        console.error('Error loading saved study plan:', error);
        return null;
    }
    return data;
}

// Upsert the plan. Pass `createdAt` to preserve the original start date
// (e.g. when only sessions/week or test date changed). Omit it to stamp
// a fresh start date (initial generation or an intentional regenerate).
// `sessionsHistory` is a log of { sessions_per_week, effective_from } entries
// used to keep past calendar days locked to whatever pace was active on
// that date, even after the user changes sessions/week going forward.
async function savePlan(userId, exam, schedule, sessionsPerWeek, testDate, createdAt = null, sessionsHistory = null) {
    const payload = {
        user_id: userId,
        exam,
        schedule,
        sessions_per_week: sessionsPerWeek,
        test_date: testDate || null
    };
    if (createdAt) payload.created_at = createdAt;
    if (sessionsHistory) payload.sessions_history = sessionsHistory;

    const { data, error } = await supabase
        .from('study_plans')
        .upsert(payload, { onConflict: 'user_id,exam' })
        .select()
        .single();

    if (error) {
        console.error('Error saving study plan:', error);
        return null;
    }
    return data;
}

// Normalizes to local midnight so history entries compare cleanly
// against calendar day cells (which are also midnight-based Dates).
function todayMidnightISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

async function deleteSavedPlan(userId, exam) {
    const { error } = await supabase
        .from('study_plans')
        .delete()
        .eq('user_id', userId)
        .eq('exam', exam);

    if (error) console.error('Error deleting study plan:', error);
}

// ─────────────────────────────────────────────
// Build progressive week schedule
// ─────────────────────────────────────────────
function buildSchedule(unitAccuracy, daysUntil, sessionsPerWeek) {
    // Sort units weakest first
    const sorted = Object.entries(unitAccuracy)
        .sort(([, a], [, b]) => a - b);

    // Add unseen units at end
    for (const u of UNITS_ORDER) {
        if (!unitAccuracy[u]) sorted.push([u, null]);
    }

    const totalWeeks = daysUntil
        ? Math.max(2, Math.floor(daysUntil / 7))
        : 8;

    const weeks = [];

    if (totalWeeks <= 3) {
        // Short plan: practice → half test → full sim
        weeks.push(makePracticeWeek(1, sorted.slice(0, 2), sessionsPerWeek, true));
        weeks.push(makeHalfTestWeek(2, sessionsPerWeek));
        weeks.push(makeFullSimWeek(3, sessionsPerWeek, true));

    } else if (totalWeeks <= 5) {
        // Medium plan: practice → half test → practice → full sim → full sim
        weeks.push(makePracticeWeek(1, sorted.slice(0, 2), sessionsPerWeek, true));
        weeks.push(makeHalfTestWeek(2, sessionsPerWeek));
        weeks.push(makePracticeWeek(3, sorted.slice(2, 4), sessionsPerWeek, false));
        weeks.push(makeFullSimWeek(4, sessionsPerWeek, false));
        if (totalWeeks >= 5) {
            weeks.push(makeFullSimWeek(5, sessionsPerWeek, true));
        }

    } else {
        // Full plan (6+ weeks): progressive ramp
        // Week 1: weakest 2 units
        weeks.push(makePracticeWeek(1, sorted.slice(0, 2), sessionsPerWeek, true));

        // Week 2: practice + half test
        weeks.push(makeHalfTestWeek(2, sessionsPerWeek));

        // Week 3: next 2 units
        weeks.push(makePracticeWeek(3, sorted.slice(2, 4), sessionsPerWeek, false));

        // Week 4: half test
        weeks.push(makeHalfTestWeek(4, sessionsPerWeek));

        // Week 5: remaining units / review weakest
        const week5Units = sorted.length > 4
            ? sorted.slice(4)
            : sorted.slice(0, 2); // cycle back to weakest
        weeks.push(makePracticeWeek(5, week5Units, sessionsPerWeek, false));

        // Week 6: full simulation
        weeks.push(makeFullSimWeek(6, sessionsPerWeek, false));

        // Weeks 7 to totalWeeks-1: alternate practice and full sims
        for (let w = 7; w < totalWeeks; w++) {
            const unitSlice = sorted.slice((w % sorted.length), (w % sorted.length) + 2);
            if (w % 2 === 1) {
                weeks.push(makePracticeWeek(w, unitSlice, sessionsPerWeek, false));
            } else {
                weeks.push(makeFullSimWeek(w, sessionsPerWeek, false));
            }
        }

        // Final week: always full simulation
        weeks.push(makeFullSimWeek(totalWeeks, sessionsPerWeek, true));
    }

    // Mark week 1 as current by default (real "current" state is recomputed
    // from the saved plan's created_at via applyWeekProgress at render time)
    if (weeks.length > 0) weeks[0].isCurrent = true;

    return weeks;
}

function makePracticeWeek(num, units, sessionsPerWeek, isCurrent) {
    return {
        weekNum: num,
        type: 'practice',
        units,
        sessionsPerWeek,
        isCurrent
    };
}

function makeHalfTestWeek(num, sessionsPerWeek) {
    return {
        weekNum: num,
        type: 'half_sim',
        units: [],
        sessionsPerWeek,
        isCurrent: false
    };
}

function makeFullSimWeek(num, sessionsPerWeek, isFinal) {
    return {
        weekNum: num,
        type: 'simulation',
        units: [],
        sessionsPerWeek,
        isCurrent: false,
        isFinal
    };
}

// Stamp each week with isPast / isCurrent based on how many weeks have
// elapsed since the plan's start date (time-based, not activity-based).
function applyWeekProgress(schedule, planStartDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(planStartDate);
    start.setHours(0, 0, 0, 0);

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const maxWeek = schedule.length > 0 ? schedule[schedule.length - 1].weekNum : 1;

    let currentWeekNum = Math.floor((today - start) / msPerWeek) + 1;
    if (currentWeekNum < 1) currentWeekNum = 1;
    if (currentWeekNum > maxWeek) currentWeekNum = maxWeek;

    return schedule.map(week => ({
        ...week,
        isPast: week.weekNum < currentWeekNum,
        isCurrent: week.weekNum === currentWeekNum
    }));
}

// ─────────────────────────────────────────────
// Render full plan
// ─────────────────────────────────────────────
async function renderPlan(container, user, unitAccuracy, goal) {
    const daysUntil = goal?.test_date ? getDaysUntilTest(goal.test_date) : null;

    const totalAttempts = Object.values(unitAccuracy);
    const avgAccuracy = totalAttempts.length > 0
        ? Math.round(totalAttempts.reduce((a, b) => a + b, 0) / totalAttempts.length)
        : 50;

    const predictedRaw = await getPredictedScore(EXAM, avgAccuracy);
    const predicted = predictedRaw && predictedRaw !== '--' ? parseInt(predictedRaw) : null;

    // ── Load saved plan, or generate + persist a new one ──
    let sessionsPerWeek;
    let schedule;
    let planStartDate;
    let sessionsHistory;

    const existingPlan = await loadSavedPlan(user.id, EXAM);

    if (existingPlan) {
        sessionsPerWeek = existingPlan.sessions_per_week || 5;
        schedule = existingPlan.schedule;
        planStartDate = new Date(existingPlan.created_at);
        // Back-fill history for plans saved before this feature existed
        sessionsHistory = (Array.isArray(existingPlan.sessions_history) && existingPlan.sessions_history.length > 0)
            ? existingPlan.sessions_history
            : [{ sessions_per_week: sessionsPerWeek, effective_from: planStartDate.toISOString() }];
    } else {
        sessionsPerWeek = 5;
        schedule = buildSchedule(unitAccuracy, daysUntil, sessionsPerWeek);
        sessionsHistory = [{ sessions_per_week: sessionsPerWeek, effective_from: todayMidnightISO() }];
        const saved = await savePlan(user.id, EXAM, schedule, sessionsPerWeek, goal?.test_date || null, null, sessionsHistory);
        planStartDate = saved ? new Date(saved.created_at) : new Date();
        if (saved?.sessions_history) sessionsHistory = saved.sessions_history;
    }

    const render = () => {
        const scheduleWithProgress = applyWeekProgress(schedule, planStartDate);

        const practiceWeeks = scheduleWithProgress.filter(w => w.type === 'practice').length;
        const projectedFinal = predicted
            ? Math.min(800, predicted + (sessionsPerWeek * practiceWeeks * 4))
            : null;

        const scoreLow  = predicted ? Math.max(200, predicted - 20) : null;
        const scoreHigh = predicted ? Math.min(800, predicted + 20) : null;
        const projLow   = projectedFinal ? Math.max(200, projectedFinal - 20) : null;
        const projHigh  = projectedFinal ? Math.min(800, projectedFinal + 20) : null;

        container.innerHTML = `
            <!-- HERO -->
            <div class="plan-hero">
                <div class="plan-hero-left">
                    <h1>Your SAT Math Study Plan</h1>
                    <p>${goal?.test_date
                        ? `Test date: ${new Date(goal.test_date + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})} · ${daysUntil} days away`
                        : 'Set a test date to personalize your timeline'
                    }</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
                    <div class="plan-hero-stats">
                        ${scoreLow !== null ? `
                        <div class="plan-stat">
                            <div class="plan-stat-value">${scoreLow}–${scoreHigh}</div>
                            <div class="plan-stat-label">Current Range</div>
                        </div>` : ''}
                        ${goal?.target_score ? `
                        <div class="plan-stat">
                            <div class="plan-stat-value">${goal.target_score}</div>
                            <div class="plan-stat-label">Target Score</div>
                        </div>` : ''}
                        ${daysUntil ? `
                        <div class="plan-stat">
                            <div class="plan-stat-value">${daysUntil}</div>
                            <div class="plan-stat-label">Days Left</div>
                        </div>` : ''}
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button id="edit-goal-btn" style="
                            background:rgba(255,255,255,0.15);
                            border:1px solid rgba(255,216,77,0.3);
                            color:#FFD84D; border-radius:10px;
                            padding:6px 14px; font-size:12px; font-weight:600;
                            cursor:pointer; font-family:'Inter',sans-serif;
                            transition:background 0.15s;
                        ">Edit Goal</button>
                        <button id="regenerate-plan-btn" style="
                            background:rgba(255,255,255,0.15);
                            border:1px solid rgba(255,255,255,0.25);
                            color:#fff; border-radius:10px;
                            padding:6px 14px; font-size:12px; font-weight:600;
                            cursor:pointer; font-family:'Inter',sans-serif;
                            transition:background 0.15s;
                        ">Edit / Regenerate Plan</button>
                    </div>
                </div>
            </div>

            <!-- EDIT GOAL FORM -->
            <div id="edit-goal-form" style="
                display:none; background:rgba(255,255,255,0.9);
                border-radius:16px; padding:20px 24px;
                margin-bottom:24px; box-shadow:0 4px 16px rgba(0,0,0,0.06);
            ">
                <div style="font-weight:700; color:#0B1F3B; margin-bottom:14px;">
                    ${goal ? 'Update Your Goal' : 'Set Your Goal'}
                </div>
                <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
                    <div>
                        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Test Date</label>
                        <input type="date" id="edit-goal-date" class="modern-select"
                               style="padding:8px 12px;width:160px;box-sizing:border-box;"
                               value="${goal?.test_date || ''}"
                               min="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Target Score (200–800)</label>
                        <input type="number" id="edit-goal-score" class="modern-select"
                               style="padding:8px 12px;width:130px;box-sizing:border-box;"
                               min="200" max="800" step="10" placeholder="e.g. 650"
                               value="${goal?.target_score || ''}">
                    </div>
                    <button id="save-edit-goal-btn" class="btn-primary" style="padding:9px 18px;">Save</button>
                    <button id="cancel-edit-goal-btn" class="btn-secondary" style="padding:9px 18px;">Cancel</button>
                </div>
            </div>

            <!-- SESSIONS SELECTOR -->
            <div class="plan-sessions-selector">
                <div class="plan-sessions-label">
                    Sessions per week
                    <span>Each session = 1 daily batch of 10 questions, ~10 min</span>
                </div>
                <div class="sessions-btns">
                    <button class="session-btn ${sessionsPerWeek===3?'active':''}" data-sessions="3">3</button>
                    <button class="session-btn ${sessionsPerWeek===5?'active':''}" data-sessions="5">5</button>
                    <button class="session-btn ${sessionsPerWeek===7?'active':''}" data-sessions="7">7</button>
                </div>
            </div>

            <!-- CALENDAR -->
            <div id="study-calendar"></div>

            <!-- SCHEDULE LEGEND -->
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;padding:0 4px;">
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;">
                    <div style="width:12px;height:12px;border-radius:3px;background:rgba(11,31,59,0.08);border:1px solid #ddd;"></div>
                    Daily Practice
                </div>
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;">
                    <div style="width:12px;height:12px;border-radius:3px;background:#E65100;"></div>
                    22-Question Half Test
                </div>
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;">
                    <div style="width:12px;height:12px;border-radius:3px;background:#C62828;"></div>
                    Full 44-Question Simulation
                </div>
            </div>

            <!-- WEEK SCHEDULE -->
            <div class="plan-weeks">
                ${scheduleWithProgress.map(week => renderWeekCard(week, unitAccuracy)).join('')}
            </div>

            <!-- PROJECTION -->
            ${projLow && goal?.target_score ? `
            <div class="plan-projection">
                <div class="projection-label">Projected score at test date</div>
                <div class="projection-score">${projLow}–${projHigh}</div>
                <div class="projection-note">
                    Based on ${sessionsPerWeek} sessions/week · Actual results depend on consistency
                </div>
                ${projectedFinal >= goal.target_score
                    ? `<div style="margin-top:10px;font-size:13px;color:#2E7D32;font-weight:600;">✓ On track to hit your target of ${goal.target_score}</div>`
                    : `<div style="margin-top:10px;font-size:13px;color:#FF8F00;font-weight:600;">Consider adding more sessions per week to reach ${goal.target_score}</div>`
                }
            </div>` : ''}
        `;

        // Wire session buttons — re-paces the schedule but preserves the
        // original plan start date so past-week progress isn't reset.
        container.querySelectorAll('.session-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (parseInt(btn.dataset.sessions) === sessionsPerWeek) return;
                container.querySelectorAll('.session-btn').forEach(b => b.disabled = true);

                sessionsPerWeek = parseInt(btn.dataset.sessions);
                schedule = buildSchedule(unitAccuracy, daysUntil, sessionsPerWeek);

                // Lock in the pace history: past days keep whatever pattern
                // was active on their date; only today-forward adopts the change.
                sessionsHistory = [
                    ...sessionsHistory,
                    { sessions_per_week: sessionsPerWeek, effective_from: todayMidnightISO() }
                ];

                const updated = await savePlan(
                    user.id, EXAM, schedule, sessionsPerWeek,
                    goal?.test_date || null, planStartDate.toISOString(), sessionsHistory
                );
                if (updated) {
                    planStartDate = new Date(updated.created_at);
                    if (updated.sessions_history) sessionsHistory = updated.sessions_history;
                }

                render();
            });
        });

        // Wire edit goal
        document.getElementById('edit-goal-btn')?.addEventListener('click', () => {
            const form = document.getElementById('edit-goal-form');
            if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('cancel-edit-goal-btn')?.addEventListener('click', () => {
            document.getElementById('edit-goal-form').style.display = 'none';
        });

        document.getElementById('save-edit-goal-btn')?.addEventListener('click', async () => {
            const date  = document.getElementById('edit-goal-date')?.value;
            const score = document.getElementById('edit-goal-score')?.value;
            const btn   = document.getElementById('save-edit-goal-btn');
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
            await saveUserGoal(EXAM, date || null, score ? parseInt(score) : null);
            goal = await getUserGoal(EXAM);
            // Keep the saved plan's progress intact, just update its test_date field
            await savePlan(
                user.id, EXAM, schedule, sessionsPerWeek,
                goal?.test_date || null, planStartDate.toISOString(), sessionsHistory
            );
            render();
        });

        // Wire Edit / Regenerate — intentional reset, builds a fresh plan
        // from current topic_attempts and restarts the plan clock.
        document.getElementById('regenerate-plan-btn')?.addEventListener('click', async () => {
            const confirmed = confirm(
                'This rebuilds your plan from your latest practice data and restarts "Week 1" at today. ' +
                'Your current schedule progress will be reset. Continue?'
            );
            if (!confirmed) return;

            const btn = document.getElementById('regenerate-plan-btn');
            if (btn) { btn.textContent = 'Regenerating...'; btn.disabled = true; }

            unitAccuracy = await getUnitAccuracy(user.id);
            schedule = buildSchedule(unitAccuracy, daysUntil, sessionsPerWeek);
            sessionsHistory = [{ sessions_per_week: sessionsPerWeek, effective_from: todayMidnightISO() }];

            const updated = await savePlan(user.id, EXAM, schedule, sessionsPerWeek, goal?.test_date || null, null, sessionsHistory);
            planStartDate = updated ? new Date(updated.created_at) : new Date();
            if (updated?.sessions_history) sessionsHistory = updated.sessions_history;

            render();
        });

        // Wire batch/sim buttons
        container.querySelectorAll('.btn-start-batch').forEach(btn => {
            btn.addEventListener('click', () => {
                window.location.href = '/quiz.html?mode=daily_batch&exam=SAT_MATH';
            });
        });

        container.querySelectorAll('.btn-start-half-sim').forEach(btn => {
            btn.addEventListener('click', () => {
                // autostart=0 pre-selects mode/length/exam on quiz.html but
                // leaves it to the user to press Start themselves
                window.location.href = '/quiz.html?mode=normal&exam=SAT_MATH&length=22&autostart=0';
            });
        });

        container.querySelectorAll('.btn-start-sim').forEach(btn => {
            btn.addEventListener('click', () => {
                window.location.href = '/quiz.html?mode=normal&exam=SAT_MATH&length=44&autostart=0';
            });
        });

        // Render calendar anchored to the plan's actual start date
        renderCalendar('study-calendar', sessionsHistory, goal?.test_date || null, scheduleWithProgress, planStartDate);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    render();
}

// ─────────────────────────────────────────────
// Render a single week card
// ─────────────────────────────────────────────
function renderWeekCard(week, unitAccuracy) {
    const isPast = !!week.isPast;
    const pastStyle = isPast ? 'opacity:0.45; filter:grayscale(65%);' : '';

    const cardClass = week.isCurrent ? 'week-current' :
                      week.type === 'simulation' ? 'week-sim' :
                      week.type === 'half_sim' ? 'week-sim' :
                      'week-upcoming';

    const badgeClass = isPast ? 'badge-upcoming' :
                       week.isCurrent ? 'badge-current' :
                       week.type === 'simulation' ? 'badge-sim' :
                       week.type === 'half_sim' ? 'badge-sim' :
                       'badge-upcoming';

    const badgeText = isPast ? 'Completed' :
                      week.isCurrent ? 'This Week' :
                      week.type === 'simulation' ? (week.isFinal ? 'Final Prep' : 'Full Test') :
                      week.type === 'half_sim' ? 'Half Test' :
                      `Week ${week.weekNum}`;

    if (week.type === 'half_sim') {
        return `
        <div class="week-card ${cardClass}" style="border-left-color:#E65100;${pastStyle}">
            <div class="week-header">
                <div class="week-title">Week ${week.weekNum} — 22-Question Half Test</div>
                <div class="week-badge ${badgeClass}" style="background:${isPast ? 'rgba(11,31,59,0.08)' : '#E65100'};color:${isPast ? '#0B1F3B' : '#fff'};">${badgeText}</div>
            </div>
            <p style="font-size:13px;color:#666;margin:0 0 12px;">
                A timed 22-question section covering all SAT Math units. 
                Builds test endurance and identifies gaps before the full simulation.
                Treat it like the real thing — no pausing.
            </p>
            <div class="week-meta">
                <div class="week-meta-item">
                    <i data-lucide="clock" style="width:13px;height:13px;"></i>
                    ~35 minutes
                </div>
                <div class="week-meta-item">
                    <i data-lucide="bar-chart-2" style="width:13px;height:13px;"></i>
                    All units
                </div>
            </div>
            ${!isPast ? `
            <div class="week-action">
                <button class="btn-start-half-sim" style="
                    background:#E65100;color:#fff;border:none;
                    border-radius:10px;padding:10px 20px;
                    font-size:13px;font-weight:700;cursor:pointer;
                    font-family:'Inter',sans-serif;transition:opacity 0.15s;
                ">Start Half Test →</button>
            </div>` : ''}
        </div>`;
    }

    if (week.type === 'simulation') {
        return `
        <div class="week-card ${cardClass}" style="${pastStyle}">
            <div class="week-header">
                <div class="week-title">Week ${week.weekNum} — Full SAT Math Simulation</div>
                <div class="week-badge ${badgeClass}">${badgeText}</div>
            </div>
            <p style="font-size:13px;color:#666;margin:0 0 12px;">
                ${week.isFinal
                    ? 'Final full simulation before your test. Two 22-question modules with a break between. Simulate real test conditions — no phone, timed, focused.'
                    : '44-question timed simulation split into two modules. Your predicted score will update based on results. Review every wrong answer after.'
                }
            </p>
            <div class="week-meta">
                <div class="week-meta-item">
                    <i data-lucide="clock" style="width:13px;height:13px;"></i>
                    ~70 minutes
                </div>
                <div class="week-meta-item">
                    <i data-lucide="bar-chart-2" style="width:13px;height:13px;"></i>
                    All units · 2 modules
                </div>
            </div>
            ${!isPast ? `
            <div class="week-action">
                <button class="btn-start-sim">Start Full Simulation →</button>
            </div>` : ''}
        </div>`;
    }

    // Practice week
    const unitPills = week.units.map(([unit, acc]) => {
        const accClass = acc === null ? 'acc-ok' :
                         acc < 60 ? 'acc-weak' :
                         acc < 75 ? 'acc-ok' : 'acc-strong';
        const accText = acc !== null ? `${acc}%` : 'No data';
        return `
        <div class="unit-pill">
            ${formatUnit(unit)}
            <span class="unit-pill-accuracy ${accClass}">${accText}</span>
        </div>`;
    }).join('');

    return `
    <div class="week-card ${week.isCurrent ? 'week-current' : 'week-upcoming'}" style="${pastStyle}">
        <div class="week-header">
            <div class="week-title">Week ${week.weekNum} — ${week.units.map(([u]) => formatUnit(u)).join(' + ') || 'Practice'}</div>
            <div class="week-badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="week-units">${unitPills}</div>
        <p style="font-size:12px;color:#888;margin:0 0 10px;">
            Daily batch of 10 questions automatically targets your lowest-performing units.
            This week's focus: ${week.units.map(([u]) => formatUnit(u)).join(' and ') || 'all units'}.
        </p>
        <div class="week-meta">
            <div class="week-meta-item">
                <i data-lucide="calendar" style="width:13px;height:13px;"></i>
                ${week.sessionsPerWeek} sessions
            </div>
            <div class="week-meta-item">
                <i data-lucide="zap" style="width:13px;height:13px;"></i>
                ${week.sessionsPerWeek * 10} questions
            </div>
        </div>
        ${week.isCurrent && !isPast ? `
        <div class="week-action">
            <button class="btn-start-batch">Start Today's Batch →</button>
        </div>` : ''}
    </div>`;
}

const SESSION_DAY_MAP = {
    3: [1, 3, 5],
    5: [1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6]
};

// Looks up which sessions/week pace was in effect on a given date, so past
// calendar days keep the pattern that was active when they happened, even
// after the user later changes their sessions/week setting.
function getSessionsPerWeekForDate(date, sessionsHistory) {
    if (!sessionsHistory || sessionsHistory.length === 0) return 5;
    let applicable = sessionsHistory[0];
    for (const entry of sessionsHistory) {
        if (new Date(entry.effective_from).getTime() <= date.getTime()) {
            applicable = entry;
        }
    }
    return applicable.sessions_per_week || 5;
}

// ─────────────────────────────────────────────
// Calendar — anchored to the plan's actual start date
// ─────────────────────────────────────────────
function renderCalendar(containerId, sessionsHistory, testDateStr, schedule, planStartDate) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const today    = new Date();
    const testDate = testDateStr ? new Date(testDateStr + 'T12:00:00') : null;

    const start = new Date(planStartDate);
    start.setHours(0, 0, 0, 0);

    let viewYear  = today.getFullYear();
    let viewMonth = today.getMonth();

    const maxMonth = testDate ? testDate.getMonth()    : today.getMonth() + 3;
    const maxYear  = testDate ? testDate.getFullYear() : today.getFullYear();

    // Build a set of dates that are half/full sim weeks, anchored to the
    // plan's actual start date rather than "today" so past weeks land
    // on their real calendar dates.
    const halfSimDates  = new Set();
    const fullSimDates  = new Set();

    if (schedule) {
        schedule.forEach(week => {
            // Mid-week day of this week (day 4 = Thursday)
            const weekStart = new Date(start);
            weekStart.setDate(start.getDate() + (week.weekNum - 1) * 7 + 3);
            const key = weekStart.toDateString();
            if (week.type === 'half_sim')  halfSimDates.add(key);
            if (week.type === 'simulation') fullSimDates.add(key);
        });
    }

    // Users can scroll back as far as the plan's actual start month so they
    // can review completed practice days.
    const minMonth = start.getMonth();
    const minYear  = start.getFullYear();

    function draw() {
        const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const monthName   = new Date(viewYear, viewMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

        const atMin = viewMonth === minMonth && viewYear === minYear;
        const atMax = viewMonth === maxMonth && viewYear === maxYear;

        let html = `
        <div style="
            background:rgba(255,255,255,0.9);
            border-radius:16px;
            padding:20px 24px;
            box-shadow:0 4px 16px rgba(0,0,0,0.06);
            margin-bottom:24px;
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <button id="cal-prev" style="
                    background:none;border:none;cursor:${atMin?'default':'pointer'};
                    color:${atMin?'#ccc':'#0B1F3B'};font-size:20px;padding:4px 8px;
                    font-family:Inter,sans-serif;
                " ${atMin?'disabled':''}>‹</button>
                <div style="font-weight:700;font-size:15px;color:#0B1F3B;">${monthName}</div>
                <button id="cal-next" style="
                    background:none;border:none;cursor:${atMax?'default':'pointer'};
                    color:${atMax?'#ccc':'#0B1F3B'};font-size:20px;padding:4px 8px;
                    font-family:Inter,sans-serif;
                " ${atMax?'disabled':''}>›</button>
            </div>

            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;">
                ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d =>
                    `<div style="text-align:center;font-size:11px;font-weight:600;color:#aaa;padding:4px 0;">${d}</div>`
                ).join('')}
            </div>

            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
                ${Array(firstDay).fill('<div></div>').join('')}
                ${Array.from({length: daysInMonth}, (_, i) => {
                    const day     = i + 1;
                    const date    = new Date(viewYear, viewMonth, day);
                    const weekday = date.getDay();
                    const dateKey = date.toDateString();

                    const isToday   = dateKey === today.toDateString();
                    const isTest    = testDate && dateKey === testDate.toDateString();
                    const isHalf    = halfSimDates.has(dateKey);
                    const isFull    = fullSimDates.has(dateKey);
                    const sessionsPerWeekForDay = getSessionsPerWeekForDate(date, sessionsHistory);
                    const sessionDaysForDay = SESSION_DAY_MAP[sessionsPerWeekForDay] || SESSION_DAY_MAP[5];
                    const isSession = sessionDaysForDay.includes(weekday)
                                      && date >= start
                                      && (!testDate || date <= testDate)
                                      && !isHalf && !isFull;
                    const isPast    = date < today && !isToday;

                    let bg = 'transparent';
                    let color = isPast ? '#ccc' : '#0B1F3B';
                    let dot = '';

                    if (isTest) {
                        bg = '#C62828'; color = '#fff';
                    } else if (isToday) {
                        bg = '#0B1F3B'; color = '#FFD84D';
                    } else if (isFull) {
                        bg = 'rgba(198,40,40,0.12)';
                        dot = `<div style="width:5px;height:5px;border-radius:50%;background:#C62828;margin:1px auto 0;"></div>`;
                    } else if (isHalf) {
                        bg = 'rgba(230,81,0,0.1)';
                        dot = `<div style="width:5px;height:5px;border-radius:50%;background:#E65100;margin:1px auto 0;"></div>`;
                    } else if (isSession) {
                        bg = 'rgba(11,31,59,0.06)';
                        dot = `<div style="width:5px;height:5px;border-radius:50%;background:#FFD84D;margin:1px auto 0;"></div>`;
                    }

                    return `
                    <div style="
                        text-align:center;padding:6px 2px 4px;
                        border-radius:8px;background:${bg};color:${color};
                        font-size:12px;
                        font-weight:${isToday||isTest?'700':'400'};
                    ">
                        ${day}
                        ${dot}
                    </div>`;
                }).join('')}
            </div>

            <!-- Legend -->
            <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;">
                    <div style="width:10px;height:10px;border-radius:3px;background:#0B1F3B;"></div>Today
                </div>
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;">
                    <div style="width:10px;height:10px;border-radius:3px;background:rgba(11,31,59,0.06);border:1px solid #ddd;position:relative;">
                        <div style="width:5px;height:5px;border-radius:50%;background:#FFD84D;position:absolute;top:2px;left:2px;"></div>
                    </div>Practice
                </div>
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;">
                    <div style="width:10px;height:10px;border-radius:3px;background:rgba(230,81,0,0.1);border:1px solid #E65100;"></div>Half Test
                </div>
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;">
                    <div style="width:10px;height:10px;border-radius:3px;background:rgba(198,40,40,0.12);border:1px solid #C62828;"></div>Full Sim
                </div>
                ${testDate ? `
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;">
                    <div style="width:10px;height:10px;border-radius:3px;background:#C62828;"></div>Test Date
                </div>` : ''}
            </div>
        </div>`;

        container.innerHTML = html;

        document.getElementById('cal-prev')?.addEventListener('click', () => {
            if (atMin) return;
            viewMonth--;
            if (viewMonth < 0) { viewMonth = 11; viewYear--; }
            draw();
        });

        document.getElementById('cal-next')?.addEventListener('click', () => {
            if (atMax) return;
            viewMonth++;
            if (viewMonth > 11) { viewMonth = 0; viewYear++; }
            draw();
        });
    }

    draw();
}