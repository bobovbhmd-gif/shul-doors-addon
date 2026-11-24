// Planted bugs: proves the tests catch real mistakes. Each bug is put into a fresh copy
// of the add-on (never the real files), the tests run against that copy, and the bug
// counts as caught only if the tests fail. Run: node planted.mjs   (add --ui to include the screen tests)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "shul_doors", "app");
const withUi = process.argv.includes("--ui");

const BUGS = [
  // calendar and zmanim
  ["engine/core.js", "candles:shkia-S.candleOff", "candles:shkia+S.candleOff", "candle lighting after shkiah instead of before"],
  ["engine/core.js", "tzeis:zm(sunUTCms(s,false,98.5))", "tzeis:zm(sunUTCms(s,false,97.5))", "tzeis at the wrong angle"],
  ["engine/core.js", "plag:zm(T-1.25*(T-R)/12)", "plag:zm(T-1.5*(T-R)/12)", "plag hamincha wrong"],
  ["calendar/calgen.py", "if hp.day==30: days=[prevlen,first]", "if hp.day==29: days=[prevlen,first]", "two day Rosh Chodesh picked wrong"],
  ["calendar/calgen.py", "for i in range(2,6): add(s+D(i),f'succos{i+1}','chol_any')", "for i in range(2,5): add(s+D(i),f'succos{i+1}','chol_any')", "a day of chol hamoed Succos missing"],
  ["calendar/calgen.py", "sv={12,13,14,15,16,17}|({18,19} if leap else set())", "sv={12,13,14,15,16,17}|({18} if leap else set())", "Shovavim Tat one week short"],
  ["calendar/calgen.py", "add(d+D(off),f'{tag}{n}','fast_any')", "add(d+D(off+1),f'{tag}{n}','fast_any')", "BaHaB a day late"],
  ["engine/core.js", 'function hebYear(s){let y=0;RH_DAYS.forEach(d=>{if(s>=d)y=+d.slice(0,4)+3761});return y||(RH_DAYS.length?+RH_DAYS[0].slice(0,4)+3760:5787)}', "function hebYear(s){let y=5786;RH_DAYS.forEach(d=>{if(s>=d)y++});return y}", "the old Hebrew year bug (fixed in 0.4.15)"],
  ["engine/core.js", 'return F_TZ.formatToParts(new Date(Date.UTC(y,m-1,d,17))).find(x=>x.type==="timeZoneName").value==="EDT"', 'return m>3&&m<11', "summer clock by month instead of by the real change day"],
  // rule engine
  ["engine/core.js", "const LAYER={schedule:0,event:1,situation:2,top:3}", "const LAYER={schedule:0,event:2,situation:1,top:3}", "events beat situations"],
  ["engine/core.js", 'if(r.rabbi==="away"&&!info.away) return null;', "", "rabbi away rules run when the Rav is here"],
  ["engine/core.js", 'if(r.season==="std"&&info.dst) return null;', "", "winter clock rules run in summer"],
  ["engine/core.js", "if(!r.yields||!r.yields.length||!door) return false;", "return false;", "'Overridden by' choices ignored"],
  ["engine/core.js", "const scen=real?[i=>i]:[i=>({...i,away:true,sits:allSits}),i=>({...i,away:false,sits:allSits})];", "const scen=[i=>i];", "clashes hidden until the Rav is away or a situation is on"],
  ["engine/core.js", "for(let m=Math.max(0,c.a);m<Math.min(1440,c.b);m++)", "for(let m=Math.max(0,c.a);m<=Math.min(1439,c.b);m++)", "rules run one minute too long"],
  ["engine/core.js", '((c.r&&c.r.mode==="Lockdown")?5000:0)', "0", "Lockdown no longer wins in its layer"],
  ["engine/core.js", 'function outHoly(s){return dow(s)===6||(CAL[s]||[]).includes("yt_any")}', "function outHoly(s){return dow(s)===6}", "Shabbos magnet ignores yom tov"],
  ["engine/core.js", "if(!k&&b<=a)b+=1440;", "", "windows past midnight are dropped"],
  // planner: overrides, overlaps, budget
  ["lib/planner.js", "raw.forEach((h, i) => { mine.push(...carve([h], raw.slice(i + 1))); });", "raw.forEach((h) => { mine.push(h); });", "hand overrides overlap each other"],
  ["lib/planner.js", "mine = carve(mine, theirs);", "", "portal overrides overlap Protector.Net's own"],
  ["lib/planner.js", "if (kept.length + day.length > cap)", "if (kept.length > cap)", "budget overshoots (half a day loaded)"],
  ["lib/planner.js", "Math.min(budget, 32 - (foreignActive[door] || 0))", "budget", "Protector.Net's own overrides not counted toward 32"],
  ["lib/planner.js", "const MAX_SPANS_PER_DAY = 20;", "const MAX_SPANS_PER_DAY = 24;", "more than 20 parts a day sent to the panel"],
  ["lib/planner.js", "if (prev && prev.mode === API_MODE[r.v] && prev.stop === start) prev.stop = stop;", "if (false) prev.stop = stop;", "overrides across midnight split in two"],
  // sync
  ["lib/sync.js", "const sendStop = (ms) => hartmann(minute(ms) - 60000);", "const sendStop = (ms) => hartmann(minute(ms));", "no 1 minute gap between overrides"],
  ["lib/sync.js", 'const write = mode !== "practice";', "const write = true;", "practice mode writes to the doors"],
  ["lib/sync.js", "const have = otrs.filter((o) => o.pid === pid && o.desc.startsWith(TAG) && o.stop > now);", "const have = otrs.filter((o) => o.pid === pid && o.stop > now);", "people's own overrides get deleted"],
  ["lib/sync.js", "if (leftover.size > 3 && mode !== \"restore\" && mode !== \"practice\")", "if (leftover.size > 30 && mode !== \"restore\" && mode !== \"practice\")", "safety stop for many dropped doors removed"],
  ["lib/sync.js", "else if (byName.length > 1)", "else if (byName.length > 99)", "a door named twice gets guessed"],
  ["lib/sync.js", "if ((await act(\"update panels\", () => client.updatePanels())) !== undefined) store.needUpdate = false;", "store.needUpdate = false; await act(\"update panels\", () => client.updatePanels());", "failed panel update forgotten"],
  ["lib/outputs.js", 'const managed = mode === "live" || mode === "practice" || (mode === "pilot" && pilotDoors.includes(o.id));', 'const managed = mode !== "restore";', "magnet run in pilot without being listed"],
  // texting: the text only mikva person
  ["lib/textbot.js", 'if (!mk) res = { status: "refused", why: "this person may not ask the mikva temperature" };', "if (false) res = null;", "anyone may read the mikva by text"],
  ["server.js", "const can = us.filter((u) => !u.textOnly);", "const can = us;", "a text only person can open Shul Manager"],
  ["server.js", 'if (who.textOnly) return send(res, 200, { ok: false, error: `${who.name} is text only and has no sign-in.` });', "", "a login can be made for a text only person"],
  ["server.js", 'return `${x.name}: ${t}, ${x.cur >= x.set - 1 ? "ready" : "not ready yet"}`;', 'return `${x.name}: ${t}, ${x.cur >= x.set - 10 ? "ready" : "not ready yet"}`;', "a pool 9 degrees short says ready"],
  ["server.js", "status: (u) => mtStatusText({ simple: !!u.textOnly })", "status: (u) => mtStatusText()", "text only people get set points and heating"],
  ["lib/textbot.js", "if (mikva && mikva.can(u) && mikva.only && mikva.only(u)) {", "if (false) {", "a text only person's texts go to the AI instead of the same reply"],
  ["server.js", "Send any message to this number, any time, and you'll get each pool's temperature and whether it's ready.", "Welcome.", "the welcome text has no instructions"],
  ["server.js", 'if (!meAdmin(req)) return send(res, 403, { error: "Only a super admin can send the welcome text." });', "", "anyone can send the welcome text"],
  ["server.js", "if (!textOn() && !mtTextOk(textUsers().find((x) => x.phone === from))) return;", "if (!textOn()) return;", "mikva questions unanswered while door texting is off"],
  ["lib/time.js", "const exact = cands.filter((c) => wallKey(c) === wallKeyNaive(naive)).sort((p, q) => p - q);", "const exact = cands.filter((c) => wallKey(c) === wallKeyNaive(naive)).sort((p, q) => q - p);", "fall back day uses the second 1 AM"],
];
const UI_BUGS = [
  ["public/index.html", ".ph-txt{min-width:0;max-width:100%}", "", "phone pages scroll sideways again (fixed in 0.4.15)", "ui"],
  ["public/index.html", 'if(t==="activity")renderLog();', 'if(t==="activity"){renderLog();null.x}', "a script error on the Activity screen", "ui"],
  ["public/index.html", ".ptabs{display:flex;gap:22px;margin-top:10px;overflow-x:auto;scrollbar-width:none}", ".ptabs{display:flex;gap:22px;margin-top:10px;scrollbar-width:none}", "tab row no longer scrolls on its own", "ui"],
];

