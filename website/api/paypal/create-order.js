/**
 * POST /api/paypal/create-order — Auralis Pro
 */

import { quoteUSD } from "../_lib/pricing.js";

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
    const { cycle = "yearly", email = "" } = req.body || {};
    const quote = quoteUSD(cycle);
    const validatedAmount = quote.total.toFixed(2);

    if (!clientId || !clientSecret) {
      return res.status(200).json({
        success: true,
        order_id: `SIM_AURALIS_PP_${Date.now()}`,
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
      const errText = await tokenRes.text();
      return res.status(502).json({ error: `PayPal OAuth token error: ${errText}` });
    }
    const { access_token } = await tokenRes.json();

    const origin = process.env.SITE_URL || `https://${req.headers.host}`;
    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `auralis_pro_${quote.cycle}_${Date.now()}`,
          description: `${quote.desc} (incl. GST ${Math.round(quote.gstRate * 100)}%)`,
          custom_id: JSON.stringify({
            email: String(email || "").toLowerCase().trim(),
            product: "auralis",
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
        brand_name: "Auralis Pro",
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
      return res.status(502).json({ error: order.message || "PayPal order create failed", details: order });
    }

    const approve = (order.links || []).find((l) => l.rel === "approve");
    return res.status(200).json({
      success: true,
      order_id: order.id,
      status: order.status,
      approve_url: approve?.href || null,
      amount: validatedAmount,
      currency: "USD",
      quote
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
