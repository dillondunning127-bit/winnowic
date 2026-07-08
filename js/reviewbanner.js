import { supabase } from './supabase.js';

const CHECKPOINTS = [20, 50, 100];

/**
 * Call this once on any page that loads a signed-in user (e.g. from main.js).
 * Shows a small dismissible banner if the user has crossed a checkpoint
 * and hasn't left a review yet. Dismissing just hides it for this session —
 * it will reappear on next visit until they review or reach the next checkpoint.
 */
export async function maybeShowReviewBanner(user) {
    if (!user) return;
    if (sessionStorage.getItem('reviewBannerDismissed')) return;
    if (document.getElementById('review-banner')) return;

    try {
        const { data: existingReview } = await supabase
            .from('reviews')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingReview) return;

        const { count } = await supabase
            .from('topic_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (count === null || !CHECKPOINTS.some(cp => count >= cp)) return;

        renderBanner();

    } catch (err) {
        console.error('maybeShowReviewBanner failed:', err);
    }
}

function renderBanner() {
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
        display: flex;
        gap: 10px;
        align-items: flex-start;
    `;

    banner.innerHTML = `
        <div style="flex:1;">
            <div style="font-weight:700; margin-bottom:4px;">We'd love your honest feedback</div>
            <div style="color:rgba(255,255,255,0.75); margin-bottom:10px;">
                Leave a quick review and unlock 48 hours of Premium.
            </div>
            <a href="/reviews.html" style="
                display:inline-block; background:#FFD84D; color:#0B1F3B;
                padding:6px 14px; border-radius:8px; font-weight:600;
                text-decoration:none; font-size:12px;
            ">Leave a Review</a>
        </div>
        <button id="review-banner-dismiss" style="
            background:none; border:none; color:rgba(255,255,255,0.6);
            cursor:pointer; font-size:14px; padding:2px;
        ">✕</button>
    `;

    document.body.appendChild(banner);

    document.getElementById('review-banner-dismiss').addEventListener('click', () => {
        sessionStorage.setItem('reviewBannerDismissed', '1');
        banner.remove();
    });
}