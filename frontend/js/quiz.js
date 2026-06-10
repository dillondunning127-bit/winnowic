import { supabase } from "./supabase.js";
import { calculateExamReadiness } from "./diagnostics.js";
import { checkExamAccess } from "./subscription.js";
import { getExamArrayValue } from "./diagnostics.js";
import { maybeCreateSnapshot } from "./diagnostics.js";
import { updateUserStats } from "./diagnostics.js";
// In quiz.js — add at top
import { startSession, endSession } from './sessions.js';
import { getDailyBatch, markBatchComplete } from './dailyBatch.js';
getDailyBatch('SAT_MATH').then(console.log);
let usedQuestionIds = new Set();
let allQuizQuestions = [];
let answerResults = [];
let currentQuestionIndex = 0;
let score = 0;
let currentQuestions = [];
let userAnswers = {};
let flaggedQuestions = new Set();
let quizSubmitted = false;
let shuffledQuestionData = {};
let totalQuestions = 0;
let sectionQuestionCount = 0;
let sectionQuestionsLoaded = 0;
let isAdaptiveMode = false;
let examSections = [];
let currentSectionIndex = 0;
let questionsInCurrentSection = 0;
let remainingQuestions = 0;
let exam = null;
let unit = null;
let isTransitioning = false;
let quizConfig = {
    mode: "normal",
    exam: null,
    unit: null,
    length: null
};
let answeredQuestions = new Set();
let sectionStartIndex = 0;
let reviewMode = false;
let currentSessionId = null;
import { stopTimer } from "./quizSettings.js";

export async function startQuiz(mode, externalConfig = null) {
    
quizConfig = {
    mode: null,
    exam: null,
    unit: null,
    length: null
};
   
  console.log("ENTRY:", mode, externalConfig);
    resetQuizState();
showQuizControls();
 let exam;

if (mode === "diagnostic") {
    exam = externalConfig?.exam;
} else {
    exam = externalConfig?.exam || document.getElementById("exam-select")?.value;
}
const unit = externalConfig?.unit ?? document.getElementById("unit-select")?.value;
let length;

if (mode === "diagnostic") {
    length = 20;
} else {
    length = externalConfig?.quizLength ?? parseInt(document.getElementById("time-select")?.value);
}

// 🔥 HARD FIX: prevent NaN EVER
if (!length || isNaN(length)) {
    length = 20;
}

    if (!exam) {
        console.warn("No exam selected");
        return;
    }

    // 🔥 STORE CONFIG GLOBALLY
    quizConfig = {
        mode,
        exam,
        unit,
        length
    };
    await startSession(quizConfig.exam, mode);
console.log("QUIZ CONFIG:", quizConfig);
    if (mode === "adaptive") {
        return startAdaptiveFlow();
    }

    if (mode === "diagnostic") {
        return startDiagnosticFlow();
    }
if (mode === "daily_batch") return startBatchFlow();
    return startNormalFlow();
}

async function startNormalFlow() {
    isAdaptiveMode = false;

   exam = quizConfig.examForSections || quizConfig.exam;
    unit = quizConfig.unit;
    
        examSections = await loadExamSections(
    exam,
    Number(quizConfig.length) // ✅ FORCE NUMBER
    );
console.log("Loading sections for:", exam, quizConfig.length);
    if (!examSections.length) {
        console.error("No sections found");
        return;
    }

    totalQuestions = examSections.reduce(
        (sum, s) => sum + s.question_count,
        0
    );

    currentSectionIndex = 0;
    sectionQuestionsLoaded = 0;

    startSectionTimer(examSections[0].section_time_seconds);

    await loadQuestions(
    quizConfig.examForQuestions || exam,
    unit,
    quizConfig.length
);
    
}

async function startDiagnosticFlow() {
    sessionStorage.setItem("diagnosticMode", "true");
sessionStorage.setItem("diagnosticExam", quizConfig.exam);
    quizConfig.unit = null;
    quizConfig.length = 20;
    quizConfig.mode = "diagnostic";
const originalExam = quizConfig.exam;

sessionStorage.setItem("diagnosticMode", "true");
sessionStorage.setItem("diagnosticExam", originalExam);

quizConfig.mode = "diagnostic";
quizConfig.length = 20;

// DO NOT override exam for questions
quizConfig.examForSections = "DIAGNOSTIC_EXAM";
quizConfig.examForQuestions = originalExam;

    // 🔥 HARD GUARD
    if (!quizConfig.length || isNaN(quizConfig.length)) {
        quizConfig.length = 20;
    }

    return startNormalFlow();
}

async function startBatchFlow() {
    isAdaptiveMode = false;
 
    const exam = quizConfig.exam;
 
    // ── 1. Get or generate today's batch ──
    const batch = await getDailyBatch(exam);
 
    if (!batch || !batch.question_ids || batch.question_ids.length === 0) {
        console.error("startBatchFlow: no batch available for", exam);
        document.getElementById("message").textContent =
            "No daily batch available. Try selecting an exam first.";
        return;
    }
 
    // Store batch ID on quizConfig so finalizeQuizData can mark it complete
    quizConfig.batchId = batch.id;
 
    // ── 2. Fetch full question objects by ID array ──
    // Uses .in() — bypasses exam/unit/section filters entirely
    const { data, error } = await supabase
        .from("questions")
        .select("*")
        .in("id", batch.question_ids)
        .eq("is_active", true);
 
    if (error || !data || data.length === 0) {
        console.error("startBatchFlow: question fetch failed", error);
        document.getElementById("message").textContent =
            "Could not load today's questions. Please try again.";
        return;
    }
 
    // ── 3. Preserve the batch order (getDailyBatch stores IDs in priority order) ──
    const questionMap = Object.fromEntries(data.map(q => [q.id, q]));
    const ordered = batch.question_ids
        .map(id => questionMap[id])
        .filter(Boolean); // drop any IDs that no longer exist in questions table
 
    // ── 4. Set globals directly (same pattern as end of loadQuestions) ──
    ordered.forEach(q => {
        q.sectionIndex = 0; // batch has no sections
        usedQuestionIds.add(q.id);
    });
 
    currentQuestions      = ordered;
    allQuizQuestions      = [...ordered]; // fresh — batch is its own quiz
    currentQuestionIndex  = 0;
    totalQuestions        = ordered.length;
 
    // ── 5. Show quiz UI (same as loadQuestions does) ──
    const questionCard = document.getElementById("question-card");
    if (questionCard) questionCard.style.display = "block";
 
    document.getElementById("progress-bar").style.width = "0%";
    document.getElementById("progress-container").textContent = "";
    document.getElementById("explanation").textContent = "";
 
    // Hide timer — daily batch is untimed
    const timerDisplay = document.getElementById("timerDisplay");
    if (timerDisplay) timerDisplay.style.display = "none";
 
    renderQuestionPalette();
    showQuestion();
}

