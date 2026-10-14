"use strict";
// Turns the rules into what the doors need:
//  1. a weekly Door Time Zone per door = the "plain" plan (no holidays, events or
//     situations) for the next 7 days, rewritten every night so zmanim stay current;
//  2. one-time overrides (OTRs) for every stretch where a real day differs from the
//     plain plan: yom tov, fasts, events, rabbi away, situations. Loaded up to
//     HORIZON days ahead, within a per-door budget, so the doors keep running
//     correctly for weeks even if this box is off.
const { localToUtc } = require("./time");

const API_MODE = {
  "Unlock": "Unlock", "Card or Pin": "CardOrPin", "Card": "Card", "Pin": "Pin",
  "Card and Pin": "CardAndPin", "First Credential In": "UnlockWithFirstCardIn", "Lockdown": "Lockdown",
};
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_SPANS_PER_DAY = 20;   // Hartmann limit: 20 changes per day in a Door Time Zone

function minuteModes(segs) {
  const out = new Array(1440);
  for (const g of segs) for (let m = g.a; m < g.b; m++) out[m] = g.mode;
  return out;
}
function runs(arr) {               // [{a,b,v}] of equal consecutive values
  const out = []; let a = 0;
  for (let m = 1; m <= arr.length; m++) if (m === arr.length || arr[m] !== arr[a]) { out.push({ a, b: m, v: arr[a] }); a = m; }
  return out;
}

// The plain day as it will be written into the weekly Door Time Zone. A panel day
// holds at most 20 parts; if the rules need more, the shortest parts are folded
// into a neighbour here and the real times are put back with one-time overrides.
function plainModes(engine, door, date) {
  const arr = minuteModes(engine.day(door, date, { plain: true }));
  let r = runs(arr);
  while (r.length > MAX_SPANS_PER_DAY) {
    let i = 0; for (let k = 1; k < r.length; k++) if (r[k].b - r[k].a < r[i].b - r[i].a) i = k;
    const left = r[i - 1], right = r[i + 1];
    const into = !left ? right : !right ? left : (left.b - left.a >= right.b - right.a ? left : right);
    for (let m = r[i].a; m < r[i].b; m++) arr[m] = into.v;
    r = runs(arr);
  }
  return arr;
}

// Weekly Door Time Zone: 7 days, each fully covered, minutes inclusive (0..1439).
function weekSpans(engine, door, today) {
  const spans = [], warnings = [];
  for (let k = 0; k < 7; k++) {
    const date = engine.addDays(today, k);
    const full = runs(minuteModes(engine.day(door, date, { plain: true }))).length;
    const day = runs(plainModes(engine, door, date));
    if (full > MAX_SPANS_PER_DAY && !warnings.length) warnings.push(`${door}: ${full} changes on ${date}; a panel day holds ${MAX_SPANS_PER_DAY}, the rest are sent as one-time overrides (this uses up the override budget quickly)`);
    for (const r of day) spans.push({ DayOfWeek: DOW[engine.dow(date)], StartTime: r.a, StopTime: r.b - 1, Mode: API_MODE[r.v] });
  }
  spans.sort((x, y) => DOW.indexOf(x.DayOfWeek) - DOW.indexOf(y.DayOfWeek) || x.StartTime - y.StartTime);
  return { spans, warnings };
}

// Exceptions: where the real plan differs from the plain plan.
function exceptions(engine, door, today, horizonDays) {
  const list = [];
  for (let k = 0; k <= horizonDays; k++) {
    const date = engine.addDays(today, k);
    const real = minuteModes(engine.day(door, date));
    const plain = plainModes(engine, door, date);
    // Cover each whole stretch of the real plan that differs anywhere from the plain
    // plan, not just the different minutes. Then the special day is fully pinned
    // down by the override even if the weekly schedule on the panel is a few
    // minutes stale (zmanim move about a minute a day if the box is off).
    const diff = new Array(1440).fill(null);
    for (const r of runs(real)) {
      let differs = false; for (let m = r.a; m < r.b; m++) if (real[m] !== plain[m]) { differs = true; break; }
      if (differs) for (let m = r.a; m < r.b; m++) diff[m] = real[m];
    }
    for (const r of runs(diff)) if (r.v) {
      const prev = list[list.length - 1];
      const start = localToUtc(date, r.a), stop = localToUtc(date, r.b);
      if (prev && prev.mode === API_MODE[r.v] && prev.stop === start) prev.stop = stop;   // runs across midnight
      else list.push({ door, mode: API_MODE[r.v], start, stop, date, reason: "rules" });
    }
  }
  return list;
}

