// Volume Booster popup — guest boost · in-ext Google · seal dial · music boards

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const SITE = 'https://volume-booster-ten.vercel.app';
const DEFAULTS = {
  powered: true,
  volume: 100,
  clarity: 40,
  bassBoost: 25,
  space: 0,
  widen: 0,
  mode: 'softclear',
  autoApply: false,
  adblock: false
};

let state = { ...DEFAULTS };
let tabId = null;
let tabUrl = '';
let entitlement = { pro: false };
let session = null;
let guestId = null;
let apiConfig = null;
let boardScope = 'sites';
let localListenSec = 0;
let heartbeatTimer = null;
let googleBusy = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('prefers-reduced');
  }
  buildScallop();
  buildWaves();
  bindAuth();
  bindTabs();
  bindBoost();
  bindBoards();
  bindProfile();
  await refreshSession();
  await initApp();
});

/* ── Fluid animated wavy boost ring ──────────────────────────── */

let pathLen = 700;
let wavePhase = 0;
let waveRaf = 0;
let dialIntensity = 0.35;

/** Soft 10-lobe wavy circle; phase drives continuous fluid motion. */
function wavyRingD(cx, cy, radius, amplitude, lobes, phase) {
  const steps = lobes * 40;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const breathe = 1 + 0.08 * Math.sin(phase * 1.7 + t * 2);
    const r = radius + amplitude * breathe * Math.cos(lobes * t + phase);
    const x = cx + r * Math.cos(t - Math.PI / 2);
    const y = cy + r * Math.sin(t - Math.PI / 2);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(3) + ',' + y.toFixed(3);
  }
  return d + 'Z';
}

function applyRingPath() {
  const amp = 11 + dialIntensity * 6;
  const d = wavyRingD(120, 120, 78, amp, 10, wavePhase);
  const track = $('ringTrack');
  const prog = $('ringProgress');
  if (track) track.setAttribute('d', d);
  if (prog) prog.setAttribute('d', d);
  try {
    if (track && track.getTotalLength) pathLen = track.getTotalLength() || pathLen;
  } catch (_) {}
  updateRingProgress(state.volume || 100);
}

function buildScallop() {
  applyRingPath();
  startWaveLoop();
}

function startWaveLoop() {
  if (waveRaf) cancelAnimationFrame(waveRaf);
  const reduced = document.body.classList.contains('prefers-reduced');
  if (reduced) {
    wavePhase = 0;
    applyRingPath();
    return;
  }
  const tick = () => {
    // Faster / livelier as boost rises
    wavePhase += 0.028 + dialIntensity * 0.035;
    applyRingPath();
    waveRaf = requestAnimationFrame(tick);
  };
  waveRaf = requestAnimationFrame(tick);
}

function wavePathD(amp, phase) {
  const w = 360;
  const mid = 20;
  let d = 'M0,' + mid;
  for (let x = 0; x <= w * 2; x += 4) {
    const y = mid + Math.sin((x / 28) + phase) * amp;
    d += ' L' + x + ',' + y.toFixed(2);
  }
  return d;
}

function buildWaves() {
  const a = $('waveA');
  const b = $('waveB');
  if (a) a.setAttribute('d', wavePathD(8, 0));
  if (b) b.setAttribute('d', wavePathD(5, 1.2));
}

function updateRingProgress(v) {
  const prog = $('ringProgress');
  if (!prog) return;
  const pct = Math.min(1, Math.max(0.05, Number(v) / 600));
  const visible = pathLen * pct;
  prog.style.strokeDasharray = visible.toFixed(1) + ' ' + pathLen.toFixed(1);
  prog.style.strokeDashoffset = String(-(pathLen * 0.25));
}

function updateDialMotion(v) {
  dialIntensity = Math.min(1, Math.max(0.2, Number(v) / 600));
  updateRingProgress(v);
  const amp = 5 + dialIntensity * 8;
  const a = $('waveA');
  const b = $('waveB');
  if (a) a.setAttribute('d', wavePathD(amp, 0));
  if (b) b.setAttribute('d', wavePathD(amp * 0.6, 1.2));
  const wrap = document.querySelector('.wave-svg');
  if (wrap) wrap.style.animationDuration = Math.max(1.1, 3.0 - dialIntensity * 1.5) + 's';
}

/* ── Storage / session ──────────────────────────────────────── */

function storageGet(keys) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve({});
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.set(obj, resolve);
  });
}

function makeGuestId() {
  let part = '';
  if (crypto?.randomUUID) {
    part = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  } else {
    part = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase().slice(0, 10);
  }
  return 'VB-GUEST-' + part;
}

async function ensureGuestId() {
  const res = await storageGet(['vb_guest_id']);
  if (res.vb_guest_id) {
    guestId = res.vb_guest_id;
    return guestId;
  }
  guestId = makeGuestId();
  await storageSet({ vb_guest_id: guestId, vb_guest_created_at: Date.now() });
  return guestId;
}

async function refreshSession() {
  const res = await storageGet([
    'vb_supabase_session',
    'vb_guest_id',
    'auralis_entitlement',
    'auralis_email',
    'vb_billing_email',
    'vb_listen_local',
    'vb_profile_country'
  ]);
  session = res.vb_supabase_session || null;
  guestId = res.vb_guest_id || null;
  entitlement = normalizeEntitlement(res.auralis_entitlement || { pro: false });
  if (!entitlement.email) {
    entitlement.email = (res.vb_billing_email || res.auralis_email || '').toLowerCase();
  }
  localListenSec = Number(res.vb_listen_local) || 0;
  if (res.vb_profile_country && $('countrySelect')) {
    $('countrySelect').value = res.vb_profile_country;
  }
  if ($('billingEmailInput') && (res.vb_billing_email || entitlement.email)) {
    $('billingEmailInput').value = res.vb_billing_email || entitlement.email;
  }
  return session;
}

