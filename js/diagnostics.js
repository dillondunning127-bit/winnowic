import { supabase } from "./supabase.js";
import { getUserExams } from "./subscription.js";
import { checkExamAccess, checkDiagnosticsAccess } from "./subscription.js";
import { initAuthListener } from './auth.js';
initAuthListener();
let readinessChart = null;

let examSelect;

let resultsDiv;
// 🔥 PREVIEW MODE STATE
let PREVIEW_MODE = false;
let PREVIEW_USER_ID = "d43d7ca0-7beb-4e58-b724-c4b3e993c317"; // 🔥 your Supabase user id
let PREVIEW_EXAM = null;

window.addEventListener("DOMContentLoaded", async () => {
  // 🔥 Detect which page we're on
  const examSelectIndex = document.getElementById("exam-select");   // index.html
  const examSelectDiag = document.getElementById("examSelect");     // diagnostics.html

// 🔥 PREVIEW BUTTONS
const previewFullBtn = document.getElementById("preview-full");

if(previewFullBtn){
previewFullBtn.onclick = async () => {
  PREVIEW_MODE = true;

  PREVIEW_EXAM = "SAT_MATH";

  examSelect.value = "SAT_MATH";
 
  loadDiagnostics();
};
}



  // Pick whichever exists
  examSelect = examSelectIndex || examSelectDiag;
  resultsDiv = document.getElementById("diagnosticResults");

  // 🚨 HARD GUARD — if no examSelect, STOP
  if (!examSelect) {
    return;
  }

  // 🔒 Upgrade button (safe)
  const btn = document.getElementById("upgrade-btn-global");
  if (btn) {
    btn.onclick = () => {
      window.location.href = "/pricing.html";
    };
  }

  await updateExamLocks();
if (examSelect) {
  examSelect.addEventListener("change", loadDiagnostics);
}

// 🔥 ALSO LOAD ON INITIAL PAGE LOAD
});

async function loadSnapshots(exam, unit) {
  let query = supabase
    .from("progress_snapshots")
    .select("*")
    .eq("exam", exam)
    .order("questions_answered", { ascending: true });

  if (unit === "ALL") {
    query = query.is("unit", null);
  } else {
    query = query.eq("unit", unit);
  }

  const { data } = await query;
  return data || [];
}

function formatUnit(unit) {
  return unit
    .replaceAll("_", " ")
    .replace("UNIT", "Unit ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function getExamArrayValue(exam) {

  if (exam === "AP_CALC_AB") return "CALC_AB";
  if (exam === "AP_CALC_BC") return "CALC_BC";

  return exam;

}

function renderReadinessChart(labels, data, colors) {

  const canvas = document.getElementById("readinessChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (readinessChart) {
    readinessChart.destroy();
  }

  readinessChart = new Chart(ctx, {
    type: "doughnut",

    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 1
      }]
    },

    options: {

      animation: {
        animateRotate: true,
        duration: 1500
      },

      plugins: {
  legend: { display: false },
  tooltip: {
    callbacks: {
      label: function(context) {
        return `${context.label}: ${Math.round(context.raw)}%`;
      }
    }
  }
}

      ,cutout:"70%"
    }
  });
}

export async function updateUserStats(user, exam, isCorrect) {
  const { data: existing } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", user.id)
    .eq("exam", exam)
    .maybeSingle();

  if (!existing) {
    await supabase.from("user_stats").insert({
      user_id: user.id,
      exam,
      total_correct: isCorrect ? 1 : 0,
      total_attempted: 1
    });
  } else {
    await supabase
      .from("user_stats")
      .update({
        total_correct: existing.total_correct + (isCorrect ? 1 : 0),
        total_attempted: existing.total_attempted + 1,
        updated_at: new Date()
      })
      .eq("user_id", user.id)
      .eq("exam", exam);
  }
}

