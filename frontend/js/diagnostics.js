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

  // 🔒 Lock exams (ONLY if dropdown supports options)
  if (examSelect.options) {

    const userExams = await getUserExams();
    const options = Array.from(examSelect.options);

    for (let option of options) {
      if (option.value === "") continue;

      if (!userExams.includes("ALL") && !userExams.includes(option.value)) {
        option.textContent += " 🔒";
        option.dataset.locked = "true";
      }
    }
  }
console.log("USER EXAMS:", await getUserExams());
  // ✅ Attach listeners safely
  examSelect.addEventListener("change", loadDiagnostics);

  if (unitSelect) {
    examSelect.addEventListener("change", loadUnits);
    unitSelect.addEventListener("change", loadDiagnostics);
  }

});

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



export async function renderDiagnostics(data) {

  const exam = examSelect.value;
  const unit = unitSelect.value;

  const selectedOption = examSelect.selectedOptions[0];

  // ✅ LOCKED EXAM CHECK (UNCHANGED)
  if (selectedOption?.dataset.locked === "true") {
    resultsDiv.innerHTML = `
      <div class="paywall">
        <h3>🔒 ${selectedOption.textContent.replace(" 🔒", "")}</h3>
        <p>Unlock this exam to view diagnostics.</p>
        <button id="upgrade-btn">Upgrade</button>
      </div>
    `;

    document.getElementById("upgrade-btn").onclick = () => {
      window.location.href = "/pricing.html";
    };

    return;
  }

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

if (readinessEl) {
  readinessEl.textContent = `${readinessPercent}%`;
}

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
  renderReadinessChart(labels, chartData, colors);

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
      +${percent}% potential gain
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
        <h3>🔒 ${selectedOption.textContent.replace(" 🔒", "")}</h3>
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

    await renderAllUnits(allStats || [], exam);

    return;
  }

  // 🔥 SINGLE UNIT VIEW

  resultsDiv.style.display = "block";
document.getElementById("readiness-container").style.display = "none";

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

  renderDiagnostics(data);
}
async function renderAllUnits(dataArray, exam) {

  const container = document.getElementById("diagnosticResults");
  container.innerHTML = "";
  container.style.display = "block";

  const chartContainer = document.getElementById("readinessChartContainer");
  if (chartContainer) {
    chartContainer.style.display = "block";
  }

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

  let total = 0;

  weightUnits.forEach((w, i) => {

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

  // 🔥 RENDER CHART
  renderReadinessChart(labels, chartData, colors);
  await calculateExamReadiness(exam);
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