async function loadConfig() {
  if (apiConfig?.supabase_url) return apiConfig;
  try {
    apiConfig = await (await fetch(SITE + '/api/config')).json();
  } catch {
    apiConfig = {};
  }
  return apiConfig;
}

function isPro() {
  return globalThis.AuralisPlan ? AuralisPlan.isPro(entitlement) : !!entitlement.pro;
}

function hasSession() {
  return !!(session && session.access_token);
}

function isGuest() {
  return !hasSession();
}

function updateAuthPanels() {
  const signedIn = hasSession();
  document.body.classList.toggle('is-guest', !signedIn);
  document.body.classList.toggle('is-signed-in', signedIn);

  if ($('profileGuest')) $('profileGuest').hidden = signedIn;
  if ($('profileSignedIn')) $('profileSignedIn').hidden = !signedIn;
  if ($('boardsGuestGate')) $('boardsGuestGate').hidden = signedIn;
  if ($('boardsContent')) $('boardsContent').hidden = !signedIn;

  if ($('guestIdDisplay') && guestId) {
    $('guestIdDisplay').textContent = guestId;
  }

  $$('.tab[data-tab="boards"]').forEach((t) => {
    t.classList.toggle('tab-locked', !signedIn);
  });

  if ($('countryRow')) {
    $('countryRow').hidden = boardScope !== 'country';
  }
}

async function initApp() {
  await refreshSession();
  if (!guestId) await ensureGuestId();

  renderUI();
  await loadState();
  updateAuthPanels();
  updatePlanBadge();

  // Always sync Pro/Free (session or billing email) — expires → Free automatically
  await syncAccess(true);

  if (hasSession()) {
    await loadProfile();
    await mergeGuestUsageToCloud();
  }
  startHeartbeat();
  updateListenBadge();

  if (chrome?.runtime?.sendMessage) ping();
}

async function afterSignIn() {
  await refreshSession();
  updateAuthPanels();
  updatePlanBadge();
  await syncAccess(false);
  await mergeGuestUsageToCloud();
  await loadProfile();
  startHeartbeat();
  renderUI();
  if ($('tab-boards') && !$('tab-boards').hidden) loadLeaderboard();
}

/* ── Auth messages ──────────────────────────────────────────── */

function setAuthMsg(text, kind, target) {
  const el = $(target || 'authMsg') || $('authMsgBoards');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'auth-msg' + (kind ? ' ' + kind : '');
}

function persistSessionFromAuth(data, emailHint, profileHint) {
  const s = data.session || data;
  const user = data.user || s.user || {};
  const meta = user.user_metadata || {};
  session = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    email: emailHint || user.email || s.email || '',
    user_id: user.id || s.user_id || '',
    display_name: profileHint?.name || meta.full_name || meta.name || '',
    avatar_url: profileHint?.picture || meta.avatar_url || meta.picture || '',
    saved_at: Date.now()
  };
  return storageSet({
    vb_supabase_session: session,
    auralis_email: session.email || '',
    vb_pending_display_name: session.display_name || undefined,
    vb_pending_avatar: session.avatar_url || undefined
  });
}

async function supabaseAuth(path, body, extraHeaders) {
  const cfg = await loadConfig();
  if (!cfg.supabase_url || !cfg.supabase_anon_key) {
    throw new Error('Auth not configured — set Supabase keys on the site.');
  }
  const headers = {
    apikey: cfg.supabase_anon_key,
    Authorization: 'Bearer ' + cfg.supabase_anon_key,
    'Content-Type': 'application/json',
    ...(extraHeaders || {})
  };
  const res = await fetch(cfg.supabase_url + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.error || 'Auth failed');
  }
  return data;
}

/* ── In-extension Google only (accounts.google.com → Supabase) ─ */

function parseOAuthRedirect(responseUrl) {
  const hash = responseUrl.includes('#') ? responseUrl.split('#')[1] : '';
  const query = responseUrl.includes('?') ? responseUrl.split('?')[1].split('#')[0] : '';
  const params = new URLSearchParams(hash || query);
  return {
    id_token: params.get('id_token'),
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    expires_in: params.get('expires_in'),
    expires_at: params.get('expires_at'),
    error: params.get('error') || params.get('error_description'),
    error_code: params.get('error_code')
  };
}

function launchWebAuth(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Google cancelled'));
          return;
        }
        if (!responseUrl) {
          reject(new Error('Google sign-in cancelled'));
          return;
        }
        resolve(responseUrl);
      }
    );
  });
}

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchSupabaseUser(accessToken) {
  const cfg = await loadConfig();
  const res = await fetch(cfg.supabase_url + '/auth/v1/user', {
    headers: {
      apikey: cfg.supabase_anon_key,
      Authorization: 'Bearer ' + accessToken
    }
  });
  if (!res.ok) return null;
  return res.json();
}

