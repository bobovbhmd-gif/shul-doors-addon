"use strict";
// Lighting on Pelican Power Control Modules (light relays), run like the HVAC schedules:
// a named schedule repeats daily, weekday and weekend, or weekly; each day is a list of run times (on at, off at),
// by the clock or by zmanim, each run with its own rule if wanted (skip it, or only on some days).
// Special days put lights on another schedule for those days, like the door rules.
//
// Pelican joins overlapping run times, so the box can't turn a light off over Pelican's own weekly times. When a light
// starts getting changes (pilot or live), the box keeps a copy of Pelican's own run times, removes them, and from then
// on loads the exact run times for each of the next 14 days (one-date run times). If the box goes down, the light
// keeps running those 14 days.
//
// Modes, like the doors and the thermostats: read (send nothing), pilot (only lights listed in light_pilot), live.

const ANCHORS = ["alos", "sunrise", "chatzos", "plag", "sunset", "candles", "tzeis", "havdalah", "rt"];
const DAYS_AHEAD = 14;
const C0 = () => ({ wd: [], fest: [], dates: [], hr: [] });
function dayOf(sc, w) { const d = (sc && sc.days) || {}; if (sc.repeat === "daily") return d[0] || []; if (sc.repeat === "wkend") return w === 0 || w === 6 ? d[0] || [] : d[1] || []; return d[w] || []; }

