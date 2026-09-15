# Changelog

## 2.9.8 — 2026-09-15

- Success page no longer opens `chrome-extension://…` (caused `ERR_BLOCKED_BY_CLIENT`). Pings extension + tells user to click the toolbar icon.

## 2.9.7 — 2026-09-15

- Checkout: pay → **verify** → redirect `/success.html` (no license / Unlock / gear / Google on payment).
- Fail verify → back to `/checkout.html` with error.
- Success page re-checks Pro on billing email, then opens the extension.

## 2.9.6 — 2026-09-15

- Checkout rebuilt to match [Screen Time Tracker](https://screen-time-tracker-seven.vercel.app/checkout.html?cycle=yearly): Home, billing email, PayPal/Razorpay, “Continue with card / UPI”, **pay → verify → auto Pro** (no license / Unlock / gear).
- **Auto Pro:** verified payment writes Supabase Pro + deadline for billing email; extension syncs Free when expired.
- Volume dial: continuously animated wavy ring with smooth Slate→Orange→Magenta→Blue→Teal gradient.

## 2.9.5 — 2026-09-15

- Volume dial is now the **Screen Time Tracker wavy ring**: hollow 10-lobe path, multi-color segments (blue / teal / slate / orange / magenta), live `%` in the center.

## 2.9.4 — 2026-09-15

- Restored original **solid scalloped dial**; center still shows live boost `%`.
- Website checkout matched to Screen Time Tracker payment flow; **no website signup/login** (`/auth` → checkout).
- Pro unlocks in the extension on the billing email only.

## 2.9.3 — 2026-09-15

- Google sign-in is **in-extension only** (Google OAuth → Supabase id_token). No website login page.
- Dial shows live boost **percentage** (e.g. `100%`, `200%`) fixed in center; ring progress tracks the slider.

## 2.9.2 — 2026-09-15

- Google login via `/auth-ext.html` (Google GIS → Supabase → extension) — fixes `server_error` / nonce issues.
- Tab renamed **Leaderboards**; dial shows actual boost number (100, 200…).
- Tracks music/video sites only when media is playing; guest usage merges to Supabase on login (`/api/usage/merge`).

## 2.9.0 — 2026-09-15

- Exact dreamstime-style seal dial (32 scallops) with spin; presets 1×–Max removed.
- Continuous looping wave line under dial for boost feel.
- Simpler Boost features (Clear/Bass/Voice/Movie) + Pro music ad block toggle.
- Boards & You tabs: Instagram-style stories rail, feed cards, profile stats.

## 2.8.0 — 2026-09-15

- Dial shape replaced with uniform seal scallops (img 2 geometry) — old irregular wavy dial removed.
- Continue with Google runs inside the extension via `chrome.identity` (no website redirect).
- Profile fills from Google name/photo/email; name, email, bio, avatar editable anytime.
- Boards: Websites / Global / Country — music & video sites only, with favicons + listen time (Screen Time–style).

## 2.7.1 — 2026-09-15

- Guest accounts with persistent `VB-GUEST-*` id; boost works without login.
- Leaderboards hidden until sign-in; Profile tab shows guest id + login form.

## 2.7.0 — 2026-09-15

- Guest mode: auto `VB-GUEST-*` id — boost works without sign-in.
- Leaderboards + profile sync require login; Boards tab shows sign-in prompt for guests.
- Continue with Google (logo) or email login / create account on Profile tab.
- Leaderboards (Global / Country / This site) gated behind sign-in; listen-time via heartbeat API.
- Editable profile: display name, avatar URL, bio, country; sign out.
- Solid scalloped seal dial (filled, spinning) — irregular wavy borders removed.
- Extension icons: scalloped seal + music note.
- APIs: `/api/leaderboard`, `/api/usage/heartbeat`, `/api/user/profile`.
- SQL: `supabase/vb_leaderboard.sql` (run after `vb_schema.sql`).

## 2.6.0 — 2026-09-15

- Supabase Pro/Free verification (`vb_profiles`, `vb_entitlements`).
- Google sign-in on `/auth.html` + extension Sync Pro via `/api/user/access`.
- Payments record entitlements into Supabase and upgrade profile to Pro.

## 2.5.2 — 2026-09-15

- Marketing homepage restored at repo root `index.html` so Vercel/GitHub Pages open the site directly.
- `website/` kept in sync; old privacy-only page remains removed.

## 2.5.1 — 2026-09-14

- Removed old privacy-only homepage and root site duplicates.
- Site content lives only in `website/` (homepage + legal + checkout).
- Vercel rewrites `/` → `website/index.html`.

## 2.4.0 — 2026-09-14

- Simplified SoundBlast Material UI: On/Off, Boost dial, presets, Sound Quality only.
- Mathematical concentric wavy rings (not organic blobs); rotate only when On.
- Quiet–Max slider, Safe Boost pill, settings gear for Auto/Save/Reset/Pro.
- Softer DSP ramps + high-boost compression for clear, smooth volume.

## 2.3.0 — 2026-09-14

- Auralis website + PayPal/Razorpay checkout (see `website/`).

## 2.2.0 — 2026-09-14

- Volume-first wavy Material redesign + Soft Clear DSP.
