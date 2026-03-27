import { supabase } from "./supabase.js";
import { calculateExamReadiness } from "./diagnostics.js";
import { checkExamAccess } from "./subscription.js";
import { getExamArrayValue } from "./diagnostics.js";
let usedQuestionIds = new Set();

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

let selectedExam = null;
let selectedUnit = null;

import { stopTimer } from "./quizSettings.js";



document.addEventListener("quizStart", async (event) => {

const startBtn = document.getElementById("start-quiz-btn");
const adaptiveBtn = document.getElementById("adaptive-quiz-btn");

if (startBtn) {
    startBtn.textContent = "Loading...";
    startBtn.disabled = true;
}

if (startBtn) startBtn.disabled = true;
if (adaptiveBtn) adaptiveBtn.disabled = true;

const questionCard = document.getElementById("question-card");
if (questionCard) questionCard.style.display = "block";

stopTimer(); // 🔥 clears any old timer before starting new quiz
isAdaptiveMode = false;
currentQuestionIndex = 0;
score = 0;
currentSectionIndex = 0;
sectionQuestionsLoaded = 0;
usedQuestionIds.clear();

  const { exam, unit, quizLength } = event.detail;

selectedExam = exam;
selectedUnit = unit;

  examSections = await loadExamSections(exam, quizLength);

  if (examSections.length === 0) {
    console.error("No exam sections found");
    return;
  }

totalQuestions = examSections.reduce(
  (sum, section) => sum + section.question_count,
  0
);

  currentSectionIndex = 0;
  questionsInCurrentSection = examSections[0].question_count;

  startSectionTimer(examSections[0].section_time_seconds);

  await loadQuestions(exam, unit);

if (startBtn) {
  startBtn.textContent = "Start Quiz";
  startBtn.disabled = false;
}

if (adaptiveBtn) {
  adaptiveBtn.textContent = "Take Adaptive Quiz";
  adaptiveBtn.disabled = false;
}

});


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

if (!quizLength || isNaN(quizLength)) {
  console.error("Invalid quiz length:", quizLength);
  return [];
}


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

  showSectionTransition(nextSection, async () => {
    await loadQuestions(selectedExam, selectedUnit);
  });
}

export function showSectionTransition(section, onContinue) {

  const overlay = document.getElementById("section-transition");
  const text = document.getElementById("transition-text");
  const btn = document.getElementById("transition-continue");

  let message;

  // ✅ SAT CUSTOM LOGIC
  if (selectedExam === "SAT_MATH") {

    const sectionNumber = currentSectionIndex + 1;

    if (sectionNumber === 2) {
      message = "Finished SAT Math Section 1. Starting Section 2.";
    } else {
      message = "Starting SAT Math Section 1.";
    }

  } else {
    // ✅ AP / DEFAULT LOGIC
    message = section.calculator_allowed
      ? "Calculator section starting. Please take out your calculator."
      : "No-calculator section starting.";
  }

  text.textContent = message;

  overlay.style.display = "flex";

  let continued = false;

  function proceed() {
    if (continued) return;
    continued = true;

    overlay.style.display = "none";

    questionsInCurrentSection = section.question_count;
    startSectionTimer(section.section_time_seconds);

    if (onContinue) onContinue();
  }

  btn.onclick = proceed;
  setTimeout(proceed, 5000);
}

