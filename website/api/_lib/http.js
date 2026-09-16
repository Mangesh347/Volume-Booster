import crypto from "crypto";
import { sbRest } from "./supabase.js";

const DEFAULT_SITE = "https://volume-booster-ten.vercel.app";
const EXTENSION_ORIGIN = "chrome-extension://khiccfmolhkliobmkflgbpefpgeajhpb";

function siteOrigin() {
  try {
    return new URL(process.env.SITE_URL || DEFAULT_SITE).origin;
  } catch {
    return DEFAULT_SITE;
  }
}

function requestOriginAllowed(origin) {
  if (!origin) return true;
  if (origin === siteOrigin() || origin === EXTENSION_ORIGIN) return true;
  if (process.env.NODE_ENV !== "production" && /^https?:\/\/localhost(?::\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

function applyHeaders(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && requestOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
}

function clientIdentity(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex");
}

async function takeRateLimit(req, scope, maxRequests, windowSeconds, identity) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const raw = `${scope}:${clientIdentity(req)}:${identity || ""}:${secret}`;
  const bucket = crypto.createHash("sha256").update(raw).digest("hex");
  const result = await sbRest("rpc/xcoda_take_rate_limit", {
    method: "POST",
    body: {
      p_bucket_key: bucket,
      p_window_seconds: windowSeconds,
      p_max_requests: maxRequests
    }
  });
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    const error = new Error("rate_limit_unavailable");
    error.status = 503;
    throw error;
  }
  return result.data[0];
}

export async function secureApi(req, res, options = {}) {
  applyHeaders(req, res);
  const origin = String(req.headers.origin || "");
  if (!requestOriginAllowed(origin)) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return false;
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }
  const methods = options.methods || ["POST"];
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    res.status(405).json({ error: "Method not allowed." });
    return false;
  }
  const length = Number(req.headers["content-length"] || 0);
  if (length > (options.maxBodyBytes || 16384)) {
    res.status(413).json({ error: "Request is too large." });
    return false;
  }
  if (options.rateLimit) {
    try {
      const ipResult = await takeRateLimit(
        req,
        `${options.rateLimit.scope}:ip`,
        options.rateLimit.max * 3,
        options.rateLimit.windowSeconds,
        ""
      );
      let blocked = ipResult.allowed ? null : ipResult;
      if (!blocked && options.rateLimit.identity) {
        const identityResult = await takeRateLimit(
          req,
          `${options.rateLimit.scope}:identity`,
          options.rateLimit.max,
          options.rateLimit.windowSeconds,
          options.rateLimit.identity
        );
        if (!identityResult.allowed) blocked = identityResult;
      }
      if (blocked) {
        res.setHeader("Retry-After", String(blocked.retry_after || 60));
        res.status(429).json({ error: "Too many attempts. Please wait and try again." });
        return false;
      }
    } catch {
      if (process.env.NODE_ENV === "production") {
        res.status(503).json({ error: "Secure verification is temporarily unavailable." });
        return false;
      }
    }
  }
  return true;
}

export function safeApiError(res, status, publicMessage) {
  return res.status(status).json({ error: publicMessage });
}
