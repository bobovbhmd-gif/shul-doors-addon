// Independent check of the Jewish calendar and zmanim against hebcal (@hebcal/core,
// the engine behind hebcal.com). The add-on builds its calendar with pyluach
// (calendar/calgen.py) and works out zmanim itself (NOAA formulas in engine/core.js),
// so these are two separate implementations that must agree on every day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as hc from "@hebcal/core";
import { calendar, engine, baseState, APP } from "../helpers.mjs";

const FROM = "2026-01-01", TO = "2030-12-31";
const cal = calendar();
const days = [];
for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2030, 11, 31); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
const greg = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => new Date(Date.UTC(...s.split("-").map((x, i) => (i === 1 ? x - 1 : +x))) + n * 864e5).toISOString().slice(0, 10);

// everything hebcal knows about these years (diaspora)
const events = hc.HebrewCalendar.calendar({ start: greg(addDays(FROM, -40)), end: greg(addDays(TO, 40)), il: false, sedrot: true, noModern: true, behab: true });
const evDate = (e) => isoOf(e.getDate().greg());

// hebcal's answer, in the add-on's day keys
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
function hebcalKeys() {
  const K = new Map(); const add = (d, k) => { if (!K.has(k)) K.set(k, new Set()); K.get(k).add(d); };
  for (const e of events) {
    const d = evDate(e), s = e.getDesc(), f = e.getFlags();
    if (f & hc.flags.CHAG) add(d, "yt_any");
    if (f & hc.flags.CHOL_HAMOED) add(d, "chol_any");
    if (f & hc.flags.BEHAB) add(d, "bhb");
    if (/^Rosh Chodesh /.test(s)) add(d, "rc_any");
    let m;
    if (s === "Erev Rosh Hashana") add(d, "erev_rh");
    else if (/^Rosh Hashana \d{4}$/.test(s)) add(d, "rh1");
    else if (s === "Rosh Hashana II") add(d, "rh2");
    else if (s === "Erev Yom Kippur") add(d, "erev_yk");
    else if (s === "Yom Kippur") add(d, "yk");
    else if (s === "Erev Sukkot") add(d, "erev_succos");
    else if ((m = /^Sukkot (I|II|III|IV|V|VI)( \(CH''M\))?$/.exec(s))) add(d, "succos" + ROMAN[m[1]]);
    else if (s === "Sukkot VII (Hoshana Raba)") add(d, "hoshana_rabba");
    else if (s === "Shmini Atzeret") add(d, "shmini_atzeres");
    else if (s === "Simchat Torah") add(d, "simchas_torah");
    else if (s === "Chanukah: 1 Candle") { add(d, "erev_chanuka"); add(addDays(d, 1), "chanuka1"); }
    else if ((m = /^Chanukah: (\d) Candles$/.exec(s)) && +m[1] <= 7) add(addDays(d, 1), "chanuka" + m[1]);
    else if (s === "Chanukah: 8th Day") add(d, "zos_chanuka");
    else if (s === "Tu BiShvat") add(d, "tub");
    else if (s === "Purim Katan") add(d, "purim_katan");
    else if (s === "Erev Purim") add(d, "erev_purim");
    else if (s === "Purim") add(d, "purim");
    else if (s === "Shushan Purim") add(d, "shushan_purim");
    else if (s === "Ta'anit Esther") add(d, "taanis_esther");
    else if (s === "Erev Pesach") add(d, "erev_pesach");
    else if ((m = /^Pesach (I|II|III|IV|V|VI)( \(CH''M\))?$/.exec(s))) add(d, "pesach" + ROMAN[m[1]]);
    else if (s === "Pesach VII") add(d, "shvii_pesach");
    else if (s === "Pesach VIII") add(d, "acharon_pesach");
    else if (s === "Pesach Sheni") add(d, "pesach_sheni");
    else if (s === "Lag BaOmer") add(d, "lag");
    else if (s === "Erev Shavuot") add(d, "erev_shavuos");
    else if (s === "Shavuot I") add(d, "shavuos1");
    else if (s === "Shavuot II") add(d, "shavuos2");
    else if (/^Tzom Gedaliah/.test(s)) add(d, "tzom_gedalia");
    else if (/^Asara B'Tevet/.test(s)) add(d, "asara_teves");
    else if (/^Tzom Tammuz/.test(s)) add(d, "shiva_asar_tammuz");
    else if (/^Erev Tish'a B'Av/.test(s)) add(d, "erev_tisha_bav");
    else if (/^Tish'a B'Av/.test(s)) add(d, "tisha_bav");
  }
  return K;
}
const HK = hebcalKeys();
const ours = (key) => new Set(days.filter((d) => (cal.cal[d] || []).includes(key)));
const inRange = (set) => new Set([...set].filter((d) => d >= FROM && d <= TO));
function sameDays(ourKey, theirKey = ourKey) {
  const a = ours(ourKey), b = inRange(HK.get(theirKey) || new Set());
  const extra = [...a].filter((d) => !b.has(d)), missing = [...b].filter((d) => !a.has(d));
  assert.ok(b.size > 0, `hebcal has no ${theirKey} days (test mapping is wrong)`);
  assert.deepEqual({ extra, missing }, { extra: [], missing: [] }, `${ourKey}: days that differ from hebcal`);
}

const KEYS = ["erev_rh", "rh1", "rh2", "erev_yk", "yk", "erev_succos", "succos1", "succos2", "succos3", "succos4", "succos5", "succos6",
  "hoshana_rabba", "shmini_atzeres", "simchas_torah", "erev_chanuka", "chanuka1", "chanuka2", "chanuka3", "chanuka4", "chanuka5", "chanuka6",
  "chanuka7", "zos_chanuka", "tub", "purim_katan", "erev_purim", "purim", "shushan_purim", "taanis_esther", "erev_pesach", "pesach1", "pesach2",
  "pesach3", "pesach4", "pesach5", "pesach6", "shvii_pesach", "acharon_pesach", "pesach_sheni", "lag", "erev_shavuos", "shavuos1", "shavuos2",
  "tzom_gedalia", "asara_teves", "shiva_asar_tammuz", "erev_tisha_bav", "tisha_bav", "yt_any", "chol_any", "rc_any"];

test("holidays, fasts and Rosh Chodesh fall on the same days as hebcal, 2026 to 2030", () => {
  for (const k of KEYS) sameDays(k);
});

test("BaHaB days match hebcal", () => {
  const a = new Set(days.filter((d) => (cal.cal[d] || []).some((k) => /^bhb_/.test(k))));
  const b = inRange(HK.get("bhb"));
  assert.deepEqual([...a].sort(), [...b].sort());
});

test("Rosh Chodesh day 1 and day 2", () => {
  const rc = [...inRange(HK.get("rc_any"))].sort();
  for (const d of rc) {
    const two = rc.includes(addDays(d, 1)), second = rc.includes(addDays(d, -1));
    const keys = cal.cal[d] || [];
    if (second) assert.ok(keys.includes("rc2") && !keys.includes("rc1"), `${d} should be Rosh Chodesh day 2`);
    else assert.ok(keys.includes("rc1") && !keys.includes("rc2"), `${d} should be Rosh Chodesh day 1`);
    if (!two) assert.ok(keys.includes("motzaei_rc"), `${d} should be the last day of Rosh Chodesh`);
    assert.ok((cal.cal[addDays(d, -1)] || []).includes("erev_rc") || second, `${addDays(d, -1)} should be Erev Rosh Chodesh`);
  }
});

test("erev yom tov and motzei yom tov keys sit next to yom tov", () => {
  const yt = ours("yt_any");
  for (const d of days) {
    const k = cal.cal[d] || [];
    // erev: tomorrow is yom tov and today is not (Hoshana Rabba and Erev Shvii shel Pesach count)
    const wantErev = yt.has(addDays(d, 1)) && !yt.has(d);
    assert.equal(k.includes("erev_yt_any"), wantErev, `${d} erev yom tov`);
    const wantMotz = yt.has(d) && !yt.has(addDays(d, 1));
    assert.equal(k.includes("motzaei_yt_any"), wantMotz, `${d} motzei yom tov`);
  }
});

test("every day's Hebrew date matches hebcal (engine and calendar file)", () => {
  const e = engine(baseState());
  for (const d of days) {
    const h = new hc.HDate(greg(d));
    const mine = e.raw(`heb(${JSON.stringify(d)})`);
    assert.ok(mine, `no Hebrew date for ${d}`);
    assert.deepEqual({ d: mine.d, m: mine.m, leap: mine.leap }, { d: h.getDate(), m: h.getMonth(), leap: h.isLeapYear() }, `Hebrew date of ${d}`);
  }
});

test("parsha of every Shabbos matches hebcal", () => {
  const names = JSON.parse(execFileSync("python3", ["-c", "import json;from pyluach import parshios;print(json.dumps(parshios.PARSHIOS))"]).toString());
  const theirs = new Map();
  for (const e of events) if (e.getFlags() & hc.flags.PARSHA_HASHAVUA) theirs.set(evDate(e), e.parsha.map((p) => hc.parshiot.indexOf(p)));
  let n = 0;
  for (const d of days) {
    if (new Date(d + "T12:00:00Z").getUTCDay() !== 6) continue;
    const mine = cal.parsha[d] ? cal.parsha[d].split(", ").map((p) => names.indexOf(p)) : null;
    assert.deepEqual(mine, theirs.get(d) || null, `parsha on ${d} (${cal.parsha[d] || "none"})`);
    n++;
  }
  assert.ok(n > 250);
});

test("Shovavim: Sunday to Friday of the weeks of Shemos to Mishpatim (to Tetzaveh in a leap year)", () => {
  const sv = new Set(["Shemot", "Vaera", "Bo", "Beshalach", "Yitro", "Mishpatim"]);
  const leapAdd = new Set(["Terumah", "Tetzaveh"]);
  const want = new Set();
  for (const e of events) {
    if (!(e.getFlags() & hc.flags.PARSHA_HASHAVUA)) continue;
    const leap = e.getDate().isLeapYear();
    if (e.parsha.some((p) => sv.has(p) || (leap && leapAdd.has(p)))) for (let i = 1; i <= 6; i++) want.add(addDays(evDate(e), -i));
  }
  const a = ours("shovavim"), b = inRange(want);
  assert.deepEqual([...a].sort(), [...b].sort());
});

test("periods: Elul, Aseres Yemei Teshuva, Sefira, Three Weeks, Nine Days", () => {
  for (const d of days) {
    const h = new hc.HDate(greg(d)), m = h.getMonth(), dd = h.getDate(), k = cal.cal[d] || [];
    const abs = h.abs();
    assert.equal(k.includes("elul"), m === hc.months.ELUL && dd <= 29, `${d} elul`);
    assert.equal(k.includes("aseres_yemei"), m === hc.months.TISHREI && dd <= 10, `${d} aseres yemei teshuva`);
    const om = abs - new hc.HDate(15, hc.months.NISAN, h.getFullYear()).abs();
    assert.equal(k.includes("sefira"), om >= 1 && om <= 49, `${d} sefira`);
    const tw = abs - new hc.HDate(17, hc.months.TAMUZ, h.getFullYear()).abs();
    const tbav = new hc.HDate(9, hc.months.AV, h.getFullYear()).abs() - new hc.HDate(17, hc.months.TAMUZ, h.getFullYear()).abs();
    assert.equal(k.includes("three_weeks"), tw >= 0 && tw <= tbav, `${d} three weeks`);
    assert.equal(k.includes("nine_days"), m === hc.months.AV && dd <= 9, `${d} nine days`);
  }
});

// ---------- zmanim ----------
const GEO = new hc.GeoLocation(null, 40.633, -73.997, 0, "America/New_York");
const nyMin = (dt) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(dt);
  const g = (t) => +p.find((x) => x.type === t).value;
  return g("hour") * 60 + g("minute") + g("second") / 60;
};
test("zmanim are within a minute of hebcal on every day, including clock change days", () => {
  const e = engine(baseState());
  const worst = {};
  for (const d of days) {
    const z = new hc.Zmanim(GEO, greg(d), false), mine = e.zmanim(d);
    const theirs = { alos: z.alotHaShachar(), sunrise: z.sunrise(), chatzos: z.chatzot(), plag: z.plagHaMincha(), sunset: z.sunset(), tzeis: z.tzeit(8.5) };
    for (const [k, v] of Object.entries(theirs)) {
      const diff = Math.abs(mine[k] - nyMin(v));
      worst[k] = Math.max(worst[k] || 0, diff);
      assert.ok(diff <= 1, `${k} on ${d}: ours ${mine[k]}, hebcal ${nyMin(v).toFixed(2)}`);
    }
    assert.equal(mine.candles, mine.sunset - 18, "candle lighting is 18 minutes before shkiah");
    assert.equal(mine.havdalah, mine.sunset + 72);
    assert.equal(mine.rt, mine.sunset + 72);
  }
});

