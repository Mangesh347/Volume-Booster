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

  function applyAdblock(on) {
    adblockWanted = !!on;
    const active = adblockWanted && hostOk();
    const engine = cmd('adTick', active);
    const styles = globalThis.VBAdblock
      ? VBAdblock.apply(active)
      : { ok: false, reason: 'missing_module' };
    return { active, engine, styles };
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
  }, 2000);
})();
