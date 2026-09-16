# XCoda Architecture

## Auth (v2.11.4)
- **Single** `chrome.identity.launchWebAuthFlow` → Google `id_token` → Supabase `grant_type=id_token`.
- Nonce: SHA-256 hex to Google, raw to Supabase (official Supabase rule).
- Do not use Supabase `/authorize` implicit hash redirect with `launchWebAuthFlow` (Chrome strips `#…`).
- Google Cloud Web client must allow `chrome.identity.getRedirectURL()`; Supabase Google provider needs that Client ID.

## Audio pipeline (isolated extension world — `injected.js`)
MediaElement → Gain → SoftClip → BassShelf → ClarityPeak → Presence → HiShelf → SoftCompressor → Destination
- Volume behavior intentionally matches the XCoda v2.11.0 DSP profile.

## Extension bridge
- `injected.js` and `content.js` run in the extension's isolated world.
- `injected.js` is not web-accessible and accepts only bounded, allowlisted calls through a frozen engine object.
- Host-page scripts cannot dispatch commands into the DSP.

## UI philosophy
- Volume boost is the hero control; Free 300% / Pro 600%
- Material Design dark: near-black surfaces + white ink only
- Signature: wavy dial rings; pixel B/W music-note logo

## Website and payments (v2.11.6)
- Root and `website/` are synchronized deploy surfaces.
- Public pricing comes from the XCoda plan contract: $1.99 monthly, $12.99 yearly, $100 lifetime, plus applicable tax.
- Checkout verifies PayPal/Razorpay server-side before the confirmation route.
- Confirmation pings the extension through `externally_connectable`; it never opens a blocked `chrome-extension://` URL.
- Customer UI uses product language only; infrastructure and entitlement diagnostics stay internal.

## Trusted plan state (v2.11.7)
- Supabase Auth and `vb_profiles` are authoritative. Email-only entitlement checks are disabled.
- Tokens, account data, payment-pending state, and entitlement snapshots use trusted `chrome.storage.session`; persistent local storage contains audio preferences only.
- The popup subscribes to its own RLS-protected `vb_profiles` row through Supabase Realtime.
- Fallback verification runs every 30 seconds while the popup is open, every five minutes in the service worker, on popup open, after login/payment, and at the exact expiry alarm.
- Logout clears session state and renders Free before the remote logout request finishes.
- Token refresh and access checks confirm the session identity again before writing, preventing an in-flight request from restoring access after logout or account switching.
- Google ID-token exchange always includes the verified nonce; there is no nonce-free fallback.

## Payment integrity (v2.11.7)
- Create-order routes calculate prices server-side and write immutable `vb_payment_intents`.
- PayPal requires one completed final capture, exact amount/currency/order metadata, optional configured payee identity, and a deterministic provider idempotency key.
- Razorpay verifies the timing-safe callback signature and independently fetches both payment and order; both must agree on captured/paid state, amount, currency, receipt, and plan metadata.
- Capture/verify routes pass the verified provider ID, amount, currency, and status into `xcoda_finalize_payment`.
- The security-definer finalizer is service-role-only, row-locked, atomic, idempotent, rejects mismatched replays, serializes email renewals, and preserves lifetime access.
- A database trigger prevents edits to intent business facts; provider payment IDs are unique and immutable.
- Website-to-extension payment messages contain no email, plan, or expiry claims; they only request authenticated revalidation.
- API traffic uses exact origin allowlists, safe errors, bounded bodies, and Supabase-backed rate limits.

## Cumulative plan renewals (v2.11.7)
- Each completed payment remains one immutable `vb_payment_intents` row and one auditable `vb_entitlements` row.
- The finalizer locks by normalized email and extends from the later of the current effective deadline or payment time.
- Monthly adds one calendar month; Yearly adds one calendar year. This preserves calendar dates instead of approximating them as 30 or 365 days.
- Repeated purchases accumulate. Mixed Monthly and Yearly purchases use the effective cycle `stacked`; the profile stores the maximum cumulative deadline.
- Lifetime is dominant and irreversible through ordinary purchases: later Monthly or Yearly payments are recorded, but the effective profile remains Lifetime with no deadline.
- Safe repair has two layers: the SQL migration backfills profiles from existing active PayPal/Razorpay Lifetime ledger rows, and each authenticated access check reconciles the profile against provider-backed ledger state.
- Reconciliation is extend-only: it restores Lifetime, adopts a longer cumulative deadline, or corrects an equal-deadline mixed state to `stacked`; it never shortens valid profile access.
- Duplicate provider callbacks return the existing effective result and never add time twice.
- `vb_profiles` is the realtime aggregate read model used by the popup; `vb_entitlements` and `vb_payment_intents` remain the payment audit trail.

## Required deployment order
1. Run `supabase/xcoda_security.sql`.
2. Deploy the root site or synchronized `website/` build with the documented environment variables.
3. Reload the unpacked/store extension at v2.11.7.

## Clean-room note
FxSound informed functional regions only. No assets, copy, or layout cloning.
