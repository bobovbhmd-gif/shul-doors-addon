// A pretend Protector.Net that keeps its own doors, schedules and overrides in memory,
// and refuses what the real one refuses: overlapping overrides on one door (stop
// times are the LAST minute an override runs), more than 32 per door, more than 20
// parts per day in a schedule, and days that are not fully covered.
const parse = (s) => Date.parse(String(s).replace(/Z$/i, "").slice(0, 19) + "Z");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fakeProtector({ doors = [], outputs = [] } = {}) {
  let nextId = 1000;
  const db = {
    doors: doors.map((d, i) => ({ Id: d.Id ?? i + 1, Name: d.Name, DoorTimeZoneId: d.DoorTimeZoneId ?? 1 })),
    tzs: [{ Id: 1, Name: "Their own schedule", Description: "", TimeSpans: DAYS.map((d) => ({ DayOfWeek: d, StartTime: 0, StopTime: 1439, Mode: "CardOrPin" })) }],
    otrs: [], outputs: outputs.map((o, i) => ({ Id: 500 + i, Name: o.zone, TimeSpans: o.spans || [] })),
    calls: [], panelsUpdated: 0, fail: {},
  };
  const log = (name, ...a) => { db.calls.push([name, ...a]); if (db.fail[name]) throw new Error(db.fail[name]); };
  function checkSpans(spans) {
    for (const d of DAYS) {
      const day = spans.filter((s) => s.DayOfWeek === d).sort((a, b) => a.StartTime - b.StartTime);
      if (day.length > 20) throw new Error(`${d}: ${day.length} parts, the panel holds 20`);
      if (!day.length) continue;
      if (day[0].StartTime !== 0 || day[day.length - 1].StopTime !== 1439) throw new Error(`${d} is not fully covered`);
      for (let i = 1; i < day.length; i++) if (day[i].StartTime !== day[i - 1].StopTime + 1) throw new Error(`${d}: gap or overlap at ${day[i].StartTime}`);
    }
  }
  const client = {
    db,
    async doors() { log("doors"); return structuredClone(db.doors); },
    async timeZones() { log("timeZones"); return structuredClone(db.tzs); },
    async timeSpans(id) { log("timeSpans", id); const t = db.tzs.find((x) => x.Id === Number(id)); return { spans: t ? structuredClone(t.TimeSpans) : [] }; },
    async modeLegend() { return null; },
    async createTimeZone(name, description, spans) {
      log("createTimeZone", name); checkSpans(spans);
      const Id = nextId++; db.tzs.push({ Id, Name: name, Description: description, TimeSpans: structuredClone(spans) }); return Id;
    },
    async setTimeSpans(id, spans) { log("setTimeSpans", id); checkSpans(spans); db.tzs.find((x) => x.Id === Number(id)).TimeSpans = structuredClone(spans); return {}; },
    async deleteTimeZone(id) {
      log("deleteTimeZone", id);
      if (db.doors.some((d) => Number(d.DoorTimeZoneId) === Number(id))) throw new Error("schedule is in use by a door");
      db.tzs = db.tzs.filter((x) => x.Id !== Number(id)); return {};
    },
    async setDoorTimeZone(pid, tzId) {
      log("setDoorTimeZone", pid, tzId);
      if (!db.tzs.some((t) => t.Id === Number(tzId))) throw new Error("no such schedule");
      db.doors.find((d) => d.Id === pid).DoorTimeZoneId = Number(tzId); return {};
    },
    async otrs() { log("otrs"); return structuredClone(db.otrs); },
    async createOtr({ name, description, startUtc, stopUtc, doorId, mode }) {
      log("createOtr", doorId, mode, startUtc, stopUtc);
      const a = parse(startUtc), b = parse(stopUtc);
      if (!(b >= a)) throw new Error("stop before start");
      if (a % 60000 || b % 60000) throw new Error("times must be whole minutes");
      for (const o of db.otrs.filter((x) => x.DoorId === doorId)) if (a <= parse(o.StopTime) && parse(o.StartTime) <= b) throw new Error(`overlaps override ${o.Id} (${o.StartTime} to ${o.StopTime})`);
      if (db.otrs.filter((o) => o.DoorId === doorId && parse(o.StopTime) >= db.now).length >= 32) throw new Error("32 overrides on this door already");
      const Id = nextId++;
      db.otrs.push({ Id, Name: name, Description: description, Mode: mode, StartTime: startUtc, StopTime: stopUtc, DoorId: doorId, DoorName: db.doors.find((d) => d.Id === doorId)?.Name });
      return Id;
    },
    async deleteOtr(id) { log("deleteOtr", id); db.otrs = db.otrs.filter((o) => o.Id !== id); return {}; },
    async updatePanels() { log("updatePanels"); db.panelsUpdated++; return {}; },
    async outputZones() { return structuredClone(db.outputs.map(({ Id, Name }) => ({ Id, Name }))); },
    async outputZoneSpans(id) { return structuredClone(db.outputs.find((o) => o.Id === id).TimeSpans); },
    async setOutputZoneSpans(id, spans) { log("setOutputZoneSpans", id); db.outputs.find((o) => o.Id === id).TimeSpans = structuredClone(spans); return {}; },
    async users() { return []; },
    async apgs() { return []; },
    // what we wrote, for checks
    writes() { return db.calls.filter(([n]) => !["doors", "timeZones", "otrs", "timeSpans"].includes(n)); },
  };
  db.now = Date.now();
  return client;
}
export const fromHartmann = parse;
