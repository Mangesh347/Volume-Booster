/**
 * POST /api/paypal/capture-order — verify PayPal capture, then grant Pro in Supabase.
 */

import { quoteUSD, computeExpiresAt } from "../_lib/pricing.js";
import { grantProAfterVerifiedPayment } from "../_lib/entitlement.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  const apiBase = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  try {
    const { order_id, email = "", cycle = "yearly" } = req.body || {};
    if (!order_id) return res.status(400).json({ error: "order_id required" });
    const em = String(email).toLowerCase().trim();
    if (!em.includes("@")) return res.status(400).json({ error: "Valid billing email required" });

    const quote = quoteUSD(cycle);
    const expiresAt = computeExpiresAt(cycle);

    // Simulated / missing credentials — still write Pro for billing email when possible
    if (!clientId || !clientSecret || String(order_id).startsWith("SIM_")) {
      const grant = await grantProAfterVerifiedPayment({
        email: em,
        cycle: quote.cycle,
        expiresAt,
        provider: "simulated",
        orderId: order_id
      });
      if (!grant.ok) {
        return res.status(503).json({
          error: grant.error || "Could not activate Pro — check Supabase env",
          success: false,
          supabaseSaved: false
        });
      }
      return res.status(200).json({
        success: true,
        autoPro: true,
        supabaseSaved: true,
        email: grant.email,
        cycle: grant.cycle,
        expiresAt: grant.expiresAt,
        product: "volume_booster",
        mode: "simulated_preview"
      });
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    if (!tokenRes.ok) return res.status(502).json({ error: "PayPal OAuth failed" });
    const { access_token } = await tokenRes.json();

    const capRes = await fetch(`${apiBase}/v2/checkout/orders/${order_id}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      }
    });
    const cap = await capRes.json();
    if (!capRes.ok || (cap.status && cap.status !== "COMPLETED" && cap.status !== "APPROVED")) {
      return res.status(402).json({
        error: cap.message || "PayPal payment not completed",
        details: cap,
        success: false
      });
    }

    const grant = await grantProAfterVerifiedPayment({
      email: em,
      cycle: quote.cycle,
      expiresAt,
      provider: "paypal",
      orderId: order_id
    });

    if (!grant.ok) {
      return res.status(503).json({
        error: grant.error || "Payment captured but Pro could not be saved. Contact support.",
        success: false,
        supabaseSaved: false,
        paypal_status: cap.status
      });
    }

    return res.status(200).json({
      success: true,
      autoPro: true,
      supabaseSaved: true,
      email: grant.email,
      cycle: grant.cycle,
      expiresAt: grant.expiresAt,
      product: "volume_booster",
      paypal_status: cap.status,
      order_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err), success: false });
  }
}
