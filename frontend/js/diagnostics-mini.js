import { getPredictedScore } from "./diagnostics.js";

function formatUnit(unit) {
  return unit
    .replaceAll("_", " ")
    .replace("UNIT", "Unit ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// extract numeric value from unit name (for sorting)
function getUnitNumber(unit) {
  const match = unit.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

window.addEventListener("DOMContentLoaded", async () => {

    const params = new URLSearchParams(window.location.search);
    const isMini = params.get("mode") === "mini";

    if (!isMini) return;

    const raw = sessionStorage.getItem("diagnosticResults");
    const exam = sessionStorage.getItem("diagnosticExam");

    if (!raw || !exam) return;

    const data = JSON.parse(raw);

    const container = document.getElementById("diagnosticResults");
    container.innerHTML = "";
    container.style.display = "block";

    // hide normal UI
    document.getElementById("readiness-container").style.display = "none";

    // group by unit
    const unitMap = {};

    for (let row of data) {
        if (!unitMap[row.unit]) {
            unitMap[row.unit] = { correct: 0, total: 0 };
        }

        unitMap[row.unit].total++;
        if (row.correct) unitMap[row.unit].correct++;
    }

    let totalCorrect = 0;
    let totalQuestions = data.length;

    // 🔥 SORT UNITS NUMERICALLY HERE
    const sortedUnits = Object.entries(unitMap).sort(
        ([unitA], [unitB]) => getUnitNumber(unitA) - getUnitNumber(unitB)
    );

    sortedUnits.forEach(([unit, stats]) => {

        const percent = Math.round((stats.correct / stats.total) * 100);
        totalCorrect += stats.correct;

        const div = document.createElement("div");

        div.innerHTML = `
        <div style="
            padding:12px;
            margin-bottom:10px;
            border-radius:10px;
            background:white;
            border-left:5px solid ${
                percent >= 75 ? "#2E7D32" :
                percent >= 60 ? "#FF8F00" :
                "#C62828"
            };
        ">
            <div style="font-weight:600;">
                ${formatUnit(unit)} — ${percent}%
            </div>

            <div style="
                width:100%;
                background:#eee;
                height:8px;
                border-radius:4px;
                margin-top:6px;
            ">
                <div style="
                    width:${percent}%;
                    height:100%;
                    background:${
                        percent >= 75 ? "#2E7D32" :
                        percent >= 60 ? "#FF8F00" :
                        "#C62828"
                    };
                "></div>
            </div>
        </div>
        `;

        container.appendChild(div);
    });

    // predicted score
    const percentCorrect = Math.round((totalCorrect / totalQuestions) * 100);

    const predicted = await getPredictedScore(exam, percentCorrect);

    const scoreDiv = document.createElement("div");
    scoreDiv.innerHTML = `
        <div style="
            margin-top:20px;
            padding:16px;
            border-radius:12px;
            background:#FFF3E0;
            text-align:center;
            font-size:20px;
            font-weight:600;
        ">
            Predicted Score: ${predicted}
        </div>
    `;

    container.prepend(scoreDiv);

    // cleanup (so refresh doesn't reuse old data)
    sessionStorage.removeItem("diagnosticResults");
    sessionStorage.removeItem("diagnosticMode");
});
