import { secureApi } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!await secureApi(req, res, { methods: ["POST"] })) return;
  return res.status(410).json({ error: "Listening analytics are no longer collected." });
}
