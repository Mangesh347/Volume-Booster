# Auralis website — deploy notes

## Brand
**Auralis** — soft clear Chrome volume booster (original Fenwick Labs name; not affiliated with FxSound).

## Deploy (Vercel)
1. Import folder `soundblast/website` as a Vercel project.
2. Set env vars (same pattern as [Screen Time Tracker](https://screen-time-tracker-seven.vercel.app/)):
   - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_MODE` (`sandbox` or `live`)
   - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
   - `INR_USD_RATE` (default `95.12`)
   - `SITE_URL` (e.g. `https://auralis.vercel.app`)
3. Deploy. Without keys, checkout runs in **simulated_preview** mode for UI testing.

## Pricing (matches STT structure)
| Plan | USD | ≈ INR (tax included @ 95.12) |
|------|-----|------------------------------|
| Monthly | $3.99 | ₹380 |
| Yearly | $29.99 | ₹2,853 |
| Lifetime | $79.99 | ₹7,609 |
