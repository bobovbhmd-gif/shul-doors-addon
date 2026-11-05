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
  const raw = pick(u, "AccessGroups", "AccessPrivilegeGroups") || [];
  const groups = raw.map((g) => (typeof g === "string" ? g : pick(g, "Name", "AccessPrivilegeGroupName", "GroupName") || "Group " + pick(g, "Id"))).filter(Boolean);
  const groupIds = raw.map((g) => (typeof g === "object" && g ? Number(pick(g, "Id", "AccessPrivilegeGroupId")) : null)).filter((x) => Number.isFinite(x));
  return {
    id: Number(id),
    creds: creds.map((c) => { const type = String(pick(c, "CredentialType", "Type") || "");
      const card = pick(c, "CardNumber"); return { type: /pin/i.test(type) && !/card/i.test(type) ? "PIN" : /card/i.test(type) && /pin/i.test(type) ? "Card and PIN" : "Card",
        name: String(pick(c, "Name") || ""), card: card && Number(card) ? "…" + String(card).slice(-4) : null }; }),
    groups, groupIds, master: !!u.IsMaster,
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
// How this server stores cards (the type name and the usual site code), learned from
// the cards people already have, so a new card is written the same way.
async function cardShape(client, store, users) {
  if (store.cardShape && store.cardShape.at && Date.now() - store.cardShape.at < 7 * 864e5) return store.cardShape;
  const types = {}, sites = {};
  for (const u of users.filter((x) => !String(x.FirstName || "").startsWith(PREFIX)).slice(0, 25)) {
    let cs = []; try { cs = await client.credentials(u.Id); } catch { continue; }
    for (const c of cs) if (Number(c.CardNumber)) { const t = String(c.CredentialType || "Card"); types[t] = (types[t] || 0) + 1; const sc = Number(c.SiteCode) || 0; sites[sc] = (sites[sc] || 0) + 1; }
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  const t = top(types), sc = top(sites);
  store.cardShape = { at: Date.now(), type: t ? t[0] : "Card", site: sc ? Number(sc[0]) : 0, seen: Object.values(types).reduce((a, b) => a + b, 0) };
  return store.cardShape;
}
// the groups a new person can be put in: the shul's own, not the box's or the integration's temporary ones
async function groups(client) {
  return (await client.apgs()).filter((g) => !/^(SD Guest - |HA Temp Access - )/.test(g.Name || "")).map((g) => ({ id: Number(g.Id), name: String(g.Name || "") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function addPerson(client, store, x, by, now) {
  const first = String(x.first || "").trim(), last = String(x.last || "").trim(), card = String(x.card || "").replace(/\D/g, ""), pin = String(x.pin || "").trim();
  if (!first && !last) throw new Error("Enter a name.");
  if (first.toUpperCase().startsWith(PREFIX)) throw new Error("A name may not start with SD-.");
  if (!card && !pin) throw new Error("Enter a card number, a PIN, or both.");
  if (card && !/^\d{1,10}$/.test(card)) throw new Error("The card number should be digits only.");
  if (pin && !/^\d{4,9}$/.test(pin)) throw new Error("The PIN must be 4 to 9 digits.");
  const users = await client.users();
  const shape = await cardShape(client, store, users);
  const site = x.site === "" || x.site == null ? shape.site : Number(x.site);
  if (!Number.isInteger(site) || site < 0 || site > 65535) throw new Error("The site code should be a number.");
  const all = await groups(client), ids = (x.groups || []).map(Number).filter((id) => all.some((g) => g.id === id));
  if (!ids.length) throw new Error("Pick at least one access group.");
  const dupe = users.find((u) => `${u.FirstName || ""} ${u.LastName || ""}`.trim().toLowerCase() === `${first} ${last}`.trim().toLowerCase());
  if (dupe && !x.sameNameOk) return { ok: false, sameName: true, message: `${first} ${last} is already in Protector.Net. Add another person with the same name?` };
  let level = 1; try { level = await client.securityLevelId(); } catch { /* default */ }
  const from = x.from ? hartmann(+x.from) : undefined, to = x.to ? hartmann(+x.to) : undefined;
  const uid = await client.createUser({ first: first || "-", last: last || "-", startUtc: from, endUtc: to, securityLevelId: level });
  const taken = (e) => /already|in use|exist|duplicate/i.test(e.message);
  try {
    if (card) { try { await client.addCard(uid, "Card " + card, card, site, shape.type); } catch (e) { throw new Error(taken(e) ? `Card ${card} already belongs to someone in Protector.Net.` : "Protector.Net did not accept the card: " + e.message.slice(0, 140)); } }
    if (pin) { try { await client.addPin(uid, `${first} ${last}`.trim(), pin); } catch (e) { throw new Error(taken(e) ? "That PIN is already used by someone in Protector.Net. Pick another." : "Protector.Net did not accept the PIN: " + e.message.slice(0, 140)); } }
  } catch (e) {
    try { await client.deleteUser(uid); } catch { /* the next look shows it */ }   // never leave a half-made person
    throw e;
  }
  const failed = [];
  for (const g of ids) { try { await client.apgAddUser(g, uid); } catch { failed.push(all.find((y) => y.id === g).name); } }
  const name = `${first} ${last}`.trim();
  log(store, { at: now, by, id: uid, name, what: "added" });
  return { ok: true, id: uid, site, type: shape.type, failed };
}
// an existing person: add a PIN, or change which groups they are in
async function editable(client, id) {
  const u = await client.user(id);
  if (!u || String(u.FirstName || "").startsWith(PREFIX)) throw new Error("not a person this page manages");
  if (u.IsMaster) throw new Error("a master user can only be changed in Protector.Net");
  return u;
}
async function addPin(client, store, id, pin, by, now) {
  pin = String(pin || "").trim();
  if (!/^\d{4,9}$/.test(pin)) throw new Error("The PIN must be 4 to 9 digits.");
  const u = await editable(client, id), name = `${u.FirstName || ""} ${u.LastName || ""}`.trim();
  try { await client.addPin(id, name, pin); }
  catch (e) { throw new Error(/already|in use|exist|duplicate/i.test(e.message) ? "That PIN is already used by someone in Protector.Net. Pick another." : "Protector.Net did not accept the PIN: " + e.message.slice(0, 140)); }
  log(store, { at: now, by, id: Number(id), name, what: "pin" });
  return { ok: true };
}
async function setGroups(client, store, id, add, remove, by, now) {
  const u = await editable(client, id), name = `${u.FirstName || ""} ${u.LastName || ""}`.trim();
  const all = await groups(client), ok = (g) => all.some((x) => x.id === Number(g));
  const failed = [];
  for (const g of (add || []).filter(ok)) { try { await client.apgAddUser(Number(g), id); } catch { failed.push(Number(g)); } }
  for (const g of (remove || []).filter(ok)) { try { await client.apgRemoveUser(Number(g), id); } catch { failed.push(Number(g)); } }
  const nm = (g) => (all.find((x) => x.id === Number(g)) || {}).name;
  const changed = [...(add || []).filter(ok).map((g) => "+" + nm(g)), ...(remove || []).filter(ok).map((g) => "-" + nm(g))];
  if (changed.length) log(store, { at: now, by, id: Number(id), name, what: "groups", groups: changed });
  return { ok: !failed.length, message: failed.length ? `Protector.Net did not accept ${failed.map(nm).join(", ")}.` : undefined };
}
function log(store, e) { store.peopleLog = [...(store.peopleLog || []), e].slice(-100); }

module.exports = { list, detail, turnOff, turnOn, statusOf, groups, addPerson, cardShape, addPin, setGroups };
