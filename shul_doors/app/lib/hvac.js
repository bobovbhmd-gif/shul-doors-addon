"use strict";
// Heating and cooling: the Pelican thermostats.
// Every thermostat has its own schedule for each day of the week (up to 12 changes a day, Pelican's limit),
// times by the clock or by zmanim. Special schedules (yom tov, erev yom tov, Chanukah, events, dates) replace
// a day's schedule. Pelican stores one schedule per weekday on the thermostat, so every night the box writes
// the coming 7 days, each with its real times: the thermostat then holds a week on its own.
// Quick changes: until the next scheduled change (Pelican goes back by itself), for a while or until a time
// (the box puts it back), or permanent (until someone puts it back).
// Modes, like the doors: "read" changes nothing (shows what it would do), "pilot" changes only the thermostats
// listed in the add-on settings, "live" changes all of them.

const MAX_PER_DAY = 12;
const ANCHORS = ["alos", "sunrise", "chatzos", "plag", "sunset", "candles", "tzeis", "havdalah", "rt"];
const SYSTEMS = ["Auto", "Heat", "Cool", "Off"];

function createHvac({ pelican, engine, getState, getStore, save, mode = "read", pilot = [], log = () => {}, note = () => {}, now = () => Date.now(), nyParts, cache = { get: () => null, set: () => {} } }) {
  let list = [], listAt = 0, listErr = "";
  const st = () => getStore();
  const cfg = () => { const s = getState() || {}; s.hvac = s.hvac || {}; const h = s.hvac; h.areas = h.areas || []; h.sched = h.sched || {}; h.specials = h.specials || []; h.quick = h.quick || []; return h; };
  const pilotSet = new Set(pilot.map((x) => String(x).toLowerCase()));
  const inPilot = (t) => pilotSet.has(String(t.serial).toLowerCase()) || pilotSet.has(String(t.name).toLowerCase());
  const canWrite = (t) => mode === "live" || (mode === "pilot" && inPilot(t));
  const find = (serial) => list.find((t) => t.serial === serial);

  function would(t, what) {
    const s = st(); s.hvWould = s.hvWould || [];
    s.hvWould.push({ at: now(), serial: t.serial, name: t.name, what }); if (s.hvWould.length > 300) s.hvWould.splice(0, s.hvWould.length - 300);
    log("info", `thermostat ${t.name}: would ${what} (${mode === "read" ? "read only" : "not in the pilot"})`);
  }
  // the thermostat log: changes made from here and offline times (Pelican's own readings fill in the rest)
  function event(serial, by, text) { const s = st(); s.hvEvents = s.hvEvents || []; s.hvEvents.push({ t: now(), serial, by: by || "", text }); if (s.hvEvents.length > 5000) s.hvEvents.splice(0, s.hvEvents.length - 5000); }
  async function act(t, what, fn) {
    if (!canWrite(t)) { would(t, what); return { would: true }; }
    await fn(); log("info", `thermostat ${t.name}: ${what}`); return { done: true };
  }

  async function poll() {
    try {
      const prev = new Map(list.map((t) => [t.serial, t]));
      list = (await pelican.list()).map((t) => ({ ...t, pilot: inPilot(t), writable: canWrite(t) })); listAt = now(); listErr = "";
      let dirty = false;
      list.forEach((t) => { const p = prev.get(t.serial); if (p && p.online !== t.online) { event(t.serial, "", t.online ? "Back online" : "Went offline"); dirty = true; } });
      if (dirty) save();
    }
    catch (e) { listErr = e.message; }
    return list;
  }

  // ---- the plan: what each thermostat should do on a date ----
  const minOf = (at, z) => {
    if (!at) return null;
    if (at.a === "clock") { const m = String(at.t || "").match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; }
    if (!ANCHORS.includes(at.a) || !z || z[at.a] == null) return null;
    return z[at.a] + (+at.o || 0);
  };
  function specialFor(serial, date, info) {
    const keys = new Set(info.keys || []);
    const hits = cfg().specials.filter((sp) => sp.on !== false && (sp.tstats || []).includes(serial) && (
      ((sp.when || {}).dates || []).some((r) => date >= r.from && date <= (r.to || r.from)) || ((sp.when || {}).keys || []).some((k) => keys.has(k))));
    // a special for these dates beats one from the calendar; otherwise the one higher in the list
    return hits.find((sp) => ((sp.when || {}).dates || []).some((r) => date >= r.from && date <= (r.to || r.from))) || hits[0] || null;
  }
  function plan(serial, date) {
    const info = engine.info(date), sp = specialFor(serial, date, info);
    const raw = sp ? sp.entries || [] : ((cfg().sched[serial] || {})[info.w] || []);
    const seen = new Map();
    raw.forEach((e) => {
      let m = minOf(e.at, info.z); if (m == null) return; m = Math.max(0, Math.min(1439, Math.round(m)));
      seen.set(m, { min: m, system: SYSTEMS.includes(e.system) ? e.system : "Auto", heat: +e.heat || 68, cool: +e.cool || 76, fan: e.fan === "On" ? "On" : "Auto", keypad: e.keypad === "Off" ? "Off" : "On" });   // keypad Off locks the screen. Two at the same minute: the later one in the list
    });
    const entries = [...seen.values()].sort((a, b) => a.min - b.min);
    return { date, w: info.w, src: sp ? sp.name : "Schedule", special: sp ? sp.id : null, entries: entries.slice(0, MAX_PER_DAY), over: Math.max(0, entries.length - MAX_PER_DAY) };
  }
  // now and next, from today's plan (before the first change, yesterday's last one is still running)
  function nowNext(serial) {
    const t = now(), p = nyParts(t), today = p.d, m = p.m, d0 = plan(serial, today);
    let cur = null, next = null;
    for (const e of d0.entries) { if (e.min <= m) cur = e; else if (!next) next = e; }
    if (!cur) { const y = plan(serial, engine.addDays(today, -1)).entries; cur = y[y.length - 1] || null; }
    if (!next) { for (let i = 1; i <= 7 && !next; i++) { const d = engine.addDays(today, i), e = plan(serial, d).entries[0]; if (e) next = { ...e, date: d }; } }
    else next = { ...next, date: today };
    return { cur, next, nextAt: next ? atMs(next.date, next.min) : 0 };
  }
  // the time stamp of a New York date and minute
  function atMs(date, min) {
    const [y, mo, d] = date.split("-").map(Number);
    let t = Date.UTC(y, mo - 1, d, Math.floor(min / 60), min % 60) + 5 * 3600e3;   // guess EST, then correct
    for (let i = 0; i < 2; i++) { const p = nyParts(t); const diff = (p.d === date ? 0 : p.d < date ? 1440 : -1440) + min - p.m; t += diff * 60e3; }
    return t;
  }

  // ---- quick changes ----
  // until: "next" (until the next scheduled change), "perm" (until someone puts it back), or a time stamp
  async function setNow(serials, v, until, by) {
    const s = st(); s.hvHold = s.hvHold || {}; const out = [];
    for (const serial of serials) {
      const t = find(serial); if (!t) { out.push({ serial, ok: false, error: "Not found" }); continue; }
      const val = {}; if (SYSTEMS.includes(v.system)) val.system = v.system; if (v.heat != null) val.heat = +v.heat; if (v.cool != null) val.cool = +v.cool; if (v.fan === "On" || v.fan === "Auto") val.fan = v.fan;
      const nn = nowNext(serial), kind = until === "next" ? "next" : until === "perm" ? "perm" : "until";
      const end = kind === "next" ? nn.nextAt : kind === "perm" ? 0 : +until;
      if (kind === "until" && !(end > now())) { out.push({ serial, ok: false, error: "Pick a time later than now." }); continue; }
      const what = `${desc(val)} ${kind === "next" ? "until the next change" : kind === "perm" ? "with no end" : "until " + clock(end)}`;
      try {
        const r = await act(t, what, () => pelican.set(serial, kind === "next" ? val : { ...val, schedule: "Off" }));
        s.hvHold[serial] = { kind, until: end, by, at: now(), v: val, would: !!r.would };
        if (r.done) Object.assign(t, val.heat != null ? { heat: val.heat } : {}, val.cool != null ? { cool: val.cool } : {}, val.system ? { system: val.system } : {}, val.fan ? { fan: val.fan } : {});
        note(by, `${t.name}: ${what}${r.would ? " (not sent: " + (mode === "read" ? "read only" : "not in the pilot") + ")" : ""}`);
        event(serial, by, (r.would ? "Would set " : "Set ") + what);
        out.push({ serial, ok: true, would: !!r.would });
      } catch (e) { out.push({ serial, ok: false, error: e.message }); }
    }
    save(); return out;
  }
  async function resume(serials, by, why) {
    const s = st(); s.hvHold = s.hvHold || {}; const out = [];
    for (const serial of serials) {
      const t = find(serial); if (!t) { delete s.hvHold[serial]; continue; }
      const cur = nowNext(serial).cur, val = cur ? { system: cur.system, heat: cur.heat, cool: cur.cool, fan: cur.fan } : {};
      try {
        const r = await act(t, "back to the schedule" + (cur ? ` (${desc(val)})` : ""), () => pelican.set(serial, { ...val, schedule: "On" }));
        event(serial, by, (r.would ? "Would go " : "") + "Back to the schedule" + (why ? " (" + why + ")" : ""));
        delete s.hvHold[serial]; note(by, `${t.name}: back to the schedule${why ? " (" + why + ")" : ""}${r.would ? " (not sent)" : ""}`); out.push({ serial, ok: true, would: !!r.would });
      } catch (e) { out.push({ serial, ok: false, error: e.message }); }
    }
    save(); return out;
  }
  // every minute: holds that ran out
  async function tick() {
    const s = st(), h = s.hvHold || {}, t = now(); let dirty = false;
    for (const [serial, x] of Object.entries(h)) {
      if (x.kind === "next" && x.until && x.until <= t) { delete h[serial]; dirty = true; }   // Pelican went back by itself
      else if (x.kind === "until" && x.until <= t) await resume([serial], "Shul Manager", "the time ran out");
    }
    if (dirty) save();
  }

  // ---- the week on the thermostats ----
  const hash = (x) => JSON.stringify(x.entries);
  async function sync(force, only) {
    const s = st(); s.hvSent = s.hvSent || {}; s.hvWouldSent = s.hvWouldSent || {}; s.hvWeekly = s.hvWeekly || {};
    if (!list.length) await poll();
    const today = nyParts(now()).d, out = { written: 0, would: 0, same: 0, errors: [] };
    for (const t of list) {
      if (only && !only.includes(t.serial)) continue;
      if (!cfg().sched[t.serial]) continue;   // no schedule made here yet: leave the one on the thermostat alone
      const sent = (s.hvSent[t.serial] = s.hvSent[t.serial] || {}), wsent = (s.hvWouldSent[t.serial] = s.hvWouldSent[t.serial] || {});
      for (let i = 0; i < 7; i++) {
        const date = engine.addDays(today, i), p = plan(t.serial, date), key = date + "|" + hash(p);
        { s.hvDays = s.hvDays || {}; const dd = (s.hvDays[t.serial] = s.hvDays[t.serial] || {}); dd[date] = { src: p.src, entries: p.entries, would: !canWrite(t) }; }
        if (!canWrite(t)) { if (wsent[p.w] !== key || force) { wsent[p.w] = key; would(t, `load ${pelican.DAYS[p.w]} ${date}: ${p.entries.length} changes (${p.src})`); out.would++; } else out.same++; continue; }
        if (!force && sent[p.w] === key) { out.same++; continue; }
        try {
          if (!s.hvWeekly[t.serial]) { await pelican.weekly(t.serial); s.hvWeekly[t.serial] = true; }
          await pelican.writeDay(t.serial, p.w, p.entries); sent[p.w] = key; out.written++;
          log("info", `thermostat ${t.name}: loaded ${pelican.DAYS[p.w]} ${date}, ${p.entries.length} changes (${p.src})`);
        } catch (e) { out.errors.push(`${t.name}: ${e.message}`); log("warn", `thermostat ${t.name}: couldn't load ${date}: ${e.message}`); break; }
      }
    }
    { const cut = engine.addDays(today, -400); Object.values(s.hvDays || {}).forEach((dd) => Object.keys(dd).forEach((d) => { if (d < cut) delete dd[d]; })); }   // keep about a year
    s.hvSyncAt = now(); save(); return out;
  }

  // the schedule that's on the thermostat now, as a week of entries (to start from it)
  async function fromPelican(serial) {
    const rows = await pelican.schedule(serial), week = {};
    rows.forEach((r) => { const d = pelican.DAYS.indexOf(r.day), m = String(r.at || "").match(/^(\d{1,2}):(\d{2})/); if (d < 0 || !m) return;
      (week[d] = week[d] || []).push({ n: r.n, at: { a: "clock", t: `${m[1].padStart(2, "0")}:${m[2]}` }, system: SYSTEMS.includes(r.system) ? r.system : "Auto", heat: r.heat ?? 68, cool: r.cool ?? 76, fan: r.fan === "On" ? "On" : "Auto", keypad: r.keypad === "Off" ? "Off" : "On" }); });
    Object.values(week).forEach((l) => { l.sort((a, b) => a.at.t.localeCompare(b.at.t)); l.forEach((e) => delete e.n); });
    return week;
  }
  // Pelican's readings for a thermostat, from one date to another (days that are over are kept on the box)
  async function history(serial, from, to) {
    const today = nyParts(now()).d, out = [];
    let d = from;
    while (d <= to) {
      const cached = d < today ? cache.get(serial, d) : null;
      if (cached) { out.push(...cached); d = engine.addDays(d, 1); continue; }
      let end = d; for (let i = 0; i < 29 && end < to && !(engine.addDays(end, 1) < today && cache.get(serial, engine.addDays(end, 1))); i++) end = engine.addDays(end, 1);
      const rows = await pelican.history(serial, d + "T00:00", end + "T23:59");
      for (let x = d; x <= end; x = engine.addDays(x, 1)) { const day = rows.filter((r) => r.d === x); if (x < today) cache.set(serial, x, day); out.push(...day); }
      d = engine.addDays(end, 1);
    }
    return out.sort((a, b) => (a.d === b.d ? a.m - b.m : a.d < b.d ? -1 : 1));
  }
  const clock = (ms) => { const p = nyParts(ms); let h = Math.floor(p.m / 60), mm = String(p.m % 60).padStart(2, "0"); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${mm} ${ap}`; };
  const desc = (v) => [v.system, v.heat != null ? `heat ${v.heat}°` : "", v.cool != null ? `cool ${v.cool}°` : "", v.fan ? `fan ${v.fan}` : ""].filter(Boolean).join(", ");

  function status() {
    const s = st(), h = s.hvHold || {};
    return {
      mode, pilot: [...pilotSet], configured: pelican.configured, link: pelican.status(), at: listAt, err: listErr, syncAt: s.hvSyncAt || 0,
      tstats: list.map((t) => { const nn = (() => { try { return nowNext(t.serial); } catch { return {}; } })(); return { ...t, hold: h[t.serial] || null, next: nn.next ? { at: nn.nextAt, heat: nn.next.heat, cool: nn.next.cool, system: nn.next.system } : null }; }),
      would: (s.hvWould || []).slice(-60).reverse(),
    };
  }

  return { history, fromPelican, poll, plan, nowNext, setNow, resume, tick, sync, status, find, list: () => list, canWrite, MAX_PER_DAY, ANCHORS, SYSTEMS };
}

module.exports = { createHvac, MAX_PER_DAY };