export async function maybeCreateSnapshot({ user, exam, unit }) {

const examArrayValue = getExamArrayValue(exam);

if (!examArrayValue) {
  console.error("Missing examArrayValue", exam);
  return;
}

if (!user || !user.id) {
  console.error("❌ snapshot blocked: missing user");
  return;
}
  try {

    const { data: attempts, error: attemptsError } = await supabase
  .from("topic_attempts")
  .select("is_correct")
  .eq("user_id", user.id)
.contains("exams",[examArrayValue]);

const count = attempts?.length || 0;

    if (attemptsError) {
  console.error("attemptsError:", attemptsError);
  return;
}

    if (!count || count < 20) return;

const snapshotThreshold =
  Math.floor(count / 20) * 20;

const { data: existingSnapshot } = await supabase
  .from("progress_snapshots")
  .select("id")
  .eq("user_id", user.id)
  .eq("exam", exam)
  .is("unit", null)
  .eq("questions_answered", snapshotThreshold)
  .maybeSingle();

if (existingSnapshot) return;

    const total_attempted = attempts.length;
    const total_correct = attempts.filter(a => a.is_correct).length;

    const accuracy = total_correct / total_attempted;

    let predicted_score = null;

    const readinessPercent = await calculateExamReadiness(exam);

    const { data: scoreRow } = await supabase
      .from("exam_score_lookup")
      .select("predicted_score")
      .eq("exam", exam)
      .lte("percent_correct", readinessPercent)
      .order("percent_correct", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scoreRow) predicted_score = scoreRow.predicted_score;

    await supabase.from("progress_snapshots").insert({
      user_id: user.id,
      exam,
      unit: null,
      questions_answered: snapshotThreshold,
      accuracy,
      predicted_score
    });

    // =========================
// UNIT SNAPSHOTS (AUTO DETECT ALL UNITS)
// =========================

const { data: allUnits, error: unitsError } = await supabase
  .from("topic_attempts")
  .select("unit")
  .eq("user_id", user.id)
  .contains("exams", [examArrayValue]);

if (unitsError) {
  console.error("unitsError:", unitsError);
  return;
}

// distinct unique units only
const uniqueUnits = [
  ...new Set(
    allUnits
      ?.map(x => x.unit)
      .filter(Boolean)
  )
];

for (const unitName of uniqueUnits) {

  const { data: unitAttempts } = await supabase
    .from("topic_attempts")
    .select("is_correct")
    .eq("user_id", user.id)
    .eq("unit", unitName)
    .contains("exams", [examArrayValue])
    .order("created_at", { ascending: false })
    .limit(20);

  const { count: unitCount } = await supabase
    .from("topic_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("unit", unitName)
    .contains("exams", [examArrayValue]);
  if (
  unitCount &&
  unitCount >= 20 &&
  unitAttempts?.length === 20
) {

  const unitSnapshotThreshold =
    Math.floor(unitCount / 20) * 20;

  // prevent duplicates
  const { data: existingUnitSnapshot } = await supabase
    .from("progress_snapshots")
    .select("id")
    .eq("user_id", user.id)
    .eq("exam", exam)
    .eq("unit", unitName)
    .eq("questions_answered", unitSnapshotThreshold)
    .maybeSingle();

  if (existingUnitSnapshot) continue;

  const correct =
    unitAttempts.filter(x => x.is_correct).length;

  await supabase
    .from("progress_snapshots")
    .insert({
      user_id: user.id,
      exam,
      unit: unitName,
      questions_answered: unitSnapshotThreshold,
      accuracy: correct / 20,
      predicted_score: null
    });
}
}

  } catch (err) {
    console.error("snapshot crashed:", err);
  }
}

let progressChart = null;


async function loadProgressSnapshots(exam, unit) {

  let userId;

  if (PREVIEW_MODE) {
    userId = PREVIEW_USER_ID;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user.id;
  }

  let query = supabase
    .from("progress_snapshots")
    .select("*")
    .eq("exam", exam)
    .eq("user_id", userId) // 🔥 ADD THIS
    .order("questions_answered", { ascending: true });

  if (unit === "ALL") {
    query = query.is("unit", null);
  } else {
    query = query.eq("unit", unit);
  }

  const { data } = await query;
  return data || [];
}

function renderProgressChart(linelabels, data, labelName = "Progress") {

  const canvas = document.getElementById("progressChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (progressChart) {
    progressChart.destroy();
  }

  progressChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: linelabels,
      datasets: [{
        label: labelName,
        data: data,
        tension: 0,
        borderWidth: 5,
        borderColor: "#FF6B00",
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: "#FF6B00",
        pointBorderColor: "#FF6B00",
        pointHitRadius: 12,
        fill: true,
        backgroundColor: "rgba(255, 107, 0, 0.15)"
      }]
    },
    options: {
      animation: {
        duration: 1000
      },
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: "# Questions"
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: labelName
          }
        }
      }
    }
  });
}
export async function renderDiagnostics(data) {

  const exam = examSelect.value;
  

  const selectedOption = examSelect.selectedOptions[0];

  // ✅ LOCKED EXAM CHECK (UNCHANGED)
  await updateExamLocks();

  const hasAccess = await hasAccessToExam(exam);

if (!hasAccess) {
    resultsDiv.innerHTML = `
      <div class="paywall">
        <h3>Upgrade Required</h3>
        <p>You don’t have access to this exam.</p>
        <button id="upgrade-btn">Upgrade</button>
      </div>
    `;

    document.getElementById("upgrade-btn").onclick = () => {
      window.location.href = "/pricing.html";
    };

    return;
  }

  // 🔥 CLEAR
  resultsDiv.innerHTML = "";

 let userId;

if (PREVIEW_MODE) {
  userId = PREVIEW_USER_ID;
} else {
  const res = await supabase.auth.getUser();
  userId = res.data.user?.id;
}

  // 🔥 GET ACCURACY DATA (UNCHANGED LOGIC)
  const { data: attempts } = await supabase
    .from("topic_attempts")
    .select("is_correct")
    .contains("exams", [getExamArrayValue(exam)]) // ✅ safer
    .eq("unit", data.unit)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  let accuracy = 0;

  if (attempts && attempts.length > 0) {
    const correct = attempts.filter(a => a.is_correct).length;
    accuracy = correct / attempts.length;
  }

  const percent = Math.round(accuracy * 100);

  // 🔥 NEW PREMIUM UI (only this part changed)
  resultsDiv.innerHTML = `
    <div class="unit-card" style="
      padding: 16px;
      border-radius: 12px;
      background: white;
      border-left: 6px solid ${
        percent >= 75 ? "#2E7D32" :
        percent >= 60 ? "#FF8F00" :
        "#C62828"
      };
      box-shadow: 0 3px 8px rgba(0,0,0,0.06);
      transition: 0.2s;
    ">

      <div style="font-size:18px; font-weight:600;">
        ${formatUnit(data.unit)}
      </div>

      <div style="margin-top:6px; font-size:14px; color:#555;">
        Accuracy (Last 20): <strong>${percent}%</strong>
      </div>

      <div style="margin-top:6px; font-size:13px; color:#777;">
        Current Streak: ${data.current_streak}
        &nbsp;&nbsp;•&nbsp;&nbsp;
        Best Streak: ${data.best_streak}
      </div>

      <div style="
        width: 100%;
        background: #eee;
        height: 10px;
        border-radius: 5px;
        margin-top: 12px;
      ">
        <div style="
          width: ${percent}%;
          height: 100%;
          border-radius: 5px;
          transition: width 0.4s ease;
          background: ${
            percent >= 75 ? "#2E7D32" :
            percent >= 60 ? "#FF8F00" :
            "#C62828"
          };
        "></div>
      </div>

    </div>
  `;
}

