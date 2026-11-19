"use strict";
// The outdoor temperature, for the heat and AC rules. Two sources:
//  "ha": Home Assistant's own weather forecast (the weather.* entity it comes with), read through the add-on's access
//  "nws": the National Weather Service, for the location set in Home Assistant (no account or key needed)
// Everything is kept in °F. days[date] = { hi, lo } for New York dates.

function createWeather({ haUrl, token, log = () => {}, nyParts, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  let data = { now: null, days: {}, at: 0, src: "", err: "", entity: "" };
  const toF = (v, unit) => (v == null || isNaN(+v) ? null : /C/i.test(String(unit || "")) ? Math.round(((+v) * 9) / 5 + 32) : Math.round(+v));
  const ha = async (p, opt = {}) => {
    if (!haUrl || !token) throw new Error("No Home Assistant access on this box.");
    const r = await fetchImpl(haUrl + p, { ...opt, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Home Assistant answered ${r.status}`);
    return r.json();
  };
  const nyDate = (iso) => nyParts(Date.parse(iso)).d;

  async function fromHa(entity) {
    let id = entity;
    if (!id) { const all = await ha("/states"); const w = all.find((x) => /^weather\./.test(x.entity_id)); if (!w) throw new Error("Home Assistant has no weather forecast."); id = w.entity_id; }
    const st = await ha("/states/" + encodeURIComponent(id)), unit = (st.attributes || {}).temperature_unit;
    const r = await ha("/services/weather/get_forecasts?return_response", { method: "POST", body: JSON.stringify({ entity_id: id, type: "daily" }) });
    const fc = (((r.service_response || r)[id]) || {}).forecast || [];
    const days = {};
    fc.forEach((f) => { if (!f.datetime) return; const d = nyDate(f.datetime); days[d] = { hi: toF(f.temperature, unit), lo: toF(f.templow, unit) }; });
    return { now: toF((st.attributes || {}).temperature, unit), days, entity: id };
  }

  let nwsPoint = null;
  async function fromNws() {
    const ua = { headers: { "User-Agent": "ShulManager (Home Assistant add-on)", Accept: "application/geo+json" }, signal: AbortSignal.timeout(15000) };
    const get = async (u) => { const r = await fetchImpl(u, ua); if (!r.ok) throw new Error(`The weather service answered ${r.status}`); return r.json(); };
    if (!nwsPoint) {
      const c = await ha("/config");
      if (c.latitude == null) throw new Error("Home Assistant has no location set.");
      const p = await get(`https://api.weather.gov/points/${(+c.latitude).toFixed(4)},${(+c.longitude).toFixed(4)}`);
      const st = await get(p.properties.observationStations);
      nwsPoint = { forecast: p.properties.forecast, station: ((st.features || [])[0] || {}).id };
    }
    const f = await get(nwsPoint.forecast), days = {};
    (f.properties.periods || []).forEach((x) => {
      const d = nyDate(x.startTime), t = toF(x.temperature, x.temperatureUnit === "C" ? "C" : "F");
      if (x.isDaytime) (days[d] = days[d] || {}).hi = t;
      else { const next = nyDate(x.endTime); (days[next] = days[next] || {}).lo = t; }   // a night's low counts for the morning it ends in
    });
    let cur = null;
    if (nwsPoint.station) { try { const o = await get(nwsPoint.station + "/observations/latest"); cur = toF(o.properties.temperature.value, "C"); } catch { /* no reading */ } }
    return { now: cur, days, entity: "" };
  }

  async function refresh(src = "ha", entity = "") {
    try {
      const r = src === "nws" ? await fromNws() : await fromHa(entity);
      data = { ...r, days: { ...pruned(), ...r.days }, at: now(), src, err: "" };
    } catch (e) { data = { ...data, err: e.message, src }; log("warn", "weather: " + e.message); }
    return data;
  }
  // keep the last two weeks of days (past days stay as they were last forecast)
  function pruned() { const cut = nyParts(now() - 14 * 864e5).d, out = {}; Object.entries(data.days || {}).forEach(([d, v]) => { if (d >= cut) out[d] = v; }); return out; }
  return { refresh, get: () => data, set: (d) => { if (d && d.days) data = { ...data, ...d }; } };
}

module.exports = { createWeather };
