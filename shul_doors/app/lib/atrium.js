"use strict";
// The parking lot controller (CDVI Atrium). Signs in the way its web page does (login.xml,
// RC4 and MD5 with a key the controller hands out), then reads its doors and events and,
// when allowed, sends door commands: unlock_T (buzz), unlock (stay open), reset (back to normal).
const crypto = require("crypto");

function rc4Hex(key, text) {
  const s = []; for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key.charCodeAt(i % key.length)) % 256; [s[i], s[j]] = [s[j], s[i]]; }
  let i = 0; j = 0; let out = "";
  for (let y = 0; y < text.length; y++) { i = (i + 1) % 256; j = (j + s[i]) % 256; [s[i], s[j]] = [s[j], s[i]]; out += (text.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]).toString(16).padStart(2, "0").toUpperCase(); }
  return out;
}
function rc4FromHex(key, hex) {
  const s = []; for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key.charCodeAt(i % key.length)) % 256; [s[i], s[j]] = [s[j], s[i]]; }
  let i = 0; j = 0; let out = "";
  if (hex.length % 2) return "";
  for (let y = 0; y < hex.length; y += 2) { i = (i + 1) % 256; j = (j + s[i]) % 256; [s[i], s[j]] = [s[j], s[i]]; out += String.fromCharCode(parseInt(hex.substr(y, 2), 16) ^ s[(s[i] + s[j]) % 256]); }
  return out;
}
const chk = (str) => { let c = 0; for (let i = 0; i < str.length; i++) c += str.charCodeAt(i); return (c & 0xffff).toString(16).padStart(4, "0").toUpperCase(); };
const md5 = (t) => crypto.createHash("md5").update(t).digest("hex");
function decrypt(text, key) {
  const a = text.indexOf("post_enc="), b = text.indexOf("&post_chk=");
  if (a < 0 || b < 0) return text;
  const plain = rc4FromHex(key, text.slice(a + 9, b));
  return (parseInt(text.slice(b + 10), 16) & 0xffff) === (parseInt(chk(plain), 16) & 0xffff) ? plain : null;
}
const attrs = (s) => { const o = {}; const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m; while ((m = re.exec(s))) o[m[1]] = m[2] !== undefined ? m[2] : m[3]; return o; };
const tags = (xml, name) => { const out = []; const re = new RegExp(`<${name}\\b([^>]*?)\\/?>`, "g"); let m; while ((m = re.exec(xml))) out.push(attrs(m[1])); return out; };
const tagText = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, "i")); if (m) return m[1].trim(); const a = xml.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i")); return a ? a[1].trim() : ""; };
const md5u = (t) => md5(t).toUpperCase();
// a short, safe look at what the controller sent back, for the error message
const peek = (t) => String(t || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/[A-F0-9]{12,}/gi, "…").replace(/\s+/g, " ").trim().slice(0, 90) || "(empty)";

