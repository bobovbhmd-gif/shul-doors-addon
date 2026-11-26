// The main screens, in a real browser against the real server (practice mode, a made up
// building, a pretend Home Assistant). Each screen must open without a script error,
// show something, and fit the width with no sideways scrolling, on a phone and a PC.
// Screenshots land in tests/screens/ (not committed) for a look by eye.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { APP, baseState, rule, clock, zman, W5, freePorts } from "../helpers.mjs";
import { fakeHa } from "../fakes/ha.mjs";

const require = createRequire(import.meta.url);
// Playwright: a local install if there is one, otherwise the one installed for the whole machine
function playwright() {
  try { return require("playwright"); } catch { /* not installed here */ }
  const root = execSync("npm root -g").toString().trim();
  return createRequire(path.join(root, "noop.js"))("playwright");
}
const { chromium } = playwright();
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, "..", "screens");

let ha, srv, browser, port, data, out = "";
before(async () => {
  ha = await fakeHa();
  data = fs.mkdtempSync(path.join(os.tmpdir(), "sd-ui-"));
  const st = baseState({
    events: [{ id: "e1", name: "A wedding", type: "Wedding", from: "2026-12-01", to: "2026-12-01" }],
    rules: [
      rule({ id: 1, no: 1, name: "Shacharis", doors: ["g:main"], inc: { wd: W5 }, start: clock("05:45"), end: clock("09:30"), mode: "Unlock" }),
      rule({ id: 2, no: 2, name: "Mincha", doors: ["g:main"], inc: { wd: W5 }, start: zman("sunset", -30), end: clock("22:30"), mode: "Unlock" }),
      rule({ id: 3, no: 3, name: "Wedding", doors: ["g:main"], inc: { fest: ["type:Wedding"] }, start: clock("17:00"), end: clock("01:00"), mode: "Card" }),
    ],
  });
  fs.writeFileSync(path.join(data, "state.json"), JSON.stringify(st));
  fs.writeFileSync(path.join(data, "options.json"), JSON.stringify({ mode: "practice" }));
  let textPort; [port, textPort] = await freePorts(2);
  srv = spawn(process.execPath, ["server.js"], { cwd: APP, env: { ...process.env, SD_DATA: data, SD_PORT: String(port), SD_TEXT_PORT: String(textPort), SD_ANY_IP: "1",
    SD_HA_URL: `http://127.0.0.1:${ha.port}/api`, SD_HA_TOKEN: "x", SD_HA_WS: "" } });
  srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 100 && !/portal on port/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  assert.match(out, /portal on port/, "server did not start:\n" + out);
  browser = await chromium.launch({ args: ["--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks"] });   // the pretend outer page has no real address; let it frame the app
  fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => { await browser?.close(); srv?.kill(); ha?.close(); if (data) fs.rmSync(data, { recursive: true, force: true }); });

// Home Assistant adds the signed in user's name to requests to the box only. Doing the same here:
// sending it to other sites too (Google Fonts) makes the browser refuse those requests.
async function newPage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route(`http://127.0.0.1:${port}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-remote-user-name": "Tester" } }));
  return page;
}

const TABS = ["home", "doors", "rules", "events", "preview", "open", "activity", "msgs", "setup", "parking", "mikvah", "lights", "codes", "lockdown", "climate"];

for (const [w, h, label] of [[390, 844, "phone"], [820, 1180, "tablet"], [1280, 900, "pc"]]) {
  test(`main screens on a ${label} (${w}px)`, async () => {
    const page = await newPage(w, h);
    const errors = [];
    page.on("pageerror", (e) => errors.push(`${e.message} ${(e.stack || "").split("\n")[1] || ""}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => typeof showTab === "function");
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => S.me), "Tester");
    const problems = [];
    for (const t of TABS) {
      await page.evaluate((t) => showTab(t), t);
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({ tab: CUR_TAB, sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        text: (document.querySelector("main") || document.body).innerText.trim().length,
        wide: [...document.querySelectorAll("body *")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 2 && getComputedStyle(el).position !== "fixed" && !el.closest("[style*='overflow'],.scroll,.hscroll,table"); }).slice(0, 3).map((el) => el.tagName + "." + el.className) }));
      if (r.sw > r.iw + 1) problems.push(`${t}: page scrolls sideways (${r.sw}px wide on a ${r.iw}px screen) ${r.wide.join(" ")}`);
      if (r.text < 20) problems.push(`${t}: screen looks empty`);
      await page.screenshot({ path: path.join(SHOTS, `${label}-${t}.png`) });
    }
    assert.deepEqual(errors, [], "script errors");
    assert.deepEqual(problems, []);
    await page.close();
  });
}

