import { supabase } from "./supabase.js";
import { initAuthListener } from './auth.js';
initAuthListener();

document.addEventListener("DOMContentLoaded", () => {

  const submitBtn = document.getElementById("submit-feedback-btn");
  const input = document.getElementById("feedback-input");
  const messageEl = document.getElementById("feedback-message");

  if (!submitBtn || !input || !messageEl) return;

  submitBtn.addEventListener("click", async () => {

    const text = input.value.trim();

    if (!text) {
      messageEl.textContent = "Please enter a message before submitting.";
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("feedback")
      .insert([
        {
          user_id: user?.id || null,
          message: text,
          is_anonymous: user ? false : true
        }
      ]);

    if (error) {
      console.error(error);
      messageEl.textContent = "Something went wrong. Please try again.";
      return;
    }

    input.value = "";
    messageEl.textContent = "Message sent — we'll get back to you soon.";
  });

});