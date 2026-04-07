import { supabase } from "./supabase.js";
import { calculateExamReadiness } from "./diagnostics.js";
import { checkExamAccess } from "./subscription.js";
import { getExamArrayValue } from "./diagnostics.js";
let usedQuestionIds = new Set();
let answerResults = [];
let currentQuestionIndex = 0;
let score = 0;
let currentQuestions = [];
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
console.log("QUIZ CONFIG:", quizConfig);
    if (mode === "adaptive") {
        return startAdaptiveFlow();
    }

    if (mode === "diagnostic") {
        return startDiagnosticFlow();
    }

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
    console.log("Loaded sections:", examSections);
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
 
export function goToNextSection() {

  currentSectionIndex++;

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
}

export function showSectionTransition(section, onContinue) {

  isTransitioning = true;

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
    if (continued) return;
    continued = true;

    overlay.style.display = "none";

    isTransitioning = false;

    questionsInCurrentSection = section.question_count;
    startSectionTimer(section.section_time_seconds);

    if (onContinue) onContinue();
  }

  btn.onclick = proceed;
  setTimeout(proceed, 5000);
}

export async function loadQuestions(exam, unit, quizLength = null) {
 const questionCard = document.getElementById("question-card");
  if (questionCard) questionCard.style.display = "block";
    if (!examSections || examSections.length === 0) {
        console.error("No sections configured for this exam.");  ///line 274 
        return false;
    }

    

    document.getElementById("progress-bar").style.width = "0%";
    document.getElementById("progress-container").textContent = "";

    document.getElementById("explanation").textContent = "";
    document.getElementById("next-btn").style.display = "none";

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
    currentQuestions = selectedQuestions;
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

    questionObj.correctanswer = ["A","B","C","D"][newCorrectIndex];

    return answers;
}

function showQuestion() {
const reportBtn = document.getElementById("report-btn");
if (reportBtn) reportBtn.style.display = "inline-flex";
    animateQuestionChange();

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
    btn.style.backgroundColor = "";
    btn.style.opacity = "1";
    btn.style.transform = "scale(1)";

    btn.disabled = false;
});

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

    gridInput.value = "";
    gridInput.style.border = ""; // reset border
    document.getElementById("grid-result").textContent = ""; // reset checkmark

    } else {

        gridContainer.style.display = "none";

        const shuffled = shuffleAnswers(questionObj);

document.getElementById("choice-a").textContent = shuffled[0].text;
document.getElementById("choice-b").textContent = shuffled[1].text;
document.getElementById("choice-c").textContent = shuffled[2].text;
document.getElementById("choice-d").textContent = shuffled[3].text;

    }
}

export async function nextQuestion() {

    if (isTransitioning) return;

    const section = examSections[currentSectionIndex];

    currentQuestionIndex++;
    sectionQuestionsLoaded++;

    // =========================
    // SECTION COMPLETE
    // =========================
    if (sectionQuestionsLoaded >= section.question_count) {

        currentSectionIndex++;

        if (currentSectionIndex >= examSections.length) {
            showFinalScore();
            return;
        }

        const nextSection = examSections[currentSectionIndex];

        sectionQuestionsLoaded = 0;
        currentQuestionIndex = 0;

        showSectionTransition(nextSection, async () => {

            if (isAdaptiveMode) {
                await loadAdaptiveQuestionsForSection();
            } else {
                await loadQuestions(exam, unit);
            }
        });

        return;
    }

    // =========================
    // NEXT QUESTION SAME SECTION
    // =========================
    document.getElementById("next-btn").style.display = "none";
    document.getElementById("explanation").textContent = "";

    showQuestion();
}

