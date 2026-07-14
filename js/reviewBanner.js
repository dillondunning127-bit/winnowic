import { supabase } from './supabase.js';
import { checkExamAccess } from './subscription.js';

// Same trigger set the popup uses (achievements_unlocked is written by achievements.js
// on the same events, so it doubles as the source of truth here).
const RELEVANT_ACHIEVEMENT_KEYS = new Set([
    'q50', 'q100',
    'streak3', 'streak7', 'streak14', 'streak30', 'streak60', 'streak100',
    'personal_best',
    'first_diagnostic'
]);

// Intentionally NOT persisted to sessionStorage/localStorage — dismissing the banner
// only hides it for the current page load. A refresh brings it back if still eligible.
let dismissedThisLoad = false;

/**
 * Call this once on any page that loads a signed-in user (quiz.html only, per current setup).
 */
export async function maybeShowReviewBanner(user) {
    if (!user) return;
    if (dismissedThisLoad) return;
    if (document.getElementById('review-banner')) return;

    try {
        // Permanently done once they've left a review OR feedback — never show again
        const [{ data: existingReview }, { data: existingFeedback }] = await Promise.all([
            supabase.from('reviews').select('id').eq('user_id', user.id).maybeSingle(),
            supabase.from('feedbacks').select('id').eq('user_id', user.id).maybeSingle()
        ]);

        if (existingReview || existingFeedback) return;

        const [{ data: unlocked }, { data: prompted }] = await Promise.all([
            supabase.from('achievements_unlocked').select('achievement_key').eq('user_id', user.id),
            supabase.from('review_prompts').select('trigger_key').eq('user_id', user.id)
        ]);

        const promptedSet = new Set((prompted || []).map(p => p.trigger_key));
        const eligibleKey = (unlocked || [])
            .map(a => a.achievement_key)
            .find(key => RELEVANT_ACHIEVEMENT_KEYS.has(key) && !promptedSet.has(key));

        if (!eligibleKey) return;

        const hasPremium = await checkExamAccess('SAT_MATH');

        renderBanner(user, eligibleKey, hasPremium);

    } catch (err) {
        console.error('maybeShowReviewBanner failed:', err);
    }
}

function renderBanner(user, triggerKey, hasPremium) {
    const banner = document.createElement('div');
    banner.id = 'review-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-width: 320px;
        background: #0B1F3B;
        color: #fff;
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.20);
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        z-index: 9999;
    `;

    const rewardLine = hasPremium
        ? ''
        : `<div style="color:#FFD84D; font-size:11px; font-weight:600; margin-top:8px;">Respond and get 24 hours of Winnowic Premium.</div>`;

    banner.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;">
            <div style="font-weight:700;">Are you enjoying Winnowic SAT Math prep?</div>
            <button id="review-banner-dismiss" aria-label="Dismiss" style="
                background:none; border:none; color:rgba(255,255,255,0.6);
                cursor:pointer; font-size:14px; padding:0; flex-shrink:0;
            ">✕</button>
        </div>
        <div style="display:flex; gap:8px;">
            <button id="review-banner-yes" style="
                flex:1; background:#FFD84D; color:#0B1F3B; border:none;
                padding:7px 0; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;
            "><i data-lucide="thumbs-up" style="width:15px;height:15px;"></i> Yes</button>
            <button id="review-banner-no" style="
                flex:1; background:rgba(255,255,255,0.1); color:#fff; border:none;
                padding:7px 0; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;
            "><i data-lucide="thumbs-down" style="width:15px;height:15px;"></i> Not really</button>
        </div>
        ${rewardLine}
    `;

    document.body.appendChild(banner);

    async function recordResponse(response) {
        try {
            await supabase.from('review_prompts').insert([{
                user_id: user.id,
                trigger_key: triggerKey,
                response
            }]);
        } catch (err) {
            console.error('Failed to record banner response:', err);
        }
    }

    document.getElementById('review-banner-yes').addEventListener('click', async () => {
        await recordResponse('yes');
        window.location.href = `/reviews.html?trigger=${triggerKey}`;
    });

    document.getElementById('review-banner-no').addEventListener('click', async () => {
        await recordResponse('no');
        window.location.href = `/feedbacks.html?trigger=${triggerKey}`;
    });

    document.getElementById('review-banner-dismiss').addEventListener('click', () => {
        dismissedThisLoad = true;
        banner.remove();
    });
}