export async function calculateExamReadiness(selectedExam) {

const readinessEl = document.getElementById("readinessScore");

let largestGap = {
  unit: null,
  value: 0
};

let userId;

if (PREVIEW_MODE) {
  userId = PREVIEW_USER_ID;
} else {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return 0;
  }

  userId = user.id;
}

const examArrayValue = getExamArrayValue(selectedExam);
  
  const { data: weights } = await supabase
    .from("exam_unit_weights")
    .select("*")
    .eq("exam", selectedExam);

  if (!weights) return 0;

  let unitData = [];
  let weightedScore = 0;

  for (let w of weights) {

    const { data: attempts } = await supabase
      .from("topic_attempts")
      .select("is_correct")
      .eq("user_id", userId)
      .eq("unit", w.unit)
      .contains("exams",[examArrayValue])
      .order("created_at",{ascending:false})
      .limit(20);

    let mastery = 0;

    if (attempts && attempts.length > 0) {
      const correct = attempts.filter(a=>a.is_correct).length;
      mastery = correct / attempts.length;
    }

const improvementPotential = (1 - mastery) * w.weight;

if (improvementPotential > largestGap.value) {
  largestGap = {
    unit: w.unit,
    value: improvementPotential
  };
}

    weightedScore += mastery * (w.weight);

    unitData.push({
      unit: w.unit,
      mastery,
      weight: w.weight 
    });

  }

