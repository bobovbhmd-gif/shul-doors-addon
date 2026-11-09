"use strict";
// The mikva magnet controller (ControlByWeb X-600M). It works out the Jewish calendar and
// sunset by itself; Shul Manager only reads its settings and log, and (when allowed) saves
// settings the same way the controller's own setup page does: state.xml?register=value.
const STD_KEYS = ["cgWdSt", "cgWdEn", "cgSbSt", "cgSbEn", "cgYtSt", "cgYtEn", "cgEsOff", "cgEsEn", "cgEyOff", "cgEyEn", "cgIv", "cgPu", "cgCarry", "cgLateEn"];
const HOL_KEYS = ["hErh", "hRh1", "hRh2", "hTzg", "hEyk", "hYk", "hEsk", "hSk1", "hSk2", "hChs", "hHr", "hSa", "hSt", "hChan", "hCh8", "hAbt", "hTae", "hPur", "hShp", "hEps", "hPs1", "hPs2", "hChp", "hE7p", "hPs7", "hPs8", "hEsh", "hSh1", "hSh2", "hSat", "hEtb", "hTb"];
const WRITABLE = new Set([...STD_KEYS, ...HOL_KEYS, "ovProf", "ovExp"]);

function parseStateXml(xml) {
  const out = {};
  const re = /<([A-Za-z][\w]*)>([^<]*)<\/\1>/g; let m;
  while ((m = re.exec(xml))) out[m[1]] = m[2].trim();
  return out;
}
function parsePresets(txt) {
  const arr = [];
  for (let c = 7; c <= 16; c++) arr.push({ code: c, name: "Custom " + (c - 6), start: 720, end: 150, mode: 0, bStart: 0, bEnd: 0, used: false });
  String(txt || "").split("\n").forEach((line) => {
    const p = line.split("|"); if (p.length < 5) return;
    const code = parseInt(p[0], 10), x = arr.find((a) => a.code === code); if (!x) return;
    Object.assign(x, { name: (p[1] || x.name).trim(), start: +p[2] || 0, end: +p[3] || 0, mode: +p[4] || 0, bStart: +p[5] || 0, bEnd: +p[6] || 0, used: true });
  });
  return arr;
}

function createMikva({ url, username = "admin", password = "", log = () => {}, fetchImpl = (...a) => fetch(...a) }) {
  const base = String(url || "").replace(/\/+$/, "");
  const headers = password ? { Authorization: "Basic " + Buffer.from(`${username || "admin"}:${password}`).toString("base64") } : {};
  let last = { ok: false, at: 0, why: base ? "Not checked yet" : "Not set up" };
  async function get(path, ms = 6000) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { const r = await fetchImpl(base + "/" + path, { headers, signal: ac.signal, cache: "no-store" }); if (r.status === 401) throw new Error("The controller asked for a password. Add it in the add-on settings."); if (!r.ok) throw new Error("The controller answered " + r.status); return await r.text(); }
    catch (e) { if (e.name === "AbortError") throw new Error("The controller didn't answer. Check that it's on and on the network."); throw e; }
    finally { clearTimeout(t); }
  }
  async function file(name) { try { const t = await get(name, 5000); return /<html/i.test(t) ? null : t; } catch { return null; } }
  return {
    configured: !!base,
    status: () => ({ ...last, configured: !!base }),
    async read() {
      if (!base) throw new Error("The mikva controller's address isn't set in the add-on settings.");
      try {
        const s = parseStateXml(await get("state.xml"));
        const num = (k) => (s[k] === undefined || s[k] === "" ? null : Number(s[k]));
        const regs = {}; [...STD_KEYS, ...HOL_KEYS, "ovProf", "ovExp", "manOv", "manExp", "cgVer"].forEach((k) => { const v = num(k); if (v !== null && !isNaN(v)) regs[k] = v; });
        const mt = String(s.time || "").match(/(\d{2}):(\d{2})/);
        const out = { ok: true, regs, relay: s.relay16 !== undefined ? s.relay16 : null, sunset: num("sunToday"), absT: num("absT"), devMin: mt ? +mt[1] * 60 + +mt[2] : null,
          presets: parsePresets(await file("mikvapre.txt")), log: String((await file("mikvalog.txt")) || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 300), at: Date.now() };
        last = { ok: true, at: Date.now(), why: "" };
        return out;
      } catch (e) { last = { ok: false, at: Date.now(), why: e.message }; throw e; }
    },
    // regs: { key: number }. Writes each, then bumps the version so the controller picks them up.
    async write(regs, cgVer) {
      const keys = Object.keys(regs || {}).filter((k) => WRITABLE.has(k));
      if (!keys.length) throw new Error("Nothing to save.");
      for (const k of keys) { const v = Math.round(Number(regs[k])); if (!Number.isFinite(v) || v < 0 || v > 99999999) throw new Error("A value for " + k + " isn't valid."); }
      for (const k of keys) await get(`state.xml?${k}=${Math.round(Number(regs[k]))}`);
      await get(`state.xml?cgVer=${Math.round(Number(cgVer) || 0) + 1}`);
      log("info", `mikva controller: saved ${keys.length} setting(s)`);
      return { ok: true, saved: keys.length };
    },
    // 0 follow the schedule, 1 release now, 2 hold open; exp is the controller's minute count (0 = until changed)
    async manual(v, exp) {
      if (![0, 1, 2].includes(+v)) throw new Error("Not a valid choice.");
      await get(`state.xml?manExp=${Math.max(0, Math.round(+exp || 0))}`);
      await get(`state.xml?manOv=${+v}`);
      log("info", `mikva controller: manual ${["follow schedule", "release", "hold open"][+v]}`);
      return { ok: true };
    },
  };
}
module.exports = { createMikva, parseStateXml, parsePresets, STD_KEYS, HOL_KEYS };
