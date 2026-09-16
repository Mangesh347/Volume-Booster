/**
 * XCoda Pro — server-authoritative pricing.
 * $1.99 / $12.99 / $100.00 + 18% GST.
 */

export const GST_RATE = 0.18;

export const PLANS = {
  monthly: {
    id: "monthly",
    name: "XCoda Pro Monthly",
    priceUSD: 1.99,
    billingText: "per month",
    days: 30,
    desc: "XCoda Pro — Monthly"
  },
  yearly: {
    id: "yearly",
    name: "XCoda Pro Yearly",
    priceUSD: 12.99,
    billingText: "per year",
    days: 365,
    desc: "XCoda Pro — Yearly (best value)"
  },
  lifetime: {
    id: "lifetime",
    name: "XCoda Pro Lifetime",
    priceUSD: 100.0,
    billingText: "one-time",
    days: null,
    desc: "XCoda Pro — Lifetime"
  }
};

const INR_USD_RATE = Number(process.env.INR_USD_RATE || 95.12);

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function getPlan(cycle) {
  return PLANS[cycle] || PLANS.yearly;
}

export function quoteUSD(cycle) {
  const plan = getPlan(cycle);
  const subtotal = plan.priceUSD;
  const gst = round2(subtotal * GST_RATE);
  const total = round2(subtotal + gst);
  return {
    cycle: plan.id,
    name: plan.name,
    currency: "USD",
    subtotal,
    gstRate: GST_RATE,
    gst,
    total,
    billingText: plan.billingText,
    days: plan.days,
    desc: plan.desc,
    product: "volume_booster"
  };
}

export function quoteINR(cycle) {
  const usd = quoteUSD(cycle);
  const subtotal = round2(usd.subtotal * INR_USD_RATE);
  const gst = round2(subtotal * GST_RATE);
  const total = round2(subtotal + gst);
  return {
    ...usd,
    currency: "INR",
    subtotal,
    gst,
    total,
    amountPaise: Math.round(total * 100),
    fxRate: INR_USD_RATE
  };
}

export function computeExpiresAt(cycle, from = new Date()) {
  const plan = getPlan(cycle);
  if (!plan.days) return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + plan.days);
  return d.toISOString();
}

/** Extend from remaining Pro time (renewal) or from now. Lifetime → null. */
export function computeExpiresAtRenewal(cycle, currentExpiresAt, from = new Date()) {
  const plan = getPlan(cycle);
  if (!plan.days) return null;
  const now = from instanceof Date ? from : new Date(from);
  const curMs = currentExpiresAt ? new Date(currentExpiresAt).getTime() : 0;
  const base = curMs > now.getTime() ? new Date(curMs) : new Date(now);
  base.setUTCDate(base.getUTCDate() + plan.days);
  return base.toISOString();
}
