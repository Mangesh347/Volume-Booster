/**
 * POST /api/entitlement/activate — authenticated compatibility access check.
 * Email-only lookup is intentionally disabled to prevent account enumeration.
 */
import { getAccessForUser } from "../_lib/entitlement.js";
import { verifyUserJwt } from "../_lib/supabase.js";
import { secureApi } from "../_lib/http.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!await secureApi(req, res, {
    methods: ["POST"],
    rateLimit: { scope: "entitlement-activate", max: 40, windowSeconds: 600, identity: token }
  })) return;
  if (!token) {
    return res.status(401).json({ error: "Sign in required", plan: "free", pro: false });
  }
  try {
    const user = await verifyUserJwt(token);
    const access = await getAccessForUser({ userId: user.id, email: user.email });
    return res.status(200).json({
      success: true,
      pro: access.plan === "pro",
      plan: access.plan,
      email: user.email,
      cycle: access.cycle,
      expiresAt: access.expiresAt
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid session", plan: "free", pro: false });
  }
}
