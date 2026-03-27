import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {

  const submitBtn = document.getElementById("submit-feedback-btn");
  const input = document.getElementById("feedback-input");
  const messageEl = document.getElementById("feedback-message");
  const backBtn = document.getElementById("back-btn");

  // 🔙 Back button
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "/index.html";
    });
  }

  // 📩 Submit feedback
  submitBtn.addEventListener("click", async () => {

    const text = input.value.trim();

    if (!text) {
      messageEl.textContent = "Please enter feedback before submitting.";
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("feedback")
      .insert([
        {
          user_id: user?.id || null,
          message: text
        }
      ]);

    if (error) {
      console.error(error);
      messageEl.textContent = "Error submitting feedback.";
      return;
    }

    // ✅ Success UI
    input.value = "";
    messageEl.textContent = "Thank you! Your feedback has been submitted.";
  });

});