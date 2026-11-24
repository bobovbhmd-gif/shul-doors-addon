// The rule engine (engine/core.js, run through engine/load.js exactly as the box runs it).
// Priority is layered: by hand > situation that beats all > situation > event > regular schedule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { engine, calendar, baseState, rule, clock, zman, W5, modeAt, ruleAt, ny, hm } from "../helpers.mjs";

const MON = "2026-11-23", TUE = "2026-11-24", FRI = "2026-11-27", SHABBOS = "2026-11-28";

test("a door with no rule follows its default", () => {
  const e = engine(baseState());
  assert.deepEqual(e.day("T101", MON), [{ a: 0, b: 1440, mode: "Card or Pin", rule: "Default", via: "" }]);
  assert.equal(modeAt(e, "T201", MON, "03:00"), "Unlock");
});

test("weekday rule by clock: starts on the minute, ends before the end minute", () => {
  const e = engine(baseState({ rules: [rule({ id: 1, name: "Shacharis", doors: ["T101"], inc: { wd: W5 }, start: clock("05:45"), end: clock("09:30"), mode: "Unlock" })] }));
  assert.equal(modeAt(e, "T101", MON, "05:44"), "Card or Pin");
  assert.equal(modeAt(e, "T101", MON, "05:45"), "Unlock");
  assert.equal(modeAt(e, "T101", MON, "09:29"), "Unlock");
  assert.equal(modeAt(e, "T101", MON, "09:30"), "Card or Pin");
  assert.equal(modeAt(e, "T101", SHABBOS, "06:00"), "Card or Pin", "not on Shabbos");
  assert.equal(modeAt(e, "T102", MON, "06:00"), "Card or Pin", "only its own doors");
});

test("zman times with offsets, and 'not earlier than'", () => {
  const st = baseState({ rules: [
    rule({ id: 1, name: "Mincha", doors: ["T101"], inc: { wd: W5 }, start: zman("sunset", -30), end: clock("22:30"), mode: "Unlock" }),
    rule({ id: 2, name: "Early", doors: ["T102"], inc: { wd: W5 }, start: zman("alos", 0, { nb: "06:00" }), end: clock("08:00"), mode: "Unlock" }),
  ] });
  const e = engine(st), z = e.zmanim(MON);
  assert.equal(modeAt(e, "T101", MON, hm(z.sunset - 31)), "Card or Pin");
  assert.equal(modeAt(e, "T101", MON, hm(z.sunset - 30)), "Unlock");
  assert.ok(z.alos < 360, "alos is before 6 AM in November");
  assert.equal(modeAt(e, "T102", MON, hm(z.alos)), "Card or Pin", "held back to 6:00");
  assert.equal(modeAt(e, "T102", MON, "06:00"), "Unlock");
});

test("a window that ends after midnight runs into the next day", () => {
  const e = engine(baseState({ rules: [rule({ id: 1, name: "Late", doors: ["T101"], inc: { wd: [1] }, start: clock("22:00"), end: clock("01:00"), mode: "Unlock" })] }));
  assert.equal(modeAt(e, "T101", MON, "23:30"), "Unlock");
  assert.equal(modeAt(e, "T101", TUE, "00:30"), "Unlock");
  assert.match(e.day("T101", TUE)[0].via, /continues from Mon/);
  assert.equal(modeAt(e, "T101", TUE, "01:00"), "Card or Pin");
});

test("a window that runs several days (Rosh Hashana through both days)", () => {
  const e = engine(baseState({ rules: [rule({ id: 1, name: "RH", doors: ["T101"], inc: { fest: ["erev_rh"] }, start: zman("candles", -60), end: zman("havdalah", 15, { days: 2 }), mode: "Unlock" })] }));
  // Rosh Hashana 5788: Erev on Fri 2027-10-01, days on Shabbos and Sunday
  const z = e.zmanim("2027-10-03");
  assert.equal(modeAt(e, "T101", "2027-10-01", "12:00"), "Card or Pin");
  assert.equal(modeAt(e, "T101", "2027-10-02", "03:00"), "Unlock");
  assert.equal(modeAt(e, "T101", "2027-10-03", hm(z.havdalah + 14)), "Unlock");
  assert.equal(modeAt(e, "T101", "2027-10-03", hm(z.havdalah + 15)), "Card or Pin");
});

