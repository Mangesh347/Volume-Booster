/**
 * POST /api/entitlement/activate — license or email → Pro status (after payment)
 */
import { verifyLicense, normalizeEmail, getAccessForUser, recordEntitlement } from "../_lib/entitlement.js";
import { findUserIdByEmail } from "../_lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { license, email } = req.body || {};

    if (license) {
      const checked = verifyLicense(license);
      if (!checked.ok) return res.status(400).json({ error: checked.error, pro: false, plan: "free" });
      const userId = await findUserIdByEmail(checked.email);
      if (userId) {
        await recordEntitlement({
          email: checked.email,
          cycle: checked.cycle,
          expiresAt: checked.expiresAt,
          provider: "manual",
          orderId: `license_${Date.now()}`,
          licenseKey: String(license).slice(0, 120),
          userId
        });
      }
      return res.status(200).json({
        success: true,
        pro: true,
        plan: "pro",
        email: checked.email,
        cycle: checked.cycle,
        expiresAt: checked.expiresAt
      });
    }

    const em = normalizeEmail(email);
    if (!em.includes("@")) return res.status(400).json({ error: "email or license required", plan: "free" });

    const userId = await findUserIdByEmail(em);
    const access = await getAccessForUser({ userId, email: em });
    if (access.plan === "pro") {
      return res.status(200).json({
        success: true,
        pro: true,
        plan: "pro",
        email: em,
        cycle: access.cycle,
        expiresAt: access.expiresAt
      });
    }

    return res.status(200).json({
      success: true,
      pro: false,
      plan: "free",
      email: em,
      cycle: null,
      expiresAt: null,
      reason: "no_active_pro"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err), plan: "free", pro: false });
  }
}