async function startAdaptiveFlow() {
    isAdaptiveMode = true;

    exam = quizConfig.exam;
    unit = null;

    examSections = await loadExamSections(
        exam,
        Number(quizConfig.length)
    );

    if (!examSections.length) {
        console.error("No sections found for adaptive");
        return;
    }

    totalQuestions = examSections.reduce(
        (sum, s) => sum + s.question_count,
        0
    );

    currentSectionIndex = 0;
    sectionQuestionsLoaded = 0;

    startSectionTimer(examSections[0].section_time_seconds);

    return loadAdaptiveQuestionsForSection();
}


export function resetQuizState() {
    reviewMode = false;
    isTransitioning = false;
    const overlay = document.getElementById("section-transition");
if (overlay) overlay.style.display = "none";
allQuizQuestions = [];
userAnswers = {};
flaggedQuestions = new Set();
quizSubmitted = false;
shuffledQuestionData = {};
answerResults = [];
score = 0;
answeredQuestions = new Set();
flaggedQuestions = new Set();
userAnswers = {};
const palette = document.getElementById("question-palette");
if (palette) palette.innerHTML = "";


    // HARD RESET EVERYTHING (no conditional safety nonsense)
    usedQuestionIds = new Set();
quizConfig.examForSections = null;
quizConfig.examForQuestions = null;
    currentQuestions = [];
    currentQuestionIndex = 0;
    currentSectionIndex = 0;

    remainingQuestions = 0;

    sessionStorage.removeItem("diagnosticResults");
    sessionStorage.removeItem("diagnosticExam");
    sessionStorage.removeItem("diagnosticMode");
}

function startSectionTimer(seconds) {

  const timerToggle =
    document.getElementById("timerToggle");

  if (!timerToggle || !timerToggle.checked) return;

  const event = new CustomEvent("startTimer", {
    detail: { seconds }
  });

  document.dispatchEvent(event);

  
}

/* ============================= */
/* LOAD QUESTIONS */
/* ============================= */

export async function loadExamSections(exam, quizLength) {


  const { data, error } = await supabase
    .from("exam_sections")
    .select("*")
    .eq("exam", exam)
    .eq("quiz_length", quizLength)
    .order("section_order");

  if (error) {
    console.error("Error loading exam sections:", error);
    return [];
  }

  return data;

}
 
function isQuestionInCurrentSection(index) {
    return true; // temporary placeholder we will refine
}

export function goToNextSection() {

  currentSectionIndex++;
sectionStartIndex = currentQuestions.length;
  if (currentSectionIndex >= examSections.length) {
    finishQuiz();
    return;
  }

  const nextSection = examSections[currentSectionIndex];
sectionQuestionsLoaded = 0;
currentQuestionIndex = 0;
  showSectionTransition(nextSection, async () => {
  currentQuestionIndex = 0;

  if (isAdaptiveMode) {
    await loadAdaptiveQuestionsForSection();
  } else {
    await loadQuestions(exam, unit);
  }
});

answeredQuestions = new Set();
flaggedQuestions = new Set();
renderQuestionPalette();
renderQuestionNav();
}

export function showSectionTransition(section, onContinue) {

  isTransitioning = true;
answeredQuestions = new Set();
flaggedQuestions = new Set();
  const overlay = document.getElementById("section-transition");
  const text = document.getElementById("transition-text");
  const btn = document.getElementById("transition-continue");
currentQuestionIndex = 0;   // 🔥 ADD THIS
  let message;

  // SAT CUSTOM LOGIC
  if (exam === "SAT_MATH") {
    const sectionNumber = currentSectionIndex + 1;

    if (sectionNumber === 2) {
      message = "Finished SAT Math Section 1. Starting Section 2.";
    } else {
      message = "Starting SAT Math Section 1.";
    }
  } else {
    message = section.calculator_allowed
      ? "Calculator section starting. Please take out your calculator."
      : "No-calculator section starting.";
  }

  text.textContent = message;

  // ✅ SHOW OVERLAY HERE (AFTER DEFINITION)
  overlay.style.display = "flex";

  let continued = false;

  function proceed() {
    currentQuestions = [];
renderQuestionPalette();
renderQuestionNav();
    if (continued) return;
    continued = true;

    overlay.style.display = "none";

    isTransitioning = false;

    questionsInCurrentSection = section.question_count;
    startSectionTimer(section.section_time_seconds);
updateNextButtonState();
    if (onContinue) onContinue();
  }

  btn.onclick = proceed;
  setTimeout(proceed, 5000);
}