const labels = [];
const chartData = [];
const colors = [];

const colorPalette = [
  "#FF5A00",
  "#FF6B00",
  "#FF7F11",
  "#FF8F1F",
  "#FF9F1C",
  "#FFB347",
  "#FFC15A",
  "#FFD166",
  "#FFE08A",
  "#FFF1B8"
];

let totalContribution = 0;

unitData.forEach((u, i) => {

  const contribution = u.mastery * u.weight*100;

  labels.push(formatUnit(u.unit));
  chartData.push(contribution);
  colors.push(colorPalette[i % colorPalette.length]);

  totalContribution += contribution;
});

const readinessPercent = Math.round(totalContribution);

if (readinessEl) {
  readinessEl.textContent = `${readinessPercent}%`;
}

/* ADD GRAY REMAINDER */

const remaining = 100 - readinessPercent;

if (remaining > 0) {
  labels.push("Room to Improve");
  chartData.push(remaining);
  colors.push("#e0e0e0"); // gray
}

const chartCanvas = document.getElementById("readinessChart");

if (chartCanvas) {
  

  const predictedScore = await getPredictedScore(selectedExam, readinessPercent);

  const centerScore = document.getElementById("chartCenterScore");
  if (centerScore) {
    centerScore.textContent = predictedScore;
  }
}

const improvementDiv = document.getElementById("largestImprovement");

if (improvementDiv && largestGap.unit) {

  const percent = Math.round(largestGap.value * 100);

  improvementDiv.innerHTML = `
  <div style="
    margin-top: 10px;
    padding: 12px;
    border-radius: 10px;
    background: #FFF3E0;
    border: 1px solid #FFE0B2;
    font-weight: 500;
  ">
    <div style="font-size: 13px; color: #555;">
      Biggest Opportunity
    </div>
    <div style="font-size: 16px; font-weight: 600;">
      ${formatUnit(largestGap.unit)}
    </div>
    <div style="color: #FF6B00;">
      +${percent}% potential (weighted) gain
    </div>
  </div>
`;
}

return readinessPercent;
}

export async function loadUnits() {

  const exam = examSelect.value;
  if (unitSelect) {
  unitSelect.innerHTML =  `
  
  <option value="">Select Unit</option>
  <option value="ALL">All Units</option>
`};

  if (!exam) return;

  let query = supabase
  .from("questions")
  .select("unit");

if (exam === "AP_CALC_AB") {

  query = query.overlaps("exams", ["CALC_AB"]);

} else if (exam === "AP_CALC_BC") {

  query = query.overlaps("exams", ["CALC_AB", "CALC_BC"]);

} else {

 query = query.contains("exams", [getExamArrayValue(exam)]);


}

const { data } = await query;

  if (!data) return;

  const normalizedUnits = data.map(q =>
  q.unit
    .toUpperCase()
    .replaceAll(" ", "_")
);

const uniqueUnits = [...new Set(normalizedUnits)];

uniqueUnits.sort((a, b) => {
  const numA = parseInt(a.match(/\d+/));
  const numB = parseInt(b.match(/\d+/));
  return numA - numB;
});

uniqueUnits.forEach(unit => {

  const option = document.createElement("option");

  option.value = unit;

  option.textContent =
    unit.replaceAll("_", " ").replace("UNIT", "Unit ");
if(unitSelect){
  unitSelect.appendChild(option);
}
});
}

