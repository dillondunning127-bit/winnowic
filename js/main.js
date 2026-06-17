import { initAuthListener, login, logout, signUp } from './auth.js';
import {
    loadQuestions,
    selectAnswer,
    nextQuestion,
    toggleFlag,
    goToQuestion,
    getCurrentQuestionIndex
} from './quiz.js';
import { supabase } from './supabase.js';
import { initQuizSettings } from "./quizSettings.js";
import { checkExamAccess, getUserExams } from "./subscription.js";
import { startQuiz } from "./quiz.js";
import {
    checkSectionCompletion
} from "./quiz.js";
import { renderGoalBanner } from './goals.js';
let currentMode = "normal";

import { getUserGoal, saveUserGoal, getDaysUntilTest } from './goals.js';
import { getDailyBatch } from './dailyBatch.js';
import { initQuizBanner } from './quizBanner.js';


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
const modeDaily = document.getElementById("mode-daily");

modeNormal.addEventListener("click", () => setMode("normal"));
modeAdaptive.addEventListener("click", () => setMode("adaptive"));
modeDiagnostic.addEventListener("click", () => setMode("diagnostic"));
modeDaily.addEventListener("click", () => setMode("daily_batch"));


// After user state loads:
async function initGoalBanner(user, exam) {
  const banner = document.getElementById('goal-banner');
  if (!banner || !user || !exam) return;

  banner.style.display = 'block';
  const goal = await getUserGoal(exam);

  if (goal) {
    const days = getDaysUntilTest(goal.test_date);
    document.getElementById('goal-display').innerHTML = `
      <strong>🎯 Goal:</strong> ${goal.exam.replace('_',' ')} — 
      Target: ${goal.target_score} &nbsp;|&nbsp; 
      <strong>${days} days until your test</strong>
      <button id="edit-goal-btn" class="btn-secondary" style="margin-left:12px;">Edit</button>
    `;
    document.getElementById('set-goal-btn').style.display = 'none';
    document.getElementById('edit-goal-btn')
      ?.addEventListener('click', () => {
        document.getElementById('goal-form').style.display = 'block';
      });
  } else {
    document.getElementById('set-goal-btn').style.display = 'block';
    document.getElementById('set-goal-btn')
      .addEventListener('click', () => {
        document.getElementById('goal-form').style.display = 'block';
      });
  }

  document.getElementById('save-goal-btn')
    ?.addEventListener('click', async () => {
      const date = document.getElementById('goal-date').value;
      const score = document.getElementById('goal-score').value;
      await saveUserGoal(exam, date, parseInt(score));
      initGoalBanner(user, exam); // refresh
      document.getElementById('goal-form').style.display = 'none';
    });
}


examSelect.addEventListener("change", async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && examSelect.value) {
        const { renderGoalBanner } = await import('./goals.js');
        renderGoalBanner(
            document.getElementById('goal-banner-card'),
            examSelect.value
        );
    }
});

examSelect.addEventListener('change', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && examSelect.value) {
        initQuizBanner(examSelect.value);
        renderGoalBanner(
            document.getElementById('goal-banner-card'),
            examSelect.value
        );
    }
});

// Call when exam changes:
examSelect.addEventListener('change', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  initGoalBanner(user, examSelect.value);
});


examSelect.addEventListener("change", () => {
    updateStartButtonState();
});

document.getElementById("prev-btn")
.addEventListener("click", () => {

    goToQuestion(getCurrentQuestionIndex() - 1); // line 48

});

document.getElementById("flag-btn")
.addEventListener("click", toggleFlag);


document.getElementById("mode-normal").addEventListener("click", () => {
    currentMode = "normal";
});

document.getElementById("mode-adaptive").addEventListener("click", () => {
    currentMode = "adaptive";
});

document.getElementById("mode-diagnostic").addEventListener("click", () => {
    currentMode = "diagnostic";
});

// Inside DOMContentLoaded in main.js
const params = new URLSearchParams(window.location.search);
const paramExam = params.get('exam');
const paramMode = params.get('mode');

if (paramExam) selectExamCard(paramExam);
if (paramMode) setMode(paramMode);

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
    modeDaily.classList.remove("active-mode");

    // highlight selected
    if (mode === "normal") modeNormal.classList.add("active-mode");
    if (mode === "adaptive") modeAdaptive.classList.add("active-mode");
    if (mode === "diagnostic") modeDiagnostic.classList.add("active-mode");
    if (mode === "daily_batch") modeDaily.classList.add("active-mode");

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

if (currentMode === "daily_batch") {
    timeSelect.style.display = "none";
    unitSelect.style.display = "none";
    timeLabel.style.display = "none";
    unitLabel.style.display = "none";
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

    /* ========================= */
/* HERO CTA SCROLL */
/* ========================= */

const heroStartBtn = document.getElementById("hero-start-btn");

if (heroStartBtn) {
  heroStartBtn.addEventListener("click", () => {
    window.location.href = '/quiz.html';
  });
}

/* ========================= */
/* SCROLL REVEAL ANIMATIONS */
/* ========================= */

const revealElements = document.querySelectorAll(".reveal-on-scroll");

const revealObserver = new IntersectionObserver(

  (entries) => {

    entries.forEach((entry) => {

      if (entry.isIntersecting) {

        entry.target.classList.add("reveal-visible");

      }

    });

  },

  {
    threshold: 0.12
  }

);

revealElements.forEach((el) => {
  revealObserver.observe(el);
});

/* ========================= */
/* ANIMATED STATS */
/* ========================= */

const statNumbers = document.querySelectorAll(".stat-number");

const statObserver = new IntersectionObserver(

  (entries) => {

    entries.forEach((entry) => {

      if (!entry.isIntersecting) return;

      const el = entry.target;

      const target = Number(el.dataset.target);

      let current = 0;

      const increment = target / 40;

      const updateCounter = () => {

        current += increment;

        if (current >= target) {

          el.textContent = target;

        } else {

          el.textContent = Math.floor(current);

          requestAnimationFrame(updateCounter);

        }

      };

      updateCounter();

      statObserver.unobserve(el);

    });

  },

  {
    threshold: 0.4
  }

);

statNumbers.forEach((stat) => {
  statObserver.observe(stat);
});

const floatingCTA = document.getElementById("floating-cta");
const quizSection = document.getElementById("quiz-section");

if (floatingCTA && quizSection) {
  floatingCTA.addEventListener("click", () => {
    window.location.href = '/quiz.html';
  });
}

document.getElementById("header-auth-btn").onclick = () => {
  window.location.href = "/auth.html?mode=signup";
};


if (user) {
    // If an exam is already selected (e.g. from a previous session),
    // init the banner immediately
    const exam = document.getElementById('exam-select')?.value;
    if (exam) initQuizBanner(exam);
}
});