# Changelog

## 2.11.11 — 2026-09-16

- Completely removed retired leaderboard and listening-usage code, APIs, storage keys, styles, and legacy schema.
- Removed country/location handling from the popup and profile API; profile responses now use an explicit non-location field allowlist.
- Added an idempotent Supabase cleanup migration to delete historic listening statistics and the retired country column.
- Removed the unused guest identifier and two dead popup helpers.
- Fixed the visible profile bio so saved text is shown correctly.
- Fixed sound scenes being overwritten by retired hidden DSP controls during restore and power-on.
- Fixed Remember-site Off so it persists for the current tab without resetting the active boost badge.
- Fixed power-off ad-block shutdown and connected fast, ad-detected skip/mute behavior without affecting normal media.
- Removed obsolete auth messages, payment-pending storage, unused plan helpers, and orphaned popup styles.
- Added automated checks proving the store ZIP runtime contains no leaderboard, country, listening-statistics, usage, or guest-ID feature.

## Live payment readiness — 2026-09-16

- Switched local/default production PayPal mode from sandbox to live and disabled simulated payments.
- Production now fails closed unless PayPal uses live mode with configured credentials and Razorpay uses an `rzp_live_` key with its secret.
- Test, missing, or simulated credentials can no longer create or verify production payments or grant Pro.
- Kept sandbox simulation available only when explicitly enabled outside production.

## 2.11.10 — 2026-09-16

- Removed the redundant `scripting` permission and duplicate programmatic reinjection; declarative content scripts continue to provide the same cross-site audio behavior.
- Removed the redundant sensitive `tabs` permission while retaining the Tabs API calls supported by the required host access.
- Updated the manifest summary and added a ready-to-paste Chrome Web Store listing with exact permission and privacy declarations.
- Replaced the outdated analytics claim with an implementation-accurate privacy policy covering local settings, temporary session auth, optional profile data, payments, retention, and service providers.

## 2.11.9 — 2026-09-16

- Fixed Chrome’s autoplay warning by creating and resuming XCoda’s AudioContext only after a real page gesture.
- Excluded the Google account chooser from audio-script injection.
- Kept playback buffering and tab/window/desktop recovery from v2.11.8 without starting audio on non-media pages.

## 2.11.8 — 2026-09-16

- Simplified the Boost, Pro, and You tab copy so each area presents one clear benefit or next action.
- Replaced technical plan, sign-in, sync, and payment wording with concise customer-facing messages while preserving all security behavior.
- Refined the landing page, pricing, checkout, and payment confirmation voice around outcomes and positive moments.
- Added warmer Pro-active feedback and shorter loading, success, offline, and error states.
- Made the existing XCoda waveform logo larger across the popup, website, checkout, and confirmation surfaces.
- Prevented audio breakup during tab, Chrome window, and Windows desktop switches with a playback-stable audio context and automatic context recovery; the v2.11.0 DSP curve remains unchanged.

## 2.11.7 — 2026-09-16

- Added a verified-Pro popup treatment that preserves the existing layout while elevating the header, plan strip, dial, waveform, active tab, and Pro card.
- Added cumulative calendar renewals: Monthly adds one calendar month, Yearly adds one calendar year, mixed purchases become Stacked access, and Lifetime can never be shortened.
- Added safe automatic Lifetime repair: provider-backed Lifetime ledger rows backfill incorrect profiles during migration and self-heal authenticated access checks thereafter.
- Updated the popup and payment confirmation to show the authoritative cumulative deadline with local date and time.
- Confirmed public pricing everywhere: $1.99/month, $12.99/year (Best value), and $100 lifetime.
- Moved Supabase sessions, email, profile, and plan snapshots out of persistent Chrome storage into trusted `chrome.storage.session`; logout now clears access immediately.
- Added authenticated Supabase Realtime profile updates, a 30-second open-popup fallback check, a five-minute service-worker check, and exact expiry handling.
- Payment success now sends only a generic refresh signal; only authenticated server access can change the popup to Pro.
- Hardened payment finalization with immutable Supabase intents, atomic/idempotent RPC updates, lifetime-preserving renewals, strict provider reconciliation, and persistent rate limiting.
- Added exact PayPal capture-count/final-capture/payee checks with an idempotency key, plus Razorpay payment-and-order reconciliation for captured state, amount, currency, receipt, and plan notes.
- Added immutable intent guards, unique provider payment IDs, replay-ID rejection, provider facts passed into the finalization RPC, and email-scoped renewal locks.
- Removed the nonce-free Google fallback and guarded refresh/plan writes against completing after logout or account replacement.
- Removed the page-visible audio command bridge and web-accessible engine; DSP now runs in the extension’s isolated world with bounded commands.
- Replaced wildcard API CORS and internal errors with exact origins, request limits, safe responses, and website security headers.
- Disabled the retired listening analytics and leaderboard endpoints.

