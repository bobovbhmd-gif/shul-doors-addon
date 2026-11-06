"use strict";
// Shul Doors: the box. Serves the portal inside Home Assistant (ingress),
// keeps the rules, and every night (and after every change) brings the
// Protector.Net doors in line with them.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { createEngine } = require("./engine/load");
const { outputReportLines } = require("./lib/outputs");
const people = require("./lib/people");
const { syncAccess } = require("./lib/access");
const { createSms } = require("./lib/sms");
const { makeClient } = require("./lib/protector");
const { sync } = require("./lib/sync");
const { localDate } = require("./lib/time");
const { createActivity } = require("./lib/activity");

const DATA = process.env.SD_DATA || "/data";
const PORT = +process.env.SD_PORT || 8099;
const file = (n) => path.join(DATA, n);
const readJson = (n, dflt) => { try { return JSON.parse(fs.readFileSync(file(n), "utf8")); } catch { return dflt; } };
const writeJson = (n, v) => { const tmp = file(n) + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, file(n)); };
const log = (level, msg) => console.log(`${new Date().toISOString()} ${level.toUpperCase()} ${msg}`);

const opts = { mode: "practice", sync_time: "00:30", horizon_days: 30, budget: 24, pilot_doors: "", ...readJson("options.json", {}) };
if (!["practice", "pilot", "live", "restore"].includes(opts.mode)) opts.mode = "practice";
const pilotDoors = String(opts.pilot_doors || "").split(/[\s,]+/).filter(Boolean).map((x) => x.toUpperCase());   // "mag" works as well as "MAG"

// ---------- calendar: about a year back and three years ahead, rebuilt monthly ----------
function buildCalendar() {
  const now = Date.now();
  const from = localDate(now - 400 * 864e5), to = localDate(now + 3 * 366 * 864e5);
  return new Promise((resolve, reject) => execFile("python3", [path.join(__dirname, "calendar", "calgen.py"), from, to], { maxBuffer: 64e6 },
    (err, out) => (err ? reject(err) : resolve(JSON.parse(out)))));
}