export async function loadQuestions(exam, unit, quizLength = null) {
 const questionCard = document.getElementById("question-card");
 renderQuestionPalette();
  if (questionCard) questionCard.style.display = "block";
    if (!examSections || examSections.length === 0) {
        console.error("No sections configured for this exam.");  ///line 274 
        return false;
    }

    

    document.getElementById("progress-bar").style.width = "0%";
    document.getElementById("progress-container").textContent = "";

    document.getElementById("explanation").textContent = "";
   

    const section = examSections[currentSectionIndex];

    let query = supabase
        .from("questions")
        .select("*")
        .eq("calculator_allowed", section.calculator_allowed)
        .eq("is_active", true);

    if (exam === "AP_CALC_AB") {
        query = query.contains("exams", ["CALC_AB"]);
    } else if (exam === "AP_CALC_BC") {
        query = query.contains("exams", ["CALC_BC"]);
    } else {
        query = query.contains("exams", [exam]);
    }

    // Only filter by unit IF one is selected
    if (unit) {
        query = query.eq("unit", unit);
    }

    const hasAccess = await checkExamAccess(exam);
   const isLoggedIn = (await supabase.auth.getUser()).data.user !== null;

    if (isLoggedIn && !hasAccess) {
        query = query.eq("simulation_eligible", true);
    }

    const { data, error } = await query;

    if (error) {
        console.error(error);
        return false;
    }

    if (!data || data.length === 0) {
        console.error("No questions returned from query");
        return false;
    }

    // remove already used questions
    const pool = data.filter(q => !usedQuestionIds.has(q.id));

    if (pool.length === 0) {
        console.error("No unused questions available");
        return false;
    }

    const shuffled = pool.sort(() => Math.random() - 0.5);

 const isDiagnosticMode = quizConfig.mode === "diagnostic";

    let selectedQuestions = [];

    // =========================
    // 🔥 DIAGNOSTIC MODE (GUARANTEE ALL UNITS)
    // =========================
   if (quizConfig.mode === "diagnostic") {

        const byUnit = {};

        for (let q of shuffled) {
            if (!byUnit[q.unit]) byUnit[q.unit] = [];
            byUnit[q.unit].push(q);
        }

        const used = new Set();

        // guarantee 1 per unit
        for (let unit in byUnit) {
            const q = byUnit[unit][0]; // already shuffled → safe pick
            selectedQuestions.push(q);
            used.add(q.id);
        }

        // fill remaining slots
        const remainingPool = shuffled.filter(q => !used.has(q.id));

        const limit = section.question_count;

        while (
            selectedQuestions.length < limit &&
            remainingPool.length > 0
        ) {
            const q = remainingPool.splice(
                Math.floor(Math.random() * remainingPool.length),
                1
            )[0];

            selectedQuestions.push(q);
        }
    }

    // =========================
    // NORMAL MODE
    // =========================
    else {

        const limit = section.question_count;

        selectedQuestions = shuffled.slice(0, limit);
    }

    // track used ids
    selectedQuestions.forEach(q => usedQuestionIds.add(q.id));

    // update globals
    selectedQuestions.forEach(q => {
    q.sectionIndex = currentSectionIndex;
});
    currentQuestions = selectedQuestions;
    allQuizQuestions.push(...selectedQuestions);
    currentQuestionIndex = 0;

    showQuestion();

    return true;
}

function updateProgress() {
    const percent =
        ((currentQuestionIndex + 1) / currentQuestions.length) * 100;

   const bar = document.getElementById("progress-bar");

bar.style.transition = "width 0.3s ease";
bar.style.width = percent + "%";

    document.getElementById("progress-container").textContent =
        `${currentQuestionIndex + 1} / ${currentQuestions.length}`;
}
/* ============================= */
/* SHOW QUESTION */
/* ============================= */

function shuffleAnswers(questionObj) {

    const answers = [
        { letter: "A", text: questionObj.choice_a },
        { letter: "B", text: questionObj.choice_b },
        { letter: "C", text: questionObj.choice_c },
        { letter: "D", text: questionObj.choice_d }
    ];

    // Fisher-Yates shuffle
    for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    // Track where the correct answer moved
    const correctLetter = questionObj.correctanswer;

    let newCorrectIndex = answers.findIndex(a => a.letter === correctLetter);


    return answers;
}

function prepareQuestion(questionObj) {

    if (shuffledQuestionData[questionObj.id]) {
        return shuffledQuestionData[questionObj.id];
    }

    const answers = [
        { letter: "A", text: questionObj.choice_a },
        { letter: "B", text: questionObj.choice_b },
        { letter: "C", text: questionObj.choice_c },
        { letter: "D", text: questionObj.choice_d }
    ];

    for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    const correctOriginal = questionObj.correctanswer;

    const correctIndex =
        answers.findIndex(a => a.letter === correctOriginal);

    const prepared = {
        shuffledAnswers: answers,
        correctLetter: ["A","B","C","D"][correctIndex]
    };

    shuffledQuestionData[questionObj.id] = prepared;

    return prepared;
}

function renderExplanation(questionObj) {
    const box = document.getElementById("explanation");
    if (!box) return;

    if (!reviewMode) {
        box.textContent = "";
        return;
    }

    box.innerHTML = `
        <div class="explanation-box">
            ${questionObj.explanation || "No explanation available."}
        </div>
    `;
}