test("the rule editor opens and lists the rules with their numbers", async () => {
  const page = await newPage(1280, 900);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof showTab === "function");
  await page.evaluate(() => showTab("rules"));
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => document.body.innerText);
  for (const n of ["Shacharis", "Mincha", "Wedding"]) assert.ok(text.includes(n), n);
  assert.match(text, /#1/);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the box answers its status without a server error", async () => {
  const r = await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { "X-Remote-User-Name": "Tester" } });
  assert.ok(r.status < 500, "status " + r.status);
  assert.doesNotMatch(out, /\bERROR\b.*(TypeError|ReferenceError)/, out);
});

test("Users: add a text only mikva person (no login fields, Text only card, saved without a login)", async () => {
  const page = await newPage(390, 844);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof showTab === "function");
  await page.evaluate(() => showTab("setup"));
  await page.click('#setupIdx [data-sp="users"]');
  await page.click("#nuOpen");
  await page.selectOption("#nuRole", "mikva");
  assert.equal(await page.isVisible("#nuUser"), false, "no username");
  assert.equal(await page.isVisible("#nuPw"), false, "no password");
  assert.equal(await page.isVisible("#nuEmail"), false, "no email");
  assert.equal(await page.isVisible("#nuTextNote"), true);
  await page.fill("#nuName", "Mikva Lady");
  await page.click("#nuGo");
  assert.equal(await page.isVisible("#mNewU"), true, "a mobile number is needed first");
  await page.fill("#nuPhone", "718-555-0102");
  await page.click("#nuGo");
  const card = page.locator('details.ublock[data-uname="Mikva Lady"]');
  await card.waitFor();
  const t = await card.innerText();
  assert.match(t, /Text only/);
  assert.match(t, /Get the mikva temperature by text/);
  assert.match(t, /Send welcome text again/);
  assert.doesNotMatch(t, /Reset password|Send welcome again|Role|Doors/);
  const calls = [];
  page.on("request", (r) => { if (/api\/(logins|sms\/)/.test(r.url())) calls.push(r.url().replace(/^.*\/api\//, "")); });
  await page.click("#uSave");
  await page.waitForTimeout(1500);
  assert.deepEqual(calls, ["sms/mikvawelcome"], "only the welcome text: no login, no password text");
  assert.match(await page.textContent("body"), /texting isn't live yet, so no welcome text went out/, "says so when texting isn't live");
  const saved = await page.evaluate(() => S.users.find((u) => u.name === "Mikva Lady"));
  assert.equal(saved.textOnly, "mikva"); assert.equal(saved.login, false); assert.equal(saved.phone, "718-555-0102");
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= 391, "no sideways scroll: " + sw);
  assert.deepEqual(errors, []);
  await page.close();
});

// Inside Home Assistant, Shul Manager sits in frames, under Home Assistant's top bar and inside its scrolling area.
// A pop-up must stay inside the part of the screen you can see: never under the top bar, never below the bottom.
for (const [label, host] of [["same address", "127.0.0.1"], ["another address", "127.0.0.2"]]) {
  test(`pop-ups stay inside the visible part of the screen inside Home Assistant's frames (${label})`, async () => {
    const page = await newPage(390, 844);
    const outer = `http://${host}:${port}/__frame_test.html`;
    await page.route(outer, (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0">
      <div style="position:fixed;top:0;left:0;right:0;height:100px;background:#123;z-index:2"></div>
      <div id="sc" style="position:absolute;top:100px;bottom:0;left:0;right:0;overflow:auto">
        <iframe id="app" src="http://127.0.0.1:${port}/" style="display:block;width:100%;height:1400px;border:0"></iframe></div></body>` }));
    await page.goto(outer);
    const fr = page.frameLocator("#app");
    let frame = null;
    for (let i = 0; i < 100 && !frame; i++) { frame = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith(`http://127.0.0.1:${port}/`)); if (!frame) await page.waitForTimeout(100); }
    assert.ok(frame, "the app loaded in the frame: " + page.frames().map((f) => f.url()).join(" | "));
    await frame.waitForFunction(() => typeof showTab === "function");
    await page.evaluate(() => { document.getElementById("sc").scrollTop = 200; });   // Home Assistant's area scrolled down a bit
    await page.waitForTimeout(400);
    await frame.evaluate(() => { showTab("setup"); });
    await fr.locator('#setupIdx [data-sp="users"]').click();
    await fr.locator("#nuOpen").click();
    await page.waitForTimeout(500);
    const off = await page.evaluate(() => document.getElementById("app").getBoundingClientRect().top);
    const box = await frame.evaluate(() => { const r = document.querySelector("#mNewU .mbox").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const top = box.top + off, bottom = box.bottom + off;
    assert.ok(top >= 99, `the pop-up's top is under the top bar (${Math.round(top)}px, the bar ends at 100px)`);
    assert.ok(bottom <= 845, `the pop-up's bottom is below the screen (${Math.round(bottom)}px of 844px)`);
    assert.ok(await fr.locator("#nuGo").isVisible(), "the Add button in the pop-up's header can be seen");
    await page.close();
  });
}
