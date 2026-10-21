"use strict";
// Brings the panels in line with the plan. Safe by design:
//  - practice mode only reads and writes down what it WOULD do;
//  - it only ever touches doors on the managed list, and only its own Door Time
//    Zones and overrides (tagged "shuldoors:" in their description);
//  - overrides people made by hand in Protector.Net are never touched;
//  - every door's original schedule is remembered so it can be put back.
const { plan } = require("./planner");
const { hartmann, fromHartmann } = require("./time");

const TAG = "shuldoors:";
const tzTag = (pid) => `${TAG}door:${pid}`;
const otrTag = (pid, reason) => `${TAG}door:${pid}:${reason}`;
const ourId = (protectorName) => String(protectorName || "").trim().split(/\s+/)[0];
const FMT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const when = (ms) => (ms > Date.now() + 300 * 864e5 ? "until ended" : FMT.format(ms));
const minute = (ms) => Math.floor(ms / 60000) * 60000;
// Protector.Net override stop times are the LAST minute the override runs (6:00 to
// 6:59, then the next one starts 7:00; two overrides on a door may not overlap).
// Here a stop is the minute after, so pieces join exactly; convert at the edge.
const readStop = (s) => fromHartmann(s) + 60000;
const sendStop = (ms) => hartmann(minute(ms) - 60000);
const sameSpans = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
// Read-back spans name the mode TimeSpanState; written ones use Mode. What comes
// back from a real server may differ in shape (day as a number, times as "06:30",
// mode as a display name or a number), so everything is brought to one form.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MODES = ["Lockdown", "Card", "Pin", "CardOrPin", "CardAndPin", "Unlock", "UnlockWithFirstCardIn", "DualCard"];
const MODE_ALIAS = { firstcredentialin: "UnlockWithFirstCardIn", firstcardin: "UnlockWithFirstCardIn", dualcredential: "DualCard", open: "Unlock", unlocked: "Unlock", locked: "Lockdown",
  cardonly: "Card", pinonly: "Pin" };
const key = (v) => String(v).toLowerCase().replace(/[^a-z]/g, "");
function dayName(v) {
  if (typeof v === "number" || /^\d+$/.test(String(v))) return DAYS[Number(v) % 7];
  return DAYS.find((d) => key(d) === key(v) || key(d).slice(0, 3) === key(v)) || String(v);
}
function minutes(v) {
  if (typeof v === "number") return v;
  const t = String(v ?? "");
  if (/^\d+$/.test(t)) return Number(t);
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t); if (m) return +m[1] * 60 + +m[2];
  m = /T(\d{1,2}):(\d{2})/.exec(t); if (m) return +m[1] * 60 + +m[2];
  m = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(t); if (m && (m[1] || m[2])) return (+m[1] || 0) * 60 + (+m[2] || 0);
  return NaN;
}
function modeName(v, legend) {
  if (v == null) return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) { const l = legend && legend[Number(v)]; return l ? modeName(l, null) : String(v); }
  return MODES.find((x) => key(x) === key(v)) || MODE_ALIAS[key(v)] || String(v);
}
// Real servers read back {DayOfWeek, DayOfWeekVal, StartMinFromMidnight, StopMinFromMidnight, TimeSpanState, TimeSpanStateVal}.
const normSpan = (x, legend) => ({ d: dayName(x.DayOfWeek ?? x.DayOfWeekVal), a: minutes(x.StartTime ?? x.StartMinFromMidnight), b: minutes(x.StopTime ?? x.StopMinFromMidnight),
  m: modeName(x.Mode ?? x.TimeSpanState ?? x.TimeSpanStateVal, legend) });
const norm = (s) => (s || []).filter((x) => !x.DeletedOn).map((x) => { const n = normSpan(x); return [n.d, n.a, n.b, n.m]; }).sort((p, q) => String(p).localeCompare(String(q)));