test("candle lighting and havdalah (72 minutes) for each Shabbos and yom tov match hebcal", () => {
  const e = engine(baseState());
  const ev = hc.HebrewCalendar.calendar({ start: greg(FROM), end: greg(TO), il: false, candlelighting: true, location: new hc.Location(40.633, -73.997, false, "America/New_York", "Test", "US"), candleLightingMins: 18, havdalahMins: 72, noModern: true });
  let n = 0;
  for (const x of ev) {
    const desc = x.getDesc();
    if (desc !== "Candle lighting" && desc !== "Havdalah") continue;
    const t = x.eventTime, d = evDate(x), z = e.zmanim(d);
    const theirs = nyMin(t), mine = desc === "Candle lighting" ? z.candles : z.havdalah;
    // a candle lighting at tzeis (second night of yom tov) is not ours: the box only uses candle lighting before shkiah
    if (desc === "Candle lighting" && theirs > z.sunset) continue;
    assert.ok(Math.abs(mine - theirs) <= 1, `${desc} on ${d}: ours ${mine}, hebcal ${theirs.toFixed(2)}`);
    n++;
  }
  assert.ok(n > 400, "checked " + n);
});

test("summer clock and winter clock days", () => {
  const e = engine(baseState());
  // second Sunday in March to first Sunday in November
  for (const y of [2026, 2027, 2028, 2029, 2030]) {
    const sun = (m, n) => { const d = new Date(Date.UTC(y, m - 1, 1)); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); d.setUTCDate(d.getUTCDate() + 7 * (n - 1)); return d.toISOString().slice(0, 10); };
    const on = sun(3, 2), off = sun(11, 1);
    assert.equal(e.raw(`isDST("${addDays(on, -1)}")`), false, `${y} day before summer clock`);
    assert.equal(e.raw(`isDST("${on}")`), true, `${y} summer clock starts ${on}`);
    assert.equal(e.raw(`isDST("${addDays(off, -1)}")`), true);
    assert.equal(e.raw(`isDST("${off}")`), false, `${y} winter clock starts ${off}`);
  }
});

