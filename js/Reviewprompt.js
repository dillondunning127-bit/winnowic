import { supabase } from './supabase.js';

// Checkpoints are checked against LIFETIME questions answered (topic_attempts count).
// Add more later (200, 500...) — no other code needs to change.
const CHECKPOINTS = [20, 50, 100];

// TODO: swap in your real review link (Google Business, Trustpilot, etc.)
const REVIEW_URL = "https://example.com/leave-a-review";

/**
 * Call this after a quiz/diagnostic finishes and finalizeQuizData() has run.
 * Safe to call every time — it no-ops if there's nothing new to show.
 */
export async function maybeShowReviewPrompt(user) {
    if (!user) return;

    try {
        // Never ask again once they've left a review at all
        const { data: existingReview } = await supabase
            .from('reviews')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingReview) return;

        const { count, error: countError } = await supabase
            .from('topic_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);
        // ... rest stays the same

        if (countError || count === null) {
            console.error("maybeShowReviewPrompt: count error", countError);
            return;
        }

        const eligibleCheckpoints = CHECKPOINTS.filter(cp => count >= cp);
        if (eligibleCheckpoints.length === 0) return;

        const { data: existingPrompts, error: promptError } = await supabase
            .from('review_prompts')
            .select('checkpoint')
            .eq('user_id', user.id)
            .in('checkpoint', eligibleCheckpoints);

        if (promptError) {
            console.error("maybeShowReviewPrompt: prompt fetch error", promptError);
            return;
        }

        const alreadyPrompted = new Set((existingPrompts || []).map(p => p.checkpoint));
        const nextCheckpoint = eligibleCheckpoints
            .filter(cp => !alreadyPrompted.has(cp))
            .sort((a, b) => a - b)[0];

        if (nextCheckpoint === undefined) return;

        showReviewModal(user, nextCheckpoint);

    } catch (err) {
        console.error("maybeShowReviewPrompt failed:", err);
    }
}

function showReviewModal(user, checkpoint) {
    // Never stack two of these
    if (document.getElementById('review-prompt-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'review-prompt-overlay';
    overlay.className = 'transition-overlay'; // reuses existing overlay styling
    overlay.style.display = 'flex';

    overlay.innerHTML = `
        <div class="transition-card" id="review-prompt-card" style="
            max-width: 380px;
            width: 90%;
            text-align: center;
            position: relative;
            background: #fff;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.10);
            padding: 28px 24px;
            font-family: 'Inter', sans-serif;
        ">
            <button id="review-prompt-dismiss" aria-label="Close" style="position:absolute; top:10px; right:12px; border:none; background:transparent; color:#999; cursor:pointer; line-height:1; padding:4px;">
    <i data-lucide="x" style="width:16px;height:16px;"></i>
</button>

            <div id="review-prompt-step-initial">
                <div style="font-size:17px; font-weight:700; color:#0B1F3B; margin-bottom:18px;">
                    Are you enjoying Winnowic SAT Math prep?
                </div>
                <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
                    <button id="review-prompt-yes" class="btn-primary" style="padding:10px 22px; width:auto; background:#FFD84D; color:#0B1F3B; border-radius:10px; border:none; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
    <i data-lucide="thumbs-up" style="width:15px;height:15px;"></i> Yes
</button>
<button id="review-prompt-no" class="btn-secondary" style="padding:10px 22px; width:auto; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
    <i data-lucide="thumbs-down" style="width:15px;height:15px;"></i> Not really
</button>
                </div>
            </div>
                <div style="font-size:14px; color:#555; margin-bottom:18px;">
                    Mind leaving us a quick review? It helps a ton.
                </div>
                <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
                    <a href="${REVIEW_URL}" ... id="review-prompt-leave-review" style="...display:inline-flex; align-items:center; gap:6px;">
    <i data-lucide="star" style="width:15px;height:15px;"></i> Leave a Review
</a>
                    <button id="review-prompt-close" class="btn-secondary" style="padding:10px 22px; width:auto; border-radius:10px; cursor:pointer;">
                        Maybe Later
                    </button>
                </div>
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
                checkpoint,
                response
            }]);
        } catch (err) {
            // Unique constraint conflicts are expected if this races another tab — safe to ignore
            console.error("Failed to record review prompt response:", err);
        }
    }
    document.getElementById('review-prompt-yes').addEventListener('click', async () => {
    await recordResponse('yes');
    cleanup();
    window.location.href = `/reviews.html?checkpoint=${checkpoint}`;
});

    document.getElementById('review-prompt-no').addEventListener('click', async () => {
        await recordResponse('no');
        cleanup();
        window.location.href = '/feedback.html';
    });

    document.getElementById('review-prompt-close').addEventListener('click', cleanup);

    document.getElementById('review-prompt-dismiss').addEventListener('click', async () => {
        await recordResponse('dismissed');
        cleanup();
    });

    document.getElementById('review-prompt-leave-review').addEventListener('click', () => {
        setTimeout(cleanup, 300);
    });
}