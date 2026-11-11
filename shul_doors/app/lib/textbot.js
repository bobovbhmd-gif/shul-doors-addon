"use strict";
// Open and lock doors by text message.
// Only the mobile numbers of people in Users and permissions get an answer, and they can
// change only the doors they may change in the app. Opening or buzzing a door needs the
// person's text PIN; locking (back to the schedule) does not. The PIN is kept scrambled
// (scrypt), never in plain text, and is never written to a log.
const crypto = require("crypto");

const PIN_TTL = 5 * 60e3;      // the PIN reply has to come within 5 minutes
const MAX_FAILS = 3;           // wrong PINs before opening by text stops for that phone
const LOCK_MS = 3600e3;        // for an hour
const PER_HOUR = 20;           // texts a phone may send in an hour
const OTHER = "By text I can only open or lock doors. For anything else, please use the Shul Manager app.";
const STOPWORDS = /^(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout|start|unstop|yes|help|info)$/i;

function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString("hex") };
}
function pinOk(rec, pin) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const a = crypto.scryptSync(String(pin), rec.salt, 32), b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// 4 to 8 digits, not all the same digit and not a simple run like 1234
function pinProblem(pin) {
  const p = String(pin || "");
  if (!/^\d{4,8}$/.test(p)) return "Use 4 to 8 digits.";
  if (/^(\d)\1+$/.test(p)) return "Don't use the same digit for every number.";
  const up = "0123456789", down = "9876543210";
  if (up.includes(p) || down.includes(p)) return "Don't use digits in a row, like 1234.";
  return "";
}

const TOOL = {
  name: "door_request",
  description: "What the person wants done, from their text message.",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["open", "lock", "buzz", "other"], description: "open: keep doors unlocked for some minutes. lock: lock them / close them / put them back on their schedule. buzz: unlock for a few seconds only. other: anything else." },
      doors: { type: "array", items: { type: "string" }, description: "Ids from the door list. Empty when the text doesn't say which door or it isn't on the list." },
      minutes: { type: "number", description: "How long to keep it open, in minutes. 0 when not said." },
    },
    required: ["action", "doors"],
  },
};

