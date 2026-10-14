"use strict";
// Shul Doors: the box. Serves the portal inside Home Assistant (ingress),
// keeps the rules, and every night (and after every change) brings the
// Protector.Net doors in line with them.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { createEngine } = require("./engine/load");
const { makeClient } = require("./lib/protector");
const { sync } = require("./lib/sync");
const { localDate } = require("./lib/time");

const DATA = process.env.SD_DATA || "/data";
const PORT = +process.env.SD_PORT || 8099;
const file = (n) => path.join(DATA, n);
const readJson = (n, dflt) => { try { return JSON.parse(fs.readFileSync(file(n), "utf8")); } catch { return dflt; } };
const writeJson = (n, v) => { const tmp = file(n) + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, file(n)); };
const log = (level, msg) => console.log(`${new Date().toISOString()} ${level.toUpperCase()} ${msg}`);

const opts = { mode: "practice", sync_time: "00:30", horizon_days: 30, budget: 24, pilot_doors: "", ...readJson("options.json", {}) };
if (!["practice", "pilot", "live", "restore"].includes(opts.mode)) opts.mode = "practice";
const pilotDoors = String(opts.pilot_doors || "").split(/[\s,]+/).filter(Boolean);

// ---------- calendar: about a year back and three years ahead, rebuilt monthly ----------
function buildCalendar() {
  const now = Date.now();
  const from = localDate(now - 400 * 864e5), to = localDate(now + 3 * 366 * 864e5);
  return new Promise((resolve, reject) => execFile("python3", [path.join(__dirname, "calendar", "calgen.py"), from, to], { maxBuffer: 64e6 },
    (err, out) => (err ? reject(err) : resolve(JSON.parse(out)))));
}

let calendar, engine, state, version, store, lastReport = null, syncing = false, pendingSync = false, halted = false;

async function init() {
  fs.mkdirSync(path.join(DATA, "backups"), { recursive: true });
  try { calendar = await buildCalendar(); writeJson("calendar.json", calendar); }
  catch (e) { calendar = readJson("calendar.json", null); if (!calendar) throw e; log("error", "calendar rebuild failed, using the saved one: " + e.message); }
  engine = createEngine({ calendar });
  try { state = loadState(); } catch (e) { halted = true; return; }
  if (!state) {
    // First start: the real door list and groups, but none of the example rules,
    // events, codes or people, so nothing made up can ever reach a door.
    state = engine.raw("structuredClone(SAMPLE)");
    Object.assign(state, { rules: [], events: [], hdates: [], gdates: [], overrides: [], requests: [], notes: [], vendors: [], codes: [], log: [], away: [], rabbiAwayNow: false,
      users: state.users.filter((u) => u.role === "Super admin").map((u) => ({ name: u.name, role: u.role })), contacts: [] });
    state.situations.forEach((x) => { x.on = false; x.ranges = []; });
    writeJson("state.json", state); log("info", "first start: loaded the door list and groups, no rules yet");
  }
  version = readJson("version.json", { v: 1 }).v;
  store = loadStore();
  lastReport = readJson("last-report.json", null);
  engine.setState(state);
  backup();
  log("info", `ready, mode=${opts.mode}${opts.mode === "pilot" ? " doors=" + pilotDoors.join(",") : ""}, calendar ${calendar.start} to ${calendar.end}`);
}

