import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY")!,
  { apiVersion: "2023-10-16" }
);

Deno.serve(async (req) => {

  let event;

  try {
    event = await req.json();
  } catch (err) {
    console.log("❌ JSON ERROR:", err.message);
    return new Response("Invalid JSON", { status: 400 });
  }

  console.log("🔥 Webhook received:", event.type);

  if (event.type === "checkout.session.completed") {

    const session = event.data.object;

    const userId = session.metadata.userId;
    const exam = session.metadata.exam;
    const isSubscription = session.mode === "subscription";

    console.log("✅ PAYMENT SUCCESS");
    console.log("USER:", userId);
    console.log("EXAM:", exam);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let endDate = null;

    if (isSubscription && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      endDate = new Date(sub.current_period_end * 1000).toISOString();
    }

    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRole!,
        "Authorization": `Bearer ${serviceRole}`,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        user_id: userId,
        exam: exam,
        status: "active",
        start_date: new Date().toISOString(),
        end_date: endDate,
        product_type: isSubscription ? "subscription" : "one_time"
      })
    });
  }

  return new Response("ok");
});