"use strict";
// Sign-in accounts in Home Assistant, made from Shul Manager.
// Talks to Home Assistant's WebSocket API through the Supervisor (the add-on's own key).
// Passwords pass straight through to Home Assistant and are never stored or logged here.
const http = require("http");
const crypto = require("crypto");

// a very small WebSocket client: text frames only, enough for Home Assistant's API
function wsConnect(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url.replace(/^ws/, "http"));
    const key = crypto.randomBytes(16).toString("base64");
    const req = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": key } });
    const timer = setTimeout(() => { req.destroy(); reject(new Error("Home Assistant didn't answer")); }, timeoutMs);
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.on("response", (res) => { clearTimeout(timer); reject(new Error("Home Assistant refused the connection (" + res.statusCode + ")")); });
    req.on("upgrade", (res, sock) => {
      clearTimeout(timer);
      let buf = Buffer.alloc(0), frag = [], onMsg = () => {}, closed = false;
      const send = (text) => {
        const data = Buffer.from(text), mask = crypto.randomBytes(4);
        let head;
        if (data.length < 126) head = Buffer.from([0x81, 0x80 | data.length]);
        else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
        const body = Buffer.alloc(data.length); for (let i = 0; i < data.length; i++) body[i] = data[i] ^ mask[i & 3];
        sock.write(Buffer.concat([head, mask, body]));
      };
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          if (buf.length < 2) return;
          const fin = buf[0] & 0x80, op = buf[0] & 0x0f; let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.subarray(off, off + len); buf = buf.subarray(off + len);
          if (op === 0x9) { const h = Buffer.from([0x8a, 0x80 | payload.length]), m = Buffer.alloc(4); sock.write(Buffer.concat([h, m, payload])); continue; }   // ping -> pong
          if (op === 0x8) { closed = true; sock.end(); return; }
          if (op === 0x1 || op === 0x0) { frag.push(payload); if (fin) { const t = Buffer.concat(frag).toString("utf8"); frag = []; try { onMsg(JSON.parse(t)); } catch { /* not JSON */ } } }
        }
      });
      sock.on("error", () => {}); sock.on("close", () => { closed = true; });
      resolve({ send: (o) => send(JSON.stringify(o)), onMessage: (f) => { onMsg = f; }, close: () => { if (!closed) { try { sock.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); } catch { /* gone */ } sock.end(); } } });
    });
    req.end();
  });
}

function createHaAuth({ url, token, log = () => {}, connect = wsConnect }) {
  async function session(fn) {
    if (!url || !token) throw new Error("This box can't reach Home Assistant's sign-in system.");
    const ws = await connect(url);
    let id = 0; const waiting = new Map(); let authed = null;
    const authP = new Promise((res, rej) => { authed = { res, rej }; });
    ws.onMessage((m) => {
      if (m.type === "auth_required") ws.send({ type: "auth", access_token: token });
      else if (m.type === "auth_ok") authed.res();
      else if (m.type === "auth_invalid") authed.rej(new Error("Home Assistant didn't accept the add-on's key."));
      else if (m.type === "result" && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.success ? w.res(m.result) : w.rej(new Error((m.error && m.error.message) || "Home Assistant said no.")); }
    });
    const call = (type, data = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send({ id: n, type, ...data }); setTimeout(() => { if (waiting.has(n)) { waiting.delete(n); rej(new Error("Home Assistant didn't answer in time.")); } }, 15000); });
    try { await Promise.race([authP, new Promise((_, rej) => setTimeout(() => rej(new Error("Home Assistant didn't answer.")), 10000))]); return await fn(call); }
    finally { ws.close(); }
  }
  const isAdmin = (u) => (u.group_ids || []).includes("system-admin") || u.is_owner;
  const hasLocal = (u) => (u.credentials || []).some((c) => c.type === "homeassistant" || c.auth_provider_type === "homeassistant");
  function findUser(list, { username, name }) {
    const people = list.filter((u) => !u.system_generated);
    const un = String(username || "").toLowerCase(), nm = String(name || "").toLowerCase();
    return (un && people.find((u) => String(u.username || "").toLowerCase() === un)) || (nm && people.find((u) => String(u.name || "").toLowerCase() === nm)) || null;
  }
  // only plain accounts can be changed from here: never Home Assistant admins, the owner or system accounts
  function guard(u) {
    if (!u) throw new Error("No sign-in was found for them in Home Assistant.");
    if (isAdmin(u)) throw new Error("This person is a Home Assistant administrator. Change their password in Home Assistant itself.");
  }
  return {
    async list() {
      return session(async (call) => (await call("config/auth/list")).filter((u) => !u.system_generated).map((u) => ({ name: u.name, username: u.username || "", active: u.is_active !== false, admin: !!isAdmin(u), local: hasLocal(u) })));
    },
    // which area each entity is in (entity's own area, else its device's area)
    async areas() {
      return session(async (call) => {
        const [ents, devs, areas] = await Promise.all([call("config/entity_registry/list"), call("config/device_registry/list"), call("config/area_registry/list")]);
        const an = new Map(areas.map((a) => [a.area_id, a.name])), dev = new Map(devs.map((d) => [d.id, d]));
        const out = {}; for (const e of ents) { const d = dev.get(e.device_id) || {}; const a = e.area_id || d.area_id; const ml = (d.identifiers || []).find((x) => x[0] === "meross_lan");
          if ((a && an.has(a)) || ml) out[e.entity_id] = { area: an.get(a) || "", platform: e.platform || "", uuid: ml ? String(ml[1]) : "", device: e.device_id || "" }; }
        return out;
      });
    },
    async create({ name, username, password }) {
      if (!/^[a-z0-9._-]{2,32}$/i.test(String(username || ""))) throw new Error("Use a username of 2 to 32 letters, numbers, dots or dashes.");
      if (String(password || "").length < 8) throw new Error("Use a password of at least 8 characters.");
      return session(async (call) => {
        const list = await call("config/auth/list");
        if (list.some((u) => String(u.username || "").toLowerCase() === String(username).toLowerCase())) throw new Error(`The username ${username} is already taken in Home Assistant.`);
        const made = await call("config/auth/create", { name: String(name).slice(0, 60), group_ids: ["system-users"], local_only: false });
        const uid = made && made.user && made.user.id;
        if (!uid) throw new Error("Home Assistant didn't create the account.");
        try { await call("config/auth_provider/homeassistant/create", { user_id: uid, username: String(username), password: String(password) }); }
        catch (e) { try { await call("config/auth/delete", { user_id: uid }); } catch { /* leave it */ } throw e; }
        log("info", `login created in Home Assistant for ${name} (${username})`);
        return { ok: true };
      });
    },
    async setPassword({ name, username, password }) {
      if (String(password || "").length < 8) throw new Error("Use a password of at least 8 characters.");
      return session(async (call) => {
        const u = findUser(await call("config/auth/list"), { username, name }); guard(u);
        await call("config/auth_provider/homeassistant/admin_change_password", { user_id: u.id, password: String(password) });
        log("info", `password reset in Home Assistant for ${name}`);
        return { ok: true };
      });
    },
    async setActive({ name, username, on }) {
      return session(async (call) => {
        const u = findUser(await call("config/auth/list"), { username, name }); guard(u);
        await call("config/auth/update", { user_id: u.id, is_active: !!on });
        log("info", `login ${on ? "turned on" : "turned off"} in Home Assistant for ${name}`);
        return { ok: true };
      });
    },
  };
}
module.exports = { createHaAuth, wsConnect };
