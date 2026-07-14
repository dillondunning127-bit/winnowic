import { supabase } from './supabase.js';
import { checkExamAccess } from './subscription.js';
const REWARD_HOURS = 24;
const REWARD_TYPE = 'premium_diagnostics_24h';

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01z";

function getTriggerFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('trigger') || null;
}

function showScreen(id) {
    ['review-form-screen', 'review-thanks-screen', 'review-already-screen'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = (s === id) ? 'block' : 'none';
    });
    if (window.lucide) window.lucide.createIcons();
}

async function init() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        window.location.href = '/auth.html?redirect=/reviews.html';
        return;
    }
const hasPremium = await checkExamAccess('SAT_MATH');
if (hasPremium) {
    const callout = document.querySelector('.reward-callout');
    if (callout) callout.style.display = 'none';
}
    // Never ask again if they've left a review OR feedback
    const [{ data: existingReview }, { data: existingFeedback }] = await Promise.all([
        supabase.from('reviews').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('feedbacks').select('id').eq('user_id', user.id).maybeSingle()
    ]);

    if (existingReview || existingFeedback) {
        showScreen('review-already-screen');
        return;
    }

    setupStars();
    setupSubmit(user, hasPremium);
}

function setupStars(user) {
    const container = document.getElementById('star-rating');
    const ratingInput = document.getElementById('rating-value');
    const label = document.getElementById('rating-label');
    if (!container) return;

    const stars = [];

    for (let i = 1; i <= 5; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'star-wrap';
        wrap.dataset.star = i;
        wrap.innerHTML = `
            <svg class="star-bg" viewBox="0 0 24 24" width="34" height="34">
                <path d="${STAR_PATH}" fill="none" stroke="#E2E6ED" stroke-width="1.5"/>
            </svg>
            <div class="star-fill-wrap">
                <svg viewBox="0 0 24 24" width="34" height="34">
                    <path d="${STAR_PATH}" fill="#FFD84D"/>
                </svg>
            </div>
        `;
        container.appendChild(wrap);
        stars.push(wrap);
    }

    function renderStars(value) {
        stars.forEach((wrap, idx) => {
            const starIndex = idx + 1;
            const fillWrap = wrap.querySelector('.star-fill-wrap');
            let pct = 0;
            if (value >= starIndex) pct = 100;
            else if (value >= starIndex - 0.5) pct = 50;
            fillWrap.style.width = pct + '%';
        });
    }

    stars.forEach((wrap) => {
        wrap.addEventListener('click', (e) => {
            const rect = wrap.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const isHalf = clickX < rect.width / 2;
            const starIndex = parseInt(wrap.dataset.star);
            const value = isHalf ? starIndex - 0.5 : starIndex;

            ratingInput.value = value;
            renderStars(value);
            label.textContent = `${value} / 5`;
        });
    });
}

function setupSubmit(user, hasPremium) {
    const form = document.getElementById('review-form');
    const submitBtn = document.getElementById('review-submit-btn');
const likedMostField = document.getElementById('liked-most');
const likedMostCount = document.getElementById('liked-most-count');
likedMostField.addEventListener('input', () => {
    const len = likedMostField.value.length;
    likedMostCount.textContent = `${len} / 50 minimum`;
    likedMostCount.style.color = len >= 50 ? '#2E7D32' : '#999';
});
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
if (!hasPremium) {
    const expiresAt = new Date(Date.now() + REWARD_HOURS * 60 * 60 * 1000).toISOString();
    const { error: rewardError } = await supabase.from('reward_unlocks').insert([{
        user_id: user.id,
        reward_type: REWARD_TYPE,
        expires_at: expiresAt
    }]);
    if (rewardError) console.error('Reward grant failed (review was still saved):', rewardError);
}

if (hasPremium) {
    document.querySelector('#review-thanks-screen .review-honest-note').textContent =
        "Thanks so much for the kind words — it genuinely helps.";
}

showScreen('review-thanks-screen');
        const rating = parseFloat(document.getElementById('rating-value').value) || 0;
        if (rating <= 0) {
            document.getElementById('rating-label').textContent = 'Please select a rating';
            document.getElementById('rating-label').style.color = '#C62828';
            return;
        }
if (document.getElementById('liked-most').value.trim().length < 50) {
    likedMostCount.style.color = '#C62828';
    likedMostField.focus();
    return;
}
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const { error: reviewError } = await supabase.from('reviews').insert([{
                user_id: user.id,
                rating,
                first_name: document.getElementById('first-name').value || null,
                last_name: document.getElementById('last-name').value || null,
                liked_most: document.getElementById('liked-most').value || null,
                trigger_key: getTriggerFromURL()
            }]);

            if (reviewError) {
                console.error('Review insert failed:', reviewError);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Review';
                return;
            }

            const expiresAt = new Date(Date.now() + REWARD_HOURS * 60 * 60 * 1000).toISOString();
            const { error: rewardError } = await supabase.from('reward_unlocks').insert([{
                user_id: user.id,
                reward_type: REWARD_TYPE,
                expires_at: expiresAt
            }]);

            if (rewardError) {
                console.error('Reward grant failed (review was still saved):', rewardError);
            }

            showScreen('review-thanks-screen');

        } catch (err) {
            console.error('Review submission failed:', err);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Review';
        }
    });
}

init();