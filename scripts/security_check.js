const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const failures = [];
let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};

const manifest = JSON.parse(read("manifest.json"));
JSON.parse(read("vercel.json"));
JSON.parse(read("website/vercel.json"));
check(manifest.manifest_version === 3, "Manifest must remain MV3");
check(manifest.description.length <= 132, "Manifest description exceeds 132 characters");
check(manifest.host_permissions?.includes("<all_urls>"), "Cross-site audio host access is missing");
check(
  !JSON.stringify(manifest.web_accessible_resources || []).includes("injected.js"),
  "Audio engine must not be web-accessible"
);
check(!manifest.permissions.includes("activeTab"), "Redundant activeTab permission remains");
check(!manifest.permissions.includes("scripting"), "Redundant scripting permission remains");
check(!manifest.permissions.includes("tabs"), "Redundant tabs permission remains");
const contentScripts = manifest.content_scripts?.[0]?.js || [];
check(
  contentScripts.indexOf("injected.js") >= 0 &&
  contentScripts.indexOf("injected.js") < contentScripts.indexOf("content.js"),
  "Isolated audio engine must load before its controller"
);
check(
  manifest.content_scripts?.[0]?.exclude_matches?.includes("https://accounts.google.com/*"),
  "Google account chooser must exclude the audio engine"
);
check(
  JSON.stringify(manifest.externally_connectable || {}).includes(
    "https://volume-booster-ten.vercel.app/*"
  ),
  "External website origin must stay explicit"
);

const apiFiles = [
  "api/config.js",
  "api/_lib/http.js",
  "api/paypal/create-order.js",
  "api/paypal/capture-order.js",
  "api/razorpay/create-order.js",
  "api/razorpay/verify-payment.js",
  "api/user/access.js",
  "api/user/profile.js",
  "api/entitlement/activate.js"
];
for (const file of apiFiles) {
  check(!read(file).includes('Access-Control-Allow-Origin", "*"'), `${file} has wildcard CORS`);
}

const background = read("background.js");
const popup = read("popup.js");
const success = read("success.html");
const checkout = read("checkout.html");
const privacy = read("privacy.html");
const injected = read("injected.js");
check(background.includes("chrome.storage.session"), "Session data is not using storage.session");
check(background.includes("sender.origin !== SITE"), "External payment message origin is not checked");
check(!background.includes("verifyEmailAgainstServer"), "Email-only entitlement lookup remains");
check(!background.includes("exchange(tokens.id_token, null)"), "Nonce-free Google retry remains");
check(!background.includes("chrome.scripting"), "Duplicate programmatic content injection remains");
check(!popup.includes("fetchAccessByEmail"), "Popup can still enumerate access by email");
check(
  success.includes('type: "XCODA_PAYMENT_VERIFIED"') &&
  !success.includes("VB_PRO_UNLOCKED"),
  "Success page must send only a generic payment refresh signal"
);
check(!checkout.includes("expiresAt="), "Checkout puts entitlement details in a URL");
check(!privacy.includes("We may collect high-level funnel events"), "Obsolete analytics claim remains");
check(
  privacy.includes("does not use Google Analytics") &&
  privacy.includes("Chrome session storage") &&
  privacy.includes("does not send browsing history"),
  "Privacy policy does not match current data handling"
);
check(!read("content.js").includes("__sb_cmd"), "Spoofable page event bridge remains");
check(!injected.includes("__sb_cmd"), "Audio engine still accepts page DOM events");
check(injected.includes("latencyHint: 'playback'"), "Audio engine lacks playback-stable buffering");
check(
  injected.includes("if (!sharedCtx && navigator.userActivation?.hasBeenActive)") &&
  !injected.includes("setTimeout(() => {\n    if (!sharedCtx)"),
  "AudioContext can start before a user gesture"
);
check(
  injected.includes("'statechange', keepEngineRunning") &&
  injected.includes("'visibilitychange', keepEngineRunning") &&
  injected.includes("'blur', keepEngineRunning"),
  "Audio engine lacks background-switch recovery"
);

