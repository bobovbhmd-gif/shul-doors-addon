"use strict";
// Outputs (relays), for now the Shabbos magnet. Protector.Net has no one-time
// overrides for outputs, so the box rewrites the output's weekly schedule every run
// with the coming 7 days: Off from candle lighting until after Shabbos or yom tov.
// Its schedule as it was before the box first changed it is kept, and put back when
// the output is taken off the pilot list.
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_OUTPUTS = [{ id: "MAG", name: "Shabbos magnet", zone: "MAG SHABBOS OFF", where: "Output 3, Panel 04",
  off: { a: "candles", o: 0 }, on: { a: "rt", o: 10 }, extra: [{ d: 3, a: 180, b: 361 }, { d: 4, a: 180, b: 420 }] }];

const outputsOf = (state) => (Array.isArray(state.outputs) ? state.outputs : DEFAULT_OUTPUTS);

// [{DayOfWeek, StartTime, StopTime, Mode}] for the next 7 days, minutes inclusive
function weekOf(engine, o, today) {
  const spans = [];
  for (let k = 0; k < 7; k++) {
    const date = engine.addDays(today, k);
    for (const g of engine.output(o, date)) spans.push({ DayOfWeek: DOW[engine.dow(date)], StartTime: g.a, StopTime: g.b - 1, Mode: g.mode });
  }
  return spans.sort((x, y) => DOW.indexOf(x.DayOfWeek) - DOW.indexOf(y.DayOfWeek) || x.StartTime - y.StartTime);
}
// what Protector.Net reports, in the same shape
function normal(spans) {
  return (spans || []).filter((x) => !x.DeletedOn).map((x) => ({ DayOfWeek: x.DayOfWeek, StartTime: x.StartMinFromMidnight ?? x.StartTime, StopTime: x.StopMinFromMidnight ?? x.StopTime, Mode: x.TimeSpanState ?? x.Mode }))
    .sort((x, y) => DOW.indexOf(x.DayOfWeek) - DOW.indexOf(y.DayOfWeek) || x.StartTime - y.StartTime);
}
const key = (sp) => JSON.stringify(normal(sp));
const t = (m) => { const h = Math.floor(m / 60) % 24, mi = m % 60; return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
function plainWeek(spans) {
  return DOW.map((d) => { const day = normal(spans).filter((x) => x.DayOfWeek === d);
    return `${d.slice(0, 3)}: ` + (day.length ? day.map((x) => `${t(x.StartTime)} to ${t(x.StopTime)} ${x.Mode}`).join("; ") : "nothing set"); });
}

async function syncOutputs({ client, engine, state, store, mode, pilotDoors, report, act, write }) {
  const outs = outputsOf(state);
  if (!outs.length || typeof client.outputZones !== "function") return false;
  let changed = false;
  const zones = await client.outputZones();
  store.outputOriginal = store.outputOriginal || {};
  store.outputWritten = store.outputWritten || {};
  report.outputs2 = [];
  for (const o of outs) {
    const z = zones.find((x) => x.Name === o.zone || String(x.Id) === String(o.zone));
    if (!z) { if (zones.length) report.warnings.push(`${o.name}: no output schedule called "${o.zone}" in Protector.Net`); continue; }
    const now = normal(await client.outputZoneSpans(z.Id));
    if (store.outputOriginal[o.id] === undefined && !store.outputWritten[o.id]) store.outputOriginal[o.id] = now;   // before we ever touch it
    const managed = mode === "live" || mode === "practice" || (mode === "pilot" && pilotDoors.includes(o.id));   // practice only shows what it would do
    const want = weekOf(engine, o, engine.today());
    const info = { mode, id: o.id, name: o.name, zone: z.Name, managed, want: plainWeek(want), now: plainWeek(now), same: key(now) === key(want) };
    report.outputs2.push(info);
    if (managed && !info.same) {
      if ((await act(`rewrite ${o.name} schedule (${z.Name})`, () => client.setOutputZoneSpans(z.Id, want))) !== undefined && write) {
        store.outputWritten[o.id] = true; changed = true;
        const back = normal(await client.outputZoneSpans(z.Id));
        info.same = key(back) === key(want);
        if (!info.same) report.warnings.push(`${o.name}: after writing, Protector.Net still shows a different schedule. Check it in Protector.Net.`);
      }
    } else if (!managed && store.outputWritten[o.id] && store.outputOriginal[o.id]) {
      // taken off the list: put back what it had before
      if (key(now) !== key(store.outputOriginal[o.id])) {
        if ((await act(`put ${o.name} back on its original schedule`, () => client.setOutputZoneSpans(z.Id, store.outputOriginal[o.id]))) !== undefined && write) changed = true;
      }
      if (write && !report.errors.length) delete store.outputWritten[o.id];
    }
  }
  return changed;
}
function outputReportLines(list) {
  if (!list || !list.length) return [];
  const out = [];
  for (const o of list) {
    out.push(`${o.name} (${o.zone}): ${o.mode === "practice" ? "practice, not changed" : o.managed ? "run by the box" : "not run by the box yet (add " + o.id + " to pilot_doors)"}, ${o.same ? "matches the rules" : "differs from the rules"}`);
    out.push("  Rules, next 7 days:", ...o.want.map((x) => "    " + x));
    if (!o.same) out.push("  In Protector.Net now:", ...o.now.map((x) => "    " + x));
  }
  return [...out, ""];
}
module.exports = { syncOutputs, outputReportLines, weekOf, DEFAULT_OUTPUTS, outputsOf };
