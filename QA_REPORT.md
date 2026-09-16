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
