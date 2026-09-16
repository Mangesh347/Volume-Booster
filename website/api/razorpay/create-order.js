/**
 * POST /api/razorpay/create-order — XCoda Pro (INR)
 */

import { quoteINR } from "../_lib/pricing.js";
import {
  createPaymentIntent,
  productionPaymentConfigError,
  simulatedPaymentsAllowed
} from "../_lib/payment-intents.js";
import { secureApi, safeApiError } from "../_lib/http.js";

export default async function handler(req, res) {
  const requestEmail = String(req.body?.email || "").trim().toLowerCase();
  if (!await secureApi(req, res, {
    methods: ["POST"],
    rateLimit: { scope: "razorpay-create", max: 8, windowSeconds: 600, identity: requestEmail }
  })) return;

  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (productionPaymentConfigError("razorpay")) {
    return res.status(503).json({ error: "Razorpay live checkout is temporarily unavailable" });
  }

  try {
    const { cycle = "yearly", email = "" } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@") || normalizedEmail.length > 160) {
      return res.status(400).json({ error: "Valid XCoda account email required" });
    }
    const quote = quoteINR(cycle);

    if (!keyId || !keySecret) {
      if (!simulatedPaymentsAllowed("razorpay")) {
        return res.status(503).json({ error: "Razorpay checkout is temporarily unavailable" });
      }
      const orderId = `SIM_XCODA_RZP_${Date.now()}`;
      await createPaymentIntent({
        provider: "razorpay",
        orderId,
        email: normalizedEmail,
        cycle: quote.cycle,
        amountMinor: quote.amountPaise,
        currency: "INR"
      });
      return res.status(200).json({
        success: true,
        order_id: orderId,
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
        receipt: `xcoda_${quote.cycle}_${Date.now()}`.slice(0, 40),
        notes: {
          product: "xcoda",
          cycle: quote.cycle
        }
      })
    });
    const order = await orderRes.json();
    if (!orderRes.ok) {
      return safeApiError(res, 502, "Razorpay could not start checkout.");
    }
    if (
      !/^order_[A-Za-z0-9_-]{6,100}$/.test(String(order.id || "")) ||
      order.entity !== "order" ||
      order.status !== "created" ||
      Number(order.amount) !== quote.amountPaise ||
      order.currency !== "INR"
    ) {
      return safeApiError(res, 502, "Razorpay returned an invalid checkout order.");
    }

    await createPaymentIntent({
      provider: "razorpay",
      orderId: order.id,
      email: normalizedEmail,
      cycle: quote.cycle,
      amountMinor: quote.amountPaise,
      currency: "INR"
    });
    return res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
      quote
    });
  } catch (err) {
    console.error("razorpay_create_failed", err);
    return safeApiError(res, 500, "Checkout could not start. Please try again.");
  }
}
