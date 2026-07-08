import { supabase } from './supabase.js';

const REWARD_HOURS = 48;

function getCheckpointFromURL() {
    const params = new URLSearchParams(window.location.search);
    const cp = params.get('checkpoint');
    return cp ? parseInt(cp) : null;
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
        // Not logged in — send to login, then back here
        window.location.href = '/auth.html?redirect=/reviews.html';
        return;
    }

    // Already reviewed? Never ask again.
    const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (existing) {
        showScreen('review-already-screen');
        return;
    }

    setupStars();
    setupSubmit(user);
}

function setupStars() {
    const stars = document.querySelectorAll('#star-row .star-btn');
    const ratingInput = document.getElementById('rating-value');

    stars.forEach(btn => {
        btn.addEventListener('click', () => {
            const value = parseInt(btn.dataset.value);
            ratingInput.value = value;
            stars.forEach(s => {
                s.classList.toggle('filled', parseInt(s.dataset.value) <= value);
            });
        });
    });
}

function setupSubmit(user) {
    const form = document.getElementById('review-form');
    const submitBtn = document.getElementById('review-submit-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        const rating = parseInt(document.getElementById('rating-value').value) || null;

        try {
            const { error: reviewError } = await supabase.from('reviews').insert([{
                user_id: user.id,
                rating,
                target_score: document.getElementById('target-score').value || null,
                most_helpful_feature: document.getElementById('helpful-feature').value || null,
                diagnostics_feedback: document.getElementById('diagnostics-feedback').value || null,
                additional_comments: document.getElementById('additional-comments').value || null,
                checkpoint: getCheckpointFromURL()
            }]);

            if (reviewError) {
                console.error('Review insert failed:', reviewError);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Review';
                return;
            }

            // Grant the 48-hour premium preview reward
            const expiresAt = new Date(Date.now() + REWARD_HOURS * 60 * 60 * 1000).toISOString();
            const { error: rewardError } = await supabase.from('reward_unlocks').insert([{
                user_id: user.id,
                reward_type: 'premium_preview_48h',
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