import { secureApi } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!await secureApi(req, res, { methods: ["GET"] })) return;
  return res.status(410).json({ error: "Listening leaderboards are no longer available." });
}
