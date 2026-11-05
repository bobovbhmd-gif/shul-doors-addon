"use strict";
// Guest codes on the doors. Each code made in the app becomes one temporary
// Protector.Net user with a PIN, the same way the Home Assistant integration makes
// its temp codes: a user named "SD-<code id>" with a StartedOn and ExpiresOn, a
// PinOnly credential, and membership in one access group per door ("SD Guest - <door>",
// Always Access on that door's readers). Protector.Net itself stops the PIN at
// ExpiresOn; the box deletes the user after it ends or when the code is cancelled.
// Only users whose first name starts with "SD-" are ever changed or deleted.
const { hartmann, localDate, localToUtc } = require("./time");

const PREFIX = "SD-";
const APG = "SD Guest - ";
const HOURS = { day: [420, 1140], work: [540, 1020] };   // 7 AM to 7 PM, 9 AM to 5 PM

// The stretch the PIN should work now or next: the whole code, or with set hours
// the current or next day's hours. null when it is over.
function windowOf(c, now) {
  if (!(c.to > now) || !(c.to > c.from)) return null;
  const h = HOURS[c.hours];
  if (!h) return { start: c.from, end: c.to };
  const addDay = (d) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  for (let d = localDate(Math.max(now, c.from)), i = 0; d <= localDate(c.to) && i < 400; d = addDay(d), i++) {
    const start = Math.max(c.from, localToUtc(d, h[0])), end = Math.min(c.to, localToUtc(d, h[1]));
    if (end > start && end > now) return { start, end };
  }
  return null;
}
const minute = (ms) => Math.floor(ms / 60000) * 60000;

