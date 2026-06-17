import { getPredictedScore } from "./diagnostics.js";

function formatUnit(unit) {
  return unit
    .replaceAll("_", " ")
    .replace("UNIT", "Unit ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getUnitNumber(unit) {
  const match = unit.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// ─────────────────────────────────────────────
// EXPORTED — called directly from quiz.js
// ─────────────────────────────────────────────
export async function renderDiagnosticResults(data, exam, container) {

    container.innerHTML = "";

    // group by unit
    const unitMap = {};
    for (let row of data) {
        if (!unitMap[row.unit]) unitMap[row.unit] = { correct: 0, total: 0 };
        unitMap[row.unit].total++;
        if (row.correct) unitMap[row.unit].correct++;
    }

    let totalCorrect = 0;
    const totalQuestions = data.length;

    const sortedUnits = Object.entries(unitMap).sort(
        ([a], [b]) => getUnitNumber(a) - getUnitNumber(b)
    );

    // ── Unit bars ──
    const unitsWrap = document.createElement("div");
    unitsWrap.style.cssText = "margin-top: 16px;";

    sortedUnits.forEach(([unit, stats]) => {
        const percent = Math.round((stats.correct / stats.total) * 100);
        totalCorrect += stats.correct;

        const color = percent >= 75 ? "#2E7D32" : percent >= 60 ? "#FF8F00" : "#C62828";
        const bgLight = percent >= 75 ? "#F1F8F1" : percent >= 60 ? "#FFF8EE" : "#FFF1F1";
        const label = percent >= 75 ? "Strong" : percent >= 60 ? "Review" : "Weak";

        const div = document.createElement("div");
        div.style.cssText = `
            padding: 12px 14px;
            margin-bottom: 8px;
            border-radius: 12px;
            background: ${bgLight};
            border-left: 4px solid ${color};
            display: flex;
            flex-direction: column;
            gap: 6px;
        `;
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:600; font-size:14px; color:#0B1F3B;">
                    ${formatUnit(unit)}
                </span>
                <span style="
                    font-size:11px;
                    font-weight:700;
                    color:${color};
                    background:${bgLight};
                    border:1px solid ${color};
                    border-radius:20px;
                    padding:2px 8px;
                ">
                    ${label} · ${percent}%
                </span>
            </div>
            <div style="width:100%; background:#e0e0e0; height:7px; border-radius:4px;">
                <div style="
                    width:${percent}%;
                    height:100%;
                    background:${color};
                    border-radius:4px;
                    transition: width 0.6s ease;
                "></div>
            </div>
        `;
        unitsWrap.appendChild(div);
    });

    container.appendChild(unitsWrap);

    // ── Score range ──
    const percentCorrect = Math.round((totalCorrect / totalQuestions) * 100);
    const predicted = await getPredictedScore(exam, percentCorrect);

    let scoreLow = "--";
    let scoreHigh = "--";
    let scoreLabel = "--";

    if (predicted && predicted !== "--") {
        const base = parseInt(predicted);
        scoreLow  = Math.max(200, base - 20);
        scoreHigh = Math.min(800, base + 20);
        scoreLabel = `${scoreLow} – ${scoreHigh}`;
    }

    const scoreDiv = document.createElement("div");
    scoreDiv.style.cssText = `
        background: #0B1F3B;
        border-radius: 16px;
        padding: 20px;
        text-align: center;
        margin-bottom: 16px;
    `;
    scoreDiv.innerHTML = `
        <div style="
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(255,216,77,0.6);
            margin-bottom: 6px;
        ">
            Predicted SAT Score Range
        </div>
        <div style="
            font-size: 38px;
            font-weight: 800;
            color: #FFD84D;
            letter-spacing: -1px;
            line-height: 1;
        ">
            ${scoreLabel}
        </div>
        <div style="
            font-size: 12px;
            color: rgba(255,255,255,0.45);
            margin-top: 6px;
        ">
            Based on ${totalQuestions} questions · ±20 points
        </div>
    `;

    container.prepend(scoreDiv);
}

// ─────────────────────────────────────────────
// Legacy path — diagnostics.html?mode=mini
// Still works if anyone lands there directly
// ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") !== "mini") return;

    const raw  = sessionStorage.getItem("diagnosticResults");
    const exam = sessionStorage.getItem("diagnosticExam");
    if (!raw || !exam) return;

    const data = JSON.parse(raw);
    const container = document.getElementById("diagnosticResults");
    if (!container) return;

    container.style.display = "block";
    const readiness = document.getElementById("readiness-container");
    if (readiness) readiness.style.display = "none";

    await renderDiagnosticResults(data, exam, container);

    sessionStorage.removeItem("diagnosticResults");
    sessionStorage.removeItem("diagnosticMode");
});