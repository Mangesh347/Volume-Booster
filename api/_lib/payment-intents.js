import { sbRest } from "./supabase.js";

const CYCLES = new Set(["monthly", "yearly", "lifetime"]);
const PROVIDERS = new Set(["paypal", "razorpay"]);
const CURRENCIES = new Set(["USD", "INR"]);

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) && email.length <= 160;
}

function validReference(value) {
  return /^[A-Za-z0-9_-]{8,120}$/.test(String(value || ""));
}

export function isProduction() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

export function simulatedPaymentsAllowed(provider) {
  if (isProduction()) return false;
  if (String(process.env.ALLOW_SIMULATED_PAYMENTS || "").toLowerCase() !== "true") return false;
  if (provider === "paypal") return String(process.env.PAYPAL_MODE || "sandbox").toLowerCase() !== "live";
  if (provider === "razorpay") return !String(process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_live");
  return false;
}

export async function createPaymentIntent({
  provider,
  orderId,
  email,
  cycle,
  amountMinor,
  currency
}) {
  const em = cleanEmail(email);
  if (!PROVIDERS.has(provider)) throw new Error("invalid_provider");
  if (!validReference(orderId)) throw new Error("invalid_provider_order");
  if (!validEmail(em)) throw new Error("invalid_email");
  if (!CYCLES.has(cycle)) throw new Error("invalid_cycle");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("invalid_amount");
  if (!CURRENCIES.has(currency)) throw new Error("invalid_currency");

  const result = await sbRest("vb_payment_intents", {
    method: "POST",
    prefer: "return=representation",
    body: {
      provider,
      provider_order_id: String(orderId),
      email: em,
      cycle,
      amount_minor: amountMinor,
      currency,
      status: "created",
      updated_at: new Date().toISOString()
    }
  });
  if (!result.ok) throw new Error("payment_intent_write_failed");
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

export async function getPaymentIntent(provider, orderId) {
  if (!PROVIDERS.has(provider) || !validReference(orderId)) return null;
  const result = await sbRest(
    `vb_payment_intents?provider=eq.${encodeURIComponent(provider)}` +
      `&provider_order_id=eq.${encodeURIComponent(String(orderId))}&select=*&limit=1`
  );
  if (!result.ok) throw new Error("payment_intent_read_failed");
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

export async function failPaymentIntent(provider, orderId) {
  if (!PROVIDERS.has(provider) || !orderId) return;
  await sbRest(
    `vb_payment_intents?provider=eq.${encodeURIComponent(provider)}` +
      `&provider_order_id=eq.${encodeURIComponent(String(orderId))}` +
      `&status=in.(created,processing)`,
    {
      method: "PATCH",
      body: { status: "failed", updated_at: new Date().toISOString() }
    }
  );
}

export async function finalizePaymentIntent(provider, orderId, verification) {
  const {
    paymentId,
    amountMinor,
    currency,
    providerStatus
  } = verification || {};
  if (!PROVIDERS.has(provider) || !validReference(orderId)) {
    throw new Error("invalid_payment_reference");
  }
  if (paymentId && !validReference(paymentId)) throw new Error("invalid_payment_id");
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("invalid_verified_amount");
  if (!CURRENCIES.has(currency)) throw new Error("invalid_verified_currency");
  if (!providerStatus) throw new Error("missing_provider_status");
  const result = await sbRest("rpc/xcoda_finalize_payment", {
    method: "POST",
    body: {
      p_provider: provider,
      p_provider_order_id: String(orderId),
      p_provider_payment_id: paymentId ? String(paymentId) : null,
      p_verified_amount_minor: amountMinor,
      p_verified_currency: currency,
      p_provider_status: String(providerStatus)
    }
  });
  if (!result.ok) throw new Error("payment_finalize_failed");
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error("payment_finalize_empty");
  return {
    email: row.email,
    cycle: row.cycle,
    expiresAt: row.expires_at || null,
    userId: row.user_id || null,
    duplicate: !!row.duplicate
  };
}
