/**
 * GET /api/user/access — Pro / Free for signed-in Google (Supabase) user
 */
import { verifyUserJwt } from "../_lib/supabase.js";
import { getAccessForUser } from "../_lib/entitlement.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
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
      error: err.message || "Invalid session",
      plan: "free",
      pro: false
    });
  }
}