function createLights({ pelican, engine, getState, getStore, save, saveState = () => {}, mode = () => "read", pilot = () => [], log = () => {}, note = () => {}, nyParts, now = () => Date.now() }) {
  let list = [], listAt = 0, listErr = "";
  const st = () => getStore();
  const cfg = () => { const s = getState() || {}; s.lights = s.lights || {}; const h = s.lights; h.scheds = h.scheds || []; h.rules = h.rules || []; h.sw = h.sw || {}; return h; };
  const find = (id) => list.find((r) => r.id === id || r.name === id) || null;
  const inPilot = (r) => { const p = pilot().map((x) => String(x).trim().toLowerCase()).filter(Boolean); return p.includes(r.name.toLowerCase()) || p.includes(r.id.toLowerCase()); };
  const writable = (r) => mode() === "live" || (mode() === "pilot" && inPilot(r));
  const would = (r, what) => { const s = st(); s.lightWould = s.lightWould || []; s.lightWould.unshift({ at: now(), id: r.id, name: r.name, what }); s.lightWould = s.lightWould.slice(0, 200); };
  const event = (r, who, what) => { const s = st(); s.lightEvents = s.lightEvents || []; s.lightEvents.unshift({ at: now(), id: r.id, name: r.name, who, what }); s.lightEvents = s.lightEvents.slice(0, 500); try { note(who, `Lights: ${r.name}: ${what}`); } catch { /* no activity */ } };

  // ---- the plan ----
  const minOf = (at, z) => {
    if (!at) return null;
    if (at.a === "clock") { const m = String(at.t || "").match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; }
    if (!ANCHORS.includes(at.a) || !z || z[at.a] == null) return null;
    return z[at.a] + (+at.o || 0);
  };
  const sitTop = (id) => !!((((getState() || {}).situations || []).find((x) => x.id === id)) || {}).top;
  const condOk = (r, info) => !((r.sit && !(info.sits || []).includes(r.sit)) || (r.rabbi === "away" && !info.away) || (r.rabbi === "local" && info.away) || (r.season === "dst" && !info.dst) || (r.season === "std" && info.dst));
  function whenHit(k, info) {
    if (k === "rav:away") return !!info.away; if (k === "rav:home") return !info.away;
    if (k === "clock:dst") return !!info.dst; if (k === "clock:std") return !info.dst;
    if (k.startsWith("sit:")) return (info.sits || []).includes(k.slice(4));
    const keys = info.keys || [];
    if (k === "chanuka") return keys.some((x) => /^chanuka\d$/.test(x));
    if (keys.includes(k)) return true;
    const i = k.indexOf(":"), h = k.slice(0, i);
    return (h === "ev" || h === "type") && keys.includes(h + "@lights" + k.slice(i));   // events kept to lighting
  }
  const okWhen = (e, info) => { const w = e.when; if (!w || !(w.keys || []).length) return true; const hit = w.keys.some((k) => whenHit(String(k), info)); return w.mode === "only" ? hit : !hit; };
  const schedById = (id) => cfg().scheds.find((x) => x.id === id) || null;
  const schedOf = (rid) => cfg().scheds.find((x) => (x.relays || []).includes(rid)) || null;
  const managed = (rid) => !!schedOf(rid);
  function ruleFor(rid, date, info) {
    let best = null, bs = -1;
    for (const r of cfg().rules) {
      if (r.on === false || !(r.relays || []).includes(rid) || !condOk(r, info)) continue;
      let sc = -1; try { sc = engine.cond(r.inc || C0(), r.exc || null, date, "lights"); } catch { sc = -1; }
      if (sc < 0) continue;
      sc += (r.sit ? (sitTop(r.sit) ? 200 : 10) : 0) + (r.rabbi && r.rabbi !== "any" ? 10 : 0) + (r.season && r.season !== "any" ? 5 : 0);
      if (sc > bs) { bs = sc; best = r; }
    }
    return best;
  }
  // a date's runs as [{start, end}] minutes, joined where they overlap
  function plan(rid, date) {
    const base = schedOf(rid), info = engine.info(date);
    if (!base) return { date, src: "No schedule here", runs: [] };
    const r = ruleFor(rid, date, info), sc = (r && schedById(r.sched)) || base, raw = [];
    dayOf(sc, info.w).forEach((e) => {
      if (!okWhen(e, info)) return;
      let a = minOf(e.on, info.z), b = minOf(e.off, info.z); if (a == null || b == null) return;
      a = Math.max(0, Math.round(a)); b = Math.min(1439, Math.round(b)); if (b <= a) b = 1439;   // off before on: on until midnight
      raw.push({ start: a, end: b });
    });
    raw.sort((x, y) => x.start - y.start);
    const runs = []; raw.forEach((x) => { const l = runs[runs.length - 1]; if (l && x.start <= l.end) l.end = Math.max(l.end, x.end); else runs.push({ ...x }); });
    return { date, src: r && sc !== base ? (r.name === sc.name ? r.name : `${r.name} (${sc.name})`) : sc.name, rule: r ? r.id : null, sched: sc.id, runs };
  }
  // on or off now by the plan, and when that changes next
  function nowNext(rid) {
    const p = nyParts(now()), runs = plan(rid, p.d).runs, on = runs.some((x) => p.m >= x.start && p.m < x.end);
    for (let i = 0; i < 3; i++) {
      const d = engine.addDays(p.d, i), rr = i ? plan(rid, d).runs : runs;
      for (const x of rr) { for (const m of [x.start, x.end]) { if (i === 0 && m <= p.m) continue; const nOn = rr.some((y) => m >= y.start && m < y.end); if (nOn !== on) return { on, next: { date: d, m, on: nOn } }; } }
    }
    return { on, next: null };
  }

  // ---- reading the relays ----
  async function poll() {
    try { list = await pelican.powerList(); listAt = now(); listErr = ""; await pressCheck(); }
    catch (e) { listErr = e.message; }
    return list;
  }
  // someone pressed the light switch (Pelican says set by Station): leave it, or put it back after the time picked in Setup
  async function pressCheck() {
    const s = st(), wait = +cfg().sw.press || 0; s.lightPress = s.lightPress || {};
    for (const r of list) {
      if (!managed(r.id)) continue;
      const was = s.lightPress[r.id];
      if (r.setBy !== "Station") { if (was) { delete s.lightPress[r.id]; save(); } continue; }
      if (!was || was.on !== r.on) { s.lightPress[r.id] = { at: now(), on: r.on }; save(); event(r, "Switch", `pressed at the switch: ${r.on ? "on" : "off"}`); continue; }
      if (wait && now() - was.at >= wait * 60e3) {
        const want = nowNext(r.id).on; delete s.lightPress[r.id]; save();
        if (want !== r.on) await setOut(r, want, "Shul Manager", `back to the schedule ${wait} min after the switch was pressed`);
      }
    }
  }
  async function setOut(r, on, who, why) {
    if (!writable(r)) { would(r, `turn ${on ? "on" : "off"}${why ? " (" + why + ")" : ""}`); event(r, who, `would turn ${on ? "on" : "off"} (not sent: ${mode() === "read" ? "read only" : "not in the pilot"})`); return { ok: true, would: true }; }
    await pelican.powerSet(r, { output: on ? "On" : "Off" }); r.on = on; r.setBy = "Remote";
    event(r, who, `turned ${on ? "on" : "off"}${why ? " (" + why + ")" : ""}`); return { ok: true };
  }
  // turn lights on or off now; until: "next" (the next scheduled change), or a time (ms) to go back to the schedule
  async function setNow(ids, on, until, who) {
    if (!list.length) await poll();
    const s = st(); s.lightHold = s.lightHold || {}; const out = [];
    for (const id of ids) {
      const r = find(id); if (!r) { out.push({ id, ok: false, error: "No light by that name." }); continue; }
      try { const x = await setOut(r, !!on, who, until && until !== "next" ? "until " + new Date(until).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) : "");
        if (until && until !== "next") s.lightHold[r.id] = { until: +until, on: !!on, by: who }; else delete s.lightHold[r.id];
        out.push({ id: r.id, name: r.name, ...x }); }
      catch (e) { out.push({ id: r.id, name: r.name, ok: false, error: e.message }); }
    }
    save(); return out;
  }
  async function tick() {
    const s = st(), holds = s.lightHold || {};
    for (const [id, h] of Object.entries(holds)) {
      if (now() < h.until) continue;
      delete holds[id]; save(); const r = find(id); if (!r) continue;
      const want = managed(id) ? nowNext(id).on : !h.on;
      try { await setOut(r, want, "Shul Manager", "the time is up"); } catch (e) { log("warn", `lights: ${r.name}: ${e.message}`); }
    }
  }

  // ---- loading the next 14 days onto the relays ----
  const sid = (rid, d, a, b) => "sm" + Buffer.from(rid).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(-8) + d.replace(/-/g, "") + String(a).padStart(4, "0") + String(b).padStart(4, "0");
  let syncing = false;
  async function sync(force) {
    if (syncing) return { busy: true }; syncing = true;
    const s = st(); s.lightDays = s.lightDays || {}; s.lightTook = s.lightTook || {}; s.lightBackup = s.lightBackup || {};
    const res = [];
    try {
      if (!list.length) await poll();
      const t = nyParts(now()).d;
      for (const r of list) {
        if (!managed(r.id)) continue;
        const want = [];
        for (let i = 0; i < DAYS_AHEAD; i++) { const d = engine.addDays(t, i); plan(r.id, d).runs.forEach((x) => want.push({ id: sid(r.id, d, x.start, x.end), date: d, start: x.start, end: x.end })); }
        const key = JSON.stringify(want.map((x) => x.id));
        if (!writable(r)) { if (force || s.lightDays[r.id] !== "would:" + key) { s.lightDays[r.id] = "would:" + key; would(r, `load the next ${DAYS_AHEAD} days: ${want.length} run time${want.length === 1 ? "" : "s"} (${schedOf(r.id).name})`); } res.push({ id: r.id, would: true }); continue; }
        try {
          const have = await pelican.powerSchedules(r);
          if (!s.lightTook[r.id]) {   // first time: keep a copy of Pelican's own run times, then take them off
            s.lightBackup[r.id] = have.filter((x) => !/^sm/.test(x.id)); save();
            for (const x of s.lightBackup[r.id]) await pelican.powerDel(x.id);
            s.lightTook[r.id] = true; event(r, "Shul Manager", `took over the schedule (Pelican's ${s.lightBackup[r.id].length} run times kept as a copy)`);
          }
          const haveIds = new Set(have.map((x) => x.id)), wantIds = new Set(want.map((x) => x.id));
          let del = 0, add = 0;
          for (const x of have) if (/^sm/.test(x.id) && !wantIds.has(x.id) && x.startDate >= t) { await pelican.powerDel(x.id); del++; }
          for (const x of want) if (!haveIds.has(x.id)) { await pelican.powerAdd(r, { ...x, title: "Shul Manager" }); add++; }
          s.lightDays[r.id] = key; res.push({ id: r.id, add, del });
          if (add || del) log("info", `lights: ${r.name}: loaded ${add}, removed ${del}`);
        } catch (e) { res.push({ id: r.id, error: e.message }); log("warn", `lights: ${r.name}: ${e.message}`); }
      }
      s.lightSyncAt = now(); save();
    } finally { syncing = false; }
    return { ok: true, res };
  }
  // put Pelican's own run times back on a light (and take off the box's), so Pelican runs it alone again
  async function giveBack(id, who) {
    const r = find(id), s = st(); if (!r) return { ok: false, error: "No light by that name." };
    if (!writable(r)) return { ok: false, error: "This light isn't getting changes from here." };
    const have = await pelican.powerSchedules(r);
    for (const x of have) if (/^sm/.test(x.id)) await pelican.powerDel(x.id);
    const toMin = (v) => { const m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
    for (const x of (s.lightBackup || {})[r.id] || []) {
      const a = toMin(x.start), b = toMin(x.end); if (a == null || b == null) continue;
      const rep = String(x.repeat || "").trim();
      await pelican.powerAdd(r, { id: "pb" + x.id, date: x.startDate || nyParts(now()).d, start: a, end: b, title: x.title || "Pelican", repeat: rep && rep !== "None" ? rep : "" }).catch((e) => log("warn", `lights: ${r.name}: putting back a run time: ${e.message}`));
    }
    delete (s.lightTook || {})[r.id]; delete (s.lightDays || {})[r.id]; save();
    cfg().scheds.forEach((x) => { x.relays = (x.relays || []).filter((y) => y !== r.id); }); cfg().rules.forEach((x) => { x.relays = (x.relays || []).filter((y) => y !== r.id); }); saveState();   // off its schedules here, so the box leaves it alone
    event(r, who, "gave the schedule back to Pelican"); return { ok: true };
  }

  function status() {
    const s = st();
    return {
      mode: mode(), pilot: pilot(), configured: pelican.configured, err: listErr, at: listAt, syncAt: s.lightSyncAt || 0,
      relays: list.map((r) => { const sc = schedOf(r.id), nn = sc ? nowNext(r.id) : null;
        return { ...r, sched: sc ? sc.name : "", plan: nn, hold: (s.lightHold || {})[r.id] || null, press: (s.lightPress || {})[r.id] || null, writable: writable(r), took: !!(s.lightTook || {})[r.id] }; }),
      would: (s.lightWould || []).slice(0, 60), events: (s.lightEvents || []).slice(0, 100),
    };
  }
  return { poll, plan, nowNext, setNow, tick, sync, giveBack, status, list: () => list, find };
}

module.exports = { createLights, dayOf };
