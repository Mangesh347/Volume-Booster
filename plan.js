/** XCoda Pro plan helpers */
(function (global) {
  const SITE_URL = 'https://volume-booster-ten.vercel.app';
  const FREE_MAX_VOLUME = 300;
  const PRO_SCENES = new Set(['bass', 'vocal', 'cinema', 'lofi']);

  const Plan = {
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
    canUseScene(entitlement, mode) {
      if (!PRO_SCENES.has(mode)) return true;
      return this.isPro(entitlement);
    }
  };

  global.XCodaPlan = Plan;
})(typeof globalThis !== 'undefined' ? globalThis : window);