// The rules file is never overwritten if it can't be read: the damaged copy is kept
// and the newest good backup is used instead.
let stateProblem = "";
function validState(x) { return x && Array.isArray(x.doors) && x.doors.length && Array.isArray(x.rules) && Array.isArray(x.groups); }
function loadState() {
  if (!fs.existsSync(file("state.json"))) return null;
  const s = readJson("state.json", null);
  if (validState(s)) return s;
  const keep = file(`state.damaged-${Date.now()}.json`); fs.copyFileSync(file("state.json"), keep);
  const dir = path.join(DATA, "backups");
  for (const b of fs.readdirSync(dir).filter((x) => x.startsWith("state-")).sort().reverse()) {
    try { const x = JSON.parse(fs.readFileSync(path.join(dir, b), "utf8")); if (validState(x)) { stateProblem = `The rules file was damaged. Loaded the backup from ${b.slice(6, 16)}. The damaged file was kept as ${path.basename(keep)}.`; log("error", stateProblem); writeJson("state.json", x); return x; } } catch { /* try older */ }
  }
  stateProblem = "The rules file was damaged and there is no good backup. Nothing is being changed at the doors.";
  log("error", stateProblem);
  throw new Error(stateProblem);
}
function backup() {
  if (!validState(state)) return;
  const day = localDate(Date.now()), dir = path.join(DATA, "backups");
  fs.writeFileSync(path.join(dir, `state-${day}.json`), JSON.stringify(state));            // today's latest
  if (store) fs.writeFileSync(path.join(dir, `store-${day}.json`), JSON.stringify(store));
  for (const kind of ["state-", "store-"]) {
    const all = fs.readdirSync(dir).filter((x) => x.startsWith(kind)).sort();
    for (const old of all.slice(0, -60)) fs.unlinkSync(path.join(dir, old));              // keep 60 days
  }
}
function loadStore() {   // what the box remembers about the doors (original schedules)
  if (!fs.existsSync(file("store.json"))) return {};
  const s = readJson("store.json", null); if (s && typeof s === "object") return s;
  const dir = path.join(DATA, "backups");
  for (const b of fs.readdirSync(dir).filter((x) => x.startsWith("store-")).sort().reverse()) { try { const x = JSON.parse(fs.readFileSync(path.join(dir, b), "utf8")); log("error", `store.json was damaged, using ${b}`); return x; } catch { /* older */ } }
  log("error", "store.json was damaged and there is no backup"); return {};
}

// ---------- syncing with the doors ----------
async function runSync(reason) {
  if (halted) return (lastReport = { at: Date.now(), mode: opts.mode, reason, actions: [], warnings: [], errors: [stateProblem], ok: false });
  if (syncing) { pendingSync = true; return lastReport; }
  syncing = true;
  try {
    if (!opts.protector_url || !opts.protector_username || !opts.protector_password) {
      lastReport = { at: Date.now(), mode: opts.mode, actions: [], warnings: ["Protector.Net login not set yet. Enter it in the add-on's Configuration tab."], errors: [], ok: false };
      return lastReport;
    }
    const client = makeClient({ baseUrl: opts.protector_url, username: opts.protector_username, password: opts.protector_password, log });
    const parts = await client.partitions();
    const part = opts.partition ? parts.find((p) => p.Name === opts.partition) : parts[0];
    if (!part) throw new Error(opts.partition ? `partition "${opts.partition}" not found (Protector.Net has: ${parts.map((p) => p.Name).join(", ")})` : "no partition visible to this Protector.Net user");
    await client.setPartition(part.Id);
    engine.setState(state);
    const r = await sync({ client, engine, state, store, mode: opts.mode, pilotDoors, horizonDays: +opts.horizon_days, budget: +opts.budget, log });
    r.reason = reason;
    lastReport = r;
    writeJson("store.json", store);
    writeJson("last-report.json", r);
    fs.appendFileSync(file("history.jsonl"), JSON.stringify({ at: r.at, reason, mode: r.mode, actions: r.actions.length, errors: r.errors, warnings: r.warnings.length }) + "\n");
    log(r.ok ? "info" : "warn", `sync (${reason}): ${r.actions.length} ${opts.mode === "practice" ? "would-do" : "done"} actions, ${r.errors.length} errors`);
    return r;
  } catch (e) {
    lastReport = { at: Date.now(), mode: opts.mode, reason, actions: [], warnings: [], errors: [e.message], ok: false };
    writeJson("last-report.json", lastReport);
    log("error", `sync (${reason}) failed: ${e.message}`);
    return lastReport;
  } finally {
    syncing = false;
    if (pendingSync) { pendingSync = false; setTimeout(() => runSync("queued change"), 1000); }
  }
}