/** Google OAuth inside Chrome identity — no website login page. */
async function startGoogleSignIn() {
  if (googleBusy) return;
  googleBusy = true;
  setAuthMsg('Opening Google…', '', 'authMsg');
  setAuthMsg('Opening Google…', '', 'authMsgBoards');
  $$('.btn-google').forEach((b) => { b.disabled = true; });

  try {
    if (!chrome?.identity?.launchWebAuthFlow || !chrome?.identity?.getRedirectURL) {
      throw new Error('Google sign-in needs Chrome identity API.');
    }

    const cfg = await loadConfig();
    if (!cfg.google_client_id) {
      throw new Error('Google Client ID missing (set GOOGLE_CLIENT_ID on Vercel /api/config).');
    }
    if (!cfg.supabase_url || !cfg.supabase_anon_key) {
      throw new Error('Supabase not configured.');
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const nonce = makeNonce();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', cfg.google_client_id);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'select_account');

    setAuthMsg('Pick your Google account…', '');
    const responseUrl = await launchWebAuth(authUrl.toString());
    const tokens = parseOAuthRedirect(responseUrl);
    if (tokens.error) throw new Error(String(tokens.error).replace(/\+/g, ' '));
    if (!tokens.id_token) {
      throw new Error('Google did not return a token. Add this redirect URI in Google Cloud: ' + redirectUri);
    }

    setAuthMsg('Signing you in…', '');
    const data = await supabaseAuth('/auth/v1/token?grant_type=id_token', {
      provider: 'google',
      id_token: tokens.id_token,
      nonce
    });

    let email = data.user?.email || data.email || '';
    let meta = data.user?.user_metadata || {};
    try {
      const user = await fetchSupabaseUser(data.access_token || data.session?.access_token);
      if (user) {
        email = user.email || email;
        meta = user.user_metadata || meta;
      }
    } catch (_) {}

    await persistSessionFromAuth(data, email, {
      name: meta.full_name || meta.name,
      picture: meta.avatar_url || meta.picture
    });

    try {
      await apiJson('/api/user/profile', {
        method: 'PATCH',
        body: {
          display_name: meta.full_name || meta.name || (email ? email.split('@')[0] : 'User'),
          avatar_url: meta.avatar_url || meta.picture || '',
          email
        }
      });
    } catch {
      /* ok */
    }

    setAuthMsg('Signed in with Google.', 'ok');
    setAuthMsg('Signed in with Google.', 'ok', 'authMsgBoards');
    await afterSignIn();
  } catch (err) {
    let msg = err.message || 'Google sign-in failed';
    if (/Authorization page could not be loaded/i.test(msg)) {
      msg = 'Google blocked the redirect. In Google Cloud → Credentials → your Web client, add Authorized redirect URI: ' +
        (chrome.identity?.getRedirectURL?.() || 'https://<ext-id>.chromiumapp.org/');
    } else if (/nonce/i.test(msg)) {
      msg = 'Google nonce error — close popup and try Continue with Google again.';
    } else if (/redirect_uri_mismatch/i.test(msg)) {
      msg = 'Redirect URI mismatch. Add ' + chrome.identity.getRedirectURL() + ' in Google Cloud Console.';
    }
    setAuthMsg(msg, 'err');
    setAuthMsg(msg, 'err', 'authMsgBoards');
  } finally {
    googleBusy = false;
    $$('.btn-google').forEach((b) => { b.disabled = false; });
  }
}

async function mergeGuestUsageToCloud() {
  if (!hasSession()) return;
  const stored = await storageGet(['vb_site_usage', 'vb_listen_local', 'vb_profile_country']);
  const map = stored.vb_site_usage || {};
  const sites = Object.keys(map).map((host) => ({
    site_host: host,
    seconds: Math.floor(Number(map[host]) || 0)
  })).filter((s) => s.seconds > 0);

  // If only total local seconds exist, attribute to current music host when possible
  const localTotal = Number(stored.vb_listen_local) || 0;
  if (!sites.length && localTotal > 0) {
    const host = hostFromUrl(tabUrl);
    if (globalThis.VBMusicSites?.isMusicHost(host)) {
      sites.push({ site_host: host, seconds: localTotal });
    }
  }
  if (!sites.length) return;

  try {
    const data = await apiJson('/api/usage/merge', {
      method: 'POST',
      body: {
        sites,
        country: stored.vb_profile_country || $('countrySelect')?.value || 'XX',
        display_name: ($('displayName')?.value || session?.display_name || '').trim() || undefined
      }
    });
    if (data.success) {
      // Keep local map but mark synced; do not wipe so offline still works
      await storageSet({ vb_guest_merged_at: Date.now() });
    }
  } catch {
    /* retry next open */
  }
}

function bindAuth() {
  $('btnGoogle')?.addEventListener('click', startGoogleSignIn);
  $('btnGoogleBoards')?.addEventListener('click', startGoogleSignIn);

  $('boardsGoProfile')?.addEventListener('click', () => switchTab('profile'));

  $('emailAuthForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await emailAuth('login');
  });

  $('btnSignup')?.addEventListener('click', async () => {
    await emailAuth('signup');
  });
}

async function emailAuth(mode) {
  const email = ($('authEmail')?.value || '').trim().toLowerCase();
  const password = $('authPassword')?.value || '';
  const name = ($('authName')?.value || '').trim();
  if (!email.includes('@') || password.length < 6) {
    setAuthMsg('Use a valid email and password (6+ characters).', 'err');
    return;
  }
  setAuthMsg(mode === 'signup' ? 'Creating account…' : 'Signing in…', '');
  try {
    let data;
    if (mode === 'signup') {
      data = await supabaseAuth('/auth/v1/signup', {
        email,
        password,
        data: { display_name: name || email.split('@')[0] }
      });
    } else {
      data = await supabaseAuth('/auth/v1/token?grant_type=password', {
        email,
        password
      });
    }
    if (!data.access_token && data.session?.access_token) {
      await persistSessionFromAuth(data, email, { name });
    } else if (data.access_token) {
      await persistSessionFromAuth(
        { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user: data.user },
        email,
        { name }
      );
    } else {
      setAuthMsg('Check your email to confirm, then log in.', 'ok');
      return;
    }
    if (name) await storageSet({ vb_pending_display_name: name });
    setAuthMsg('Welcome in.', 'ok');
    await afterSignIn();
  } catch (err) {
    setAuthMsg(err.message || 'Auth failed', 'err');
  }
}

