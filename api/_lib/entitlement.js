/**
 * Volume Booster entitlement — signed license + Supabase Pro/Free.
 */
import crypto from "crypto";
import { sbRest, findUserIdByEmail, supabaseConfig } from "./supabase.js";

export const PRODUCT = "volume_booster";

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

export function isProActive(plan, expiresAt) {
  if (plan !== "pro") return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
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

export async function ensureProfile({ userId, email }) {
  if (!userId) return null;
  const em = normalizeEmail(email);
  const get = await sbRest(
    `vb_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
  );
  if (get.ok && Array.isArray(get.data) && get.data[0]) {
    if (em && get.data[0].email !== em) {
      await sbRest(`vb_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: { email: em, updated_at: new Date().toISOString() }
      });
    }
    return get.data[0];
  }
  const ins = await sbRest("vb_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: userId,
      email: em || null,
      plan: "free",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  });
  return Array.isArray(ins.data) ? ins.data[0] : ins.data;
}

export async function upgradeProfileToPro({ userId, email, cycle, expiresAt }) {
  if (!userId) return { ok: false };
  await ensureProfile({ userId, email });
  const res = await sbRest(`vb_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      plan: "pro",
      cycle: cycle || "yearly",
      expires_at: expiresAt || null,
      email: normalizeEmail(email) || undefined,
      updated_at: new Date().toISOString()
    }
  });
  return { ok: res.ok, profile: Array.isArray(res.data) ? res.data[0] : res.data };
}

export async function getAccessForUser({ userId, email }) {
  const em = normalizeEmail(email);
  if (userId) {
    const prof = await sbRest(
      `vb_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
    );
    if (prof.ok && Array.isArray(prof.data) && prof.data[0]) {
      const p = prof.data[0];
      if (isProActive(p.plan, p.expires_at)) {
        return { plan: "pro", cycle: p.cycle, expiresAt: p.expires_at, email: p.email || em };
      }
    }
  }

  if (em) {
    const ent = await sbRest(
      `vb_entitlements?email=eq.${encodeURIComponent(em)}&product=eq.${PRODUCT}&status=eq.active&pro=eq.true&select=*&order=updated_at.desc&limit=1`
    );
    if (ent.ok && Array.isArray(ent.data) && ent.data[0]) {
      const row = ent.data[0];
      if (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()) {
        if (userId) {
          await upgradeProfileToPro({
            userId,
            email: em,
            cycle: row.cycle,
            expiresAt: row.expires_at
          });
        }
        return { plan: "pro", cycle: row.cycle, expiresAt: row.expires_at, email: em };
      }
    }
  }

  return { plan: "free", cycle: null, expiresAt: null, email: em || null };
}

export async function recordEntitlement({
  email,
  cycle,
  expiresAt,
  provider,
  orderId,
  licenseKey,
  userId = null
}) {
  const { ok } = supabaseConfig();
  if (!ok) return { recorded: false, reason: "no_supabase" };

  const em = normalizeEmail(email);
  let resolvedUserId = userId;
  if (!resolvedUserId && em) {
    resolvedUserId = await findUserIdByEmail(em);
  }

  try {
    const row = {
      email: em,
      user_id: resolvedUserId || null,
      product: PRODUCT,
      cycle: cycle || "yearly",
      expires_at: expiresAt || null,
      provider: provider || "manual",
      order_id: orderId || null,
      license_key: licenseKey || null,
      status: "active",
      pro: true,
      updated_at: new Date().toISOString()
    };

    const res = await sbRest("vb_entitlements", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: row
    });

    if (resolvedUserId) {
      await upgradeProfileToPro({
        userId: resolvedUserId,
        email: em,
        cycle: cycle || "yearly",
        expiresAt
      });
    }

    return { recorded: res.ok, status: res.status, userId: resolvedUserId };
  } catch (err) {
    return { recorded: false, reason: err.message || String(err) };
  }
}