// nightly run, a retry every 10 minutes after a failure, and an hourly check
let lastNightly = readJson("nightly.json", { day: "" }).day, lastNightlyTry = 0;
process.on("unhandledRejection", (e) => log("error", "unexpected: " + (e && e.stack || e)));
setInterval(() => tick().catch((e) => log("error", "scheduler: " + e.message)), +process.env.SD_TICK_MS || 60000);
async function tick() {
  const now = Date.now(), day = localDate(now);
  const [h, m] = String(opts.sync_time).split(":").map(Number);
  const hm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  const due = hm[0] * 60 + hm[1] >= h * 60 + m;
  if (due && lastNightly !== day && now - lastNightlyTry >= 10 * 60000) {   // a failed nightly run is retried every 10 minutes
    lastNightlyTry = now;
    if (!halted && (new Date(now).getUTCDate() === 1 || !calendar || calendar.end < localDate(now + 2 * 366 * 864e5))) {
      try { calendar = await buildCalendar(); writeJson("calendar.json", calendar); engine = createEngine({ calendar, state }); }
      catch (e) { log("error", "calendar rebuild failed, keeping the current one: " + e.message); }
    }
    backup();
    const r = await runSync("nightly");
    if (r && r.ok) { lastNightly = day; writeJson("nightly.json", { day }); }
  } else if (lastReport && !lastReport.ok && now - lastReport.at > 10 * 60000) {
    await runSync("retry");
  } else if (!lastReport || now - lastReport.at > 60 * 60000) {
    await runSync("hourly check");
  }
}

// ---------- web ----------
let saveTimer = null;

