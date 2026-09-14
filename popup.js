// SoundBlast popup — simple Material UI + mathematical wavy dial

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const DEFAULTS = {
  powered: true,
  volume: 100,
  clarity: 35,
  bassBoost: 20,
  mode: 'softclear',
  autoApply: false
};

let state = { ...DEFAULTS };
let tabId = null;
let tabUrl = '';
let entitlement = { pro: false };

document.addEventListener('DOMContentLoaded', async () => {
  buildWavyRings();
  renderUI();
  await loadState();
  await loadEntitlement();
  bindAll();
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) ping();
});

/** Perfect circular wavy rings: r = R + A·sin(nθ) */
function wavyPath(cx, cy, radius, amplitude, waves, strokeWidth) {
  const steps = waves * 24;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius + amplitude * Math.sin(waves * t);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return `<path d="${d} Z" stroke-width="${strokeWidth}"/>`;
}

function buildWavyRings() {
  $('ringA').innerHTML = wavyPath(110, 110, 78, 5.5, 14, 1.5);
  $('ringB').innerHTML = wavyPath(110, 110, 66, 4.2, 14, 1.25);
  $('ringC').innerHTML = wavyPath(110, 110, 54, 3.2, 12, 1.1);
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
  if (isPro()) $('proCheckoutLink').style.display = 'none';
  else $('proCheckoutLink').style.display = '';
}

function clampVolume(v) {
  const max = isPro() || !globalThis.AuralisPlan ? 600 : AuralisPlan.FREE_MAX_VOLUME;
  return Math.max(0, Math.min(max, v));
}

function renderUI() {
  document.body.classList.toggle('is-off', !state.powered);
  $('powerToggle').checked = !!state.powered;
  $('statusText').textContent = state.powered ? 'On' : 'Off';

  const v = state.volume;
  setSlider($('volumeSlider'), v, 0, 600);
  updateVolDisplay(v);
  setSlider($('claritySlider'), state.clarity, 0, 100);
  $('clarityVal').textContent = state.clarity + '%';
  setSlider($('bassBoostSlider'), state.bassBoost, 0, 100);
  $('bassBoostVal').textContent = state.bassBoost + '%';
  $$('.preset').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.vol, 10) === v));

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
  send('setMode', 'softclear');
  send('setClarity', state.clarity / 100);
  send('setBassBoost', state.bassBoost / 100);
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
    state.volume = v;
    updateVolDisplay(v);
    setSlider(this, v, 0, 600);
    highlightPreset(v);
    if (state.powered) {
      send('setVolume', v / 100);
      chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: v });
    }
  });

  $('claritySlider').addEventListener('input', function () {
    const v = parseInt(this.value, 10);
    state.clarity = v;
    $('clarityVal').textContent = v + '%';
    setSlider(this, v, 0, 100);
    send('setClarity', v / 100);
  });

  $('bassBoostSlider').addEventListener('input', function () {
    const v = parseInt(this.value, 10);
    state.bassBoost = v;
    $('bassBoostVal').textContent = v + '%';
    setSlider(this, v, 0, 100);
    send('setBassBoost', v / 100);
  });

  $$('.preset').forEach((btn) => btn.addEventListener('click', function () {
    let v = parseInt(this.dataset.vol, 10);
    if (!isPro() && v > 200) {
      flashPro();
      v = 200;
    }
    state.volume = v;
    $('volumeSlider').value = v;
    updateVolDisplay(v);
    setSlider($('volumeSlider'), v, 0, 600);
    highlightPreset(v);
    if (state.powered) {
      send('setVolume', v / 100);
      chrome.runtime?.sendMessage?.({ action: 'updateBadge', volume: v });
    }
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

  $('proUnlockBtn')?.addEventListener('click', () => {
    const email = ($('proEmail').value || '').trim().toLowerCase();
    if (!email.includes('@')) return;
    entitlement = { pro: true, email, unlockedAt: Date.now() };
    chrome.storage?.local?.set({ auralis_entitlement: entitlement, auralis_email: email }, () => {
      updateProUi();
      $('proUnlockBtn').textContent = 'Pro';
    });
  });
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

  // Outer progress arc (circumference ≈ 2πr = 640.88 for r=102)
  const circ = 2 * Math.PI * 102;
  const pct = Math.min(1, v / 600);
  $('progressArc').style.strokeDasharray = String(circ);
  $('progressArc').style.strokeDashoffset = String(circ * (1 - pct));

  const high = v >= 300;
  $('safePill').classList.toggle('is-high', high);
  $('safeText').textContent = high
    ? 'High Boost — volume is limited for safety'
    : 'Safe Boost — sound stays smooth';
}

function highlightPreset(v) {
  $$('.preset').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.vol, 10) === v));
}
