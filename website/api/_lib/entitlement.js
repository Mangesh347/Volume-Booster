/**
 * Shared Volume Booster entitlement helpers (signed license, optional Supabase).
 */
import crypto from "crypto";

const PRODUCT = "volume_booster";

function secret() {
  return (
    process.env.ENTITLEMENT_SECRET ||
    process.env.PAYPAL_CLIENT_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    ""
  );
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function signLicense({ email, cycle, expiresAt }) {
  const payload = {
    v: 1,
    product: PRODUCT,
    email: normalizeEmail(email),
    cycle: cycle || "yearly",
    expiresAt: expiresAt || null,
    issuedAt: new Date().toISOString()
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = secret();
  if (!key) return { license: `VBDEV.${body}`, payload, mode: "unsigned_dev" };
  const sig = crypto.createHmac("sha256", key).update(body).digest("base64url");
  return { license: `VB1.${body}.${sig}`, payload, mode: "signed" };
}

export function verifyLicense(license) {
  const raw = String(license || "").trim();
  if (!raw) return { ok: false, error: "Missing license" };

  if (raw.startsWith("VBDEV.")) {
    try {
      const payload = JSON.parse(Buffer.from(raw.slice(6), "base64url").toString("utf8"));
      return validatePayload(payload, "unsigned_dev");
    } catch {
      return { ok: false, error: "Invalid license" };
    }
  }

  if (!raw.startsWith("VB1.")) return { ok: false, error: "Unknown license format" };
  const parts = raw.split(".");
  if (parts.length !== 3) return { ok: false, error: "Invalid license" };
  const [, body, sig] = parts;
  const key = secret();
  if (!key) return { ok: false, error: "Server missing ENTITLEMENT_SECRET" };
  const expected = crypto.createHmac("sha256", key).update(body).digest("base64url");
  if (expected !== sig) return { ok: false, error: "License signature mismatch" };
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return validatePayload(payload, "signed");
  } catch {
    return { ok: false, error: "Invalid license payload" };
  }
}

function validatePayload(payload, mode) {
  if (!payload || payload.product !== PRODUCT) return { ok: false, error: "Wrong product" };
  if (!payload.email || !payload.email.includes("@")) return { ok: false, error: "Invalid email in license" };
  if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: "License expired" };
  }
  return {
    ok: true,
    mode,
    email: payload.email,
    cycle: payload.cycle,
    expiresAt: payload.expiresAt || null,
    pro: true
  };
}

/** Best-effort record (optional). Never fails the payment if Supabase is missing. */
export async function recordEntitlement({ email, cycle, expiresAt, provider, orderId }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { recorded: false, reason: "no_supabase" };

  try {
    const row = {
      email: normalizeEmail(email),
      product: PRODUCT,
      cycle: cycle || "yearly",
      expires_at: expiresAt,
      provider: provider || "unknown",
      order_id: orderId || null,
      pro: true,
      updated_at: new Date().toISOString()
    };
    const res = await fetch(`${url}/rest/v1/vb_entitlements`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(row)
    });
    return { recorded: res.ok, status: res.status };
  } catch (err) {
    return { recorded: false, reason: err.message || String(err) };
  }
}