// ---------- assistant: the page asks the box, the box asks Claude ----------
// The API key stays here; the browser never sees it. Tools run in the page (they
// only read the schedule or show proposals the person must Save), so this just
// relays one Messages API call at a time, with a spending guard.
const AI_URL = process.env.SD_AI_URL || "https://api.anthropic.com/v1/messages";
const AI_MODEL = opts.ai_model || "claude-sonnet-5-5";
const aiCalls = [];   // times of recent calls, for the hourly cap
const AI_PER_HOUR = 120;
function aiAsk(body) {
  return new Promise((resolve) => {
    const now = Date.now(); while (aiCalls.length && aiCalls[0] < now - 3600e3) aiCalls.shift();
    if (aiCalls.length >= AI_PER_HOUR) return resolve({ status: 429, body: { code: "rate_limited" } });
    aiCalls.push(now);
    const payload = JSON.stringify({ model: AI_MODEL, max_tokens: 2000, system: body.system, messages: body.messages, ...(body.tools && body.tools.length ? { tools: body.tools } : {}) });
    const u = new URL(AI_URL), lib = u.protocol === "https:" ? require("https") : http;
    const req = lib.request(u, { method: "POST", timeout: 90000, headers: { "content-type": "application/json", "x-api-key": opts.anthropic_api_key, "anthropic-version": "2023-06-01", "content-length": Buffer.byteLength(payload) } }, (r) => {
      const chunks = []; r.on("data", (c) => chunks.push(c)); r.on("end", () => {
        let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* not json */ }
        if (r.statusCode >= 400) log("warn", `assistant: Claude answered ${r.statusCode} ${j && j.error ? j.error.type : ""}`);
        resolve({ status: r.statusCode < 400 ? 200 : r.statusCode === 429 ? 429 : 502, body: r.statusCode < 400 ? j : { code: r.statusCode === 401 ? "bad_key" : r.statusCode === 429 ? "rate_limited" : "error" } });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => { log("warn", "assistant: " + e.message); resolve({ status: 502, body: { code: "unreachable" } }); });
    req.end(payload);
  });
}
// The weekly schedules the doors run today, in plain words, grouped by schedule.
function currentLines(cur) {
  if (!cur) return [];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const LBL = { Unlock: "Open", CardOrPin: "Card or PIN", Card: "Card only", Pin: "PIN only", CardAndPin: "Card and PIN", UnlockWithFirstCardIn: "First credential in", Lockdown: "Lockdown", DualCard: "Dual card" };
  const t = (m) => { const h = Math.floor(m / 60) % 24, mi = m % 60; return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const out = ["", "Current schedules in Protector.Net:"];
  for (const g of Object.values(cur)) {
    out.push(`  ${g.name} (${g.doors.join(", ")})`);
    const byDay = DAYS.map((d) => g.spans.filter((s) => s.d === d).sort((a, b) => a.a - b.a).map((s) => `${t(s.a)} to ${t(s.b)} ${LBL[s.m] || s.m}`).join("; ") || "nothing set");
    // days with the same plan are written once
    const seen = new Map(); DAYS.forEach((d, i) => { const k = byDay[i]; seen.set(k, [...(seen.get(k) || []), d.slice(0, 3)]); });
    for (const [plan, days] of seen) out.push(`    ${days.join(", ")}: ${plan}`);
  }
  return out;
}
function compareLines(c) {
  if (!c) return ["Rules compared with the doors: not yet"];
  if (c.error) return [`Rules compared with the doors: could not check (${c.error})`];
  const head = `Rules compared with the doors (rest of today and tomorrow): ${c.checked} doors checked, ${c.differ.length} differ${c.skipped.length ? `, ${c.skipped.length} could not be read` : ""}`;
  return [head, ...c.differ.map((d) => `  ${d.name}: ${d.minutes} minutes differ, first at ${d.first.date} ${d.first.at} (rules say ${d.first.rules}, the door is ${d.first.door})`),
    ...currentLines(c.current),
    ...(c.sample ? ["", "How Protector.Net reports a schedule (for checking):", "  " + JSON.stringify(c.sample).slice(0, 900)] : [])];
}
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
function portal(req) {
  const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  const user = req.headers["x-remote-user-display-name"] || req.headers["x-remote-user-name"] || "";
  const s = structuredClone(state);
  const match = s.users.find((u) => u.name.toLowerCase() === user.toLowerCase()) || s.users.find((u) => user.toLowerCase().startsWith(u.name.toLowerCase() + " "));
  if (match) s.me = match.name;
  else if (user) { s.users.push({ name: user, role: "Super admin" }); s.me = user; }   // only Home Assistant admins can open the panel (panel_admin)
  const boot = `<script>window.__SD_STATE=${JSON.stringify(s).replace(/</g, "\\u003c")};window.__SD_VERSION=${version};window.__SD_USER=${JSON.stringify(user).replace(/</g, "\\u003c")};</script>`;
  return html.replace("__CAL__", JSON.stringify(calendar.cal)).replace("__HEB__", JSON.stringify(calendar.heb)).replace("__PARSHA__", JSON.stringify(calendar.parsha))
    .replace('const HEB_START = "2026-09-01";', `const HEB_START = ${JSON.stringify(calendar.start)};`)
    .replace("<script>", boot + "<script>");
}
// Only Home Assistant's ingress proxy / Supervisor (172.30.32.2) may talk to the box.
const ALLOWED = new Set(["172.30.32.2", "127.0.0.1", "::1"]);
const server = http.createServer((req, res) => {
  const ip = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (!ALLOWED.has(ip) && !process.env.SD_ANY_IP) { res.writeHead(403); return res.end("forbidden"); }
  const u = new URL(req.url, "http://box");
  const p = u.pathname.replace(/\/+$/, "") || "/";
  if (halted && req.method === "GET" && (p === "/" || p === "/index.html")) return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shul Doors</title><body style="font:16px -apple-system,Segoe UI,sans-serif;padding:24px;max-width:640px;background:#fff;color:#111"><h1>Shul Doors is paused</h1><p>${stateProblem.replace(/</g, "&lt;")}</p><p>The doors keep running on what was last loaded into the panels. Send the add-on log to whoever set this up.</p></body>`, "text/html; charset=utf-8");
  if (halted && p === "/api/state") return send(res, 503, { error: stateProblem });
  if (req.method === "GET" && (p === "/" || p === "/index.html")) return send(res, 200, portal(req), "text/html; charset=utf-8");
  if (req.method === "GET" && p === "/api/status") return send(res, 200, { problem: stateProblem, mode: opts.mode, pilotDoors, version, last: lastReport && { at: lastReport.at, ok: lastReport.ok, actions: lastReport.actions, errors: lastReport.errors, warnings: lastReport.warnings, loadedThrough: lastReport.loadedThrough, compare: lastReport.compare } });
  if (req.method === "GET" && p === "/api/report") {
    const r = lastReport || {}; const lines = [`Mode: ${opts.mode}`, `Checked: ${r.at ? new Date(r.at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "not yet"} (${r.reason || ""})`, "",
      `Problems (${(r.errors || []).length}):`, ...(r.errors || []).map((x) => "  " + x), "", `Notes (${(r.warnings || []).length}):`, ...(r.warnings || []).map((x) => "  " + x), "",
      ...compareLines(r.compare), "",
      `${opts.mode === "practice" ? "Would do" : "Did"} (${(r.actions || []).length}):`, ...(r.actions || []).map((x) => "  " + x), "", "Special days loaded through:", ...Object.entries(r.loadedThrough || {}).map(([d, t]) => `  ${d}: ${t}`)];
    return send(res, 200, lines.join("\n"), "text/plain; charset=utf-8");
  }
  if (req.method === "GET" && p === "/api/ai") return send(res, 200, { on: !!opts.anthropic_api_key, model: AI_MODEL });
  if (req.method === "POST" && p === "/api/ai") {
    if (!opts.anthropic_api_key) return send(res, 503, { code: "not_declared" });
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size < 600000) chunks.push(c); });
    req.on("end", async () => {
      if (size >= 600000) return send(res, 413, { code: "too_long" });
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 400, { code: "error" }); }
      if (!Array.isArray(body.messages) || !body.messages.length) return send(res, 400, { code: "error" });
      const r = await aiAsk(body); send(res, r.status, r.body);
    });
    return;
  }
  if (req.method === "POST" && p === "/api/sync") { runSync("by hand").then((r) => send(res, 200, r)); return; }
  if (req.method === "PUT" && p === "/api/state") {
    const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 400, { error: "bad json" }); }
      if (!body.state || !Array.isArray(body.state.doors) || !Array.isArray(body.state.rules)) return send(res, 400, { error: "not a valid state" });
      if (+body.version !== version) return send(res, 409, { conflict: true, version });
      try {   // never save rules the engine can't run: try every door today and tomorrow
        engine.setState(body.state);
        const t = engine.today(), t2 = engine.addDays(t, 1);
        for (const d of body.state.doors) { engine.day(d.id, t); engine.day(d.id, t2); engine.day(d.id, t2, { plain: true }); }
      }
      catch (e) { engine.setState(state); return send(res, 400, { error: "rules failed to run: " + e.message }); }
      const urgent = JSON.stringify(state.overrides || []) !== JSON.stringify(body.state.overrides || []);   // "open now" should not wait
      state = body.state; version++;
      writeJson("state.json", state); writeJson("version.json", { v: version }); backup();
      clearTimeout(saveTimer); saveTimer = setTimeout(() => runSync(urgent ? "opened or locked by hand" : "change saved"), urgent ? 1500 : 15000);
      send(res, 200, { ok: true, version });
    }); return;
  }
  send(res, 404, { error: "not found" });
});

init().then(() => {
  server.listen(PORT, () => log("info", `portal on port ${PORT}`));
  setTimeout(() => runSync("start"), 5000);
}).catch((e) => { log("error", "could not start: " + e.stack); process.exit(1); });
