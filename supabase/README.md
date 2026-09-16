# XCoda — Supabase + Google setup

## 1. Supabase SQL
1. Run `supabase/vb_schema.sql` in the Supabase SQL Editor.
2. Run `supabase/xcoda_security.sql` for payment intents, atomic finalization, authenticated Realtime profile access, and API rate limiting.

`vb_leaderboard.sql` is legacy only. XCoda no longer collects listening analytics.

Apply `xcoda_security.sql` before deploying v2.11.7 APIs. The migration intentionally fails if duplicate provider payment IDs already exist; investigate those rows instead of deleting them automatically.

Renewal contract:
- Monthly extends the current effective deadline by one calendar month.
- Yearly extends it by one calendar year.
- Monthly + Yearly is stored as `stacked` on `vb_profiles`, with the cumulative deadline.
- Lifetime keeps `expires_at = NULL` permanently, even if another fixed-term plan is purchased later.

The migration also repairs existing profiles that incorrectly show Yearly after a Lifetime purchase. It only trusts active PayPal/Razorpay Lifetime rows with a provider order reference. The authenticated access API repeats this reconciliation safely on later popup checks and never replaces access with a shorter deadline.

## 2. Enable Google provider
Supabase → Authentication → Providers → Google  
Add the same Web Client ID / Secret from Google Cloud Console.

Also enable **Email** provider for create-account / login in the extension.

## 3. Google Cloud Console (required for in-extension login)

OAuth client type: **Web application**

Authorized redirect URIs — add exactly (trailing slash matters):
```
https://khiccfmolhkliobmkflgbpefpgeajhpb.chromiumapp.org/
```
(Or whatever `chrome.identity.getRedirectURL()` shows for your unpacked/store ID.)

Authorized JavaScript origins (optional, website tools only):
- `https://volume-booster-ten.vercel.app`

Extension login does **not** use a website page — popup opens Google → Chromium redirect → Supabase `id_token`.

## 4. Vercel env (volume-booster-ten)
Copy from `.env.example`:
SITE_URL, PayPal, Razorpay, SUPABASE_*, GOOGLE_CLIENT_ID, ENTITLEMENT_SECRET, RATE_LIMIT_SECRET

`GOOGLE_CLIENT_ID` must be the same Web client ID used in Supabase Google provider.
