/**
 * GET /api/user/access — Pro / Free for signed-in Google (Supabase) user
 */
import { verifyUserJwt } from "../_lib/supabase.js";
import { getAccessForUser } from "../_lib/entitlement.js";
import { secureApi } from "../_lib/http.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!await secureApi(req, res, {
    methods: ["GET"],
    rateLimit: { scope: "user-access", max: 60, windowSeconds: 600, identity: token }
  })) return;
  if (!token) return res.status(401).json({ error: "Sign in with Google required", plan: "free" });

  try {
    const user = await verifyUserJwt(token);
    const access = await getAccessForUser({ userId: user.id, email: user.email });
    return res.status(200).json({
      success: true,
      plan: access.plan,
      pro: access.plan === "pro",
      cycle: access.cycle,
      expiresAt: access.expiresAt,
      email: access.email || user.email,
      userId: user.id
    });
  } catch (err) {
    return res.status(401).json({
      error: "Session expired. Sign in again.",
      plan: "free",
      pro: false
    });
  }
}
