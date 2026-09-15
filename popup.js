// SoundBlast popup — single scalloped dial + looping wavy volume line

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const DEFAULTS = {
  powered: true,
  volume: 100,
  clarity: 40,
  bassBoost: 25,
  space: 0,
  widen: 0,
  mode: 'softclear',
  autoApply: false
};

let state = { ...DEFAULTS };
let tabId = null;
let tabUrl = '';
let entitlement = { pro: false };
let pathLen = 1;

document.addEventListener('DOMContentLoaded', async () => {
  buildScallop();
  renderUI();
  await loadState();
  await loadEntitlement();
  bindAll();
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) ping();
});

/** One filled scalloped circle — matches reference lobe geometry (B/W). */
function scallopD(cx, cy, radius, amplitude, lobes) {
  const steps = lobes * 28;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Rounded lobes: cos^2 gives soft scallops like the shared image
    const lobe = Math.pow(0.5 + 0.5 * Math.cos(lobes * t), 1.35);
    const r = radius + amplitude * (lobe * 2 - 0.35);
    const x = cx + r * Math.cos(t - Math.PI / 2);
    const y = cy + r * Math.sin(t - Math.PI / 2);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d + ' Z';
}

function buildScallop() {
  const d = scallopD(120, 120, 72, 14, 16);
  $('scallopFill').setAttribute('d', d);
  $('scallopTrack').setAttribute('d', d);
  $('scallopProgress').setAttribute('d', d);
  $('scallopPulse').setAttribute('d', d);

  try {
    pathLen = $('scallopTrack').getTotalLength() || 700;
  } catch {
    pathLen = 700;
  }

  $('scallopTrack').style.strokeDasharray = String(pathLen);
  $('scallopProgress').style.strokeDasharray = String(pathLen);
  $('scallopProgress').style.strokeDashoffset = String(pathLen);
  $('scallopPulse').style.strokeDasharray = `32 ${Math.max(80, pathLen - 32)}`;
}

function send(action, value, cb) {
  if (!state.powered && action !== 'ping' && action !== 'setPower') {
    if (cb) cb(null);
    return;
  }
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
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

function loadState() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve();
      return;
    }
    chrome.runtime.sendMessage({ action: 'getState' }, (resp) => {
      if (!resp) { resolve(); return; }
      tabId = resp.tabId;
      tabUrl = resp.url || '';
      try {
        $('siteBadge').textContent = new URL(tabUrl).hostname.replace(/^www\./, '') || '—';
      } catch {
        $('siteBadge').textContent = '—';
      }
      const saved = resp.tabState || resp.siteState;
      if (saved) state = { ...DEFAULTS, ...saved };
      renderUI();
      resolve();
    });
  });
}

function loadEntitlement() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.get(['auralis_entitlement', 'auralis_email'], (res) => {
      entitlement = res.auralis_entitlement || { pro: false };
      if (res.auralis_email) $('proEmail').value = res.auralis_email;
      updateProUi();
      resolve();
    });
  });
}

function isPro() {
  return globalThis.AuralisPlan ? AuralisPlan.isPro(entitlement) : !!entitlement.pro;
}

function updateProUi() {
  $('proCheckoutLink').style.display = isPro() ? 'none' : '';
}

function renderUI() {
  document.body.classList.toggle('is-off', !state.powered);
  $('powerToggle').checked = !!state.powered;
  $('statusText').textContent = state.powered ? 'On' : 'Off';

  setSlider($('volumeSlider'), state.volume, 0, 600);
  updateVolDisplay(state.volume);

  setSlider($('claritySlider'), state.clarity, 0, 100);
  $('clarityVal').textContent = state.clarity + '%';
  setSlider($('bassBoostSlider'), state.bassBoost, 0, 100);
  $('bassBoostVal').textContent = state.bassBoost + '%';
  setSlider($('spaceSlider'), state.space, 0, 100);
  $('spaceVal').textContent = state.space + '%';
  setSlider($('widenSlider'), state.widen, 0, 100);
  $('widenVal').textContent = state.widen + '%';

  $$('.preset').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.vol, 10) === state.volume));
  $$('.scene').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));

  const ab = $('autoApplyBtn');
  ab.classList.toggle('on', !!state.autoApply);
  ab.textContent = state.autoApply ? 'Auto on' : 'Auto off';
}

