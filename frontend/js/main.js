import { initAuthListener, login, logout, signUp } from './auth.js';
import { loadQuestions, selectAnswer, nextQuestion } from './quiz.js';
import { loadAdaptiveQuiz } from './quiz.js';
import { supabase} from './supabase.js';
import { initQuizSettings } from "./quizSettings.js";
import { checkExamAccess } from "./subscription.js";
import { getUserExams } from "./subscription.js";




window.addEventListener("DOMContentLoaded", async () => {

    initQuizSettings();

    initAuthListener();
  
 const diagnosticsBtn = document.getElementById("diagnostics-btn");

// Check initial state
const { data: { user } } = await supabase.auth.getUser();

const cancelBtn = document.getElementById("cnclsub-btn");
const deleteBtn = document.getElementById("dltact-btn");

if (cancelBtn && deleteBtn) {
    if (user) {
        cancelBtn.style.display = "block";
        deleteBtn.style.display = "block";
    } else {
        cancelBtn.style.display = "none";
        deleteBtn.style.display = "none";
    }
}

diagnosticsBtn.style.display = "block"; // always visible

document
.getElementById("diagnostics-btn")
.addEventListener("click", async () => {

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Sign up to view your diagnostics.");
    return;
  }

  window.location.href = "diagnostics.html";
});
// ✅ Listen for login/logout changes
supabase.auth.onAuthStateChange((event, session) => {

if (cancelBtn && deleteBtn) {
    if (session?.user) {
        cancelBtn.style.display = "block";
        deleteBtn.style.display = "block";
    } else {
        cancelBtn.style.display = "none";
        deleteBtn.style.display = "none";
    }
}

    if (session?.user) {
        diagnosticsBtn.style.display = "block";
    } else {
        diagnosticsBtn.style.display = "none";
    }

});   


const feedbackBtn = document.getElementById("feedback-btn");

if (feedbackBtn) {
  feedbackBtn.addEventListener("click", () => {
    window.location.href = "/feedback.html";
  });
}

const upgradeBtn = document.getElementById("upgrade-btn");

if (upgradeBtn) {

    const exams = await getUserExams(); // you already have this

    if (exams.includes("ALL")) {
        upgradeBtn.style.display = "none"; // already premium
    } else {
        upgradeBtn.style.display = "block";
    }

    upgradeBtn.addEventListener("click", () => {
        window.location.href = "/pricing.html";
    });
}


const examSelect = document.getElementById("exam-select");
  // Diagnostics quiz elements;
const select = document.getElementById("time-select");
const message = document.getElementById("message");
document.getElementById("adaptive-quiz-btn")
    .addEventListener("click", async () => {

        const selectedExam = examSelect.value;

        if (!selectedExam) {
            message.textContent = "Please select an exam.";
            return;
        }

        // 🔒 PAYWALL CHECK (FIX)
       const { data: { user } } = await supabase.auth.getUser();

if (!user) {
    message.textContent = "Create a free account to start.";
    return;
}

const hasAccess = await checkExamAccess(selectedExam);

if (!hasAccess) {
    message.textContent = "🔒 Upgrade to unlock adaptive quizzes.";
    return;
}

        // Clear old messages
        message.textContent = "";

        const success = await loadAdaptiveQuiz(selectedExam);

        if (!success) {
            message.textContent =
                "Not enough diagnostic data yet for adaptive quiz.";
        }
    });

    async function updateAdaptiveButton() {
    const exam = document.getElementById("exam-select").value;
    const btn = document.getElementById("adaptive-quiz-btn");

    if (!exam || !btn) return;

    const hasAccess = await checkExamAccess(exam);

    if (!hasAccess) {
        btn.textContent = "Adaptive Quiz 🔒";
        btn.style.opacity = "0.6";
    } else {
        btn.textContent = "Take Adaptive Quiz";
        btn.style.opacity = "1";
    }
}
examSelect.addEventListener("change", updateAdaptiveButton);
    document.getElementById("login-btn")
        .addEventListener("click", login);

    document.getElementById("logout-btn")
        .addEventListener("click", logout);

    document.getElementById("signup-btn")
        .addEventListener("click", signUp);

    /* ============================= */
    /* ANSWER BUTTONS */
    /* ============================= */

    document.getElementById("choice-a")
        .addEventListener("click", () => selectAnswer("A"));

    document.getElementById("choice-b")
        .addEventListener("click", () => selectAnswer("B"));

    document.getElementById("choice-c")
        .addEventListener("click", () => selectAnswer("C"));

    document.getElementById("choice-d")
        .addEventListener("click", () => selectAnswer("D"));
        document.getElementById("grid-submit")
    .addEventListener("click", () => {

        const value =
            document.getElementById("grid-input").value;

        selectAnswer(value);
});
document.getElementById("next-btn")
    .addEventListener("click", nextQuestion);
    /* ============================= */
    /* DYNAMIC UNIT SYSTEM */
    /* ============================= */
});

