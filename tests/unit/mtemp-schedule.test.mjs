// Writing the mikva thermostats' weekly schedules (lib/mtemp.js) to a pretend Meross thermostat behind a
// pretend Home Assistant. Meross counts degrees C in tenths or hundredths depending on the model; in Nov 2026
// a wrong guess wrote 15 Ave hot's schedule ten times too small (3.39°C), so it sat at its 41°F minimum.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appRequire, ny } from "../helpers.mjs";

const { createMtemp } = appRequire("lib/mtemp.js");
const toC = (f) => (f - 32) * 5 / 9, toF = (c) => c * 9 / 5 + 32;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEK = Object.fromEntries(DAYS.map((d) => [d, [[0, 93], [120, 106], [630, 68], [1170, 68]]]));
const NOW = ny("2026-11-26 10:00");   // a Thursday: the schedule says 106° right now

// a pretend MTS960: `scale` is how it really counts; `reportScale` is how its water temperature is reported
function fakeHome({ scale = 100, reportScale = scale, water = 93, staleTarget = 500, hand = false, answer = true } = {}) {
  const dev = { raw: null, sets: 0 };
  const slotNow = () => {
    if (!dev.raw) return null;
    const rows = dev.raw.thu; let t = 0;
    for (const [mins, v] of rows) { if (mins > 0 && 600 >= t && 600 < t + mins) return v; t += mins; }
    return rows[0][1];
  };
  const setF = () => { if (hand || !dev.raw) return 106; const c = Math.max(5, slotNow() / scale); return Math.round(toF(c) * 10) / 10; };   // never below its 5°C minimum
  const state = () => ({ entity_id: "climate.mts960_15_hot", state: "heat", attributes: { friendly_name: "Mikva 15 Ave hot", current_temperature: water, temperature: setF(), preset_mode: hand ? "heating" : "schedule_heating", min_temp: 41, max_temp: 110 } });
  const fetchImpl = async (url, opts = {}) => {
    const u = url.replace("http://ha/api", ""), j = (x) => ({ ok: true, json: async () => x });
    if (u === "/config") return j({ unit_system: { temperature: "°F" } });
    if (u === "/states") return j([state()]);
    if (u.startsWith("/states/")) return j(state());
    if (u.startsWith("/services/meross_lan/request")) {
      const b = JSON.parse(opts.body), ack = (payload) => j({ service_response: { response: { header: { method: b.method + "ACK" }, payload } } });
      if (b.namespace.endsWith("ModeB")) return ack(answer ? { modeB: [{ channel: 0, currentTemp: Math.round(toC(water) * reportScale), targetTemp: staleTarget }] } : { modeB: [{ channel: 0 }] });
      if (b.namespace.endsWith("ScheduleB") && b.method === "GET") return ack({ scheduleB: [{ channel: 0, section: 6, ...(dev.raw || Object.fromEntries(DAYS.map((d) => [d, [[1440, 2000], [0, 2000], [0, 2000], [0, 2000], [0, 2000], [0, 2000]]]))) }] });
      if (b.namespace.endsWith("ScheduleB") && b.method === "SET") { const { channel, ...days } = b.payload.scheduleB[0]; dev.raw = days; dev.sets++; return ack({}); }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const mt = createMtemp({ haUrl: "http://ha/api", token: "x", fetchImpl, now: () => NOW, settleMs: 0, areas: async () => ({ "climate.mts960_15_hot": { area: "Mikva 15 Ave hot", uuid: "u15" } }) });
  return { mt, dev };
}
const tempsF = (raw, scale) => raw.thu.filter((r) => r[0] > 0).map((r) => Math.round(toF(r[1] / scale)));

test("a thermostat counting in hundredths gets 93, 106, 68 (not ten times too small), even with an old target from a change by hand", async () => {
  const { mt, dev } = fakeHome({ scale: 100, staleTarget: 500 });
  const [x] = await mt.list();
  await mt.setSchedule(x, WEEK);
  assert.deepEqual(tempsF(dev.raw, 100), [93, 106, 68, 68]);
  assert.equal(dev.raw.thu[1][1], 4111, "106°F = 41.11°C, in hundredths");
  const back = await mt.getSchedule(x);
  assert.deepEqual(back.week.thu.map((e) => e[1]), [93, 106, 68, 68]);
});

test("a thermostat counting in tenths gets the same temperatures", async () => {
  const { mt, dev } = fakeHome({ scale: 10, staleTarget: 50 });
  const [x] = await mt.list();
  await mt.setSchedule(x, WEEK);
  assert.deepEqual(tempsF(dev.raw, 10), [93, 106, 68, 68]);
  assert.equal(dev.raw.thu[1][1], 411);
});

test("when the thermostat's numbers don't settle it, nothing is written", async () => {
  const { mt, dev } = fakeHome({ answer: false });
  const [x] = await mt.list();
  await assert.rejects(mt.setSchedule(x, WEEK), /Couldn't tell how 15 Ave hot counts degrees/);
  assert.equal(dev.sets, 0);
});

test("if the thermostat doesn't show the schedule's temperature after writing, it's reported, not hidden", async () => {
  // the water temperature misleads (reported in tenths, but the schedule counts in hundredths): the old failure
  const { mt, dev } = fakeHome({ scale: 100, reportScale: 10, staleTarget: 50 });
  const [x] = await mt.list();
  await assert.rejects(mt.setSchedule(x, WEEK), /the thermostat now shows 41° where the schedule says 106°/);
  assert.equal(dev.sets, 1);
});

test("a thermostat set by hand right now isn't checked against the schedule", async () => {
  const { mt, dev } = fakeHome({ scale: 100, hand: true });
  const [x] = await mt.list();
  await mt.setSchedule(x, WEEK);
  assert.equal(dev.sets, 1);
});