test("layers: event overrides schedule, situation overrides event, 'beats all' beats situation, by hand beats everything", () => {
  const st = baseState({
    events: [{ id: "e1", name: "A wedding", type: "Wedding", from: MON, to: MON }],
    rules: [
      rule({ id: 1, name: "Weekdays", doors: ["T101"], inc: { wd: W5 }, start: clock("08:00"), end: clock("20:00"), mode: "Unlock" }),
      rule({ id: 2, name: "Wedding", doors: ["T101"], inc: { fest: ["type:Wedding"] }, start: clock("12:00"), end: clock("23:00"), mode: "Card" }),
      rule({ id: 3, name: "Snow", sit: "s1", doors: ["T101"], inc: { wd: [0, 1, 2, 3, 4, 5, 6] }, start: clock("14:00"), end: clock("16:00"), mode: "Card or Pin" }),
      rule({ id: 4, name: "Closed", sit: "s2", doors: ["T101"], inc: { wd: [0, 1, 2, 3, 4, 5, 6] }, start: clock("15:00"), end: clock("15:30"), mode: "Lockdown" }),
    ],
  });
  st.situations[0].ranges = [{ from: MON, to: MON }];
  st.situations[1].ranges = [{ from: MON, to: MON }];
  st.overrides = [{ id: "o1", doors: ["T101"], mode: "Unlock", from: ny(MON + " 15:10"), to: ny(MON + " 15:20") }];
  const e = engine(st, MON + " 07:00");
  assert.equal(ruleAt(e, "T101", MON, "09:00"), "Weekdays");
  assert.equal(ruleAt(e, "T101", MON, "12:30"), "Wedding");
  assert.equal(ruleAt(e, "T101", MON, "14:30"), "Snow");
  assert.equal(ruleAt(e, "T101", MON, "15:05"), "Closed");
  assert.equal(modeAt(e, "T101", MON, "15:05"), "Lockdown");
  assert.equal(ruleAt(e, "T101", MON, "15:15", { withOverrides: true }), "By hand");
  assert.equal(modeAt(e, "T101", MON, "15:15", { withOverrides: true }), "Unlock");
  assert.equal(ruleAt(e, "T101", MON, "15:15"), "Closed", "the box sends by-hand overrides separately");
  assert.equal(ruleAt(e, "T101", MON, "21:00"), "Wedding", "the event runs past the weekday rule");
  assert.equal(ruleAt(e, "T101", TUE, "13:00"), "Weekdays", "the event is one day only");
});

test("events kept to one part of the building only count there", () => {
  const st = baseState({
    events: [{ id: "e1", name: "Parking only", type: "Kiddush", from: MON, to: MON, only: "parking" }],
    rules: [rule({ id: 2, name: "Kiddush", doors: ["T101"], inc: { fest: ["type:Kiddush"] }, start: clock("11:00"), end: clock("14:00"), mode: "Unlock" })],
  });
  const e = engine(st);
  assert.equal(modeAt(e, "T101", MON, "12:00"), "Card or Pin");
});