## 2.11.6 — 2026-09-16

- Rebranded all current website, checkout, legal, support, and extension surfaces to XCoda.
- Aligned public plans with the extension: Free 300%; Pro 600%; $1.99 monthly, $12.99 yearly, $100 lifetime.
- Removed internal database/sync and automatic-downgrade wording from customer-facing UI.
- Rebuilt the payment-confirmation page in XCoda’s monochrome audio theme with purchase details, activation guidance, support links, and responsive/accessibility states.
- Added payment reference handoff from checkout to confirmation and customer-safe payment errors.

## 2.11.5 — 2026-09-16

- Restored only the XCoda v2.11.0 volume-boosting DSP curve, soft clipping, high-frequency control, output gain, and compressor behavior.
- Google sign-in, UI, plans, logo, and all other current features remain unchanged.

## 2.11.4 — 2026-09-16

- **Google sign-in fixed (double account chooser + fake Redirect URL error):**
  - One OAuth window only (removed Supabase `/authorize` → fallback chain; `chrome.identity` strips `#access_token` so that path always “failed” and opened Google again).
  - Nonce per Supabase docs: SHA-256 hash → Google, raw → Supabase; clear error if still blocked.
  - Redirect URL message no longer shown for nonce failures (your Supabase redirect was already correct).

## 2.11.3 — 2026-09-16

- New original XCoda mark: B/W five-bar “coda swell” EQ (asymmetric heights) — idea only from audio waveform pattern; drawn fresh (PNG 16–128 + `icons/logo.svg`), not copied from any asset.

## 2.11.2 — 2026-09-16

- **Continue with Google fixed**: id_token fallback sends the same nonce to Google and Supabase (core mismatch bug).
- Popup waits on service-worker OAuth response + storage errors (no silent hang).
- Removed leftover “Already paid?” / manual Verify UI and dead billing-email field refs.
- DSP stabilized: fixed compressor + longer ramps + static presence (no pumping / fluctuating boost).
- Pixel nearest-neighbor B/W music-note + EQ logo (16→128).

## 2.11.1 — 2026-09-16

- Removed all listen/usage counting (no YouTube Xm, no listen badges, no heartbeat).
- You tab cleaned: Google-first guest; signed-in shows avatar, email, plan only.
- Google sign-in sync via `storage.onChanged` so Pro/You update after OAuth.
- Fixed `Extension context invalidated` spam in content script after reload.
- New B/W music-note icon (no brand letter); larger header mark.
- DSP: full loudness restored + premium theater clarity (presence), not quieter.

## 2.11.0 — 2026-09-16

- **Rebrand:** XCoda — Clear Audio Booster.
- **Free boost to 300%**; Pro unlocks 301–600% (PRO badges on gated features).
- **Leaderboards removed** → **Pro** tab (Free vs Pro, $1.99 / $12.99 best value / $100 lifetime).
- **Top plan strip:** Guest/Free → View plans; Pro → cycle, email, expiry.
- **Music Ad Block** highlighted card; only active on music/video hosts while media plays.
- **Per-site auto-save** of volume/settings (debounced).
- **Upgrade requires Google sign-in**, then checkout.
- **Pro only after PayPal capture / Razorpay HMAC** — no SIM/optimistic unlock; activate is read-only.
- Soft DSP retune for cleaner boost; Material B/W icons; Chromium MV3 paths.

## 2.10.1 — 2026-09-15

- **Google login fixed**: OAuth runs in the service worker so the popup closing mid-flow no longer aborts sign-in.
- Primary path: Supabase `/auth/v1/authorize?provider=google` → `chromiumapp.org` redirect; fallback: Google `id_token` → Supabase (nonce retry).
- On reopen, popup picks up success/error from storage (`vb_google_auth_*`).
- **Auto Pro / Free**: popup + background refresh JWT, verify via `/api/user/access` + billing email, expire locally, and schedule an alarm at plan deadline → Free.
- Restored missing `vb-adblock.js` (content script load was broken).

## 2.9.9 — 2026-09-15

- Extension verifies Pro/Free against Supabase by billing email on every popup open.
- Honors plan deadline → auto Free when expired (popup + background every 30 min).
- If Supabase says Pro but popup was Free, forces Pro; You tab has Verify Pro / Free.

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

- Simplified the original extension UI: On/Off, Boost dial, presets, Sound Quality only.
- Mathematical concentric wavy rings (not organic blobs); rotate only when On.
- Quiet–Max slider, Safe Boost pill, settings gear for Auto/Save/Reset/Pro.
- Softer DSP ramps + high-boost compression for clear, smooth volume.

## 2.3.0 — 2026-09-14

- Initial marketing website + PayPal/Razorpay checkout (see `website/`).

## 2.2.0 — 2026-09-14

- Volume-first wavy Material redesign + Soft Clear DSP.
