/**
 * POST /api/paypal/create-order — XCoda Pro
 */

import { quoteUSD } from "../_lib/pricing.js";
import {
  createPaymentIntent,
  simulatedPaymentsAllowed
} from "../_lib/payment-intents.js";
import { secureApi, safeApiError } from "../_lib/http.js";

export default async function handler(req, res) {
  const requestEmail = String(req.body?.email || "").trim().toLowerCase();
  if (!await secureApi(req, res, {
    methods: ["POST"],
    rateLimit: { scope: "paypal-create", max: 8, windowSeconds: 600, identity: requestEmail }
  })) return;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  const apiBase = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  try {
    const { cycle = "yearly", email = "" } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@") || normalizedEmail.length > 160) {
      return res.status(400).json({ error: "Valid XCoda account email required" });
    }
    const quote = quoteUSD(cycle);
    const validatedAmount = quote.total.toFixed(2);
    const amountMinor = Math.round(quote.total * 100);

    if (!clientId || !clientSecret) {
      if (!simulatedPaymentsAllowed("paypal")) {
        return res.status(503).json({ error: "PayPal checkout is temporarily unavailable" });
      }
      const orderId = `SIM_XCODA_PP_${Date.now()}`;
      await createPaymentIntent({
        provider: "paypal",
        orderId,
        email: normalizedEmail,
        cycle: quote.cycle,
        amountMinor,
        currency: "USD"
      });
      return res.status(200).json({
        success: true,
        order_id: orderId,
        status: "CREATED",
        amount: validatedAmount,
        currency: "USD",
        quote,
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
    if (!tokenRes.ok) {
      return safeApiError(res, 502, "PayPal is temporarily unavailable.");
    }
    const { access_token } = await tokenRes.json();

    const origin = process.env.SITE_URL || `https://${req.headers.host}`;
    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `xcoda_pro_${quote.cycle}_${Date.now()}`,
          description: `${quote.desc} (incl. GST ${Math.round(quote.gstRate * 100)}%)`,
          custom_id: JSON.stringify({
            product: "xcoda",
            plan: "pro",
            cycle: quote.cycle,
            subtotal: quote.subtotal,
            gst: quote.gst
          }),
          amount: {
            currency_code: "USD",
            value: validatedAmount,
            breakdown: {
              item_total: { currency_code: "USD", value: quote.subtotal.toFixed(2) },
              tax_total: { currency_code: "USD", value: quote.gst.toFixed(2) }
            }
          },
          items: [
            {
              name: quote.name,
              quantity: "1",
              unit_amount: { currency_code: "USD", value: quote.subtotal.toFixed(2) },
              category: "DIGITAL_GOODS"
            }
          ]
        }
      ],
      application_context: {
        brand_name: "XCoda Pro",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${origin}/checkout.html`,
        cancel_url: `${origin}/checkout.html?cancelled=1`
      }
    };

    const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderPayload)
    });
    const order = await orderRes.json();
    if (!orderRes.ok) {
      return safeApiError(res, 502, "PayPal could not start checkout.");
    }

    const approve = (order.links || []).find((l) => l.rel === "approve");
    let approveUrl = null;
    try {
      const parsed = new URL(approve?.href || "");
      if (parsed.protocol === "https:" && /(^|\.)paypal\.com$/i.test(parsed.hostname)) {
        approveUrl = parsed.toString();
      }
    } catch {}
    if (
      !/^[A-Za-z0-9_-]{8,100}$/.test(String(order.id || "")) ||
      order.status !== "CREATED" ||
      !approveUrl
    ) {
      return safeApiError(res, 502, "PayPal returned an invalid checkout order.");
    }
    await createPaymentIntent({
      provider: "paypal",
      orderId: order.id,
      email: normalizedEmail,
      cycle: quote.cycle,
      amountMinor,
      currency: "USD"
    });
    return res.status(200).json({
      success: true,
      order_id: order.id,
      status: order.status,
      approve_url: approveUrl,
      amount: validatedAmount,
      currency: "USD",
      quote
    });
  } catch (err) {
    console.error("paypal_create_failed", err);
    return safeApiError(res, 500, "Checkout could not start. Please try again.");
  }
}
