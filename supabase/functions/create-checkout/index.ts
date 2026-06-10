import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(
  Deno.env.get("STRIPE_SECRET_KEY")!,
  { apiVersion: "2023-10-16" }
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("BODY:", body);

    const { userId, exam, priceId, productType, post_id } = body;

    if (!userId || !priceId) {
      return new Response(
        JSON.stringify({ error: "Missing userId or priceId" }),
        { status: 400, headers: corsHeaders }
      );
    }
const mode = productType === "one_time" ? "payment" : "subscription";
    const session = await stripe.checkout.sessions.create({
  mode,
  line_items: [
    {
      price: priceId,
      quantity: 1,
    },
  ],
  success_url: "https://winnowic.com/",
  cancel_url: "https://winnowic.com/pricing",
  metadata: {
  userId,
  exam,
  productType,
  post_id,
},
});
    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error("ERROR:", err);

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});