import { supabase } from "./supabase.js";

const PORTAL_URL = "https://mxzacyfkisblfqbxvkjj.functions.supabase.co/create-portal-session";

document.getElementById("cnclsub-btn").addEventListener("click", async () => {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Please log in.");
    return;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .limit(1);

  const customerId = data?.[0]?.stripe_customer_id;

  if (error || !customerId) {
    alert("No subscription found.");
    return;
  }

  const res = await fetch("https://mxzacyfkisblfqbxvkjj.functions.supabase.co/create-portal-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerId: customerId
    })
  });

  const portal = await res.json();
  window.location.href = portal.url;
});

document.getElementById("dltact-btn").addEventListener("click", async () => {
  const confirmDelete = confirm("Are you sure you want to delete your account? This cannot be undone.");

  if (!confirmDelete) return;

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Not logged in.");
    return;
  }

  // delete user's subscriptions/data
  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    alert("Error deleting account.");
    return;
  }

  // sign out user
  await supabase.auth.signOut();

  alert("Account deleted.");
  window.location.href = "/";
});
