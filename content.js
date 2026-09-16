// XCoda isolated-world controller + Music Ad Block

(function () {
  'use strict';
  if (globalThis.__XCODA_CS_LOADED) return;
  globalThis.__XCODA_CS_LOADED = true;

  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function cmd(action, value) {
    try {
      return globalThis.XCodaEngine?.command?.(action, value) || {
        ok: false,
        reason: 'engine_not_ready'
      };
    } catch {
      return { ok: false, reason: 'engine_error' };
    }
  }

  if (extAlive()) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!extAlive()) return;
        if (msg.target !== 'content') return;

        if (msg.action === 'ping') {
          sendResponse(cmd('ping', null));
          return false;
        }

        const map = {
          setVolume: 'setVolume',
          setMode: 'setMode',
          setFrequency: 'setFreq',
          setReverb: 'setReverb',
          setPitch: 'setPitch',
          setClarity: 'setClarity',
          setBassBoost: 'setBassBoost',
          setSpace: 'setSpace',
          setWiden: 'setWiden',
          setPan: 'setPan',
          setPower: 'setPower',
          setAdblock: 'setAdblock'
        };
        if (map[msg.action]) {
          if (msg.action === 'setAdblock') {
            sendResponse({ ok: true, adblock: applyAdblock(!!msg.value) });
            return;
          }
          sendResponse(cmd(map[msg.action], msg.value));
        }
      });
    } catch (_) {}
  }

  let adblockWanted = false;
  const MUSIC_RE =
    /(youtube\.com|youtu\.be|music\.youtube|spotify|soundcloud|music\.apple|deezer|tidal|bandcamp|twitch\.tv|netflix|primevideo|disneyplus|hotstar|jiosaavn|gaana|wynk\.in|music\.amazon|pandora|mixcloud|audius|vimeo)/i;

  function hostOk() {
    try {
      if (globalThis.VBMusicSites?.isMusicHost?.(location.hostname)) return true;
      return MUSIC_RE.test(location.hostname);
    } catch {
      return false;
    }
  }

  function mediaPlaying() {
    const nodes = document.querySelectorAll('video, audio');
    for (const el of nodes) {
      if (!el.paused && !el.ended && el.readyState > 2) return true;
    }
    return false;
  }

  function applyAdblock(on) {
    adblockWanted = !!on;
    const active = adblockWanted && hostOk() && mediaPlaying();
    if (globalThis.VBAdblock) return VBAdblock.apply(active);
    return { ok: false, reason: 'missing_module' };
  }

  ['click', 'keydown', 'touchstart', 'scroll'].forEach((ev) =>
    document.addEventListener(ev, () => cmd('resume', null), { once: false, passive: true })
  );

  const tickId = setInterval(() => {
    if (!extAlive()) {
      clearInterval(tickId);
      return;
    }
    try {
      if (adblockWanted) applyAdblock(true);
      else if (globalThis.VBAdblock) VBAdblock.apply(false);
    } catch (_) {
      clearInterval(tickId);
    }
  }, 15000);
})();
