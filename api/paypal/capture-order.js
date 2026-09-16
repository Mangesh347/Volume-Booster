/**
 * POST /api/paypal/capture-order — Pro ONLY after PayPal capture succeeds.
 */

import {
  finalizePaymentIntent,
  getPaymentIntent,
  simulatedPaymentsAllowed
} from "../_lib/payment-intents.js";
import { secureApi, safeApiError } from "../_lib/http.js";

function usdToMinor(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value || ""));
  if (!match) return NaN;
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}

export default async function handler(req, res) {
  if (!await secureApi(req, res, {
    methods: ["POST"],
    rateLimit: {
      scope: "paypal-capture",
      max: 12,
      windowSeconds: 600,
      identity: String(req.body?.order_id || "")
    }
  })) return;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  const apiBase = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  try {
    const { order_id } = req.body || {};
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(order_id || ""))) {
      return res.status(400).json({ error: "Valid payment reference required.", success: false });
    }
    const intent = await getPaymentIntent("paypal", order_id);
    if (!intent) {
      return res.status(404).json({ error: "Payment session not found", success: false });
    }

    if (String(order_id).startsWith("SIM_") || !clientId || !clientSecret) {
      if (!simulatedPaymentsAllowed("paypal")) {
        return res.status(402).json({
          error: "Payment not verified by PayPal — Pro not granted",
          success: false,
          supabaseSaved: false
        });
      }
      const grant = await finalizePaymentIntent("paypal", order_id, {
        paymentId: order_id,
        amountMinor: Number(intent.amount_minor),
        currency: intent.currency,
        providerStatus: "SIMULATED"
      });
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

    if (intent.status === "completed") {
      const grant = await finalizePaymentIntent("paypal", order_id, {
        paymentId: intent.provider_payment_id,
        amountMinor: Number(intent.amount_minor),
        currency: intent.currency,
        providerStatus: "COMPLETED"
      });
      return res.status(200).json({
        success: true,
        autoPro: true,
        supabaseSaved: true,
        email: grant.email,
        cycle: grant.cycle,
        expiresAt: grant.expiresAt,
        product: "volume_booster",
        paypal_status: "COMPLETED",
        order_id,
        duplicate: true
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
    if (!tokenRes.ok) {
      return res.status(502).json({ error: "PayPal OAuth failed", success: false });
    }
    const { access_token } = await tokenRes.json();

    const capRes = await fetch(`${apiBase}/v2/checkout/orders/${order_id}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `xcoda-capture-${order_id}`.slice(0, 108)
      }
    });
    let cap = await capRes.json();
    if (!capRes.ok || cap.status !== "COMPLETED") {
      const orderCheck = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(order_id)}`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const checked = await orderCheck.json().catch(() => ({}));
      if (!orderCheck.ok || checked.status !== "COMPLETED") {
        return res.status(402).json({
          error: "PayPal payment is not completed",
          success: false,
          supabaseSaved: false
        });
      }
      cap = checked;
    }

    const purchaseUnits = Array.isArray(cap.purchase_units) ? cap.purchase_units : [];
    const captures = purchaseUnits[0]?.payments?.captures;
    const purchaseUnit = purchaseUnits[0];
    const capture = Array.isArray(captures) ? captures[0] : null;
    const paidCurrency = capture?.amount?.currency_code;
    const paidMinor = usdToMinor(capture?.amount?.value);
    let custom = {};
    try { custom = JSON.parse(purchaseUnit?.custom_id || "{}"); } catch {}
    const expectedMerchantId = String(process.env.PAYPAL_MERCHANT_ID || "");
    const expectedReceiver = String(process.env.PAYPAL_RECEIVER_EMAIL || "").toLowerCase();
    if (
      String(cap.id || "") !== String(order_id) ||
      cap.status !== "COMPLETED" ||
      purchaseUnits.length !== 1 ||
      !Array.isArray(captures) ||
      captures.length !== 1 ||
      !capture?.id ||
      capture.status !== "COMPLETED" ||
      capture.final_capture !== true ||
      paidCurrency !== intent.currency ||
      paidMinor !== Number(intent.amount_minor) ||
      !String(purchaseUnit.reference_id || "").startsWith(`xcoda_pro_${intent.cycle}_`) ||
      custom.product !== "xcoda" ||
      custom.plan !== "pro" ||
      custom.cycle !== intent.cycle ||
      (expectedMerchantId && purchaseUnit.payee?.merchant_id !== expectedMerchantId) ||
      (expectedReceiver &&
        String(purchaseUnit.payee?.email_address || "").toLowerCase() !== expectedReceiver)
    ) {
      return res.status(409).json({
        error: "PayPal payment details did not match the XCoda order",
        success: false,
        supabaseSaved: false
      });
    }

    const grant = await finalizePaymentIntent("paypal", order_id, {
      paymentId: capture.id,
      amountMinor: paidMinor,
      currency: paidCurrency,
      providerStatus: capture.status
    });
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
    console.error("paypal_capture_failed", err);
    return safeApiError(res, 500, "Payment verification could not finish. Please try again.");
  }
}
