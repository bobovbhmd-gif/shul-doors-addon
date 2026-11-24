// Bringing the panels in line (lib/sync.js) against a pretend Protector.Net that
// refuses overlapping overrides, more than 32 per door and broken weekly schedules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { engine, baseState, rule, clock, zman, W5, appRequire, ny } from "../helpers.mjs";
import { fakeProtector, fromHartmann } from "../fakes/protector.mjs";

const { sync, TAG } = appRequire("lib/sync.js");

const DOORS = [{ Id: 11, Name: "T101 Front" }, { Id: 12, Name: "T102 Side" }, { Id: 21, Name: "T201 Lobby" }, { Id: 31, Name: "T301 Back" }];
function st() {
  return baseState({
    outputs: [{ id: "MAG", name: "Test magnet", zone: "MAG ZONE", off: { a: "candles", o: 0 }, on: { a: "rt", o: 10 }, extra: [] }],
    events: [{ id: "e1", name: "A wedding", type: "Wedding", from: "2026-12-01", to: "2026-12-01" }],
    rules: [
      rule({ id: 1, name: "Shacharis", doors: ["g:main", "T301"], inc: { wd: W5 }, exc: { fest: ["yt_any"] }, start: clock("05:45"), end: clock("09:30"), mode: "Unlock" }),
      rule({ id: 2, name: "Mincha", doors: ["g:main"], inc: { wd: W5 }, start: zman("sunset", -30), end: clock("22:30"), mode: "Unlock" }),
      rule({ id: 3, name: "Chanuka", doors: ["T301"], inc: { fest: ["chanuka1", "chanuka2", "chanuka3", "chanuka4", "chanuka5", "chanuka6", "chanuka7", "zos_chanuka"] }, start: zman("sunset", 0), end: clock("21:00"), mode: "Unlock" }),
      rule({ id: 4, name: "Wedding", doors: ["g:main"], inc: { fest: ["type:Wedding"] }, start: clock("17:00"), end: clock("01:00"), mode: "Card" }),
    ],
  });
}
async function run(client, state, store, mode, at = "2026-11-29 00:30", extra = {}) {
  const e = engine(state, at), now = ny(at);
  client.db.now = now;
  return sync({ client, engine: e, state, store, now, mode, horizonDays: 30, budget: 24, ...extra });
}
const writeNames = (c) => c.writes().map((x) => x[0]);

test("practice mode never writes anything, and says what it would do", async () => {
  const c = fakeProtector({ doors: DOORS, outputs: [{ zone: "MAG ZONE" }] });
  const r = await run(c, st(), {}, "practice");
  assert.deepEqual(writeNames(c), []);
  assert.ok(r.actions.some((a) => /create weekly schedule for T101 Front/.test(a)));
  assert.ok(r.actions.some((a) => /add Card override on T101 Front/.test(a)));
  assert.equal(r.ok, true);
});

test("live: makes one weekly schedule per door, points the door at it, loads the overrides, updates the panels", async () => {
  const c = fakeProtector({ doors: DOORS, outputs: [{ zone: "MAG ZONE" }] }), store = {};
  const r = await run(c, st(), store, "live");
  assert.deepEqual(r.errors, []);
  for (const d of DOORS) {
    const tz = c.db.tzs.find((t) => t.Description === `${TAG}door:${d.Id}`);
    assert.ok(tz, d.Name);
    assert.equal(tz.Name, `SD ${d.Name}`);
    assert.equal(c.db.doors.find((x) => x.Id === d.Id).DoorTimeZoneId, tz.Id);
    assert.equal(store.original[d.Id], 1, "the old schedule is remembered");
  }
  assert.equal(c.db.panelsUpdated, 1);
  assert.ok(c.db.otrs.length > 0);
  assert.ok(c.db.otrs.every((o) => o.Description.startsWith(TAG)));
  assert.deepEqual(r.compare.differ, [], "reading back matches the rules minute by minute");
  assert.ok(c.db.outputs[0].TimeSpans.some((s) => s.Mode === "Off"), "the magnet's week was written");
});

test("live a second time changes nothing", async () => {
  const c = fakeProtector({ doors: DOORS, outputs: [{ zone: "MAG ZONE" }] }), store = {}, s = st();
  await run(c, s, store, "live");
  const before = c.writes().length;
  const r = await run(c, s, store, "live", "2026-11-29 01:30");
  assert.deepEqual(c.writes().slice(before), [], r.actions.join("\n"));
});

test("overrides sent to one door never overlap on the panel (stop is the last minute), through a busy month", async () => {
  const c = fakeProtector({ doors: DOORS }), store = {}, s = st();
  s.overrides = [{ id: "h1", doors: ["T101"], mode: "Lockdown", from: ny("2026-12-01 16:59"), to: ny("2026-12-01 17:31") }];
  for (const at of ["2026-11-29 00:30", "2026-11-30 00:30", "2026-12-01 17:10", "2026-12-02 00:30", "2026-12-06 00:30", "2026-12-13 00:30"]) {
    const r = await run(c, s, store, "live", at);
    assert.deepEqual(r.errors, [], at);   // the fake throws on any overlap or over 32
  }
  const t101 = c.db.otrs.filter((o) => o.DoorId === 11).map((o) => [fromHartmann(o.StartTime), fromHartmann(o.StopTime)]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < t101.length; i++) assert.ok(t101[i][0] >= t101[i - 1][1] + 60000, "at least a minute apart");
});

