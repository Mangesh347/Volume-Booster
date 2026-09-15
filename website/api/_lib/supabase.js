/**
 * Supabase REST helpers for Volume Booster (service role only).
 */
export function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = process.env.SUPABASE_ANON_KEY || "";
  return { url, key, anon, ok: Boolean(url && key) };
}

export async function sbRest(path, { method = "GET", body, prefer } = {}) {
  const { url, key, ok } = supabaseConfig();
  if (!ok) throw new Error("Supabase not configured");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json"
  };
  if (body != null) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function verifyUserJwt(accessToken) {
  const { url, key, ok } = supabaseConfig();
  if (!ok) throw new Error("Supabase not configured");
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) throw new Error(`Invalid session (${res.status})`);
  return res.json();
}

export async function findUserIdByEmail(email) {
  const em = String(email || "").toLowerCase().trim();
  if (!em) return null;
  const { url, key, ok } = supabaseConfig();
  if (!ok) return null;
  try {
    const res = await fetch(
      `${url}/auth/v1/admin/users?page=1&per_page=200`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const users = json.users || json || [];
    const hit = users.find((u) => String(u.email || "").toLowerCase() === em);
    return hit?.id || null;
  } catch {
    return null;
  }
}
