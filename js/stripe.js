import { supabase } from "./supabase.js";

const CREATE_CHECKOUT_URL =
"https://mxzacyfkisblfqbxvkjj.functions.supabase.co/create-checkout";

const stripe = Stripe("pk_live_51TBOMyEaG3WhqeCs7rpZehsXcn71P3JF6uGL7YHw7P310P4B6ZaAnWpGxXfZaulvLWZHHKSUGpMKLrreki5lvTZK009GBrStxo");

/* ✅ MESSAGE FUNCTION (MOVE OUTSIDE) */
function showPricingMessage(text) {
  const msg = document.getElementById("pricing-message");
  if (!msg) return;

  msg.textContent = text;

  setTimeout(() => {
    msg.textContent = "";
  }, 4000);
}

/* ✅ FIXED CHECKOUT */
async function startCheckout(priceId, exam, productType) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      showPricingMessage("Create a free account to unlock this plan 🚀");

      const satMsg = document.getElementById("sat-auth-message");

      if (satMsg) {
        satMsg.textContent =
          "Please sign in or create an account before upgrading.";
        satMsg.style.display = "block";

        setTimeout(() => {
          satMsg.style.display = "none";
        }, 4000);
      }

      return;
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      showPricingMessage("Session expired. Please log in again.");
      return;
    }

    const response = await fetch(CREATE_CHECKOUT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        priceId,
        userId: user.id,
        exam,
        productType,
        post_id:
          new URLSearchParams(window.location.search).get("post_id") || ""
      })
    });

    const data = await response.json();

    console.log("Checkout response:", data);

    if (!response.ok) {
      console.error("Checkout error:", data);
      showPricingMessage(
        data.error || "Checkout failed. Please try again."
      );
      return;
    }

    if (!data.url) {
      console.error("No checkout URL returned:", data);
      showPricingMessage("Checkout failed. Please try again.");
      return;
    }

    window.location.href = data.url;

  } catch (error) {
    console.error("startCheckout failed:", error);
    showPricingMessage("Something went wrong. Please try again.");
  }
}
/* BUTTON LISTENERS */

document.getElementById("ap_calc_ab_btn")
  ?.addEventListener("click", () => {
    startCheckout(
      "price_1TBp8xEaG3WhqeCssMpll6gA",
      "AP_CALC_AB",
      "one_time"
    );
  });

document.getElementById("ap_calc_bc_btn")
  ?.addEventListener("click", () => {
    startCheckout(
      "price_1TBp9rEaG3WhqeCsTQERd7xd",
      "AP_CALC_BC",
      "one_time"
    );
  });

document.getElementById("ap_precalc_btn")
  ?.addEventListener("click", () => {
    startCheckout(
      "price_1TBpBSEaG3WhqeCsgTWj5pV8",
      "AP_PRECALC",
      "one_time"
    );
  });

document.getElementById("sat-btn")
  ?.addEventListener("click", () => {
    startCheckout(
      "price_1TBpD4EaG3WhqeCsowFAN74q",
      "SAT_MATH",
      "recurring"
    );
  });

document.getElementById("all-exams-btn")
  ?.addEventListener("click", () => {
    startCheckout(
      "price_1TBpEIEaG3WhqeCsDtKUWba9",
      "ALL",
      "recurring"
    );
  });