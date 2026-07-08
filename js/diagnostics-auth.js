// js/diagnostics-auth.js
// Handles free vs paid UI state on diagnostics.html
// Runs after diagnostics.js has initialized

import { supabase } from './supabase.js';
import { checkExamAccess } from './subscription.js';
import { loadDiagnostics } from './diagnostics.js';

window.addEventListener('DOMContentLoaded', async () => {

    const freeWall     = document.getElementById('diag-free-wall');
    const paidSelector = document.getElementById('diag-paid-selector');
    const upgradeCta   = document.getElementById('diag-upgrade-cta');
    const examSelect   = document.getElementById('examSelect');

    // ── Get session ──
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (!user) {
        // Not logged in → show free wall only
        if (freeWall)     freeWall.style.display     = 'block';
        if (paidSelector) paidSelector.style.display = 'none';
        return;
    }

    const hasPaid = await checkExamAccess('SAT_MATH');

    if (hasPaid) {
        // ── PAID USER ──
        // Hide free wall and selector card entirely
        if (freeWall)     freeWall.style.display     = 'none';
        if (paidSelector) paidSelector.style.display = 'none';

        // Auto-load SAT Math immediately
        if (examSelect) {
            examSelect.value = 'SAT_MATH';
            examSelect.dispatchEvent(new Event('change'));
        }

    } else {
        // ── FREE / LOGGED IN BUT NOT PAID ──
        if (freeWall)     freeWall.style.display     = 'block';
        if (paidSelector) paidSelector.style.display = 'none';

        // After preview loads, show upgrade CTA below results
        const previewBtn = document.getElementById('preview-full');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                setTimeout(() => {
                    if (upgradeCta) upgradeCta.style.display = 'block';
                    // Scroll to results
                    const results = document.getElementById('readiness-container');
                    if (results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 800);
            });
        }
    }

    // ── Also re-check on auth state change (handles login mid-session) ──
    supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (event === 'SIGNED_IN' && newSession?.user) {
            const nowPaid = await checkExamAccess('SAT_MATH');
            if (nowPaid) {
                if (freeWall)     freeWall.style.display     = 'none';
                if (paidSelector) paidSelector.style.display = 'none';
                if (examSelect) {
                    examSelect.value = 'SAT_MATH';
                    examSelect.dispatchEvent(new Event('change'));
                }
            } else {
                if (freeWall) freeWall.style.display = 'block';
            }
        }

        if (event === 'SIGNED_OUT') {
            if (freeWall)     freeWall.style.display     = 'block';
            if (paidSelector) paidSelector.style.display = 'none';
            // Hide any loaded results
            const readiness = document.getElementById('readiness-container');
            const results   = document.getElementById('diagnosticResults');
            if (readiness) readiness.style.display = 'none';
            if (results)   results.style.display   = 'none';
            if (upgradeCta) upgradeCta.style.display = 'none';
        }
    });
});