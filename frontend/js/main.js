import { initAuthListener, login, logout, signUp } from './auth.js';
import { loadQuestions, selectAnswer, nextQuestion} from './quiz.js';
import { supabase } from './supabase.js';
import { initQuizSettings } from "./quizSettings.js";
import { checkExamAccess, getUserExams } from "./subscription.js";
import { startQuiz } from "./quiz.js";
let currentMode = "normal";

window.addEventListener("DOMContentLoaded", async () => {
    console.log("App loaded");

    initQuizSettings();
    initAuthListener();

    const diagnosticsBtn = document.getElementById("diagnostics-btn");
    const examSelect = document.getElementById("exam-select");
    const message = document.getElementById("message");
    const select = document.getElementById("time-select");
    const cancelBtn = document.getElementById("cnclsub-btn");
    const deleteBtn = document.getElementById("dltact-btn");



const modeNormal = document.getElementById("mode-normal");
const modeAdaptive = document.getElementById("mode-adaptive");
const modeDiagnostic = document.getElementById("mode-diagnostic");
modeNormal.addEventListener("click", () => setMode("normal"));
modeAdaptive.addEventListener("click", () => setMode("adaptive"));
modeDiagnostic.addEventListener("click", () => setMode("diagnostic"));

examSelect.addEventListener("change", () => {
    updateStartButtonState();
});

document.getElementById("mode-normal").addEventListener("click", () => {
    currentMode = "normal";
});

document.getElementById("mode-adaptive").addEventListener("click", () => {
    currentMode = "adaptive";
});

document.getElementById("mode-diagnostic").addEventListener("click", () => {
    currentMode = "diagnostic";
});

function launchQuiz(mode) {
    const exam = document.getElementById("exam-select").value;

    const config = {
        exam,
        unit: null,
        quizLength: mode === "diagnostic"
            ? 20
            : parseInt(document.getElementById("time-select").value)
    };

    console.log("LAUNCH QUIZ:", mode, config);

    startQuiz(mode, config);
}

function setMode(mode) {
    currentMode = mode;

    // visual reset
    modeNormal.classList.remove("active-mode");
    modeAdaptive.classList.remove("active-mode");
    modeDiagnostic.classList.remove("active-mode");

    // highlight selected
    if (mode === "normal") modeNormal.classList.add("active-mode");
    if (mode === "adaptive") modeAdaptive.classList.add("active-mode");
    if (mode === "diagnostic") modeDiagnostic.classList.add("active-mode");

    console.log("Mode set to:", currentMode);
    updateUIForMode(); // 🔥 ADD THIS LINE
    updateStartButtonState();
}

function updateUIForMode() {
    const timeSelect = document.getElementById("time-select");
    const unitSelect = document.getElementById("unit-select");
  

    // 🔥 NEW
    const timeLabel = document.getElementById("label-time");
    const unitLabel = document.getElementById("label-unit");

    // DEFAULT (reset everything)
    timeSelect.style.display = "";
    unitSelect.style.display = "";
    

    timeLabel.style.display = "";
    unitLabel.style.display = "";

    // NORMAL
    if (currentMode === "normal") {
        timeSelect.disabled = false;
        unitSelect.disabled = false;
    }

    // ADAPTIVE
    if (currentMode === "adaptive") {
        timeSelect.disabled = false;

        unitSelect.style.display = "none";
        unitLabel.style.display = "none"; // 🔥 hide label too
    }

    // DIAGNOSTIC
    if (currentMode === "diagnostic") {
        timeSelect.style.display = "none";
        unitSelect.style.display = "none";

        timeLabel.style.display = "none"; // 🔥 hide label
        unitLabel.style.display = "none"; // 🔥 hide label

    }
}

async function updateStartButtonState() {
    const startBtn = document.getElementById("start-quiz-btn");
    const exam = document.getElementById("exam-select").value;

    // Reset state
    startBtn.disabled = false;
    message.textContent = "";

    // ✅ NORMAL + DIAGNOSTIC → always allowed
    if (currentMode !== "adaptive") {
        return;
    }

    // 🔒 ADAPTIVE MODE RULES

    // No exam selected
    if (!exam) {
        startBtn.disabled = true;
        message.textContent = "Select an exam to use adaptive mode.";
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    // Not logged in
    if (!user) {
        startBtn.disabled = true;
        message.textContent = "Create a free account to use adaptive mode.";
        return;
    }

    const hasAccess = await checkExamAccess(exam);

    // No subscription
    if (!hasAccess) {
        startBtn.disabled = true;
        message.innerHTML = `
            <img src="/assets/icon-lock.png" class="icon">
            Upgrade to unlock adaptive quizzes
        `;
        return;
    }

    // ✅ Fully allowed
    startBtn.disabled = false;
    message.textContent = "";
}

    const messageEl = document.getElementById("top-bar-message");

    function showTopMessage(text) {
        if (!messageEl) return;

        messageEl.textContent = text;
        messageEl.style.display = "block";

        setTimeout(() => {
            messageEl.style.display = "none";
        }, 3000);
    }

    /* ============================= */
    /* USER STATE INIT */
    /* ============================= */

    const { data: { user } } = await supabase.auth.getUser();


    /* ============================= */
    /* DIAGNOSTICS BUTTON */
    /* ============================= */

    if (diagnosticsBtn) {
        diagnosticsBtn.addEventListener("click", () => {
            window.location.href = "diagnostics.html";
        });
    }

    /* ============================= */
    /* START QUIZ */
    /* ============================= */

document.getElementById("start-quiz-btn").addEventListener("click", async () => {

    const exam = document.getElementById("exam-select").value;

    if (!exam) {
        message.textContent = "Please select an exam.";
        return;
    }

    // 🔥 ADAPTIVE GATING
    if (currentMode === "adaptive") {

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            message.textContent = "Create a free account to use adaptive mode.";
            return;
        }

        const hasAccess = await checkExamAccess(exam);

        if (!hasAccess) {
            message.innerHTML = `
                <img src="/assets/icon-lock.png" class="icon">
                Upgrade to unlock adaptive quizzes
            `;
            return;
        }
    }

    // ✅ SAFE TO START

    launchQuiz(currentMode);
});
    

    /* ============================= */
    /* FEEDBACK */
    /* ============================= */

    const feedbackBtn = document.getElementById("feedback-btn");

    if (feedbackBtn) {
        feedbackBtn.addEventListener("click", () => {
            window.location.href = "/feedback.html";
        });
    }

    /* ============================= */
    /* DIAGNOSTIC FLOW */
    /* ============================= */


    
const gearMenu = document.getElementById("account-gear");

if (user) {
    gearMenu.style.display = "block";
} else {
    gearMenu.style.display = "none";
}
    /* ============================= */
    /* REPORT SYSTEM (SAFE INIT) */
    /* ============================= */

    const reportBtn = document.getElementById("report-btn");

    if (reportBtn) {
        const closeBtn = document.getElementById("close-report");
        const submitBtn = document.getElementById("submit-report");
        const reportType = document.getElementById("report-type");
        const reportMessage = document.getElementById("report-message");

        reportBtn.addEventListener("click", () => {
            const popup = document.getElementById("report-popup");
            if (!popup) return;

            const rect = reportBtn.getBoundingClientRect();

            popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
            popup.style.left = `${rect.right - 220}px`;
            popup.style.display = "block";
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                document.getElementById("report-popup").style.display = "none";
            });
        }

        if (reportType) {
            reportType.addEventListener("change", () => {
                if (reportType.value === "other") {
                    reportMessage.style.display = "block";
                } else {
                    reportMessage.style.display = "none";
                }
            });
        }

        document.addEventListener("click", (e) => {
            const popup = document.getElementById("report-popup");
            if (!popup) return;

            if (!popup.contains(e.target) && e.target !== reportBtn) {
                popup.style.display = "none";
            }
        });

        if (submitBtn) {
            submitBtn.addEventListener("click", async () => {
                const user = await supabase.auth.getUser();

                const payload = {
                    question_id: window.currentQuestionId,
                    report_type: reportType.value,
                    message: reportMessage.value || null,
                    user_id: user?.id || null
                };

                const { error } = await supabase
                    .from("question_reports")
                    .insert([payload]);

                if (error) {
                    console.error("Report error:", error);
                    return;
                }

                document.getElementById("report-popup").style.display = "none";

                const originalHTML = reportBtn.innerHTML;

reportBtn.innerHTML = "✓";
reportBtn.classList.add("report-success");

setTimeout(() => {
    reportBtn.innerHTML = originalHTML;
    reportBtn.classList.remove("report-success");
}, 1500);
            });
        }
    }

    /* ============================= */
    /* UPGRADE BUTTON */
    /* ============================= */

    const upgradeBtn = document.getElementById("upgrade-btn");

    if (upgradeBtn) {
        const exams = await getUserExams();

        if (exams.includes("ALL")) {
            upgradeBtn.style.display = "none";
        } else {
            upgradeBtn.style.display = "block";
        }

        upgradeBtn.addEventListener("click", () => {
            window.location.href = "/pricing.html";
        });
    }

    /* ============================= */
    /* AUTH BUTTONS */
    /* ============================= */

    document.getElementById("login-btn")?.addEventListener("click", login);
    document.getElementById("logout-btn")?.addEventListener("click", logout);
    document.getElementById("signup-btn")?.addEventListener("click", signUp);

    /* ============================= */
    /* ANSWER BUTTONS */
    /* ============================= */

    document.getElementById("choice-a")?.addEventListener("click", () => selectAnswer("A"));
    document.getElementById("choice-b")?.addEventListener("click", () => selectAnswer("B"));
    document.getElementById("choice-c")?.addEventListener("click", () => selectAnswer("C"));
    document.getElementById("choice-d")?.addEventListener("click", () => selectAnswer("D"));

    document.getElementById("grid-submit")?.addEventListener("click", () => {
        const value = document.getElementById("grid-input")?.value;
        selectAnswer(value);
    });

    document.getElementById("next-btn")?.addEventListener("click", nextQuestion);
    updateStartButtonState();
});
