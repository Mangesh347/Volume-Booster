const assert = require("assert");
const fs = require("fs");
const path = require("path");

function reconcile(profile, ledger, now = Date.parse("2026-09-16T10:00:00.000Z")) {
  const profileActive =
    profile?.plan === "pro" &&
    (!profile.expires_at || Date.parse(profile.expires_at) > now);
  const profileLifetime =
    profileActive &&
    profile.cycle === "lifetime" &&
    !profile.expires_at;
  if (profileLifetime) return { source: "profile", cycle: "lifetime", expiresAt: null };

  const providerLifetime =
    ledger?.cycle === "lifetime" &&
    !ledger.expires_at &&
    ["paypal", "razorpay"].includes(ledger.provider) &&
    !!ledger.order_id;
  if (providerLifetime) return { source: "repair", cycle: "lifetime", expiresAt: null };

  if (ledger) {
    const ledgerExpiry = ledger.expires_at ? Date.parse(ledger.expires_at) : Infinity;
    const profileExpiry = profileActive
      ? (profile.expires_at ? Date.parse(profile.expires_at) : Infinity)
      : -Infinity;
    if (
      !profileActive ||
      ledgerExpiry > profileExpiry ||
      (
        ledgerExpiry === profileExpiry &&
        ledger.cycle === "stacked" &&
        profile.cycle !== "stacked"
      )
    ) {
      return { source: "repair", cycle: ledger.cycle, expiresAt: ledger.expires_at };
    }
  }

  if (profileActive) {
    return { source: "profile", cycle: profile.cycle, expiresAt: profile.expires_at };
  }
  return { source: "free", cycle: null, expiresAt: null };
}

const yearlyProfile = {
  plan: "pro",
  cycle: "yearly",
  expires_at: "2027-09-16T10:00:00.000Z"
};
const verifiedLifetime = {
  cycle: "lifetime",
  expires_at: null,
  provider: "paypal",
  order_id: "PAYPAL-LIFETIME-1"
};
assert.deepStrictEqual(reconcile(yearlyProfile, verifiedLifetime), {
  source: "repair",
  cycle: "lifetime",
  expiresAt: null
});

assert.deepStrictEqual(reconcile(
  { plan: "pro", cycle: "lifetime", expires_at: null },
  {
    cycle: "yearly",
    expires_at: "2030-01-01T00:00:00.000Z",
    provider: "razorpay",
    order_id: "order_yearly_1"
  }
), {
  source: "profile",
  cycle: "lifetime",
  expiresAt: null
});

assert.deepStrictEqual(reconcile(yearlyProfile, {
  cycle: "monthly",
  expires_at: "2026-12-16T10:00:00.000Z",
  provider: "paypal",
  order_id: "PAYPAL-MONTH-1"
}), {
  source: "profile",
  cycle: "yearly",
  expiresAt: yearlyProfile.expires_at
});

assert.deepStrictEqual(reconcile(yearlyProfile, {
  cycle: "stacked",
  expires_at: yearlyProfile.expires_at,
  provider: "razorpay",
  order_id: "order_stacked_1"
}), {
  source: "repair",
  cycle: "stacked",
  expiresAt: yearlyProfile.expires_at
});

assert.deepStrictEqual(reconcile(
  { plan: "free", cycle: null, expires_at: null },
  {
    cycle: "monthly",
    expires_at: "2026-10-16T10:00:00.000Z",
    provider: "paypal",
    order_id: "PAYPAL-MONTH-2"
  }
), {
  source: "repair",
  cycle: "monthly",
  expiresAt: "2026-10-16T10:00:00.000Z"
});

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/xcoda_security.sql"), "utf8");
const entitlement = fs.readFileSync(path.join(root, "api/_lib/entitlement.js"), "utf8");
assert(sql.includes("WITH verified_lifetime AS"));
assert(sql.includes("provider IN ('paypal', 'razorpay')"));
assert(entitlement.includes('["paypal", "razorpay"].includes(ledger.provider)'));
assert(entitlement.includes("ledgerExpiry > profileExpiry"));
assert(entitlement.includes("profile.cycle !== \"stacked\""));

console.log("Lifetime repair checks passed (restore, preserve, extend-only, stacked, Free).");
