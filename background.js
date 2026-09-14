// SoundBlast background — badge + per-site auto-apply

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#111111' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
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

    // Restore badge
    updateBadge(tabId, saved.volume);

    // Inject engine then apply settings after media loads
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, files: ['content.js'] },
      () => {
        if (chrome.runtime.lastError) return;
        // Try at 800ms and again at 2500ms to catch lazy-loaded players
        [800, 2500].forEach(delay => {
          setTimeout(() => applyToTab(tabId, saved), delay);
        });
      }
    );
  });
});

function applyToTab(tabId, s) {
  const powered = s.powered !== false;
  const msgs = [
    { action: 'setPower',     value: powered },
    { action: 'setVolume',    value: powered ? (s.volume || 100) / 100 : 1 },
    { action: 'setMode',      value: s.mode || 'softclear' },
    { action: 'setClarity',   value: (s.clarity != null ? s.clarity : 35) / 100 },
    { action: 'setBassBoost', value: (s.bassBoost != null ? s.bassBoost : 20) / 100 },
    { action: 'setSpace',     value: (s.space || 0) / 100 },
    { action: 'setWiden',     value: (s.widen || 0) / 100 },
    { action: 'setFrequency', value: s.bassFreq || 200 },
    { action: 'setReverb',    value: (s.reverb || 0) / 100 },
    { action: 'setPitch',     value: s.pitch || 1.0 },
    { action: 'setPan',       value: (s.pan || 0) / 100 },
  ];
  msgs.forEach(m => {
    chrome.tabs.sendMessage(tabId, { target: 'content', ...m }, () => {
      void chrome.runtime.lastError;
    });
  });
}

// ── Message relay ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse(null); return; }
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
      if (!tabs[0]) { sendResponse({}); return; }
      const domain = getDomain(tabs[0].url);
      chrome.storage.local.get(
        [`tab_${tabs[0].id}`, `site_${domain}`],
        (res) => sendResponse({
          tabState:  res[`tab_${tabs[0].id}`],
          siteState: res[`site_${domain}`],
          tabId: tabs[0].id,
          url:   tabs[0].url
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
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`tab_${tabId}`);
});