test("rabbi away rules, by dates and by the 'away now' switch", () => {
  const st = baseState({ away: [{ from: TUE, to: TUE }], rules: [
    rule({ id: 1, name: "Here", doors: ["T101"], rabbi: "local", inc: { wd: W5 }, start: clock("18:00"), end: clock("21:00"), mode: "Unlock" }),
    rule({ id: 2, name: "Away", doors: ["T101"], rabbi: "away", inc: { wd: W5 }, start: clock("19:00"), end: clock("20:00"), mode: "Card" }),
  ] });
  const e = engine(st, MON + " 07:00");
  assert.equal(ruleAt(e, "T101", MON, "19:30"), "Here");
  assert.equal(ruleAt(e, "T101", TUE, "19:30"), "Away");
  assert.equal(ruleAt(e, "T101", TUE, "18:30"), "Default", "the 'here' rule is off while away");
  st.rabbiAwayNow = true; st.rabbiAwaySince = MON; st.away = [];
  e.setState(st);
  assert.equal(ruleAt(e, "T101", MON, "19:30"), "Away");
  assert.equal(ruleAt(e, "T101", "2026-11-25", "19:30"), "Away", "stays away until switched back");
});

test("summer clock and winter clock rules", () => {
  const e = engine(baseState({ rules: [
    rule({ id: 1, name: "Summer", doors: ["T301"], season: "dst", inc: { wd: W5 }, start: clock("20:00"), end: clock("23:00"), mode: "Unlock" }),
    rule({ id: 2, name: "Winter", doors: ["T301"], season: "std", inc: { wd: W5 }, start: clock("19:00"), end: clock("22:00"), mode: "Unlock" }),
  ] }));
  assert.equal(ruleAt(e, "T301", MON, "19:30"), "Winter");
  assert.equal(ruleAt(e, "T301", "2027-06-14", "19:30"), "Default");
  assert.equal(ruleAt(e, "T301", "2027-06-14", "20:30"), "Summer");
  assert.equal(ruleAt(e, "T301", "2027-03-11", "19:30"), "Winter", "Thursday before the clock change");
  assert.equal(ruleAt(e, "T301", "2027-03-15", "20:30"), "Summer", "Monday after");
});

test("'but not on' days: yom tov, fasts, chosen weekdays", () => {
  const e = engine(baseState({ rules: [rule({ id: 1, name: "Weekdays", doors: ["T101"], inc: { wd: W5 }, exc: { fest: ["yt_any", "tisha_bav"] }, start: clock("06:00"), end: clock("09:00"), mode: "Unlock" })] }));
  assert.equal(modeAt(e, "T101", "2027-04-22", "07:00"), "Card or Pin", "Pesach 1 is a Thursday");
  assert.equal(modeAt(e, "T101", "2027-08-12", "07:00"), "Card or Pin", "Tisha B'Av 5787");
  assert.equal(modeAt(e, "T101", "2027-04-26", "07:00"), "Unlock", "chol hamoed is not yom tov");
});

test("holiday and weekday rules in the same layer: a clash until someone chooses; Hebrew dates and ranges work", () => {
  const st = baseState({ hdates: [{ id: "h1", name: "Yahrzeit", m: 9, d: 10 }], rules: [
    rule({ id: 1, name: "Weekdays", doors: ["T101"], inc: { wd: W5 }, start: clock("06:00"), end: clock("09:00"), mode: "Unlock" }),
    rule({ id: 2, name: "Chanuka mornings", doors: ["T101"], inc: { fest: ["chanuka_any_not_a_key", "chanuka3"] }, start: clock("06:00"), end: clock("09:00"), mode: "Card" }),
    rule({ id: 3, name: "Yahrzeit", doors: ["T102"], inc: { fest: ["hd:h1"] }, start: clock("10:00"), end: clock("11:00"), mode: "Unlock" }),
    rule({ id: 4, name: "Tammuz to Av", doors: ["T301"], inc: { hr: [{ fm: 4, fd: 1, tm: 5, td: 30 }] }, start: clock("22:30"), end: clock("23:30"), mode: "Unlock" }),
  ] });
  const e = engine(st);
  // Chanuka 5787 starts Sat 2026-12-05; day 3 is Monday 2026-12-07
  assert.equal(ruleAt(e, "T101", "2026-12-07", "07:00"), "Weekdays", "nobody chose yet: the rule higher in the list runs");
  assert.equal(e.clashes(["T101"], "2026-12-01", 14).length, 1, "and it shows as a clash");
  st.rules[0].yields = [{ id: 2, doors: [] }];
  e.setState(st);
  assert.equal(ruleAt(e, "T101", "2026-12-07", "07:00"), "Chanuka mornings", "after choosing, Chanuka overrides");
  assert.equal(e.clashes(["T101"], "2026-12-01", 14).length, 0);
  assert.equal(ruleAt(e, "T101", "2026-12-08", "07:00"), "Weekdays");
  // 10 Kislev 5787 = Fri 2026-11-20 (hebcal)
  assert.equal(ruleAt(e, "T102", "2026-11-19", "10:30"), "Default");
  assert.equal(ruleAt(e, "T102", "2026-11-20", "10:30"), "Yahrzeit");
  assert.equal(ruleAt(e, "T102", "2026-11-21", "10:30"), "Default");
  // 1 Tammuz 5787 = 2027-07-06, 30 Av = 2027-09-02, 1 Elul = 2027-09-03 (hebcal)
  assert.equal(ruleAt(e, "T301", "2027-07-05", "23:00"), "Default", "30 Sivan");
  assert.equal(ruleAt(e, "T301", "2027-07-06", "23:00"), "Tammuz to Av");
  assert.equal(ruleAt(e, "T301", "2027-09-02", "23:00"), "Tammuz to Av");
  assert.equal(ruleAt(e, "T301", "2027-09-03", "23:00"), "Default", "1 Elul");
});

