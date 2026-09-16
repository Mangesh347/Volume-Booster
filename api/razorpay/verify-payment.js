/**
 * POST /api/razorpay/verify-payment — Pro ONLY after Razorpay HMAC succeeds.
 */

import crypto from "crypto";
import {
  finalizePaymentIntent,
  getPaymentIntent,
  simulatedPaymentsAllowed
} from "../_lib/payment-intents.js";
import { secureApi, safeApiError } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!await secureApi(req, res, {
    methods: ["POST"],
    rateLimit: {
      scope: "razorpay-verify",
      max: 12,
      windowSeconds: 600,
      identity: String(req.body?.razorpay_order_id || "")
    }
  })) return;

  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const keyId = process.env.RAZORPAY_KEY_ID || "";

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};
    if (!/^(?:order_|SIM_)[A-Za-z0-9_-]{6,100}$/.test(String(razorpay_order_id || ""))) {
      return res.status(400).json({ error: "Valid payment reference required.", success: false });
    }

    const intent = await getPaymentIntent("razorpay", razorpay_order_id);
    if (!intent) {
      return res.status(404).json({ error: "Payment session not found", success: false });
    }

    if (!keyId || !keySecret || String(razorpay_order_id || "").startsWith("SIM_")) {
      if (!simulatedPaymentsAllowed("razorpay")) {
        return res.status(402).json({
          error: "Payment not verified by Razorpay — Pro not granted",
          success: false,
          supabaseSaved: false
        });
      }
      const grant = await finalizePaymentIntent(
        "razorpay",
        razorpay_order_id,
        {
          paymentId: razorpay_payment_id || razorpay_order_id,
          amountMinor: Number(intent.amount_minor),
          currency: intent.currency,
          providerStatus: "SIMULATED"
        }
      );
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

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay verification fields", success: false });
    }
    if (
      !/^pay_[A-Za-z0-9_-]{6,100}$/.test(String(razorpay_payment_id)) ||
      !/^[a-f0-9]{64}$/i.test(String(razorpay_signature))
    ) {
      return res.status(400).json({ error: "Invalid Razorpay verification fields.", success: false });
    }

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(String(razorpay_signature || ""), "hex");
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return res.status(400).json({
        error: "Invalid payment signature — Pro not granted",
        success: false,
        supabaseSaved: false
      });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const [paymentRes, orderRes] = await Promise.all([
      fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
        { headers: { Authorization: `Basic ${auth}` } }
      ),
      fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`,
        { headers: { Authorization: `Basic ${auth}` } }
      )
    ]);
    const [payment, order] = await Promise.all([
      paymentRes.json().catch(() => ({})),
      orderRes.json().catch(() => ({}))
    ]);
    if (
      !paymentRes.ok ||
      !orderRes.ok ||
      payment.id !== razorpay_payment_id ||
      payment.entity !== "payment" ||
      payment.status !== "captured" ||
      payment.captured !== true ||
      String(payment.order_id || "") !== String(razorpay_order_id) ||
      Number(payment.amount) !== Number(intent.amount_minor) ||
      String(payment.currency || "") !== String(intent.currency) ||
      order.id !== razorpay_order_id ||
      order.entity !== "order" ||
      order.status !== "paid" ||
      Number(order.amount) !== Number(intent.amount_minor) ||
      Number(order.amount_paid) !== Number(intent.amount_minor) ||
      Number(order.amount_due) !== 0 ||
      String(order.currency || "") !== String(intent.currency) ||
      !String(order.receipt || "").startsWith(`xcoda_${intent.cycle}_`) ||
      order.notes?.product !== "xcoda" ||
      order.notes?.cycle !== intent.cycle
    ) {
      return res.status(409).json({
        error: "Razorpay payment details did not match the XCoda order",
        success: false,
        supabaseSaved: false
      });
    }

    const grant = await finalizePaymentIntent(
      "razorpay",
      razorpay_order_id,
      {
        paymentId: razorpay_payment_id,
        amountMinor: Number(payment.amount),
        currency: payment.currency,
        providerStatus: payment.status
      }
    );
    return res.status(200).json({
      success: true,
      autoPro: true,
      supabaseSaved: true,
      email: grant.email,
      cycle: grant.cycle,
      expiresAt: grant.expiresAt,
      product: "volume_booster",
      razorpay_order_id,
      razorpay_payment_id
    });
  } catch (err) {
    console.error("razorpay_verify_failed", err);
    return safeApiError(res, 500, "Payment verification could not finish. Please try again.");
  }
}
