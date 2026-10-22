// Runs the exact same rule engine the portal uses, inside a sandbox, so the
// box and the screen can never disagree about what a door should do.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CORE = path.join(__dirname, "core.js"); // written by tools/extract-engine.js

function createEngine({ state, calendar, now }) {
  const ctx = {
    console, Intl, Math, JSON, Set, Map, Array, Object, String, Number, Boolean,
    structuredClone, setTimeout: () => 0, clearTimeout: () => {},
  };
  vm.createContext(ctx);
  // Fixed clock for tests and fast-forward; real clock otherwise.
  ctx.__now = now || (() => Date.now());
  vm.runInContext("Date.now = () => __now();", ctx);
  const src = fs.readFileSync(CORE, "utf8")
    .replace("__CAL__", JSON.stringify(calendar.cal))
    .replace("__HEB__", JSON.stringify(calendar.heb))
    .replace("__PARSHA__", JSON.stringify(calendar.parsha || {}))
    .replace('const HEB_START = "2026-09-01";', `const HEB_START = ${JSON.stringify(calendar.start)};`);
  vm.runInContext(src, ctx, { filename: "engine-core.js" });

  const run = (code) => vm.runInContext(code, ctx);
  let cache = new Map(), cacheDay = "";
  const api = {
    setState(s) { ctx.__in = s; run("S = structuredClone(__in); S.overrides = S.overrides || []; DI_CACHE = null;"); cache = new Map(); },
    setClock(fn) { ctx.__now = fn; run("DI_CACHE = null;"); cache = new Map(); },
    // Minute-by-minute plan for one door on one date, as [{a,b,mode,rule,via}]
    // a,b are minutes from midnight (b exclusive). Manual overrides are left out:
    // the box sends those to the doors separately, right away.
    day(door, date, { plain = false } = {}) {
      const today = run("todayNY()");
      if (today !== cacheDay) { cache = new Map(); cacheDay = today; }   // answers depend on "today"; keep only today's
      const key = door + "|" + date + "|" + plain;
      if (cache.has(key)) return cache.get(key);
      const r = this._day(door, date, plain);
      if (cache.size > 50000) cache = new Map();
      cache.set(key, r); return r;
    },
    _day(door, date, plain) {
      ctx.__d = door; ctx.__s = date; ctx.__plain = plain;
      return run(`(() => { PLAIN = __plain; NO_OV = true; DI_CACHE = new Map();
        try {
          return daySegments(__d, __s).map(g => ({ a: g.a, b: g.b,
            mode: g.c.ov ? g.c.ov.mode : g.c.r.mode,
            rule: g.c.isDef ? "Default" : g.c.r.name, via: g.c.src || "" }));
        } finally { PLAIN = false; NO_OV = false; DI_CACHE = null; } })()`);
    },
    info(date) { ctx.__s = date; return run(`(() => { const i = dayInfoRaw(__s); return { s: i.s, w: i.w, h: i.h, keys: [...i.keys], z: i.z, dst: i.dst, away: i.away, sits: [...i.sits] }; })()`); },
    // the Shabbos magnet (or another output) on one date: [{a,b,mode:"On"|"Off"}]
    output(o, date) { ctx.__o = o; ctx.__s = date; return run("outputDay(__o, __s)"); },
    // rules that overlap on the same doors at the same time (nobody chose which one runs)
    clashes(doors, from, days, real) { ctx.__d = doors; ctx.__s = from; ctx.__n = days; ctx.__real = !!real;
      return run(`clashPairs(scanAll(__d, __s, __n, __real)).map(p => ({ line: clashLine(p), runs: rn(p.runs), doors: p.doors }))`); },
    doors() { return run("S.doors.map(d => ({ id: d.id, name: d.name, def: d.def }))"); },
    today() { return run("todayNY()"); },
    addDays(s, n) { ctx.__s = s; ctx.__n = n; return run("addDays(__s, __n)"); },
    dow(s) { ctx.__s = s; return run("dow(__s)"); },
    zmanim(s) { ctx.__s = s; return run("zmanim(__s)"); },
    raw: run,
  };
  if (state) api.setState(state);
  return api;
}

module.exports = { createEngine };
