// The nightly plan (lib/planner.js): weekly Door Time Zones, one-time overrides,
// the per door budget, and the rule that overrides on one door never overlap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { engine, baseState, rule, clock, zman, W5, appRequire, ny } from "../helpers.mjs";

const { plan, weekSpans, exceptions, carve, MAX_SPANS_PER_DAY } = appRequire("lib/planner.js");
const { localToUtc } = appRequire("lib/time.js");
const ALL = [0, 1, 2, 3, 4, 5, 6];

function richState() {
  return baseState({
    events: [{ id: "e1", name: "A wedding", type: "Wedding", from: "2026-12-01", to: "2026-12-01" }],
    away: [{ from: "2026-12-08", to: "2026-12-10" }],
    rules: [
      rule({ id: 1, name: "Shacharis", doors: ["g:main", "T301"], inc: { wd: W5 }, exc: { fest: ["yt_any"] }, start: clock("05:45"), end: clock("09:30"), mode: "Unlock" }),
      rule({ id: 2, name: "Mincha", doors: ["g:main"], inc: { wd: W5 }, start: zman("sunset", -30), end: clock("22:30"), mode: "Unlock" }),
      rule({ id: 3, name: "Erev Shabbos", doors: ["g:main"], inc: { wd: [5] }, start: zman("candles", -60), end: clock("23:30"), mode: "Unlock" }),
      rule({ id: 4, name: "Shabbos", doors: ["g:main"], inc: { wd: [6] }, start: clock("07:00"), end: zman("havdalah", 30), mode: "Unlock" }),
      rule({ id: 5, name: "Chanuka", doors: ["T301"], inc: { fest: ["chanuka1", "chanuka2", "chanuka3", "chanuka4", "chanuka5", "chanuka6", "chanuka7", "zos_chanuka"] }, start: zman("sunset", 0), end: clock("21:00"), mode: "Unlock" }),
      rule({ id: 6, name: "Wedding", doors: ["g:main"], inc: { fest: ["type:Wedding"] }, start: clock("17:00"), end: clock("01:00"), mode: "Card" }),
      rule({ id: 7, name: "Away", doors: ["T301"], rabbi: "away", inc: { wd: W5 }, start: clock("19:00"), end: clock("23:00"), mode: "Card" }),
    ],
  });
}

function assertNoOverlap(otrs) {
  const byDoor = {};
  for (const o of otrs) (byDoor[o.door] = byDoor[o.door] || []).push(o);
  for (const [door, list] of Object.entries(byDoor)) {
    list.sort((a, b) => a.start - b.start);
    for (const o of list) assert.ok(o.stop > o.start, `${door}: empty override`);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].start >= list[i - 1].stop, `${door}: overrides overlap at ${new Date(list[i].start).toISOString()}`);
  }
}

test("weekly Door Time Zone: 7 days, every minute covered once, at most 20 parts a day", () => {
  const e = engine(richState());
  const { spans } = weekSpans(e, "T101", "2026-11-22");
  const days = new Set(spans.map((s) => s.DayOfWeek));
  assert.equal(days.size, 7);
  for (const d of days) {
    const day = spans.filter((s) => s.DayOfWeek === d);
    assert.ok(day.length <= MAX_SPANS_PER_DAY);
    assert.equal(day[0].StartTime, 0); assert.equal(day[day.length - 1].StopTime, 1439);
    for (let i = 1; i < day.length; i++) assert.equal(day[i].StartTime, day[i - 1].StopTime + 1);
  }
  const mon = spans.filter((s) => s.DayOfWeek === "Monday");
  assert.deepEqual(mon.find((s) => s.StartTime === 345), { DayOfWeek: "Monday", StartTime: 345, StopTime: 569, Mode: "Unlock" });
});

test("a day with more than 20 changes is folded on the panel and the real times go as overrides", () => {
  const rules = [];
  for (let i = 0; i < 15; i++) rules.push(rule({ id: 100 + i, name: "r" + i, doors: ["T201"], inc: { wd: ALL }, start: clock(`${String(6 + i).padStart(2, "0")}:00`), end: clock(`${String(6 + i).padStart(2, "0")}:${i < 3 ? "05" : "30"}`), mode: "Card" }));
  const e = engine(baseState({ rules }));
  const w = weekSpans(e, "T201", "2026-11-22");
  assert.ok(w.spans.filter((s) => s.DayOfWeek === "Monday").length <= 20);
  assert.match(w.warnings[0], /31 changes/);
  const ex = exceptions(e, "T201", "2026-11-22", 0);
  assert.ok(ex.length >= 1, "the folded parts come back as one-time overrides");
  assert.ok(ex.every((x) => x.mode === "Card" || x.mode === "Unlock"));
});

test("special days become one-time overrides covering the whole differing stretch", () => {
  const e = engine(richState());
  const ex = exceptions(e, "T101", "2026-11-30", 2);   // wedding Tue Dec 1, 5 PM to 1 AM
  const w = ex.filter((x) => x.mode === "Card");
  assert.equal(w.length, 1, "one override, across midnight");
  assert.equal(w[0].start, localToUtc("2026-12-01", 17 * 60));
  assert.equal(w[0].stop, localToUtc("2026-12-02", 60));
  // the Mincha stretch after the wedding ends at 1 AM is not a difference
  assert.ok(!ex.some((x) => x.date === "2026-11-30"));
});

