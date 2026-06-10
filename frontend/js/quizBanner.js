// js/quizBanner.js
import { supabase } from './supabase.js';
import { getBatchStreak, isTodayBatchComplete } from './dailyBatch.js';
import { getUserGoal, getDaysUntilTest, formatDaysUntil } from './goals.js';

export async function initQuizBanner(exam) {
    const banner = document.getElementById('quiz-top-banner');
    if (!banner) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // banner only shows for logged-in users

    // ── Streak ──
    const streak = await getBatchStreak(user.id, exam);
    const streakEl = document.getElementById('banner-streak-text');
    if (streakEl) {
        streakEl.textContent = streak === 0
            ? 'Start your streak today'
            : `${streak} day streak`;
    }

    // ── Goal ──
    const goal = await getUserGoal(exam);
    const goalEl  = document.getElementById('banner-goal');
    const goalTxt = document.getElementById('banner-goal-text');

    if (goal?.test_date && goalEl && goalTxt) {
        const days = getDaysUntilTest(goal.test_date);
        const label = formatDaysUntil(days);
        goalTxt.textContent = goal.target_score
            ? `${label} — target ${goal.target_score}`
            : label;
        goalEl.style.display = 'flex';
    }

    // ── Batch done today indicator ──
    const batchDone = await isTodayBatchComplete(exam);
    const doneEl = document.getElementById('banner-batch-done');
    if (batchDone && doneEl) {
        doneEl.style.display = 'flex';
    }

    // Show the banner now that it's populated
    banner.style.display = 'block';
}
