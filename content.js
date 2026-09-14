// SoundBlast Content Script — bridge between extension and page context
// Injects injected.js into the PAGE (bypasses content-script isolation)
// Then relays commands via CustomEvents

(function () {
  'use strict';
  if (window.__SB_CS_LOADED) return;
  window.__SB_CS_LOADED = true;

  // ── Inject page-context script ─────────────────────────────────────────
  function injectPageScript() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  injectPageScript();

  // ── Relay chrome messages → CustomEvents into page ─────────────────────
  function cmd(action, value) {
    window.dispatchEvent(new CustomEvent('__sb_cmd', { detail: { action, value } }));
  }

  // ── Listen for pong back from page ─────────────────────────────────────
  let pongResolve = null;
  window.addEventListener('__sb_pong', (e) => {
    if (pongResolve) { pongResolve(e.detail); pongResolve = null; }
  });

  // ── Message handler ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.target !== 'content') return;

    if (msg.action === 'ping') {
      pongResolve = (detail) => sendResponse(detail);
      cmd('ping', null);
      setTimeout(() => { if (pongResolve) { pongResolve({ ok: true, hooked: 0 }); pongResolve = null; } }, 400);
      return true;
    }

    // Map popup actions → page commands
    const map = {
      setVolume:    'setVolume',
      setMode:      'setMode',
      setFrequency: 'setFreq',
      setReverb:    'setReverb',
      setPitch:     'setPitch',
      setClarity:   'setClarity',
      setBassBoost: 'setBassBoost',
      setSpace:     'setSpace',
      setWiden:     'setWiden',
      setPan:       'setPan',
      setPower:     'setPower',
    };
    if (map[msg.action]) {
      cmd(map[msg.action], msg.value);
      sendResponse({ ok: true });
    }
  });

  // Resume AudioContext on any user interaction (autoplay policy)
  ['click','keydown','touchstart','scroll'].forEach(ev =>
    document.addEventListener(ev, () => cmd('resume', null), { once: false, passive: true })
  );

})();