const sql = read("supabase/xcoda_security.sql");
check(sql.includes("xcoda_finalize_payment"), "Atomic payment finalizer is missing");
check(sql.includes("xcoda_take_rate_limit"), "Persistent API rate limiter is missing");
check(sql.includes("xcoda_read_own_profile"), "Realtime profile RLS policy is missing");
check(sql.includes("payment_intent_business_fields_are_immutable"), "Intent immutability trigger is missing");
check(sql.includes("completed_payment_replay_mismatch"), "Completed replay mismatch check is missing");
check(sql.includes("pg_advisory_xact_lock"), "Concurrent renewal lock is missing");
check(sql.includes("uq_vb_payment_intents_provider_payment"), "Provider payment uniqueness is missing");
check(sql.includes("INTERVAL '1 month'"), "Monthly access is not calendar-based");
check(sql.includes("INTERVAL '1 year'"), "Yearly access is not calendar-based");
check(!sql.includes("INTERVAL '30 days'"), "Legacy fixed 30-day renewal remains");
check(!sql.includes("INTERVAL '365 days'"), "Legacy fixed 365-day renewal remains");
check(sql.includes("v_effective_cycle := 'stacked'"), "Mixed-plan effective state is missing");
check(sql.includes("WITH verified_lifetime AS"), "Verified Lifetime profile backfill is missing");
check(
  sql.includes("provider IN ('paypal', 'razorpay')"),
  "Lifetime backfill is not restricted to payment providers"
);
check(read("supabase/vb_schema.sql").includes("'stacked'"), "Profile schema rejects stacked access");
check(popup.includes("Monthly + Yearly"), "Popup does not label mixed plan access");
check(success.includes('stacked: "XCoda Pro · Monthly + Yearly"'), "Success page does not label mixed plan access");

const pricing = read("api/_lib/pricing.js");
const entitlementLib = read("api/_lib/entitlement.js");
const paymentIntents = read("api/_lib/payment-intents.js");
check(
  paymentIntents.includes('process.env.PAYPAL_MODE || (isProduction() ? "live" : "sandbox")') &&
  paymentIntents.includes('startsWith("rzp_live_")') &&
  paymentIntents.includes("if (isProduction()) return false"),
  "Production payments are not locked to live provider credentials"
);
check(
  entitlementLib.includes("&provider=in.(paypal,razorpay)&order_id=not.is.null"),
  "Access ledger is not restricted to provider-backed records"
);
check(
  entitlementLib.includes("ledgerExpiry > profileExpiry"),
  "Authenticated access does not self-heal from a longer ledger"
);
check(
  pricing.includes("priceUSD: 1.99") &&
  pricing.includes("priceUSD: 12.99") &&
  pricing.includes("priceUSD: 100.0"),
  "Server pricing contract changed"
);
check(
  checkout.includes("Monthly · $1.99") &&
  checkout.includes("Yearly · $12.99 · Best value") &&
  checkout.includes("Lifetime · $100"),
  "Checkout pricing labels are incorrect"
);

const paypalCapture = read("api/paypal/capture-order.js");
check(paypalCapture.includes("PayPal-Request-Id"), "PayPal capture idempotency key is missing");
check(paypalCapture.includes("capture.final_capture !== true"), "PayPal final-capture check is missing");
check(paypalCapture.includes("captures.length !== 1"), "PayPal exact capture count is not enforced");

const razorpayVerify = read("api/razorpay/verify-payment.js");
check(razorpayVerify.includes("/v1/orders/"), "Razorpay order is not fetched");
check(razorpayVerify.includes("order.amount_due") && razorpayVerify.includes("payment.captured"), "Razorpay paid/captured invariants are incomplete");

const mirrorPairs = [
  ["vercel.json", "website/vercel.json"],
  ["index.html", "website/index.html"],
  ["checkout.html", "website/checkout.html"],
  ["success.html", "website/success.html"],
  ["privacy.html", "website/privacy.html"],
  ["api/config.js", "website/api/config.js"],
  ["api/_lib/pricing.js", "website/api/_lib/pricing.js"],
  ["api/_lib/http.js", "website/api/_lib/http.js"],
  ["api/_lib/entitlement.js", "website/api/_lib/entitlement.js"],
  ["api/_lib/payment-intents.js", "website/api/_lib/payment-intents.js"],
  ["api/paypal/create-order.js", "website/api/paypal/create-order.js"],
  ["api/paypal/capture-order.js", "website/api/paypal/capture-order.js"],
  ["api/razorpay/create-order.js", "website/api/razorpay/create-order.js"],
  ["api/razorpay/verify-payment.js", "website/api/razorpay/verify-payment.js"],
  ["api/user/access.js", "website/api/user/access.js"],
  ["api/user/profile.js", "website/api/user/profile.js"],
  ["api/entitlement/activate.js", "website/api/entitlement/activate.js"]
];
for (const [a, b] of mirrorPairs) {
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
  check(hash(read(a)) === hash(read(b)), `${a} and ${b} differ`);
}

if (failures.length) {
  console.error(failures.map((item) => `FAIL: ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Security checks passed (${assertions} assertions).`);
