"use strict";
// HVAC schedules, version 4: what each thermostat should do on a date.
// Thermostats with the same times form a group (inside an area). Each group has a week for every season.
// On a date, in this order: a change for that date only, then special days (holidays, events, the Rav away,
// situations, custom dates), then the regular week of the season that runs that day.
// A season turns on by hand, by date (every year), or by the weather (the day's forecast high).
// Every single time can skip, or only run, on any special day (or on a special day falling on one weekday).
// A special day can use the regular week, the same times as another weekday, or its own times, and can be set
// differently for the weekday it falls on. It can be kept to some areas, and single dates can be skipped.

const clone = (x) => JSON.parse(JSON.stringify(x));
const SYSTEMS = ["Auto", "Heat", "Cool", "Off"];

// how specific a special day is: the most specific one sets the times
function rankOf(k) {
  if (k === "rav" || k.startsWith("sit:")) return 80;
  if (k.startsWith("u:")) return 75;
  if (k.startsWith("hd:") || k.startsWith("gd:")) return 74;
  if (k.startsWith("ev:")) return 72;
  if (k.startsWith("type:")) return 70;
  if (k.endsWith("_any") || k.startsWith("us_") || /^(elul|aseres|shovavim|sefira|three_weeks|nine_days|motzaei_yt_any|erev_yt_any)/.test(k)) return 50;
  return 60;
}

// ---- turning today's schedules into groups (once). Nothing changes on the thermostats. ----
function weekGroups(sc) {
  const d = (sc && sc.days) || {}, rep = sc && sc.repeat, out = [];
  const listFor = (w) => (rep === "daily" ? d[0] : rep === "wkend" ? (w === 0 || w === 6 ? d[0] : d[1]) : d[w]) || [];
  for (let w = 0; w < 7; w++) {
    const l = clone(listFor(w)), k = JSON.stringify(l), g = out.find((x) => JSON.stringify(x.list) === k);
    if (g) g.days.push(w); else out.push({ days: [w], list: l });
  }
  return out;
}
function migrate(h) {
  if (h.v4) return false;
  const areas = h.areas || [], groups = [];
  (h.scheds || []).forEach((sc) => {
    if (!(sc.tstats || []).length) return;
    // one group per area the schedule's thermostats are in (same times in each)
    const wk = weekGroups(sc), parts = new Map();
    sc.tstats.forEach((t) => { const ar = areas.find((a) => (a.tstats || []).includes(t)); const k = ar ? ar.id : ""; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(t); });
    [...parts.entries()].forEach(([aid, ts], i) => groups.push({ id: "g" + sc.id + (i ? "-" + i : ""), name: sc.name, area: aid, tstats: ts, week: { winter: clone(wk), fall: clone(wk), summer: clone(wk) } }));
  });
  h.v4 = {
    seasons: [
      { id: "winter", name: "Winter", mode: "wx", lo: -40, hi: 55, from: "11-15", to: "03-15", on: false, paused: false },
      { id: "fall", name: "Fall / Spring", mode: "wx", lo: 56, hi: 74, from: "09-15", to: "11-15", on: false, paused: false },
      { id: "summer", name: "Summer", mode: "wx", lo: 75, hi: 130, from: "06-15", to: "09-10", on: false, paused: false },
    ],
    groups, days: {}, own: [], one: {},
  };
  return true;
}

// ---- seasons ----
const inMD = (k, f, t) => (f <= t ? k >= f && k <= t : k >= f || k <= t);
function seasonInfo(v, date, hiOf) {
  const live = (v.seasons || []).filter((s) => !s.paused);
  let x = live.find((s) => s.mode === "hand" && s.on); if (x) return { id: x.id, why: "on by hand" };
  const k = date.slice(5); x = live.find((s) => s.mode === "date" && inMD(k, s.from, s.to)); if (x) return { id: x.id, why: "by date" };
  const ws = live.filter((s) => s.mode === "wx"), h = hiOf(date);
  if (ws.length && h != null) { const dist = (s) => (h < s.lo ? s.lo - h : h > s.hi ? h - s.hi : 0); x = ws.slice().sort((a, b) => dist(a) - dist(b))[0]; return { id: x.id, why: `high ${Math.round(h)}°` }; }
  return { id: (ws[0] || live[0] || v.seasons[0] || { id: "winter" }).id, why: h == null ? "no forecast" : "default" };
}
function weekGroup(g, season, w, seasons) {
  const wk = g.week[season] || g.week[((seasons || []).find((s) => g.week[s.id]) || {}).id] || [];
  return wk.find((x) => x.days.includes(w)) || { days: [w], list: [] };
}

