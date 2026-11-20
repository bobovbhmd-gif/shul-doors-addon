"use strict";
// The outdoor temperature, for the heat and AC rules. Two sources:
//  "ha": Home Assistant's own weather forecast (the weather.* entity it comes with), read through the add-on's access
//  "nws": the National Weather Service, for the location set in Home Assistant (no account or key needed)
// Everything is kept in °F. days[date] = { hi, lo, cond, rain } for New York dates; hours = the next 24 hours { t, temp, cond, rain }.
// cond is one word: sunny, clear-night, partlycloudy, cloudy, rainy, pouring, snowy, snowy-rainy, lightning-rainy, fog, windy (Home Assistant's names)

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
  const pct = (v) => (v == null || isNaN(+v) ? null : Math.round(+v));
  // the weather service writes words ("Chance Rain Showers"); turn them into Home Assistant's condition names
  const nwsCond = (txt, day) => { const t = String(txt || "").toLowerCase();
    return /thunder/.test(t) ? "lightning-rainy" : /snow|flurr|sleet/.test(t) ? (/rain/.test(t) ? "snowy-rainy" : "snowy") : /heavy rain|downpour/.test(t) ? "pouring" : /rain|shower|drizzle/.test(t) ? "rainy" : /fog|haze|mist/.test(t) ? "fog" : /wind|breez/.test(t) ? "windy" : /mostly cloudy|overcast|^cloudy/.test(t) ? "cloudy" : /partly|mostly sunny|mostly clear|few clouds/.test(t) ? "partlycloudy" : day === false ? "clear-night" : "sunny"; };

  async function fromHa(entity) {
    let id = entity;
    if (!id) { const all = await ha("/states"); const w = all.find((x) => /^weather\./.test(x.entity_id)); if (!w) throw new Error("Home Assistant has no weather forecast."); id = w.entity_id; }
    const st = await ha("/states/" + encodeURIComponent(id)), unit = (st.attributes || {}).temperature_unit;
    const r = await ha("/services/weather/get_forecasts?return_response", { method: "POST", body: JSON.stringify({ entity_id: id, type: "daily" }) });
    const fc = (((r.service_response || r)[id]) || {}).forecast || [];
    const days = {};
    fc.forEach((f) => { if (!f.datetime) return; const d = nyDate(f.datetime); days[d] = { hi: toF(f.temperature, unit), lo: toF(f.templow, unit), cond: f.condition || "", rain: pct(f.precipitation_probability) }; });
    let hours = [];
    try {
      const h = await ha("/services/weather/get_forecasts?return_response", { method: "POST", body: JSON.stringify({ entity_id: id, type: "hourly" }) });
      hours = ((((h.service_response || h)[id]) || {}).forecast || []).filter((f) => f.datetime && Date.parse(f.datetime) > now() - 3600e3).slice(0, 24).map((f) => ({ t: Date.parse(f.datetime), temp: toF(f.temperature, unit), cond: f.condition || "", rain: pct(f.precipitation_probability) }));
    } catch { /* this forecast has no hourly */ }
    const a = st.attributes || {};
    return { now: toF(a.temperature, unit), cond: st.state || "", hum: pct(a.humidity), wind: a.wind_speed != null ? Math.round(+a.wind_speed) : null, windUnit: a.wind_speed_unit || "", feels: toF(a.apparent_temperature, unit), days, hours, entity: id };
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
      nwsPoint = { forecast: p.properties.forecast, hourly: p.properties.forecastHourly, station: ((st.features || [])[0] || {}).id };
    }
    const f = await get(nwsPoint.forecast), days = {};
    (f.properties.periods || []).forEach((x) => {
      const d = nyDate(x.startTime), t = toF(x.temperature, x.temperatureUnit === "C" ? "C" : "F");
      const rain = pct((x.probabilityOfPrecipitation || {}).value);
      if (x.isDaytime) { const o = (days[d] = days[d] || {}); o.hi = t; o.cond = nwsCond(x.shortForecast, true); o.rain = Math.max(o.rain || 0, rain || 0); }
      else { const next = nyDate(x.endTime); (days[next] = days[next] || {}).lo = t; }   // a night's low counts for the morning it ends in
    });
    let hours = [];
    if (nwsPoint.hourly) { try { const h = await get(nwsPoint.hourly); hours = (h.properties.periods || []).filter((x) => Date.parse(x.endTime) > now()).slice(0, 24).map((x) => ({ t: Date.parse(x.startTime), temp: toF(x.temperature, x.temperatureUnit === "C" ? "C" : "F"), cond: nwsCond(x.shortForecast, x.isDaytime), rain: pct((x.probabilityOfPrecipitation || {}).value) })); } catch { /* no hourly */ } }
    let cur = null, cond = "", hum = null, wind = null;
    if (nwsPoint.station) { try { const o = (await get(nwsPoint.station + "/observations/latest")).properties; cur = toF(o.temperature.value, "C"); cond = nwsCond(o.textDescription, !!(hours[0] && hours[0].cond !== "clear-night")); hum = pct((o.relativeHumidity || {}).value); const w = (o.windSpeed || {}).value; wind = w == null ? null : Math.round(w * 0.621371); } catch { /* no reading */ } }
    return { now: cur, cond, hum, wind, windUnit: "mph", feels: null, days, hours, entity: "" };
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
