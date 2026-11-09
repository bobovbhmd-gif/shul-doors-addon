"use strict";
// The mikva thermostats (Meross MTS960 and the like), read and set through Home Assistant.
// Also decides when to send a temperature alert. Nothing here talks to the thermostats directly.
function createMtemp({ haUrl, token, areas = async () => ({}), log = () => {}, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  let unit = null, areaMap = {}, areaAt = 0, histCache = { at: 0, ids: "", data: {} };
  async function ha(path, opts = {}) {
    if (!haUrl || !token) throw new Error("This box can't reach Home Assistant.");
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 10000);
    try { const r = await fetchImpl(haUrl + path, { ...opts, headers: H, signal: ac.signal }); if (!r.ok) throw new Error("Home Assistant answered " + r.status); return await r.json(); }
    catch (e) { if (e.name === "AbortError") throw new Error("Home Assistant didn't answer."); throw e; }
    finally { clearTimeout(t); }
  }
  const A = (id) => { const v = areaMap[id]; return typeof v === "string" ? { area: v } : v || {}; };
  const isThermo = (st, area) => /^climate\./.test(st.entity_id) && (/mts\d|meross/i.test(st.entity_id + " " + ((st.attributes || {}).friendly_name || "")) || /mikva|mikvah/i.test(area || ""));
  const nice = (area, st) => String(area || (st.attributes || {}).friendly_name || st.entity_id).replace(/^mikvah?\s+/i, "").trim();
  async function list() {
    if (unit === null) { try { unit = ((await ha("/config")).unit_system || {}).temperature || "°F"; } catch { unit = "°F"; } }
    if (now() - areaAt > 10 * 60e3) { try { areaMap = await areas(); } catch (e) { log("warn", "thermostats: couldn't read areas: " + e.message); } areaAt = now(); }
    const states = await ha("/states");
    let found = states.filter((st) => isThermo(st, A(st.entity_id).area));
    // when Meross LAN is installed, each thermostat shows up twice (HomeKit and Meross LAN): keep the Meross LAN one
    const mlAreas = new Set(found.filter((st) => A(st.entity_id).uuid).map((st) => A(st.entity_id).area).filter(Boolean));
    found = found.filter((st) => A(st.entity_id).uuid || !mlAreas.has(A(st.entity_id).area));
    // once Meross LAN is in, show only the thermostats it was given (others on the same Meross account stay out)
    if (found.some((st) => A(st.entity_id).uuid)) found = found.filter((st) => A(st.entity_id).uuid);
    return found.map((st) => {
      const a = st.attributes || {}, online = !["unavailable", "unknown"].includes(st.state);
      return { id: st.entity_id, name: nice(A(st.entity_id).area, st), area: A(st.entity_id).area || "", uuid: A(st.entity_id).uuid || "", cur: online && a.current_temperature != null ? Number(a.current_temperature) : null, set: a.temperature != null ? Number(a.temperature) : null,
        heat: a.hvac_action || (st.state === "heat" ? "heating" : st.state), mode: st.state, online, min: a.min_temp != null ? Number(a.min_temp) : 40, max: a.max_temp != null ? Number(a.max_temp) : 110, step: a.target_temp_step || 0.5, unit, changed: Date.parse(st.last_changed) || 0,
        // Meross LAN: "schedule_heating" follows the thermostat's schedule, "heating" was set by hand
        sched: /^schedule/.test(a.preset_mode || "") ? true : /^(heating|cooling)$/.test(a.preset_mode || "") ? false : null };
    }).sort((x, y) => x.name.localeCompare(y.name));
  }
  // the last day, as 49 points (every 30 minutes), from Home Assistant's history
  async function history(ids) {
    const key = ids.join(","); if (key === histCache.ids && now() - histCache.at < 5 * 60e3) return histCache.data;
    const end = now(), start = end - 24 * 3600e3, out = {};
    try {
      const rows = await ha(`/history/period/${new Date(start).toISOString()}?filter_entity_id=${encodeURIComponent(key)}&end_time=${encodeURIComponent(new Date(end).toISOString())}`);
      for (const series of rows || []) {
        if (!series.length) continue; const id = series[0].entity_id; const pts = [];
        const vals = series.map((r) => [Date.parse(r.last_changed || r.last_updated), r.attributes && r.attributes.current_temperature != null ? Number(r.attributes.current_temperature) : null]).filter((x) => x[1] != null);
        let j = 0, last = vals.length ? vals[0][1] : null;
        for (let k = 0; k <= 48; k++) { const t = start + k * 30 * 60e3; while (j < vals.length && vals[j][0] <= t) last = vals[j++][1]; pts.push(last); }
        out[id] = pts.map((v) => (v == null ? null : Math.round(v * 10) / 10));
      }
    } catch (e) { log("warn", "thermostats: no history: " + e.message); }
    histCache = { at: now(), ids: key, data: out };
    return out;
  }
  async function set(id, temp) {
    const t = (await list()).find((x) => x.id === id);
    if (!t) throw new Error("That isn't a mikva thermostat.");
    const v = Number(temp); if (!Number.isFinite(v) || v < t.min || v > t.max) throw new Error(`Pick a temperature between ${t.min} and ${t.max}.`);
    await ha("/services/climate/set_temperature", { method: "POST", body: JSON.stringify({ entity_id: id, temperature: v }) });
    log("info", `thermostat ${id} set to ${v}`);
    return { ok: true };
  }
  // back to following its own schedule
  async function resume(id) {
    const t = (await list()).find((x) => x.id === id);
    if (!t) throw new Error("That isn't a mikva thermostat.");
    await ha("/services/climate/set_preset_mode", { method: "POST", body: JSON.stringify({ entity_id: id, preset_mode: "schedule_heating" }) });
    log("info", `thermostat ${id} back to its schedule`);
    return { ok: true };
  }
  // ---- the thermostat's own weekly schedule (Meross LAN: Appliance.Control.Thermostat.ScheduleB) ----
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  async function meross(uuid, namespace, method, payload) {
    const r = await ha("/services/meross_lan/request?return_response", { method: "POST", body: JSON.stringify({ device_id: uuid, namespace, method, payload }) });
    const sr = (r && r.service_response) || r || {};
    if (sr.exception) throw new Error("The thermostat didn't answer: " + sr.exception);
    const resp = sr.response || {}; const hdr = resp.header || {};
    if (hdr.method === "ERROR") throw new Error("The thermostat refused it.");
    return resp.payload || {};
  }
  const toC = (v, unit) => (/F/.test(unit || "") ? (v - 32) * 5 / 9 : v);
  const fromC = (c, unit) => (/F/.test(unit || "") ? c * 9 / 5 + 32 : c);
  const scaleCache = {};
  async function scaleOf(x) {
    if (scaleCache[x.uuid]) return scaleCache[x.uuid];
    let sc = 10;
    try { const p = await meross(x.uuid, "Appliance.Control.Thermostat.ModeB", "GET", { modeB: [{ channel: 0 }] }); const raw = Number(((p.modeB || [])[0] || {}).targetTemp); const c = toC(x.set, x.unit); if (raw && c) sc = Math.abs(raw / c - 100) < Math.abs(raw / c - 10) ? 100 : 10; } catch { /* keep 10 */ }
    return (scaleCache[x.uuid] = sc);
  }
  async function getSchedule(x) {
    if (!x.uuid) throw new Error("Install Meross LAN in Home Assistant to read and write the thermostat schedules.");
    const sc = await scaleOf(x);
    const p = await meross(x.uuid, "Appliance.Control.Thermostat.ScheduleB", "GET", { scheduleB: [{ channel: 0 }] });
    const s = (p.scheduleB || [])[0] || {}, week = {};
    for (const d of DAYS) { let t = 0; week[d] = (s[d] || []).filter((e) => e[0] > 0).map((e) => { const row = [t, Math.round(fromC(e[1] / sc, x.unit) * 2) / 2]; t += e[0]; return row; }); }
    return { week, max: Number(s.section) || 6 };
  }
  async function setSchedule(x, week) {
    if (!x.uuid) throw new Error("Install Meross LAN in Home Assistant to write the thermostat schedules.");
    const sc = await scaleOf(x), cur = await getSchedule(x), max = cur.max, out = { channel: 0 };
    for (const d of DAYS) {
      const day = (week[d] || []).map((e) => [Math.round(+e[0] / 15) * 15, +e[1]]).sort((a, b) => a[0] - b[0]);
      if (!day.length) continue;
      if (day[0][0] !== 0) throw new Error(`${d}: the first change must start at 12:00 AM.`);
      if (day.length > max) throw new Error(`${d}: this thermostat allows ${max} changes a day.`);
      for (const e of day) if (!(e[1] >= x.min && e[1] <= x.max)) throw new Error(`${d}: use temperatures between ${x.min} and ${x.max}.`);
      const rows = day.map((e, i) => [(i + 1 < day.length ? day[i + 1][0] : 1440) - e[0], Math.round(toC(e[1], x.unit) * sc)]).filter((e) => e[0] > 0);
      while (rows.length < max) rows.push([0, rows[0][1]]);
      out[d] = rows;
    }
    await meross(x.uuid, "Appliance.Control.Thermostat.ScheduleB", "SET", { scheduleB: [out] });
    log("info", `thermostat ${x.id}: schedule saved`);
    return { ok: true };
  }
  // ---- alerts: run every minute with the settings from the app ----
  const since = {};
  const STANDBY = 80;   // below this the pool is resting (°F), not being kept warm   // id -> { off, heat, gone } first time each problem was seen
  function inWindow(cfg, d = new Date(now())) {
    if (cfg.when !== "times") return true;
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
    const m = +p.find((x) => x.type === "hour").value * 60 + +p.find((x) => x.type === "minute").value;
    const toM = (s) => { const [h, mm] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (mm || 0); };
    const a = toM(cfg.from), b = toM(cfg.to);
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }
  // rates: { id: usual ° an hour for where it's heading } (from the heat-up log)
  function check(list, cfg, rates = {}) {
    const out = [], t = now();
    if (!cfg || !cfg.on) return out;
    const deg = Math.max(0.5, +cfg.deg || 3), offMs = Math.max(5, +cfg.mins || 15) * 60e3, heatMs = Math.max(15, +cfg.heatMins || 120) * 60e3, active = inWindow(cfg);
    for (const x of list) {
      const s = since[x.id] = since[x.id] || {};
      // the thermostat's own schedule moves the set point (for example 68° in the day, 99° from 2 AM),
      // so: low only counts once it had time to heat; high only counts while it's set to a heated temperature
      if (s.setVal !== x.set) { s.setVal = x.set; s.setAt = t; }
      const settled = t - (s.setAt || 0) >= heatMs, standby = x.set != null && x.set < STANDBY;
      const low = x.online && x.cur != null && x.set != null && x.set - x.cur >= deg && settled;
      const high = x.online && x.cur != null && x.set != null && x.cur - x.set >= deg && !standby;
      const gone = !x.online, off = low || high, heat = x.online && x.heat === "heating" && x.cur != null && x.set != null && x.cur < x.set;
      s.gone = gone ? s.gone || t : 0; s.off = off ? s.off || t : 0; s.heat = heat ? s.heat || t : 0;
      // not warming up: heating for a while but rising less than half its usual speed
      if (heat) { s.pts = (s.pts || []).filter((p) => t - p[0] <= 6 * 3600e3); s.pts.push([t, x.cur]); } else s.pts = [];
      const rateMs = Math.max(15, +cfg.rateMins || 45) * 60e3, usual = rates[x.id];
      let slow = null;
      if (heat && usual > 0 && t - s.heat >= rateMs && x.set - x.cur >= 1.5) {
        const back = s.pts.find((p) => t - p[0] <= rateMs);
        if (back && t - back[0] >= rateMs * 0.9) { const rose = x.cur - back[1], hrs = (t - back[0]) / 3600e3; if (rose < usual * hrs * 0.5) slow = Math.round((rose / hrs) * 10) / 10; }
      }
      if (!active) continue;
      if (gone && cfg.offline !== false && t - s.gone >= 5 * 60e3) out.push({ key: `mt:gone:${x.id}`, text: `Mikva ${x.name}: the thermostat is offline.` });
      else if (slow != null) out.push({ key: `mt:slow:${x.id}`, text: `Mikva ${x.name} isn't warming up: ${Math.max(0, slow)}° an hour for the last ${Math.round(rateMs / 60e3)} minutes, it usually rises about ${usual}° an hour. It's ${x.cur}${x.unit}, set to ${x.set}${x.unit}. Check the boiler.` });
      else if (off && t - s.off >= offMs) out.push({ key: `mt:off:${x.id}`, text: `Mikva ${x.name} is ${x.cur}${x.unit}, ${Math.abs(x.cur - x.set).toFixed(1)}° ${x.cur < x.set ? "below" : "above"} its set point of ${x.set}${x.unit}.` });
      else if (heat && t - s.heat >= heatMs) out.push({ key: `mt:heat:${x.id}`, text: `Mikva ${x.name} has been heating for ${Math.round((t - s.heat) / 60e3)} minutes and is still ${x.cur}${x.unit} (set to ${x.set}${x.unit}). The boiler may not be keeping up.` });
    }
    return out;
  }
  return { list, history, set, resume, check, inWindow, STANDBY, getSchedule, setSchedule };
}
module.exports = { createMtemp };

