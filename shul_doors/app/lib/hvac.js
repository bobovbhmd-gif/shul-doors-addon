"use strict";
// Heating and cooling: the Pelican thermostats.
// Schedules work like Pelican's: a named schedule repeats daily, weekday and weekend, or weekly, each day a list of
// changes (up to 12, Pelican's limit), times by the clock or by zmanim. Each thermostat is on one schedule.
// Special days (holidays, events, dates, situations, the Rav, summer or winter clock, the outdoor temperature) put
// thermostats on another schedule for those days, like the door rules: the most specific one wins. One can also
// switch during the day when the outdoor temperature crosses lines the user typed, within the limits in Setup. Pelican stores one schedule per weekday on the thermostat, so every night the box writes
// the coming 7 days, each with its real times: the thermostat then holds a week on its own.
// Quick changes: until the next scheduled change (Pelican goes back by itself), for a while or until a time
// (the box puts it back), or permanent (until someone puts it back).
// Modes, like the doors: "read" changes nothing (shows what it would do), "pilot" changes only the thermostats
// listed in the add-on settings, "live" changes all of them.

const MAX_PER_DAY = 12;
const ANCHORS = ["alos", "sunrise", "chatzos", "plag", "sunset", "candles", "tzeis", "havdalah", "rt"];
const SYSTEMS = ["Auto", "Heat", "Cool", "Off"];

const WDS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Shabbos"];
const C0 = () => ({ wd: [], fest: [], dates: [], hr: [] });
// a schedule's list for a weekday: daily uses one list, weekday and weekend uses Sunday's for Sunday and Shabbos
// and Monday's for Monday to Friday (like Pelican), weekly has one for each day
function dayOf(sc, w) { const d = (sc && sc.days) || {}; if (sc.repeat === "daily") return d[0] || []; if (sc.repeat === "wkend") return w === 0 || w === 6 ? d[0] || [] : d[1] || []; return d[w] || []; }
// The first version kept a week per thermostat plus special days with their own times. Turn them into schedules
// once: thermostats with the same week share one; each special day gets its own schedule. The old ones are kept.
function migrate(h, nameOf = (x) => x) {
  if (h.v3) return false;
  const scheds = [], rules = [], groups = new Map(), cl = (x) => JSON.parse(JSON.stringify(x || []));
  Object.entries(h.sched || {}).forEach(([serial, week]) => {
    const days = {}; for (let d = 0; d < 7; d++) days[d] = cl(week && week[d]);   // a day left empty stays empty, as before
    const k = JSON.stringify(days); if (!groups.has(k)) groups.set(k, { days, tstats: [] }); groups.get(k).tstats.push(serial);
  });
  groups.forEach((g) => scheds.push({ id: "s" + (scheds.length + 1), name: g.tstats.map(nameOf).join(", ").slice(0, 40) || "Schedule " + (scheds.length + 1), repeat: "weekly", days: g.days, tstats: g.tstats }));
  (h.specials || []).forEach((sp) => {
    const inc = sp.inc || { wd: [], fest: (sp.when || {}).keys || [], dates: ((sp.when || {}).dates || []).map((d) => ({ from: d.from, to: d.to || d.from, yearly: false })), hr: [] };
    const sc = { id: "s" + (scheds.length + 1), name: sp.name || "Special day", repeat: "daily", days: { 0: cl(sp.entries) }, tstats: [] }; scheds.push(sc);
    rules.push({ id: "r" + (rules.length + 1), name: sp.name || "Special day", on: sp.on !== false, tstats: [...(sp.tstats || [])], inc: { ...C0(), ...inc }, exc: { ...C0(), ...(sp.exc || {}) }, rabbi: sp.rabbi || "any", season: sp.season || "any", sit: sp.sit || "", sched: sc.id, wx: null });
  });
  h.legacy = { sched: h.sched || {}, specials: h.specials || [] };
  h.scheds = (h.scheds || []).concat(scheds); h.rules = (h.rules || []).concat(rules); h.sched = {}; h.specials = []; h.v3 = true;
  return true;
}

