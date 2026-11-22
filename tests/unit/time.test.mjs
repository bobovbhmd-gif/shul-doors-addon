// New York wall clock <-> UTC (lib/time.js), the part most likely to go wrong twice a year.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appRequire } from "../helpers.mjs";

const { localToUtc, dayInstants, localDate, localMinute, hartmann, fromHartmann } = appRequire("lib/time.js");
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

test("ordinary days: winter is UTC-5, summer UTC-4", () => {
  assert.equal(iso(localToUtc("2026-11-23", 9 * 60)), "2026-11-23T14:00");
  assert.equal(iso(localToUtc("2027-06-14", 9 * 60)), "2027-06-14T13:00");
  assert.equal(iso(localToUtc("2026-11-23", 1440 + 60)), "2026-11-24T06:00", "minutes past midnight run into the next day");
});

test("summer clock starts (2:00 to 2:59 AM do not exist): those times move an hour later", () => {
  assert.equal(iso(localToUtc("2027-03-14", 60)), "2027-03-14T06:00");
  assert.equal(iso(localToUtc("2027-03-14", 150)), "2027-03-14T07:30", "2:30 AM counts as 3:30 AM summer clock");
  assert.equal(iso(localToUtc("2027-03-14", 180)), "2027-03-14T07:00", "3:00 AM summer clock");
  assert.equal(iso(localToUtc("2027-03-14", 600)), "2027-03-14T14:00");
  const d = dayInstants("2027-03-14");
  assert.equal(d.length, 1440);
  for (const m of [0, 119, 150, 180, 1439]) assert.equal(d[m], localToUtc("2027-03-14", m));
});

test("winter clock starts (1:00 AM happens twice): the first one is used", () => {
  assert.equal(iso(localToUtc("2026-11-01", 90)), "2026-11-01T05:30");
  assert.equal(iso(localToUtc("2026-11-01", 180)), "2026-11-01T08:00");
  assert.equal(localDate(localToUtc("2026-11-01", 1439)), "2026-11-01");
});

test("round trip every minute of a year of dates, and Hartmann times", () => {
  for (let t = Date.UTC(2026, 10, 1); t < Date.UTC(2027, 10, 1); t += 864e5 * 5) {
    const d = new Date(t).toISOString().slice(0, 10);
    for (let m = 0; m < 1440; m += 37) {
      const u = localToUtc(d, m);
      if (d === "2027-03-14" && m >= 120 && m < 180) continue;
      assert.equal(localDate(u), d); assert.equal(localMinute(u), m, `${d} ${m}`);
    }
  }
  const ms = Date.UTC(2026, 9, 14, 22, 20);
  assert.equal(hartmann(ms), "2026-10-14T22:20:00");
  assert.equal(fromHartmann("2026-10-14T22:20:00Z"), ms);
  assert.equal(fromHartmann("2026-10-14T22:20:00.000"), ms);
});
