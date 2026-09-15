/**
 * POST /api/entitlement/activate — verify license or look up email after payment
 */
import { verifyLicense, normalizeEmail } from "../_lib/entitlement.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { license, email } = req.body || {};

    if (license) {
      const checked = verifyLicense(license);
      if (!checked.ok) return res.status(400).json({ error: checked.error, pro: false });
      return res.status(200).json({
        success: true,
        pro: true,
        email: checked.email,
        cycle: checked.cycle,
        expiresAt: checked.expiresAt
      });
    }

    // Email-only: allow activation when user already paid (honor + optional Supabase)
    const em = normalizeEmail(email);
    if (!em.includes("@")) return res.status(400).json({ error: "email or license required" });

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const q = await fetch(
        `${url}/rest/v1/vb_entitlements?email=eq.${encodeURIComponent(em)}&product=eq.volume_booster&pro=eq.true&select=email,cycle,expires_at&order=updated_at.desc&limit=1`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`
          }
        }
      );
      if (q.ok) {
        const rows = await q.json();
        if (rows && rows[0]) {
          const row = rows[0];
          if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
            return res.status(403).json({ error: "Pro expired", pro: false });
          }
          return res.status(200).json({
            success: true,
            pro: true,
            email: row.email,
            cycle: row.cycle,
            expiresAt: row.expires_at || null
          });
        }
      }
    }

    // Fallback: unlock with billing email (same as previous local Unlock)
    return res.status(200).json({
      success: true,
      pro: true,
      email: em,
      cycle: "yearly",
      expiresAt: null,
      mode: "email_activate"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
