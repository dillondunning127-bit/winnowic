import { supabase } from './supabase.js';
import { checkDiagnosticsAccess } from './subscription.js';
import { loadDiagnostics } from './diagnostics.js';

function waitForDom() {
    return new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        } else {
            resolve();
        }
    });
}

async function applyAccessState(user) {
    await waitForDom();

    const freeWall     = document.getElementById('diag-free-wall');
    const paidSelector = document.getElementById('diag-paid-selector');
    const upgradeCta   = document.getElementById('diag-upgrade-cta');
    const examSelect   = document.getElementById('examSelect');

    if (!user) {
        if (freeWall)     freeWall.style.display     = 'block';
        if (paidSelector) paidSelector.style.display = 'none';
        return;
    }

    const hasPaid = await checkDiagnosticsAccess('SAT_MATH');

    if (hasPaid) {
        if (freeWall)     freeWall.style.display     = 'none';
        if (paidSelector) paidSelector.style.display = 'none';

        if (examSelect) examSelect.value = 'SAT_MATH';

        // Retry once if diagnostics.js's own module state isn't ready yet —
        // safety net in case script tag order ever changes.
        let result = await loadDiagnostics();
        if (result === undefined) {
            await new Promise(r => setTimeout(r, 100));
            await loadDiagnostics();
        }

    } else {
        if (freeWall)     freeWall.style.display     = 'block';
        if (paidSelector) paidSelector.style.display = 'none';

        const previewBtn = document.getElementById('preview-full');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                setTimeout(() => {
                    if (upgradeCta) upgradeCta.style.display = 'block';
                    const results = document.getElementById('readiness-container');
                    if (results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 800);
            }, { once: true });
        }
    }
}

let initialized = false;

supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') {
        initialized = true;
        await applyAccessState(session?.user ?? null);
        return;
    }

    if (!initialized) return;

    if (event === 'SIGNED_IN') {
        await applyAccessState(session?.user ?? null);
    }

    if (event === 'SIGNED_OUT') {
        await applyAccessState(null);
        const readiness  = document.getElementById('readiness-container');
        const results    = document.getElementById('diagnosticResults');
        const upgradeCta = document.getElementById('diag-upgrade-cta');
        if (readiness)  readiness.style.display  = 'none';
        if (results)    results.style.display    = 'none';
        if (upgradeCta) upgradeCta.style.display = 'none';
    }
});