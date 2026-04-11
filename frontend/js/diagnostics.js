import { supabase } from "./supabase.js";
import { getUserExams } from "./subscription.js";
import { checkExamAccess } from "./subscription.js";
let readinessChart = null;

let examSelect;
let unitSelect;
let resultsDiv;

window.addEventListener("DOMContentLoaded", async () => {
  // 🔥 Detect which page we're on
  const examSelectIndex = document.getElementById("exam-select");   // index.html
  const examSelectDiag = document.getElementById("examSelect");     // diagnostics.html

  // Pick whichever exists
  examSelect = examSelectIndex || examSelectDiag;

  unitSelect = document.getElementById("unitSelect");
  resultsDiv = document.getElementById("diagnosticResults");

  // 🚨 HARD GUARD — if no examSelect, STOP
  if (!examSelect) {
    console.log("No examSelect found on this page.");
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
  examSelect.addEventListener("change", loadUnits);
}

if (unitSelect) {
  unitSelect.addEventListener("change", loadDiagnostics);
} // line 37
// 🔥 ALSO LOAD ON INITIAL PAGE LOAD
if (examSelect) {
  await loadUnits();
}
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
  try {
    console.log("🔥 snapshot trigger fired", { user, exam, unit });

    // 1. Get total attempts for this exam (ARRAY SAFE QUERY)
    const { data: attempts, count, error: attemptsError } = await supabase
      .from("topic_attempts")
      .select("is_correct", { count: "exact" })
      .eq("user_id", user.id)
      .contains("exams", [exam]);
if (count % 20 !== 0) return;
    if (attemptsError) {
      console.error("❌ attempts query error:", attemptsError);
      return;
    }

    console.log("📊 topic_attempt count:", count);

    if (!count || count < 20) return;

    // 2. Calculate accuracy directly (NO user_stats table)
    const total_attempted = attempts?.length || 0;
    const total_correct = attempts?.filter(a => a.is_correct).length || 0;

   const accuracy =
  total_attempted === 0
    ? 0
    : Number(total_correct / total_attempted);

    if (!Number.isFinite(accuracy)) {
  console.error("❌ Invalid accuracy:", accuracy);
  return;
}
    // 3. Get predicted score safely
// 3. Get predicted score safely (FINAL FIX)
let predicted_score = null;

const safeAccuracy = Number(accuracy);

if (Number.isFinite(safeAccuracy)) {

  // 🔥 FIX: convert + ROUND to clean SQL-safe number
  const readinessPercent = await calculateExamReadiness(exam);

  const { data: scoreRow, error: scoreError } = await supabase
    .from("exam_score_lookup")
    .select("predicted_score, percent_correct")
    .eq("exam", exam)
    .lte("percent_correct", readinessPercent)
    .order("percent_correct", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (scoreError) {
    console.error("❌ score lookup error:", scoreError);
  }

  if (scoreRow) {
    predicted_score = scoreRow.predicted_score;
  }

} else {
  console.error("❌ skipping score lookup due to invalid accuracy");
}

    // 4. Insert GLOBAL snapshot (ALL units)
    const { error: insertError1 } = await supabase
      .from("progress_snapshots")
      .insert({
        user_id: user.id,
        exam,
        unit: null,
        questions_answered: total_attempted,
        accuracy,
        predicted_score
      });

    if (insertError1) {
      console.error("❌ snapshot insert error (global):", insertError1);
    }

    // 5. UNIT snapshot (only if valid unit exists)
    // 🔥 COUNT UNIT ATTEMPTS CORRECTLY
}
  catch (err) {
    console.error("❌ maybeCreateSnapshot crashed:", err);
  }
  
// 🔥 GET LAST 20 UNIT ATTEMPTS (THIS WAS MISSING)
const { data: unitAttempts } = await supabase
  .from("topic_attempts")
  .select("is_correct")
  .eq("user_id", user.id)
  .contains("exams", [exam])
  .eq("unit", unit)
  .order("created_at", { ascending: false })
  .limit(20);

// 🔥 COUNT TOTAL UNIT ATTEMPTS
const { count: unitCount } = await supabase
  .from("topic_attempts")
  .select("*", { count: "exact", head: true })
  .eq("user_id", user.id)
  .contains("exams", [exam])
  .eq("unit", unit);

// Only snapshot every 20 UNIT attempts
if (unitCount % 20 === 0 && unitCount >= 20 && unitAttempts?.length === 20) {

  const correct = unitAttempts.filter(x => x.is_correct).length;
  const unitAccuracy = correct / 20;

  const { error: unitInsertError } = await supabase
    .from("progress_snapshots")
    .insert({
      user_id: user.id,
      exam,
      unit,
      questions_answered: unitCount,
      accuracy: unitAccuracy,
      predicted_score: null
    });

  if (unitInsertError) {
    console.error("❌ unit snapshot insert error:", unitInsertError);
  }
}
}

let progressChart = null;


async function loadProgressSnapshots(exam, unit) {
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
        pointHitRadius: 12
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
  const unit = unitSelect.value;

  const selectedOption = examSelect.selectedOptions[0];

  // ✅ LOCKED EXAM CHECK (UNCHANGED)
  await updateExamLocks();

  const hasAccess = await checkExamAccess(exam);

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

  // 🔥 GET ACCURACY DATA (UNCHANGED LOGIC)
  const { data: attempts } = await supabase
    .from("topic_attempts")
    .select("is_correct")
    .contains("exams", [getExamArrayValue(exam)]) // ✅ safer
    .eq("unit", data.unit)
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

const examArrayValue = getExamArrayValue(selectedExam);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

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
      .eq("user_id", user.id)
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
  unitSelect.innerHTML = `
  <option value="">Select Unit</option>
  <option value="ALL">All Units</option>
`;

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

  unitSelect.appendChild(option);

});
}

