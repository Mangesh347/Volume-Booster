/**
 * POST /api/razorpay/verify-payment — Auralis Pro
 */

import crypto from "crypto";
import { quoteINR, computeExpiresAt } from "../_lib/pricing.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email = "",
      cycle = "yearly"
    } = req.body || {};

    const quote = quoteINR(cycle);
    const expiresAt = computeExpiresAt(cycle);

    if (!keySecret || String(razorpay_order_id || "").startsWith("SIM_")) {
      return res.status(200).json({
        success: true,
        email: String(email).toLowerCase().trim(),
        cycle: quote.cycle,
        expiresAt,
        product: "auralis",
        mode: "simulated_preview"
      });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay verification fields" });
    }

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    return res.status(200).json({
      success: true,
      email: String(email).toLowerCase().trim(),
      cycle: quote.cycle,
      expiresAt,
      product: "auralis",
      razorpay_order_id,
      razorpay_payment_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