function createHvac({ pelican, engine, saveState = () => {}, weather = { get: () => ({ now: null, days: {} }), refresh: async () => ({ now: null, days: {} }) }, alert = () => {}, getState, getStore, save, mode = "read", pilot = [], log = () => {}, note = () => {}, now = () => Date.now(), nyParts, cache = { get: () => null, set: () => {} } }) {
  let list = [], listAt = 0, listErr = "";
  const st = () => getStore();
  const cfg = () => { const s = getState() || {}; s.hvac = s.hvac || {}; const h = s.hvac; h.areas = h.areas || []; h.sched = h.sched || {}; h.specials = h.specials || []; h.quick = h.quick || []; h.scheds = h.scheds || []; h.rules = h.rules || []; h.adj = h.adj || {}; h.wx = h.wx || {}; return h; };
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
      const h = cfg(); if (!h.v3 && list.length && migrate(h, (x) => (find(x) || { name: x }).name)) { saveState(); log("info", "HVAC: weekly schedules and special days turned into schedules"); }
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
  // ---- which rule a thermostat follows on a date ----
  const W = () => weather.get() || { now: null, days: {} };
  const today = () => nyParts(now()).d;
  const sitTop = (id) => !!((((getState() || {}).situations || []).find((x) => x.id === id)) || {}).top;
  function condOk(r, info) { return !((r.sit && !(info.sits || []).includes(r.sit)) || (r.rabbi === "away" && !info.away) || (r.rabbi === "local" && info.away) || (r.season === "dst" && !info.dst) || (r.season === "std" && info.dst)); }
  const hasWx = (r) => r.wx && r.wx.t !== "" && r.wx.t != null && !isNaN(+r.wx.t);
  // the temperature a rule looks at for a date: the forecast high or low, or (for "now") the current reading.
  // A day that hasn't started is judged by its forecast: "now" uses the high for "above" and the low for "below".
  function wxValue(w, date, live) {
    const d = (W().days || {})[date] || {};
    if (w.use === "high") return d.hi ?? null;
    if (w.use === "low") return d.lo ?? null;
    if (live) return W().now ?? null;
    return (w.op === "below" ? d.lo : d.hi) ?? null;
  }
  const crosses = (w, v, line) => v != null && (w.op === "below" ? v < +line : v > +line);
  // today's answer is fixed when the day starts, and only a switch during the day (with its own lines) changes it
  function wxMatch(r, date) {
    const t = today();
    if (date === t) {
      const s = st(), lv = (s.hvLive || {})[t];
      if (lv && lv.off && lv.off[r.id]) return false;
      if (lv && lv.on && lv.on[r.id]) return true;
      s.hvWxDay = s.hvWxDay || {}; const fx = (s.hvWxDay[t] = s.hvWxDay[t] || {});
      if (fx[r.id] == null) { const v = wxValue(r.wx, t, false); if (v == null) return false; fx[r.id] = crosses(r.wx, v, r.wx.t); }
      return fx[r.id];
    }
    if (date < t) { const fx = (st().hvWxDay || {})[date]; if (fx && fx[r.id] != null) return fx[r.id]; }
    return crosses(r.wx, wxValue(r.wx, date, false), r.wx.t);
  }
  function ruleFor(serial, date, info) {
    info = info || engine.info(date);
    let best = null, bs = -1;
    for (const r of cfg().rules) {
      if (r.on === false || !(r.tstats || []).includes(serial) || !condOk(r, info)) continue;
      let sc = -1; try { sc = engine.cond(r.inc || C0(), r.exc || null, date); } catch { sc = -1; }
      if (sc < 0) continue;
      if (hasWx(r)) { if (!wxMatch(r, date)) continue; sc += 5; }
      sc += (r.sit ? (sitTop(r.sit) ? 200 : 10) : 0) + (r.rabbi && r.rabbi !== "any" ? 10 : 0) + (r.season && r.season !== "any" ? 5 : 0);   // like the door rules: a narrower one wins
      if (sc > bs) { bs = sc; best = r; }   // the closest fit wins; a tie goes to the one higher in the list
    }
    return best;
  }
  // a change can have its own rule: skip it on some days, or only make it on some days
  function whenHit(k, info) {
    if (k === "rav:away") return !!info.away; if (k === "rav:home") return !info.away;
    if (k === "clock:dst") return !!info.dst; if (k === "clock:std") return !info.dst;
    if (k.startsWith("sit:")) return (info.sits || []).includes(k.slice(4));
    const keys = info.keys || [];
    if (k === "chanuka") return keys.some((x) => /^chanuka\d$/.test(x));
    if (keys.includes(k)) return true;
    const i = k.indexOf(":"), h = k.slice(0, i);
    return (h === "ev" || h === "type") && keys.includes(h + "@hvac" + k.slice(i));   // events kept to HVAC
  }
  const okWhen = (e, info) => { const w = e.when; if (!w || !(w.keys || []).length) return true; const hit = w.keys.some((k) => whenHit(String(k), info)); return w.mode === "only" ? hit : !hit; };
  const schedById = (id) => cfg().scheds.find((x) => x.id === id) || null;
  const schedOf = (serial) => cfg().scheds.find((x) => (x.tstats || []).includes(serial)) || null;
  const managed = (serial) => !!schedOf(serial);   // only thermostats on a schedule made here are changed
  function plan(serial, date) {
    const info = engine.info(date), base = schedOf(serial);
    if (!base) return { date, w: info.w, src: "No schedule here", rule: null, sched: null, entries: [], over: 0 };
    const r = ruleFor(serial, date, info), sc = (r && schedById(r.sched)) || base, adj = +cfg().adj[serial] || 0;
    const seen = new Map();
    dayOf(sc, info.w).forEach((e) => {
      if (!okWhen(e, info)) return;
      let m = minOf(e.at, info.z); if (m == null) return; m = Math.max(0, Math.min(1439, Math.round(m)));
      seen.set(m, { min: m, system: SYSTEMS.includes(e.system) ? e.system : "Auto", heat: (+e.heat || 68) + adj, cool: (+e.cool || 76) + adj, fan: e.fan === "On" ? "On" : "Auto", keypad: e.keypad === "Off" ? "Off" : "On" });   // keypad Off locks the screen. Two at the same minute: the later one in the list
    });
    const entries = [...seen.values()].sort((a, b) => a.min - b.min);
    return { date, w: info.w, src: r && sc !== base ? (r.name === sc.name ? r.name : `${r.name} (${sc.name})`) : sc.name, rule: r ? r.id : null, sched: sc.id, entries: entries.slice(0, MAX_PER_DAY), over: Math.max(0, entries.length - MAX_PER_DAY) };
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

  // ---- switching during the day, by the outdoor temperature ----
  // Only runs once Setup has how often to check and the most switches a day; only rules that allow it, and only at
  // the lines the user typed (the switch point, and the switch-back point if one was typed).
  let lastLive = 0;
  function blocked(w, info, m) {
    const z = info.z || {}, keys = info.keys || [];
    if (w.block === "shabbos") {
      if (info.w === 6 && !(z.havdalah != null && m >= z.havdalah)) return true;
      if (info.w === 5 && z.candles != null && m >= z.candles) return true;
      if (keys.includes("yt_any")) return true;
      if (keys.includes("erev_yt_any") && z.candles != null && m >= z.candles) return true;
    }
    return (w.hours || []).some((x) => { const a = minOf(x.from, z), b = minOf(x.to, z); return a != null && b != null && (a <= b ? m >= a && m < b : m >= a || m < b); });
  }
  function liveReady() { const w = cfg().wx; return !!(+w.every && (w.max === "none" || +w.max > 0)); }
  async function liveCheck(force) {
    const h = cfg(), w = h.wx;
    if (!liveReady()) return { off: true };
    if (!force && now() - lastLive < +w.every * 60e3) return { wait: true };
    lastLive = now();
    const wd = await weather.refresh(w.src || "ha", w.entity || "");
    const p = nyParts(now()), t = p.d, info = engine.info(t);
    if (blocked(w, info, p.m)) return { blocked: true };
    const s = st(); s.hvLive = s.hvLive || {}; const lv = (s.hvLive[t] = s.hvLive[t] || { on: {}, off: {}, n: {} });
    Object.keys(s.hvLive).forEach((d) => { if (d < engine.addDays(t, -3)) delete s.hvLive[d]; });
    if (s.hvWxDay) Object.keys(s.hvWxDay).forEach((d) => { if (d < engine.addDays(t, -400)) delete s.hvWxDay[d]; });
    const serials = list.map((x) => x.serial).filter(managed), before = new Map(serials.map((x) => [x, hash(plan(x, t))]));
    const max = w.max === "none" ? Infinity : +w.max, msgs = [];
    for (const r of h.rules) {
      if (r.on === false || !hasWx(r) || !r.wx.live || !condOk(r, info)) continue;
      let sc = -1; try { sc = engine.cond(r.inc || C0(), r.exc || null, t); } catch { sc = -1; }
      if (sc < 0 || (lv.n[r.id] || 0) >= max) continue;
      const cur = wxValue(r.wx, t, true); if (cur == null) continue;
      const on = wxMatch(r, t), back = r.wx.back !== "" && r.wx.back != null && !isNaN(+r.wx.back);
      const pn = (schedById(r.sched) || {}).name || "its schedule";
      if (!on && crosses(r.wx, cur, r.wx.t)) { lv.on[r.id] = true; delete lv.off[r.id]; lv.n[r.id] = (lv.n[r.id] || 0) + 1; msgs.push(`${r.name}: ${cur}° outside, now on ${pn}`); }
      else if (on && back && crosses({ op: r.wx.op === "below" ? "above" : "below" }, cur, r.wx.back)) { lv.off[r.id] = true; delete lv.on[r.id]; lv.n[r.id] = (lv.n[r.id] || 0) + 1; msgs.push(`${r.name}: ${cur}° outside, switched back from ${pn}`); }
    }
    if (!msgs.length) return { same: true };
    save();
    const moved = serials.filter((x) => before.get(x) !== hash(plan(x, t)));
    if (moved.length) {
      await sync(false, moved);
      const held = s.hvHold || {}, keep = w.keep !== "end";   // until a choice is made, manual changes are kept
      const go = moved.filter((x) => !(keep && held[x]));
      if (go.length) await resume(go, "Shul Manager", "the outdoor temperature changed");
      moved.forEach((x) => event(x, "Shul Manager", "Switched schedules: " + msgs.join("; ")));
    }
    msgs.forEach((m) => log("info", "HVAC: " + m));
    try { alert(msgs.join(". ") + (moved.length ? `. ${moved.length} thermostat${moved.length === 1 ? "" : "s"} changed.` : ""), t + "|" + msgs.join("|")); } catch { /* no text */ }
    save(); return { switched: msgs, moved };
  }

  // ---- the week on the thermostats ----
  const hash = (x) => JSON.stringify(x.entries);
  async function sync(force, only) {
    const s = st(); s.hvSent = s.hvSent || {}; s.hvWouldSent = s.hvWouldSent || {}; s.hvWeekly = s.hvWeekly || {};
    if (!list.length) await poll();
    const today = nyParts(now()).d, out = { written: 0, would: 0, same: 0, errors: [] };
    for (const t of list) {
      if (only && !only.includes(t.serial)) continue;
      if (!managed(t.serial)) continue;   // no rule has this thermostat yet: leave the schedule on the thermostat alone
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

  return { liveCheck, liveReady, ruleFor, schedOf, history, fromPelican, poll, plan, nowNext, setNow, resume, tick, sync, status, find, list: () => list, canWrite, MAX_PER_DAY, ANCHORS, SYSTEMS };
}

module.exports = { createHvac, migrate, dayOf, MAX_PER_DAY };