test("US legal holidays on the observed day", () => {
  const e = engine(baseState());
  const want = {
    "2027-01-01": "us_newyear", "2027-01-18": "us_mlk", "2027-02-15": "us_presidents", "2027-05-31": "us_memorial", "2027-06-18": "us_juneteenth",
    "2027-07-05": "us_july4", "2027-09-06": "us_labor", "2027-10-11": "us_columbus", "2027-11-11": "us_veterans", "2027-11-25": "us_thanksgiving",
    "2027-12-24": "us_christmas", "2027-12-31": "us_newyear", "2026-07-03": "us_july4", "2026-11-26": "us_thanksgiving", "2028-11-23": "us_thanksgiving",
  };
  for (const [d, k] of Object.entries(want)) assert.ok(e.info(d).keys.includes(k), `${k} on ${d}`);
  assert.ok(!e.info("2027-07-04").keys.includes("us_july4"), "July 4 on a Sunday moves to Monday");
  assert.ok(!e.info("2027-12-25").keys.includes("us_christmas"), "Christmas on Shabbos moves to Friday");
});

test("the calendar generator covers the whole range and starts where it says", () => {
  const c = calendar("2026-11-01", "2027-01-31");
  assert.equal(c.start, "2026-11-01");
  assert.equal(c.heb.length, 92);
  assert.ok(Object.keys(c.cal).every((d) => d >= "2026-11-01" && d <= "2027-01-31"));
  void APP;
});