/** Normalize server/local entitlement; expire → Free when deadline passed. */
function normalizeEntitlement(raw) {
  const email = String(raw?.email || '').trim().toLowerCase();
  const expiresAt = raw?.expiresAt || raw?.expires_at || null;
  const cycle = raw?.cycle || null;
  const wantsPro = !!(raw?.pro || raw?.plan === 'pro');
  const stillActive =
    wantsPro &&
    (!expiresAt || new Date(expiresAt).getTime() > Date.now());
  if (stillActive) {
    return {
      pro: true,
      plan: 'pro',
      email,
      cycle,
      expiresAt,
      unlockedAt: raw?.unlockedAt || Date.now(),
      verifiedAt: Date.now()
    };
  }
  return {
    pro: false,
    plan: 'free',
    email,
    cycle: null,
    expiresAt: null,
    unlockedAt: raw?.unlockedAt || null,
    verifiedAt: Date.now()
  };
}

function pickBetterAccess(a, b) {
  const A = normalizeEntitlement(a);
  const B = normalizeEntitlement(b);
  if (A.pro && !B.pro) return A;
  if (B.pro && !A.pro) return B;
  if (A.pro && B.pro) {
    const ae = A.expiresAt ? new Date(A.expiresAt).getTime() : Infinity;
    const be = B.expiresAt ? new Date(B.expiresAt).getTime() : Infinity;
    return be >= ae ? B : A;
  }
  return B.email ? B : A;
}

async function fetchAccessByEmail(em) {
  const res = await fetch(SITE + '/api/entitlement/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: em })
  });
  const data = await res.json().catch(() => ({}));
  return normalizeEntitlement({
    pro: !!(res.ok && data.pro),
    plan: data.plan || (data.pro ? 'pro' : 'free'),
    email: data.email || em,
    cycle: data.cycle || null,
    expiresAt: data.expiresAt || null
  });
}

async function fetchAccessBySession() {
  if (!hasSession()) return null;
  const res = await fetch(SITE + '/api/user/access', {
    headers: { Authorization: 'Bearer ' + session.access_token }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Session expired — sign in again.');
    err.status = res.status;
    throw err;
  }
  return normalizeEntitlement({
    pro: !!data.pro,
    plan: data.plan || (data.pro ? 'pro' : 'free'),
    email: data.email || session.email,
    cycle: data.cycle || null,
    expiresAt: data.expiresAt || null
  });
}

/**
 * Source of truth: Supabase via website APIs.
 * Checks Google session + every stored billing email; Pro only if deadline still valid.
 * If Supabase says Pro and popup was Free, upgrades immediately.
 */
async function syncAccess(quiet) {
  const stored = await storageGet([
    'auralis_email',
    'vb_billing_email',
    'auralis_entitlement'
  ]);
  const emails = [];
  const pushEmail = (e) => {
    const em = String(e || '').trim().toLowerCase();
    if (em.includes('@') && !emails.includes(em)) emails.push(em);
  };
  pushEmail(session?.email);
  pushEmail(stored.auralis_email);
  pushEmail(stored.vb_billing_email);
  pushEmail(entitlement?.email);
  pushEmail($('billingEmailInput')?.value);

  let best = normalizeEntitlement(stored.auralis_entitlement || entitlement || { pro: false });
  let verifiedOnline = false;
  let lastErr = null;

  if (hasSession()) {
    try {
      const sessionAccess = await fetchAccessBySession();
      if (sessionAccess) {
        best = pickBetterAccess(best, sessionAccess);
        verifiedOnline = true;
        pushEmail(sessionAccess.email);
      }
    } catch (err) {
      lastErr = err;
      if (!quiet) {
        const hint = $('planVerifyHint') || $('profileHint');
        if (hint && err.status === 401) {
          hint.textContent = err.message || 'Session expired — sign in again.';
          hint.className = 'settings-hint is-err';
        }
      }
    }
  }

  for (const em of emails) {
    try {
      const access = await fetchAccessByEmail(em);
      best = pickBetterAccess(best, access);
      verifiedOnline = true;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!verifiedOnline) {
    best = normalizeEntitlement(best);
  }

  entitlement = best;
  const keepBilling = String(stored.vb_billing_email || '').trim().toLowerCase();
  const billing =
    (entitlement.pro && entitlement.email) ||
    keepBilling ||
    entitlement.email ||
    emails[0] ||
    '';
  await storageSet({
    auralis_entitlement: entitlement,
    auralis_email: entitlement.email || billing || stored.auralis_email || '',
    vb_billing_email: billing
  });

  if ($('billingEmailInput') && billing && !$('billingEmailInput').value) {
    $('billingEmailInput').value = billing;
  }

  updatePlanBadge();
  updatePlanStatusUI(verifiedOnline, lastErr);
  if (typeof renderUI === 'function') renderUI();
}

function planLabel() {
  if (isPro()) {
    return entitlement.expiresAt
      ? 'Pro · until ' + new Date(entitlement.expiresAt).toLocaleDateString()
      : 'Pro · Lifetime';
  }
  return isGuest() ? 'Guest · Free' : 'Free';
}

function updatePlanBadge() {
  const badge = $('planBadge');
  const pro = isPro();
  if (badge) badge.textContent = planLabel();
  if ($('statPlan')) $('statPlan').textContent = pro ? 'Pro' : (isGuest() ? 'Guest' : 'Free');
  const link = $('proCheckoutLink');
  const linkGuest = $('proCheckoutLinkGuest');
  [link, linkGuest].forEach((el) => {
    if (!el) return;
    el.style.display = pro ? 'none' : '';
    const email = entitlement?.email || session?.email || $('billingEmailInput')?.value || '';
    if (email && globalThis.AuralisPlan) {
      el.href = AuralisPlan.checkoutUrl('yearly', email);
    }
  });
}

function updatePlanStatusUI(verifiedOnline, lastErr) {
  const em = entitlement?.email || session?.email || '';
  const statusText = isPro()
    ? (em
      ? 'Verified Pro for ' + em + (entitlement.expiresAt
        ? ' · ends ' + new Date(entitlement.expiresAt).toLocaleDateString()
        : ' · lifetime')
      : planLabel())
    : (em
      ? 'Free for ' + em + ' (no active Pro / expired)'
      : 'Free — enter the billing email from checkout to verify');

  ['planStatusLine', 'planStatusLineSignedIn'].forEach((id) => {
    if ($(id)) $(id).textContent = statusText;
  });

  const hintText = !verifiedOnline && lastErr
    ? 'Offline — using cached plan; expiry still enforced locally.'
    : (verifiedOnline
      ? (isPro()
        ? 'Synced from Supabase. Auto Free when the deadline passes.'
        : 'Synced from Supabase — Free plan.')
      : '');
  const hintClass = 'settings-hint' + (verifiedOnline && isPro() ? ' is-ok' : (!verifiedOnline && lastErr ? '' : (verifiedOnline ? '' : '')));

  ['planVerifyHint', 'planVerifyHintSignedIn'].forEach((id) => {
    const hint = $(id);
    if (!hint) return;
    if (hintText) {
      hint.textContent = hintText;
      hint.className = hintClass;
    }
  });
}

/* ── Tabs ───────────────────────────────────────────────────── */

function switchTab(id) {
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === id;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $$('.panel').forEach((p) => {
    const on = p.id === 'tab-' + id;
    p.hidden = !on;
    p.classList.toggle('active', on);
  });
  updateAuthPanels();
  if (id === 'boards') loadLeaderboard();
  if (id === 'profile') loadProfile();
}

function bindTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

/* ── Boost ──────────────────────────────────────────────────── */

function send(action, value, cb) {
  if (!state.powered && action !== 'ping' && action !== 'setPower') {
    if (cb) cb(null);
    return;
  }
  if (!chrome?.runtime?.sendMessage) {
    if (cb) cb(null);
    return;
  }
  chrome.runtime.sendMessage({ target: 'content', action, value }, (r) => {
    void chrome.runtime.lastError;
    if (cb) cb(r);
  });
}

function ping() {
  send('ping', null, (r) => {
    if (r && r.ok) applyAll();
    else setTimeout(ping, 2000);
  });
}

function labelForTabUrl(url) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    const host = (u.hostname || '').replace(/^www\./, '');
    if (
      u.protocol === 'chrome:' ||
      u.protocol === 'chrome-extension:' ||
      u.protocol === 'edge:' ||
      u.protocol === 'about:' ||
      host === 'newtab' ||
      host === ''
    ) {
      return '—';
    }
    return globalThis.VBMusicSites?.displayName(host) || host || '—';
  } catch {
    return '—';
  }
}

