/**
 * POST /api/razorpay/create-order — Auralis Pro (INR)
 */

import { quoteINR } from "../_lib/pricing.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

  try {
    const { cycle = "yearly", email = "" } = req.body || {};
    const quote = quoteINR(cycle);

    if (!keyId || !keySecret) {
      return res.status(200).json({
        success: true,
        order_id: `SIM_AURALIS_RZP_${Date.now()}`,
        amount: quote.amountPaise,
        currency: "INR",
        key_id: "rzp_test_simulated",
        quote,
        mode: "simulated_preview"
      });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: quote.amountPaise,
        currency: "INR",
        receipt: `auralis_${quote.cycle}_${Date.now()}`.slice(0, 40),
        notes: {
          email: String(email || "").toLowerCase().trim(),
          product: "auralis",
          cycle: quote.cycle
        }
      })
    });
    const order = await orderRes.json();
    if (!orderRes.ok) {
      return res.status(502).json({ error: order.error?.description || "Razorpay order failed", details: order });
    }

    return res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
      quote
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
