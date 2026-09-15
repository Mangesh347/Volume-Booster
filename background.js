// SoundBlast background — badge + per-site auto-apply + Pro revalidation

const SITE = 'https://volume-booster-ten.vercel.app';
const REVALIDATE_ALARM = 'vb_revalidate_plan';

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#111111' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
  chrome.alarms.create(REVALIDATE_ALARM, { periodInMinutes: 30 });
  revalidateStoredPlan();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REVALIDATE_ALARM, { periodInMinutes: 30 });
  revalidateStoredPlan();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REVALIDATE_ALARM) revalidateStoredPlan();
});

function normalizeEntitlement(raw) {
  const email = String(raw?.email || '').trim().toLowerCase();
  const expiresAt = raw?.expiresAt || raw?.expires_at || null;
  const wantsPro = !!(raw?.pro || raw?.plan === 'pro');
  const stillActive =
    wantsPro &&
    (!expiresAt || new Date(expiresAt).getTime() > Date.now());
  if (stillActive) {
    return {
      pro: true,
      plan: 'pro',
      email,
      cycle: raw?.cycle || null,
      expiresAt,
      unlockedAt: raw?.unlockedAt || Date.now(),
      verifiedAt: Date.now()
    };
  }
  return {
    pro: false,
    plan: 'free',
    email,
    cycle: null,
    expiresAt: null,
    unlockedAt: null,
    verifiedAt: Date.now()
  };
}

async function verifyEmailAgainstServer(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em.includes('@')) return normalizeEntitlement({ pro: false, email: em });
  const res = await fetch(SITE + '/api/entitlement/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: em })
  });
  const data = await res.json().catch(() => ({}));
  return normalizeEntitlement({
    pro: !!(res.ok && data.pro),
    plan: data.plan,
    email: data.email || em,
    cycle: data.cycle,
    expiresAt: data.expiresAt
  });
}

function revalidateStoredPlan() {
  chrome.storage.local.get(
    ['vb_billing_email', 'auralis_email', 'auralis_entitlement', 'vb_supabase_session'],
    async (res) => {
      const emails = [];
      const push = (e) => {
        const em = String(e || '').trim().toLowerCase();
        if (em.includes('@') && !emails.includes(em)) emails.push(em);
      };
      push(res.vb_billing_email);
      push(res.auralis_email);
      push(res.auralis_entitlement?.email);
      push(res.vb_supabase_session?.email);

      let best = normalizeEntitlement(res.auralis_entitlement || { pro: false });
      for (const em of emails) {
        try {
          const access = await verifyEmailAgainstServer(em);
          if (access.pro && !best.pro) best = access;
          else if (access.pro && best.pro) {
            const ae = best.expiresAt ? new Date(best.expiresAt).getTime() : Infinity;
            const be = access.expiresAt ? new Date(access.expiresAt).getTime() : Infinity;
            if (be >= ae) best = access;
          } else if (!access.pro && best.email === em) {
            best = access;
          }
        } catch (_) {
          best = normalizeEntitlement(best);
        }
      }

      if (!emails.length) best = normalizeEntitlement(best);

      chrome.storage.local.set({
        auralis_entitlement: best,
        vb_billing_email: best.email || res.vb_billing_email || '',
        auralis_email: best.email || res.auralis_email || ''
      });
    }
  );
}

/** Website success page → verify billing email against Supabase, then cache Pro/Free. */
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'VB_PRO_UNLOCKED') {
    sendResponse?.({ ok: false });
    return false;
  }
  const email = String(msg.email || '').trim().toLowerCase();
  chrome.storage.local.set(
    {
      vb_billing_email: email,
      auralis_email: email
    },
    () => {
      verifyEmailAgainstServer(email)
        .then((entitlement) => {
          // If server not ready yet, keep a short optimistic Pro from payment page
          if (!entitlement.pro && msg.expiresAt) {
            const optimistic = normalizeEntitlement({
              pro: true,
              email,
              cycle: msg.cycle,
              expiresAt: msg.expiresAt
            });
            if (optimistic.pro) {
              chrome.storage.local.set({ auralis_entitlement: optimistic }, () => {
                sendResponse?.({ ok: true, pro: true, pending: true });
                setTimeout(revalidateStoredPlan, 4000);
              });
              return;
            }
          }
          chrome.storage.local.set({ auralis_entitlement: entitlement }, () => {
            sendResponse?.({ ok: true, pro: !!entitlement.pro });
            setTimeout(revalidateStoredPlan, 3000);
          });
        })
        .catch(() => {
          const fallback = normalizeEntitlement({
            pro: true,
            email,
            cycle: msg.cycle,
            expiresAt: msg.expiresAt
          });
          chrome.storage.local.set({ auralis_entitlement: fallback }, () =>
            sendResponse?.({ ok: true, offline: true, pro: !!fallback.pro })
          );
        });
    }
  );
  return true;
});

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function updateBadge(tabId, volume) {
  const v = parseInt(volume) || 100;
  const text = v === 100 ? '' : v >= 600 ? 'MAX' : v + '%';
  chrome.action.setBadgeText({ tabId, text });
}