test("Lockdown wins inside its layer when two rules overlap", () => {
  const e = engine(baseState({ rules: [
    rule({ id: 1, name: "Open", doors: ["T101"], inc: { wd: W5 }, start: clock("08:00"), end: clock("12:00"), mode: "Unlock" }),
    rule({ id: 2, name: "Lock", doors: ["T101"], inc: { wd: W5 }, start: clock("10:00"), end: clock("11:00"), mode: "Lockdown" }),
  ] }));
  assert.equal(modeAt(e, "T101", MON, "10:30"), "Lockdown");
  assert.equal(modeAt(e, "T101", MON, "11:30"), "Unlock");
});

test("an overridden rule steps aside on the days the winning rule runs", () => {
  const st = baseState({ rules: [
    rule({ id: 1, name: "Weeknights", doors: ["g:main"], inc: { wd: W5 }, start: clock("18:00"), end: clock("22:00"), mode: "Unlock", yields: [{ id: 2, doors: ["T101"] }] }),
    rule({ id: 2, name: "Erev yom tov", doors: ["g:main"], inc: { fest: ["erev_yt_any"] }, start: clock("17:00"), end: clock("19:00"), mode: "Card" }),
  ] });
  const e = engine(st);
  const EREV = "2027-04-21";   // Erev Pesach, a Wednesday
  assert.equal(ruleAt(e, "T101", EREV, "20:00"), "Default", "steps aside all evening at T101");
  assert.equal(ruleAt(e, "T102", EREV, "20:00"), "Weeknights", "only at the door it was told");
  assert.equal(ruleAt(e, "T101", MON, "20:00"), "Weeknights", "and only on those days");
  const c = e.clashes(["T101", "T102"], "2027-04-01", 40);
  assert.equal(c.length, 1, "the clash at T102 is still reported");
  assert.deepEqual(c[0].doors, ["T102"]);
});

