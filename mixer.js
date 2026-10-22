// Tab Mixer: control every other tab that's playing sound, right from the popup.
// Uses the background's mixerList / mixerSet / mixerMute, so the plan cap (300% Free,
// 600% Pro) is enforced in one place.
(function () {
  'use strict';
  const list = document.getElementById('mixerList');
  const box = document.getElementById('mixer');
  if (!list || !box || !chrome?.runtime?.sendMessage) return;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cap = () => (typeof isPro === 'function' && isPro() ? 600 : (globalThis.XCodaPlan && XCodaPlan.FREE_MAX_VOLUME) || 300);
  // Friendly names: "YouTube", "Spotify"… from music-sites.js when known, else the bare domain
  const host = (u) => {
    try {
      const h = new URL(u).hostname.replace(/^(www|open|music|m)\./, '');
      return (globalThis.VBMusicSites && VBMusicSites.displayName && VBMusicSites.displayName(h)) || h;
    } catch { return ''; }
  };

  function render(tabs, activeId) {
    const others = tabs.filter((t) => t.id !== activeId);
    box.hidden = !others.length;
    list.innerHTML = others.map((t, i) => `
      <li class="mixer-row" style="--i:${i}" data-id="${t.id}">
        <button type="button" class="mixer-mute${t.muted ? ' is-muted' : ''}" aria-pressed="${t.muted}" title="${t.muted ? 'Unmute' : 'Mute'} this tab">
          ${t.icon ? `<img src="${esc(t.icon)}" alt="" width="18" height="18">` : '<span class="mixer-dot"></span>'}
        </button>
        <span class="mixer-name" title="${esc(t.title)}">${esc(host(t.url) || t.title)}</span>
        <input type="range" min="0" max="${cap()}" value="${Math.min(t.volume, cap())}" aria-label="Volume for ${esc(host(t.url) || t.title)}">
        <span class="mixer-val">${Math.min(t.volume, cap())}%</span>
      </li>`).join('');
  }

  function load() {
    chrome.tabs.query({ active: true, currentWindow: true }, (act) => {
      chrome.runtime.sendMessage({ action: 'mixerList' }, (tabs) => {
        void chrome.runtime.lastError;
        render(Array.isArray(tabs) ? tabs : [], act && act[0] && act[0].id);
      });
    });
  }

  let t;
  list.addEventListener('input', (e) => {
    const r = e.target.closest('input[type="range"]');
    if (!r) return;
    const row = r.closest('.mixer-row');
    row.querySelector('.mixer-val').textContent = `${r.value}%`;
    clearTimeout(t);
    t = setTimeout(() => chrome.runtime.sendMessage({ action: 'mixerSet', tabId: Number(row.dataset.id), volume: Number(r.value) }, () => void chrome.runtime.lastError), 60);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.mixer-mute');
    if (!b) return;
    const muted = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(muted));
    b.classList.toggle('is-muted', muted);
    b.title = `${muted ? 'Unmute' : 'Mute'} this tab`;
    chrome.runtime.sendMessage({ action: 'mixerMute', tabId: Number(b.closest('.mixer-row').dataset.id), muted }, () => void chrome.runtime.lastError);
  });

  load();
  // Tabs start/stop playing while the popup is open; never re-render under a dragging finger
  setInterval(() => !list.contains(document.activeElement) && load(), 4000);
})();

// One-tap boost presets (same rules as the slider: Free stops at 300%)
(function () {
  'use strict';
  const box = document.getElementById('presets');
  if (!box) return;
  const mark = () => box.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Math.round(state.volume)));
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.preset');
    if (!b) return;
    const v = Number(b.dataset.v);
    if (v > FREE_MAX() && !isPro()) {
      requireProOrTab();
      return;
    }
    if (!state.powered) {
      state.powered = true;
      if (document.getElementById('powerToggle')) document.getElementById('powerToggle').checked = true;
      document.body.classList.remove('is-off');
      applyAll();
    }
    setVolume(v);
    scheduleSaveSite(true);
    mark();
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  });
  document.getElementById('volumeSlider')?.addEventListener('input', mark);
  setTimeout(mark, 600); // after the saved state loads
})();
