// XCoda popup — guest boost · Google · Pro tab · per-site auto-save

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const SITE = 'https://volume-booster-ten.vercel.app';
const FREE_MAX = () =>
  (globalThis.XCodaPlan && XCodaPlan.FREE_MAX_VOLUME) || 300;
const DEFAULTS = {
  powered: true,
  volume: 100,
  mode: 'softclear',
  autoApply: true,
  adblock: false
};
let saveTimer = null;
let selectedCycle = 'yearly';

let state = { ...DEFAULTS };
let tabId = null;
let tabUrl = '';
let entitlement = { pro: false };
let session = null;
let apiConfig = null;
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
  bindProfile();
  bindStorageAuthSync();
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

const SESSION_KEYS = new Set([
  'vb_supabase_session',
  'auralis_entitlement', 'auralis_email',
  'vb_google_auth_pending', 'vb_google_auth_error', 'vb_google_auth_ok_at',
  'vb_pending_display_name', 'vb_pending_avatar'
]);

async function storageGet(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const localKeys = list.filter((key) => !SESSION_KEYS.has(key));
  const sessionKeys = list.filter((key) => SESSION_KEYS.has(key));
  const [local, secure] = await Promise.all([
    localKeys.length
      ? new Promise((resolve) => chrome.storage.local.get(localKeys, resolve))
      : {},
    sessionKeys.length
      ? new Promise((resolve) => chrome.storage.session.get(sessionKeys, resolve))
      : {}
  ]);
  return { ...local, ...secure };
}

async function storageSet(obj) {
  const local = {};
  const secure = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    (SESSION_KEYS.has(key) ? secure : local)[key] = value;
  });
  const writes = [];
  if (Object.keys(local).length) {
    writes.push(new Promise((resolve) => chrome.storage.local.set(local, resolve)));
  }
  if (Object.keys(secure).length) {
    writes.push(new Promise((resolve) => chrome.storage.session.set(secure, resolve)));
    writes.push(new Promise((resolve) => chrome.storage.local.remove(Object.keys(secure), resolve)));
  }
  await Promise.all(writes);
}

async function refreshSession() {
  const res = await storageGet([
    'vb_supabase_session',
    'auralis_entitlement',
    'auralis_email'
  ]);
  session = res.vb_supabase_session || null;
  entitlement = normalizeEntitlement(res.auralis_entitlement || { pro: false });
  if (!entitlement.email) {
    entitlement.email = String(res.auralis_email || '').toLowerCase();
  }
  return session;
}

async function loadConfig() {
  if (apiConfig?.supabase_url) {
    applyAuthCapabilities(apiConfig.auth);
    return apiConfig;
  }
  try {
    apiConfig = await (await fetch(SITE + '/api/config')).json();
  } catch {
    apiConfig = {};
  }
  applyAuthCapabilities(apiConfig.auth);
  return apiConfig;
}

function applyAuthCapabilities(auth) {
  const capabilities = auth || {};
  const google = $('btnGoogle');
  const emailDrawer = $('emailAuthForm')?.closest('details');
  const signup = $('btnSignup');
  if (google) {
    google.disabled = capabilities.googleEnabled === false;
    google.hidden = capabilities.googleEnabled === false;
  }
  if (emailDrawer) emailDrawer.hidden = capabilities.emailLoginEnabled === false;
  if (signup) signup.hidden = capabilities.emailSignupEnabled === false;
  const provider = capabilities.googleEnabled ? 'Google' : 'email';
  if ($('guestSignInNote')) {
    $('guestSignInNote').textContent =
      `Enjoy up to 300% free. Sign in with ${provider} anytime to unlock more.`;
  }
  if ($('proAuthNote')) {
    $('proAuthNote').textContent =
      `Sign in with ${provider}, choose a plan, and enjoy Pro right away.`;
  }
  if (
    capabilities.available === false &&
    $('authMsg') &&
    !hasSession()
  ) {
    setAuthMsg('Sign-in is temporarily unavailable.', 'err');
  }
}

function isPro() {
  return globalThis.XCodaPlan ? XCodaPlan.isPro(entitlement) : !!entitlement.pro;
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
  document.body.classList.toggle('is-pro', signedIn && isPro());

  if ($('profileGuest')) $('profileGuest').hidden = signedIn;
  if ($('profileSignedIn')) $('profileSignedIn').hidden = !signedIn;
}