export async function loadDiagnostics() {

  if (!examSelect || !resultsDiv) {
    return;
  }

  const exam = examSelect.value;

  const examArrayValue = getExamArrayValue(exam);

  const chartContainer = document.getElementById("readinessChartContainer");
  const readinessEl = document.getElementById("readinessScore");
  const centerScore = document.getElementById("chartCenterScore");

  resultsDiv.innerHTML = "";
  resultsDiv.style.display = "none";

  if (chartContainer) chartContainer.style.display = "none";
  if (readinessEl) readinessEl.textContent = "";
  if (centerScore) centerScore.textContent = "--";

  if (!exam) {
    resultsDiv.innerHTML = "<p>Please select an exam first.</p>";
    return;
  }

  const selectedOption = examSelect.selectedOptions[0];

  // 🔒 FRONTEND LOCK CHECK
 if (selectedOption?.dataset.locked === "true" && !PREVIEW_MODE) {
    resultsDiv.innerHTML = `
      <div class="paywall">
        <p>Unlock this exam to view diagnostics.</p>
        <button id="upgrade-btn">Upgrade</button>
      </div>
    `;

    resultsDiv.style.display = "block";

    document.getElementById("upgrade-btn").onclick = () => {
      window.location.href = "/pricing.html";
    };

    return;
  }

  // 🔐 BACKEND ACCESS CHECK (NOW APPLIES TO ALL + SINGLE)
  const hasAccess = await hasAccessToExam(exam);

if (!hasAccess) {
    resultsDiv.innerHTML = `
      <div class="paywall">
        <h3>Upgrade Required</h3>
        <p>You don’t have access to this exam.</p>
        <button id="upgrade-btn">Upgrade</button>
      </div>
    `;

    resultsDiv.style.display = "block";

    document.getElementById("upgrade-btn").onclick = () => {
      window.location.href = "/pricing.html";
    };

    return;
  }

  // ❗ NOW safe to render anything

let userId;

  if (PREVIEW_MODE) {
    userId = PREVIEW_USER_ID;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user.id;
  }
  
    const { data: allStats } = await supabase
  .from("topic_stats")
  .select("*")
  .contains("exams", [examArrayValue])
  .eq("user_id", userId);

await renderAllUnits(allStats || [], exam);

    return;
}
async function renderAllUnits(dataArray, exam) {

  const unit = "ALL"; // 🔥 important for snapshot loader

  const snapshots = await loadProgressSnapshots(exam, unit);

calculateExamReadiness(exam);

  const linelabels = snapshots.map(s => s.questions_answered);

  const scoreData = snapshots.map(s => Math.round(s.predicted_score || 0));

  const container = document.getElementById("diagnosticResults");
  container.innerHTML = `

  <div class="units-section-header">

    <div class="units-section-badge">
      Unit Performance Analytics
    </div>

    <h2 class="units-section-title">
      Track Every Unit Individually
    </h2>

    <p class="units-section-description">
      Updates every <strong>20 questions</strong> of a unit (like Algebra) so you can track how you're improving not just overall,
      but within your <strong>specific areas to study effectively and efficiently.</strong>
    </p>

  </div>

`;
  container.style.display = "block";
document.getElementById("readinessPercentContainer").style.display = "block";
  const chartContainer = document.getElementById("readinessChartContainer");
  if (chartContainer) {
    chartContainer.style.display = "block";
  }
document.getElementById("largestImprovement").style.display = "block";
  document.getElementById("readiness-container").style.display = "block";
  const examArrayValue = getExamArrayValue(exam);

  // Get unit list
  const { data: weightUnits } = await supabase
    .from("exam_unit_weights")
    .select("unit, weight")
    .eq("exam", exam);

  if (!weightUnits) return;

  // Sort units numerically
  weightUnits.sort((a, b) => {
    const numA = parseInt(a.unit.match(/\d+/));
    const numB = parseInt(b.unit.match(/\d+/));
    return numA - numB;
  });
let userId;

  if (PREVIEW_MODE) {
    userId = PREVIEW_USER_ID;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user.id;
  }
  // Get attempts
  const { data: attempts } = await supabase
    .from("topic_attempts")
    .select("unit, is_correct")
    .contains("exams", [examArrayValue])
.eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);


    
  const attemptsByUnit = {};




