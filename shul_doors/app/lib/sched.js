"use strict";
// Times that follow the zmanim, and the parking lot schedule. Same rules as the page.
// A time is "18:00", a minute count, or a zman with minutes before or after: "sunset-30", "alos+15", "candles".
const ZMAN = ["alos", "sunrise", "candles", "sunset", "tzeis", "havdalah"];
const toMin = (v) => { const [h, m] = String(v).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
function tsParse(v) {
  if (typeof v === "number") return { z: "time", t: v };
  const m = String(v || "").match(/^([a-z]+)([+-]\d+)?$/);
  if (m && ZMAN.includes(m[1])) return { z: m[1], off: +(m[2] || 0) };
  return { z: "time", t: toMin(v || "0:00") };
}
// z: the day's zmanim in minutes from midnight ({ alos, sunrise, candles, sunset, tzeis, havdalah })
function tsMin(v, z) {
  const p = tsParse(v); if (p.z === "time") return p.t;
  z = z || {}; let b = z[p.z];
  if (b == null && p.z === "candles") b = z.sunset != null ? z.sunset - 18 : null;
  if (b == null && p.z === "havdalah") b = z.tzeis != null ? z.tzeis : z.sunset != null ? z.sunset + 50 : null;
  if (b == null) b = z.sunset || 1080;
  return Math.round(b + p.off);
}
// a thermostat day: [[start, temp], ...] where a start may follow a zman. First change stays at 12:00 AM.
function resolveDay(day, z) {
  return (day || []).map((e, i) => [i === 0 ? 0 : Math.min(1425, Math.max(15, Math.round(tsMin(e[0], z) / 15) * 15)), +e[1]]).sort((a, b) => a[0] - b[0])
    .filter((e, i, a) => i === a.length - 1 || a[i + 1][0] !== e[0]);
}
const YT = /rh1|rh2|yk$|succos1|succos2|shmini|simchas|pesach1|pesach2|shvii|acharon|shavuos1|shavuos2/;
// what a parking lot entrance should be at minute m of a date. info: { w, keys, z }
// one-off dates come first, then the weekly times; Locked beats Open beats Normal
function parkModeAt(cfg, d, m, doorId, info) {
  cfg = cfg || {}; info = info || {};
  const isYT = (info.keys || []).some((k) => YT.test(k));
  const inT = (r) => { const a = tsMin(r.from, info.z), b = tsMin(r.to, info.z); return a === b || (a < b ? m >= a && m < b : m >= a || m < b); };   // same start and end: all day
  const forDoor = (r) => r.doors === "all" || (r.doors || []).includes(doorId);
  const pick = (l) => l.find((r) => r.mode === "locked") || l.find((r) => r.mode === "open") || l[0];
  const dl = (cfg.dates || []).filter((r) => r.date === d && forDoor(r) && inT(r));
  if (dl.length) { const r = pick(dl); return { mode: r.mode, by: r.name }; }
  const rl = (cfg.rules || []).filter((r) => forDoor(r) && inT(r) && ((r.days || []).includes(info.w) || (r.hol && isYT)));
  if (rl.length) { const r = pick(rl); return { mode: r.mode, by: r.name }; }
  return { mode: "normal", by: "" };
}
module.exports = { tsParse, tsMin, resolveDay, parkModeAt };
