// End to end: a text only mikva person texts the shul's number. The real server runs with a
// pretend Twilio, Home Assistant (two Meross pools) and AI, all on this machine.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { APP, baseState } from "../helpers.mjs";

const ACCT = "AC" + "0".repeat(32);
const PH = { mk: "+17185550102", gabbai: "+17185550103", boss: "+17185550101" };
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

let fake, fakePort, srv, textPort, appPort, data, out = "";
const inbound = new Map(), sent = [], aiCalls = [];
let aiScript = null;

before(async () => {
  fake = http.createServer((req, res) => {
    const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8"), u = req.url, j = (x) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(x)); };
      // Home Assistant: two Meross mikva thermostats
      if (u === "/api/config") return j({ unit_system: { temperature: "°F" } });
      if (u === "/api/states") return j([
        { entity_id: "climate.mts960_big_pool", state: "heat", last_changed: new Date().toISOString(), attributes: { friendly_name: "Mikva Big pool", current_temperature: 104.2, temperature: 104, hvac_action: "idle", preset_mode: "schedule_heating" } },
        { entity_id: "climate.mts960_small_pool", state: "heat", last_changed: new Date().toISOString(), attributes: { friendly_name: "Mikva Small pool", current_temperature: 95.4, temperature: 104, hvac_action: "heating", preset_mode: "schedule_heating" } },
      ]);
      if (u.startsWith("/api/")) return j([]);
      // Twilio: confirm an incoming text, and take outgoing ones
      const m = u.match(/\/Messages\/(SM\w+)\.json$/);
      if (m && inbound.has(m[1])) return j({ direction: "inbound", ...inbound.get(m[1]) });
      if (u === "/send") { const p = new URLSearchParams(body); sent.push({ to: p.get("To"), body: p.get("Body") }); return j({ sid: "SM" + "1".repeat(32), status: "queued" }); }
      // the AI
      if (u === "/ai") { const r = JSON.parse(body); aiCalls.push(r); return j(aiScript(r, aiCalls.length)); }
      res.statusCode = 404; res.end();
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r)); fakePort = fake.address().port;
  const F = `http://127.0.0.1:${fakePort}`;
  data = fs.mkdtempSync(path.join(os.tmpdir(), "sd-text-"));
  const st = baseState({
    users: [
      { name: "Tester", role: "Super admin", phone: PH.boss },
      { name: "Mikva Lady", role: "Restricted", textOnly: "mikva", login: false, phone: PH.mk, perm: {}, sched: "none", can: {} },
      { name: "Gabbai", role: "Restricted", phone: PH.gabbai, perm: { T101: "edit" }, sched: "none", can: { override: true, text: true } },
    ],
    alerts: { textDoors: false },   // door texting is off: the mikva must still answer
  });
  fs.writeFileSync(path.join(data, "state.json"), JSON.stringify(st));
  fs.writeFileSync(path.join(data, "options.json"), JSON.stringify({ mode: "practice", sms_mode: "live", twilio_account_sid: ACCT, twilio_api_key_sid: "SK" + "0".repeat(32), twilio_api_key_secret: "x", twilio_messaging_service_sid: "MG" + "0".repeat(32), anthropic_api_key: "test" }));
  [appPort, textPort] = [await freePort(), await freePort()];
  srv = spawn(process.execPath, ["server.js"], { cwd: APP, env: { ...process.env, SD_DATA: data, SD_PORT: String(appPort), SD_TEXT_PORT: String(textPort), SD_ANY_IP: "1",
    SD_HA_URL: `${F}/api`, SD_HA_TOKEN: "x", SD_HA_WS: "", SD_TWILIO_API: F, SD_TWILIO_URL: `${F}/send`, SD_AI_URL: `${F}/ai`, SD_MT_MS: "3600000" } });
  srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 100 && !/texts from Twilio on port/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  assert.match(out, /texts from Twilio on port/, out);
});
after(() => { srv?.kill(); fake?.close(); if (data) fs.rmSync(data, { recursive: true, force: true }); });

