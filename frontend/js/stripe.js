import { supabase } from "./supabase.js";

const CREATE_CHECKOUT_URL =
"https://mxzacyfkisblfqbxvkjj.functions.supabase.co/create-checkout";

const stripe = Stripe("pk_test_51TBOMyEaG3WhqeCsBWypjYFtbREXKe5CVtfO3R6xALi3f6h8TvPuIXRCUvTpmbq9I50v0TItIgqbrEXKX2pt5V2N00lf3wRFaE");

async function startCheckout(priceId, exam) {

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  alert("Please log in again.");
  return;
}

const response = await fetch(CREATE_CHECKOUT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}` 
  },
  body: JSON.stringify({
    priceId,
    userId: user.id,
    exam
  })
});

const data = await response.json();

console.log("Checkout response:", data);

if (!data.url) {
  alert("Checkout failed. Check console.");
  return;
}

window.location.href = data.url;

}

/* BUTTON LISTENERS */

document.getElementById("ap_calc_ab_btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TC5nCEaG3WhqeCszMoQB798",
    "AP_CALC_AB"
  );

});

document.getElementById("ap_calc_bc_btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TC5neEaG3WhqeCs8KPlaRhQ",
    "AP_CALC_BC"
  );

});

document.getElementById("ap_precalc_btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TC5nzEaG3WhqeCsoxHGcSqb",
    "AP_PRECALC"
  );

});

document.getElementById("sat-btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TC5phEaG3WhqeCsgeCCf1fT",
    "SAT_MATH"
  );

});

document.getElementById("all-exams-btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TC5qKEaG3WhqeCsHBbtbniY",
    "ALL"
  );

});