// ── Auto-apply on page load ──────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || tab.url.startsWith('chrome://')) return;
  const domain = getDomain(tab.url);
  if (!domain) return;

  chrome.storage.local.get(`site_${domain}`, (res) => {
    const saved = res[`site_${domain}`];
    if (!saved || !saved.autoApply) return;

    updateBadge(tabId, saved.volume);

    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, files: ['content.js'] },
      () => {
        if (chrome.runtime.lastError) return;
        [800, 2500].forEach((delay) => {
          setTimeout(() => applyToTab(tabId, saved), delay);
        });
      }
    );
  });
});

function applyToTab(tabId, s) {
  const powered = s.powered !== false;
  const msgs = [
    { action: 'setPower', value: powered },
    { action: 'setVolume', value: powered ? (s.volume || 100) / 100 : 1 },
    { action: 'setMode', value: s.mode || 'softclear' },
    { action: 'setClarity', value: (s.clarity != null ? s.clarity : 35) / 100 },
    { action: 'setBassBoost', value: (s.bassBoost != null ? s.bassBoost : 20) / 100 },
    { action: 'setSpace', value: (s.space || 0) / 100 },
    { action: 'setWiden', value: (s.widen || 0) / 100 },
    { action: 'setFrequency', value: s.bassFreq || 200 },
    { action: 'setReverb', value: (s.reverb || 0) / 100 },
    { action: 'setPitch', value: s.pitch || 1.0 },
    { action: 'setPan', value: (s.pan || 0) / 100 },
    { action: 'setAdblock', value: !!s.adblock }
  ];
  msgs.forEach((m) => {
    chrome.tabs.sendMessage(tabId, { target: 'content', ...m }, () => {
      void chrome.runtime.lastError;
    });
  });
}

// ── Message relay ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse(null);
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, msg, (r) => {
        void chrome.runtime.lastError;
        sendResponse(r);
      });
    });
    return true;
  }

  if (msg.action === 'updateBadge') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) updateBadge(tabs[0].id, msg.volume);
    });
    return false;
  }

  if (msg.action === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({});
        return;
      }
      const domain = getDomain(tabs[0].url);
      chrome.storage.local.get([`tab_${tabs[0].id}`, `site_${domain}`], (res) =>
        sendResponse({
          tabState: res[`tab_${tabs[0].id}`],
          siteState: res[`site_${domain}`],
          tabId: tabs[0].id,
          url: tabs[0].url
        })
      );
    });
    return true;
  }

  if (msg.action === 'saveState') {
    const { tabId, url, state } = msg;
    const domain = getDomain(url);
    const updates = { [`tab_${tabId}`]: state };
    if (domain) updates[`site_${domain}`] = state;
    chrome.storage.local.set(updates, () => {
      updateBadge(tabId, state.volume);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.action === 'clearSite') {
    const domain = getDomain(msg.url);
    if (domain) chrome.storage.local.remove(`site_${domain}`);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) updateBadge(tabs[0].id, 100);
    });
    return false;
  }

  if (msg.action === 'revalidatePlan') {
    revalidateStoredPlan();
    sendResponse?.({ ok: true });
    return false;
  }

  if (msg.action === 'siteUsageTick') {
    const host = String(msg.host || '')
      .toLowerCase()
      .replace(/^www\./, '');
    const seconds = Math.min(60, Math.max(1, Math.floor(Number(msg.seconds) || 15)));
    if (!host) return false;
    chrome.storage.local.get(['vb_site_usage', 'vb_listen_local'], (res) => {
      const map = res.vb_site_usage || {};
      map[host] = (Number(map[host]) || 0) + seconds;
      const total = Object.values(map).reduce((n, v) => n + (Number(v) || 0), 0);
      chrome.storage.local.set({
        vb_site_usage: map,
        vb_listen_local: total,
        vb_active_boost_host: host,
        vb_active_boost_at: Date.now()
      });
    });
    return false;
  }
});