renderProgressChart(linelabels, scoreData, "Predicted Score");

  if (attempts) {
    for (let a of attempts) {
      if (!attemptsByUnit[a.unit]) {
        attemptsByUnit[a.unit] = [];
      }
      attemptsByUnit[a.unit].push(a.is_correct);
    }
  }
  // 🔥 READINESS CALCULATION (GLOBAL)
  let totalWeight = 0;
  let weightedMastery = 0;

  // 🔥 RENDER EACH UNIT
  for (let w of weightUnits) {

    const unitAttempts = attemptsByUnit[w.unit] || [];
    const last20 = unitAttempts.slice(0, 20);

    let percent = 0;

    if (last20.length > 0) {
      
      const correct = last20.filter(x => x).length;
      percent = Math.round((correct / last20.length) * 100);
    }

    const mastery = percent / 100;

    weightedMastery += mastery * (w.weight || 0);
    totalWeight += (w.weight || 0);

    const stats = dataArray.find(d => d.unit === w.unit);
    const streak = stats?.current_streak || 0;

    const div = document.createElement("div");
div.classList.add("unit-card");

    div.innerHTML = `
  <div class="unit-card-modern">

    <!-- TOP ROW -->
    <div class="unit-card-header">

      <div class="unit-card-left">
        <div class="unit-card-title">
          ${formatUnit(w.unit)}
        </div>

        <div class="unit-card-subtitle">
          ${percent}% Accuracy
        </div>
      </div>

      <div class="unit-card-right">

        <div class="unit-streak-pill">
          ${streak} Question Streak
        </div>

        <button class="unit-expand-btn">
          <div class="expand-arrow">
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
</div>
        </button>

      </div>

    </div>

    <!-- PROGRESS BAR -->
    <div class="unit-progress-bg">
      <div class="unit-progress-fill"
        style="
          width:${percent}%;
          background:${
            percent >= 75 ? "#2E7D32" :
            percent >= 60 ? "#FF8F00" :
            "#C62828"
          };
        ">
      </div>
    </div>

    <!-- DROPDOWN -->
    <div class="unit-dropdown">

      <div class="unit-dropdown-grid">

        <div class="unit-dropdown-stat">
          <div class="dropdown-stat-label">
            Current Streak
          </div>

          <div class="dropdown-stat-value">
            ${stats?.current_streak || 0}
          </div>
        </div>

        <div class="unit-dropdown-stat">
          <div class="dropdown-stat-label">
            Best Streak
          </div>

          <div class="dropdown-stat-value">
            ${stats?.best_streak || 0}
          </div>
        </div>

      </div>

      <div class="unit-mini-chart-wrapper">
        <canvas id="chart-${w.unit}"></canvas>
      </div>

    </div>

  </div>
`;
container.appendChild(div);
const expandBtn = div.querySelector(".unit-expand-btn");
const dropdown = div.querySelector(".unit-dropdown");
const arrow = div.querySelector(".expand-arrow");

let expanded = false;

expandBtn.addEventListener("click", async () => {

  expanded = !expanded;

  dropdown.classList.toggle("open");

  arrow.style.transform = expanded
    ? "rotate(180deg)"
    : "rotate(0deg)";

  // ONLY render chart first open
  if (expanded && !dropdown.dataset.loaded) {

    const unitSnapshots = await loadProgressSnapshots(exam, w.unit);

    const labels = unitSnapshots.map(s => s.questions_answered);

    const points = unitSnapshots.map(s =>
      Math.round((s.accuracy || 0) * 100)
    );

    const canvas = document.getElementById(`chart-${w.unit}`);

    if (canvas) {

      new Chart(canvas.getContext("2d"), {

        type: "line",

        data: {
          labels,
          datasets: [{
            data: points,
            borderColor: "#FF6B00",
            pointBackgroundColor: "#FF6B00",
pointBorderColor: "#FF6B00",
            borderWidth: 3,
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },

        options: {

          responsive: true,

          plugins: {
            legend: {
              display: false
            }
          },

          scales: {

            x: {
              title: {
                display: true,
                text: "Questions Answered"
              }
            },

            y: {
              min: 0,
              max: 100,

              title: {
                display: true,
                text: "Accuracy %"
              }
            }

          }

        }

      });

    }

    dropdown.dataset.loaded = "true";
  }

});
  }


    
  // 🔥 FINAL READINESS %
  const readinessPercent = totalWeight > 0
    ? Math.round((weightedMastery / totalWeight) * 100)
    : 0;

  const readinessEl = document.getElementById("readinessScore");
  if (readinessEl) {
    readinessEl.textContent = `${readinessPercent}%`;
  }

  // 🔥 PREDICTED SCORE
  let predictedScore = await getPredictedScore(exam, readinessPercent);

  const centerScore = document.getElementById("chartCenterScore");
  if (centerScore) {
    centerScore.textContent = predictedScore || "--";
  }

  // 🔥 CHART DATA
  
  const chartData = [];
  const colors = [];

const colorPalette = [
  "#FF5A00",
  "#FF6B00",
  "#FF7F11",
  "#FF8F1F",
  "#FF9F1C",
  "#FFB347",
  "#FFC15A",
  "#FFD166",
  "#FFE08A",
  "#FFF1B8"
];

  let total = 0;
const labels = [];
  weightUnits.forEach((w, i) => { //line 955

    const unitAttempts = attemptsByUnit[w.unit] || [];
    const last20 = unitAttempts.slice(0, 20);

    let percent = 0;

    if (last20.length > 0) {
      const correct = last20.filter(x => x).length;
      percent = correct / last20.length;
    }

    const contribution = percent * w.weight * 100;

    labels.push(w.unit);
    chartData.push(contribution);
    colors.push(colorPalette[i % colorPalette.length]);

    total += contribution;
  });

  const remaining = 100 - total;

  if (remaining > 0) {
    labels.push("Room to Improve");
    chartData.push(remaining);
    colors.push("#e0e0e0");
  }
const dataPoints =
  unit === "ALL"
    ? snapshots.map(s => s.predicted_score)
    : snapshots.map(s => Math.round(s.accuracy * 100));
    
  // 🔥 RENDER CHART
  renderReadinessChart(labels, chartData, colors);
  
}

export async function getPredictedScore(exam, readinessPercent) {



  const { data, error } = await supabase
    .from("exam_score_lookup")
    .select("*")
    .eq("exam", exam)
    .lte("percent_correct", readinessPercent)
    .order("percent_correct", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return "--";
  }

  if (!data) return "--";

  return data.predicted_score;
}

export async function updateExamLocks() {
  if (!examSelect || !examSelect.options) return;

  const userExams = await getUserExams();
  const options = Array.from(examSelect.options);

  for (let option of options) {
    if (option.value === "") continue;

    // 🔥 RESET FIRST (VERY IMPORTANT)
    delete option.dataset.locked;

    if (!userExams.includes("ALL") && !userExams.includes(option.value)) {
      option.dataset.locked = "true";
    }
  }
}

async function hasAccessToExam(exam) {
  if (PREVIEW_MODE) return true;
  const result = await checkDiagnosticsAccess(exam);
  return result;
}

async function getEffectiveUserId() {
  if (PREVIEW_MODE) 
    return PREVIEW_USER_ID;

  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function exitPreviewMode() {

  // turn off preview state
  PREVIEW_MODE = false;
  PREVIEW_EXAM = null;

  // re-enable dropdowns
  examSelect.disabled = false;


  // clear UI
  resultsDiv.innerHTML = "";
resultsDiv.style.display = "none";
  const readinessEl = document.getElementById("readinessScore");
  const centerScore = document.getElementById("chartCenterScore");

  if (readinessEl) readinessEl.textContent = "";
  if (centerScore) centerScore.textContent = "--";

  const chartContainer = document.getElementById("readinessChartContainer");
  if (chartContainer) chartContainer.style.display = "none";

  document.getElementById("largestImprovement").style.display = "none";
  document.getElementById("readinessPercentContainer").style.display = "none";
  document.getElementById("readiness-container").style.display = "none";

  // reset dropdowns (blank state)
  examSelect.value = "";

  // optional: reload clean state
  await updateExamLocks();
}
