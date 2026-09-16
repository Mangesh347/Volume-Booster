# XCoda website — deploy notes

## Brand
**XCoda** — clear, powerful Chrome audio by Fenwick Labs.

## Deploy (Vercel)
1. Import folder `soundblast/website` as a Vercel project.
2. Set env vars (same pattern as [Screen Time Tracker](https://screen-time-tracker-seven.vercel.app/)):
   - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_MODE` (`sandbox` or `live`)
   - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
   - `INR_USD_RATE` (default `95.12`)
   - `SITE_URL` (the deployed XCoda website URL)
3. Deploy. Without keys, checkout runs in **simulated_preview** mode for UI testing.

## Pricing
- Monthly: $1.99
- Yearly: $12.99
- Lifetime: $100

Applicable tax and converted INR totals are calculated at checkout.