async function ensureFreshSession() {
  if (!hasSession()) return session;
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'REFRESH_SESSION' }, (r) => {
        void chrome.runtime.lastError;
        resolve(r);
      });
    });
    if (res?.ok && res.session) {
      session = res.session;
    }
  } catch (_) {}
  return session;
}

/** After Google OAuth the popup often closes — pick up success/error on reopen. */
async function consumeGoogleAuthResult() {
  const stored = await storageGet([
    'vb_google_auth_error',
    'vb_google_auth_ok_at',
    'vb_google_auth_pending',
    'vb_supabase_session'
  ]);
  if (stored.vb_google_auth_error) {
    setAuthMsg(stored.vb_google_auth_error, 'err');
    await storageSet({ vb_google_auth_error: null, vb_google_auth_pending: false });
    return 'error';
  }
  if (stored.vb_google_auth_ok_at && stored.vb_supabase_session?.access_token) {
    const age = Date.now() - Number(stored.vb_google_auth_ok_at);
    if (age < 5 * 60 * 1000) {
      session = stored.vb_supabase_session;
      setAuthMsg('Signed in with Google.', 'ok');
      await storageSet({ vb_google_auth_ok_at: null, vb_google_auth_pending: false });
      return 'ok';
    }
  }
  if (stored.vb_google_auth_pending) {
    setAuthMsg('Google sign-in still running… finish in the browser window.', '');
  }
  return null;
}

async function initApp() {
  await refreshSession();
  await loadConfig();

  renderUI();
  await loadState();
  updateAuthPanels();
  updatePlanBadge();

  const googleResult = await consumeGoogleAuthResult();

  await ensureFreshSession();
  await syncAccess(true);
  startContinuousPlanVerification();
  try {
    chrome.runtime.sendMessage({ action: 'revalidatePlan' }, () => void chrome.runtime.lastError);
  } catch (_) {}

  if (hasSession() || googleResult === 'ok') {
    await loadProfile();
    updateAuthPanels();
    updatePlanBadge();
  }

  if (chrome?.runtime?.sendMessage) ping();
}

async function afterSignIn() {
  await refreshSession();
  updateAuthPanels();
  updatePlanBadge();
  await syncAccess(false);
  await loadProfile();
  renderUI();
  if ($('tab-pro') && !$('tab-pro').hidden) renderProTab();
  startContinuousPlanVerification();
}

function bindStorageAuthSync() {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' && area !== 'session') return;
    if (changes.vb_supabase_session || changes.vb_google_auth_ok_at || changes.vb_google_auth_error) {
      refreshSession().then(async () => {
        await consumeGoogleAuthResult();
        updateAuthPanels();
        updatePlanBadge();
        if (hasSession()) await loadProfile();
        await syncAccess(true);
        startRealtimePlanUpdates();
      });
    }
    if (changes.auralis_entitlement) {
      entitlement = normalizeEntitlement(changes.auralis_entitlement.newValue || { pro: false });
      updateAuthPanels();
      updatePlanBadge();
      renderUI();
    }
  });
}

/* ── Auth messages ──────────────────────────────────────────── */

