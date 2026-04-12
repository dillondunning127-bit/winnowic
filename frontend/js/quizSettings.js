import { supabase } from "./supabase.js";
// quizSettings.js

let selectedExam = null;
let selectedUnit = null;
let selectedTime = null;

let timerInterval = null;
let timeRemaining = 0;


export function initQuizSettings() {

    const examSelect = document.getElementById("exam-select");
    const unitSelect = document.getElementById("unit-select");
    const timeSelect = document.getElementById("time-select");
    const startBtn = document.getElementById("start-quiz-btn");

    // HARD GUARD — exit if any missing
    if (!examSelect || !unitSelect || !timeSelect || !startBtn) {
        console.warn("Quiz settings UI elements missing");
        return;
    }

  examSelect.addEventListener("change", () => {

    selectedExam = examSelect.value;

    timeSelect.disabled = false;
    unitSelect.disabled = false;

    updateQuizLengthOptions();
    updateUnitOptions(selectedExam);

});

    unitSelect.addEventListener("change", () => {
        selectedUnit = unitSelect.value;
    });

    timeSelect.addEventListener("change", () => {

    const selectedOption = timeSelect.selectedOptions[0];

    if (!selectedOption) {
        selectedTime = null;
        return;
    }

    // quiz length is now the value
    selectedTime = parseInt(selectedOption.value);

});

    startBtn.addEventListener("click", () => {

if (!selectedTime) {
    return;
}

    if (!selectedExam) {
        return;
    }

    // Start timer ONLY if enabled and valid
    const timerEnabled =
        document.getElementById("timerToggle")?.checked;

    if (timerEnabled && selectedTime) {
        startTimer(selectedTime);
    }

    const quizLengthValue = document.getElementById("time-select").value;

const quizLength = parseInt(quizLengthValue);

if (isNaN(quizLength)) {
    alert("Select a quiz length");
    return;
}

document.dispatchEvent(new CustomEvent("quizStart", {
detail: {

  
    exam: selectedExam,
    unit: selectedUnit,
    quizLength: quizLength
    
}
}));

});
}

async function updateUnitOptions(exam) {

  const unitSelect = document.getElementById("unit-select");

  if (!unitSelect) return;

  unitSelect.innerHTML = '<option value="">All Units</option>';

let query = supabase
  .from("questions")
  .select("unit")
  .eq("is_active", true);

if (exam === "AP_CALC_AB") {

  query = query.overlaps("exams", ["CALC_AB"]);

} else if (exam === "AP_CALC_BC") {

  query = query.overlaps("exams", ["CALC_AB","CALC_BC"]);

} else {

  query = query.contains("exams", [exam]);

}

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return;
  }

  // Normalize units so ADVANCED MATH and ADVANCED_MATH merge
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

    const opt = document.createElement("option");

    opt.value = unit;

    opt.textContent =
      unit.replaceAll("_"," ").replace("UNIT","Unit ");

    unitSelect.appendChild(opt);

  });

}

// TIMER
export function startTimer(durationSeconds) {

    stopTimer();

    timeRemaining = durationSeconds;

    const timerContainer = document.getElementById("timerDisplay");
    const timerEl = document.getElementById("timeRemaining");

    if (!timerContainer || !timerEl) {
        console.error("Timer elements missing");
        return;
    }

    // SHOW TIMER
    timerContainer.style.display = "block";

    // INITIAL DISPLAY IMMEDIATELY
    updateDisplay();

    timerInterval = setInterval(() => {

        timeRemaining--;

        updateDisplay();

        if (timeRemaining <= 0) {
            stopTimer();
        }

    }, 1000);

    function updateDisplay() {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;

        timerEl.textContent =
            `${minutes}:${seconds.toString().padStart(2,"0")}`;
    }
}


export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const timerContainer = document.getElementById("timerDisplay");

    if (timerContainer) {
        timerContainer.style.display = "none"; // 🔥 THIS FIXES IT
    }
}


// expose settings if needed
export function getQuizSettings() {
    return {
        exam: selectedExam,
        unit: selectedUnit,
        time: selectedTime
    };
}


async function updateQuizLengthOptions() {

  const examSelect = document.getElementById("exam-select");
  const select = document.getElementById("time-select");

  if (!examSelect || !select) return;

  const exam = examSelect.value;
  if (!exam) return;

  select.innerHTML = '<option value=""></option>';

  const { data, error } = await supabase
    .from("exam_sections")
    .select("quiz_length")
    .eq("exam", exam);

  if (error) {
    console.error(error);
    return;
  }

  const uniqueLengths = [...new Set(data.map(row => row.quiz_length))];

  uniqueLengths.sort((a,b)=>a-b);

  uniqueLengths.forEach(length => {

    const option = document.createElement("option");

    option.value = length;
    option.textContent = `${length} Questions`;

    select.appendChild(option);

  });

}


let quizTimer = null;
let remainingTime = 0;
let warnedFiveMinutes = false;

document.addEventListener("startTimer", (event) => {
  startTimer(event.detail.seconds);
});

function updateTimerDisplay() {

  const minutes = Math.floor(remainingTime / 60);
  const seconds = remainingTime % 60;

  document.getElementById("timeRemaining").textContent =
    `${minutes}:${seconds.toString().padStart(2,'0')}`;
}
export { updateQuizLengthOptions };