// ---- the temperature log, kept on the box: every minute for 31 days, every hour for 3 years ----
const fs = require("fs");
function createTempLog({ minFile, hourFile, now = () => Date.now() }) {
  let hourAcc = null;   // { h: hourStart, by: { id: { n, sum, lo, hi, setSum, heat } } }
  function append(f, o) { try { fs.appendFileSync(f, JSON.stringify(o) + "\n"); } catch { /* disk */ } }
  function read(f, from, to) { let t = ""; try { t = fs.readFileSync(f, "utf8"); } catch { return []; } const out = []; for (const line of t.split("\n")) { if (!line) continue; try { const o = JSON.parse(line); if (o.t >= from && o.t < to) out.push(o); } catch { /* skip */ } } return out; }
  function flushHour() {
    if (!hourAcc) return; const r = {};
    for (const [id, a] of Object.entries(hourAcc.by)) if (a.n) r[id] = { avg: Math.round((a.sum / a.n) * 10) / 10, lo: a.lo, hi: a.hi, set: Math.round((a.setSum / a.n) * 10) / 10, heat: a.heat, n: a.n };
    append(hourFile, { t: hourAcc.h, r }); hourAcc = null;
  }
  let lastPrune = 0;
  function prune() {
    for (const [f, keep] of [[minFile, 31 * 864e5], [hourFile, 3 * 365 * 864e5]]) {
      let t = ""; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
      const cut = now() - keep, lines = t.split("\n").filter((l) => { if (!l) return false; try { return JSON.parse(l).t >= cut; } catch { return false; } });
      try { fs.writeFileSync(f, lines.join("\n") + (lines.length ? "\n" : "")); } catch { /* disk */ }
    }
  }
  return {
    record(list) {
      const t = Math.floor(now() / 60e3) * 60e3, h = Math.floor(t / 3600e3) * 3600e3, r = {};
      for (const x of list) if (x.online && x.cur != null) r[x.id] = [x.cur, x.set, x.heat === "heating" ? 1 : 0];
      if (!Object.keys(r).length) return;
      append(minFile, { t, r });
      if (hourAcc && hourAcc.h !== h) flushHour();
      if (!hourAcc) hourAcc = { h, by: {} };
      for (const [id, [cur, set, heat]] of Object.entries(r)) { const a = hourAcc.by[id] = hourAcc.by[id] || { n: 0, sum: 0, lo: cur, hi: cur, setSum: 0, heat: 0 }; a.n++; a.sum += cur; a.lo = Math.min(a.lo, cur); a.hi = Math.max(a.hi, cur); a.setSum += set || 0; a.heat += heat; }
      if (now() - lastPrune > 864e5) { lastPrune = now(); prune(); }
    },
    // rows of { t, by: { id: { avg, lo, hi, set, heatMin } } } every `step` minutes
    query(from, to, step) {
      step = Math.max(1, Math.round(+step || 60)); const ms = step * 60e3, buckets = new Map();
      const add = (t, id, avg, lo, hi, set, heatMin, n) => { const b = Math.floor(t / ms) * ms; if (!buckets.has(b)) buckets.set(b, {}); const B = buckets.get(b); const a = B[id] = B[id] || { n: 0, sum: 0, lo: Infinity, hi: -Infinity, setSum: 0, heat: 0 }; a.n += n; a.sum += avg * n; a.lo = Math.min(a.lo, lo); a.hi = Math.max(a.hi, hi); a.setSum += set * n; a.heat += heatMin; };
      if (step < 60) for (const o of read(minFile, from, to)) for (const [id, [cur, set, heat]] of Object.entries(o.r)) add(o.t, id, cur, cur, cur, set || 0, heat, 1);
      else {
        for (const o of read(hourFile, from, to)) for (const [id, v] of Object.entries(o.r)) add(o.t, id, v.avg, v.lo, v.hi, v.set, v.heat, v.n);
        if (hourAcc && hourAcc.h >= from && hourAcc.h < to) for (const [id, a] of Object.entries(hourAcc.by)) if (a.n) add(hourAcc.h, id, a.sum / a.n, a.lo, a.hi, a.setSum / a.n, a.heat, a.n);
      }
      const r1 = (v) => Math.round(v * 10) / 10;
      return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, B]) => ({ t, by: Object.fromEntries(Object.entries(B).map(([id, a]) => [id, { avg: r1(a.sum / a.n), lo: r1(a.lo), hi: r1(a.hi), set: r1(a.setSum / a.n), heatMin: a.heat }])) }));
    },
    flushHour,
    // each time a pool's set point went up: how long the water took to get there.
    // On a night with two rises (the preheat after midnight, then the heat for the mikva) the first is the preheat.
    heatups(from, to) {
      const by = {};
      for (const o of read(minFile, from, to)) for (const [id, [cur, set]] of Object.entries(o.r)) (by[id] = by[id] || []).push([o.t, cur, set]);
      const out = {};
      for (const [id, pts] of Object.entries(by)) {
        const ev = [];
        for (let i = 1; i < pts.length; i++) {
          const [t, , set] = pts[i], prev = pts[i - 1][2];
          if (set == null || prev == null || set - prev < 2 || set < STANDBY_F - 20) continue;
          const startCur = pts[i - 1][1]; let j = i, done = null;
          for (; j < pts.length; j++) { if (pts[j][2] !== set) break; if (pts[j][1] >= set - 0.3) { done = pts[j][0]; break; } }
          if (done == null || set - startCur < 1) continue;
          const took = Math.round((done - t) / 60e3), at = nyParts(t);
          ev.push({ t, d: at.d, start: at.m, from: prev, to: set, startCur: Math.round(startCur * 10) / 10, took, ready: at.m + took, rate: Math.round(((set - startCur) / (took / 60)) * 10) / 10 });
        }
        ev.forEach((e, i) => { const nx = ev[i + 1]; e.kind = nx && nx.t - e.t < 8 * 3600e3 && nx.to > e.to ? "pre" : "main"; });
        out[id] = ev.sort((a, b) => b.t - a.t).map(({ t, ...e }) => e);
      }
      return out;
    },
  };
}
const STANDBY_F = 80;
function nyParts(t) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(t));
  const g = (k) => p.find((x) => x.type === k).value;
  return { d: `${g("year")}-${g("month")}-${g("day")}`, m: +g("hour") * 60 + +g("minute") };
}
// a pool's usual warming speed (° an hour) for the set point it's heading to, from its recent heat-ups
function usualRate(rows, set) {
  if (!rows || !rows.length) return null;
  const near = rows.filter((r) => Math.abs(r.to - set) <= 3), use = (near.length >= 2 ? near : rows).slice(0, 14).map((r) => r.rate).filter((v) => v > 0).sort((a, b) => a - b);
  return use.length ? use[Math.floor(use.length / 2)] : null;
}
module.exports.createTempLog = createTempLog;
module.exports.usualRate = usualRate;
module.exports.nyParts = nyParts;
// the next time a day plan changes temperature after (d, m). week: { sun: [[start, temp], ...], ... }
function nextChange(week, d, m, addDays) {
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], dayOf = (x) => (week[DAYS[new Date(x + "T12:00:00Z").getUTCDay()]] || []).slice().sort((a, b) => a[0] - b[0]);
  const today = dayOf(d); if (!today.length) return null;
  let last = (today.filter((e) => e[0] <= m).pop() || today[0])[1];
  for (let i = 0; i <= 7; i++) {
    const dd = i ? addDays(d, i) : d;
    for (const e of dayOf(dd)) { if (i === 0 && e[0] <= m) continue; if (e[1] !== last) return { d: dd, m: e[0] }; last = e[1]; }
  }
  return null;
}
module.exports.nextChange = nextChange;
