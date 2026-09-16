/**
 * GET /api/config — public client config (no secrets).
 */
import { secureApi } from "./_lib/http.js";

let authCache = null;
let authCacheAt = 0;

function paypalMode() {
  const production =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  return String(process.env.PAYPAL_MODE || (production ? "live" : "sandbox")).toLowerCase();
}

async function getAuthCapabilities() {
  if (authCache && Date.now() - authCacheAt < 60000) return authCache;
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || "";
  const fallback = {
    googleEnabled: false,
    emailLoginEnabled: false,
    emailSignupEnabled: false,
    available: false
  };
  if (!url || !anon) return fallback;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` }
    });
    if (!response.ok) return fallback;
    const settings = await response.json();
    const emailEnabled = settings.external?.email !== false;
    authCache = {
      googleEnabled: settings.external?.google === true && Boolean(process.env.GOOGLE_CLIENT_ID),
      emailLoginEnabled: emailEnabled,
      emailSignupEnabled: emailEnabled && !settings.disable_signup,
      available: true
    };
    authCacheAt = Date.now();
    return authCache;
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  if (!await secureApi(req, res, { methods: ["GET"] })) return;

  const auth = await getAuthCapabilities();
  res.status(200).json({
    product: "volume_booster",
    paypal_client_id: process.env.PAYPAL_CLIENT_ID || "",
    paypal_mode: paypalMode(),
    razorpay_key_id: process.env.RAZORPAY_KEY_ID || "",
    base_currency: "USD",
    gst_rate: 0.18,
    inr_usd_rate: Number(process.env.INR_USD_RATE || 95.12),
    plans: {
      monthly: { id: "monthly", priceUSD: 1.99, name: "XCoda Pro Monthly" },
      yearly: { id: "yearly", priceUSD: 12.99, name: "XCoda Pro Yearly" },
      lifetime: { id: "lifetime", priceUSD: 100, name: "XCoda Pro Lifetime" }
    },
    providers: ["paypal", "razorpay"],
    company_name: "XCoda — Fenwick Labs",
    support_email: "support@fenwicklabs.com",
    site_url: process.env.SITE_URL || "https://volume-booster-ten.vercel.app",
    supabase_url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    supabase_anon_key: process.env.SUPABASE_ANON_KEY || "",
    google_client_id: process.env.GOOGLE_CLIENT_ID || "",
    auth
  });
}