export async function loadQuestions(selectedExam, selectedUnit) {

const lengthSelect = document.getElementById("time-select");

if (!lengthSelect || !lengthSelect.value) {
    console.error("Quiz length not selected.");
    return false;
}

const quizLength = Number(lengthSelect.value);

examSections = await loadExamSections(selectedExam, quizLength);

if (!examSections || examSections.length === 0) {
    console.error("No sections configured for this exam.");
    return false;
}


const readiness = await calculateExamReadiness(selectedExam);

document.getElementById("exam-readiness").textContent =
    readiness !== null && readiness !== undefined
        ? `Exam Readiness: ${readiness}%`
        : "Exam Readiness: --";


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
if (selectedExam === "AP_CALC_AB") {
  query = query.contains("exams", ["CALC_AB"]);
}
else if (selectedExam === "AP_CALC_BC") {
  query = query.contains("exams", ["CALC_BC"]);
}
else {
  query = query.contains("exams", [selectedExam]);
}
    // Only filter by unit IF one is selected
    if (selectedUnit) {
    query = query.eq("unit", selectedUnit);
}
const hasAccess = await checkExamAccess(selectedExam);

if (!hasAccess) {
  query = query.eq("simulation_eligible", true);
}
    const { data, error } = await query;

    if (error) {
        console.error(error);
        return false;
    }

    // Shuffle and take 5
  const unusedQuestions = data.filter(
  q => !usedQuestionIds.has(q.id)
);

if (!unusedQuestions || unusedQuestions.length < section.question_count) {
  console.error("Not enough unused questions");
  return false;
}

// shuffle
const shuffled = unusedQuestions.sort(() => Math.random() - 0.5);

// 🔥 THIS LINE IS MISSING
currentQuestions = shuffled.slice(0, section.question_count);

// track used ids
currentQuestions.forEach(q => usedQuestionIds.add(q.id));

// reset index
currentQuestionIndex = 0;

// show first question

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

    animateQuestionChange();

    const questionObj = currentQuestions[currentQuestionIndex];

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

    // ✅ ADAPTIVE QUIZ FLOW
    if (isAdaptiveMode) {

        currentQuestionIndex++;

        if (currentQuestionIndex >= currentQuestions.length) {
            showFinalScore();
            return;
        }

        document.getElementById("next-btn").style.display = "none";
        document.getElementById("explanation").textContent = "";

        showQuestion();
        return;
    }

    // ✅ NORMAL SECTION-BASED QUIZ

    if (currentSectionIndex >= examSections.length) {
        showFinalScore();
        return;
    }

    currentQuestionIndex++;
    sectionQuestionsLoaded++;

    // 🔥 SECTION COMPLETE
    if (sectionQuestionsLoaded >= examSections[currentSectionIndex].question_count) {

        currentSectionIndex++;

        if (currentSectionIndex >= examSections.length) {
            showFinalScore();
            return;
        }

        const nextSection = examSections[currentSectionIndex]; // ✅ FIX

        sectionQuestionsLoaded = 0;

        showSectionTransition(nextSection, async () => {
            await loadQuestions(selectedExam, selectedUnit);
        });

        return;
    }

    // 🔁 NORMAL NEXT QUESTION
    document.getElementById("next-btn").style.display = "none";
    document.getElementById("explanation").textContent = "";

    if (currentQuestionIndex < currentQuestions.length) {
        showQuestion();
    } else {
        showFinalScore();
    }
}

export async function selectAnswer(letter) {

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

// Highlight selected answer more clearly
if (buttons[letter]) {
    buttons[letter].style.transform = "scale(1.03)";
}
    // 🔥 Update diagnostic topic stats
    
// 🔥 Insert individual attempt
const { data: { user } } = await supabase.auth.getUser();

if (user) {
    await supabase.from("topic_attempts").insert([
{
    user_id: user.id,
    exams: questionObj.exams,
    unit: questionObj.unit,
    is_correct: isCorrect
}
]);
}

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

    const selectedExam = questionObj.exams[0];
    const readiness = await calculateExamReadiness(selectedExam);

    document.getElementById("exam-readiness").textContent =
        `Exam Readiness: ${readiness}%`;
}

    document.getElementById("explanation").textContent =
        questionObj.explanation || "No explanation provided.";

    document.getElementById("next-btn").style.display = "block";
}


export async function loadHistory(userId) {

    const { data, error } = await supabase
        .from("quiz_attempts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

    if (error) {
        console.error(error);
        return;
    }

    const container = document.getElementById("history-container");
    container.innerHTML = "<h3>Past Attempts</h3>";

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
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        await supabase.from("quiz_attempts").insert([
            {
                user_id: user.id,
                score: score,
                total: total
            }
        ]);

        // reload history
        loadHistory(user.id);
    }

    // reset index so new quiz can start clean
    currentQuestionIndex = 0;
}

//Load adaptive quiz!!