async function syncCodes({ client, engine, state, store, mode, managed, byOur, report, act, write, now, sms }) {
  if (typeof client.users !== "function") return;
  store.codeUsers = store.codeUsers || {};
  const recs = store.codeUsers;
  const expand = (list) => { try { return engine.raw(`expandDoors(${JSON.stringify(list || [])})`); } catch { return (list || []).filter((x) => !String(x).startsWith("g:")); } };
  const doorName = (id) => ((state.doors || []).find((d) => d.id === id) || {}).name || id;
  const codes = mode === "restore" ? [] : (state.codes || []);
  report.codes = [];

  // what each code needs on the doors right now
  const want = new Map();
  for (const c of codes) {
    if (!c || !c.id || !/^\d{4,9}$/.test(String(c.pin || ""))) continue;
    const w = windowOf(c, now);
    const all = expand(c.doors);
    const onIt = all.filter((id) => managed.includes(id) && byOur.has(id));
    const left = all.filter((id) => !onIt.includes(id));
    const info = { id: c.id, name: c.name, doors: onIt, skipped: left };
    if (!w) { if (recs[c.id]) recs[c.id].state = "ended"; continue; }
    report.codes.push(info);
    if (left.length) report.warnings.push(`Guest code for "${c.name}": ${left.map(doorName).join(", ")} ${left.length === 1 ? "is" : "are"} not run by this system${mode === "pilot" ? " (not on the pilot list)" : ""}, so the code won't open ${left.length === 1 ? "it" : "them"}.`);
    if (!onIt.length) { info.state = "nodoors"; if (write) recs[c.id] = { ...(recs[c.id] || {}), state: "nodoors", why: "none of its doors are run by this system", at: now }; continue; }
    want.set(PREFIX + c.id, { c, w: { start: minute(w.start), end: minute(w.end) }, pids: onIt.map((id) => byOur.get(id).Id), info });
  }

  const users = await client.users();
  const ours = users.filter((u) => String(u.FirstName || "").startsWith(PREFIX));
  // anything of ours that is no longer wanted: ended, cancelled or deleted in the app
  for (const u of ours) if (!want.has(u.FirstName)) {
    const id = u.FirstName.slice(PREFIX.length);
    if ((await act(`remove guest code user ${u.FirstName} (${u.LastName || ""})`, () => client.deleteUser(u.Id))) !== undefined && write) {
      if (recs[id]) { recs[id].state = "removed"; recs[id].uid = null; recs[id].at = now; }
    }
  }
  if (!want.size) { tidy(recs, codes, now, write); return; }

  // the access groups, one per door, made the first time a door needs one
  const apgs = await client.apgs();
  const apgOf = new Map();
  let holiday, zone;
  async function apgFor(pid) {
    if (apgOf.has(pid)) return apgOf.get(pid);
    const d = [...byOur.values()].find((x) => x.Id === pid);
    const name = (APG + d.Name).slice(0, 60);
    let g = apgs.find((a) => a.Name === name), id = g && Number(g.Id);
    if (!id) {
      if (holiday === undefined) holiday = await client.holidayGroupId();
      if (!holiday) throw new Error("Protector.Net has no holiday group, which a new access group needs");
      id = await act(`create access group "${name}"`, () => client.createApg(name, `Shul Doors guest codes for ${d.Name}`, holiday));
      if (!id) { apgOf.set(pid, null); return null; }
      apgs.push({ Id: id, Name: name });
    }
    // a group with no readers opens nothing: give it this door's readers, Always Access
    if (write) {
      const has = await client.apgReaders(id);
      if (!has.length) {
        const readers = await client.readersOf(pid);
        if (!readers.length) report.warnings.push(`${d.Name}: Protector.Net lists no readers for this door, so a guest code can't open it.`);
        if (zone === undefined) zone = await client.alwaysZoneId();
        for (const r of readers) await act(`give "${name}" the reader ${r.Name || r.Id}`, () => client.apgAddReader(id, r.Id, zone));
      }
    }
    apgOf.set(pid, id);
    return id;
  }

  let level;
  for (const [first, x] of want) {
    const { c, w, pids, info } = x;
    const rec = recs[c.id] || {};
    let u = ours.find((y) => y.FirstName === first);
    const label = `"${c.name}"`;
    // a new PIN means a new user (the PIN can't be changed in place)
    if (u && rec.pin && String(rec.pin) !== String(c.pin)) {
      if ((await act(`replace guest code user for ${label} (new PIN)`, () => client.deleteUser(u.Id))) === undefined) continue;
      u = null;
    }
    if (!u && rec.state === "error" && String(rec.pin) === String(c.pin) && /already used/.test(rec.why || "")) { info.state = "error"; report.warnings.push(`Guest code for ${label}: ${rec.why}`); continue; }
    if (!u) {
      if (!write) { report.actions.push(`add guest code for ${label} on ${pids.length} door${pids.length === 1 ? "" : "s"}`); info.state = "would"; continue; }
      if (level === undefined) level = await client.securityLevelId();
      const uid = await act(`add guest code user for ${label}`, () => client.createUser({ first, last: c.name || "Guest", startUtc: hartmann(w.start), endUtc: hartmann(w.end), securityLevelId: level }));
      if (!uid) { info.state = "error"; recs[c.id] = { ...rec, state: "error", why: "Protector.Net did not accept the new user", at: now }; continue; }
      try { await client.addPin(uid, c.name || "Guest", c.pin); }
      catch (e) {
        try { await client.deleteUser(uid); } catch { /* left for the next run to remove */ }
        const why = /already|in use|exist|duplicate/i.test(e.message) ? "This PIN is already used by someone in Protector.Net. Pick another PIN." : "Protector.Net did not accept the PIN: " + e.message.slice(0, 120);
        report.warnings.push(`Guest code for ${label}: ${why}`);
        info.state = "error"; recs[c.id] = { ...rec, uid: null, state: "error", why, pin: c.pin, at: now };
        continue;
      }
      u = { Id: uid, FirstName: first };
      Object.assign(rec, { uid, pin: c.pin, start: w.start, end: w.end, groups: {} });
    } else {
      rec.uid = u.Id; rec.pin = c.pin;
      if (rec.start !== w.start || rec.end !== w.end) {
        if ((await act(`set guest code for ${label} to work ${new Date(w.start).toISOString()} to ${new Date(w.end).toISOString()}`, () => client.setUserTimes(u.Id, hartmann(w.start), hartmann(w.end)))) !== undefined && write) { rec.start = w.start; rec.end = w.end; }
      }
    }
    // doors: add the groups it needs, take it out of the ones it no longer needs
    rec.groups = rec.groups || {};
    let missing = 0;
    for (const pid of pids) {
      if (rec.groups[pid]) continue;
      let g = null;
      try { g = await apgFor(pid); } catch (e) { report.warnings.push(`Guest code for ${label}: ${e.message}`); }
      if (!g) { missing++; continue; }
      if ((await act(`let ${label} in at door ${pid}`, () => client.apgAddUser(g, u.Id))) !== undefined && write) rec.groups[pid] = g; else missing++;
    }
    for (const pid of Object.keys(rec.groups)) if (!pids.includes(Number(pid))) {
      if ((await act(`take ${label} off door ${pid}`, () => client.apgRemoveUser(rec.groups[pid], u.Id))) !== undefined && write) delete rec.groups[pid];
    }
    rec.state = missing ? "partial" : "on"; rec.why = missing ? `${missing} door${missing === 1 ? "" : "s"} could not be added` : ""; rec.at = now;
    if (write) recs[c.id] = rec;
    info.state = rec.state;
    // text the guest their code once, when it first goes on the doors
    if (write && sms && c.phone && !rec.texted && rec.state !== "error") {
      rec.texted = now;
      const doors = expand(c.doors).map(doorName).join(", ");
      const fmt = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);
      sms.sendOne(c.phone, `Your door code is ${c.pin}. It works on ${doors} from ${fmt(c.from)} to ${fmt(c.to)}.`, "code").then((r) => { rec.textStatus = r.status; }).catch(() => {});
    }
  }
  tidy(recs, codes, now, write);
}
// forget records of codes that ended long ago
function tidy(recs, codes, now, write) {
  if (!write) return;
  for (const [id, r] of Object.entries(recs)) {
    const c = codes.find((x) => x.id === id);
    if (!r.uid && (!c || c.to < now - 30 * 864e5)) delete recs[id];
  }
}

module.exports = { syncCodes, windowOf, PREFIX, APG };
