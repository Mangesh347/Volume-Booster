// XCoda background — badge, Google auth, and plan access

const SITE = 'https://volume-booster-ten.vercel.app';
const REVALIDATE_ALARM = 'vb_revalidate_plan';
const EXPIRY_ALARM = 'vb_plan_expires';
const SESSION_KEYS = [
  'vb_supabase_session',
  'auralis_entitlement',
  'vb_billing_email',
  'auralis_email',
  'vb_google_auth_pending',
  'vb_google_auth_error',
  'vb_google_auth_ok_at',
  'vb_pending_display_name',
  'vb_pending_avatar',
  'vb_profile_country',
  'vb_guest_id',
  'vb_guest_created_at',
  'vb_listen_local',
  'vb_site_usage',
  'vb_active_boost_host',
  'vb_active_boost_at',
  'xcoda_payment_pending'
];

try {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
} catch (_) {}

function sessionGet(keys) {
  return new Promise((resolve) => chrome.storage.session.get(keys, resolve));
}

function sessionSet(values) {
  return new Promise((resolve) => chrome.storage.session.set(values, resolve));
}

function sessionRemove(keys) {
  return new Promise((resolve) => chrome.storage.session.remove(keys, resolve));
}

async function clearLegacySensitiveStorage() {
  await new Promise((resolve) => chrome.storage.local.remove(SESSION_KEYS, resolve));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#111111' });
  try {
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } catch (_) {}
  clearLegacySensitiveStorage();
  chrome.alarms.create(REVALIDATE_ALARM, { periodInMinutes: 5 });
  revalidateStoredPlan();
});

chrome.runtime.onStartup.addListener(() => {
  clearLegacySensitiveStorage();
  chrome.alarms.create(REVALIDATE_ALARM, { periodInMinutes: 5 });
  revalidateStoredPlan();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REVALIDATE_ALARM || alarm.name === EXPIRY_ALARM) {
    revalidateStoredPlan();
  }
});

function normalizeEntitlement(raw) {
  const email = String(raw?.email || '').trim().toLowerCase();
  const expiresAt = raw?.expiresAt || raw?.expires_at || null;
  const wantsPro = !!(raw?.pro || raw?.plan === 'pro');
  const stillActive =
    wantsPro &&
    (!expiresAt || new Date(expiresAt).getTime() > Date.now());
  if (stillActive) {
    return {
      pro: true,
      plan: 'pro',
      email,
      cycle: raw?.cycle || null,
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
    unlockedAt: null,
    verifiedAt: Date.now()
  };
}

function scheduleExpiryAlarm(expiresAt) {
  chrome.alarms.clear(EXPIRY_ALARM);
  if (!expiresAt) return;
  const when = new Date(expiresAt).getTime();
  if (!Number.isFinite(when)) return;
  if (when <= Date.now()) {
    // Already past — force Free on next tick
    setTimeout(revalidateStoredPlan, 0);
    return;
  }
  // Chrome alarms need >1 min in the future for reliability
  const delay = Math.max(when - Date.now(), 60_000);
  chrome.alarms.create(EXPIRY_ALARM, { when: Date.now() + delay });
}

function persistEntitlement(best, extras) {
  const payload = {
    auralis_entitlement: best,
    auralis_email: best.email || extras?.auralis_email || ''
  };
  chrome.storage.session.set(payload);
  scheduleExpiryAlarm(best.expiresAt);
}

async function verifySessionAgainstServer(accessToken) {
  if (!accessToken) return null;
  const res = await fetch(SITE + '/api/user/access', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Session expired');
    err.status = res.status;
    throw err;
  }
  return normalizeEntitlement({
    pro: !!data.pro,
    plan: data.plan,
    email: data.email,
    cycle: data.cycle,
    expiresAt: data.expiresAt
  });
}

function pickBetter(a, b) {
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

async function loadApiConfig() {
  const res = await fetch(SITE + '/api/config');
  if (!res.ok) throw new Error('Could not load auth config');
  return res.json();
}

function parseOAuthRedirect(responseUrl) {
  const hash = responseUrl.includes('#') ? responseUrl.split('#')[1] : '';
  const query = responseUrl.includes('?') ? responseUrl.split('?')[1].split('#')[0] : '';
  const params = new URLSearchParams(hash || query || '');
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
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Google cancelled'));
        return;
      }
      if (!responseUrl) {
        reject(new Error('Google sign-in cancelled'));
        return;
      }
      resolve(responseUrl);
    });
  });
}

function makeNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function supabasePost(cfg, path, body) {
  const res = await fetch(cfg.supabase_url + path, {
    method: 'POST',
    headers: {
      apikey: cfg.supabase_anon_key,
      Authorization: 'Bearer ' + cfg.supabase_anon_key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error_description || data.msg || data.error || 'Auth failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

async function fetchSupabaseUser(cfg, accessToken) {
  const res = await fetch(cfg.supabase_url + '/auth/v1/user', {
    headers: {
      apikey: cfg.supabase_anon_key,
      Authorization: 'Bearer ' + accessToken
    }
  });
  if (!res.ok) return null;
  return res.json();
}

function buildSession(data, emailHint, profileHint) {
  const s = data.session || data;
  const user = data.user || s.user || {};
  const meta = user.user_metadata || {};
  let expires_at = s.expires_at;
  if (!expires_at && s.expires_in) {
    expires_at = Math.floor(Date.now() / 1000) + Number(s.expires_in);
  }
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at,
    email: emailHint || user.email || s.email || '',
    user_id: user.id || s.user_id || '',
    display_name: profileHint?.name || meta.full_name || meta.name || '',
    avatar_url: profileHint?.picture || meta.avatar_url || meta.picture || '',
    saved_at: Date.now()
  };
}

/**
 * Chrome extension Google sign-in (official Supabase pattern):
 * ONE launchWebAuthFlow → Google id_token → Supabase grant_type=id_token.
 * Do NOT chain Supabase /authorize first — chrome.identity strips #hash tokens,
 * so that path looks failed and opened a second account chooser.
 *
 * Nonce: hashed SHA-256 → Google; raw → Supabase (docs requirement).
 */
async function signInViaGoogleIdToken(cfg) {
  if (!cfg.google_client_id) {
    throw new Error('Google sign-in is temporarily unavailable.');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const rawNonce = makeNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', cfg.google_client_id);
  authUrl.searchParams.set('response_type', 'id_token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('nonce', hashedNonce);

  const responseUrl = await launchWebAuth(authUrl.toString());
  const tokens = parseOAuthRedirect(responseUrl);
  if (tokens.error) throw new Error(String(tokens.error).replace(/\+/g, ' '));
  if (!tokens.id_token) {
    throw new Error('Google did not complete sign-in. Please try again.');
  }

  const data = await supabasePost(cfg, '/auth/v1/token?grant_type=id_token', {
    provider: 'google',
    id_token: tokens.id_token,
    nonce: rawNonce
  });

  let email = data.user?.email || '';
  let meta = data.user?.user_metadata || {};
  try {
    const user = await fetchSupabaseUser(cfg, data.access_token || data.session?.access_token);
    if (user) {
      email = user.email || email;
      meta = user.user_metadata || meta;
    }
  } catch (_) {}

  return buildSession(data, email, {
    name: meta.full_name || meta.name,
    picture: meta.avatar_url || meta.picture
  });
}

function friendlyGoogleError(err) {
  const msg = err?.message || String(err) || 'Google sign-in failed';
  const redirectUri = chrome.identity?.getRedirectURL?.() || 'https://<ext-id>.chromiumapp.org/';
  if (/Authorization page could not be loaded/i.test(msg)) {
    return 'Google sign-in could not open. Check your connection and try again.';
  }
  if (/redirect_uri_mismatch/i.test(msg)) {
    return (
      'Google redirect mismatch. Add this exact URI to the Google Cloud Web client: ' + redirectUri
    );
  }
  if (/nonce/i.test(msg)) {
    return 'Google sign-in could not be verified. Try again, or contact support if it continues.';
  }
  if (/closed|cancel/i.test(msg)) {
    return 'Sign-in cancelled.';
  }
  if (/supabase|client id|configuration|not configured/i.test(msg)) {
    return 'Sign-in is temporarily unavailable. Please contact support if this continues.';
  }
  return msg;
}

let googleSignInBusy = false;

async function startGoogleSignIn() {
  if (googleSignInBusy) {
    throw new Error('Google sign-in already in progress.');
  }
  googleSignInBusy = true;

  try {
    const cfg = await loadApiConfig();
    if (!cfg.supabase_url || !cfg.supabase_anon_key) {
      throw new Error('Sign-in is temporarily unavailable. Please try again later.');
    }

    await new Promise((resolve) => {
      chrome.storage.session.set({ vb_google_auth_pending: true, vb_google_auth_error: null }, resolve);
    });

    let session;
    try {
      // Single window only — official extension id_token path
      session = await signInViaGoogleIdToken(cfg);
    } catch (err) {
      const message = friendlyGoogleError(err);
      await new Promise((resolve) => {
        chrome.storage.session.set(
          { vb_google_auth_pending: false, vb_google_auth_error: message },
          resolve
        );
      });
      throw new Error(message);
    }

    await new Promise((resolve) => {
      chrome.storage.session.set(
        {
          vb_supabase_session: session,
          auralis_email: session.email || '',
          vb_pending_display_name: session.display_name || undefined,
          vb_pending_avatar: session.avatar_url || undefined,
          vb_google_auth_pending: false,
          vb_google_auth_error: null,
          vb_google_auth_ok_at: Date.now()
        },
        resolve
      );
    });

    try {
      await revalidateStoredPlanAsync();
    } catch (_) {}

    return session;
  } finally {
    googleSignInBusy = false;
  }
}

async function refreshSessionIfNeeded(session) {
  if (!session?.refresh_token) return session;
  const originalUserId = session.user_id || '';
  const originalRefreshToken = session.refresh_token;
  let expMs = null;
  if (session.expires_at) {
    const n = Number(session.expires_at);
    expMs = n < 1e12 ? n * 1000 : n;
  } else if (session.saved_at) {
    expMs = Number(session.saved_at) + 50 * 60 * 1000;
  }
  if (expMs && Date.now() < expMs - 90_000) return session;

  const cfg = await loadApiConfig();
  const data = await supabasePost(cfg, '/auth/v1/token?grant_type=refresh_token', {
    refresh_token: session.refresh_token
  });
  const next = buildSession(data, session.email, {
    name: session.display_name,
    picture: session.avatar_url
  });
  const current = await sessionGet(['vb_supabase_session']);
  if (
    current.vb_supabase_session?.refresh_token !== originalRefreshToken ||
    (current.vb_supabase_session?.user_id || '') !== originalUserId
  ) {
    const error = new Error('stale_session_operation');
    error.code = 'STALE_SESSION';
    throw error;
  }
  await new Promise((resolve) => {
    chrome.storage.session.set({ vb_supabase_session: next, auralis_email: next.email || '' }, resolve);
  });
  return next;
}

function revalidateStoredPlan() {
  revalidateStoredPlanAsync().catch(() => {});
}

let revalidationPromise = null;

async function revalidateStoredPlanAsync() {
  if (revalidationPromise) return revalidationPromise;
  revalidationPromise = (async () => {
    const stored = await sessionGet(['auralis_entitlement', 'vb_supabase_session']);
    let session = stored.vb_supabase_session || null;
    let best = normalizeEntitlement(stored.auralis_entitlement || { pro: false });

    if (!session?.access_token) {
      best = normalizeEntitlement({ pro: false });
      persistEntitlement(best);
      return best;
    }

    try {
      session = await refreshSessionIfNeeded(session);
      const access = await verifySessionAgainstServer(session.access_token);
      best = normalizeEntitlement(access || { pro: false, email: session.email });
      const current = await sessionGet(['vb_supabase_session', 'auralis_entitlement']);
      if (
        current.vb_supabase_session?.refresh_token !== session.refresh_token ||
        (current.vb_supabase_session?.user_id || '') !== (session.user_id || '')
      ) {
        return normalizeEntitlement(current.auralis_entitlement || { pro: false });
      }
      await sessionSet({
        vb_supabase_session: session,
        auralis_email: session.email || '',
        xcoda_payment_pending: false
      });
    } catch (err) {
      if (err?.code === 'STALE_SESSION') {
        const current = await sessionGet(['auralis_entitlement']);
        return normalizeEntitlement(current.auralis_entitlement || { pro: false });
      } else if (
        err?.status === 400 ||
        err?.status === 401 ||
        err?.status === 403 ||
        /invalid (?:session|refresh)/i.test(err?.message || '')
      ) {
        await sessionRemove(SESSION_KEYS);
        best = normalizeEntitlement({ pro: false });
      } else {
        best = { ...best, offline: true, verifiedAt: best.verifiedAt || Date.now() };
      }
    }

    persistEntitlement(best);
    return best;
  })().finally(() => {
    revalidationPromise = null;
  });
  return revalidationPromise;
}

/** Website success page only triggers an authenticated Supabase refresh. */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (
    !msg ||
    msg.type !== 'XCODA_PAYMENT_VERIFIED' ||
    sender.origin !== SITE
  ) {
    sendResponse?.({ ok: false });
    return false;
  }
  sessionGet(['vb_supabase_session']).then(async ({ vb_supabase_session: session }) => {
    if (!session?.access_token) {
      await sessionSet({ xcoda_payment_pending: true });
      sendResponse?.({ ok: true, pro: false, pendingSignIn: true });
      return;
    }
    const entitlement = await revalidateStoredPlanAsync();
    sendResponse?.({ ok: true, pro: !!entitlement.pro });
  }).catch(() => sendResponse?.({ ok: false }));
  return true;
});

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function updateBadge(tabId, volume) {
  const v = parseInt(volume) || 100;
  const text = v === 100 ? '' : v >= 600 ? 'MAX' : v + '%';
  chrome.action.setBadgeText({ tabId, text });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (
    info.status !== 'complete' ||
    !tab.url ||
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('https://accounts.google.com/')
  ) return;
  const domain = getDomain(tab.url);
  if (!domain) return;

  chrome.storage.local.get([`site_${domain}`], async (res) => {
    const saved = res[`site_${domain}`];
    if (!saved || saved.autoApply === false) return;

    const secure = await sessionGet(['auralis_entitlement']);
    const ent = normalizeEntitlement(secure.auralis_entitlement || { pro: false });
    const safe = clampStateForPlan(saved, ent);
    updateBadge(tabId, safe.volume);

    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        files: ['music-sites.js', 'vb-adblock.js', 'injected.js', 'content.js']
      },
      () => {
        if (chrome.runtime.lastError) return;
        [800, 2500].forEach((delay) => {
          setTimeout(() => applyToTab(tabId, safe), delay);
        });
      }
    );
  });
});