let sms = null;
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
  sms = createSms({ opts, file: file("sms.jsonl"), store, save: () => writeJson("store.json", store), log });
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
// "Buzz open": a pulse unlock, the same as pressing the door's release button. Super admins only;
// in practice mode nothing is sent. Every buzz is written to the history.
// ---------- the Cloudflare sign-in list follows the users' emails ----------
let accessState = { on: false, emails: [], at: 0, why: "" }, accessTimer = null;
function accessSoon(ms = 4000) {
  if (!opts.cloudflare_api_token) return;
  clearTimeout(accessTimer);
  accessTimer = setTimeout(async () => {
    try {
      const r = await syncAccess({ token: opts.cloudflare_api_token, accountId: opts.cloudflare_account_id || "", group: opts.cloudflare_access_group || "Shul Doors users", users: state.users, always: opts.cloudflare_always_allow || "" });
      accessState = { on: true, emails: r.emails || [], at: Date.now(), why: r.why || "" };
      if (r.added && r.added.length) log("info", "sign-in list: added " + r.added.join(", "));
      if (r.removed && r.removed.length) log("info", "sign-in list: removed " + r.removed.join(", "));
    } catch (e) { accessState = { ...accessState, on: true, at: Date.now(), why: "Couldn't update the Cloudflare sign-in list: " + e.message }; log("warn", "sign-in list: " + e.message); }
  }, ms);
}
// ---------- someone else changed the schedule: tell the people picked in Alerts ----------
// In the app it shows under Messages, "Changes by others". By text (when texting is on), changes
// made close together go out as one text a few minutes after the last one.
const changeQueue = {};   // recipient -> { by: Set, lines: [], timer }
function changeAlerts(before, after, who) {
  const last = Math.max(0, ...((before.log || []).map((e) => +e.t || 0)));
  const fresh = (after.log || []).filter((e) => (+e.t || 0) > last && e.text);
  if (!fresh.length) return;
  const to = (after.alerts && Array.isArray(after.alerts.changeTo)) ? after.alerts.changeTo : (after.users || []).filter((u) => u.role === "Super admin").map((u) => u.name);
  for (const name of to) {
    const u = (after.users || []).find((x) => x.name === name); if (!u || !u.phone) continue;
    const mine = fresh.filter((e) => String(e.u || who).toLowerCase() !== name.toLowerCase()); if (!mine.length) continue;
    const q = changeQueue[name] = changeQueue[name] || { by: new Set(), lines: [], timer: null };
    for (const e of mine) { q.by.add(e.u || who); q.lines.push(String(e.text)); }
    clearTimeout(q.timer);
    q.timer = setTimeout(() => {
      delete changeQueue[name];
      if (!sms || !(state.alerts && state.alerts.changeText !== false)) return;
      const by = [...q.by].join(" and "), n = q.lines.length;
      const body = `${by} changed the door schedule: ${q.lines.slice(0, 3).join("; ")}${n > 3 ? `; and ${n - 3} more` : ""}. See Messages in Shul Doors.`;
      sms.sendOne(u.phone, body.slice(0, 480), "change").catch(() => {});
    }, +process.env.SD_CHANGE_MS || 3 * 60e3);
  }
}
// ---------- the assistant's memory: each person's chats, and what it learned about them ----------
// Chats are kept per person on the box (the last 40), so a closed chat picks up where it was.
// Screenshots are not kept. "memory.json" holds short notes about each person (how they like
// answers, what they call things); they only shape that person's chats.
const slug = (n) => String(n || "default").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
function personOf(req) { const u = matchUser(haUser(req)); return u ? u.name : (haUser(req) || "default"); }
function readBody(req) { return new Promise((r) => { const ch = []; let n = 0; req.on("data", (c) => { n += c.length; if (n < 3e6) ch.push(c); }); req.on("end", () => { try { r(JSON.parse(Buffer.concat(ch).toString("utf8") || "{}")); } catch { r(null); } }); }); }
function chatFile(who) { try { fs.mkdirSync(file("chats"), { recursive: true }); } catch {} return file("chats/" + slug(who) + ".json"); }
function loadChats(who) { try { return JSON.parse(fs.readFileSync(chatFile(who), "utf8")); } catch { return { threads: [] }; } }
function saveChats(who, c) { c.threads = c.threads.sort((a, b) => b.updated - a.updated).slice(0, 40); fs.writeFileSync(chatFile(who), JSON.stringify(c)); }
const textOnly = (turns) => (Array.isArray(turns) ? turns : []).slice(-24).map((t) => ({ role: t.role === "assistant" ? "assistant" : "user",
  content: typeof t.content === "string" ? t.content.slice(0, 8000) : (Array.isArray(t.content) ? t.content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n").slice(0, 8000) : "") })).filter((t) => t.content);
function loadMemory() { try { return JSON.parse(fs.readFileSync(file("memory.json"), "utf8")); } catch { return {}; } }
async function chatApi(req, res, p) {
  const who = personOf(req), now = Date.now();
  if (p === "/api/seen") {   // when this person last looked at changes others made
    if (req.method === "POST") { const b = (await readBody(req)) || {}; store.seen = store.seen || {}; store.seen[who] = Math.min(now, +b.t || now); writeJson("store.json", store); }
    return send(res, 200, { t: (store.seen && store.seen[who]) || 0 });
  }
  if (p === "/api/memory") {
    const mem = loadMemory(); mem[who] = mem[who] || [];
    if (req.method === "POST") {
      const b = (await readBody(req)) || {}; const t = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (b.remove != null) mem[who] = mem[who].filter((x) => x.id !== b.remove);
      else if (t && !mem[who].some((x) => x.text.toLowerCase() === t.toLowerCase())) { mem[who].push({ id: "m" + now, text: t, at: now }); mem[who] = mem[who].slice(-30); }
      fs.writeFileSync(file("memory.json"), JSON.stringify(mem));
    }
    return send(res, 200, { notes: mem[who] });
  }
  const c = loadChats(who), id = p.split("/")[3];
  if (!id) return send(res, 200, { who, threads: c.threads.map((t) => ({ id: t.id, title: t.title, updated: t.updated, n: (t.view || []).length })), memory: loadMemory()[who] || [] });
  const t = c.threads.find((x) => x.id === id);
  if (req.method === "GET") return t ? send(res, 200, t) : send(res, 404, { error: "no such chat" });
  if (req.method === "DELETE") { c.threads = c.threads.filter((x) => x.id !== id); saveChats(who, c); return send(res, 200, { ok: true }); }
  if (req.method === "PUT") {
    const b = await readBody(req); if (!b) return send(res, 400, { error: "bad json" });
    const view = (Array.isArray(b.view) ? b.view : []).slice(-200).map((m) => ({ c: ["me", "ai", "sys", "card"].includes(m.c) ? m.c : "sys", t: String(m.t || "").slice(0, 8000), at: +m.at || now }));
    const x = t || { id, created: now }; x.title = String(b.title || x.title || "Chat").slice(0, 80); x.view = view; x.turns = textOnly(b.turns); x.updated = now;
    if (!t) c.threads.push(x); saveChats(who, c);
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: "not found" });
}
// a logged-in Protector.Net client on the shul's partition
async function readyClient() {
  if (!opts.protector_url || !opts.protector_username || !opts.protector_password) throw new Error("The Protector.Net login isn't set yet.");
  const client = makeClient({ baseUrl: opts.protector_url, username: opts.protector_username, password: opts.protector_password, log });
  const parts = await client.partitions();
  const part = opts.partition ? parts.find((x) => x.Name === opts.partition) : parts[0];
  if (!part) throw new Error("partition not found");
  await client.setPartition(part.Id);
  return client;
}
function superAdmin(user) {
  if (!user) return true;   // only Home Assistant admins reach the box
  const u = (state.users || []).find((x) => x.name.toLowerCase() === user.toLowerCase()) || (state.users || []).find((x) => user.toLowerCase().startsWith(x.name.toLowerCase() + " "));
  return !u || u.role === "Super admin";
}
const peopleCache = {};
async function peopleApi(req, p, u) {
  const user = req.headers["x-remote-user-display-name"] || req.headers["x-remote-user-name"] || "";
  if (!superAdmin(user)) return [403, { error: "Only a super admin can see the people in Protector.Net." }];
  try {
    const client = await readyClient(), now = Date.now();
    if (req.method === "GET" && p === "/api/people") return [200, { ...(await people.list(client, store, now, peopleCache, u.searchParams.get("fresh") === "1")), log: (store.peopleLog || []).slice(-30).reverse(), mode: opts.mode }];
    if (req.method === "GET" && p === "/api/people/groups") { const users = await client.users(); const sh = await people.cardShape(client, store, users); writeJson("store.json", store); return [200, { groups: await people.groups(client), site: sh.site, cards: sh.seen }]; }
    if (req.method === "POST" && p === "/api/people") {
      if (opts.mode === "practice") return [200, { ok: false, message: "Practice mode: nothing in Protector.Net is changed." }];
      const body = await new Promise((r) => { const ch = []; req.on("data", (c) => ch.push(c)); req.on("end", () => { try { r(JSON.parse(Buffer.concat(ch).toString("utf8") || "{}")); } catch { r({}); } }); });
      const by = user || "someone";
      let r; try { r = await people.addPerson(client, store, body, by, now); } catch (e) { return [200, { ok: false, message: e.message }]; }
      if (r.ok) {
        peopleCache.at = 0; writeJson("store.json", store);
        fs.appendFileSync(file("history.jsonl"), JSON.stringify({ at: now, reason: "person added", person: `${body.first || ""} ${body.last || ""}`.trim(), by, mode: opts.mode, actions: 1, errors: [], warnings: 0 }) + "\n");
        log("info", `people: added user ${r.id} by ${by}`);
      }
      return [200, r];
    }
    const mm = /^\/api\/people\/(\d+)\/(pin|groups)$/.exec(p);
    if (req.method === "POST" && mm) {
      if (opts.mode === "practice") return [200, { ok: false, message: "Practice mode: nothing in Protector.Net is changed." }];
      const body = await new Promise((r) => { const ch = []; req.on("data", (c) => ch.push(c)); req.on("end", () => { try { r(JSON.parse(Buffer.concat(ch).toString("utf8") || "{}")); } catch { r({}); } }); });
      const by = user || "someone";
      let r; try { r = mm[2] === "pin" ? await people.addPin(client, store, +mm[1], body.pin, by, now) : await people.setGroups(client, store, +mm[1], body.add, body.remove, by, now); }
      catch (e) { return [200, { ok: false, message: e.message }]; }
      peopleCache.at = 0; writeJson("store.json", store);
      const last = (store.peopleLog || []).slice(-1)[0] || {};
      fs.appendFileSync(file("history.jsonl"), JSON.stringify({ at: now, reason: mm[2] === "pin" ? "pin added" : "groups changed", person: last.name || "", by, mode: opts.mode, actions: 1, errors: [], warnings: 0 }) + "\n");
      log("info", `people: ${mm[2]} for user ${mm[1]} by ${by}`);
      return [200, r];
    }
    const m = /^\/api\/people\/(\d+)(?:\/(off|on))?$/.exec(p);
    if (!m) return [404, { error: "not found" }];
    if (req.method === "GET" && !m[2]) return [200, await people.detail(client, +m[1])];
    if (req.method === "POST" && m[2]) {
      if (opts.mode === "practice") return [200, { ok: false, message: "Practice mode: nothing in Protector.Net is changed." }];
      const by = user || "someone";
      const r = m[2] === "off" ? await people.turnOff(client, store, +m[1], by, now) : await people.turnOn(client, store, +m[1], by, now);
      peopleCache.at = 0; writeJson("store.json", store);
      fs.appendFileSync(file("history.jsonl"), JSON.stringify({ at: now, reason: m[2] === "off" ? "access off" : "access on", person: (store.peopleLog || []).slice(-1)[0]?.name || "", by, mode: opts.mode, actions: 1, errors: [], warnings: 0 }) + "\n");
      log("info", `people: access ${m[2]} for user ${m[1]} by ${by}`);
      return [200, r];
    }
    return [404, { error: "not found" }];
  } catch (e) { return [200, { ok: false, error: e.message }]; }
}
async function pulse(door, user) {
  const d = (state.doors || []).find((x) => x.id === door);
  if (!d) return { code: 404, body: { error: "No such door." } };
  if (user) {
    const u = (state.users || []).find((x) => x.name.toLowerCase() === user.toLowerCase()) || (state.users || []).find((x) => user.toLowerCase().startsWith(x.name.toLowerCase() + " "));
    if (u && u.role !== "Super admin") return { code: 403, body: { error: "Only a super admin can buzz a door open." } };
  }
  const by = user || "someone";
  if (opts.mode === "practice") return { code: 200, body: { sent: false, message: "Practice mode: the doors are not changed, so nothing was sent." } };
  if (!opts.protector_url || !opts.protector_username || !opts.protector_password) return { code: 200, body: { sent: false, message: "The Protector.Net login isn't set yet." } };
  try {
    const client = makeClient({ baseUrl: opts.protector_url, username: opts.protector_username, password: opts.protector_password, log });
    const parts = await client.partitions();
    const part = opts.partition ? parts.find((x) => x.Name === opts.partition) : parts[0];
    if (!part) throw new Error("partition not found");
    await client.setPartition(part.Id);
    let pid = store.pidOf && store.pidOf[door];
    if (pid == null) { const pd = (await client.doors()).find((x) => ourId(x.Name) === door); pid = pd && pd.Id; }
    if (pid == null) return { code: 200, body: { sent: false, message: `${d.name} wasn't found in Protector.Net.` } };
    await client.pulseDoors([pid]);
    fs.appendFileSync(file("history.jsonl"), JSON.stringify({ at: Date.now(), reason: "buzz", door, by, mode: opts.mode, actions: 1, errors: [], warnings: 0 }) + "\n");
    log("info", `buzz: ${door} ${d.name} buzzed open by ${by}`);
    return { code: 200, body: { sent: true } };
  } catch (e) {
    log("warn", `buzz ${door} failed: ${e.message}`);
    return { code: 200, body: { sent: false, message: "Protector.Net didn't accept it: " + e.message } };
  }
}
// two rules on the same door at the same time with no choice made: say so in every report
// A guest code was used (its Protector.Net user is "SD-<code id>"): remember when, and
// tell the people the vendor's card names, by text, the first time each visit.
function codeEntry(e) {
  const m = /\bSD-([A-Za-z0-9]+)/.exec(String(e.who || ""));   // "SD-t123 Name" or "Name, SD-t123"
  if (!m || !e.ok || !store) return;
  const id = m[1], c = (state.codes || []).find((x) => x.id === id);
  store.codeUsed = store.codeUsed || {};
  const first = !store.codeUsed[id];
  if (!store.codeUsed[id] || e.t > store.codeUsed[id].t) store.codeUsed[id] = { t: e.t, door: e.door };
  writeJson("store.json", store);
  if (!c || !first || Date.now() - e.t > 15 * 60e3) return;
  const v = c.vendorId && (state.vendors || []).find((x) => x.id === c.vendorId);
  if (!v || !v.arriveAlert || !(v.notifyUsers || []).length || !sms) return;
  // the people picked on the vendor card, at the mobile number in their user (Settings, Users)
  for (const n of v.notifyUsers) {
    const u = (state.users || []).find((x) => String(x.name || "").toLowerCase() === String(n).toLowerCase());
    if (!u || !u.phone) { log("info", `${v.name} arrived; ${n} has no mobile number to text`); continue; }
    sms.sendOne(u.phone, `${v.name} just came in at ${e.door}.`, "arrive").catch(() => {});
  }
}
// how each guest code stands on the doors, for the Guest codes page (no PINs here)
function codeStatus() {
  const out = {};
  for (const [id, r] of Object.entries((store && store.codeUsers) || {})) out[id] = { state: r.state, why: r.why || "", at: r.at, doors: Object.keys(r.groups || {}).length, texted: r.texted || null, textStatus: r.textStatus || null, used: (store.codeUsed && store.codeUsed[id]) || null };
  return out;
}
function clashNotes() {
  try { engine.setState(state); return engine.clashes(state.doors.map((d) => d.id), engine.today(), 60, true).map((c) => `Rules clash: ${c.line}. ${c.runs} runs until someone chooses. Open Rules in the app to choose.`); }
  catch (e) { return ["Could not check the rules for clashes: " + e.message]; }
}
// texts to the alert contacts, each problem once (again after 6 hours if it is still there)
async function alertsAfterRun(r, clashes) {
  const a = (state && state.alerts) || {};
  if (!sms) return;
  if (a.push && r.errors && r.errors.length) await sms.alertOnce(state, "err:" + r.errors[0].slice(0, 80), `Shul Doors could not finish updating the doors: ${r.errors[0].slice(0, 160)}. The doors keep running on their last schedule.`, "problem");
  if (a.conflicts) for (const c of clashes.slice(0, 2)) await sms.alertOnce(state, "clash:" + c.slice(0, 120), "Two door rules overlap and need a choice in Shul Doors (Rules page).", "clash", 24 * 3600e3);
}
// a door held open: Home Assistant's door sensors (open = "on") are read every minute
function checkHeld(states) {
  const a = (state && state.alerts) || {};
  if (!a.held || !sms) return;
  const min = Math.max(1, +a.heldMin || 5), t = Date.now();
  for (const s of states) {
    if (!String(s.entity_id).startsWith("binary_sensor.") || (s.attributes || {}).device_class !== "door" || s.state !== "on") continue;
    const since = Date.parse(s.last_changed || ""); if (!Number.isFinite(since) || t - since < min * 60e3) continue;
    const name = String((s.attributes || {}).friendly_name || s.entity_id).replace(/^\d?D\d+\s+/i, "");
    sms.alertOnce(state, "held:" + s.entity_id + "|" + s.last_changed, `${name} has been open for ${Math.round((t - since) / 60e3)} minutes.`, "held", 30 * 864e5).catch(() => {});
  }
}
async function runSync(reason) {
  if (halted) return (lastReport = { at: Date.now(), mode: opts.mode, reason, actions: [], warnings: [], errors: [stateProblem], ok: false });
  if (syncing) { pendingSync = true; return lastReport; }
  syncing = true;
  try {
    if (!opts.protector_url || !opts.protector_username || !opts.protector_password) {
      lastReport = { at: Date.now(), mode: opts.mode, actions: [], warnings: ["Protector.Net login not set yet. Enter it in the add-on's Configuration tab.", ...clashNotes()], errors: [], ok: false };
      return lastReport;
    }
    const client = makeClient({ baseUrl: opts.protector_url, username: opts.protector_username, password: opts.protector_password, log });
    const parts = await client.partitions();
    const part = opts.partition ? parts.find((p) => p.Name === opts.partition) : parts[0];
    if (!part) throw new Error(opts.partition ? `partition "${opts.partition}" not found (Protector.Net has: ${parts.map((p) => p.Name).join(", ")})` : "no partition visible to this Protector.Net user");
    await client.setPartition(part.Id);
    engine.setState(state);
    const r = await sync({ client, engine, state, store, mode: opts.mode, pilotDoors, horizonDays: +opts.horizon_days, budget: +opts.budget, log, sms });
    r.reason = reason;
    const clashes = clashNotes();
    r.warnings.push(...clashes);
    alertsAfterRun(r, clashes).catch((e) => log("warn", "alerts: " + e.message));
    lastReport = r;
    writeJson("store.json", store);
    writeJson("last-report.json", r);
    fs.appendFileSync(file("history.jsonl"), JSON.stringify({ at: r.at, reason, mode: r.mode, actions: r.actions.length, errors: r.errors, warnings: r.warnings.length,
      ...(r.actions.length ? { list: r.actions.slice(0, 40) } : {}), ...(r.warnings.length ? { notes: r.warnings.slice(0, 10) } : {}),
      ...(r.compare && r.compare.differ ? { differ: r.compare.differ.length, checked: r.compare.checked } : {}) }) + "\n");
    log(r.ok ? "info" : "warn", `sync (${reason}): ${r.actions.length} ${opts.mode === "practice" ? "would-do" : "done"} actions, ${r.errors.length} errors`);
    return r;
  } catch (e) {
    lastReport = { at: Date.now(), mode: opts.mode, reason, actions: [], warnings: clashNotes(), errors: [e.message], ok: false };
    alertsAfterRun(lastReport, []).catch((x) => log("warn", "alerts: " + x.message));
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

// ---------- door activity for Reports (read from Home Assistant's records) ----------
// Home Assistant gives each app a key. It is normally in the environment, but the base image's
// start-up can hide it there, so also look where the base image keeps a copy.
function supervisorToken() {
  for (const k of ["SUPERVISOR_TOKEN", "HASSIO_TOKEN"]) if (process.env[k]) return process.env[k];
  for (const k of ["SUPERVISOR_TOKEN", "HASSIO_TOKEN"]) {
    for (const dir of ["/run/s6/container_environment", "/var/run/s6/container_environment"]) {
      try { const v = fs.readFileSync(dir + "/" + k, "utf8").trim(); if (v) return v; } catch { /* not there */ }
    }
  }
  return "";
}
const SUP_TOKEN = supervisorToken();
const HA_TOKEN = process.env.SD_HA_TOKEN || SUP_TOKEN;
const HA_URL = process.env.SD_HA_URL || (SUP_TOKEN ? "http://supervisor/core/api" : "");
log("info", HA_TOKEN ? "activity: Home Assistant access key found" : "activity: no Home Assistant access key found");
let activity = null;
try { activity = createActivity({ file: file("activity.jsonl"), haUrl: HA_URL, token: HA_TOKEN, log, onStates: (st) => checkHeld(st), onEntry: (e) => codeEntry(e) }); }
catch (e) { log("error", "activity: " + e.message); }
if (activity) {
  const every = +process.env.SD_ACTIVITY_MS || 60000;
  setTimeout(() => activity.poll().catch(() => {}), Math.min(5000, every));
  setInterval(() => activity.poll().catch(() => {}), every);
}
// Live page: read the doors every few seconds, only while someone has it open
let liveUntil = 0;
setInterval(() => { if (activity && Date.now() < liveUntil) activity.quick().catch(() => {}); }, +process.env.SD_LIVE_MS || 4000);
const { ourId } = require("./lib/sync");
function activityFor(days, kind) {
  if (!activity) return { status: { on: false, problem: "Door activity is not available on this box." }, events: [] };
  const byPid = new Map(Object.entries((store && store.pidOf) || {}).map(([id, pid]) => [Number(pid), id]));
  const ids = new Set(((state && state.doors) || []).map((d) => d.id));
  return { status: activity.status(), events: activity.list(days, (pid) => byPid.get(Number(pid)) || null, (name) => { const id = ourId(name); return ids.has(id) ? id : null; }, kind) };
}

// ---------- speech to text: the page records, Whisper on this box listens ----------
// Talks the Wyoming protocol to Home Assistant's Whisper add-on (port 10300):
// one JSON header line per event, then its data and payload bytes.
const WHISPER_HOST = opts.whisper_host || "core-whisper", WHISPER_PORT = +opts.whisper_port || 10300;
function wyEvent(type, data, payload) {
  const d = data ? Buffer.from(JSON.stringify(data)) : null;
  const h = { type, version: "1.5.0", ...(d ? { data_length: d.length } : {}), ...(payload ? { payload_length: payload.length } : {}) };
  return Buffer.concat([Buffer.from(JSON.stringify(h) + "\n"), ...(d ? [d] : []), ...(payload ? [payload] : [])]);
}
function whisper(pcm) {   // pcm: 16 kHz, 16-bit, mono
  return new Promise((resolve, reject) => {
    const sock = require("net").connect(WHISPER_PORT, WHISPER_HOST);
    let buf = Buffer.alloc(0), done = false;
    const finish = (err, text) => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(text); };
    sock.setTimeout(60000, () => finish(new Error("Whisper took too long")));
    sock.on("error", (e) => finish(e));
    sock.on("close", () => finish(new Error("Whisper closed the connection")));
    sock.on("data", (c) => {
      buf = Buffer.concat([buf, c]);
      for (;;) {
        const nl = buf.indexOf(10); if (nl < 0) return;
        let h; try { h = JSON.parse(buf.slice(0, nl).toString("utf8")); } catch { return finish(new Error("bad answer from Whisper")); }
        const dl = h.data_length || 0, pl = h.payload_length || 0;
        if (buf.length < nl + 1 + dl + pl) return;
        let data = h.data || {}; if (dl) { try { data = { ...data, ...JSON.parse(buf.slice(nl + 1, nl + 1 + dl).toString("utf8")) }; } catch { /* ignore */ } }
        buf = buf.slice(nl + 1 + dl + pl);
        if (h.type === "transcript") return finish(null, String(data.text || "").trim());
        if (h.type === "error") return finish(new Error(data.text || "Whisper error"));
      }
    });
    sock.on("connect", () => {
      const fmt = { rate: 16000, width: 2, channels: 1 };
      sock.write(wyEvent("transcribe", { language: "en" }));
      sock.write(wyEvent("audio-start", fmt));
      for (let i = 0; i < pcm.length; i += 32000) sock.write(wyEvent("audio-chunk", fmt, pcm.slice(i, i + 32000)));
      sock.write(wyEvent("audio-stop", {}));
    });
  });
}
// Better speech to text: OpenAI's transcription, when a key is entered in the add-on settings.
// It is told the shul's words (door names, zmanim, holidays) so it spells them right.
const STT_URL = process.env.SD_STT_URL || "https://api.openai.com/v1/audio/transcriptions";
const STT_MODEL = opts.stt_model || "gpt-4o-transcribe";
function sttWords(max = 2000) {   // live typing allows only 1024 characters, so the door list is cut at a whole name
  const doors = ((state && state.doors) || []).map((d) => d.name).join(", ");
  const t = `A gabbai is talking to a synagogue door system in Brooklyn. Words used: Shabbos, Yom Tov, Rabbeinu Tam, shkiah, candle lighting, havdalah, zmanim, Mikvah, Rov, Rabbi, sukkah, Shacharis, Mincha, Maariv, Rosh Chodesh, Chol Hamoed, Pesach, Shavuos, Sukkos, Rosh Hashana, Yom Kippur, kiddush, sheva brachos, bar mitzvah, levaya, Card or PIN, override, pilot. Doors: ${doors}.`;
  if (t.length <= max) return t;
  const cut = t.slice(0, max); return cut.slice(0, Math.max(cut.lastIndexOf(","), cut.lastIndexOf("."))) + ".";
}
function wav(pcm) {   // 16 kHz, 16-bit, mono
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function cloudStt(pcm) {
  const b = "----sd" + Date.now().toString(36);
  const part = (name, value) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const body = Buffer.concat([part("model", STT_MODEL), part("language", "en"), part("prompt", sttWords()),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n`), wav(pcm), Buffer.from(`\r\n--${b}--\r\n`)]);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(STT_URL, { method: "POST", headers: { Authorization: "Bearer " + opts.openai_api_key, "Content-Type": "multipart/form-data; boundary=" + b }, body, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error("The OpenAI key in the add-on settings was not accepted.");
    if (r.status === 429 && /quota|billing|credit/i.test((j.error && j.error.message) || "")) throw new Error("the OpenAI account has no credit. Add credit in OpenAI under Settings, Billing.");
    if (!r.ok) throw new Error("OpenAI speech answered " + r.status + (j.error && j.error.message ? ": " + j.error.message.slice(0, 120) : ""));
    return String(j.text || "").trim();
  } finally { clearTimeout(t); }
}
let sttProblem = "";   // the last OpenAI speech error, shown in the app
// Live typing: the box asks OpenAI for a short-lived key (a minute or so) set up for
// transcription only, and the page talks to OpenAI with it directly over WebRTC. The
// real key never leaves the box.
const LIVE_WORDS = "Shabbos, Yom Tov, Rabbeinu Tam, shkiah, havdalah, zmanim, Mikvah, Rov, sukkah, Shacharis, Mincha, Maariv, Rosh Chodesh, Chol Hamoed, kiddush, sheva brachos, Card or PIN.";
// The speech engine sometimes "hears" its own word list in a pause and writes it out.
// Any run of 5 or more words copied from the list is taken out.
function dropLeak(text, list) {
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
  const L = String(list || "").split(/\s+/).map(norm).filter(Boolean), T = String(text || "").split(/(\s+)/);
  const words = T.map((x, i) => ({ x, i, n: /\s/.test(x) ? null : norm(x) })).filter((w) => w.n !== null && w.n !== "");
  const kill = new Set();
  for (let a = 0; a < words.length; a++) {
    let best = 0;
    for (let s = 0; s < L.length; s++) { let k = 0; while (a + k < words.length && s + k < L.length && words[a + k].n === L[s + k]) k++; if (k > best) best = k; }
    if (best >= 5) { for (let k = 0; k < best; k++) kill.add(words[a + k].i); a += best - 1; }
  }
  return T.filter((x, i) => !kill.has(i)).join("").replace(/\s+/g, " ").trim();
}
const RT_URL = process.env.SD_RT_URL || "https://api.openai.com/v1/realtime/client_secrets";
async function liveSttKey() {
  const r = await fetch(RT_URL, { method: "POST", headers: { Authorization: "Bearer " + opts.openai_api_key, "Content-Type": "application/json" },
    body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 120 }, session: { type: "transcription", audio: { input: {
      format: { type: "audio/pcm", rate: 24000 }, noise_reduction: { type: "near_field" },
      transcription: { model: STT_MODEL, language: "en", prompt: LIVE_WORDS },
      turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 450 } } } } }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("The OpenAI key in the add-on settings was not accepted.");
  if (!r.ok) throw new Error("OpenAI answered " + r.status + (j.error && j.error.message ? ": " + j.error.message.slice(0, 140) : ""));
  const value = j.value || (j.client_secret && j.client_secret.value);
  if (!value) throw new Error("OpenAI gave no live key");
  return value;
}
function whisperUp() {
  return new Promise((resolve) => { const s = require("net").connect(WHISPER_PORT, WHISPER_HOST); const t = setTimeout(() => { s.destroy(); resolve(false); }, 1500);
    s.on("connect", () => { clearTimeout(t); s.destroy(); resolve(true); }); s.on("error", () => { clearTimeout(t); resolve(false); }); });
}

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
function outputLines(o) {
  if (!o) return [];
  if (o.error) return [`Outputs (read only): could not read (${o.error})`, ""];
  return ["Outputs in Protector.Net (read only, nothing changed):", ...o.tried.map((t) => `  ${t.ok ? "OK" : "--"} ${t.p}: ${t.got}`),
    ...(o.ops.length ? ["  Operations: " + o.ops.join(", ")] : []), ""];
}
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
// The person, as Home Assistant names them ("Hershy Reifer"), matched to a Shul Doors user ("Hershy").
function haUser(req) { return String(req.headers["x-remote-user-display-name"] || req.headers["x-remote-user-name"] || "").trim(); }
function matchUser(name) {
  const n = String(name || "").toLowerCase(); if (!n) return null;
  const us = (state && state.users) || [];
  return us.find((u) => u.name.toLowerCase() === n) || us.find((u) => n.startsWith(u.name.toLowerCase() + " ")) || null;
}
// Home Assistant users who aren't added in Shul Doors get a short page instead of the app.
// (Until the first super admin exists, the first person in is let in, as before.)
function notAdded(req) { const n = haUser(req); return !!n && !matchUser(n) && ((state && state.users) || []).some((u) => u.role === "Super admin"); }
const NOT_ADDED = (name) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shul Doors</title><body style="font:17px -apple-system,Segoe UI,Roboto,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f7;color:#1d1d1f"><div style="max-width:420px;padding:32px;text-align:center"><div style="font-size:44px">🔒</div><h1 style="font-size:24px;margin:12px 0 8px">You're not added yet</h1><p style="color:#6e6e73;line-height:1.5">Hi ${String(name).replace(/[<&]/g, "")}. Ask a Shul Doors admin to add you under Settings, Users and permissions, using the name <b>${String(name).replace(/[<&]/g, "")}</b>. Then reload this page.</p></div></body>`;
function portal(req) {
  const html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  const user = req.headers["x-remote-user-display-name"] || req.headers["x-remote-user-name"] || "";
  const s = structuredClone(state);
  const match = s.users.find((u) => u.name.toLowerCase() === user.toLowerCase()) || s.users.find((u) => user.toLowerCase().startsWith(u.name.toLowerCase() + " "));
  if (match) s.me = match.name;
  else if (user) { s.users.push({ name: user, role: "Super admin" }); s.me = user; }   // only until the first super admin exists; after that people must be added (see notAdded)
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
  if (notAdded(req)) {
    if (req.method === "GET" && (p === "/" || p === "/index.html")) return send(res, 200, NOT_ADDED(haUser(req)), "text/html; charset=utf-8");
    return send(res, 403, { error: "You're not added in Shul Doors yet." });
  }
  if (req.method === "GET" && (p === "/" || p === "/index.html")) return send(res, 200, portal(req), "text/html; charset=utf-8");
  if (p === "/api/chats" || p.startsWith("/api/chats/") || p === "/api/memory" || p === "/api/seen") { chatApi(req, res, p); return; }
  if (req.method === "GET" && p === "/api/status") return send(res, 200, { problem: stateProblem, mode: opts.mode, pilotDoors, version, last: lastReport && { at: lastReport.at, ok: lastReport.ok, actions: lastReport.actions, errors: lastReport.errors, warnings: lastReport.warnings, loadedThrough: lastReport.loadedThrough, compare: lastReport.compare }, codes: codeStatus() });
  if (req.method === "GET" && p === "/api/report") {
    const r = lastReport || {}; const lines = [`Mode: ${opts.mode}`, `Checked: ${r.at ? new Date(r.at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "not yet"} (${r.reason || ""})`, "",
      `Problems (${(r.errors || []).length}):`, ...(r.errors || []).map((x) => "  " + x), "", `Notes (${(r.warnings || []).length}):`, ...(r.warnings || []).map((x) => "  " + x), "",
      ...compareLines(r.compare), "", ...outputReportLines(r.outputs2),
      `${opts.mode === "practice" ? "Would do" : "Did"} (${(r.actions || []).length}):`, ...(r.actions || []).map((x) => "  " + x), "", "Special days loaded through:", ...Object.entries(r.loadedThrough || {}).map(([d, t]) => `  ${d}: ${t}`)];
    return send(res, 200, lines.join("\n"), "text/plain; charset=utf-8");
  }
  if (req.method === "GET" && p === "/api/access") return send(res, 200, { on: !!opts.cloudflare_api_token, emails: accessState.emails, at: accessState.at, why: accessState.why });
  if (req.method === "GET" && p === "/api/sms") return send(res, 200, sms ? { mode: sms.mode, configured: sms.configured, log: sms.list(30), optedOut: sms.optedOut() } : { mode: "off" });
  if (req.method === "POST" && p === "/api/sms/test") {
    if (!sms) return send(res, 503, { error: "not ready" });
    sms.toContacts(state, "This is a test from Shul Doors. Door alerts will come from this number.", "test").then((out) => send(res, 200, { mode: sms.mode, out }));
    return;
  }
  if (req.method === "GET" && p === "/api/live") {
    const n = Math.max(1, Math.min(300, +u.searchParams.get("n") || 100));
    const idle = Date.now() >= liveUntil;
    liveUntil = Date.now() + 30000;
    const answer = () => { const a = activityFor(30); a.events = a.events.sort((x, y) => y.t - x.t).slice(0, n); send(res, 200, a); };
    if (idle && activity) { activity.quick().catch(() => {}).then(answer); return; }   // just opened: read the doors first
    return answer();
  }
  if (req.method === "GET" && p === "/api/activity") { const d = Math.max(1, Math.min(400, +u.searchParams.get("days") || 30)); const k = u.searchParams.get("kind"); return send(res, 200, activityFor(d, k === "mode" || k === "entry" ? k : null)); }
  if (req.method === "GET" && p === "/api/runs") {   // what the box did, for the History page
    const d = Math.max(1, Math.min(400, +u.searchParams.get("days") || 30)), from = Date.now() - d * 864e5, out = [];
    let text = ""; try { text = fs.readFileSync(file("history.jsonl"), "utf8"); } catch { /* none yet */ }
    for (const line of text.split("\n")) { if (!line) continue; try { const x = JSON.parse(line); if (x.at >= from) out.push(x); } catch { /* skip */ } }
    return send(res, 200, { runs: out.slice(-5000) });
  }
  if (req.method === "GET" && p === "/api/stt/live") {
    if (!opts.openai_api_key || opts.stt_live === false) return send(res, 200, { on: false });
    liveSttKey().then((key) => send(res, 200, { on: true, key, words: LIVE_WORDS, url: process.env.SD_RT_CALLS || "https://api.openai.com/v1/realtime/calls" }))
      .catch((e) => { sttProblem = e.message; log("warn", "live speech: " + e.message); send(res, 200, { on: false, error: e.message }); });
    return;
  }
  if (req.method === "GET" && p === "/api/stt") {
    if (opts.openai_api_key) return send(res, 200, { on: true, engine: "openai", problem: sttProblem });
    whisperUp().then((on) => send(res, 200, { on, engine: on ? "whisper" : null })); return;
  }
  if (req.method === "POST" && p === "/api/stt") {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size <= 4e6) chunks.push(c); });
    req.on("end", async () => {
      if (size > 4e6) return send(res, 413, { error: "Recording too long. Keep it under two minutes." });
      if (size < 3200) return send(res, 400, { error: "Nothing was recorded." });
      const pcm = Buffer.concat(chunks);
      const t0 = Date.now(); let warn = "";
      if (opts.openai_api_key) {
        try { const text = dropLeak(await cloudStt(pcm), sttWords()); sttProblem = ""; log("info", `speech (OpenAI): ${(pcm.length / 32000).toFixed(1)} s of talk written in ${((Date.now() - t0) / 1000).toFixed(1)} s`); return send(res, 200, { text, engine: "openai", ms: Date.now() - t0 }); }
        catch (e) {
          sttProblem = e.message; log("warn", "speech (OpenAI): " + e.message);
          if (!(await whisperUp())) return send(res, 502, { error: "OpenAI speech didn't work: " + e.message });
          warn = "OpenAI speech didn't work (" + e.message + "), so the slower speech engine on the box was used.";
        }
      }
      try { send(res, 200, { text: await whisper(pcm), engine: "whisper", ms: Date.now() - t0, warn }); }
      catch (e) { log("warn", "speech: " + e.message); send(res, 502, { error: "The speech engine (Whisper) did not answer. Check that it is installed and running in Home Assistant." }); }
    });
    return;
  }
  if (req.method === "GET" && p === "/api/ai") return send(res, 200, { on: !!opts.anthropic_api_key, model: AI_MODEL });
  if (req.method === "POST" && p === "/api/ai") {
    if (!opts.anthropic_api_key) return send(res, 503, { code: "not_declared" });
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size < 12e6) chunks.push(c); });   // room for a few screenshots
    req.on("end", async () => {
      if (size >= 12e6) return send(res, 413, { code: "too_long" });
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 400, { code: "error" }); }
      if (!Array.isArray(body.messages) || !body.messages.length) return send(res, 400, { code: "error" });
      const r = await aiAsk(body); send(res, r.status, r.body);
    });
    return;
  }
  if (req.method === "POST" && p === "/api/pulse") {
    const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", async () => {
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return send(res, 400, { error: "bad json" }); }
      const r = await pulse(String(body.door || ""), req.headers["x-remote-user-display-name"] || req.headers["x-remote-user-name"] || "");
      send(res, r.code, r.body);
    });
    return;
  }
  if (p === "/api/people" || p.startsWith("/api/people/")) { peopleApi(req, p, u).then(([c, b]) => send(res, c, b)); return; }
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
      // "open now", a situation switched on or off, or the rabbi leaving should reach the doors right away
      const pick = (x) => JSON.stringify([x.overrides || [], (x.situations || []).map((t) => [t.id, t.on, t.ranges || []]), x.rabbiAwayNow || false, x.away || []]);
      const urgent = pick(state) !== pick(body.state);
      const before = state; state = body.state; version++;
      try { changeAlerts(before, state, personOf(req)); } catch (e) { log("warn", "change alerts: " + e.message); }
      const em = (x) => JSON.stringify((x.users || []).map((u) => [u.email || "", u.role]));
      if (em(before) !== em(state)) accessSoon();
      writeJson("state.json", state); writeJson("version.json", { v: version }); backup();
      clearTimeout(saveTimer); saveTimer = setTimeout(() => runSync(urgent ? "urgent change" : "change saved"), urgent ? 1500 : 15000);
      send(res, 200, { ok: true, version });
    }); return;
  }
  send(res, 404, { error: "not found" });
});

init().then(() => {
  server.listen(PORT, () => log("info", `portal on port ${PORT}`));
  setTimeout(() => runSync("start"), 5000);
  accessSoon(8000);
}).catch((e) => { log("error", "could not start: " + e.stack); process.exit(1); });
