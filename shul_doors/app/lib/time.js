"use strict";
// New York wall clock <-> UTC. Protector.Net wants UTC with no zone suffix.
const TZ = "America/New_York";
const F = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function parts(ms) {
  const p = {}; for (const x of F.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
// offset (minutes) of New York from UTC at instant ms, e.g. -240 in summer
function offsetAt(ms) {
  const p = parts(ms);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}
// date "YYYY-MM-DD" + minutes after local midnight (may be >= 1440) -> UTC ms.
// Times that don't exist (spring forward) move later; repeated times (fall back) use the first.
function localToUtc(date, minute) {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minute);
  const cands = [...new Set([naive - offsetAt(naive - 12 * 3600e3) * 60000, naive - offsetAt(naive + 12 * 3600e3) * 60000])];
  const exact = cands.filter((c) => wallKey(c) === wallKeyNaive(naive)).sort((p, q) => p - q);
  if (exact.length) return exact[0];               // normal, or the first of a repeated hour
  return Math.max(...cands);                       // time skipped in spring: the moment the clock jumps past it
}
const wallKeyNaive = (naive) => { const t = new Date(naive); return `${t.getUTCFullYear()}-${t.getUTCMonth() + 1}-${t.getUTCDate()} ${t.getUTCHours()}:${t.getUTCMinutes()}`; };
const wallKey = (ms) => localKey(ms);
// UTC instant for every minute of a local date (fast path when there is no clock change that day)
function dayInstants(date) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const u0 = localToUtc(date, 0), u1 = localToUtc(next, 0), out = new Array(1440);
  if (u1 - u0 === 1440 * 60000) { for (let i = 0; i < 1440; i++) out[i] = u0 + i * 60000; }
  else for (let i = 0; i < 1440; i++) out[i] = localToUtc(date, i);
  return out;
}
function localKey(ms) { const p = parts(ms); return `${p.y}-${p.m}-${p.d} ${p.h}:${p.mi}`; }
function localDate(ms) { const p = parts(ms); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }
function localMinute(ms) { const p = parts(ms); return p.h * 60 + p.mi; }
function hartmann(ms) { return new Date(ms).toISOString().slice(0, 19); }       // "2026-10-14T22:20:00"
function fromHartmann(s) { return Date.parse(String(s).replace(/Z$/i, "").slice(0, 19) + "Z"); }

module.exports = { TZ, parts, offsetAt, localToUtc, dayInstants, localDate, localMinute, hartmann, fromHartmann };