let n = 0;
async function text(from, body) {
  const sid = "SM" + String(++n).padStart(32, "0"), hook = JSON.parse(fs.readFileSync(path.join(data, "store.json"), "utf8")).textHook;
  inbound.set(sid, { from, body });
  const before = sent.length, ai = aiCalls.length;
  const r = await fetch(`http://127.0.0.1:${textPort}/twilio/sms/${hook}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ MessageSid: sid, AccountSid: ACCT, From: from, Body: body, NumMedia: "0" }) });
  assert.equal(r.status, 200);
  for (let i = 0; i < 40 && sent.length === before; i++) await new Promise((res) => setTimeout(res, 50));
  await new Promise((res) => setTimeout(res, 150));
  return { replies: sent.slice(before), ai: aiCalls.slice(ai) };
}
// the pretend AI: reads the mikva when it may, and passes the answer on
const mikvaAi = (r) => {
  const last = r.messages.at(-1);
  if (Array.isArray(last.content) && last.content[0].type === "tool_result") return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.parse(last.content[0].content).result || "I can only tell you the mikva temperature." }] };
  if (/open|door/i.test(last.content) && r.tools.some((t) => t.name === "do_door")) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "do_door", input: { action: "open", doors: ["T101"], minutes: 30 } }] };
  if (r.tools.some((t) => t.name === "mikva_temperature") && /water|mikva|ready|hot|warm/i.test(last.content)) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "b", name: "mikva_temperature", input: {} }] };
  return { stop_reason: "end_turn", content: [{ type: "text", text: "Sorry, by text I can only tell you the mikva temperature." }] };
};

const SIMPLE = /^Mikva now \(.+\):\nBig pool: 104°, ready\nSmall pool: 95°, not ready yet$/;

test("any text gets each pool's temperature and ready or not, without the AI", async () => {
  aiScript = () => { throw new Error("the AI should not be asked"); };
  for (const body of ["is the water ready yet?", "mikva temp", "hello", "open the front door for 30 min"]) {
    const { replies, ai } = await text(PH.mk, body);
    assert.equal(ai.length, 0, body);
    assert.equal(replies.length, 1, body + "\n" + out);
    assert.equal(replies[0].to, PH.mk);
    assert.match(replies[0].body, SIMPLE, body);
  }
  assert.doesNotMatch(out, /opened|unlock/i);
});

test("a voice note or picture gets the same reading; STOP gets nothing from us", async () => {
  const sid = "SM" + "9".repeat(32), hook = JSON.parse(fs.readFileSync(path.join(data, "store.json"), "utf8")).textHook;
  inbound.set(sid, { from: PH.mk, body: "" });
  const before = sent.length;
  await fetch(`http://127.0.0.1:${textPort}/twilio/sms/${hook}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ MessageSid: sid, AccountSid: ACCT, From: PH.mk, Body: "", NumMedia: "1", MediaContentType0: "audio/amr", MediaUrl0: "https://api.twilio.com/x" }) });
  for (let i = 0; i < 40 && sent.length === before; i++) await new Promise((res) => setTimeout(res, 50));
  assert.match(sent.at(-1).body, SIMPLE);
  const { replies } = await text(PH.mk, "STOP");
  assert.equal(replies.length, 0);
});

test("the welcome text: the shul's name, short instructions, and how to stop", async () => {
  const before = sent.length;
  const r = await (await fetch(`http://127.0.0.1:${appPort}/api/sms/mikvawelcome`, { method: "POST", headers: { "X-Remote-User-Name": "Tester", "content-type": "application/json" }, body: JSON.stringify({ name: "Mikva Lady" }) })).json();
  assert.deepEqual(r, { ok: true });
  const w = sent.slice(before);
  assert.equal(w.length, 1); assert.equal(w[0].to, PH.mk);
  assert.equal(w[0].body, "K'hal Shaarei Zion: Hi Mikva, you can now get the mikva temperature by text. Send any message to this number, any time, and you'll get each pool's temperature and whether it's ready. Reply STOP to opt out.");
  assert.doesNotMatch(w[0].body, /[\u2013\u2014]/, "no dashes");
  const no = await (await fetch(`http://127.0.0.1:${appPort}/api/sms/mikvawelcome`, { method: "POST", headers: { "X-Remote-User-Name": "Gabbai", "content-type": "application/json" }, body: JSON.stringify({ name: "Mikva Lady" }) })).json();
  assert.match(no.error || "", /Only a super admin/);
  const other = await (await fetch(`http://127.0.0.1:${appPort}/api/sms/mikvawelcome`, { method: "POST", headers: { "X-Remote-User-Name": "Tester", "content-type": "application/json" }, body: JSON.stringify({ name: "Gabbai" }) })).json();
  assert.equal(other.ok, false, "only for text only mikva people");
});

test("someone without the mikva switch gets nothing while door texting is off", async () => {
  const { replies } = await text(PH.gabbai, "mikva temp");
  assert.equal(replies.length, 0);
});

test("a text only person can't open Shul Manager, and has no login to make", async () => {
  const r = await fetch(`http://127.0.0.1:${appPort}/`, { headers: { "X-Remote-User-Name": "Mikva Lady" } });
  const html = await r.text();
  assert.doesNotMatch(html, /__SD_STATE/, "the app is not served to them");
  const l = await (await fetch(`http://127.0.0.1:${appPort}/api/logins/create`, { method: "POST", headers: { "X-Remote-User-Name": "Tester", "content-type": "application/json" }, body: JSON.stringify({ name: "Mikva Lady", username: "mikva.lady", password: "longenough1" }) })).json();
  assert.equal(l.ok, false);
  assert.match(l.error, /text only/);
});
