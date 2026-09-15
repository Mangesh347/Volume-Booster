/**
 * Bridges website Google/Supabase session → extension chrome.storage
 * Runs only on volume-booster-ten.vercel.app
 */
(function () {
  function sync() {
    try {
      const raw = localStorage.getItem("vb_supabase_session");
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session?.access_token) return;
      chrome.storage?.local?.set({
        vb_supabase_session: session,
        auralis_email: session.email || ""
      });
    } catch (_) {}
  }
  sync();
  window.addEventListener("storage", (e) => {
    if (e.key === "vb_supabase_session") sync();
  });
  setInterval(sync, 2000);
})();