test("carve cuts pieces around higher priority stretches and never leaves overlaps", () => {
  const a = { start: 0, stop: 100 }, cut = [{ start: 20, stop: 30 }, { start: 90, stop: 200 }];
  assert.deepEqual(carve([a], cut), [{ start: 0, stop: 20 }, { start: 30, stop: 90 }]);
  assert.deepEqual(carve([a], [{ start: 0, stop: 100 }]), []);
  assert.deepEqual(carve([a], [{ start: 100, stop: 120 }]), [a], "touching is not overlapping");
});

test("plan: overrides never overlap on a door, with hand overrides and Protector.Net's own", () => {
  const st = richState();
  const now = ny("2026-11-29 10:00");
  st.overrides = [
    { id: "h1", doors: ["g:main"], mode: "Unlock", from: ny("2026-12-01 16:00"), to: ny("2026-12-01 18:00") },
    { id: "h2", doors: ["T101"], mode: "Lockdown", from: ny("2026-12-01 17:30"), to: ny("2026-12-01 19:00") },
    { id: "h3", doors: ["T102"], mode: "Card", from: ny("2026-11-29 09:00") },   // until ended
  ];
  const e = engine(st, "2026-11-29 10:00");
  const foreign = { T101: [{ start: ny("2026-12-01 18:30"), stop: ny("2026-12-01 20:00") }] };
  const P = plan({ engine: e, state: st, doors: ["T101", "T102", "T301"], today: "2026-11-29", now, horizonDays: 30, budget: 24, foreign, foreignActive: { T101: 1 } });
  assertNoOverlap([...P.otrs, ...foreign.T101.map((f) => ({ ...f, door: "T101" }))]);
  const h1 = P.otrs.filter((o) => o.id === "h1" && o.door === "T101");
  assert.deepEqual(h1.map((o) => [o.start, o.stop]), [[ny("2026-12-01 16:00"), ny("2026-12-01 17:30")]], "an earlier hand override gives way to a later one");
  const h2 = P.otrs.filter((o) => o.id === "h2");
  assert.deepEqual(h2.map((o) => [o.start, o.stop]), [[ny("2026-12-01 17:30"), ny("2026-12-01 18:30")]], "cut around Protector.Net's own");
  assert.ok(P.warnings.some((w) => /directly in Protector.Net overlaps/.test(w)));
  const h3 = P.otrs.find((o) => o.id === "h3");
  assert.equal(h3.start, now, "a running hand override starts now");
  assert.ok(h3.stop > now + 4 * 365 * 864e5, "'until I end it' gets a far end");
  assert.ok(!P.otrs.some((o) => o.door === "T102" && o.reason === "rules" && o.stop > now), "nothing else on a door held by hand");
});

test("plan: the per door budget loads whole days only, and counts Protector.Net's own overrides", () => {
  const st = richState();
  const e = engine(st, "2026-11-29 10:00");
  const now = ny("2026-11-29 10:00");
  const free = plan({ engine: e, state: st, doors: ["T301"], today: "2026-11-29", now, horizonDays: 30, budget: 24 });
  const n = free.otrs.length;
  assert.ok(n >= 6, "Chanuka nights and the rabbi away nights: " + n);
  assert.equal(free.loadedThrough.T301, "2026-12-29");
  const tight = plan({ engine: e, state: st, doors: ["T301"], today: "2026-11-29", now, horizonDays: 30, budget: 24, foreignActive: { T301: 32 - 4 } });
  assert.ok(tight.otrs.length <= 4);
  assert.ok(tight.warnings.some((w) => /budget full/.test(w)));
  const through = tight.loadedThrough.T301;
  assert.ok(through < "2026-12-29");
  // whole days: every loaded day is complete, nothing after "loaded through"
  const dates = new Set(tight.otrs.map((o) => o.date));
  for (const d of dates) assert.equal(tight.otrs.filter((o) => o.date === d).length, free.otrs.filter((o) => o.date === d).length, d);
  assert.ok([...dates].every((d) => d <= through));
  const small = plan({ engine: e, state: st, doors: ["T301"], today: "2026-11-29", now, horizonDays: 30, budget: 3 });
  assert.ok(small.otrs.length <= 3);
});

test("plan over a whole year: no overlaps, never more than 32 on a door, every override inside the horizon", () => {
  const st = richState();
  st.events.push({ id: "e2", name: "Kiddush", type: "Wedding", from: "2027-04-25", to: "2027-04-25" });
  for (let k = 0; k < 365; k += 9) {
    const today = engine(st).addDays("2026-11-22", k);
    const e = engine(st, today + " 03:00"), now = ny(today + " 03:00");
    const P = plan({ engine: e, state: st, doors: ["T101", "T102", "T201", "T301"], today, now, horizonDays: 30, budget: 24 });
    assertNoOverlap(P.otrs);
    for (const d of ["T101", "T102", "T201", "T301"]) assert.ok(P.otrs.filter((o) => o.door === d).length <= 24, `${today} ${d}`);
    const end = localToUtc(e.addDays(today, 31), 0);
    assert.ok(P.otrs.every((o) => o.reason === "hand" || (o.stop <= end + 864e5 && o.stop > now)), today);
  }
});