test("clash check: same layer overlaps are reported with rule numbers; events over the schedule are not", () => {
  const st = baseState({ events: [{ id: "e1", name: "Kiddush", type: "Kiddush", from: MON, to: MON }], rules: [
    rule({ id: 1, no: 1, name: "A", doors: ["T101"], inc: { wd: W5 }, start: clock("08:00"), end: clock("10:00"), mode: "Unlock" }),
    rule({ id: 2, no: 2, name: "B", doors: ["T101"], inc: { wd: [1] }, start: clock("09:00"), end: clock("11:00"), mode: "Card" }),
    rule({ id: 3, no: 3, name: "Kiddush", doors: ["T101"], inc: { fest: ["type:Kiddush"] }, start: clock("09:30"), end: clock("12:00"), mode: "Unlock" }),
  ] });
  const e = engine(st);
  const c = e.clashes(["T101"], MON, 14);
  assert.equal(c.length, 1);
  assert.match(c[0].line, /#1 "A" and #2 "B" both control T101 at the same time/);
  assert.match(c[0].line, /9:00 AM to 10:00 AM/);
  assert.match(c[0].runs, /#1/, "the rule higher in the list runs until someone chooses");
});

test("clashes are found even before the rabbi is away or a situation is switched on", () => {
  const st = baseState({ rules: [
    rule({ id: 1, name: "Nights", doors: ["T101"], inc: { wd: W5 }, start: clock("19:00"), end: clock("21:00"), mode: "Unlock" }),
    rule({ id: 2, name: "Away nights", doors: ["T101"], rabbi: "away", inc: { wd: W5 }, start: clock("20:00"), end: clock("22:00"), mode: "Card" }),
    rule({ id: 3, name: "Snow A", sit: "s1", doors: ["T102"], inc: { wd: W5 }, start: clock("06:00"), end: clock("10:00"), mode: "Card" }),
    rule({ id: 4, name: "Snow B", sit: "s1", doors: ["T102"], inc: { wd: W5 }, start: clock("09:00"), end: clock("12:00"), mode: "Lockdown" }),
  ] });
  const e = engine(st);
  const c = e.clashes(["T101", "T102"], MON, 7);
  const pairs = c.map((x) => x.line.match(/"([^"]+)" and #?\d* ?"([^"]+)"/).slice(1).sort().join("+")).sort();
  assert.deepEqual(pairs, ["Away nights+Nights", "Snow A+Snow B"]);
  assert.equal(e.clashes(["T101", "T102"], MON, 7, true).length, 0, "but none will really happen this week");
});

test("the plain week leaves out holidays, events and situations (those go as one-time overrides)", () => {
  const st = baseState({ events: [{ id: "e1", name: "W", type: "Wedding", from: MON, to: MON }], rules: [
    rule({ id: 1, name: "Weekdays", doors: ["T101"], inc: { wd: W5 }, start: clock("08:00"), end: clock("10:00"), mode: "Unlock" }),
    rule({ id: 2, name: "Wedding", doors: ["T101"], inc: { fest: ["type:Wedding"] }, start: clock("09:00"), end: clock("12:00"), mode: "Card" }),
  ] });
  const e = engine(st);
  assert.equal(modeAt(e, "T101", MON, "11:00", { plain: true }), "Card or Pin");
  assert.equal(modeAt(e, "T101", MON, "09:30", { plain: true }), "Unlock");
  assert.equal(modeAt(e, "T101", MON, "11:00"), "Card");
});

test("Hebrew year is right whichever Rosh Hashana the calendar starts after", () => {
  // the box builds its calendar from about 400 days back, so the first Rosh Hashana in it moves every year
  for (const [from, to] of [["2025-09-01", "2029-12-31"], ["2025-10-18", "2029-12-31"], ["2026-10-20", "2030-12-31"], ["2027-11-01", "2030-12-31"]]) {
    const e = engine(baseState(), from === "2027-11-01" ? "2028-12-01 12:00" : "2026-11-22 12:00", calendar(from, to));
    const y = (d) => e.raw(`hebYear("${d}")`);
    if (from < "2027-01-01") { assert.equal(y("2026-11-23"), 5787, `calendar from ${from}`); assert.equal(y("2027-10-01"), 5787); }
    assert.equal(y("2027-10-02"), 5788, `RH 5788, calendar from ${from}`);
    assert.equal(y("2028-09-20"), 5788);
    assert.equal(y("2028-09-21"), 5789, "RH 5789");
    assert.equal(e.raw("hebYearSpan(5789)"), "2028–2029");
  }
});

test("rules that ended (until) or are for another Hebrew year do not run", () => {
  const e = engine(baseState({ rules: [
    rule({ id: 1, name: "Until", doors: ["T101"], until: MON, inc: { wd: W5 }, start: clock("08:00"), end: clock("10:00"), mode: "Unlock" }),
    rule({ id: 2, name: "5788 only", doors: ["T102"], year: 5788, inc: { wd: W5 }, start: clock("08:00"), end: clock("10:00"), mode: "Unlock" }),
  ] }));
  assert.equal(ruleAt(e, "T101", MON, "09:00"), "Until");
  assert.equal(ruleAt(e, "T101", TUE, "09:00"), "Default");
  assert.equal(ruleAt(e, "T102", MON, "09:00"), "Default");
  assert.equal(ruleAt(e, "T102", "2027-10-04", "09:00"), "5788 only");
});

// ---------- the Shabbos magnet ----------
const MAG = { id: "MAG", off: { a: "candles", o: 0 }, on: { a: "rt", o: 10 }, extra: [] };
const offAt = (segs, min) => segs.find((g) => g.a <= min && min < g.b).mode;

test("Shabbos magnet: off from candle lighting until after Rabbeinu Tam", () => {
  const e = engine(baseState());
  const zf = e.zmanim(FRI), zs = e.zmanim(SHABBOS);
  const f = e.output(MAG, FRI), s = e.output(MAG, SHABBOS);
  assert.equal(offAt(f, zf.candles - 1), "On");
  assert.equal(offAt(f, zf.candles), "Off");
  assert.equal(offAt(s, 0), "Off");
  assert.equal(offAt(s, zs.rt + 9), "Off");
  assert.equal(offAt(s, zs.rt + 10), "On");
  assert.deepEqual(e.output(MAG, MON), [{ a: 0, b: 1440, mode: "On" }]);
});

test("Shabbos magnet stays off through two day yom tov running into Shabbos", () => {
  const e = engine(baseState());
  // Pesach 5787: Erev Wed 2027-04-21, yom tov Thu and Fri, then Shabbos
  assert.equal(offAt(e.output(MAG, "2027-04-21"), e.zmanim("2027-04-21").candles), "Off");
  for (const d of ["2027-04-22", "2027-04-23"]) assert.deepEqual(e.output(MAG, d), [{ a: 0, b: 1440, mode: "Off" }], d);
  const z = e.zmanim("2027-04-24");
  assert.equal(offAt(e.output(MAG, "2027-04-24"), z.rt + 9), "Off");
  assert.equal(offAt(e.output(MAG, "2027-04-24"), z.rt + 10), "On");
});

test("Shabbos magnet extra off times on chosen weekdays", () => {
  const e = engine(baseState());
  const segs = e.output({ ...MAG, extra: [{ d: 3, a: 180, b: 361 }] }, "2026-11-25");
  assert.equal(offAt(segs, 179), "On");
  assert.equal(offAt(segs, 180), "Off");
  assert.equal(offAt(segs, 360), "Off");
  assert.equal(offAt(segs, 361), "On");
});

test("a day plan always covers every minute exactly once", () => {
  const st = baseState({ rules: [
    rule({ id: 1, name: "A", doors: ["T101"], inc: { wd: [0, 1, 2, 3, 4, 5, 6] }, start: zman("sunset", -30), end: clock("01:00"), mode: "Unlock" }),
    rule({ id: 2, name: "B", doors: ["T101"], inc: { fest: ["yt_any"] }, start: clock("07:00"), end: zman("havdalah", 30), mode: "Card" }),
  ] });
  const e = engine(st);
  for (let i = 0; i < 400; i += 3) {
    const d = e.addDays("2026-09-01", i), segs = e.day("T101", d);
    assert.equal(segs[0].a, 0); assert.equal(segs[segs.length - 1].b, 1440);
    for (let k = 1; k < segs.length; k++) { assert.equal(segs[k].a, segs[k - 1].b, d); assert.ok(segs[k].a < segs[k].b); }
  }
});