const FREE_MAX_VOLUME = 300;
const PRO_SCENES = new Set(['bass', 'vocal', 'cinema', 'lofi', 'slowreverb']);

function clampStateForPlan(s, ent) {
  const pro = !!(ent && ent.pro);
  let volume = parseInt(s.volume, 10) || 100;
  if (!pro && volume > FREE_MAX_VOLUME) volume = FREE_MAX_VOLUME;
  let mode = s.mode || 'softclear';
  if (!pro && PRO_SCENES.has(mode)) mode = 'softclear';
  const adblock = !!(pro && s.adblock);
  return { ...s, volume, mode, adblock };
}

function applyToTab(tabId, s) {
  sessionGet(['auralis_entitlement']).then((res) => {
    const ent = normalizeEntitlement(res.auralis_entitlement || { pro: false });
    const safe = clampStateForPlan(s, ent);
    const powered = safe.powered !== false;
    const msgs = [
      { action: 'setPower', value: powered },
      { action: 'setVolume', value: powered ? (safe.volume || 100) / 100 : 1 },
      { action: 'setMode', value: safe.mode || 'softclear' },
      { action: 'setClarity', value: (safe.clarity != null ? safe.clarity : 35) / 100 },
      { action: 'setBassBoost', value: (safe.bassBoost != null ? safe.bassBoost : 20) / 100 },
      { action: 'setSpace', value: (safe.space || 0) / 100 },
      { action: 'setWiden', value: (safe.widen || 0) / 100 },
      { action: 'setFrequency', value: safe.bassFreq || 200 },
      { action: 'setReverb', value: (safe.reverb || 0) / 100 },
      { action: 'setPitch', value: safe.pitch || 1.0 },
      { action: 'setPan', value: (safe.pan || 0) / 100 },
      { action: 'setAdblock', value: !!safe.adblock }
    ];
    msgs.forEach((m) => {
      chrome.tabs.sendMessage(tabId, { target: 'content', ...m }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse(null);
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, msg, (r) => {
        void chrome.runtime.lastError;
        sendResponse(r);
      });
    });
    return true;
  }

  if (msg.action === 'updateBadge') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) updateBadge(tabs[0].id, msg.volume);
    });
    return false;
  }

  if (msg.action === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({});
        return;
      }
      const domain = getDomain(tabs[0].url);
      chrome.storage.local.get([`tab_${tabs[0].id}`, `site_${domain}`], (res) =>
        sendResponse({
          tabState: res[`tab_${tabs[0].id}`],
          siteState: res[`site_${domain}`],
          tabId: tabs[0].id,
          url: tabs[0].url
        })
      );
    });
    return true;
  }

  if (msg.action === 'saveState') {
    const { tabId, url, state } = msg;
    const domain = getDomain(url);
    const updates = { [`tab_${tabId}`]: state };
    if (domain) updates[`site_${domain}`] = state;
    chrome.storage.local.set(updates, () => {
      updateBadge(tabId, state.volume);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'clearSite') {
    const domain = getDomain(msg.url);
    if (domain) chrome.storage.local.remove(`site_${domain}`);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) updateBadge(tabs[0].id, 100);
    });
    return false;
  }

  if (msg.action === 'revalidatePlan') {
    revalidateStoredPlanAsync()
      .then((entitlement) => sendResponse?.({ ok: true, entitlement }))
      .catch((err) => sendResponse?.({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === 'GET_AUTH_STATE') {
    sessionGet([
      'vb_supabase_session',
      'auralis_entitlement',
      'xcoda_payment_pending'
    ]).then((state) => {
      sendResponse?.({
        ok: true,
        session: state.vb_supabase_session || null,
        entitlement: normalizeEntitlement(state.auralis_entitlement || { pro: false }),
        paymentPending: !!state.xcoda_payment_pending
      });
    });
    return true;
  }

  if (msg.action === 'SIGN_OUT') {
    sessionGet(['vb_supabase_session']).then(async ({ vb_supabase_session: current }) => {
      await sessionRemove(SESSION_KEYS);
      chrome.alarms.clear(EXPIRY_ALARM);
      const free = normalizeEntitlement({ pro: false });
      await sessionSet({ auralis_entitlement: free });
      sendResponse?.({ ok: true, entitlement: free });

      if (current?.access_token) {
        loadApiConfig().then((cfg) => {
          fetch(cfg.supabase_url + '/auth/v1/logout', {
            method: 'POST',
            headers: {
              apikey: cfg.supabase_anon_key,
              Authorization: 'Bearer ' + current.access_token
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    });
    return true;
  }

  if (msg.action === 'GOOGLE_SIGN_IN') {
    startGoogleSignIn()
      .then((session) => sendResponse({ ok: true, session }))
      .catch((err) => sendResponse({ ok: false, error: friendlyGoogleError(err) }));
    return true;
  }

  if (msg.action === 'REFRESH_SESSION') {
    chrome.storage.session.get(['vb_supabase_session'], async (res) => {
      try {
        const next = await refreshSessionIfNeeded(res.vb_supabase_session);
        sendResponse({ ok: true, session: next });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  if (msg.action === 'GET_REDIRECT_URI') {
    sendResponse({ ok: true, redirectUri: chrome.identity.getRedirectURL() });
    return false;
  }
});
