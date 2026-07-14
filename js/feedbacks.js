import { supabase } from './supabase.js';
import { checkExamAccess } from './subscription.js';
const REWARD_HOURS = 24;
const REWARD_TYPE = 'premium_diagnostics_24h';

function getTriggerFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('trigger') || null;
}

function showScreen(id) {
    ['feedback-form-screen', 'feedback-thanks-screen', 'feedback-already-screen'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = (s === id) ? 'block' : 'none';
    });
    if (window.lucide) window.lucide.createIcons();
}

async function init() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        window.location.href = '/auth.html?redirect=/feedbacks.html';
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
        showScreen('feedback-already-screen');
        return;
    }

    setupSubmit(user, hasPremium);
}

function setupSubmit(user, hasPremium) {
    const form = document.getElementById('feedback-form');
    const submitBtn = document.getElementById('feedback-submit-btn');
const responseField = document.getElementById('feedback-response');
const responseCount = document.getElementById('feedback-response-count');
responseField.addEventListener('input', () => {
    const len = responseField.value.length;
    responseCount.textContent = `${len} / 50 minimum`;
    responseCount.style.color = len >= 50 ? '#2E7D32' : '#999';
});
    form.addEventListener('submit', async (e) => {
        if (responseField.value.trim().length < 50) {
    responseCount.style.color = '#C62828';
    responseField.focus();
    return;
}
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const { error: feedbackError } = await supabase.from('feedbacks').insert([{
                user_id: user.id,
                response: document.getElementById('feedback-response').value || null,
                trigger_key: getTriggerFromURL()
            }]);

            if (feedbackError) {
                console.error('Feedback insert failed:', feedbackError);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Feedback';
                return;
            }

            const expiresAt = new Date(Date.now() + REWARD_HOURS * 60 * 60 * 1000).toISOString();
            const { error: rewardError } = await supabase.from('reward_unlocks').insert([{
                user_id: user.id,
                reward_type: REWARD_TYPE,
                expires_at: expiresAt
            }]);

            if (rewardError) {
                console.error('Reward grant failed (feedback was still saved):', rewardError);
            }

            showScreen('feedback-thanks-screen');

        } catch (err) {
            console.error('Feedback submission failed:', err);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Feedback';
        }
    });
}

init();