function loadState() {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      resolve();
      return;
    }
    chrome.runtime.sendMessage({ action: 'getState' }, (resp) => {
      if (!resp) { resolve(); return; }
      tabId = resp.tabId;
      tabUrl = resp.url || '';
      if ($('siteBadge')) $('siteBadge').textContent = labelForTabUrl(tabUrl);
      const saved = resp.tabState || resp.siteState;
      if (saved) state = { ...DEFAULTS, ...saved };
      renderUI();
      resolve();
    });
  });
}

function renderUI() {
  document.body.classList.toggle('is-off', !state.powered);
  if ($('powerToggle')) $('powerToggle').checked = !!state.powered;

  setSlider($('volumeSlider'), state.volume, 0, 600);
  updateVolDisplay(state.volume);

  $$('.feat').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));

  const ab = $('autoApplyBtn');
  if (ab) {
    ab.classList.toggle('on', !!state.autoApply);
    ab.textContent = state.autoApply ? 'On' : 'Off';
  }

  if ($('adblockToggle')) {
    $('adblockToggle').checked = !!(state.adblock && isPro());
  }
  updatePlanBadge();
}

function applyAll() {
  send('setPower', state.powered);
  if (!state.powered) {
    send('setVolume', 1);
    send('setAdblock', false);
    return;
  }
  send('setVolume', state.volume / 100);
  send('setMode', state.mode);
  send('setClarity', state.clarity / 100);
  send('setBassBoost', state.bassBoost / 100);
  send('setSpace', state.space / 100);
  send('setWiden', state.widen / 100);
  send('setAdblock', !!(state.adblock && isPro()));
}

function bindBoost() {
  $('powerToggle')?.addEventListener('change', function () {
    state.powered = this.checked;
    document.body.classList.toggle('is-off', !state.powered);
    applyAll();
    chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: state.powered ? state.volume : 100 });
  });

  $('volumeSlider')?.addEventListener('input', function () {
    let v = parseInt(this.value, 10);
    if (!isPro() && v > 200) {
      v = 200;
      this.value = v;
      flashPro();
    }
    setVolume(v);
  });

  $$('.feat').forEach((btn) => btn.addEventListener('click', function () {
    const mode = this.dataset.mode;
    if (globalThis.AuralisPlan && !AuralisPlan.canUseScene(entitlement, mode)) {
      flashPro();
      return;
    }
    $$('.feat').forEach((b) => b.classList.remove('active'));
    this.classList.add('active');
    state.mode = mode;
    send('setMode', state.mode);
  }));

  $('adblockToggle')?.addEventListener('change', function () {
    const hint = $('adblockHint');
    if (this.checked && !isPro()) {
      this.checked = false;
      state.adblock = false;
      if (hint) {
        hint.textContent = 'Music ad block is Pro — upgrade to unlock.';
        hint.className = 'feat-hint is-err';
      }
      flashPro();
      send('setAdblock', false);
      return;
    }
    state.adblock = this.checked;
    send('setAdblock', state.adblock);
    chrome.runtime?.sendMessage?.({ action: 'saveState', tabId, url: tabUrl, state });
    if (hint) {
      hint.textContent = state.adblock ? 'Ad block on for music sites.' : '';
      hint.className = state.adblock ? 'feat-hint is-ok' : 'feat-hint';
    }
  });

  $('autoApplyBtn')?.addEventListener('click', () => {
    state.autoApply = !state.autoApply;
    $('autoApplyBtn').classList.toggle('on', state.autoApply);
    $('autoApplyBtn').textContent = state.autoApply ? 'On' : 'Off';
    if (state.autoApply) chrome.runtime?.sendMessage?.({ action: 'saveState', tabId, url: tabUrl, state });
    else chrome.runtime?.sendMessage?.({ action: 'clearSite', url: tabUrl });
  });
}

