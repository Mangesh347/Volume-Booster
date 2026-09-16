const assert = require("assert");
const fs = require("fs");
const path = require("path");

function daysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addCalendarMonths(value, months) {
  const date = new Date(value);
  const originalDay = date.getUTCDate();
  const targetMonthIndex = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  date.setUTCFullYear(targetYear, targetMonth, Math.min(
    originalDay,
    daysInUtcMonth(targetYear, targetMonth)
  ));
  return date;
}

function applyPurchases({ now, currentExpiry = null, currentCycle = null, purchases }) {
  const seen = new Set();
  let expiry = currentExpiry ? new Date(currentExpiry) : null;
  let lifetime = currentCycle === "lifetime";
  let monthly = currentCycle === "monthly" || currentCycle === "stacked";
  let yearly = currentCycle === "yearly" || currentCycle === "stacked";

  for (const purchase of purchases) {
    if (seen.has(purchase.id)) continue;
    seen.add(purchase.id);
    if (purchase.cycle === "lifetime") {
      lifetime = true;
      expiry = null;
      continue;
    }
    if (purchase.cycle === "monthly") monthly = true;
    if (purchase.cycle === "yearly") yearly = true;
    if (lifetime) continue;
    const base = expiry && expiry.getTime() > now.getTime() ? expiry : now;
    expiry = addCalendarMonths(base, purchase.cycle === "yearly" ? 12 : 1);
  }

  return {
    cycle: lifetime ? "lifetime" : monthly && yearly ? "stacked" : yearly ? "yearly" : "monthly",
    expiresAt: lifetime ? null : expiry.toISOString()
  };
}

const now = new Date("2026-09-16T08:15:30.000Z");
const monthlyTwice = applyPurchases({
  now,
  purchases: [
    { id: "month-1", cycle: "monthly" },
    { id: "month-2", cycle: "monthly" }
  ]
});
assert.deepStrictEqual(monthlyTwice, {
  cycle: "monthly",
  expiresAt: "2026-11-16T08:15:30.000Z"
});

const yearlyTwice = applyPurchases({
  now,
  purchases: [
    { id: "year-1", cycle: "yearly" },
    { id: "year-2", cycle: "yearly" }
  ]
});
assert.deepStrictEqual(yearlyTwice, {
  cycle: "yearly",
  expiresAt: "2028-09-16T08:15:30.000Z"
});

assert.deepStrictEqual(applyPurchases({
  now,
  currentExpiry: "2026-08-01T00:00:00.000Z",
  currentCycle: "monthly",
  purchases: [{ id: "renew-after-expiry", cycle: "monthly" }]
}), {
  cycle: "monthly",
  expiresAt: "2026-10-16T08:15:30.000Z"
});

assert.deepStrictEqual(applyPurchases({
  now,
  purchases: [
    { id: "mixed-month", cycle: "monthly" },
    { id: "mixed-year", cycle: "yearly" }
  ]
}), {
  cycle: "stacked",
  expiresAt: "2027-10-16T08:15:30.000Z"
});

assert.deepStrictEqual(applyPurchases({
  now,
  purchases: [
    { id: "mixed-year", cycle: "yearly" },
    { id: "mixed-month", cycle: "monthly" }
  ]
}), {
  cycle: "stacked",
  expiresAt: "2027-10-16T08:15:30.000Z"
});

assert.deepStrictEqual(applyPurchases({
  now,
  purchases: [
    { id: "life", cycle: "lifetime" },
    { id: "month-after-life", cycle: "monthly" },
    { id: "year-after-life", cycle: "yearly" }
  ]
}), {
  cycle: "lifetime",
  expiresAt: null
});

assert.deepStrictEqual(applyPurchases({
  now,
  purchases: [
    { id: "duplicate", cycle: "monthly" },
    { id: "duplicate", cycle: "monthly" }
  ]
}), {
  cycle: "monthly",
  expiresAt: "2026-10-16T08:15:30.000Z"
});

assert.strictEqual(
  addCalendarMonths(new Date("2027-01-31T10:00:00.000Z"), 1).toISOString(),
  "2027-02-28T10:00:00.000Z"
);
assert.strictEqual(
  addCalendarMonths(new Date("2028-02-29T10:00:00.000Z"), 12).toISOString(),
  "2029-02-28T10:00:00.000Z"
);

const sql = fs.readFileSync(
  path.resolve(__dirname, "../supabase/xcoda_security.sql"),
  "utf8"
);
assert(sql.includes("INTERVAL '1 month'"));
assert(sql.includes("INTERVAL '1 year'"));
assert(sql.includes("v_effective_cycle := 'stacked'"));
assert(sql.includes("pg_advisory_xact_lock"));
assert(!sql.includes("INTERVAL '30 days'"));
assert(!sql.includes("INTERVAL '365 days'"));

console.log("Renewal checks passed (calendar stacking, expiry, duplicate, mixed, lifetime).");
