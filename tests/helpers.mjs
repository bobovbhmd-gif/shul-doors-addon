// Shared helpers for the Shul Manager tests.
// The app folder can be swapped with SD_APP_DIR (the planted bug run uses a copy).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP = process.env.SD_APP_DIR || path.join(here, "..", "shul_doors", "app");
export const req = createRequire(path.join(APP, "server.js"));
export const appRequire = (p) => req(path.join(APP, p));

// Calendar from the add-on's own generator (calgen.py, pyluach), cached per range.
const calCache = new Map();
export function calendar(from = "2025-09-01", to = "2031-01-31") {
  const k = from + "|" + to;
  if (!calCache.has(k)) {
    const out = execFileSync("python3", [path.join(APP, "calendar", "calgen.py"), from, to], { maxBuffer: 64e6 });
    calCache.set(k, JSON.parse(out));
  }
  return calCache.get(k);
}

// New York wall clock -> ms, e.g. ny("2026-11-22 10:00")
export function ny(s) {
  const { localToUtc } = appRequire("lib/time.js");
  const [d, t = "12:00"] = s.split(" ");
  const [h, m] = t.split(":").map(Number);
  return localToUtc(d, h * 60 + m);
}

export function engine(state, nowStr = "2026-11-22 12:00", cal = calendar()) {
  const { createEngine } = appRequire("engine/load.js");
  let now = ny(nowStr);
  const e = createEngine({ state, calendar: cal, now: () => now });
  // answers come from the engine's sandbox; copy them so deepEqual compares plain values
  for (const k of ["day", "output", "clashes", "info", "zmanim", "doors"]) { const f = e[k].bind(e); e[k] = (...a) => JSON.parse(JSON.stringify(f(...a))); }
  e.setNow = (s) => { now = ny(s); e.setClock(() => now); };
  return e;
}

// ---------- a made up building (never the real doors) ----------
export const W5 = [0, 1, 2, 3, 4];
const C = () => ({ wd: [], fest: [], dates: [], hr: [] });
let nextId = 1;
export function rule(o) {
  const r = { id: o.id ?? nextId++, kind: "door", note: "", rabbi: "any", season: "any", stop: true, ...o };
  r.inc = { ...C(), ...(o.inc || {}) };
  r.exc = { ...C(), ...(o.exc || {}) };
  r.start = o.start || { a: "clock", t: "00:00", o: 0 };
  r.end = o.end || { a: "clock", t: "23:59", o: 0 };
  return r;
}
export const clock = (t, extra = {}) => ({ a: "clock", t, o: 0, ...extra });
export const zman = (a, o = 0, extra = {}) => ({ a, o, ...extra });

export function baseState(over = {}) {
  return {
    rabbiAwayNow: false, candleOff: 18, havOff: 72, rtOff: 72, away: [],
    doors: [
      { id: "T101", name: "T101", def: "Card or Pin" },
      { id: "T102", name: "T102", def: "Card or Pin" },
      { id: "T201", name: "T201", def: "Unlock" },
      { id: "T301", name: "T301", def: "Card or Pin" },
    ],
    groups: [{ id: "main", name: "Main doors", doors: ["T101", "T102"] }],
    types: ["Wedding", "Kiddush"], accessGroups: [],
    events: [], hdates: [], gdates: [], overrides: [], requests: [], notes: [], vendors: [], codes: [],
    users: [{ name: "Tester", role: "Super admin" }], me: "Tester", contacts: [],
    situations: [{ id: "s1", name: "Snow day", on: false, top: false, ranges: [] }, { id: "s2", name: "Building closed", on: false, top: true, ranges: [] }],
    alerts: {}, log: [], rules: [],
    ...over,
  };
}

// mode of a door at a minute ("HH:MM") on a date
export function modeAt(e, door, date, hm, opts) {
  const [h, m] = hm.split(":").map(Number), min = h * 60 + m;
  const g = e.day(door, date, opts).find((x) => x.a <= min && min < x.b);
  return g && g.mode;
}
export function ruleAt(e, door, date, hm, opts) {
  const [h, m] = hm.split(":").map(Number), min = h * 60 + m;
  const g = e.day(door, date, opts).find((x) => x.a <= min && min < x.b);
  return g && g.rule;
}
export const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