const list = [...BUGS.map((b) => [...b, "unit"]), ...(withUi ? UI_BUGS : [])];
const rows = []; let missed = 0;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sd-planted-"));
try {
  for (const [file, find, repl, why, suite] of list) {
    const copy = path.join(tmpRoot, "app");
    fs.rmSync(copy, { recursive: true, force: true });
    fs.cpSync(APP, copy, { recursive: true });
    const f = path.join(copy, file), src = fs.readFileSync(f, "utf8");
    const n = src.split(find).length - 1;
    if (n !== 1) { rows.push(["SETUP", why, `text to change found ${n} times in ${file}`]); missed++; continue; }
    fs.writeFileSync(f, src.replace(find, repl));
    const files = fs.readdirSync(path.join(here, suite)).filter((x) => x.endsWith(".test.mjs")).map((x) => path.join(suite, x));
    const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], { cwd: here, env: { ...process.env, SD_APP_DIR: copy }, encoding: "utf8", timeout: 600000 });
    const failed = (r.stdout.match(/^\s*not ok \d+ - (.*)$/gm) || []).map((l) => l.replace(/^\s*not ok \d+ - /, "")).filter((l) => !/\.test\.mjs$/.test(l));
    // caught only when a named test fails; a crash (for example a typo in the planted bug) proves nothing
    if (r.status === 0) { rows.push(["MISSED", why, ""]); missed++; }
    else if (!failed.length) { rows.push(["BROKEN", why, "the copy did not run: " + (r.stdout + r.stderr).split("\n").find((l) => /Error/.test(l))]); missed++; }
    else rows.push(["caught", why, failed.slice(0, 2).join("; ")]);
    process.stdout.write(r.status === 0 ? "x" : ".");
  }
} finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
console.log("\n");
for (const [s, why, by] of rows) console.log(`${s.padEnd(7)} ${why}${by ? "\n          by: " + by.slice(0, 160) : ""}`);
console.log(`\n${rows.length - missed} of ${rows.length} planted bugs caught.`);
process.exit(missed ? 1 : 0);

