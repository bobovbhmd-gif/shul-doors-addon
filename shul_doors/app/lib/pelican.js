"use strict";
// Pelican thermostats, through Pelican's cloud API (api.cgi on the shul's Pelican site).
// Pelican has no local API: every read and change goes through their servers.
// A request is a GET with username, password, request (get or set), object, selection and value.
// Selection and value are "name:value;" pairs. Answers are XML.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FIELDS = ["name", "groupName", "serialNo", "temperature", "humidity", "co2Level", "heatSetting", "coolSetting", "system", "fan", "runStatus", "setBy", "statusDisplay", "schedule", "minHeatSetting", "maxHeatSetting", "minCoolSetting", "maxCoolSetting"];

const unxml = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function blocks(xml, tag) {
  const out = [], re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"); let m;
  while ((m = re.exec(xml))) { const o = {}, re2 = /<(\w+)>([^<]*)<\/\1>/g; let n; while ((n = re2.exec(m[1]))) o[n[1]] = unxml(n[2]).trim(); out.push(o); }
  return out;
}
const tagText = (xml, tag) => { const m = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? unxml(m[1]).trim() : ""; };
// values can't hold the separators the API uses
const clean = (v) => String(v).replace(/[;&]/g, " ").trim();   // a colon is fine inside a value (startTime 05:45): the API splits on the first one
const pairs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}:${clean(v)}`).join(";") + ";";

function createPelican({ site, username, password, log = () => {}, fetchImpl = (...a) => fetch(...a) }) {
  const base = (() => {
    const raw = String(site || "").trim().replace(/\/+$/, ""); if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) { try { return new URL(raw).origin; } catch { return ""; } }
    if (raw.includes(".")) return "https://" + raw.replace(/\/.*$/, "");
    return `https://${raw}.officeclimatecontrol.net`;   // just the site name, like "myshul"
  })();
  const configured = !!(base && username && password);
  let last = { ok: false, at: 0, why: configured ? "Not checked yet" : "Not set up" };

  async function call(request, object, selection, value) {
    if (!configured) throw new Error("Pelican isn't set up. Add the Pelican site, username and password in the add-on settings.");
    const q = new URLSearchParams({ username, password, request, object });
    if (selection) q.set("selection", selection);
    if (value) q.set("value", value);
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
    let text;
    try {
      const r = await fetchImpl(`${base}/api.cgi?${q}`, { signal: ac.signal });
      if (!r.ok) throw new Error("Pelican answered " + r.status);
      text = await r.text();
    } catch (e) {
      const why = e.name === "AbortError" ? "Pelican didn't answer. Check the shul's internet." : /fetch failed|ENOTFOUND|ECONN/i.test(e.message) ? "Can't reach Pelican. Check the shul's internet and the Pelican site name." : e.message;
      last = { ok: false, at: Date.now(), why }; throw new Error(why);
    } finally { clearTimeout(t); }
    if (tagText(text, "success") !== "1") {
      const why = tagText(text, "message") || "Pelican said no.";
      last = { ok: false, at: Date.now(), why: "Pelican: " + why }; throw new Error("Pelican: " + why);
    }
    last = { ok: true, at: Date.now(), why: "" };
    return text;
  }

  const num = (v) => (v === undefined || v === "" || isNaN(+v) ? null : +v);
  async function list() {
    const xml = await call("get", "Thermostat", "", FIELDS.join(";"));
    return blocks(xml, "Thermostat").filter((t) => t.serialNo).map((t) => ({
      serial: t.serialNo, name: t.name || t.serialNo, group: t.groupName || "",
      temp: num(t.temperature), humidity: num(t.humidity) || null, co2: num(t.co2Level) || null, heat: num(t.heatSetting), cool: num(t.coolSetting),
      system: t.system || "", fan: t.fan || "", run: t.runStatus || "", setBy: t.setBy || "",
      online: !/unreachable/i.test(t.statusDisplay || ""), status: t.statusDisplay || "", schedule: t.schedule || "",
      limits: { heatMin: num(t.minHeatSetting), heatMax: num(t.maxHeatSetting), coolMin: num(t.minCoolSetting), coolMax: num(t.maxCoolSetting) },
    }));
  }
  // the active settings: system (Auto, Heat, Cool, Off), heat, cool, fan (Auto, On), schedule (On, Off)
  async function set(serial, v) {
    const val = {};
    if (v.system) val.system = v.system;
    if (v.heat != null) val.heatSetting = Math.round(v.heat);
    if (v.cool != null) val.coolSetting = Math.round(v.cool);
    if (v.fan) val.fan = v.fan;
    if (v.schedule) val.schedule = v.schedule;
    await call("set", "Thermostat", pairs({ serialNo: serial }), pairs(val));
  }
  async function schedule(serial) {
    const xml = await call("get", "ThermostatSchedule", pairs({ serialNo: serial }), "dayOfWeek;setTime;startTime;system;heatSetting;coolSetting;fan;keypad");
    return blocks(xml, "ThermostatSchedule").map((x) => ({ day: x.dayOfWeek, n: num(x.setTime), at: x.startTime, system: x.system, heat: num(x.heatSetting), cool: num(x.coolSetting), fan: x.fan, keypad: x.keypad }));
  }
  // replace one weekday's set times: [{min, system, heat, cool, fan, keypad}], up to 12. keypad Off locks the thermostat's screen
  async function writeDay(serial, day, entries) {
    const name = DAYS[day];
    await call("set", "ThermostatSchedule", pairs({ serialNo: serial, dayOfWeek: name }), "deleteAll;");
    for (let i = 0; i < entries.length && i < 12; i++) {
      const e = entries[i], hh = String(Math.floor(e.min / 60)).padStart(2, "0"), mm = String(e.min % 60).padStart(2, "0");
      await call("set", "ThermostatSchedule", pairs({ serialNo: serial, dayOfWeek: name, setTime: i + 1 }),
        pairs({ startTime: `${hh}:${mm}`, system: e.system || "Auto", heatSetting: Math.round(e.heat), coolSetting: Math.round(e.cool), fan: e.fan || "Auto", keypad: e.keypad === "Off" ? "Off" : "On" }));
    }
  }
  // readings Pelican kept: about every few minutes. At most 30 days per request. Times are the site's local time.
  async function history(serial, from, to) {
    const xml = await call("get", "ThermostatHistory", pairs({ serialNo: serial, startDateTime: from, endDateTime: to }), "temperature;humidity;co2Level;heatSetting;coolSetting;system;fan;runStatus;setBy;frontKeypad;timestamp");
    return blocks(xml, "History").map((h) => { const m = String(h.timestamp || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/); if (!m) return null;
      return { d: m[1], m: +m[2] * 60 + +m[3], temp: num(h.temperature), hum: num(h.humidity) || null, co2: num(h.co2Level) || null, heat: num(h.heatSetting), cool: num(h.coolSetting), system: h.system || "", fan: h.fan || "", run: h.runStatus || "", setBy: h.setBy || "", keypad: h.frontKeypad || "" }; }).filter(Boolean);
  }
  // each day of the week has its own set times
  const weekly = (serial) => call("set", "Thermostat", pairs({ serialNo: serial }), pairs({ scheduleRepeat: "Weekly", schedule: "On" }));

  // ---- Power Control Modules (light relays) ----
  // A relay is found by its serial number and name. Run times (PowerSchedule) can be for one date (repeat None)
  // or recurring; Pelican joins overlapping ones. Ones the API adds are "External"; the app's own are "Internal".
  async function powerList() {
    const xml = await call("get", "PowerOutput", "", "name;groupName;serialNo;output;setBy");
    return blocks(xml, "PowerOutput").filter((x) => x.serialNo && x.name).map((x) => ({ id: x.serialNo + ":" + x.name, serial: x.serialNo, name: x.name, group: x.groupName || "", on: /^on$/i.test(x.output || ""), setBy: x.setBy || "" }));
  }
  const relaySel = (r) => pairs({ serialNo: r.serial, name: r.name });
  const powerSet = (r, v) => call("set", "PowerOutput", relaySel(r), pairs({ output: v.output, schedule: v.schedule }));
  async function powerSchedules(r) {
    const xml = await call("get", "PowerSchedule", pairs({ serialNo: r.serial, name: r.name, origin: "all" }), "scheduleId;title;startDate;endDate;startTime;endTime;repeat;origin;name");
    return blocks(xml, "PowerSchedule").filter((x) => !x.name || x.name === r.name).map((x) => ({ id: x.scheduleId, title: x.title || "", startDate: x.startDate || "", endDate: x.endDate || "", start: x.startTime || "", end: x.endTime || "", repeat: x.repeat || "", origin: x.origin || "" }));
  }
  // one run on one date: start and end are minutes; the API can't cross midnight
  const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const powerAdd = (r, run) => call("set", "PowerSchedule", relaySel(r), pairs({ scheduleId: run.id, title: run.title || "Shul Manager", startDate: run.date, endDate: run.repeat ? "" : run.date, startTime: hm(run.start), endTime: hm(Math.min(run.end, 1439)), repeat: run.repeat || "None", editable: run.repeat ? "Yes" : "No" }));
  const powerDel = (id) => call("set", "PowerSchedule", pairs({ scheduleId: id }), "delete:Yes;");

  return { configured, base, list, set, schedule, writeDay, weekly, history, powerList, powerSet, powerSchedules, powerAdd, powerDel, status: () => ({ ...last, configured, site: base.replace(/^https:\/\//, "") }), DAYS };
}

module.exports = { createPelican, DAYS, _blocks: blocks };