// ---- the plan ----
const effDay = (k, cfg, w) => { const o = cfg.wd && cfg.wd[w]; return o && o.how && o.how !== "def" ? { ...cfg, how: o.how, same: o.same ?? cfg.same, list: o.list || {}, wdRule: w } : cfg; };
const keep = (l, ids) => l.filter((e) => { const w = e.w; if (!w) return true; if ((w.skip || []).some((i) => ids.has(i))) return false; return !(w.only || []).length || w.only.some((i) => ids.has(i)); });
// keys: the special days on that date (from the calendar, events, custom dates, the Rav, situations)
function dayKeys(v, info) {
  const ks = new Set();
  (info.keys || []).forEach((k) => { const m = String(k).match(/^(ev|type)@(\w+):(.*)$/); if (!m) ks.add(k); else if (m[2] === "hvac") ks.add(m[1] + ":" + m[3]); });   // events kept to another part of the system don't count here
  if (info.away) ks.add("rav");
  (info.sits || []).forEach((s) => ks.add("sit:" + s));
  (v.own || []).forEach((o) => { if ((o.dates || []).includes(info.s || info.date)) ks.add(o.id); });
  return ks;
}
// opts: { v, g (group), serial, date, info, season:{id,why}, minOf(at,z) }
function planGroup({ v, g, serial, date, info, season, nameOf = (k) => k }) {
  const w = info.w;
  const one = (serial && v.one[`${g.id}|${date}|${serial}`]) || v.one[`${g.id}|${date}`];
  if (one) return { list: one.list || [], src: one.why || "Changed for this date", kind: "one" };
  const all = dayKeys(v, info), on = [];
  all.forEach((k) => { const cfg = v.days[k] || { how: "reg" }; if (cfg.areas && !cfg.areas.includes(g.area || "")) return; if ((cfg.off || []).includes(date)) return; on.push({ k, cfg: effDay(k, cfg, w), rank: rankOf(k) }); });
  const ids = new Set(on.flatMap((x) => [x.k, x.k + "@" + w]));
  const base = on.filter((x) => x.cfg.how && x.cfg.how !== "reg").sort((a, b) => b.rank - a.rank)[0];
  let list;
  if (base) list = base.cfg.how === "own" ? ((base.cfg.list || {})[g.id] || []) : weekGroup(g, season.id, +base.cfg.same || 0, v.seasons).list;
  else list = weekGroup(g, season.id, w, v.seasons).list;
  list = keep(list, ids);
  const sName = ((v.seasons || []).find((s) => s.id === season.id) || { name: season.id }).name;
  let src;
  const spec = on.filter((x) => x.rank >= 60 && !x.k.startsWith("us_")).sort((a, b) => (b.rank - (/^(motz|erev)/.test(b.k) ? 1 : 0)) - (a.rank - (/^(motz|erev)/.test(a.k) ? 1 : 0)))[0];
  if (base) src = `${spec && spec.k !== base.k ? nameOf(spec.k) + " (" + nameOf(base.k) + ")" : nameOf(base.k)}${base.cfg.how === "same" ? ": same as " + ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbos"][+base.cfg.same || 0] : ": own times"}${base.cfg.wdRule != null ? " (weekday rule)" : ""}`;
  else src = sName;
  return { list, src, kind: base ? "special" : "week", keys: on.map((x) => x.k) };
}
// to the thermostat's entries (minutes, at most 12 a day)
function toEntries(list, z, minOf, adj = 0, max = 12) {
  const seen = new Map();
  list.forEach((e) => {
    let m = minOf(e.at, z); if (m == null) return; m = Math.max(0, Math.min(1439, Math.round(m)));
    seen.set(m, { min: m, system: SYSTEMS.includes(e.system) ? e.system : "Auto", heat: (+e.heat || 68) + adj, cool: (+e.cool || 76) + adj, fan: e.fan === "On" ? "On" : "Auto", keypad: e.keypad === "Off" ? "Off" : "On" });
  });
  const entries = [...seen.values()].sort((a, b) => a.min - b.min);
  return { entries: entries.slice(0, max), over: Math.max(0, entries.length - max) };
}
const groupOf = (v, serial) => (v.groups || []).find((g) => (g.tstats || []).includes(serial)) || null;

module.exports = { migrate, weekGroups, seasonInfo, planGroup, toEntries, groupOf, rankOf, weekGroup, keep };
