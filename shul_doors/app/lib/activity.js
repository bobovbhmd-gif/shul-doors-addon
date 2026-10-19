"use strict";
// Door activity for the Reports page. The Protector.Net integration in Home
// Assistant already hears every card swipe and keeps a "Last Door Log" sensor per
// door; Home Assistant records each change. This collects those changes into the
// box's own log (kept a year, longer than Home Assistant keeps history) by asking
// Home Assistant every minute what changed since the last time. Read only: it never
// changes anything in Home Assistant or at the doors.
const fs = require("fs");

const KEEP_DAYS = 400;
const ENTRY = /^(.*?)\s+(granted|denied)\s+access\b/i;

function createActivity({ file, haUrl, token, log = () => {}, now = () => Date.now(), fetchImpl = fetch }) {
  let stale = false;
  let events = [], seen = new Set(), lastPoll = 0, sensors = [], status = { on: false, problem: "", sensors: 0, lastPoll: 0 };
  // load what we already have
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e.v === 2) { events.push(e); seen.add(e.k); } else stale = true; } catch { /* skip a damaged line */ }
    }
  } catch { /* first start */ }
  // entries from the first version counted one card swipe up to 3 times (Home Assistant also records
  // the door relocking as a change). Drop them and read Home Assistant's history again.
  if (stale) { try { fs.writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "")); } catch { /* next poll retries */ } }
  if (events.length) lastPoll = events.reduce((m, e) => (e.t > m ? e.t : m), 0);   // no spread: a year of entries is too many arguments

  const api = async (path) => {
    const r = await fetchImpl(haUrl.replace(/\/$/, "") + path, { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`Home Assistant answered ${r.status} for ${path.split("?")[0]}`);
    return r.json();
  };
  const isLogSensor = (s) => s && typeof s.entity_id === "string" && s.entity_id.startsWith("sensor.") && s.attributes && "Door ID" in s.attributes && "Reader Message" in s.attributes;

  // a door's reader mode changing (the schedule opening it, locking it, or someone changing it by hand)
  const isModeSensor = (s) => s && typeof s.entity_id === "string" && /^sensor\..+_reader_mode$/.test(s.entity_id);
  function recordMode(entity, st, fromMs) {
    const mode = String(st.state || "");
    if (!mode || /^(unknown|unavailable|none)$/i.test(mode)) return false;
    const when = st.last_changed || st.last_updated; const t = Date.parse(when);
    if (!Number.isFinite(t) || t <= fromMs + 1000) return false;   // the first row is only the state at the start of the window
    const k = entity + "|" + when;
    if (seen.has(k)) return false;
    seen.add(k);
    const a = st.attributes || {};
    const e = { v: 2, k, t, kind: "mode", door: String(a.friendly_name || entity.replace(/^sensor\./, "").replace(/_/g, " ")).replace(/\s+Reader Mode.*$/i, ""), mode };
    events.push(e);
    fs.appendFileSync(file, JSON.stringify(e) + "\n");
    return true;
  }

  function record(entity, st) {
    const m = ENTRY.exec(String(st.state || ""));
    if (!m) return false;   // locked/unlocked messages and one-time-run notes are not entries
    const a = st.attributes || {};
    // one card swipe is one "Reader Message Time"; Home Assistant may record the same swipe several
    // times as other details change (the door unlocking and locking again), so that time is the key
    const when = a["Reader Message Time"] || st.last_changed || st.last_updated;
    const t = Date.parse(when);
    if (!Number.isFinite(t)) return false;
    const k = entity + "|" + when;
    if (seen.has(k)) return false;
    seen.add(k);
    const e = { v: 2, k, t, pid: a["Door ID"] != null ? Number(a["Door ID"]) : null, door: String(a.friendly_name || "").replace(/\s+Last Door Log.*$/i, ""), who: m[1].trim(), ok: m[2].toLowerCase() === "granted" };
    events.push(e);
    fs.appendFileSync(file, JSON.stringify(e) + "\n");
    return true;
  }

  let lastNote = "";
  const note = (lvl, msg) => { if (msg !== lastNote) { lastNote = msg; log(lvl, "activity: " + msg); } };
  async function poll() {
    const st = await poll1();
    if (st.problem) note("warn", st.problem); else note("info", `reading ${st.sensors} door log sensors from Home Assistant, ${events.length} entries kept`);
    return st;
  }
  async function poll1() {
    if (!token || !haUrl) { status = { ...status, on: false, problem: "This box can't reach Home Assistant's records (no access token)." }; return status; }
    try {
      const states = await api("/states");
      sensors = states.filter(isLogSensor).map((s) => s.entity_id);
      const modeSensors = states.filter(isModeSensor).map((s) => s.entity_id);
      if (!sensors.length) { status = { on: false, problem: "No \"Last Door Log\" sensors found. Check that the Protector.Net integration is set up and its door log sensors are turned on.", sensors: 0, lastPoll: now() }; return status; }
      const t0 = now();
      const from = new Date(lastPoll ? lastPoll - 5 * 60e3 : t0 - 10 * 864e5).toISOString();   // first time: what Home Assistant still remembers
      let added = 0;
      for (let i = 0; i < sensors.length; i += 20) {   // a few sensors per request keeps the address short
        const ids = sensors.slice(i, i + 20).join(",");
        const hist = await api(`/history/period/${encodeURIComponent(from)}?filter_entity_id=${encodeURIComponent(ids)}&end_time=${encodeURIComponent(new Date(t0).toISOString())}&significant_changes_only=0`);
        for (const list of Array.isArray(hist) ? hist : []) for (const st of Array.isArray(list) ? list : []) if (record(st.entity_id, st)) added++;
      }
      // reader modes: the first time, go back as far as Home Assistant remembers
      const mFrom = events.some((e) => e.kind === "mode") ? from : new Date(t0 - 10 * 864e5).toISOString();
      for (let i = 0; i < modeSensors.length; i += 20) {
        const ids = modeSensors.slice(i, i + 20).join(",");
        const hist = await api(`/history/period/${encodeURIComponent(mFrom)}?filter_entity_id=${encodeURIComponent(ids)}&end_time=${encodeURIComponent(new Date(t0).toISOString())}&significant_changes_only=0`);
        for (const list of Array.isArray(hist) ? hist : []) for (const st of Array.isArray(list) ? list : []) if (recordMode(st.entity_id, st, Date.parse(mFrom))) added++;
      }
      lastPoll = t0;
      if (added) log("info", `activity: ${added} new door entries`);
      prune();
      status = { on: true, problem: "", sensors: sensors.length, lastPoll: t0, since: events.length ? events.reduce((m, e) => (e.t < m ? e.t : m), Infinity) : null };
    } catch (e) {
      status = { ...status, on: status.on, problem: "Could not read door activity from Home Assistant: " + e.message, lastPoll: now() };
    }
    return status;
  }

  // Live view: while someone watches, read every door's current "Last Door Log" every few seconds
  // (one cheap request). The minute-by-minute history read still fills in anything missed.
  let quickBusy = false;
  async function quick() {
    if (!token || !haUrl || quickBusy) return 0;
    quickBusy = true;
    try {
      const states = await api("/states"); let added = 0; const cut = now() - 10 * 60e3;
      for (const st of states) {
        if (isLogSensor(st)) { if (record(st.entity_id, st)) added++; }
        else if (isModeSensor(st) && Date.parse(st.last_changed || "") > cut) { if (recordMode(st.entity_id, st, 0)) added++; }
      }
      return added;
    } catch { return 0; } finally { quickBusy = false; }
  }

  let pruned = "";
  function prune() {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (pruned === day) return;
    pruned = day;
    const cut = now() - KEEP_DAYS * 864e5;
    if (!events.some((e) => e.t < cut)) return;
    events = events.filter((e) => e.t >= cut);
    seen = new Set(events.map((e) => e.k));
    const tmp = file + ".tmp"; fs.writeFileSync(tmp, events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "")); fs.renameSync(tmp, file);
  }

  // events for the Reports page, with the shul's door number (D301...) when known
  function list(days, idOfPid, idOfName, kind) {
    const from = now() - days * 864e5;
    return events.filter((e) => e.t >= from && (!kind || (e.kind || "entry") === kind)).map((e) => e.kind === "mode"
      ? { t: e.t, kind: "mode", door: idOfName(e.door) || null, doorName: e.door, mode: e.mode }
      : { t: e.t, door: idOfName(e.door) || (e.pid != null && idOfPid(e.pid)) || null, doorName: e.door, who: e.who, ok: e.ok });
  }
  return { poll, quick, list, status: () => ({ ...status, count: events.length }) };
}

module.exports = { createActivity };
