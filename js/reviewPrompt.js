import { supabase } from './supabase.js';

const QUESTION_MILESTONES = [50, 100];
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

/**
 * Call after finalizeQuizData() completes.
 * @param {object} user
 * @param {object} ctx - { mode, score, total, streakDays }
 */
export async function maybeShowReviewPrompt(user, { mode = null, score = null, total = null, streakDays = null } = {}) {
    if (!user) return;

    try {
        // Never ask again once they've left a review OR feedback
        const [{ data: existingReview }, { data: existingFeedback }] = await Promise.all([
            supabase.from('reviews').select('id').eq('user_id', user.id).maybeSingle(),
            supabase.from('feedbacks').select('id').eq('user_id', user.id).maybeSingle()
        ]);

        if (existingReview || existingFeedback) return;

        const { data: prompted } = await supabase
            .from('review_prompts')
            .select('trigger_key')
            .eq('user_id', user.id);

        const promptedSet = new Set((prompted || []).map(p => p.trigger_key));

        let triggerKey = null;

        // 1. Question count milestones
        const { count: lifetimeCount } = await supabase
            .from('topic_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (lifetimeCount !== null) {
            for (const m of QUESTION_MILESTONES) {
                const key = `q${m}`;
                if (lifetimeCount >= m && !promptedSet.has(key)) {
                    triggerKey = key;
                    break;
                }
            }
        }

        // 2. First diagnostic completion
        if (!triggerKey && mode === 'diagnostic' && !promptedSet.has('first_diagnostic')) {
            triggerKey = 'first_diagnostic';
        }

        // 3. Streak milestones
        if (!triggerKey && streakDays !== null) {
            for (const m of STREAK_MILESTONES) {
                const key = `streak${m}`;
                if (streakDays >= m && !promptedSet.has(key)) {
                    triggerKey = key;
                    break;
                }
            }
        }

        // 4. Personal best / score improvement
        if (!triggerKey && total > 0 && score !== null && !promptedSet.has('personal_best')) {
            const { data: pastAttempts } = await supabase
                .from('quiz_attempts')
                .select('score, total')
                .eq('user_id', user.id);

            const currentPct = score / total;
            const priorBest = (pastAttempts || [])
                .filter(a => a.total > 0)
                .reduce((best, a) => Math.max(best, a.score / a.total), 0);

            if (pastAttempts && pastAttempts.length > 1 && currentPct > priorBest) {
                triggerKey = 'personal_best';
            }
        }

        if (!triggerKey) return;

        showReviewModal(user, triggerKey);

    } catch (err) {
        console.error("maybeShowReviewPrompt failed:", err);
    }
}

function showReviewModal(user, triggerKey) {
    if (document.getElementById('review-prompt-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'review-prompt-overlay';
    overlay.className = 'transition-overlay';
    overlay.style.display = 'flex';

    overlay.innerHTML = `
        <div class="transition-card" style="
            max-width: 380px; width: 90%; text-align: center; position: relative;
            background: #fff; border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.10);
            padding: 28px 24px; font-family: 'Inter', sans-serif;
        ">
            <button id="review-prompt-dismiss" aria-label="Close" style="
                position:absolute; top:10px; right:12px; border:none; background:transparent;
                color:#999; cursor:pointer; padding:4px;
            "><i data-lucide="x" style="width:16px;height:16px;"></i></button>

            <div style="font-size:17px; font-weight:700; color:#0B1F3B; margin-bottom:18px;">
                Are you enjoying Winnowic SAT Math prep?
            </div>
            <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
                <button id="review-prompt-yes" style="padding:10px 22px; background:#FFD84D; color:#0B1F3B; border-radius:10px; border:none; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                    <i data-lucide="thumbs-up" style="width:15px;height:15px;"></i> Yes
                </button>
                <button id="review-prompt-no" style="padding:10px 22px; border-radius:10px; border:1px solid #E2E6ED; background:#fff; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                    <i data-lucide="thumbs-down" style="width:15px;height:15px;"></i> Not really
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    const cleanup = () => overlay.remove();

    async function recordResponse(response) {
        try {
            await supabase.from('review_prompts').insert([{
                user_id: user.id,
                trigger_key: triggerKey,
                response
            }]);
        } catch (err) {
            console.error("Failed to record review prompt response:", err);
        }
    }

    document.getElementById('review-prompt-yes').addEventListener('click', async () => {
        await recordResponse('yes');
        cleanup();
        window.location.href = `/reviews.html?trigger=${triggerKey}`;
    });

    document.getElementById('review-prompt-no').addEventListener('click', async () => {
        await recordResponse('no');
        cleanup();
        window.location.href = `/feedbacks.html?trigger=${triggerKey}`;
    });

    document.getElementById('review-prompt-dismiss').addEventListener('click', async () => {
        await recordResponse('dismissed');
        cleanup();
    });
}