function setAuthMsg(text, kind, target) {
  const el = $(target || 'authMsg');
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
    throw new Error('Sign-in is temporarily unavailable. Please try again later.');
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

/**
 * Google sign-in runs in the service worker so the OAuth window does not
 * kill the auth mid-flow when this popup loses focus.
 */
async function startGoogleSignIn() {
  if (googleBusy) return;
  googleBusy = true;
  setAuthMsg('Opening Google…', '', 'authMsg');
  $$('.btn-google').forEach((b) => { b.disabled = true; });

  const beforeToken = session?.access_token || null;

  try {
    // Prefer SW response; also poll storage if popup stays open mid-OAuth
    const swPromise = new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'GOOGLE_SIGN_IN' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false, error: 'No response from background' });
      });
    });

    setAuthMsg('Choose your Google account to continue.', '');

    const deadline = Date.now() + 120_000;
    let authErr = null;
    while (Date.now() < deadline) {
      const raced = await Promise.race([
        swPromise.then((r) => ({ type: 'sw', r })),
        new Promise((r) => setTimeout(() => r({ type: 'tick' }), 700))
      ]);

      if (raced.type === 'sw') {
        if (raced.r?.ok && raced.r.session?.access_token) {
          session = raced.r.session;
          break;
        }
        if (raced.r && raced.r.ok === false) {
          authErr = raced.r.error || 'Google sign-in failed';
          break;
        }
      }

      const stored = await storageGet([
        'vb_supabase_session',
        'vb_google_auth_error',
        'vb_google_auth_pending',
        'vb_google_auth_ok_at'
      ]);
      if (stored.vb_google_auth_error) {
        authErr = stored.vb_google_auth_error;
        await storageSet({ vb_google_auth_error: null, vb_google_auth_pending: false });
        break;
      }
      const next = stored.vb_supabase_session;
      if (next?.access_token && next.access_token !== beforeToken) {
        session = next;
        break;
      }
      if (!beforeToken && next?.access_token) {
        session = next;
        break;
      }
    }

    if (authErr) throw new Error(authErr);

    if (!session?.access_token) {
      await refreshSession();
    }

    if (!hasSession()) {
      throw new Error(
        'Sign-in did not finish. Try again or contact support.'
      );
    }

    try {
      await apiJson('/api/user/profile', {
        method: 'PATCH',
        body: {
          display_name:
            session?.display_name ||
            (session?.email ? session.email.split('@')[0] : 'User'),
          avatar_url: session?.avatar_url || '',
          email: session?.email || ''
        }
      });
    } catch {
      /* ok */
    }

    setAuthMsg('You’re in. Let’s make some noise.', 'ok');
    await afterSignIn();
  } catch (err) {
    const msg = err.message || 'Google sign-in failed';
    setAuthMsg(msg, 'err');
  } finally {
    googleBusy = false;
    $$('.btn-google').forEach((b) => { b.disabled = false; });
  }
}

function bindAuth() {
  $('btnGoogle')?.addEventListener('click', startGoogleSignIn);

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
    setAuthMsg('Enter a valid email and at least 6 characters.', 'err');
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
      setAuthMsg('Check your inbox, then come back to sign in.', 'ok');
      return;
    }
    if (name) await storageSet({ vb_pending_display_name: name });
    setAuthMsg('You’re in. Let’s make some noise.', 'ok');
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
      verifiedAt: raw?.verifiedAt || Date.now(),
      offline: !!raw?.offline
    };
  }
  return {
    pro: false,
    plan: 'free',
    email,
    cycle: null,
    expiresAt: null,
    unlockedAt: raw?.unlockedAt || null,
    verifiedAt: raw?.verifiedAt || Date.now(),
    offline: !!raw?.offline
  };
}

let planSyncPromise = null;
let realtimeClient = null;
let realtimeDebounce = null;
let planPollTimer = null;
let freshnessTimer = null;
let lastPlanCheckAt = 0;

async function syncAccess(quiet) {
  if (planSyncPromise) return planSyncPromise;
  planSyncPromise = (async () => {
    await refreshSession();
    if (!hasSession()) {
      entitlement = normalizeEntitlement({ pro: false });
      await storageSet({ auralis_entitlement: entitlement, auralis_email: '' });
      updateAuthPanels();
      updatePlanBadge();
      updatePlanStatusUI(true, null);
      renderUI();
      return entitlement;
    }

    let verifiedOnline = false;
    let lastErr = null;
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'revalidatePlan' }, (result) => {
          void chrome.runtime.lastError;
          resolve(result);
        });
      });
      if (!response?.ok) throw new Error(response?.error || 'Plan check failed');
      entitlement = normalizeEntitlement(response.entitlement || { pro: false });
      verifiedOnline = !entitlement.offline;
      lastPlanCheckAt = Date.now();
      await refreshSession();
    } catch (err) {
      lastErr = err;
      entitlement = normalizeEntitlement(entitlement || { pro: false });
      if (!quiet) setAuthMsg('Plan check paused — reconnecting…', '');
    }

    updateAuthPanels();
    updatePlanBadge();
    updatePlanStatusUI(verifiedOnline, lastErr);
    renderUI();
    return entitlement;
  })().finally(() => {
    planSyncPromise = null;
  });
  return planSyncPromise;
}