async function sync({ client, engine, state, store, now = Date.now(), mode = "practice", pilotDoors = [], horizonDays = 30, budget = 24, log = () => {} }) {
  const write = mode !== "practice";
  const report = { at: now, mode, actions: [], warnings: [], loadedThrough: {}, errors: [] };
  const act = async (what, fn) => {
    report.actions.push(what);
    if (!write) return null;
    try { return await fn(); } catch (e) { report.errors.push(`${what}: ${e.message}`); log("error", `${what}: ${e.message}`); return undefined; }
  };

  // 1. What the panels have now
  const pdoors = await client.doors();
  if (!pdoors.length) throw new Error("Protector.Net returned no doors; nothing changed");
  // Match our doors (D301...) to Protector.Net doors. The first match by name is
  // remembered by its Protector.Net number, so renaming a door there doesn't drop
  // it; two doors with the same number in their name are never guessed between.
  const byOur = new Map(), nameToPid = new Map(), taken = new Set();
  for (const d of pdoors) nameToPid.set(d.Name, d.Id);
  store.pidOf = store.pidOf || {};
  const missing = [], dup = new Set();
  for (const { id } of state.doors) {
    const remembered = pdoors.find((d) => d.Id === store.pidOf[id]);
    const byName = pdoors.filter((d) => ourId(d.Name) === id);
    let d = null;
    if (remembered) {
      d = remembered;
      if (ourId(remembered.Name) !== id) report.warnings.push(`${id} is now called "${remembered.Name}" in Protector.Net. Still running it; rename it back or update the portal.`);
    } else if (byName.length === 1) d = byName[0];
    else if (byName.length > 1) { report.warnings.push(`${byName.length} doors in Protector.Net start with ${id} (${byName.map((x) => x.Name).join(", ")}). Not touching ${id} until only one does.`); dup.add(id); continue; }
    if (!d) { missing.push(id); continue; }
    if (taken.has(d.Id)) { report.warnings.push(`${id} matches a door already used by another entry; skipped.`); continue; }
    taken.add(d.Id); byOur.set(id, d); store.pidOf[id] = d.Id;
  }
  const known = state.doors.map((d) => d.id).filter((id) => byOur.has(id));
  if (missing.length) report.warnings.push(`Not found in Protector.Net: ${missing.join(", ")}`);
  if (mode === "pilot") { const unknown = pilotDoors.filter((id) => !known.includes(id) && !dup.has(id)); if (unknown.length) report.warnings.push(`Pilot doors not found: ${unknown.join(", ")}. Check the spelling in the add-on settings.`); }
  const managed = mode === "restore" ? [] : mode === "pilot" ? known.filter((id) => pilotDoors.includes(id)) : known;

  const tzs = await client.timeZones();
  const otrs = (await client.otrs()).map((o) => ({ id: o.Id, name: o.Name, desc: o.Description || "", mode: o.Mode,
    start: fromHartmann(o.StartTime), stop: readStop(o.StopTime), pid: o.DoorId || nameToPid.get(o.DoorName) }));

  const foreignActive = {}, foreign = {};
  const ourOf = new Map([...byOur].map(([id, d]) => [d.Id, id]));
  for (const o of otrs) if (!o.desc.startsWith(TAG) && o.stop > now && o.pid != null) {
    const id = ourOf.get(o.pid); if (!id) continue;
    foreignActive[id] = (foreignActive[id] || 0) + 1; (foreign[id] = foreign[id] || []).push(o);
  }

  // 2. What they should have
  const today = engine.today();
  const P = plan({ engine, state, doors: managed, today, now, horizonDays, budget, foreignActive, foreign });
  report.warnings.push(...P.warnings); report.loadedThrough = P.loadedThrough;
  let changed = false;
  store.original = store.original || {};

  for (const id of managed) {
    const d = byOur.get(id), pid = d.Id;
    // weekly Door Time Zone
    let tz = tzs.find((t) => (t.Description || "") === tzTag(pid));
    const spans = P.week[id];
    let spansOk = false;   // remember what was written only when it really was written
    if (!tz) {
      const newId = await act(`create weekly schedule for ${d.Name}`, () => client.createTimeZone(`SD ${d.Name}`, tzTag(pid), spans));
      if (newId) { tz = { Id: newId }; changed = true; spansOk = true; }
    } else if (!sameSpans(store.lastSpans?.[pid] || tz.TimeSpans, spans)) {
      if ((await act(`rewrite weekly schedule for ${d.Name}`, () => client.setTimeSpans(tz.Id, spans))) !== undefined) { changed = true; spansOk = true; }
      else if (write && store.lastSpans) delete store.lastSpans[pid];
    } else spansOk = true;
    if (write && tz && spansOk) { store.lastSpans = store.lastSpans || {}; store.lastSpans[pid] = spans; }
    // point the door at it, remembering what it had before
    if (tz && Number(d.DoorTimeZoneId) !== Number(tz.Id)) {
      if (write && store.original[pid] === undefined) store.original[pid] = d.DoorTimeZoneId;
      if ((await act(`switch ${d.Name} to its managed schedule`, () => client.setDoorTimeZone(pid, tz.Id))) !== undefined) changed = true;
    } else if (!tz && mode === "practice") {
      report.actions.push(`switch ${d.Name} to its managed schedule`);
    }

    // one-time overrides
    const want = P.otrs.filter((o) => o.door === id).map((o) => ({ ...o, start: minute(o.start), stop: minute(o.stop) }));
    const have = otrs.filter((o) => o.pid === pid && o.desc.startsWith(TAG) && o.stop > now);
    const used = new Set(), add = [];
    for (const w of want) {
      const match = have.find((h) => !used.has(h.id) && h.mode === w.mode && minute(h.stop) === w.stop && (minute(h.start) === w.start || (h.start <= now && w.start <= now)));
      if (match) { used.add(match.id); continue; }
      let start = Math.max(w.start, minute(now));   // already running: replaced from this minute on
      // A long stretch that is already running (for example a lockdown over several
      // days) only grows at its far end as the 30-day window moves. Keep what is on
      // the panel and add the rest after it, instead of replacing it every night.
      if (w.start <= now) {
        // only the running piece is kept; the rest is one fresh piece after it (so a
        // long stretch never uses more than two of the door's 32 overrides)
        const running = have.find((h) => !used.has(h.id) && h.mode === w.mode && h.start <= now && h.stop > now && minute(h.stop) < w.stop);
        if (running) {
          used.add(running.id);
          const rest = have.find((h) => !used.has(h.id) && h.mode === w.mode && minute(h.start) === minute(running.stop) && minute(h.stop) === w.stop);
          if (rest) { used.add(rest.id); continue; }
          start = minute(running.stop);
        }
      }
      if (start >= w.stop) continue;
      add.push({ ...w, start });
    }
    // Remove first, then add: overrides on a door may not overlap. Nothing reaches
    // the doors until "update panels" at the end, so the door never sees the gap.
    for (const h of have) if (!used.has(h.id)) {
      if ((await act(`remove override ${h.id} on ${d.Name} (${h.mode}, ${when(h.start)} to ${when(h.stop)})`, () => client.deleteOtr(h.id))) !== undefined) changed = true;
    }
    for (const w of add) {
      const label = w.reason === "hand" ? "by hand" : w.date;
      const r = await act(`add ${w.mode} override on ${d.Name}, ${when(w.start)} to ${when(w.stop)} (${label})`,
        () => client.createOtr({ name: `SD ${id} ${w.reason === "hand" ? "hand" : w.date}`, description: otrTag(pid, w.reason), startUtc: hartmann(w.start), stopUtc: sendStop(w.stop), doorId: pid, mode: w.mode }));
      if (r !== undefined) changed = true;
    }
  }

  // 3. Doors no longer managed: put them back exactly as they were, and clear
  //    anything of ours left on them (also after a lost or reset store).
  const managedPids = new Set(managed.map((id) => byOur.get(id).Id));
  // a door we can't identify right now (duplicate name) is left exactly as it is
  const unsure = new Set(state.doors.map((d) => store.pidOf[d.id]).filter((pid) => pid != null && !taken.has(pid) && pdoors.some((x) => x.Id === pid)));
  const leftover = new Set([...Object.keys(store.original).map(Number),
    ...tzs.filter((t) => (t.Description || "").startsWith(TAG + "door:")).map((t) => Number(t.Description.split(":")[2])),
    ...otrs.filter((o) => o.desc.startsWith(TAG) && o.stop > now).map((o) => o.pid)].filter((pid) => pid != null && !managedPids.has(pid) && !(unsure.has(pid) && mode !== "restore")));
  if (leftover.size > 3 && mode !== "restore" && mode !== "practice") {
    report.warnings.push(`${leftover.size} doors are no longer on the list. To be safe they were NOT put back automatically. Use restore mode to put every door back, or take doors off one or two at a time.`);
  } else for (const pid of leftover) {
    const d = pdoors.find((x) => x.Id === pid);
    if (!d) continue;
    const orig = store.original[pid];
    const tz = tzs.find((t) => (t.Description || "") === tzTag(pid));
    if (orig !== undefined && Number(d.DoorTimeZoneId) !== Number(orig)) { if ((await act(`put ${d.Name} back on its original schedule`, () => client.setDoorTimeZone(pid, orig))) !== undefined) changed = true; }
    else if (orig === undefined && tz && Number(d.DoorTimeZoneId) === Number(tz.Id)) report.warnings.push(`${d.Name} is on our schedule but its original schedule is unknown. Pick its schedule in Protector.Net by hand.`);
    for (const o of otrs) if (o.pid === pid && o.desc.startsWith(TAG) && o.stop > now) { if ((await act(`remove override ${o.id} on ${d.Name}`, () => client.deleteOtr(o.id))) !== undefined) changed = true; }
    const stillOnIt = tz && Number(d.DoorTimeZoneId) === Number(tz.Id) && (orig === undefined || !write);
    if (tz && !stillOnIt) await act(`delete managed schedule for ${d.Name}`, () => client.deleteTimeZone(tz.Id));
    if (write && !report.errors.length) delete store.original[pid];
  }

  // Tidy up: our own overrides that ended more than two days ago (so the list
  // Protector.Net keeps doesn't grow forever). A few hundred per run at most.
  const old = otrs.filter((o) => o.desc.startsWith(TAG) && o.stop < now - 2 * 864e5).slice(0, 300);
  if (old.length && write) {
    let n = 0; for (const o of old) { try { await client.deleteOtr(o.id); n++; } catch { /* next time */ } }
    if (n) report.actions.push(`removed ${n} old overrides that already ended`);
  }

  // The push to the panels is remembered until it succeeds, so a failed push is
  // retried on the next run even if nothing else needs to change.
  if (changed && write) store.needUpdate = true;
  if (store.needUpdate && write) {
    if ((await act("update panels", () => client.updatePanels())) !== undefined) store.needUpdate = false;
  }
  // 4. Read everything back and compare with the rules, minute by minute, for the
  //    rest of today and all of tomorrow. In practice mode this shows where the
  //    rules entered so far differ from what the doors do now; in pilot/live it
  //    proves the panels got what was sent.
  try { report.compare = await compareDoors({ client, engine, ids: mode === "practice" ? known : managed, byOur, now, today }); }
  catch (e) { report.compare = { error: e.message }; }
  if (write && report.compare && report.compare.differ && report.compare.differ.length && mode !== "restore")
    report.warnings.push(`After sending, ${report.compare.differ.length} door(s) still differ from the rules: ${report.compare.differ.slice(0, 5).map((d) => d.door).join(", ")}`);
  // outputs: read only for now, at most every 6 hours
  if (typeof client.probeOutputs === "function" && (!store.outputsAt || now - store.outputsAt > 6 * 3600e3 || !store.outputs)) {
    try { store.outputs = await client.probeOutputs(); store.outputsAt = now; } catch (e) { store.outputs = { error: e.message }; store.outputsAt = now; }
  }
  report.outputs = store.outputs || null;
  report.ok = report.errors.length === 0;
  return report;
}