export async function loadAdaptiveQuiz(selectedExam) {

// 🔥 SHOW QUESTION CARD (same as normal quiz)
const questionCard = document.getElementById("question-card");
if (questionCard) questionCard.style.display = "block";

// 🔥 RESET STATE (same as quizStart)
stopTimer();
currentQuestionIndex = 0;
score = 0;
usedQuestionIds.clear();

// 🔥 LOADING STATE (only adaptive button)
const adaptiveBtn = document.getElementById("adaptive-quiz-btn");
if (adaptiveBtn) {
    adaptiveBtn.textContent = "Loading...";
    adaptiveBtn.disabled = true;
}

isAdaptiveMode = true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const MIN_ATTEMPTS = 3;
    const QUIZ_SIZE = 5;

    const examArrayValue = getExamArrayValue(selectedExam);
    const hasAccess = await checkExamAccess(selectedExam);

    // 1️⃣ Get topic stats
    const { data: stats, error } = await supabase
        .from("topic_stats")
        .select("unit, correct_count, total_attempted, current_streak, best_streak")
        .eq("user_id", user.id)
        .contains("exams", [examArrayValue]);

    console.log("Selected exam:", selectedExam);
    console.log("Exam array value:", examArrayValue);
    console.log("Stats returned:", stats);

    if (error || !stats || stats.length === 0) {
        console.log("No diagnostic data.");
        return false;
    }

    const MASTERY_MIN_ATTEMPTS = 12;
    const MASTERY_THRESHOLD = 0.85;

    let eligible = [];

    for (let row of stats) {
        const { data: attempts } = await supabase
            .from("topic_attempts")
            .select("is_correct")
            .eq("user_id", user.id)
            .contains("exams", [examArrayValue])
            .eq("unit", row.unit)
            .order("created_at", { ascending: false })
            .limit(20);

           
        if (!attempts || attempts.length < MIN_ATTEMPTS) continue;

        const correctCount = attempts.filter(a => a.is_correct).length;
        const rollingAccuracy = correctCount / attempts.length;

        const mastered =
            attempts.length >= MASTERY_MIN_ATTEMPTS &&
            rollingAccuracy >= MASTERY_THRESHOLD;

        if (!mastered) {
            eligible.push({
                unit: row.unit,
                rollingAccuracy
            });
        }
    }

    if (eligible.length === 0) {
        console.log("Not enough attempts for adaptive quiz.");
        return false;
    }

    // Sort weakest first
    const processed = eligible
        .map(row => ({
            unit: row.unit,
            weakness: Math.max(0.01, 1 - row.rollingAccuracy)
        }))
        .sort((a, b) => b.weakness - a.weakness);

    const totalWeakness = processed.reduce((sum, t) => sum + t.weakness, 0);

let adaptiveQuestions = [];

// Flatten all eligible units first
let allCandidateQuestions = [];

for (let unitObj of processed) {

    const normalizedUnit = unitObj.unit
        .toUpperCase()
        .replaceAll(" ", "_");

    console.log("Fetching questions for unit:", normalizedUnit);

    const { data: questions } = await supabase
        .from("questions")
        .select("*")
        .contains("exams", [examArrayValue])
        .eq("unit", normalizedUnit);

    console.log("Questions returned:", questions?.length);

    if (!questions || questions.length === 0) continue;

    let filteredQuestions = questions;

    if (!hasAccess) {
        filteredQuestions = questions.filter(q => q.simulation_eligible);
    }

    allCandidateQuestions.push(...filteredQuestions);
}

// 🚨 KEY FIX: ensure we have enough total pool
if (allCandidateQuestions.length < QUIZ_SIZE) {
    console.log("Not enough total questions.");
    return false;
}

// ✅ Shuffle ALL together
const shuffled = allCandidateQuestions.sort(() => 0.5 - Math.random());

// ✅ Take EXACTLY what we need
adaptiveQuestions = shuffled.slice(0, QUIZ_SIZE);

    currentQuestions = adaptiveQuestions;
    currentQuestionIndex = 0;
    score = 0;

totalQuestions = adaptiveQuestions.length;

    document.getElementById("progress-bar").style.width = "0%";
    document.getElementById("progress-container").textContent = "";
    document.getElementById("explanation").textContent = "";
    document.getElementById("next-btn").style.display = "none";

    ["choice-a", "choice-b", "choice-c", "choice-d"].forEach(id => {
        document.getElementById(id).style.display = "block";
    });

    showQuestion();

if (adaptiveBtn) {
    adaptiveBtn.textContent = "Take Adaptive Quiz";
    adaptiveBtn.disabled = false;
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