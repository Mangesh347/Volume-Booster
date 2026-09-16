/**
 * Pro music/video ad shield — lightweight CSS hide on known hosts.
 * Loaded before content.js (manifest). Non-destructive; toggle via apply().
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'vb-adblock-style';

  const RULES = `
/* YouTube / YT Music */
ytd-ad-slot-renderer,
ytd-banner-promo-renderer,
ytd-player-legacy-desktop-watch-ads-renderer,
ytd-display-ad-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-in-feed-ad-layout-renderer,
#player-ads,
.ytp-ad-module,
.ytp-ad-overlay-container,
.ytp-ad-progress-list,
.masthead-ad,
#masthead-ad,
.video-ads,
.ytmusic-mealbar-promo-renderer,
tp-yt-paper-dialog.ytd-popup-container {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  max-height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}

/* Spotify web */
[data-testid="top-ad"],
.Root__ads-container,
aside[aria-label*="Advertisement" i] {
  display: none !important;
}

/* SoundCloud */
.playableTiles__ad,
.soundList__item.ad,
.bannerAds {
  display: none !important;
}
`;

  let enabled = false;

  function apply(on) {
    enabled = !!on;
    try {
      let el = document.getElementById(STYLE_ID);
      if (!enabled) {
        if (el) el.remove();
        return { ok: true, enabled: false };
      }
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = RULES;
        (document.head || document.documentElement).appendChild(el);
      }
      return { ok: true, enabled: true };
    } catch (err) {
      return { ok: false, reason: String(err && err.message) || 'adblock_error' };
    }
  }

  global.VBAdblock = { apply, isEnabled: () => enabled };
})(typeof globalThis !== 'undefined' ? globalThis : window);