function setVolume(v) {
  state.volume = v;
  if ($('volumeSlider')) $('volumeSlider').value = v;
  updateVolDisplay(v);
  setSlider($('volumeSlider'), v, 0, 600);
  if (state.powered) {
    send('setVolume', v / 100);
    chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: v });
  }
}

function flashPro() {
  const link = $('proCheckoutLink');
  if (link) {
    link.style.transform = 'scale(1.03)';
    setTimeout(() => { link.style.transform = ''; }, 220);
  }
  if ($('adblockHint')) {
    $('adblockHint').textContent = 'Pro unlocks louder boost, tones, and ad block.';
    $('adblockHint').className = 'feat-hint';
  }
}

function setSlider(el, val, min, max) {
  if (!el) return;
  el.value = val;
  el.style.setProperty('--pct', ((val - min) / (max - min) * 100) + '%');
}

function updateVolDisplay(v) {
  const n = Math.round(Number(v) || 0);
  if ($('volValue')) $('volValue').textContent = n + '%';
  if ($('volLabel')) $('volLabel').textContent = n >= 300 ? 'HIGH' : 'BOOST';
  if ($('volHint')) {
    $('volHint').textContent =
      n < 80 ? 'Quiet' : n <= 120 ? 'Normal' : n < 250 ? 'Boost' : 'Loud';
  }
  updateDialMotion(n);
}

/* ── Boards (music sites + logos) ───────────────────────────── */

function bindBoards() {
  $$('.scope').forEach((btn) => {
    btn.addEventListener('click', () => {
      boardScope = btn.dataset.scope;
      $$('.scope').forEach((b) => b.classList.toggle('active', b === btn));
      if ($('countryRow')) $('countryRow').hidden = boardScope !== 'country';
      loadLeaderboard();
    });
  });
  $('countrySelect')?.addEventListener('change', async () => {
    const c = $('countrySelect').value;
    await storageSet({ vb_profile_country: c });
    if (hasSession()) {
      await apiJson('/api/user/profile', {
        method: 'PATCH',
        body: { country: c }
      }).catch(() => null);
    }
    if (boardScope === 'country') loadLeaderboard();
  });
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'unknown'; }
}

