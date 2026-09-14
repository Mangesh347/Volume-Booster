/**
 * GET /api/config — public client config (no secrets).
 */

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  res.status(200).json({
    product: "auralis",
    paypal_client_id: process.env.PAYPAL_CLIENT_ID || "",
    paypal_mode: (process.env.PAYPAL_MODE || "sandbox").toLowerCase(),
    razorpay_key_id: process.env.RAZORPAY_KEY_ID || "",
    base_currency: "USD",
    gst_rate: 0.18,
    inr_usd_rate: Number(process.env.INR_USD_RATE || 95.12),
    plans: {
      monthly: { id: "monthly", priceUSD: 3.99, name: "Pro Monthly" },
      yearly: { id: "yearly", priceUSD: 29.99, name: "Pro Yearly" },
      lifetime: { id: "lifetime", priceUSD: 79.99, name: "Pro Lifetime" }
    },
    providers: ["paypal", "razorpay"],
    company_name: "Auralis — Fenwick Labs",
    support_email: "support@fenwicklabs.com",
    site_url: "https://volumebooster.vercel.app"
  });
}
