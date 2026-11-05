"use strict";
// The people in Protector.Net (cardholders), read only, plus two actions a super
// admin confirms one person at a time: turn their access off (their ExpiresOn is set
// to now) and turn it back on (the ExpiresOn they had before is put back). Nobody is
// ever added or deleted here, cards and PINs are never changed, and Protector.Net
// stays the place where people and their access groups are set up.
const { fromHartmann, hartmann } = require("./time");
const { PREFIX } = require("./codes");

const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== "") return o[k]; return null; };
const when = (v) => { if (!v) return null; const t = fromHartmann(String(v).replace(/Z$/, "").slice(0, 19)); return Number.isFinite(t) ? t : null; };

function statusOf(u, now, off) {
  const a = when(pick(u, "StartedOn", "StartDate")), b = when(pick(u, "ExpiresOn", "ExpirationDate"));
  if (off) return "off";
  if (b != null && b <= now) return "expired";
  if (a != null && a > now) return "notyet";
  return "active";
}
function brief(u, now, store) {
  const id = Number(u.Id), off = store.peopleOff && store.peopleOff[id];
  return { id, first: String(u.FirstName || ""), last: String(u.LastName || ""), state: statusOf(u, now, off),
    from: when(pick(u, "StartedOn")), until: when(pick(u, "ExpiresOn")), master: !!u.IsMaster, offBy: off ? off.by : null, offAt: off ? off.at : null };
}
// the list, cached for a few minutes (guest code users are left out)
async function list(client, store, now, cache, fresh) {
  if (!fresh && cache.at && now - cache.at < 5 * 60e3) return cache.data;
  const users = await client.users();
  const data = { at: now, people: users.filter((u) => !String(u.FirstName || "").startsWith(PREFIX)).map((u) => brief(u, now, store))
    .sort((x, y) => (x.last + " " + x.first).localeCompare(y.last + " " + y.first)) };
  cache.at = now; cache.data = data;
  return data;
}
// one person: their cards and PINs (PINs never shown, card numbers only the last 4) and groups
async function detail(client, id) {
  const u = await client.user(id);
  let creds = [];
  try { creds = await client.credentials(id); } catch { /* not offered */ }
  const groups = (pick(u, "AccessGroups", "AccessPrivilegeGroups") || []).map((g) => (typeof g === "string" ? g : pick(g, "Name", "AccessPrivilegeGroupName", "GroupName") || "Group " + pick(g, "Id"))).filter(Boolean);
  return {
    id: Number(id),
    creds: creds.map((c) => { const type = String(pick(c, "CredentialType", "Type") || "");
      const card = pick(c, "CardNumber"); return { type: /pin/i.test(type) && !/card/i.test(type) ? "PIN" : /card/i.test(type) && /pin/i.test(type) ? "Card and PIN" : "Card",
        name: String(pick(c, "Name") || ""), card: card && Number(card) ? "…" + String(card).slice(-4) : null }; }),
    groups,
    fields: Object.keys(u || {}).slice(0, 60),   // so the shape of a real server can be checked
  };
}
async function turnOff(client, store, id, by, now) {
  store.peopleOff = store.peopleOff || {};
  if (store.peopleOff[id]) return { ok: true, already: true };
  const u = await client.user(id);
  if (!u || String(u.FirstName || "").startsWith(PREFIX)) throw new Error("not a person this page manages");
  if (u.IsMaster) throw new Error("a master user can only be changed in Protector.Net");
  const prev = pick(u, "ExpiresOn");
  await client.setUserExpires(id, hartmann(now));
  store.peopleOff[id] = { prev: prev == null ? null : String(prev).replace(/Z$/, "").slice(0, 19), at: now, by, name: `${u.FirstName || ""} ${u.LastName || ""}`.trim() };
  log(store, { at: now, by, id: Number(id), name: store.peopleOff[id].name, what: "off" });
  return { ok: true };
}
async function turnOn(client, store, id, by, now) {
  const o = store.peopleOff && store.peopleOff[id];
  if (!o) throw new Error("this person was not turned off here, so turn them back on in Protector.Net");
  await client.setUserExpires(id, o.prev);
  delete store.peopleOff[id];
  log(store, { at: now, by, id: Number(id), name: o.name, what: "on" });
  return { ok: true };
}
function log(store, e) { store.peopleLog = [...(store.peopleLog || []), e].slice(-100); }

module.exports = { list, detail, turnOff, turnOn, statusOf };