const { API_MODE, DOW } = require("./planner");
const { localMinute, dayInstants } = require("./time");
const LABEL = { Unlock: "Open", CardOrPin: "Card or PIN", Card: "Card only", Pin: "PIN only", CardAndPin: "Card and PIN", UnlockWithFirstCardIn: "First credential in", Lockdown: "Lockdown", DualCard: "Dual card" };

async function compareDoors({ client, engine, ids, byOur, now, today }) {
  const pdoors = await client.doors();
  const tzList = await client.timeZones();
  const otrs = (await client.otrs()).map((o) => ({ mode: o.Mode, start: fromHartmann(o.StartTime), stop: readStop(o.StopTime), name: o.DoorName, pid: o.DoorId }));
  let legend = null; try { legend = await client.modeLegend(); } catch { /* older servers */ }
  const spansOf = new Map(); let sample = null;
  const getSpans = async (tzId) => {
    if (spansOf.has(tzId)) return spansOf.get(tzId);
    let t = tzList.find((x) => Number(x.Id) === Number(tzId));
    if (!t || !Array.isArray(t.TimeSpans) || !t.TimeSpans.length) {   // the list came without times: ask for this one
      const r = await client.timeSpans(tzId);
      t = { ...(t || {}), TimeSpans: r.spans };
      if (!sample) sample = { id: tzId, name: t.Name, tried: r.tried };
    }
    if (!sample && t) sample = { id: tzId, name: t.Name, spans: Array.isArray(t.TimeSpans) ? t.TimeSpans.slice(0, 3) : t.TimeSpans, legend };
    const sp = t && Array.isArray(t.TimeSpans) ? t.TimeSpans.filter((x) => !x.DeletedOn).map((x) => normSpan(x, legend)).filter((x) => Number.isFinite(x.a) && Number.isFinite(x.b)) : null;
    spansOf.set(tzId, sp); return sp;
  };
  const tomorrow = engine.addDays(today, 1), out = { checked: 0, differ: [], skipped: [] };
  const fmtMin = (m) => { const h = Math.floor(m / 60) % 24, mi = m % 60; return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const byDoor = new Map();
  for (const o of otrs) { if (o.stop <= now) continue; const k = o.pid != null ? `#${o.pid}` : `n:${o.name}`; if (!byDoor.has(k)) byDoor.set(k, []); byDoor.get(k).push(o); }
  for (const id of ids) {
    const live = pdoors.find((x) => x.Id === byOur.get(id).Id); if (!live) continue;
    const mine = [...(byDoor.get(`#${live.Id}`) || []), ...(byDoor.get(`n:${live.Name}`) || [])];
    const sp = await getSpans(live.DoorTimeZoneId);
    if (!sp || !sp.length) { out.skipped.push(id); continue; }
    // what each door runs today in Protector.Net, so it can be copied into rules
    const tzName = (tzList.find((x) => Number(x.Id) === Number(live.DoorTimeZoneId)) || {}).Name || `schedule ${live.DoorTimeZoneId}`;
    out.current = out.current || {};
    if (!out.current[live.DoorTimeZoneId]) out.current[live.DoorTimeZoneId] = { name: tzName, doors: [], spans: sp };
    out.current[live.DoorTimeZoneId].doors.push(id);
    out.checked++;
    let minutes = 0, first = null;
    for (const date of [today, tomorrow]) {
      const segs = engine.day(id, date), dow = DOW[engine.dow(date)];
      const daySp = sp.filter((x) => x.d === dow), inst = dayInstants(date);
      const from = date === today ? localMinute(now) + 1 : 0;
      for (let m = from; m < 1440; m++) {
        const want = API_MODE[segs.find((g) => g.a <= m && m < g.b).mode];
        const t = inst[m];
        const o = mine.filter((x) => x.start <= t && t < x.stop);
        const span = daySp.find((x) => x.a <= m && m <= x.b);
        const got = o.length ? o[o.length - 1].mode : span ? span.m : "none";
        if (got !== want) { minutes++; if (!first) first = { date, at: fmtMin(m), rules: LABEL[want] || want, door: LABEL[got] || got }; }
      }
    }
    if (minutes) out.differ.push({ door: id, name: live.Name, minutes, first });
  }
  out.sample = sample;
  return out;
}

module.exports = { normSpan, sync, TAG, ourId, compareDoors };