function logoFor(host) {
  return globalThis.VBMusicSites?.logoUrl(host)
    || ('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host || 'example.com') + '&sz=64');
}

function nameFor(host) {
  return globalThis.VBMusicSites?.displayName(host) || host;
}

async function apiJson(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(SITE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function siteUrl(host) {
  const h = String(host || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return h ? 'https://' + h : '';
}

function renderSiteRow(row, rank) {
  const div = document.createElement('div');
  div.className = 'feed-card';
  const host = row.site_host || row.top_site || '';
  const name = row.site_name || nameFor(host);
  const logo = row.logo_url || logoFor(host);
  const href = siteUrl(host);
  div.innerHTML =
    '<img class="feed-logo" width="40" height="40" alt="" loading="lazy">' +
    '<span class="feed-mid">' +
      '<a class="feed-link" target="_blank" rel="noopener"></a>' +
      '<div class="feed-sub"></div>' +
    '</span>' +
    '<span class="feed-score"></span>';
  const img = div.querySelector('.feed-logo');
  img.src = logo;
  img.onerror = () => { img.style.opacity = '0.3'; };
  const link = div.querySelector('.feed-link');
  link.textContent = host || name;
  link.title = name;
  if (href) link.href = href;
  else {
    link.removeAttribute('href');
    link.classList.add('is-plain');
  }
  div.querySelector('.feed-sub').textContent =
    name + (rank != null ? ' · #' + rank : '') +
    (row.listeners ? ' · ' + row.listeners + ' people' : '');
  div.querySelector('.feed-score').textContent = formatListen(row.listen_seconds || 0);
  return div;
}

function renderUserRow(row, i) {
  const div = document.createElement('div');
  div.className = 'feed-card';
  const top = row.site_host || row.top_site || '';
  div.innerHTML =
    '<img class="feed-logo" width="40" height="40" alt="" loading="lazy">' +
    '<span><div class="feed-name"></div><div class="feed-sub"></div></span>' +
    '<span class="feed-score"></span>';
  const img = div.querySelector('.feed-logo');
  img.src = row.avatar_url || (top ? logoFor(top) : 'icons/icon48.png');
  img.onerror = () => { img.src = 'icons/icon48.png'; };
  div.querySelector('.feed-name').textContent = row.display_name || row.email || 'Listener';
  div.querySelector('.feed-sub').textContent =
    boardScope === 'country'
      ? ((row.country || 'XX') + (top ? ' · ' + nameFor(top) : ''))
      : (top ? 'Mostly ' + nameFor(top) : 'Music sites');
  div.querySelector('.feed-score').textContent = formatListen(row.listen_seconds || 0);
  return div;
}

function renderStories(sites) {
  const rail = $('storyRail');
  if (!rail) return;
  rail.innerHTML = '';
  (sites || []).slice(0, 10).forEach((row) => {
    const host = row.site_host || '';
    const el = document.createElement('div');
    el.className = 'story';
    el.innerHTML =
      '<div class="story-ring"><img alt="" loading="lazy"></div>' +
      '<div class="story-name"></div>';
    const img = el.querySelector('img');
    img.src = row.logo_url || logoFor(host);
    img.onerror = () => { img.style.opacity = '0.3'; };
    el.querySelector('.story-name').textContent = row.site_name || nameFor(host);
    rail.appendChild(el);
  });
}

async function loadLeaderboard() {
  updateAuthPanels();
  if (!hasSession()) return;

  const list = $('boardList');
  const empty = $('boardEmpty');
  const meta = $('boardMeta');
  if (!list) return;
  list.innerHTML = '';
  if ($('storyRail')) $('storyRail').innerHTML = '';
  if (empty) {
    empty.hidden = true;
    empty.textContent = 'Play music/video with Boost On — only sites this extension boosts appear here.';
  }
  if (meta) meta.textContent = 'Loading…';

  // Local sites where extension actually tracked media+boost
  const local = await storageGet(['vb_site_usage']);
  const localMap = local.vb_site_usage || {};
  const localRows = Object.keys(localMap)
    .filter((h) => globalThis.VBMusicSites?.isMusicHost(h))
    .map((h) => ({
      site_host: h,
      site_name: nameFor(h),
      logo_url: logoFor(h),
      listen_seconds: Number(localMap[h]) || 0
    }))
    .sort((a, b) => b.listen_seconds - a.listen_seconds);

  const country = $('countrySelect')?.value || 'XX';
  const site = hostFromUrl(tabUrl);
  const q = new URLSearchParams({ scope: boardScope, country, site });

  try {
    const data = await apiJson('/api/leaderboard?' + q.toString());
    let rows = data.rows || [];

    // Prefer merged "yours" = server + local for stories
    const yoursMap = new Map();
    (data.yours || []).forEach((r) => {
      yoursMap.set(r.site_host, { ...r });
    });
    localRows.forEach((r) => {
      const prev = yoursMap.get(r.site_host);
      yoursMap.set(r.site_host, {
        ...r,
        listen_seconds: Math.max(r.listen_seconds, prev?.listen_seconds || 0),
        logo_url: r.logo_url || prev?.logo_url
      });
    });
    const yours = [...yoursMap.values()].sort((a, b) => b.listen_seconds - a.listen_seconds);
    if (yours.length) {
      renderStories(yours);
      if ($('statSites')) $('statSites').textContent = String(yours.length);
    }

    if (boardScope === 'sites') {
      // Show logos for sites you actually used first; then global music sites
      const combined = new Map();
      yours.forEach((r) => combined.set(r.site_host, r));
      rows.forEach((r) => {
        if (!combined.has(r.site_host)) combined.set(r.site_host, r);
      });
      rows = [...combined.values()].sort((a, b) => b.listen_seconds - a.listen_seconds);
    }

    if (!rows.length && !yours.length) {
      if (empty) empty.hidden = false;
      if (meta) meta.textContent = '';
      return;
    }

    if (boardScope === 'sites' || data.mode === 'websites') {
      (rows.length ? rows : yours).forEach((row, i) => list.appendChild(renderSiteRow(row, i + 1)));
      if (meta) {
        meta.textContent = data.you
          ? 'You listened ' + formatListen(data.you.listen_seconds || localListenSec)
          : (rows.length || yours.length) + ' music sites';
      }
    } else {
      rows.forEach((row, i) => list.appendChild(renderUserRow(row, i)));
      if (meta) {
        meta.textContent = data.you
          ? 'You: ' + formatListen(data.you.listen_seconds || 0) + (data.you.rank ? ' · #' + data.you.rank : '')
          : rows.length + ' people';
      }
    }
  } catch (err) {
    // Offline: still show local tracked sites
    if (localRows.length) {
      renderStories(localRows);
      localRows.forEach((row, i) => list.appendChild(renderSiteRow(row, i + 1)));
      if (meta) meta.textContent = 'Local usage (sign-in sync pending)';
      return;
    }
    if (empty) {
      empty.hidden = false;
      empty.textContent = err.message || 'Could not load leaderboards.';
    }
    if (meta) meta.textContent = '';
  }
}

function formatListen(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h + 'h ' + m + 'm';
}

function updateListenBadge() {
  if ($('listenBadge')) $('listenBadge').textContent = formatListen(localListenSec);
  if ($('statListen')) $('statListen').textContent = formatListen(localListenSec);
}

/* ── Profile ────────────────────────────────────────────────── */

function bindProfile() {
  $('avatarUrl')?.addEventListener('input', () => {
    const url = ($('avatarUrl').value || '').trim();
    if (url && $('avatarPreview')) $('avatarPreview').src = url;
  });

  $('saveProfileBtn')?.addEventListener('click', async () => {
    const hint = $('profileHint');
    try {
      const payload = {
        display_name: ($('displayName')?.value || '').trim(),
        avatar_url: ($('avatarUrl')?.value || '').trim(),
        bio: ($('bio')?.value || '').trim(),
        country: $('countrySelect')?.value || 'XX',
        email: ($('profileEmail')?.value || '').trim().toLowerCase() || undefined
      };
      await apiJson('/api/user/profile', { method: 'PATCH', body: payload });
      await storageSet({
        vb_profile_country: payload.country,
        auralis_email: payload.email || session?.email || ''
      });
      if (session && payload.email) {
        session.email = payload.email;
        await storageSet({ vb_supabase_session: session });
      }
      if (hint) {
        hint.textContent = 'Profile saved.';
        hint.className = 'settings-hint is-ok';
      }
      if ($('igName')) $('igName').textContent = payload.display_name || '—';
      if ($('igBio')) $('igBio').textContent = payload.bio || '';
      if ($('igEmail')) $('igEmail').textContent = payload.email || session?.email || '';
    } catch (err) {
      if (hint) {
        hint.textContent = err.message || 'Save failed';
        hint.className = 'settings-hint is-err';
      }
    }
  });

  $('signOutBtn')?.addEventListener('click', async () => {
    stopHeartbeat();
    session = null;
    await storageSet({ vb_supabase_session: null });
    await refreshSession();
    if (!guestId) await ensureGuestId();
    // Keep billing email — re-verify Pro from Supabase (don't wipe paid access)
    await syncAccess(false);
    updateAuthPanels();
    updatePlanBadge();
    switchTab('boost');
  });

  async function runManualVerify() {
    const input = $('billingEmailInput');
    const typed = (input?.value || '').trim().toLowerCase();
    if (typed.includes('@')) {
      await storageSet({ vb_billing_email: typed, auralis_email: typed });
    }
    const hints = [$('planVerifyHint'), $('planVerifyHintSignedIn')].filter(Boolean);
    hints.forEach((h) => {
      h.textContent = 'Checking Supabase…';
      h.className = 'settings-hint';
    });
    await syncAccess(false);
    hints.forEach((h) => {
      if (!h.textContent) {
        h.textContent = isPro() ? 'Pro verified.' : 'Free — no active Pro for this email.';
        h.className = 'settings-hint' + (isPro() ? ' is-ok' : '');
      }
    });
  }

  $('verifyPlanBtn')?.addEventListener('click', runManualVerify);
  $('verifyPlanBtnSignedIn')?.addEventListener('click', runManualVerify);
  $('billingEmailInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runManualVerify();
    }
  });
}

async function loadProfile() {
  updateAuthPanels();
  if (!hasSession()) {
    if ($('guestIdDisplay') && guestId) $('guestIdDisplay').textContent = guestId;
    return;
  }
  if ($('profileEmail')) $('profileEmail').value = session.email || '';
  if ($('igName')) $('igName').textContent = session.display_name || session.email || '—';
  if ($('igEmail')) $('igEmail').textContent = session.email || '';
  if ($('statPlan')) $('statPlan').textContent = isPro() ? 'Pro' : 'Free';
  if (session.avatar_url && $('avatarPreview')) $('avatarPreview').src = session.avatar_url;
  if (session.avatar_url && $('avatarUrl') && !$('avatarUrl').value) {
    $('avatarUrl').value = session.avatar_url;
  }
  if (session.display_name && $('displayName') && !$('displayName').value) {
    $('displayName').value = session.display_name;
  }

  try {
    const data = await apiJson('/api/user/profile');
    const p = data.profile || {};
    if ($('displayName')) $('displayName').value = p.display_name || session.display_name || '';
    if ($('bio')) $('bio').value = p.bio || '';
    if ($('avatarUrl')) $('avatarUrl').value = p.avatar_url || session.avatar_url || '';
    if ((p.avatar_url || session.avatar_url) && $('avatarPreview')) {
      $('avatarPreview').src = p.avatar_url || session.avatar_url;
    }
    if ($('profileEmail')) $('profileEmail').value = p.email || session.email || '';
    if ($('igName')) $('igName').textContent = p.display_name || session.display_name || '—';
    if ($('igBio')) $('igBio').textContent = p.bio || '';
    if ($('igEmail')) $('igEmail').textContent = p.email || session.email || '';
    if ($('statPlan')) $('statPlan').textContent = isPro() ? 'Pro' : 'Free';
    if (p.country && $('countrySelect')) $('countrySelect').value = p.country;
    if (typeof data.listen_seconds === 'number') {
      localListenSec = Math.max(localListenSec, data.listen_seconds);
      await storageSet({ vb_listen_local: localListenSec });
      updateListenBadge();
    }
    const pending = await storageGet(['vb_pending_display_name', 'vb_pending_avatar']);
    if (pending.vb_pending_display_name && !$('displayName').value) {
      $('displayName').value = pending.vb_pending_display_name;
    }
    if (pending.vb_pending_avatar && !$('avatarUrl').value) {
      $('avatarUrl').value = pending.vb_pending_avatar;
      if ($('avatarPreview')) $('avatarPreview').src = pending.vb_pending_avatar;
    }
  } catch {
    /* offline */
  }
}

/* ── Listen heartbeat (music sites only) ────────────────────── */

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(tickListen, 30000);
  tickListen();
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function tickListen() {
  // Prefer sites where content script confirmed media + boost
  const usage = await storageGet(['vb_site_usage', 'vb_active_boost_host']);
  const map = usage.vb_site_usage || {};
  let host = usage.vb_active_boost_host || hostFromUrl(tabUrl);

  if (!globalThis.VBMusicSites?.isMusicHost(host)) {
    // Fall back to any music host with recent local seconds
    host = Object.keys(map).find((h) => VBMusicSites.isMusicHost(h)) || null;
  }
  if (!host || !globalThis.VBMusicSites.isMusicHost(host)) {
    updateListenBadge();
    return;
  }

  // Only count when boost is On (popup state) OR we have active host from content
  if (!state.powered && !usage.vb_active_boost_host) {
    updateListenBadge();
    return;
  }

  const add = 30;
  map[host] = (Number(map[host]) || 0) + add;
  localListenSec = Object.values(map).reduce((n, v) => n + (Number(v) || 0), 0);
  await storageSet({ vb_site_usage: map, vb_listen_local: localListenSec });
  updateListenBadge();

  if (!hasSession()) return;
  try {
    await apiJson('/api/usage/heartbeat', {
      method: 'POST',
      body: {
        seconds: add,
        site_host: host,
        country: $('countrySelect')?.value || 'XX',
        display_name: ($('displayName')?.value || '').trim() || undefined
      }
    });
  } catch {
    /* keep local */
  }
}