export async function loadDiagnostics() {

  if (!examSelect || !unitSelect || !resultsDiv) {
    console.log("Elements not ready yet");
    return;
  }

  const exam = examSelect.value;
  const unit = unitSelect.value;
  const examArrayValue = getExamArrayValue(exam);

  const chartContainer = document.getElementById("readinessChartContainer");
  const readinessEl = document.getElementById("readinessScore");
  const centerScore = document.getElementById("chartCenterScore");

  // 🔥 RESET UI EVERY TIME
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
  if (selectedOption?.dataset.locked === "true") {
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
  const hasAccess = await checkExamAccess(exam);

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

  if (!unit) {
    resultsDiv.innerHTML = "<p>Please select a unit.</p>";
    resultsDiv.style.display = "block";
    return;
  }

  // 🔥 ALL UNITS VIEW
  if (unit === "ALL") {

    const { data: allStats } = await supabase
      .from("topic_stats")
      .select("*")
      .contains("exams", [examArrayValue]);

    await renderAllUnits(allStats || [], exam); // line 749

    return;
  }

  // 🔥 SINGLE UNIT VIEW

  resultsDiv.style.display = "block"; largestImprovement
document.getElementById("readiness-container").style.display = "block";
document.getElementById("readinessPercentContainer").style.display = "none";
document.getElementById("largestImprovement").style.display = "none";
  let { data, error } = await supabase
    .from("topic_stats")
    .select("*")
    .contains("exams", [examArrayValue])
    .eq("unit", unit)
    .maybeSingle();

  if (error) {
    console.error(error);
    resultsDiv.innerHTML = "<p>Error loading data.</p>";
    return;
  }

  if (!data) {
    data = {
      unit: unit,
      current_streak: 0,
      best_streak: 0
    };
  }

const snapshots = await loadProgressSnapshots(exam, unit);

const linelabels = snapshots.map(s => s.questions_answered);

const dataPoints =
  unit === "ALL"
    ? snapshots.map(s => s.predicted_score)
    : snapshots.map(s => Math.round(s.accuracy * 100));
    renderProgressChart(linelabels, dataPoints, unit === "ALL" ? "Score" : "Accuracy %");
  renderDiagnostics(data);
}
async function renderAllUnits(dataArray, exam) {

  const unit = "ALL"; // 🔥 important for snapshot loader

  const snapshots = await loadProgressSnapshots(exam, unit);

  const linelabels = snapshots.map(s => s.questions_answered);

  const scoreData = snapshots.map(s => Math.round(s.predicted_score || 0));

  const container = document.getElementById("diagnosticResults");
  container.innerHTML = "";
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

  // Get attempts
  const { data: attempts } = await supabase
    .from("topic_attempts")
    .select("unit, is_correct")
    .contains("exams", [examArrayValue])
    .order("created_at", { ascending: false })
    .limit(200);

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
  <div style="
    padding: 12px;
    margin-bottom: 12px;
    border-radius: 10px;
    background: white;
    border-left: 5px solid ${
      percent >= 75 ? "#2E7D32" :
      percent >= 60 ? "#FF8F00" :
      "#C62828"
    };
    box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  ">

    <div style="font-weight:600; font-size:15px;">
      ${formatUnit(w.unit)} — ${percent}%
    </div>

    <div style="font-size:13px; color:#666; margin-top:4px;">
      Streak: ${streak}
    </div>

    <div style="
      width: 100%;
      background: #eee;
      height: 8px;
      border-radius: 4px;
      margin-top: 8px;
    ">
      <div style="
        width: ${percent}%;
        height: 100%;
        border-radius: 4px;
        background: ${
          percent >= 75 ? "#2E7D32" :
          percent >= 60 ? "#FF8F00" :
          "#C62828"
        };
      "></div>
    </div>

  </div>
`;
container.appendChild(div);
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

    const contribution = percent * (1 / weightUnits.length) * 100;

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
await calculateExamReadiness(exam);
const dataPoints =
  unit === "ALL"
    ? snapshots.map(s => s.predicted_score)
    : snapshots.map(s => Math.round(s.accuracy * 100));
    
  // 🔥 RENDER CHART
  renderReadinessChart(labels, chartData, colors);
  
}

export async function getPredictedScore(exam, readinessPercent) {

  console.log("Predicted Score Input:", exam, readinessPercent);

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
