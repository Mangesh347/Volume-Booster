QA REPORT: XCoda live payment guard

BLOCKERS:
- No PayPal client ID/secret or Razorpay live key/secret is present locally, and this workspace is not linked to a Vercel project. Real checkout cannot be activated or charged until live credentials are added to the Vercel Production environment and redeployed.

MAJOR: none in source

MINOR: none

PASSED:
- Local PayPal mode changed to live and simulated payments disabled.
- Production PayPal endpoints require live mode plus configured credentials.
- Production Razorpay endpoints require an `rzp_live_` key plus matching secret.
- Production simulation remains impossible even if an environment flag is accidentally enabled.
- Missing/test credentials fail closed before an order can be created, verified, or granted Pro.
- Root and `website/` payment APIs remain synchronized.
- JavaScript syntax, 78 security assertions, and IDE diagnostics passed.

---

QA REPORT: XCoda Chrome Web Store permission/privacy pass — v2.11.10

BLOCKERS:
- Final fresh-install, real Google login, audio, Pro, and Music Ad Block checks require loading the finished ZIP in Chrome before submission.

MAJOR: none in static/package review

MINOR: none

PASSED:
- Confirmed `<all_urls>` remains required for arbitrary-site audio and is documented for that purpose only.
- Removed the sole duplicate `chrome.scripting.executeScript` path and the `scripting` permission; declarative all-frame content scripts retain audio coverage.
- Confirmed Tabs API calls remain available without the sensitive `tabs` permission; matching webpage URL access is already supplied by the retained host permission.
- Confirmed `storage`, `identity`, and `alarms` are actively used and retained.
- Network scan found only XCoda backend/Supabase account and plan traffic in extension runtime code; no analytics SDK or audio/browsing upload path was found.
- Privacy policy now matches temporary session auth, local audio/site preferences, optional profile data, payment records, no analytics, and no advertising/tracking use.
- Store summary, detailed description, permission justifications, privacy declarations, homepage, support, and privacy URLs are ready in `STORE_LISTING.md`.
- JavaScript syntax, 77 security assertions, renewal tests, Lifetime repair tests, website privacy mirror, and IDE diagnostics passed.

---

QA REPORT: XCoda AudioContext autoplay correction — v2.11.9

BLOCKERS: none in source

MAJOR: none

MINOR:
- Reload the unpacked extension before testing because previously injected v2.11.8 scripts remain in already-open tabs.

PASSED:
- AudioContext creation is gated behind Chrome user activation and no longer runs automatically at document start.
- Suspended contexts are not resumed before user activation; interrupted active contexts can still recover.
- Google Account Chooser is excluded from declarative and background audio injection.
- Playback-stable buffering and tab/window/desktop recovery remain enabled after activation.
- The v2.11.0 DSP curve and all customer-facing v2.11.8 polish remain unchanged.

---

QA REPORT: XCoda customer copy, larger logo, and audio continuity — v2.11.8

BLOCKERS: none in source

MAJOR: none

MINOR:
- Real Windows desktop switching must be confirmed after reloading the unpacked extension because browser automation cannot reproduce Chrome extension audio scheduling across OS desktops.

PASSED:
- Boost, Pro, and You tabs now use concise customer-facing benefits and actions without exposing plan-sync or payment implementation details.
- Landing page, pricing, checkout, and confirmation copies are simpler and root/website deployment mirrors match exactly.
- Existing waveform logo renders at larger intrinsic and CSS sizes across popup, website, checkout, product summary, and confirmation header.
- Audio engine now requests playback-stable buffering and resumes on context state changes, tab visibility changes, page restore, focus, blur, and media playback.
- XCoda v2.11.0 gain curve, filters, compressor values, plan enforcement, and payment verification behavior are unchanged.
- JavaScript syntax, 68 security assertions, renewal tests, Lifetime repair tests, mirror checks, and IDE diagnostics passed.

---

QA REPORT: XCoda website, checkout, and payment confirmation — v2.11.6

BLOCKERS: none

MAJOR: none

MINOR: none

PASSED:
- Homepage renders with XCoda identity, Free 300%, Pro 600%, and $1.99 / $12.99 / $100 pricing.
- Checkout renders XCoda identity and calculates the default Yearly total as $15.33 including 18% tax.
- Payment confirmation shows account, plan, access, dynamic reference, one primary activation action, onboarding steps, support, and refund links.
- Success page passes a 390px mobile overflow check (390px viewport / 390px document width).
- Monochrome background, responsive card, visible focus styles, semantic receipt list, live status, and reduced-motion handling verified.
- Browser run reported zero console errors and zero failed requests for the mocked success flow.
- Public HTML/JS scan found no old product names or internal sync/automatic-downgrade wording.
- Extension and inline website JavaScript syntax checks passed.
- IDE lint diagnostics: none.

NOTES:
- PayPal/Razorpay live payment completion was not charged during QA; the existing verification path was preserved and the success API was mocked only for visual testing.

---

QA REPORT: XCoda trusted plan state and verified-Pro UI — v2.11.7

BLOCKERS:
- Production end-to-end verification remains blocked until `supabase/xcoda_security.sql` is applied and the API is deployed with live/sandbox credentials.

MAJOR: none found in static/local testing

MINOR:
- Browser UI automation can validate the popup presentation but cannot reproduce Chrome Identity or a live Supabase Realtime/payment event without deployed credentials.

PASSED:
- Verified-Pro class adds premium monochrome treatment without horizontal overflow or changing the popup structure.
- Removing the Pro class restores the standard Free presentation immediately.
- Reduced-motion coverage remains active for the Pro highlight.
- Extension and hardened API JavaScript syntax checks passed.
- Static security suite passed all 66 assertions, including exact CORS, generic payment messages, session-only sensitive state, isolated DSP, SQL/RLS/rate-limit presence, provider reconciliation, intent immutability, replay rejection, renewal rules, Lifetime repair, exact pricing, and root/website mirrors.
- PayPal code requires one completed final capture, exact provider metadata, and a deterministic capture idempotency key.
- Razorpay code independently verifies both payment and order state after timing-safe callback verification.
- In-flight auth refresh and plan results cannot restore a session after logout/account replacement.
- Calendar renewal tests pass for two Monthly payments, two Yearly payments, renewal after expiry, Monthly/Yearly stacking in both orders, duplicate callbacks, month-end/leap-year clamping, and Lifetime followed by later fixed-term purchases.
- Landing-page and checkout browser QA confirmed $1.99/month, $12.99/year with Best value, and $100 lifetime.
- Checkout explains cumulative renewal behavior; the popup and confirmation format the effective Supabase deadline with local date and time.
- Lifetime repair tests pass for Yearly→Lifetime restoration, Lifetime non-shortening, longer-ledger repair, equal-deadline Stacked correction, and Free→paid recovery.
- IDE lint diagnostics: none.
- Manifest remains MV3, description stays within 132 characters, and `injected.js` is no longer web-accessible.
- Retired listening analytics and leaderboard endpoints return `410` without writing user activity.
- Live payment charges, real Google login, and deployed Realtime delivery were not simulated as successful production events.