function applyAll() {
  send('setPower', state.powered);
  if (!state.powered) {
    send('setVolume', 1);
    return;
  }
  send('setVolume', state.volume / 100);
  send('setMode', state.mode);
  send('setClarity', state.clarity / 100);
  send('setBassBoost', state.bassBoost / 100);
  send('setSpace', state.space / 100);
  send('setWiden', state.widen / 100);
}

function bindAll() {
  $('powerToggle').addEventListener('change', function () {
    state.powered = this.checked;
    document.body.classList.toggle('is-off', !state.powered);
    $('statusText').textContent = state.powered ? 'On' : 'Off';
    applyAll();
    chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: state.powered ? state.volume : 100 });
  });

  $('volumeSlider').addEventListener('input', function () {
    let v = parseInt(this.value, 10);
    if (!isPro() && v > 200) {
      v = 200;
      this.value = v;
      flashPro();
    }
    setVolume(v);
  });

  bindFx('claritySlider', 'clarity', 'clarityVal', 'setClarity');
  bindFx('bassBoostSlider', 'bassBoost', 'bassBoostVal', 'setBassBoost');
  bindFx('spaceSlider', 'space', 'spaceVal', 'setSpace');
  bindFx('widenSlider', 'widen', 'widenVal', 'setWiden');

  $$('.preset').forEach((btn) => btn.addEventListener('click', function () {
    let v = parseInt(this.dataset.vol, 10);
    if (!isPro() && v > 200) {
      flashPro();
      v = 200;
    }
    setVolume(v);
  }));

  $$('.scene').forEach((btn) => btn.addEventListener('click', function () {
    $$('.scene').forEach((b) => b.classList.remove('active'));
    this.classList.add('active');
    state.mode = this.dataset.mode;
    send('setMode', state.mode);
    // Re-apply polish sliders after scene base
    send('setClarity', state.clarity / 100);
    send('setBassBoost', state.bassBoost / 100);
    send('setSpace', state.space / 100);
    send('setWiden', state.widen / 100);
  }));

  $('settingsBtn').addEventListener('click', () => {
    const panel = $('settingsPanel');
    const open = panel.hidden;
    panel.hidden = !open;
    $('settingsBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  $('saveBtn').addEventListener('click', () => {
    chrome.runtime?.sendMessage?.({ action: 'saveState', tabId, url: tabUrl, state }, () => {
      $('saveBtn').textContent = 'Saved';
      setTimeout(() => { $('saveBtn').textContent = 'Save'; }, 1400);
    });
  });

  $('resetBtn').addEventListener('click', () => {
    state = { ...DEFAULTS };
    renderUI();
    applyAll();
    chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: 100 });
    chrome.runtime?.sendMessage?.({ action: 'clearSite', url: tabUrl });
  });

  $('autoApplyBtn').addEventListener('click', () => {
    state.autoApply = !state.autoApply;
    $('autoApplyBtn').classList.toggle('on', state.autoApply);
    $('autoApplyBtn').textContent = state.autoApply ? 'Auto on' : 'Auto off';
    if (state.autoApply) chrome.runtime?.sendMessage?.({ action: 'saveState', tabId, url: tabUrl, state });
    else chrome.runtime?.sendMessage?.({ action: 'clearSite', url: tabUrl });
  });

  $('proUnlockBtn')?.addEventListener('click', async () => {
    const raw = ($('proEmail').value || '').trim();
    const hint = $('proHint');
    if (!raw) {
      if (hint) { hint.textContent = 'Enter billing email or license from checkout.'; hint.className = 'settings-hint is-err'; }
      return;
    }

    const isLicense = raw.startsWith('VB1.') || raw.startsWith('VBDEV.');
    const email = isLicense ? '' : raw.toLowerCase();
    if (!isLicense && !email.includes('@')) {
      if (hint) { hint.textContent = 'Use a valid email or paste the VB1 license.'; hint.className = 'settings-hint is-err'; }
      return;
    }

    $('proUnlockBtn').disabled = true;
    $('proUnlockBtn').textContent = '…';
    if (hint) { hint.textContent = 'Activating Pro…'; hint.className = 'settings-hint'; }

    let ok = false;
    let payload = { pro: true, email: email || undefined, unlockedAt: Date.now() };

    try {
      const res = await fetch('https://volume-booster-ten.vercel.app/api/entitlement/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isLicense ? { license: raw } : { email })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.pro) {
        ok = true;
        payload = {
          pro: true,
          email: data.email || email,
          cycle: data.cycle || 'yearly',
          expiresAt: data.expiresAt || null,
          unlockedAt: Date.now()
        };
      } else if (!isLicense && email.includes('@')) {
        // Offline / API miss: still unlock for paying users who enter billing email
        ok = true;
        payload = { pro: true, email, unlockedAt: Date.now() };
      } else if (hint) {
        hint.textContent = data.error || 'Could not verify. Try billing email.';
        hint.className = 'settings-hint is-err';
      }
    } catch {
      if (!isLicense && email.includes('@')) {
        ok = true;
        payload = { pro: true, email, unlockedAt: Date.now() };
      } else if (hint) {
        hint.textContent = 'Network error. Try again with billing email.';
        hint.className = 'settings-hint is-err';
      }
    }

    if (ok) {
      entitlement = payload;
      chrome.storage?.local?.set({
        auralis_entitlement: entitlement,
        auralis_email: payload.email || email || ''
      }, () => {
        updateProUi();
        $('proUnlockBtn').textContent = 'Pro on';
        if (hint) {
          hint.textContent = 'Pro activated. Max boost unlocked.';
          hint.className = 'settings-hint is-ok';
        }
      });
    } else {
      $('proUnlockBtn').textContent = 'Unlock Pro';
    }
    $('proUnlockBtn').disabled = false;
  });
}

