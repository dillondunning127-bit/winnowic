// js/goals.js
// Winnowic Goal Setting — test date + target score per exam

import { supabase } from './supabase.js';

// ─────────────────────────────────────────────
// PUBLIC: Read
// ─────────────────────────────────────────────

export async function getUserGoal(exam) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('user_id', user.id)
    .eq('exam', exam)
    .maybeSingle();

  if (error) {
    console.error('getUserGoal error:', error);
    return null;
  }

  return data;
}

// ─────────────────────────────────────────────
// PUBLIC: Write (upsert)
// ─────────────────────────────────────────────

export async function saveUserGoal(exam, testDate, targetScore) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not logged in' };

  const { error } = await supabase
    .from('user_goals')
    .upsert(
      {
        user_id: user.id,
        exam,
        test_date: testDate || null,
        target_score: targetScore || null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,exam' }
    );

  if (error) {
    console.error('saveUserGoal error:', error);
    return { error };
  }

  return { success: true };
}

// ─────────────────────────────────────────────
// PUBLIC: Computed helpers
// ─────────────────────────────────────────────

// Returns integer days remaining, or null if no date set
export function getDaysUntilTest(testDateStr) {
  if (!testDateStr) return null;
  const diff = new Date(testDateStr) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days;
}

// Human-readable label: "47 days", "Tomorrow", "Today", "3 days ago"
export function formatDaysUntil(days) {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days away`;
}

// Urgency level for UI styling
export function getUrgencyLevel(days) {
  if (days === null) return 'none';
  if (days <= 7)  return 'critical';   // red
  if (days <= 21) return 'warning';    // orange
  if (days <= 60) return 'moderate';   // yellow
  return 'relaxed';                    // green
}

// ─────────────────────────────────────────────
// PUBLIC: Render goal banner into a container element
//   containerEl   — the DOM element to render into
//   exam          — current exam string e.g. "SAT_MATH"
//   onSave        — callback fired after a goal is saved (optional)
// ─────────────────────────────────────────────

export async function renderGoalBanner(containerEl, exam, onSave) {
  if (!containerEl || !exam) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    containerEl.style.display = 'none';
    return;
  }

  containerEl.style.display = 'block';

  const goal = await getUserGoal(exam);
  const days = goal?.test_date ? getDaysUntilTest(goal.test_date) : null;
  const urgency = getUrgencyLevel(days);

  const urgencyColors = {
    critical: '#C62828',
    warning:  '#FF8F00',
    moderate: '#F9A825',
    relaxed:  '#2E7D32',
    none:     '#555'
  };

  const color = urgencyColors[urgency];

  if (goal && (goal.test_date || goal.target_score)) {
    // ── Goal exists: show summary + edit button ──
    containerEl.innerHTML = `
      <div class="goal-banner-content" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
      ">
        <div class="goal-banner-info" style="display:flex; gap:20px; flex-wrap:wrap; align-items:center;">
          ${goal.test_date ? `
            <div class="goal-stat">
              <span class="goal-stat-label" style="font-size:11px; text-transform:uppercase; color:#888; display:block;">Test Date</span>
              <span class="goal-stat-value" style="font-weight:700; color:${color};">
                ${formatDaysUntil(days)}
              </span>
            </div>
          ` : ''}
          ${goal.target_score ? `
            <div class="goal-stat">
              <span class="goal-stat-label" style="font-size:11px; text-transform:uppercase; color:#888; display:block;">Target Score</span>
              <span class="goal-stat-value" style="font-weight:700;">
                ${goal.target_score}
              </span>
            </div>
          ` : ''}
        </div>
        <button class="btn-secondary goal-edit-btn" style="font-size:13px; padding:6px 14px;">
          Edit Goal
        </button>
      </div>
      <div class="goal-form-wrapper" style="display:none; margin-top:14px;">
        ${goalFormHTML(exam, goal)}
      </div>
    `;

    containerEl.querySelector('.goal-edit-btn').addEventListener('click', () => {
      const form = containerEl.querySelector('.goal-form-wrapper');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

  } else {
    // ── No goal: show prompt ──
    containerEl.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-weight:600; margin-bottom:3px;">Set your test goal</div>
          <div style="font-size:13px; color:#888;">
            Add a test date and target score to get personalized pacing.
          </div>
        </div>
        <button class="btn-secondary goal-set-btn" style="font-size:13px; padding:6px 14px;">
          Set Goal
        </button>
      </div>
      <div class="goal-form-wrapper" style="display:none; margin-top:14px;">
        ${goalFormHTML(exam, null)}
      </div>
    `;

    containerEl.querySelector('.goal-set-btn').addEventListener('click', () => {
      const form = containerEl.querySelector('.goal-form-wrapper');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  }

  // ── Wire up the save button ──
  const saveBtn = containerEl.querySelector('.goal-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const dateInput  = containerEl.querySelector('.goal-date-input');
      const scoreInput = containerEl.querySelector('.goal-score-input');

      const testDate   = dateInput?.value  || null;
      const targetScore = scoreInput?.value
        ? parseInt(scoreInput.value)
        : null;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const result = await saveUserGoal(exam, testDate, targetScore);

      if (result.error) {
        saveBtn.textContent = 'Error — try again';
        saveBtn.disabled = false;
        return;
      }

      // Re-render with saved data
      await renderGoalBanner(containerEl, exam, onSave);
      if (onSave) onSave({ testDate, targetScore });
    });
  }
}

// ─────────────────────────────────────────────
// INTERNAL: Form HTML snippet (shared by set + edit states)
// ─────────────────────────────────────────────

function goalFormHTML(exam, existingGoal) {
  const examLabel = exam.replace(/_/g, ' ');

  // Score bounds by exam type
  const scoreConfig = {
    SAT_MATH:    { min: 200, max: 800,  placeholder: 'e.g. 700', step: 10 },
    AP_PRECALC:  { min: 1,   max: 5,    placeholder: 'e.g. 4',   step: 1  },
    AP_CALC_AB:  { min: 1,   max: 5,    placeholder: 'e.g. 4',   step: 1  },
    AP_CALC_BC:  { min: 1,   max: 5,    placeholder: 'e.g. 5',   step: 1  },
  };

  const sc = scoreConfig[exam] || { min: 1, max: 1600, placeholder: 'Target score', step: 1 };

  return `
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
      <div style="flex:1; min-width:160px;">
        <label style="font-size:12px; color:#888; display:block; margin-bottom:4px;">
          ${examLabel} Test Date
        </label>
        <input
          type="date"
          class="goal-date-input modern-select"
          style="padding:8px 12px; width:100%; box-sizing:border-box;"
          value="${existingGoal?.test_date || ''}"
          min="${new Date().toISOString().split('T')[0]}"
        >
      </div>
      <div style="flex:1; min-width:140px;">
        <label style="font-size:12px; color:#888; display:block; margin-bottom:4px;">
          Target Score (${sc.min}–${sc.max})
        </label>
        <input
          type="number"
          class="goal-score-input modern-select"
          style="padding:8px 12px; width:100%; box-sizing:border-box;"
          min="${sc.min}"
          max="${sc.max}"
          step="${sc.step}"
          placeholder="${sc.placeholder}"
          value="${existingGoal?.target_score || ''}"
        >
      </div>
      <button class="btn-primary goal-save-btn" style="padding:8px 18px; white-space:nowrap;">
        Save
      </button>
    </div>
  `;
}