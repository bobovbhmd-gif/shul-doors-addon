// A pretend Home Assistant: weather and nothing else (no doors, no thermostats).
import http from "node:http";
export function fakeHa() {
  const server = http.createServer((req, res) => {
    const j = (x) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(x)); };
    const u = req.url, w = { entity_id: "weather.forecast_home", state: "cloudy", attributes: { temperature: 41, temperature_unit: "°F" } };
    if (u === "/api/states") return j([w]);
    if (u.startsWith("/api/states/weather")) return j(w);
    if (u.startsWith("/api/services/weather/get_forecasts")) {
      const out = []; for (let i = 0; i < 8; i++) { const d = new Date(Date.now() + i * 864e5); d.setUTCHours(17, 0, 0, 0); out.push({ datetime: d.toISOString(), temperature: 50 + i, templow: 40 + i, condition: "cloudy" }); }
      return j({ service_response: { "weather.forecast_home": { forecast: out } } });
    }
    if (u === "/api/config") return j({ latitude: 40.63, longitude: -73.99 });
    j([]);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ port: server.address().port, close: () => server.close() })));
}