function showQuestion() {
    
const reportBtn = document.getElementById("report-btn");
if (reportBtn) reportBtn.style.display = "inline-flex";
  

    const questionObj = currentQuestions[currentQuestionIndex];
window.currentQuestionId = questionObj.id;
    if (!questionObj) {
        showFinalScore();
        return;
    }

    updateProgress();

   ["choice-a","choice-b","choice-c","choice-d"].forEach(id => {
    const btn = document.getElementById(id);

    btn.style.display = "block";

    // RESET ALL VISUAL STATES
    btn.classList.remove("choice-selected");
    btn.style.opacity = "1";
    btn.style.transform = "scale(1)";

    btn.disabled = false;
});
if (questionObj && !shuffledQuestionData[questionObj.id]) {
    console.warn("Forcing prepareQuestion fallback:", questionObj.id);
    prepareQuestion(questionObj);
}
    // IMAGE SUPPORT
    const imageContainer = document.getElementById("question-image-container");
    const imageElement = document.getElementById("question-image");

    if (questionObj.image_url) {
        imageElement.src = questionObj.image_url;
        imageContainer.style.display = "block";
    } else {
        imageContainer.style.display = "none";
    }

    // QUESTION TEXT
    document.getElementById("question").textContent =
        questionObj.question;

    const gridContainer = document.getElementById("grid-container");
    const gridInput = document.getElementById("grid-input");

    if (questionObj.question_format === "GRID") {

    ["choice-a","choice-b","choice-c","choice-d"]
    .forEach(id => {
        document.getElementById(id).style.display="none";
    });

    gridContainer.style.display = "block";
gridInput.disabled = false;
document.getElementById("grid-submit").disabled = false;
    gridInput.value = "";
    gridInput.style.border = ""; // reset border
    document.getElementById("grid-result").textContent = ""; // reset checkmark

    } else {

        gridContainer.style.display = "none";

        const prepared = prepareQuestion(questionObj);
const shuffled = prepared.shuffledAnswers;

document.getElementById("choice-a").textContent = shuffled[0].text;
document.getElementById("choice-b").textContent = shuffled[1].text;
document.getElementById("choice-c").textContent = shuffled[2].text;
document.getElementById("choice-d").textContent = shuffled[3].text;

    }
 renderSavedAnswer();
renderExplanation(questionObj);
renderQuestionNav();
renderQuestionPalette();
updateNextButtonState();
syncFlagButton();
}

function renderQuestionPalette() {
    
    const palette = document.getElementById("question-palette");
    if (!palette) return;

    palette.innerHTML = "";

    currentQuestions
    .filter(q => q.sectionIndex === currentSectionIndex)
    .forEach((q, index) => {

        const btn = document.createElement("button");
        
        btn.classList.add("palette-btn");
        btn.classList.remove(
    "palette-current",
    "palette-answered",
    "palette-flagged",
    "palette-wrong"
);
btn.style.backgroundColor = "";
btn.style.borderColor = "";
btn.style.color = "";
        btn.textContent = index + 1;

        const userAnswer = userAnswers[q.id];
        const prepared = shuffledQuestionData[q.id];

        if (reviewMode) {
            let correct;

if (q.question_format === "GRID") {
    correct = String(q.correct_numeric_answer).trim();
} else {
    correct = prepared.correctLetter;
}

            if (!userAnswer) {
                btn.style.backgroundColor = "#9ca3af"; // gray unanswered
            } else if (String(userAnswer).trim() === correct) {
                btn.classList.add("palette-answered"); // green correct
            } else {
                btn.classList.add("palette-wrong"); // red wrong
            }
        } else {

          
           // CURRENT always wins
if (index === currentQuestionIndex) {
    btn.classList.add("palette-current");
}

// FLAGGED overrides answered
else if (flaggedQuestions.has(index)) {
    btn.classList.add("palette-flagged");
}

else if (answeredQuestions.has(index)) {
    btn.classList.add("palette-answered");
}
        }

        btn.addEventListener("click", () => {
            currentQuestionIndex = index;
            showQuestion();
            updateNextButtonState();
        });

        palette.appendChild(btn);
    });
}

export function toggleFlag() {

    if (flaggedQuestions.has(currentQuestionIndex)) {
        flaggedQuestions.delete(currentQuestionIndex);
    } else {
        flaggedQuestions.add(currentQuestionIndex);
    }
    document.getElementById("flag-btn")
    .classList.toggle(
        "flagged",
        flaggedQuestions.has(currentQuestionIndex)
    );
renderQuestionPalette();
    renderQuestionNav();
}

function syncFlagButton() {
    const btn = document.getElementById("flag-btn");
    if (!btn) return;

    btn.classList.toggle(
        "flagged",
        flaggedQuestions.has(currentQuestionIndex)
    );
}

function renderQuestionNav() {

    const container =
        document.getElementById("question-nav-grid");

    if (!container) return;

    container.innerHTML = "";

    currentQuestions.forEach((q, index) => {

        const btn = document.createElement("button");

        btn.textContent = index + 1;

        if (userAnswers[q.id] !== undefined) {
            btn.style.backgroundColor = "#3b82f6";
        }

        if (flaggedQuestions.has(index)) {
            btn.style.border = "3px solid orange";
        }

        if (index === currentQuestionIndex) {
            btn.style.transform = "scale(1.1)";
        }
btn.classList.remove(
    "palette-current",
    "palette-answered",
    "palette-flagged",
    "palette-wrong"
);
btn.onclick = () => {
    if (reviewMode) {
        showQuestion(); // reuse main renderer safely
    } else {
        goToQuestion(index);
    }
};
        container.appendChild(btn);
    });
}

function showReviewQuestion(index) {
    const q = questions[index];

    const card = document.getElementById("question-card");

    let explanationHTML = "";

    if (reviewMode) {
        explanationHTML = `
            <div class="review-explanation">
                ${q.explanation || ""}
            </div>
        `;
    }

    card.innerHTML = `
        <div class="review-question">${q.question}</div>

        <div class="answers-grid">
            ${renderChoices(q, index)}
        </div>

        ${explanationHTML}
    `;
}

export function goToQuestion(index) {

    if (index < 0) return;
    if (index >= currentQuestions.length) return;

    const targetQuestion = currentQuestions[index];

    if (!targetQuestion) return;

    // ONLY allow current section navigation
    if (targetQuestion.sectionIndex !== currentSectionIndex) {
        return; // BLOCK CROSS SECTION ACCESS
    }

    
  currentQuestionIndex = index;
showQuestion();
updateNextButtonState();
syncFlagButton();
}