function createAtrium({ url, username, password, log = () => {}, fetchImpl = (...a) => fetch(...a) }) {
  const base = String(url || "").replace(/\/+$/, "");
  let cookie = "", key = "", at = 0, last = { ok: false, at: 0, why: base ? "Not checked yet" : "Not set up" };
  const jar = (r) => { const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(/,(?=\s*[\w-]+=)/).map((c) => c.split(";")[0].trim()).join("; "); };
  async function req(path, { method = "GET", body } = {}) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetchImpl(base + "/" + path, { method, body, signal: ac.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*", ...(cookie ? { Cookie: cookie } : {}) } });
      jar(r); if (!r.ok) throw new Error("The parking lot controller answered " + r.status);
      return await r.text();
    } catch (e) { if (e.name === "AbortError") throw new Error("The parking lot controller didn't answer. Check that it's on and on the network."); throw e; }
    finally { clearTimeout(t); }
  }
  async function login() {
    if (!base) throw new Error("The parking lot controller's address isn't set in the add-on settings.");
    if (!username || !password) throw new Error("Add the parking lot username and password in the add-on settings.");
    cookie = ""; key = ""; mode = "web";
    let first = "";
    try { first = await req("login.xml?_=" + Date.now()); } catch (e) { first = "ERR " + e.message; }
    const k1 = tagText(first, "KEY");
    if (!k1) {
      // newer controllers: the official SDK sign-in (turn on "SDK login" for the user)
      try { await sdkLogin(); return; }
      catch (e) { let found = ""; try { found = await probe(); } catch { /* best effort */ } throw new Error(`The parking lot controller didn't hand out a sign-in key. It answered: ${peek(first)}. SDK sign-in: ${e.message}.${found ? " Its web page uses: " + found : ""}`); }
    }
    const r2 = await req("login.xml", { method: "POST", body: `login_user=${rc4Hex(k1, username)}&login_pass=${md5(k1 + password)}` });
    const k2 = tagText(r2, "KEY"), err = (tags(r2, "LOGIN")[0] || {}).err;
    if (!k2 || (err && err !== "ok")) throw new Error(err === "err_password" || !k2 ? "The parking lot username or password isn't right." : "The parking lot controller refused the sign-in (" + err + ").");
    key = k2; at = Date.now();
  }
  let mode = "web", sid = "", serial = "";
  // when sign-in fails: read the controller's own web page to see which addresses it talks to
  async function probe() {
    const notes = [];
    let html = ""; try { html = await req(""); } catch (e) { notes.push("page: " + e.message); }
    const srcs = [...html.matchAll(/<script[^>]*\ssrc=["']?([^"'\s>]+)/gi)].map((m) => m[1]).slice(0, 8);
    const seen = new Set(), snips = [];
    const scan = (t) => {
      for (const m of t.matchAll(/[\w\/.-]{1,50}\.xml\b/gi)) if (seen.size < 25) seen.add(m[0]);
      for (const m of t.matchAll(/.{0,30}(?:login|\.ajax\(|\$\.(?:get|post)\(|XMLHttpRequest|url\s*:).{0,40}/gi)) if (snips.length < 6) snips.push(m[0].replace(/\s+/g, " "));
    };
    for (const sp of ["js/app.js", "js/lib.js", ...srcs.filter((x) => !/app\.js|lib\.js|^https?:/i.test(x))].slice(0, 6)) {
      try { const t = await req(sp.replace(/^\.?\//, "")); notes.push(`${sp} ${t.length}`); scan(t.slice(0, 6e6)); } catch (e) { notes.push(sp + ": " + e.message); }
    }
    if (seen.size) notes.push("xml: " + [...seen].join(" "));
    if (snips.length) notes.push("calls: " + snips.join(" | "));
    try { const host = new URL(base).hostname; for (const alt of [`http://${host}:2000`, `http://${host}:8080`]) { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000); try { const r = await fetchImpl(alt + "/login_sdk.xml?_=" + Date.now(), { signal: ac.signal }); const x = await r.text(); notes.push(`${alt}: ${r.status} ${/CONNECTION/i.test(x) ? "SDK ANSWERS" : peek(x).slice(0, 30)}`); } catch (e) { notes.push(`${alt}: ${e.name === "AbortError" ? "no answer" : "closed"}`); } finally { clearTimeout(t); } } } catch { /* bad url */ }
    return notes.join(" ; ").slice(0, 1200);
  }
  async function sdkLogin() {
    const t1 = await req("login_sdk.xml?_=" + Date.now());
    const conn = tags(t1, "CONNECTION")[0] || {}, dev = tags(t1, "DEVICE")[0] || {};
    if (!conn.session) throw new Error("no session (" + peek(t1) + ")");
    serial = dev.serial || ""; const sk = md5u(serial + conn.session);
    const body = new URLSearchParams({ sid: conn.session, cmd: "login", login_user: rc4Hex(sk, username), login_pass: md5u(sk + password) }).toString();
    const t2 = await req("login_sdk.xml?_=" + Date.now(), { method: "POST", body });
    const c2 = tags(t2, "CONNECTION")[0] || {}, cfg = tags(t2, "SDK_CFG")[0] || {};
    if (c2.err && c2.err !== "ok") throw new Error(c2.err === "err_password" ? "the username or password isn't right" : c2.err);
    if (c2.lock === "1") throw new Error("locked after too many tries; sign in once on the controller's web page");
    if (!cfg.user_id || cfg.user_id === "-1") throw new Error("the controller refused the sign-in. Turn on SDK login for this user");
    sid = c2.session || conn.session; key = md5u(serial + sid); mode = "sdk"; at = Date.now();
  }
  async function sdk(xml) {
    const body = `post_enc=${rc4Hex(key, xml)}&post_chk=${chk(xml)}`;
    const t = await req("sdk.xml", { method: "POST", body });
    const plain = decrypt(t, key); if (plain === null) throw new Error("couldn't read the controller's answer");
    const err = (tags(plain, "REC")[0] || {}).err; if (err && err !== "ok") throw new Error("the controller said " + err);
    return plain;
  }
  async function call(path, { body } = {}) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      if (!key || Date.now() - at > 20 * 60e3) await login();
      const text = await req(path, body ? { method: "POST", body: `post_enc=${rc4Hex(key, body)}&post_chk=${chk(body)}` } : {});
      const plain = decrypt(text, key);
      if (plain !== null && !/<LOGIN\b/.test(plain)) { at = Date.now(); return plain; }
      key = "";   // the session ended: sign in again once
    }
    throw new Error("The parking lot controller keeps asking to sign in again.");
  }
  const ok = (x) => { last = { ok: true, at: Date.now(), why: "" }; return x; };
  const bad = (e) => { last = { ok: false, at: Date.now(), why: e.message }; throw e; };
  return {
    mode: () => mode,
    configured: !!base,
    status: () => ({ ...last, configured: !!base }),
    async test() { try { await login(); return ok({ ok: true }); } catch (e) { return bad(e); } },
    async doors() {
      try {
        if (!key) await login();
        if (mode === "sdk") {
          const xml = await sdk(`<?xml version="1.0" encoding="utf-8"?><SDK xmlns='https://www.cdvi.ca/'><RECORDS><REC trans_id='1' cmd='read' sernum='${serial}' type='door' id_min='0' id_max='16' rec='cfg'/></RECORDS></SDK>`);
          return ok(tags(xml, "DATA").filter((d) => d.valid === undefined || d.valid === "1").map((d, i) => ({ id: d.guid || d.id || `${serial}:${i}`, name: d.name || d.label || `Door ${i + 1}`, state: d.status || d.state || "", raw: d })));
        }
        const xml = await call("doors.xml?_=" + Date.now());
        const list = tags(xml, "DOOR").map((d) => ({ id: d.id || d.door_id || "", name: d.name || d.label || d.id || "", state: (d.state || d.status || d.lock || "").toString(), raw: d })).filter((d) => d.id);
        return ok(list);
      } catch (e) { return bad(e); }
    },
    async events(page = 1) {
      try {
        const q = `event_size=40&event_page_nb=${page}&event_obj_type=10&event_obj_id=&event_serial=0&event_last_ts=-1&event_last_ser=-1&event_last_evt=-1&event_serial_start=0&event_serial_end=FFFFFFFF&_=${Date.now()}`;
        const xml = await call("events.xml?" + q);
        return ok(tags(xml, "EVENT").map((e) => ({ t: Date.parse(e.time || "") || 0, ser: e.serial || e.ser || "", text: e.desc || e.description || e.evt_desc || e.msg || e.event || "", who: e.user || e.user_name || "", door: e.door || e.obj_name || e.object || "", raw: e })));
      } catch (e) { return bad(e); }
    },
    async command(doorId, cmd) {
      if (!/^[A-F0-9]{8}:\d{1,2}$/i.test(String(doorId))) throw new Error("That isn't a parking lot door.");
      const c = { buzz: "unlock_T", open: "unlock", reset: "reset" }[cmd]; if (!c) throw new Error("Not a door command.");
      try { await call("doors.xml", { body: `doors_cmd=${c}&doors_id=${doorId}` }); log("info", `parking lot: ${cmd} ${doorId}`); return ok({ ok: true }); }
      catch (e) { return bad(e); }
    },
  };
}
module.exports = { createAtrium, rc4Hex, rc4FromHex, decrypt, chk };
