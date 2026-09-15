/** Auralis Pro plan helpers */
(function (global) {
  const SITE_URL = 'https://volume-booster-ten.vercel.app';
  const FREE_MAX_VOLUME = 200;
  const PRO_SCENES = new Set(['bass', 'vocal', 'cinema', 'lofi', 'slowreverb']);

  const Plan = {
    SITE_URL,
    FREE_MAX_VOLUME,
    checkoutUrl(cycle, email) {
      const u = new URL('/checkout.html', SITE_URL);
      u.searchParams.set('cycle', cycle || 'yearly');
      if (email) u.searchParams.set('email', email);
      return u.toString();
    },
    isPro(entitlement) {
      if (!entitlement || !entitlement.pro) return false;
      if (!entitlement.expiresAt) return true;
      return new Date(entitlement.expiresAt).getTime() > Date.now();
    },
    canUseVolume(entitlement, volume) {
      return this.isPro(entitlement) || volume <= FREE_MAX_VOLUME;
    },
    canUseScene(entitlement, mode) {
      if (!PRO_SCENES.has(mode)) return true;
      return this.isPro(entitlement);
    },
    canUseSpaceWiden(entitlement) {
      return this.isPro(entitlement);
    },
    canAutoApplyUnlimited(entitlement, existingCount) {
      return this.isPro(entitlement) || existingCount < 1;
    }
  };

  global.AuralisPlan = Plan;
})(typeof globalThis !== 'undefined' ? globalThis : window);