function renderSavedAnswer() {
    const questionObj = currentQuestions[currentQuestionIndex];
    const saved = userAnswers[questionObj.id];
    const prepared = shuffledQuestionData[questionObj.id];

    const buttonMap = {
        A: "choice-a",
        B: "choice-b",
        C: "choice-c",
        D: "choice-d"
    };

    // RESET
["choice-a","choice-b","choice-c","choice-d"].forEach(id => {

    const btn = document.getElementById(id);

    btn.style.backgroundColor = "";
    btn.style.border = "";
    btn.style.boxShadow = "";
    btn.style.color = "";
    btn.style.opacity = "1";

    btn.disabled = false;
});

    // GRID MODE
    if (questionObj.question_format === "GRID") {

        const input = document.getElementById("grid-input");
        const result = document.getElementById("grid-result");

        if (!saved) return;

        if (reviewMode) {
            const correct = String(questionObj.correct_numeric_answer).trim();
const userValue = String(saved).trim();

           if (userValue === correct) {

    input.style.border = "2px solid green";
    input.style.color = "green";

    input.value = `"${correct}" is Correct`;

} else {

    input.style.border = "2px solid red";
    input.style.color = "red";

    input.value = `You answered "${userValue}" | Correct: "${correct}"`;
}
        }

        return;
    }

    // MULTIPLE CHOICE

    if (!saved || !prepared) return;

    const correct = prepared.correctLetter;

    const correctBtn = document.getElementById(buttonMap[correct]);
    const selectedBtn = document.getElementById(buttonMap[saved]);

    if (reviewMode) {

["choice-a","choice-b","choice-c","choice-d"].forEach(id => {
    document.getElementById(id).disabled = true;
});

const gridInput = document.getElementById("grid-input");
const gridSubmit = document.getElementById("grid-submit");

if (gridInput) gridInput.disabled = true;
if (gridSubmit) gridSubmit.disabled = true;

    // reset styles first

    const allBtns = document.querySelectorAll("#choice-a,#choice-b,#choice-c,#choice-d");
allBtns.forEach(btn => {
    btn.style = "";
});

    const correct = prepared.correctLetter;

    // ALWAYS show correct answer (green)
    if (correctBtn) {
        correctBtn.style.backgroundColor = "rgba(34, 197, 94, 0.18)";
        correctBtn.style.border = "1px solid rgba(34, 197, 94, 0.6)";
        correctBtn.style.boxShadow = "0 0 12px rgba(34, 197, 94, 0.35)";
        correctBtn.style.color = "#2e7d32";
    }

    // WRONG selection (red overlay)
    if (saved !== correct && selectedBtn) {
        selectedBtn.style.backgroundColor = "rgba(239, 68, 68, 0.18)";
        selectedBtn.style.border = "1px solid rgba(239, 68, 68, 0.6)";
        selectedBtn.style.boxShadow = "0 0 12px rgba(239, 68, 68, 0.35)";
        selectedBtn.style.color = "#b91c1c";
    }

    return;
}

    // NORMAL MODE (existing behavior)
    if (selectedBtn) {
        selectedBtn.style.backgroundColor = "rgba(59,130,246,0.15)";
selectedBtn.style.border = "1px solid rgba(59,130,246,0.6)";
selectedBtn.style.boxShadow = "0 0 12px rgba(59,130,246,0.35)";
selectedBtn.style.color = "#1d4ed8";
    }
}

export async function nextQuestion() {
    if (isTransitioning) return;

    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex += 1;
        showQuestion();
        updateNextButtonState();
    }
}

function showQuizControls() {

    const ids = [
        "prev-btn",
        "next-nav-btn",
        "flag-btn",
        "report-btn"
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "";
    });

    const nav = document.querySelector(".question-nav-controls");
    if (nav) nav.style.display = "flex";
}

