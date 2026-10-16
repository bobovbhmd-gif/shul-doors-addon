"use strict";
// Minimal Protector.Net REST client. Same endpoints and request shapes as the
// hitchin999/protector_net Home Assistant integration (which has been tested
// against real panels). The panel's certificate is self-signed, so we accept it.
const http = require("http"), https = require("https");

class ProtectorError extends Error {}

function makeClient({ baseUrl, username, password, partitionId = null, log = () => {} }) {
  let cookie = null;
  const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

  function raw(method, path, { json, query } = {}) {
    const u = new URL(baseUrl.replace(/\/$/, "") + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined) u.searchParams.set(k, v);
    const body = json === undefined ? null : Buffer.from(JSON.stringify(json));
    const lib = u.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request(u, { method, agent: u.protocol === "https:" ? agent : undefined, timeout: 20000,
        headers: { "Content-Type": "application/json", ...(body ? { "Content-Length": body.length } : {}), ...(cookie ? { Cookie: `ss-id=${cookie}` } : {}) } },
        (res) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
          resolve({ status: res.statusCode, headers: res.headers, data });
        }); });
      req.on("timeout", () => req.destroy(new ProtectorError(`timeout ${method} ${path}`)));
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async function login() {
    const r = await raw("POST", "/auth", { json: { Username: username, Password: password } });
    if (r.status === 401 || r.status === 403) throw new ProtectorError("Protector.Net rejected the username or password");
    if (r.status >= 400) throw new ProtectorError(`login failed (${r.status})`);
    const sc = [].concat(r.headers["set-cookie"] || []).map((c) => /ss-id=([^;]+)/.exec(c)).find(Boolean);
    if (!sc) throw new ProtectorError("login gave no ss-id cookie");
    cookie = sc[1];
  }

  async function call(method, path, opts) {
    if (!cookie) await login();
    let r = await raw(method, path, opts);
    if (r.status === 401) { await login(); r = await raw(method, path, opts); }
    if (r.status >= 400) throw new ProtectorError(`${method} ${path} -> ${r.status} ${typeof r.data === "string" ? r.data.slice(0, 200) : JSON.stringify(r.data).slice(0, 200)}`);
    return r.data;
  }
  const results = (d) => (Array.isArray(d) ? d : (d && d.Results) || []);

  async function pages(path, query = {}) {
    const all = [];
    for (let p = 1; p < 200; p++) {
      const per = query.PerPage || 100;
      const got = results(await call("GET", path, { query: { ...query, PageNumber: p, PerPage: per } }));
      all.push(...got);
      if (got.length < per) break;
    }
    return all;
  }

  const api = {
    login,
    async partitions() { return results(await call("GET", "/api/Partitions/ByPrivilege/Manage_Doors", { query: { PageNumber: 1, PerPage: 500 } })); },
    async setPartition(id) { partitionId = id; },
    get partitionId() { return partitionId; },
    async doors() { return pages("/api/Doors", { PartitionId: partitionId, PerPage: 500 }); },
    async setDoorTimeZone(doorId, tzId) { return call("PUT", `/api/Doors/${doorId}`, { json: { Properties: [{ Name: "DoorTimeZoneId", Value: Number(tzId) }] } }); },
    async timeZones() { return pages("/api/DoorTimeZones", { PartitionId: partitionId, PerPage: 500 }); },
    async createTimeZone(name, description, spans) {
      const r = await call("POST", "/api/DoorTimeZones", { json: { PartitionIds: [Number(partitionId)], Name: name.slice(0, 60), Description: description.slice(0, 255), TimeSpans: spans } });
      let id = r && r.Id;
      if (!id) { // Hartmann sometimes answers Id 0 on success; find it by name and tag
        const found = (await api.timeZones()).find((t) => t.Name === name.slice(0, 60) && t.Description === description.slice(0, 255));
        id = found && found.Id;
      }
      if (!id) throw new ProtectorError(`could not create Door Time Zone ${name}`);
      return Number(id);
    },
    async timeZone(tzId) { const d = await call("GET", `/api/DoorTimeZones/${tzId}`); return (d && d.Result) || d; },
    // The list may come without the times. Ask for one schedule's times, trying the
    // likely addresses; what each answered is kept so the report can show it.
    async timeSpans(tzId) {
      const tried = [];
      const pick = (d) => { if (!d) return null; if (Array.isArray(d)) return d; const r = d.Result || d;
        if (Array.isArray(r.TimeSpans)) return r.TimeSpans; if (Array.isArray(r.Results)) return r.Results; if (Array.isArray(r)) return r; return null; };
      for (const p of [`/api/DoorTimeZones/${tzId}/TimeSpans`, `/api/DoorTimeZones/${tzId}`]) {
        try { const d = await call("GET", p); const sp = pick(d); tried.push({ p, ok: true, got: JSON.stringify(d).slice(0, 300) }); if (sp && sp.length) return { spans: sp, tried }; }
        catch (e) { tried.push({ p, ok: false, got: String(e.message).slice(0, 150) }); }
      }
      return { spans: null, tried };
    },
    async setTimeSpans(tzId, spans) { return call("PUT", `/api/DoorTimeZones/${tzId}/TimeSpans`, { json: { Id: Number(tzId), TimeSpans: spans } }); },
    async deleteTimeZone(tzId) { return call("DELETE", `/api/DoorTimeZones/${tzId}`); },
    async otrs() { return pages("/api/OneTimeRunTimeZones/Doors", { PerPage: 100 }); },
    async createOtr({ name, description, startUtc, stopUtc, doorId, mode }) {
      const r = await call("POST", "/api/OneTimeRunTimeZones/Doors", { json: { Name: name.slice(0, 60), Description: (description || "").slice(0, 255),
        StartTime: startUtc, StopTime: stopUtc, Doors: [{ Id: Number(doorId), Mode: mode }], Dates: [{ StartTime: startUtc, StopTime: stopUtc }] } });
      return r && r.Id;
    },
    async deleteOtr(id) { return call("DELETE", `/api/OneTimeRunTimeZones/Doors/${id}`); },
    async modeLegend() {   // {index: name} for schedules that report the mode as a number
      const d = await call("GET", "/api/TimeSpanStates/DoorTimeZoneMode"); const out = {};
      for (const x of (Array.isArray(d) ? d : (d && d.Results) || [])) if (x && x.index !== undefined) out[Number(x.index)] = x.name || x.Name;
      return out;
    },
    // buzz doors open for their normal unlock time (like the release button); not a schedule change
    async pulseDoors(ids) { return call("POST", "/api/PanelCommands/PulseDoor", { json: { DoorIds: ids.map(Number) } }); },
    async updatePanels() { return call("POST", "/api/PanelCommands/UpdateAll", { json: {} }); },
  };
  return api;
}

module.exports = { makeClient, ProtectorError };
