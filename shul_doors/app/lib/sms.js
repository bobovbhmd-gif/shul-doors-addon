"use strict";
// Text messages through Twilio (door alerts and, later, guest codes).
//   off  : nothing is sent and nothing is kept
//   test : nothing is sent; each text is written to the log so it can be checked in the app
//   live : sent through the shul's Twilio Messaging Service
// Only people marked as having agreed to get texts are ever texted, and anyone who
// replied STOP (Twilio refuses with error 21610) is never texted again.
const fs = require("fs");

const PREFIX = "K'hal Shaarei Zion: ";
const SUFFIX = " Reply STOP to opt out.";
const PER_HOUR = 60;

function e164(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (/^\+1\d{10}$/.test(d)) return d;
  const n = d.replace(/\D/g, "");
  if (n.length === 10) return "+1" + n;
  if (n.length === 11 && n[0] === "1") return "+" + n;
  return null;
}
function text(body) {
  let t = String(body || "").trim();
  if (!t.startsWith(PREFIX.trim())) t = PREFIX + t;
  if (!/reply stop/i.test(t)) t += SUFFIX;
  return t.slice(0, 600);
}

function createSms({ opts, file, store, save = () => {}, log = () => {}, now = () => Date.now(), fetchImpl = fetch }) {
  const mode = ["off", "test", "live"].includes(opts.sms_mode) ? opts.sms_mode : "test";
  const url = process.env.SD_TWILIO_URL || `https://api.twilio.com/2010-04-01/Accounts/${opts.twilio_account_sid}/Messages.json`;
  const configured = !!(opts.twilio_account_sid && opts.twilio_api_key_sid && opts.twilio_api_key_secret && opts.twilio_messaging_service_sid);
  store.smsOptOut = store.smsOptOut || [];
  const sent = [];   // times, for the hourly guard
  let entries = [];
  try { entries = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(-500); } catch { /* first start */ }
  const keep = (e) => { entries.push(e); if (entries.length > 500) entries = entries.slice(-500); try { fs.appendFileSync(file, JSON.stringify(e) + "\n"); } catch { /* disk */ } };

  // secret: a word (a password) that is sent but never written to the texts log
  async function sendOne(to, body, kind, { secret } = {}) {
    const num = e164(to);
    const full = text(body);
    const e = { at: now(), to: num || String(to), body: secret ? full.split(secret).join("••••••") : full, kind, mode };
    if (!num) { e.status = "skipped"; e.why = "not a US mobile number"; keep(e); return e; }
    if (store.smsOptOut.includes(num)) { e.status = "skipped"; e.why = "replied STOP"; keep(e); return e; }
    if (mode === "off") return { ...e, status: "off" };
    if (mode === "test") { e.status = "test"; keep(e); return e; }
    if (!configured) { e.status = "error"; e.why = "Twilio details missing in the add-on settings"; keep(e); return e; }
    const t = now(); while (sent.length && sent[0] < t - 3600e3) sent.shift();
    if (sent.length >= PER_HOUR) { e.status = "skipped"; e.why = "more than " + PER_HOUR + " texts this hour"; keep(e); return e; }
    sent.push(t);
    try {
      const r = await fetchImpl(url, { method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(opts.twilio_api_key_sid + ":" + opts.twilio_api_key_secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: num, MessagingServiceSid: opts.twilio_messaging_service_sid, Body: full }).toString() });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { e.status = "sent"; e.sid = j.sid; }
      else {
        e.status = "error"; e.why = (j.code ? j.code + ": " : "") + String(j.message || r.status).slice(0, 160);
        if (j.code === 21610) { store.smsOptOut.push(num); save(); e.why = "this number replied STOP"; }
      }
    } catch (x) { e.status = "error"; e.why = String(x.message || x).slice(0, 160); }
    if (e.status === "error") log("warn", `text to ${num} failed: ${e.why}`);
    keep(e); return e;
  }

  // send one text to everyone who agreed (contacts from the app)
  async function toContacts(state, body, kind) {
    const list = ((state && state.contacts) || []).filter((c) => c.sms && c.consentAt && e164(c.to));
    const out = [];
    for (const c of list) out.push({ name: c.name, ...(await sendOne(c.to, body, kind)) });
    return out;
  }

  // each alert goes out once per key (for example the same problem is not texted every hour)
  store.smsSentKeys = store.smsSentKeys || {};
  async function alertOnce(state, key, body, kind, everyMs = 6 * 3600e3) {
    const last = store.smsSentKeys[key];
    if (last && now() - last < everyMs) return null;
    if (!((state && state.contacts) || []).some((c) => c.sms && c.consentAt && e164(c.to))) return null;   // nobody to tell yet: try again later
    store.smsSentKeys[key] = now();
    for (const [k, t] of Object.entries(store.smsSentKeys)) if (now() - t > 7 * 864e5) delete store.smsSentKeys[k];
    save();
    return toContacts(state, body, kind);
  }

  // an alert for chosen people only; a number gets texts only if it agreed (it's a contact with consent)
  async function alertTo(state, phones, key, body, kind, everyMs = 3600e3) {
    const ok = new Set(((state && state.contacts) || []).filter((c) => c.sms && c.consentAt && e164(c.to)).map((c) => e164(c.to)));
    const to = [...new Set((phones || []).map((x) => e164(x)).filter((x) => x && ok.has(x)))];
    if (!to.length) return null;
    const last = store.smsSentKeys[key];
    if (last && now() - last < everyMs) return null;
    store.smsSentKeys[key] = now(); save();
    const out = []; for (const n of to) out.push(await sendOne(n, body, kind));
    return out;
  }
  return { mode, configured, sendOne, toContacts, alertOnce, alertTo, list: (n = 50) => entries.slice(-n).reverse(), optedOut: () => store.smsOptOut.slice() };
}

module.exports = { createSms, e164, text };
