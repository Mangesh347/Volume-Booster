export default async function run(page) {
  await page.route("**/api/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      auth: {
        available: true,
        googleEnabled: true,
        emailLoginEnabled: true,
        emailSignupEnabled: true
      }
    })
  }));
  await page.addInitScript(() => {
    const local = {};
    const session = {};
    const area = (store) => ({
      get(keys, callback) {
        const names = Array.isArray(keys) ? keys : [keys];
        callback(Object.fromEntries(names.filter((key) => key in store).map((key) => [key, store[key]])));
      },
      set(values, callback) {
        Object.assign(store, values || {});
        callback?.();
      },
      remove(keys, callback) {
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete store[key]);
        callback?.();
      }
    });
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          if (message.action === "getState") {
            callback?.({
              ok: true,
              tabId: 1,
              url: "https://music.youtube.com/watch?v=test",
              state: {
                powered: true,
                volume: 100,
                mode: "softclear",
                clarity: 40,
                bassBoost: 25,
                space: 0,
                widen: 0,
                autoApply: true,
                adblock: false
              }
            });
            return;
          }
          if (message.action === "ping") {
            callback?.({ ok: true });
            return;
          }
          callback?.({ ok: true });
        }
      },
      storage: {
        local: area(local),
        session: area(session),
        onChanged: { addListener() {} }
      }
    };
  });
  await page.reload();
  await page.waitForSelector("#volumeSlider");

  const visibleControls = await page.locator(
    "button:visible, input:visible, textarea:visible"
  ).count();
  await page.locator("#volumeSlider").evaluate((element) => {
    element.value = "250";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const volumeUpdated = await page.locator("#volValue").textContent();

  await page.locator("#autoApplyBtn").click();
  const autoApplyUpdated = await page.locator("#autoApplyBtn").textContent();

  await page.locator('[data-mode="bass"]').click();
  const proPanelOpened = await page.locator("#tab-pro").isVisible();

  await page.locator('[data-tab="profile"]').click();
  const profilePanelOpened = await page.locator("#tab-profile").isVisible();
  const googleVisible = await page.locator("#btnGoogle").isVisible();

  return {
    visibleControls,
    volumeUpdated,
    autoApplyUpdated,
    proPanelOpened,
    profilePanelOpened,
    googleVisible
  };
}
