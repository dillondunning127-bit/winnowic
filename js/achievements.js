import { supabase } from './supabase.js';

const QUESTION_MILESTONES = [10, 50, 100, 250, 500, 1000];
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

const ACHIEVEMENTS = {
    q10:   { title: "Getting Started",   desc: "Answered 10 questions",         icon: "rocket" },
    q50:   { title: "Warming Up",        desc: "Answered 50 questions",         icon: "flame" },
    q100:  { title: "Century Club",      desc: "Answered 100 questions",        icon: "trophy" },
    q250:  { title: "Dedicated",         desc: "Answered 250 questions",        icon: "medal" },
    q500:  { title: "Grinder",           desc: "Answered 500 questions",        icon: "award" },
    q1000: { title: "Math Machine",      desc: "Answered 1,000 questions",      icon: "crown" },
    streak3:   { title: "3-Day Streak",     desc: "Practiced 3 days in a row",   icon: "flame" },
    streak7:   { title: "Week Warrior",     desc: "Practiced 7 days in a row",   icon: "flame" },
    streak14:  { title: "Two Weeks Strong", desc: "Practiced 14 days in a row",  icon: "flame" },
    streak30:  { title: "Monthly Master",   desc: "Practiced 30 days in a row",  icon: "flame" },
    streak60:  { title: "Unstoppable",      desc: "Practiced 60 days in a row",  icon: "flame" },
    streak100: { title: "Legend",           desc: "Practiced 100 days in a row", icon: "flame" },
    perfect_score:    { title: "Perfect Score",      desc: "100% on a quiz",           icon: "star" },
    personal_best:    { title: "New Personal Best",  desc: "Your highest score yet",   icon: "trending-up" },
    first_diagnostic: { title: "Know Thyself",       desc: "Completed your first diagnostic", icon: "clipboard-check" }
};

/**
 * Checks all achievement categories and records any newly-unlocked ones.
 * Pass whatever context you have — missing fields just skip that category.
 * @param {object} user - supabase auth user
 * @param {object} ctx - { mode, score, total, streakDays }
 * @returns {Array} newly unlocked achievements (empty if none)
 */
export async function checkAchievements(user, { mode = null, score = null, total = null, streakDays = null } = {}) {
    if (!user) return [];

    const newlyUnlocked = [];

    try {
        const { data: unlocked } = await supabase
            .from('achievements_unlocked')
            .select('achievement_key')
            .eq('user_id', user.id);

        const unlockedSet = new Set((unlocked || []).map(a => a.achievement_key));
        const toInsert = [];

        // Question count milestones
        const { count: lifetimeCount } = await supabase
            .from('topic_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (lifetimeCount !== null) {
            for (const m of QUESTION_MILESTONES) {
                const key = `q${m}`;
                if (lifetimeCount >= m && !unlockedSet.has(key)) {
                    newlyUnlocked.push({ key, ...ACHIEVEMENTS[key] });
                    toInsert.push(key);
                }
            }
        }

        // Streak milestones
        if (streakDays !== null) {
            for (const m of STREAK_MILESTONES) {
                const key = `streak${m}`;
                if (streakDays >= m && !unlockedSet.has(key)) {
                    newlyUnlocked.push({ key, ...ACHIEVEMENTS[key] });
                    toInsert.push(key);
                }
            }
        }

        // Perfect score
        if (total > 0 && score === total) {
            const key = 'perfect_score';
            if (!unlockedSet.has(key)) {
                newlyUnlocked.push({ key, ...ACHIEVEMENTS[key] });
                toInsert.push(key);
            }
        }

        // Personal best (highest score % across past quiz_attempts, requires prior history)
        if (total > 0 && score !== null) {
            const { data: pastAttempts } = await supabase
                .from('quiz_attempts')
                .select('score, total')
                .eq('user_id', user.id);

            const currentPct = score / total;
            const priorBest = (pastAttempts || [])
                .filter(a => a.total > 0)
                .reduce((best, a) => Math.max(best, a.score / a.total), 0);

            const key = 'personal_best';
            if (pastAttempts && pastAttempts.length > 1 && currentPct > priorBest && !unlockedSet.has(key)) {
                newlyUnlocked.push({ key, ...ACHIEVEMENTS[key] });
                toInsert.push(key);
            }
        }

        // First diagnostic completed
        if (mode === 'diagnostic') {
            const key = 'first_diagnostic';
            if (!unlockedSet.has(key)) {
                newlyUnlocked.push({ key, ...ACHIEVEMENTS[key] });
                toInsert.push(key);
            }
        }

        if (toInsert.length > 0) {
            await supabase.from('achievements_unlocked').insert(
                toInsert.map(key => ({ user_id: user.id, achievement_key: key }))
            );
        }

    } catch (err) {
        console.error("checkAchievements failed:", err);
    }

    return newlyUnlocked;
}

/**
 * Shows the celebration modal + confetti for one or more unlocked achievements.
 * @param {Array} achievements - result of checkAchievements()
 * @param {Function} [onClose] - optional callback fired after the user dismisses it
 */
export function showAchievementCelebration(achievements, onClose = null) {
    if (!achievements || achievements.length === 0) {
        if (onClose) onClose();
        return;
    }
    if (document.getElementById('achievement-overlay')) return;

    fireConfetti();

    const overlay = document.createElement('div');
    overlay.id = 'achievement-overlay';
    overlay.className = 'transition-overlay';
    overlay.style.display = 'flex';

    const cardsHTML = achievements.map(a => `
        <div style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:#F7F9FC; border-radius:14px; margin-bottom:10px; text-align:left;">
            <div style="width:40px; height:40px; border-radius:50%; background:#FFD84D; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <i data-lucide="${a.icon}" style="width:20px;height:20px;color:#0B1F3B;"></i>
            </div>
            <div>
                <div style="font-weight:700; color:#0B1F3B; font-size:14px;">${a.title}</div>
                <div style="font-size:12px; color:#666;">${a.desc}</div>
            </div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="transition-card" style="
            max-width: 380px; width: 90%; text-align: center;
            background: #fff; border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.10);
            padding: 28px 24px; font-family: 'Inter', sans-serif;
        ">
            <div style="font-size:18px; font-weight:700; color:#0B1F3B; margin-bottom:16px;">
                Nice work!
            </div>
            ${cardsHTML}
            <button id="achievement-close" style="
                margin-top:14px; padding:10px 22px; width:auto;
                background:#FFD84D; color:#0B1F3B; border-radius:10px; border:none;
                font-weight:600; cursor:pointer;
            ">
                Nice
            </button>
        </div>
    `;
overlay.style.zIndex = '9000';
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('achievement-close').addEventListener('click', () => {
        overlay.remove();
        if (onClose) onClose();
    });
}

function fireConfetti() {
    if (typeof window.confetti === 'function') {
        
        window.confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#FFD84D', '#0B1F3B', '#ffffff'],
            zIndex: 10000 
            
        });
    }
}