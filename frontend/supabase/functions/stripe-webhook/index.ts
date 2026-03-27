Deno.serve(async (req) => {

  let event;

  try {
    event = await req.json();
  } catch (err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {

    const session = event.data.object;

    const userId = session.metadata.userId;
    const exam = session.metadata.exam?.trim().toUpperCase();
console.log("INSERTING EXAM:", exam);
    console.log("🔥 Webhook received:", event.type);
    console.log("USER:", userId);
    console.log("EXAM:", exam);

    // ✅ DEFINE INSIDE HERE
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRole) {
      console.error("❌ Missing SERVICE ROLE KEY");
      return new Response("Missing key", { status: 500 });
    }

    await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRole,
        "Authorization": `Bearer ${serviceRole}`,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        user_id: userId,
        exam: exam,
        status: "active",
        start_date: new Date().toISOString(),
        end_date: session.mode === "subscription"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null
      })
    });

  }

  return new Response("ok");
});