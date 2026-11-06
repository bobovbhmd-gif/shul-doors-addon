"use strict";
// Keeps the Cloudflare sign-in list (an Access rule group, "Shul Doors users" by default)
// in step with the emails of the users in Shul Doors. Adding a user's email lets them
// through the code screen; removing it locks them out on every device.
// Safety: it never writes an empty list, and never one without a super admin's email
// (or an "always allow" email), so the shul can't be locked out by a mistake here.
const API = process.env.SD_CF_API || "https://api.cloudflare.com/client/v4";
const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

function wanted(users, always) {
  const set = new Set(String(always || "").split(/[,\s]+/).filter(okEmail).map((e) => e.toLowerCase()));
  for (const u of users || []) if (okEmail(u.email)) set.add(u.email.trim().toLowerCase());
  return [...set].sort();
}

async function syncAccess({ token, accountId, group = "Shul Doors users", users, always, fetchImpl = fetch }) {
  if (!token) return { on: false };
  const call = async (method, path, body) => {
    const r = await fetchImpl(API + path, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(((j.errors && j.errors[0] && j.errors[0].message) || "Cloudflare answered " + r.status).slice(0, 160));
    return j.result;
  };
  let acc = accountId;
  if (!acc) { const a = await call("GET", "/accounts?per_page=5"); acc = a && a[0] && a[0].id; if (!acc) throw new Error("the Cloudflare key can't see any account"); }
  const groups = await call("GET", `/accounts/${acc}/access/groups?per_page=100`);
  const g = (groups || []).find((x) => x.name === group);
  if (!g) throw new Error(`no Access rule group named "${group}" in Cloudflare`);
  const now = (g.include || []).filter((r) => r.email && r.email.email).map((r) => r.email.email.toLowerCase()).sort();
  const want = wanted(users, always);
  const admins = new Set([...String(always || "").split(/[,\s]+/).filter(okEmail).map((e) => e.toLowerCase()),
    ...(users || []).filter((u) => u.role === "Super admin" && okEmail(u.email)).map((u) => u.email.trim().toLowerCase())]);
  if (!want.length || !want.some((e) => admins.has(e))) return { on: true, skipped: true, emails: now, why: "No super admin has an email yet, so the sign-in list was left as it is. Add your email to your own user first." };
  const added = want.filter((e) => !now.includes(e)), removed = now.filter((e) => !want.includes(e));
  // keep any rules in the group that aren't single emails (for example an "emails ending in" rule)
  const other = (g.include || []).filter((r) => !(r.email && r.email.email));
  if (added.length || removed.length) {
    await call("PUT", `/accounts/${acc}/access/groups/${g.id}`, { name: g.name, include: [...other, ...want.map((email) => ({ email: { email } }))], exclude: g.exclude || [], require: g.require || [] });
  }
  return { on: true, emails: want, added, removed };
}

module.exports = { syncAccess, wanted, okEmail };
