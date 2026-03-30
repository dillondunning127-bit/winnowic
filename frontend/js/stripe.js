import { supabase } from "./supabase.js";

const CREATE_CHECKOUT_URL =
"https://mxzacyfkisblfqbxvkjj.functions.supabase.co/create-checkout";

const stripe = Stripe("pk_live_51TBOMyEaG3WhqeCs7rpZehsXcn71P3JF6uGL7YHw7P310P4B6ZaAnWpGxXfZaulvLWZHHKSUGpMKLrreki5lvTZK009GBrStxo");

async function startCheckout(priceId, exam, productType) {

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
  exam,
  productType
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
    "price_1TBp8xEaG3WhqeCssMpll6gA",
    "AP_CALC_AB",
    "one_time"
  );

});

document.getElementById("ap_calc_bc_btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TBp9rEaG3WhqeCsTQERd7xd",
    "AP_CALC_BC",
    "one_time"
  );

});

document.getElementById("ap_precalc_btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TBpBSEaG3WhqeCsgTWj5pV8",
    "AP_PRECALC",
    "one_time"
  );

});

document.getElementById("sat-btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TBpD4EaG3WhqeCsowFAN74q",
    "SAT_MATH",
    "recurring"
  );

});

document.getElementById("all-exams-btn")
.addEventListener("click", () => {

  startCheckout(
    "price_1TBpEIEaG3WhqeCsDtKUWba9",
    "ALL",
    "recurring"
  );

});