function stopRealtimePlanUpdates() {
  clearTimeout(realtimeDebounce);
  realtimeClient?.close?.();
  realtimeClient = null;
}

async function startRealtimePlanUpdates() {
  stopRealtimePlanUpdates();
  await refreshSession();
  if (!hasSession() || !session.user_id || !globalThis.XCodaRealtime) return;
  const cfg = await loadConfig();
  if (!cfg.supabase_url || !cfg.supabase_anon_key) return;
  realtimeClient = XCodaRealtime.create({
    url: cfg.supabase_url,
    anonKey: cfg.supabase_anon_key,
    accessToken: session.access_token,
    userId: session.user_id,
    onChange() {
      clearTimeout(realtimeDebounce);
      realtimeDebounce = setTimeout(() => syncAccess(true), 250);
    },
    onStatus(status) {
      document.body.dataset.planConnection = status;
    }
  });
}

function startContinuousPlanVerification() {
  clearInterval(planPollTimer);
  clearInterval(freshnessTimer);
  planPollTimer = setInterval(() => syncAccess(true), 30000);
  freshnessTimer = setInterval(() => {
    if (
      entitlement?.pro &&
      entitlement.expiresAt &&
      new Date(entitlement.expiresAt).getTime() <= Date.now()
    ) {
      entitlement = normalizeEntitlement(entitlement);
      storageSet({ auralis_entitlement: entitlement });
      updateAuthPanels();
      updatePlanBadge();
      renderUI();
      syncAccess(true);
    }
    const hint = $('planVerifyHintSignedIn');
    if (!hint || !hasSession()) return;
    if (document.body.dataset.planConnection === 'offline') {
      hint.textContent = 'You’re offline · we’ll keep trying';
    } else if (lastPlanCheckAt) {
      hint.textContent = 'All set';
    }
  }, 1000);
  startRealtimePlanUpdates();
}

window.addEventListener('unload', stopRealtimePlanUpdates);

function planLabel() {
  if (isPro()) {
    return 'Pro';
  }
  return 'Free';
}

function accessCycleLabel(cycle) {
  const labels = {
    monthly: 'Monthly',
    yearly: 'Yearly',
    stacked: 'Monthly + Yearly',
    lifetime: 'Lifetime'
  };
  return labels[cycle] || 'Pro';
}