function hideQuizControls() {
    const ids = [
        "prev-btn",
        "next-nav-btn",
        "flag-btn",
        "report-btn"
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    const nav = document.querySelector(".question-nav-controls");
    if (nav) nav.style.display = "none";
}

export function checkSectionCompletion() {

    const unanswered = [];

    currentQuestions.forEach((q, index) => {
        if (userAnswers[index] === undefined) {
            unanswered.push(index + 1);
        }
    });

    // unanswered questions remain
    if (unanswered.length > 0) {

        const proceed = confirm(
            `You still have ${unanswered.length} unanswered question(s).\n\nSubmit anyway?`
        );

        if (!proceed) return;
    }

    completeCurrentSection();
}

async function completeCurrentSection() {

    currentSectionIndex++;

    // ALL SECTIONS COMPLETE
    if (currentSectionIndex >= examSections.length) {

       await gradeQuiz();
reviewMode = true;

renderQuestionPalette();
renderQuestionNav();
showQuestion();

await finalizeQuizData();

showFinalScore();
        return;
    }

    // NEXT SECTION
    const nextSection = examSections[currentSectionIndex];

    currentQuestionIndex = 0;
    sectionQuestionsLoaded = 0;

    showSectionTransition(nextSection, async () => {

        if (isAdaptiveMode) {
            await loadAdaptiveQuestionsForSection();
        } else {
            await loadQuestions(exam, unit);
        }
    });
    answeredQuestions = new Set();
flaggedQuestions = new Set();
renderQuestionPalette();
renderQuestionNav();
}

async function gradeQuiz() {
reviewMode = true;
renderQuestionPalette();
renderQuestionNav();
showQuestion();
    score = 0;
    answerResults = [];

    allQuizQuestions.forEach((questionObj, index) => {

       const prepared = shuffledQuestionData[questionObj.id];

if (!prepared) {
    console.error("Missing prepared question:", questionObj.id);
    return;
}

let correctAnswer;

if (questionObj.question_format === "GRID") {
    correctAnswer = String(questionObj.correct_numeric_answer).trim();
} else {
    correctAnswer = prepared.correctLetter;
}

       const userAnswer =
    userAnswers[questionObj.id];

       const isCorrect =
    String(userAnswer).trim() === correctAnswer;

        if (isCorrect) {
            score++;
        }

        answerResults.push({
            question_id: questionObj.id,
            unit: questionObj.unit,
            correct: isCorrect,
            user_answer: userAnswer,
            correct_answer: correctAnswer
        });
    });
}

async function finalizeQuizData() {

    console.log(
        "AUTH CHECK:",
        await supabase.auth.getSession()
    );

    const { data: { user } } =
        await supabase.auth.getUser();

    console.log("USER INSIDE FINALIZE:", user);

    if (!user) {
        console.error("NO USER IN FINALIZE");
        return;
    }

    if (!user) return;

    // =========================
    // SAVE QUESTION ATTEMPTS
    // =========================

    const topicAttempts = answerResults.map(r => ({

        user_id: user.id,

        question_id: r.question_id,

        unit: r.unit,

        is_correct: r.correct,

        exams: [getExamArrayValue(quizConfig.exam)]

    }));

    if (topicAttempts.length > 0) {
console.log("TOPIC ATTEMPTS INSERT:", topicAttempts);
        await supabase
            .from("topic_attempts")
            .insert(topicAttempts);
    }

     if (quizConfig.mode === "daily_batch" && quizConfig.batchId) { 
        await markBatchComplete(quizConfig.batchId, answerResults.length);
 }

    // =========================
    // UPDATE AGGREGATED STATS
    // =========================

    for (const result of answerResults) {

        await updateUserStats(
    user,
    quizConfig.exam,
    result.correct
);
    }

    // =========================
    // CREATE SNAPSHOT
    // =========================

    await maybeCreateSnapshot({
    user,
    exam: quizConfig.exam,
    unit: quizConfig.unit
});
console.log("FINALIZE USER CHECK:", user);
}

function updateNextButtonState() {
    const prevBtn = document.getElementById("prev-btn");

    if (prevBtn) {
        if (currentQuestionIndex === 0 && !reviewMode) {
            prevBtn.style.display = "none";
        } else {
            prevBtn.style.display = "";
        }
    }

    const nextBtn = document.getElementById("next-nav-btn");
    if (!nextBtn) return;

    const isLastQuestion = currentQuestionIndex >= currentQuestions.length - 1;

    // ── Daily batch has no sections — just submit at the end ──
    if (quizConfig.mode === "daily_batch") {
        if (!isLastQuestion) {
            nextBtn.textContent = "Next";
            nextBtn.onclick = nextQuestion;
        } else {
            nextBtn.textContent = "Submit Quiz";
            nextBtn.onclick = submitQuiz;
        }
        return;
    }

    // ── Normal / adaptive / diagnostic ──
    const isLastSection = currentSectionIndex === examSections.length - 1;

    if (!isLastQuestion) {
        nextBtn.textContent = "Next";
        nextBtn.onclick = nextQuestion;
        return;
    }

    if (!isLastSection) {
        nextBtn.textContent = "Proceed to Next Section";
        nextBtn.onclick = () => checkSectionCompletion();
        return;
    }

    nextBtn.textContent = "Submit Quiz";
    nextBtn.onclick = submitQuiz;
}

async function submitQuiz() {
reviewMode = true;
    if (quizSubmitted) return;
    quizSubmitted = true;

   await gradeQuiz();
reviewMode = true;

renderQuestionPalette();
renderQuestionNav();
showQuestion();

await finalizeQuizData();
hideQuizControls();
    await showFinalScore();
}

export async function selectAnswer(letter) {

answeredQuestions.add(currentQuestionIndex);

    if (isTransitioning) return;

    const questionObj = currentQuestions[currentQuestionIndex];

    if (!questionObj) return;

    userAnswers[questionObj.id] = letter;

    renderSavedAnswer();

renderQuestionPalette();

    renderQuestionNav();

    updateNextButtonState();
}


export async function loadHistory(userId) {

    const container = document.getElementById("history-container");

    // 🧠 NOT LOGGED IN → hide or show message and STOP
    if (!userId) {
        container.innerHTML = "<h3>Past Attempts</h3><p>Please log in to see your quiz history.</p>";
        return;
    }

    // 🧠 LOGGED IN → fetch history
    const { data, error } = await supabase
        .from("quiz_attempts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

    if (error) {
        console.error(error);
        container.innerHTML = "<h3>Past Attempts</h3><p>Error loading history.</p>";
        return;
    }

    // 🧹 clear container before rendering
    container.innerHTML = "<h3>Past Attempts</h3>";

    if (!data || data.length === 0) {
        container.innerHTML += "<p>No attempts yet.</p>";
        return;
    }

    data.forEach(attempt => {
        const div = document.createElement("div");
        div.textContent = `${attempt.score} / ${attempt.total}`;
        container.appendChild(div);
    });
}

/* ============================= */
/* FINAL SCORE */
/* ============================= */

async function showFinalScore() {
await endSession(answerResults.length);
const reportBtn = document.getElementById("report-btn");
if (reportBtn) reportBtn.style.display = "none";
const isDiagnosticMode = quizConfig.mode === "diagnostic";

if (quizConfig.mode === "daily_batch") {
    
    // Fetch current streak before rendering
    const { getBatchStreak } = await import('./dailyBatch.js');
    const { data: { user } } = await supabase.auth.getUser();
    const streak = user ? await getBatchStreak(user.id, quizConfig.exam) : 1;

    document.getElementById("question").innerHTML = `
        <div style="text-align:center; padding: 10px 0;">
            <div style="font-size:22px; font-weight:700; margin-bottom:6px;">
                Daily batch complete!
            </div>
            <div style="
                display:inline-flex;
                align-items:center;
                gap:6px;
                background:#FFF3E0;
                border-radius:20px;
                padding:6px 14px;
                font-size:14px;
                font-weight:600;
                color:#FF6B00;
                margin-bottom:16px;
            ">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="#FF6B00" stroke-width="2.5" stroke-linecap="round"
                     stroke-linejoin="round">
                  <path d="M12 2c0 0-4 4-4 8a4 4 0 0 0 8 0c0-1.5-.5-3-1-4
                           0 0 0 3-2 3s-2-2-2-3c0-2 1-4 1-4z"/>
                  <path d="M12 16c-2.5 0-5-1.5-5-5 0-2 1-3.5 2-4.5
                           .5 1.5 1.5 2.5 3 2.5s2.5-1 3-2.5c1 1 2 2.5 2 4.5
                           0 3.5-2.5 5-5 5z"/>
                </svg>
                ${streak} day streak
            </div>
            <div style="font-size:15px; color:#555; margin-bottom:20px;">
                ${score} / ${totalQuestions} correct —
                your next batch drops tomorrow.
            </div>
            <div style="text-align:center; margin-bottom:8px; display:flex; gap:10px; justify-content:center;">
    <button onclick="
        document.getElementById('question-card').style.display='none';
        document.getElementById('mode-selector-card').style.display='block';
        document.getElementById('settings-card').style.display='block';
    " class="btn-primary" style="padding:10px 24px; width:auto;">
        Keep Practicing
    </button>
    <button onclick="window.location.href='/diagnostics.html'"
        class="btn-secondary" style="padding:10px 24px; width:auto;">
        View Progress
    </button>
</div>
        </div>
    `;

    document.getElementById("prev-btn").style.display = "none";
    document.getElementById("next-nav-btn").style.display = "none";
    document.getElementById("explanation").textContent = "";
    document.getElementById("grid-container").style.display = "none";
    document.getElementById("question-image-container").style.display = "none";
    ["choice-a","choice-b","choice-c","choice-d"].forEach(id => {
        document.getElementById(id).style.display = "none";
    });
    stopTimer();
    await finalizeQuizData();
    return;
}

if (isDiagnosticMode) {

    const diagnosticData = answerResults;

    sessionStorage.setItem(
        "diagnosticResults",
        JSON.stringify(diagnosticData)
    );

    sessionStorage.setItem("diagnosticExam", quizConfig.exam);

    window.location.href = "/diagnostics.html?mode=mini";
    return;
}

    const total = totalQuestions;

    document.getElementById("question").textContent =
        `Quiz finished! Your score: ${score} / ${total}`;


document.getElementById("grid-container").style.display = "none";
document.getElementById("explanation").textContent = "";
document.getElementById("question-image-container").style.display = "none";
    ["choice-a", "choice-b", "choice-c", "choice-d"].forEach(id => {
    const btn = document.getElementById(id);
    btn.style.display = "none";
});

    document.getElementById("progress-container").textContent = `${total} / ${total}`;

document.getElementById("progress-bar").style.width = "100%";
document.getElementById("progress-container").textContent =
    `${totalQuestions} / ${totalQuestions}`;

stopTimer();

    // 🔹 Get logged in user
const { data: { user }, error: userError } = await supabase.auth.getUser();

if (!user || !user.id) {
    console.log("No valid user → skipping quiz_attempt insert");
    return;
}

   if (user) {
    await supabase.from("quiz_attempts").insert([
        {
            user_id: user.id,
            score: score,
            total: total
        }
    ]);
}

// always refresh UI (logged in OR not)
loadHistory(user?.id ?? null);
hideQuizControls();
const prevBtn = document.getElementById("prev-btn");

if (prevBtn) {
    prevBtn.style.display = "";
    prevBtn.onclick = () => {
        reviewMode = true;

        currentQuestionIndex =
            currentQuestions.length - 1;

        showQuestion();
    };
}
    // reset index so new quiz can start clean
    currentQuestionIndex = 0;
    score = 0;
    
}

//Load adaptive quiz!!

export async function loadAdaptiveQuiz(exam, quizLength = 10) {
    quizConfig.mode = "adaptive";
    if (!examSections || !examSections[currentSectionIndex]) {
  console.error("Missing section at index:", currentSectionIndex, examSections);
  return;
}
  const questionCard = document.getElementById("question-card");
  if (questionCard) questionCard.style.display = "block";
alert("adaptive quiz loading...");
  stopTimer();
  currentQuestionIndex = 0;
  score = 0;
  usedQuestionIds.clear();
  isAdaptiveMode = true;

    
 const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const examArrayValue = getExamArrayValue(exam);
  const hasAccess = await checkExamAccess(exam);

  const MIN_ATTEMPTS = 3;
  const MASTERY_MIN_ATTEMPTS = 12;
  const MASTERY_THRESHOLD = 0.85;

  // ==============================
  // 1. FETCH ALL STATS (ONE QUERY)
  // ==============================
  const { data: stats, error: statsError } = await supabase
    .from("topic_stats")
    .select("unit")
    .eq("user_id", user.id)
    .contains("exams", [examArrayValue]);

  if (statsError) {
    console.error("Stats error:", statsError);
}

if (!stats || stats.length === 0) {
    console.log("No diagnostic data → fallback to normal quiz");
}

  // ==============================
  // 2. FETCH ALL ATTEMPTS (ONE QUERY)
  // ==============================
  const { data: attempts, error: attemptsError } = await supabase
    .from("topic_attempts")
    .select("unit, is_correct")
    .eq("user_id", user.id)
    .contains("exams", [examArrayValue])
    .order("created_at", { ascending: false })
    .limit(500);

  if (attemptsError || !attempts) {
    console.log("No attempts data.");
    return false;
  }

  // ==============================
  // 3. BUILD UNIT PERFORMANCE MAP
  // ==============================
  const unitMap = {};

  for (let row of attempts) {
    if (!unitMap[row.unit]) {
      unitMap[row.unit] = { correct: 0, total: 0 };
    }
    unitMap[row.unit].total += 1;
    if (row.is_correct) unitMap[row.unit].correct += 1;
  }

  // ==============================
  // 4. COMPUTE WEAKNESS SCORES
  // ==============================
  let weakUnits = [];

  for (let unit of Object.keys(unitMap)) {
    const { correct, total } = unitMap[unit];

    if (total < MIN_ATTEMPTS) continue;

    const accuracy = correct / total;

    const mastered =
      total >= MASTERY_MIN_ATTEMPTS &&
      accuracy >= MASTERY_THRESHOLD;

    if (!mastered) {
      weakUnits.push({
        unit,
        accuracy,
        weakness: 1 - accuracy
      });
    }
  }

  if (weakUnits.length === 0) {
    console.log("All units mastered or insufficient data.");
    return false;
  }

  // Sort weakest first
  weakUnits.sort((a, b) => b.weakness - a.weakness);

  // ==============================
  // 5. FETCH QUESTIONS (ONE QUERY)
  // ==============================
  const { data: allQuestions, error: qError } = await supabase
    .from("questions")
    .select("*")
    .contains("exams", [examArrayValue]);

  if (qError || !allQuestions) {
    console.log("No questions found.");
    return false;
  }

  // ==============================
  // 6. FILTER ACCESS
  // ==============================
  let filteredQuestions = hasAccess
    ? allQuestions
    : allQuestions.filter(q => q.simulation_eligible);

  // Group questions by unit
  const questionsByUnit = {};
  for (let q of filteredQuestions) {
    if (!questionsByUnit[q.unit]) questionsByUnit[q.unit] = [];
    questionsByUnit[q.unit].push(q);
  }

  // ==============================
  // 7. BUILD QUIZ (REAL ADAPTIVE)
  // ==============================
  let selectedQuestions = [];
  let used = new Set();

  // STEP A: GUARANTEE 1 QUESTION PER WEAK UNIT
  for (let u of weakUnits) {
    const pool = questionsByUnit[u.unit];
    if (!pool || pool.length === 0) continue;

    const q = pool[Math.floor(Math.random() * pool.length)];
    if (q && !used.has(q.id)) {
      selectedQuestions.push(q);
      used.add(q.id);
    }
  }

  // STEP B: WEIGHTED FILL FOR REMAINING SLOTS
  const remainingPool = Object.values(questionsByUnit).flat();

  const slotsLeft = quizLength - selectedQuestions.length;

  for (let i = 0; i < slotsLeft; i++) {
    const q = remainingPool[Math.floor(Math.random() * remainingPool.length)];
    if (q && !used.has(q.id)) {
      selectedQuestions.push(q);
      used.add(q.id);
    }
  }

  // ==============================
  // 8. FINAL SAFETY CHECK
  // ==============================
  if (selectedQuestions.length === 0) {
    console.log("No adaptive questions generated.");
    return false;
  }



  currentQuestionIndex = 0;
  score = 0;

  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("progress-container").textContent = "";
  document.getElementById("explanation").textContent = "";


  ["choice-a", "choice-b", "choice-c", "choice-d"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });

  // RESET SECTION STATE
currentSectionIndex = 0;
sectionQuestionsLoaded = 0;
isAdaptiveMode = true;

// LOAD SECTIONS FIRST (same as normal mode)
examSections = await loadExamSections(
  examArrayValue,
  quizLength
);

// START FIRST SECTION WITH ADAPTIVE LOGIC
await loadAdaptiveQuestionsForSection();
if (!examSections || examSections.length === 0) {
  console.error("❌ No exam sections loaded - adaptive cannot start");
  return false;
}
  return true;
}

function animateQuestionChange() {
    const card = document.querySelector(".card");

    if (!card) return;

    card.style.opacity = "0.4";

    setTimeout(() => {
        card.style.opacity = "1";
    }, 150);
}

async function loadAdaptiveQuestionsForSection() {
  const section = examSections?.[currentSectionIndex];

if (!section) {
  console.error("Section missing");
  return;
}

  const examArrayValue = getExamArrayValue(quizConfig.exam);

  const { data: allQuestions } = await supabase
    .from("questions")
    .select("*")
    .eq("calculator_allowed", section.calculator_allowed)
    .contains("exams", [examArrayValue]);

  if (!allQuestions || allQuestions.length === 0) {
    console.log("No questions in section:", section);
    return false;
  }

  // =========================
  // ADAPTIVE FILTER INSIDE SECTION
  // =========================

  const filtered = allQuestions.filter(q =>
    quizConfig?.adaptiveMode === true
      ? applyAdaptiveWeighting(q)   // <-- your logic hook
      : true
  );

  // shuffle / select up to section.question_count
  const selectedQuestions = filtered
    .sort(() => Math.random() - 0.5)
    .slice(0, section.question_count);
selectedQuestions.forEach(q => {
    q.sectionIndex = currentSectionIndex;
});
  currentQuestions = selectedQuestions;
  allQuizQuestions.push(...selectedQuestions);
  currentQuestionIndex = 0;
  sectionQuestionsLoaded = 0;
resetQuestionUI();
  showQuestion();
}

function resetQuestionUI() {
  const questionCard = document.getElementById("question-card");
  if (questionCard) questionCard.style.display = "block";

  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("progress-container").textContent = "";

  document.getElementById("explanation").textContent = "";
  ["choice-a","choice-b","choice-c","choice-d"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });
}

export function getCurrentQuestionIndex() {
    return currentQuestionIndex;
}