export async function selectAnswer(letter) {

if (isTransitioning) return;

if (!currentQuestions || !currentQuestions[currentQuestionIndex]) {
    console.error("No question available at index:", currentQuestionIndex);
    return;
}

    const questionObj = currentQuestions[currentQuestionIndex];
    
    // GRAPH SUPPORT
const imageContainer = document.getElementById("question-image-container");
const imageElement = document.getElementById("question-image");

if (questionObj.image_url) {
    imageElement.src = questionObj.image_url;
    imageContainer.style.display = "block";
} else {
    imageContainer.style.display = "none";
}
    if (!questionObj) return;

    const buttons = {
        A: document.getElementById("choice-a"),
        B: document.getElementById("choice-b"),
        C: document.getElementById("choice-c"),
        D: document.getElementById("choice-d"),
    };

    Object.values(buttons).forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = "0.6";
});

   let isCorrect;

if (questionObj.question_format === "GRID") {

    const userAnswer = letter.trim();
    const correct = questionObj.correct_numeric_answer.toString();

    isCorrect = userAnswer === correct;

   const gridInput = document.getElementById("grid-input");
    
    const gridResult = document.getElementById("grid-result");

if (isCorrect) {
    gridInput.style.border = "3px solid green";
    gridResult.textContent = "✔";
} else {
    gridInput.style.border = "3px solid red";
    gridResult.textContent = "✖";
}
    
} else {

    const correct = (questionObj.correctanswer || "").toUpperCase();
letter = letter.toUpperCase();

    if (letter === correct) {

    isCorrect = true;

    if (buttons[letter]) {
        buttons[letter].style.backgroundColor = "green";
    }

} else {

    isCorrect = false;

    if (buttons[letter]) {
        buttons[letter].style.backgroundColor = "red";
    }

    if (buttons[correct]) {
        buttons[correct].style.backgroundColor = "green";
    }

}
}

if (isCorrect) {
    score++;
}

answerResults.push({
    unit: questionObj.unit,
    correct: isCorrect ? 1 : 0
});
// Highlight selected answer more clearly
if (buttons[letter]) {
    buttons[letter].style.transform = "scale(1.03)";
}
    // 🔥 Update diagnostic topic stats
    
// 🔥 Insert individual attempt
const { data: { user }, error: userError } = await supabase.auth.getUser();

// 🚫 NOT LOGGED IN → BLOCK AFTER FIRST QUESTION
if (!user) {


    // ❗ allow quiz to continue, just skip DB writes
    console.log("Anonymous mode: skipping DB tracking");
}
if (!user) {
    console.log("No user → skip adaptive");
}
const examsArray = Array.isArray(questionObj.exams)
    ? questionObj.exams
    : [questionObj.exams];
if (user) {
   const { data, error } = await supabase.from("topic_attempts").insert([
{
    user_id: user.id,
    exams: examsArray,
    unit: questionObj.unit,
    is_correct: isCorrect
}
]);
console.log("INSERT RESULT:", data, error);
}

   if (user) {
    const { data: { user } } = await supabase.auth.getUser();

if (!user) return;
  const { error: statsError } = await supabase.rpc(
    'increment_unit_stats',
    {
      p_exam: questionObj.exams[0],
      p_unit: questionObj.unit,
      p_is_correct: isCorrect,
      p_user: user.id
    }
  );

  if (statsError) {
    console.error("Error updating topic stats:", statsError);
  } else {
    const exam = questionObj.exams[0];
    const readiness = await calculateExamReadiness(exam);

    document.getElementById("exam-readiness").textContent =
      `Exam Readiness: ${readiness}%`;
  }
}


    document.getElementById("explanation").textContent =
        questionObj.explanation || "No explanation provided.";

    document.getElementById("next-btn").style.display = "block";
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
const reportBtn = document.getElementById("report-btn");
if (reportBtn) reportBtn.style.display = "none";
const isDiagnosticMode = quizConfig.mode === "diagnostic";

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

document.getElementById("next-btn").style.display = "none";
document.getElementById("grid-container").style.display = "none";
document.getElementById("grid-input").value = "";
document.getElementById("grid-result").textContent = "";
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

    // reset index so new quiz can start clean
    currentQuestionIndex = 0;
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
  document.getElementById("next-btn").style.display = "none";

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

  currentQuestions = selectedQuestions;
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
  document.getElementById("next-btn").style.display = "none";

  ["choice-a","choice-b","choice-c","choice-d"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  });
}
