/**
 * GET/PATCH /api/user/profile
 */
import { sbRest, verifyUserJwt } from "../_lib/supabase.js";
import { ensureProfile } from "../_lib/entitlement.js";
import { secureApi } from "../_lib/http.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!await secureApi(req, res, {
    methods: ["GET", "PATCH"],
    rateLimit: { scope: "user-profile", max: 40, windowSeconds: 600, identity: token }
  })) return;
  if (!token) return res.status(401).json({ error: "Sign in required" });

  let user;
  try {
    user = await verifyUserJwt(token);
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Sign in again." });
  }

  try {
    await ensureProfile({ userId: user.id, email: user.email });

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (body.display_name != null) patch.display_name = String(body.display_name).slice(0, 40);
      if (body.avatar_url != null) patch.avatar_url = String(body.avatar_url).slice(0, 500);
      if (body.bio != null) patch.bio = String(body.bio).slice(0, 160);

      const upd = await sbRest(
        `vb_profiles?user_id=eq.${encodeURIComponent(user.id)}` +
          `&select=email,user_id,display_name,avatar_url,bio,plan,cycle,expires_at,updated_at`,
        {
        method: "PATCH",
        prefer: "return=representation",
        body: patch
        }
      );
      if (!upd.ok) return res.status(502).json({ error: "Profile update failed." });
      const profile = Array.isArray(upd.data) ? upd.data[0] : upd.data;
      return res.status(200).json({ success: true, profile });
    }

    const prof = await sbRest(
      `vb_profiles?user_id=eq.${encodeURIComponent(user.id)}` +
        `&select=email,user_id,display_name,avatar_url,bio,plan,cycle,expires_at,updated_at&limit=1`
    );
    const profile = prof.ok && Array.isArray(prof.data) ? prof.data[0] : null;

    return res.status(200).json({
      success: true,
      profile: profile || { email: user.email, user_id: user.id }
    });
  } catch (err) {
    console.error("profile_request_failed", err);
    return res.status(500).json({ error: "Profile is temporarily unavailable." });
  }
}