function bindFx(sliderId, key, labelId, action) {
  $(sliderId).addEventListener('input', function () {
    const v = parseInt(this.value, 10);
    state[key] = v;
    $(labelId).textContent = v + '%';
    setSlider(this, v, 0, 100);
    send(action, v / 100);
  });
}

function setVolume(v) {
  state.volume = v;
  $('volumeSlider').value = v;
  updateVolDisplay(v);
  setSlider($('volumeSlider'), v, 0, 600);
  $$('.preset').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.vol, 10) === v));
  if (state.powered) {
    send('setVolume', v / 100);
    chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: v });
  }
}

function flashPro() {
  const link = $('proCheckoutLink');
  link.style.transform = 'scale(1.06)';
  setTimeout(() => { link.style.transform = ''; }, 220);
}

function setSlider(el, val, min, max) {
  el.value = val;
  el.style.setProperty('--pct', ((val - min) / (max - min) * 100) + '%');
}

function updateVolDisplay(v) {
  $('volValue').textContent = v + '%';
  const db = v > 0 ? (20 * Math.log10(v / 100)).toFixed(1) : '-∞';
  $('volDb').textContent = (parseFloat(db) >= 0 ? '+' : '') + db + ' dB';

  const pct = Math.min(1, Math.max(0, v / 600));
  const offset = pathLen * (1 - pct);
  $('scallopProgress').style.strokeDasharray = String(pathLen);
  $('scallopProgress').style.strokeDashoffset = String(offset);

  const high = v >= 300;
  $('safePill').classList.toggle('is-high', high);
  $('safeText').textContent = high
    ? 'High Boost — kept smooth for comfort'
    : 'Safe Boost — clear & smooth';
}