function formatAccessDeadline(value, includeTime = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, includeTime
    ? {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }
    : {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
}

function updatePlanBadge() {
  const badge = $('planBadge');
  const meta = $('planStripMeta');
  const strip = $('planStrip');
  const pro = isPro();
  if (badge) badge.textContent = planLabel();
  if (meta) {
    if (pro) {
      const bits = [];
      if (entitlement.cycle) bits.push(accessCycleLabel(entitlement.cycle));
      if (entitlement.expiresAt) {
        bits.push('until ' + formatAccessDeadline(entitlement.expiresAt, false));
      } else if (entitlement.cycle === 'lifetime' || !entitlement.expiresAt) {
        if (!bits.includes('Lifetime')) bits.push('Lifetime');
      }
      meta.textContent = bits.filter(Boolean).join(' · ') || 'Ready';
    } else {
      meta.textContent = 'See Pro';
    }
  }
  if (strip) {
    strip.classList.toggle('is-pro', pro);
    strip.classList.toggle('is-free', !pro);
  }
  if ($('statPlan')) $('statPlan').textContent = pro ? 'Pro' : (isGuest() ? 'Guest' : 'Free');
  renderProTab();
}

function renderProTab() {
  const active = $('proActiveCard');
  const upgradeBtn = $('upgradeBtn');
  if (isPro()) {
    if (active) active.hidden = false;
    if ($('proDetailStatus')) $('proDetailStatus').textContent = 'Pro';
    if ($('proDetailCycle')) {
      $('proDetailCycle').textContent = accessCycleLabel(entitlement.cycle);
    }
    if ($('proDetailEmail')) {
      $('proDetailEmail').textContent =
        entitlement.email || session?.email || '—';
    }
    if ($('proDetailExpiry')) {
      $('proDetailExpiry').textContent = entitlement.expiresAt
        ? 'Through ' + formatAccessDeadline(entitlement.expiresAt)
        : 'Lifetime';
    }
    if ($('proHeading')) $('proHeading').textContent = 'Pro looks good on you ✦';
    if ($('proLede')) $('proLede').textContent = '600% boost, every sound, and Music Ad Block are yours.';
    if (upgradeBtn) upgradeBtn.textContent = 'Keep Pro going';
  } else {
    if (active) active.hidden = true;
    if ($('proHeading')) $('proHeading').textContent = 'XCoda Pro';
    if ($('proLede')) {
      $('proLede').textContent = 'Turn it up to 600%. Unlock every sound. Skip music ads.';
    }
    if (upgradeBtn) {
      upgradeBtn.textContent = hasSession() ? 'Upgrade to Pro' : 'Sign in to upgrade';
    }
  }
  $$('.price-pill').forEach((p) => {
    p.classList.toggle('recommended', p.dataset.cycle === selectedCycle);
    p.classList.toggle('active', p.dataset.cycle === selectedCycle);
  });
}

function requireProOrTab() {
  switchTab('pro');
  const hint = $('upgradeHint');
  if (hint) {
    hint.textContent = hasSession()
      ? 'Unlock this with Pro.'
      : `Sign in on You to unlock this.`;
    hint.className = 'settings-hint';
  }
}

function updatePlanStatusUI(verifiedOnline, lastErr) {
  const statusText = isPro()
    ? 'Pro is active ✦'
    : 'You’re on Free';

  if ($('planStatusLineSignedIn')) {
    $('planStatusLineSignedIn').textContent = statusText;
  }

  const hintText = !verifiedOnline && lastErr
    ? 'You’re offline. Your last plan is still here.'
    : (verifiedOnline
      ? (isPro() ? 'Everything is ready.' : 'Turn it up to 300%.')
      : '');
  const hintClass = 'settings-hint' + (verifiedOnline && isPro() ? ' is-ok' : '');

  if ($('planVerifyHintSignedIn')) {
    $('planVerifyHintSignedIn').textContent = hintText;
    $('planVerifyHintSignedIn').className = hintClass;
  }
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
  if (id === 'pro') renderProTab();
  if (id === 'profile') loadProfile();
}

function bindTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  $('planStrip')?.addEventListener('click', () => switchTab('pro'));
  $$('.price-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      selectedCycle = pill.dataset.cycle || 'yearly';
      renderProTab();
    });
  });
  $('upgradeBtn')?.addEventListener('click', () => {
    const hint = $('upgradeHint');
    if (!hasSession()) {
      if (hint) {
        hint.textContent = 'Sign in on You to unlock Pro.';
        hint.className = 'settings-hint is-err';
      }
      switchTab('profile');
      return;
    }
    const email = session?.email || entitlement?.email || '';
    const url = globalThis.XCodaPlan
      ? XCodaPlan.checkoutUrl(selectedCycle, email)
      : SITE + '/checkout.html?cycle=' + encodeURIComponent(selectedCycle);
    chrome.tabs?.create?.({ url });
  });
}

/* ── Boost ──────────────────────────────────────────────────── */