function createTextBot({ store, save = () => {}, users, doorsFor, isAdmin, act, ask, reply, alert = async () => {}, log = () => {}, now = () => Date.now(), timeText = (t) => new Date(t).toISOString() }) {
  store.textPins = store.textPins || {};       // person's name (lower case) -> { salt, hash, at }
  store.textPending = store.textPending || {}; // phone -> { name, action, doors, mins, at }
  store.textLock = store.textLock || {};       // phone -> { fails, until }
  const seen = {};                             // phone -> times of recent texts
  const key = (name) => String(name || "").toLowerCase();

  function setPin(name, pin) {
    const why = pinProblem(pin); if (why) return { ok: false, error: why };
    store.textPins[key(name)] = { ...hashPin(pin), at: now() }; save();
    return { ok: true };
  }
  function resetPin(name) { delete store.textPins[key(name)]; save(); return { ok: true }; }
  const hasPin = (name) => !!store.textPins[key(name)];

  const names = (list) => { const n = list.map((d) => d.name); return n.length <= 2 ? n.join(" and ") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };
  const durText = (m) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} hour${h > 1 ? "s" : ""}${r ? ` ${r} min` : ""}` : `${m} min`; };

  async function run(u, pend) {
    const list = pend.doors;
    try {
      if (pend.action === "open" && list.every((d) => d.hold)) { await act.open(u, list, pend.mins); return `${names(list)} is held open for ${durText(pend.mins)}, until ${timeText(now() + pend.mins * 60e3)}, then back to its schedule. Text "close ${list[0].name}" to end it sooner.`; }
      if (pend.action === "open") { await act.open(u, list, pend.mins); return `${names(list)} ${list.length > 1 ? "are" : "is"} open for ${durText(pend.mins)}, until ${timeText(now() + pend.mins * 60e3)}. Text "lock ${list[0].name}" to lock it sooner.`; }
      if (pend.action === "buzz") { const r = await act.buzz(u, list); return r || `${names(list)} buzzed open.`; }
    } catch (e) { log("warn", "text door request: " + e.message); return `That didn't work: ${e.message}`; }
    return OTHER;
  }

  // one text from a phone. Returns the answer to text back, or null for no answer.
  async function handle({ from, body }) {
    const t = now(), num = from, text = String(body || "").trim();
    const u = users().find((x) => x.phone === num);
    if (!u) { log("info", `text from a number that isn't in Users and permissions (ends ${String(num).slice(-4)}): no answer`); return null; }
    if (!text || STOPWORDS.test(text)) return null;   // Twilio answers STOP, START and HELP itself
    const s = seen[num] = (seen[num] || []).filter((x) => x > t - 3600e3); s.push(t);
    if (s.length > PER_HOUR) return s.length === PER_HOUR + 1 ? "Too many texts this hour. Please use the Shul Manager app." : null;
    const lock = store.textLock[num], paused = lock && lock.until > t;

    const pend = store.textPending[num];
    if (pend && t - pend.at < PIN_TTL && pend.name === u.name) {
      if (/^\d{3,10}$/.test(text)) {
        if (paused) return `Opening doors by text is paused for this phone until ${timeText(lock.until)}, after wrong PINs.`;
        if (pinOk(store.textPins[key(u.name)], text)) {
          delete store.textPending[num]; delete store.textLock[num]; save();
          log("info", `${u.name}: PIN accepted by text for ${pend.action} ${pend.doors.map((d) => d.id).join(",")}`);
          return run(u, pend);
        }
        const fails = (lock && !(lock.until && lock.until <= t) ? lock.fails || 0 : 0) + 1;
        store.textLock[num] = { fails, until: fails >= MAX_FAILS ? t + LOCK_MS : 0 };
        log("warn", `${u.name}: wrong text PIN (${fails} of ${MAX_FAILS})`);
        if (fails >= MAX_FAILS) {
          delete store.textPending[num]; save();
          alert(`${u.name}'s phone sent ${MAX_FAILS} wrong text PINs. Opening doors by text is paused for that phone for an hour.`).catch(() => {});
          return "Wrong PIN. Opening doors by text is paused for this phone for an hour.";
        }
        save();
        return `That PIN didn't match. Try again, or reply NO.`;
      }
      if (/^(no|n|nope|never ?mind|forget it)\.?$/i.test(text)) { delete store.textPending[num]; save(); return "OK, nothing was changed."; }
    }
    if (pend) { delete store.textPending[num]; save(); }   // a new request replaces an old one
    if (/^\d{3,10}$/.test(text)) return pend ? "That took more than 5 minutes, so nothing was changed. Please text your request again." : "Nothing is waiting for a PIN. Text what you need first, for example \"open Side Door 20 min\".";

    const mine = doorsFor(u);
    if (!mine.length) return "You don't have any doors you can open by text.";
    let r;
    try { r = await ask(text, mine, TOOL); } catch (e) { log("warn", "text door request: " + e.message); return "Sorry, I couldn't read that right now. Please use the Shul Manager app."; }
    if (!r || r.action === "other" || !["open", "lock", "buzz"].includes(r.action)) return OTHER;
    const ids = [...new Set((r.doors || []).map(String))], list = ids.map((id) => mine.find((d) => d.id === id)).filter(Boolean);
    if (!list.length) return `Which door? For example: "open ${mine[0].name} 20 min" or "lock ${mine[0].name}".`;

    if (r.action === "lock") {
      try { const out = await act.lock(u, list); log("info", `${u.name}: locked by text ${list.map((d) => d.id).join(",")}`); return out; }
      catch (e) { log("warn", "text lock: " + e.message); return `That didn't work: ${e.message}`; }
    }
    if (paused) return `Opening doors by text is paused for this phone until ${timeText(lock.until)}, after wrong PINs.`;
    if (!hasPin(u.name)) return "To open doors by text, first pick a text PIN in Shul Manager, at the bottom of the Open a door page.";
    let mins = Math.round(+r.minutes || 0);
    const max = isAdmin(u) ? 24 * 60 : 4 * 60;
    if (r.action === "open") {
      if (!mins) mins = 10;
      if (mins > max) return `You can open a door by text for up to ${durText(max)}.`;
    }
    store.textPending[num] = { name: u.name, action: r.action, doors: list, mins, at: t }; save();
    return r.action === "buzz"
      ? `Buzz open ${names(list)}? Reply with your text PIN to confirm, or NO.`
      : list.every((d) => d.hold) ? `Hold ${names(list)} open for ${durText(mins)}? Reply with your text PIN to confirm, or NO.`
      : `Open ${names(list)} for ${durText(mins)}? Reply with your text PIN to confirm, or NO.`;
  }

  return { handle, setPin, resetPin, hasPin, pinProblem };
}

module.exports = { createTextBot, hashPin, pinOk, pinProblem, TOOL };