test("overrides people made in Protector.Net are never touched, and count toward the 32", async () => {
  const c = fakeProtector({ doors: DOORS }), store = {};
  for (let i = 0; i < 30; i++) {
    const a = ny("2027-01-04 08:00") + i * 864e5;
    c.db.otrs.push({ Id: 9000 + i, Name: "their own", Description: "made by hand", Mode: "Unlock", StartTime: new Date(a).toISOString().slice(0, 19), StopTime: new Date(a + 3600e3).toISOString().slice(0, 19), DoorId: 31, DoorName: "T301 Back" });
  }
  const r = await run(c, st(), store, "live");
  assert.deepEqual(r.errors, []);
  assert.equal(c.db.otrs.filter((o) => o.Description === "made by hand").length, 30);
  assert.ok(c.db.otrs.filter((o) => o.DoorId === 31 && o.Description.startsWith(TAG)).length <= 2);
  assert.ok(r.warnings.some((w) => /T301: override budget full/.test(w)));
});

test("pilot only runs the pilot doors (and the magnet only when listed)", async () => {
  const c = fakeProtector({ doors: DOORS, outputs: [{ zone: "MAG ZONE", spans: [] }] }), store = {};
  const r = await run(c, st(), store, "pilot", undefined, { pilotDoors: ["T301"] });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(c.db.doors.filter((d) => d.DoorTimeZoneId !== 1).map((d) => d.Id), [31]);
  assert.ok(c.db.otrs.every((o) => o.DoorId === 31));
  assert.deepEqual(c.db.outputs[0].TimeSpans, [], "magnet not on the pilot list");
  await run(c, st(), store, "pilot", "2026-11-29 01:30", { pilotDoors: ["T301", "MAG"] });
  assert.ok(c.db.outputs[0].TimeSpans.length > 0);
  const w = await run(c, st(), store, "pilot", "2026-11-29 02:30", { pilotDoors: ["T301", "T999"] });
  assert.ok(w.warnings.some((x) => /Pilot doors not found: T999/.test(x)));
});

test("restore puts every door back on its old schedule and removes only our schedules and overrides", async () => {
  const c = fakeProtector({ doors: DOORS, outputs: [{ zone: "MAG ZONE", spans: [{ DayOfWeek: "Sunday", StartTime: 0, StopTime: 1439, Mode: "On" }] }] }), store = {};
  c.db.otrs.push({ Id: 8000, Name: "theirs", Description: "", Mode: "Unlock", StartTime: "2026-12-20T13:00:00", StopTime: "2026-12-20T13:59:00", DoorId: 11 });
  await run(c, st(), store, "live");
  assert.ok(c.db.otrs.length > 1);
  const r = await run(c, st(), store, "restore", "2026-11-29 01:30");
  assert.deepEqual(r.errors, []);
  assert.ok(c.db.doors.every((d) => d.DoorTimeZoneId === 1));
  assert.deepEqual(c.db.otrs.map((o) => o.Id), [8000]);
  assert.ok(!c.db.tzs.some((t) => (t.Description || "").startsWith(TAG)));
  assert.deepEqual(c.db.outputs[0].TimeSpans, [{ DayOfWeek: "Sunday", StartTime: 0, StopTime: 1439, Mode: "On" }], "magnet schedule put back");
});

test("safety: more than 3 doors dropping off the list at once are not put back automatically", async () => {
  const c = fakeProtector({ doors: DOORS }), store = {}, s = st();
  await run(c, s, store, "live");
  const few = { ...s, doors: [{ id: "T999", name: "T999", def: "Card or Pin" }] };
  const before = c.writes().length;
  const r = await run(c, few, store, "live", "2026-11-29 01:30");
  assert.ok(r.warnings.some((w) => /4 doors are no longer on the list/.test(w)));
  assert.ok(!c.writes().slice(before).some(([n]) => n === "setDoorTimeZone" || n === "deleteOtr" || n === "deleteTimeZone"));
});

test("a door named twice in Protector.Net is left alone", async () => {
  const c = fakeProtector({ doors: [...DOORS, { Id: 99, Name: "T101 Copy" }] }), store = {};
  const r = await run(c, st(), store, "live");
  assert.ok(r.warnings.some((w) => /2 doors in Protector.Net start with T101/.test(w)));
  assert.ok(!c.db.otrs.some((o) => o.DoorId === 11 || o.DoorId === 99));
  assert.equal(c.db.doors.find((d) => d.Id === 11).DoorTimeZoneId, 1);
});

test("a failed push to the panels is tried again on the next run", async () => {
  const c = fakeProtector({ doors: DOORS }), store = {}, s = st();
  c.db.fail.updatePanels = "panel offline";
  const r = await run(c, s, store, "live");
  assert.equal(r.ok, false);
  assert.equal(store.needUpdate, true);
  delete c.db.fail.updatePanels;
  await run(c, s, store, "live", "2026-11-29 01:30");
  assert.equal(c.db.panelsUpdated, 1);
  assert.equal(store.needUpdate, false);
});