// Overrides set by hand in the portal ("open the side door until 3").
function handOverrides(state, engineDoorsOf, now) {
  const out = [];
  for (const o of state.overrides || []) {
    const stop = o.to || o.from + 5 * 365 * 864e5;   // "until I end it": a fixed far end (so it isn't re-sent every hour), deleted when ended
    if (stop <= now) continue;
    for (const door of engineDoorsOf(o.doors)) out.push({ door, mode: API_MODE[o.mode] || o.mode, start: o.from, stop, reason: "hand", id: o.id });
  }
  return out;
}

// Pieces of `list` outside every interval in `cut` (Hartmann overrides on one
// door may not overlap, so ours are cut around anything that takes priority).
function carve(list, cut) {
  let out = list;
  for (const c of cut) out = out.flatMap((x) => (x.stop <= c.start || x.start >= c.stop) ? [x]
    : [...(x.start < c.start ? [{ ...x, stop: c.start }] : []), ...(x.stop > c.stop ? [{ ...x, start: c.stop }] : [])]);
  return out;
}

// Whole plan for the managed doors. Priority, highest first: overrides people made
// directly in Protector.Net (foreign), then by-hand overrides from the portal (a
// later one wins over an earlier one), then the rules. Nothing of ours overlaps.
function plan({ engine, state, doors, today, now, horizonDays = 30, budget = 24, foreignActive = {}, foreign = {} }) {
  const expand = (list) => engine.raw(`expandDoors(${JSON.stringify(list)})`);
  const hand = handOverrides(state, expand, now);
  const result = { week: {}, otrs: [], warnings: [], loadedThrough: {} };
  for (const door of doors) {
    const w = weekSpans(engine, door, today);
    result.week[door] = w.spans; result.warnings.push(...w.warnings);
    const theirs = (foreign[door] || []).map((f) => ({ start: f.start, stop: f.stop }));
    // by-hand: each one is cut around the ones made after it, then around Protector.Net's own
    const raw = hand.filter((h) => h.door === door).map((h) => ({ ...h, start: Math.max(h.start, now) })).filter((h) => h.stop > h.start);
    let mine = [];
    raw.forEach((h, i) => { mine.push(...carve([h], raw.slice(i + 1))); });
    const before = mine.reduce((t, x) => t + x.stop - x.start, 0);
    mine = carve(mine, theirs);
    if (mine.reduce((t, x) => t + x.stop - x.start, 0) < before) result.warnings.push(`${door}: an override made directly in Protector.Net overlaps a portal override; the portal one was cut around it.`);
    const cap = Math.max(0, Math.min(budget, 32 - (foreignActive[door] || 0)) - mine.length);
    let ex = exceptions(engine, door, today, horizonDays).filter((x) => x.stop > now);
    ex = carve(ex, [...mine, ...theirs]);
    // whole days only: a day is loaded completely or not at all
    const kept = []; let through = engine.addDays(today, horizonDays), full = false;
    const dates = [...new Set(ex.map((x) => x.date))];
    for (const dt of dates) {
      const day = ex.filter((x) => x.date === dt);
      if (kept.length + day.length > cap) { full = true; through = engine.addDays(dt, -1); break; }
      kept.push(...day);
    }
    result.otrs.push(...mine, ...kept);
    result.loadedThrough[door] = through;
    if (full) result.warnings.push(`${door}: override budget full, special days loaded through ${through < today ? "(none)" : through} only`);
  }
  return result;
}

module.exports = { plan, carve, weekSpans, exceptions, plainModes, API_MODE, DOW, MAX_SPANS_PER_DAY, runs, minuteModes };
