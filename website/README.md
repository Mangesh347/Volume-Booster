# XCoda website — deploy notes

## Brand
**XCoda** — clear, powerful Chrome audio by Fenwick Labs.

## Deploy (Vercel)
1. Import folder `soundblast/website` as a Vercel project.
2. Set production environment variables:
   - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` from the PayPal **Live** app
   - `PAYPAL_MODE=live`
   - `PAYPAL_MERCHANT_ID` and/or `PAYPAL_RECEIVER_EMAIL` for recipient verification
   - `RAZORPAY_KEY_ID` beginning with `rzp_live_` / matching `RAZORPAY_KEY_SECRET`
   - `ALLOW_SIMULATED_PAYMENTS=false`
   - `INR_USD_RATE` (default `95.12`)
   - `SITE_URL` (the deployed XCoda website URL)
3. Deploy and make one low-value real purchase with each enabled provider. Production fails closed when live credentials are absent or a Razorpay test key is configured.

Simulated checkout is available only outside production when explicitly enabled. Never add test credentials to Vercel's Production environment.

## Pricing
- Monthly: $1.99
- Yearly: $12.99
- Lifetime: $100

Applicable tax and converted INR totals are calculated at checkout.