function send(action, value, cb) {
  if (
    !state.powered &&
    action !== 'ping' &&
    action !== 'setPower' &&
    action !== 'setAdblock'
  ) {
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
  send('setAdblock', !!(state.adblock && isPro()));
}

function bindBoost() {
  $('powerToggle')?.addEventListener('change', function () {
    state.powered = this.checked;
    document.body.classList.toggle('is-off', !state.powered);
    applyAll();
    scheduleSaveSite();
    chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: state.powered ? state.volume : 100 });
  });

  $('volumeSlider')?.addEventListener('input', function () {
    let v = parseInt(this.value, 10);
    const cap = FREE_MAX();
    if (!isPro() && v > cap) {
      v = cap;
      this.value = v;
      requireProOrTab();
    }
    setVolume(v);
    scheduleSaveSite();
  });

  $$('.feat').forEach((btn) => btn.addEventListener('click', function () {
    const mode = this.dataset.mode;
    if (globalThis.XCodaPlan && !XCodaPlan.canUseScene(entitlement, mode)) {
      requireProOrTab();
      return;
    }
    $$('.feat').forEach((b) => b.classList.remove('active'));
    this.classList.add('active');
    state.mode = mode;
    send('setMode', state.mode);
    scheduleSaveSite();
  }));

  $('adblockToggle')?.addEventListener('change', function () {
    const hint = $('adblockHint');
    if (this.checked && !isPro()) {
      this.checked = false;
      state.adblock = false;
      if (hint) {
        hint.textContent = 'Unlock Music Ad Block with Pro.';
        hint.className = 'feat-hint is-err';
      }
      requireProOrTab();
      send('setAdblock', false);
      return;
    }
    state.adblock = this.checked;
    send('setAdblock', state.adblock);
    scheduleSaveSite(true);
    if (hint) {
      hint.textContent = state.adblock
        ? 'Music Ad Block is on.'
        : '';
      hint.className = state.adblock ? 'feat-hint is-ok' : 'feat-hint';
    }
  });

  $('autoApplyBtn')?.addEventListener('click', () => {
    state.autoApply = !state.autoApply;
    $('autoApplyBtn').classList.toggle('on', state.autoApply);
    $('autoApplyBtn').textContent = state.autoApply ? 'On' : 'Off';
    if (state.autoApply) scheduleSaveSite(true);
    else {
      chrome.runtime?.sendMessage?.({
        action: 'clearSite',
        tabId,
        url: tabUrl,
        state: { ...state, autoApply: false }
      });
    }
  });
}

function scheduleSaveSite(immediate) {
  if (!tabUrl || !tabId) return;
  const run = () => {
    const payload = { ...state, autoApply: state.autoApply !== false };
    chrome.runtime?.sendMessage?.({ action: 'saveState', tabId, url: tabUrl, state: payload });
  };
  if (immediate) {
    run();
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(run, 400);
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

function setSlider(el, val, min, max) {
  if (!el) return;
  el.value = val;
  el.style.setProperty('--pct', ((val - min) / (max - min) * 100) + '%');
}

function updateVolDisplay(v) {
  const n = Math.round(Number(v) || 0);
  if ($('volValue')) $('volValue').textContent = n + '%';
  if ($('volLabel')) $('volLabel').textContent = n >= 300 ? 'MAX' : 'BOOST';
  if ($('volHint')) {
    $('volHint').textContent =
      n < 80 ? 'Quiet' : n <= 120 ? 'Normal' : n < 250 ? 'Boost' : 'Loud';
  }
  updateDialMotion(n);
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
        bio: ($('bio')?.value || '').trim()
      };
      await apiJson('/api/user/profile', { method: 'PATCH', body: payload });
      if (hint) {
        hint.textContent = 'Profile saved.';
        hint.className = 'settings-hint is-ok';
      }
      if ($('igName')) $('igName').textContent = payload.display_name || '—';
      if ($('igBio')) {
        $('igBio').textContent = payload.bio || '';
        $('igBio').hidden = !payload.bio;
      }
      if ($('igEmail')) $('igEmail').textContent = payload.email || session?.email || '';
    } catch (err) {
      if (hint) {
        hint.textContent = err.message || 'Save failed';
        hint.className = 'settings-hint is-err';
      }
    }
  });

  $('signOutBtn')?.addEventListener('click', async () => {
    stopRealtimePlanUpdates();
    session = null;
    entitlement = normalizeEntitlement({ pro: false });
    updateAuthPanels();
    updatePlanBadge();
    renderUI();
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'SIGN_OUT' }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
    await refreshSession();
    updateAuthPanels();
    updatePlanBadge();
    switchTab('boost');
  });
}

async function loadProfile() {
  updateAuthPanels();
  if (!hasSession()) return;
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
    if ($('igName')) $('igName').textContent = p.display_name || session.display_name || '—';
    if ($('igBio')) {
      $('igBio').textContent = p.bio || '';
      $('igBio').hidden = !p.bio;
    }
    if ($('igEmail')) $('igEmail').textContent = p.email || session.email || '';
    if ($('statPlan')) $('statPlan').textContent = isPro() ? 'Pro' : 'Free';

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
