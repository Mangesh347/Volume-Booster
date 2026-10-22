// Real UI captures for the store screenshots: sound modes, and the Tab Mixer with tabs playing.
// The mixer only lists tabs that are actually making sound, so its list is fed a realistic set of
// tabs here (the rendering is the shipped mixer.js). Run: node scripts/store-shots.cjs
const { chromium } = require("C:/Users/Lenovo/node_modules/playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const EXT = path.resolve(__dirname, "..");
const SHOT = path.join(EXT, "qa-shots");

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "xc-st-")), {
    headless: false, viewport: { width: 340, height: 600 }, deviceScaleFactor: 2,
    args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const id = sw.url().split("/")[2];
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const real = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (msg, cb) => {
      if (msg && msg.action === "mixerList") {
        const tabs = [
          { id: 901, title: "Lo-fi beats to study to", url: "https://www.youtube.com/watch?v=x", icon: "", volume: 160, muted: false },
          { id: 902, title: "Discover Weekly", url: "https://open.spotify.com/playlist/x", icon: "", volume: 240, muted: false },
          { id: 903, title: "Team stand-up", url: "https://meet.google.com/abc", icon: "", volume: 100, muted: true }
        ];
        return cb ? cb(tabs) : Promise.resolve(tabs);
      }
      return real(msg, cb);
    };
  });
  await p.goto(`chrome-extension://${id}/popup.html`);
  await p.waitForTimeout(1500);
  await p.locator('.preset[data-v="200"]').click();
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.scrollingElement.scrollTop = 0; document.querySelectorAll("*").forEach((el) => el.scrollTop && (el.scrollTop = 0)); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOT, "store-boost.png") });
  await p.locator(".features").scrollIntoViewIfNeeded();
  await p.locator('.feat[data-mode="softclear"]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOT, "store-modes.png") });
  await p.locator("#mixer").scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(SHOT, "store-mixer.png") });
  await p.click('.tab[data-tab="pro"]');
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(SHOT, "store-pro.png") });
  console.log("mixer rows:", await p.evaluate(() => document.querySelectorAll(".mixer-row").length));
  await ctx.close();
})();
