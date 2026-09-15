# Volume Booster — Supabase + Google setup

## 1. Supabase SQL
Run `supabase/vb_schema.sql` in the Supabase SQL Editor.

## 2. Enable Google provider
Supabase → Authentication → Providers → Google  
Add the same Web Client ID / Secret from Google Cloud Console.

Authorized JavaScript origins:
- https://volume-booster-ten.vercel.app

Authorized redirect URIs (Supabase callback):
- https://YOUR_PROJECT.supabase.co/auth/v1/callback

## 3. Vercel env (volume-booster-ten)
Copy from `.env.example`:
SITE_URL, PayPal, Razorpay, SUPABASE_*, GOOGLE_CLIENT_ID, ENTITLEMENT_SECRET

## 4. User flow
1. Open /auth.html → Sign in with Google  
2. Pay on /checkout.html with the same email  
3. Extension → Google sign-in (opens auth) → Sync Pro  
4. `/api/user/access` returns `{ plan: "pro" | "free" }`
