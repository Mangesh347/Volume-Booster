// XCoda redesign QA: popup renders with no errors, Tab Mixer messages work and keep the
// Free 300% cap, mute works, existing slider still saves. Run: node scripts/qa-redesign.cjs
const { chromium } = require("C:/Users/Lenovo/node_modules/playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const EXT = process.env.XC_EXT || path.resolve(__dirname, "..");
const SHOT = path.join(EXT, "qa-shots");
fs.mkdirSync(SHOT, { recursive: true });

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "xc-qa-")), {
    headless: false, viewport: { width: 340, height: 600 },
    args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  await ctx.route("https://music.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>Lo-fi radio</title><h1>music</h1>" }));
  const out = { errors: [], steps: {} };
  const ok = (n, c, x) => (out.steps[n] = c ? "pass" : `FAIL ${x ? JSON.stringify(x) : ""}`);
  try {
    const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
    const id = sw.url().split("/")[2];
    const music = await ctx.newPage();
    await music.goto("https://music.test/");
    const musicTabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://music.test/*" }))[0].id);

    const p = await ctx.newPage();
    p.on("pageerror", (e) => out.errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && out.errors.push(m.text()));
    await p.goto(`chrome-extension://${id}/popup.html`);
    await p.waitForTimeout(1500);
    ok("popup renders dial + modes", (await p.locator("#volValue").isVisible()) && (await p.locator(".feat").count()) === 4);

    const list = await p.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ action: "mixerList" }, r)));
    ok("mixerList answers with an array", Array.isArray(list), list);

    const set = await p.evaluate((tabId) => new Promise((r) => chrome.runtime.sendMessage({ action: "mixerSet", tabId, volume: 550 }, r)), musicTabId);
    const stored = await sw.evaluate((t) => chrome.storage.local.get(`tab_${t}`), musicTabId);
    ok("mixerSet caps Free at 300%", set && set.volume === 300 && stored[`tab_${musicTabId}`].volume === 300, { set, stored });

    const bad = await p.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ action: "mixerSet", tabId: "x", volume: 100 }, r)));
    ok("mixerSet refuses a bad tab id", bad && bad.ok === false);

    await p.evaluate((tabId) => new Promise((r) => chrome.runtime.sendMessage({ action: "mixerMute", tabId, muted: true }, r)), musicTabId);
    const muted = await sw.evaluate(async (t) => (await chrome.tabs.get(t)).mutedInfo.muted, musicTabId);
    ok("mixerMute mutes the tab", muted === true);

    // Existing behaviour: the main slider still updates the readout
    await p.locator("#volumeSlider").fill("180");
    await p.waitForTimeout(200);
    ok("main boost slider still works", (await p.locator("#volValue").textContent()).includes("180"));

    await p.click('.preset[data-v="200"]');
    await p.waitForTimeout(250);
    ok("preset 200% sets the boost", (await p.locator("#volValue").textContent()).includes("200") && (await p.locator('.preset[data-v="200"]').getAttribute("class")).includes("on"));
    await p.click('.preset[data-v="600"]');
    await p.waitForTimeout(250);
    ok("600% preset stays locked on Free", !(await p.locator("#volValue").textContent()).includes("600"));
    const cmds = await sw.evaluate(() => chrome.commands.getAll());
    ok("hotkeys are registered", ["volume-up", "volume-down", "volume-reset"].every((n) => cmds.some((c) => c.name === n)));
    await p.click('.tab[data-tab="boost"]').catch(() => {});
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SHOT, "popup-boost.png"), fullPage: true });
    await p.click('.tab[data-tab="pro"]');
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(SHOT, "popup-pro.png"), fullPage: true });
    ok("no horizontal overflow", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  } catch (e) {
    out.fatal = e.stack;
  } finally {
    await ctx.close();
  }
  out.passed = Object.values(out.steps).filter((v) => v === "pass").length;
  out.total = Object.keys(out.steps).length;
  console.log(JSON.stringify(out, null, 1));
})();
