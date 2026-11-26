# Shul Manager (formerly Shul Doors): handoff for Claude Code

Home Assistant add-on that runs Congregation K'hal Shaarei Zion Bobov's building by zmanim,
Jewish holidays, events and situations: Hartmann Protector.Net doors, the Shabbos magnet,
the mikva magnet and thermostats, the parking lot (CDVI Atrium), and now HVAC (Pelican) and lighting.
Owner: Hershy (Operations and Facilities Manager). Moved here from the claude.ai chat
"Shul Doors: build and fix" (Nov 2026). `shul_doors/DOCS.md` is the user facing manual: read it first.

**THIS REPO IS PUBLIC.** Never commit door names, IP addresses, logins, API keys, PINs, phone numbers,
emails, schedules or anything from the box. Before every push, grep for real names and `sk-ant`.
Rules, door names and codes live only on the box.

## Ground rules (from Hershy)
- Ask before changing anything on the live Home Assistant box or the doors. Never use Home Assistant
  door controls directly.
- Passwords, keys and tunnel tokens are typed only by Hershy. Never ask him to paste them in chat.
- Show a mockup (screenshots) for approval before publishing any visual change.
- Test thoroughly before every release ("take all the time you need"). He likes independent review
  passes: cross check calendar and zmanim against hebcal, plant deliberate bugs to prove the tests catch them.
- Keep the UI clean and simple, like an Apple dashboard. No fake or sample data once live.
- Rollout pattern for every new device type: read only first, then pilot on a few, then live.
- Wording in the app and in messages: no dashes (em/en); "summer clock / winter clock", not daylight
  saving; "Overrides / Overridden by" plus rule numbers, not "gives way to". Plain language.
- Replies to Hershy: short, numbered, copy pasteable steps; exact click paths.

## Release process
1. Bump `version` in `shul_doors/config.yaml` and `shul_doors/app/version.txt` (same number).
2. Run the tests (`tests/README.md`): `cd tests && npm test && npm run test:ui`, and `npm run planted` when
   tests or logic changed. Look at `tests/screens/` (phone 390px, tablet, PC). GitHub runs the tests on every PR.
3. Commit as `0.x.y: what changed` on a branch and open a pull request (GitHub runs the tests).
4. When Hershy says "push the update" (or "merge it") in chat, merge the pull request: that is his final yes
   and makes it a release (Home Assistant only sees `main`). Never merge without his words in chat.
5. Hershy updates in Home Assistant: Settings, Add-ons (Apps), Shul Manager, Update.
   If HA refuses, the Supervisor needs updating first.
Current version: 0.4.16.

## Where the code is
- `shul_doors/app/server.js`: Node server (ingress port 8099, text port), portal API.
- `shul_doors/app/public/index.html`: the whole portal UI (single file).
- `shul_doors/app/engine/`: rule engine (`core.js`), `load.js`.
- `shul_doors/app/lib/`: `protector.js` (Hartmann API), `sync.js` / `planner.js` / `sched.js` (nightly
  plan and writes), `outputs.js` (magnets), `mikva.js` / `mtemp.js` (ControlByWeb, Meross/Shelly temps),
  `atrium.js` (parking), `pelican.js` / `hvac.js` / `hvplan.js` (HVAC), `lights.js`, `sms.js` / `textbot.js`
  (Twilio texting and AI text assistant), `access.js` / `hauth.js` / `people.js` (users, Cloudflare Access),
  `activity.js` (card swipe reports), `weather.js`, `codes.js`, `time.js`.
- `shul_doors/app/calendar/calgen.py`: Jewish calendar generation.
- Local run for testing: `SD_DATA=/tmp/x SD_PORT=8199 SD_TEXT_PORT=8198 SD_ANY_IP=1 SD_HA_URL=http://127.0.0.1:8197/api SD_HA_TOKEN=x node server.js`
  with header `X-Remote-User-Name: Hershy` (Playwright for screenshots).

**Development files** are in the private repo `bobovbhmd-gif/shul-manager-dev` (never copy them here):
HVAC schedules editor source (`src/hv4.js`, `src/hv4.css`, `src/plan_block.js`), build scripts
(`src/port.py`, `src/gen.py`, `src/mk2.sh`) that build it into `public/index.html`, the fake Pelican and
Home Assistant (`src/pelmock.js`, `src/hamock.js`), Playwright screenshot scripts, and the demo.
See its README. The old test suite and `tools/publish.py` were lost; a new suite is in `tests/` (calendar and
zmanim against hebcal, rule engine, planner, sync against a pretend Protector.Net, main screens, planted bugs).
Add tests for anything you change, and a planted bug in `tests/planted.mjs` for each new check.

## Design decisions
- Rule priority is layered, not scored: by hand > situation that beats all > situation > event > regular schedule.
  Overlapping rules need an explicit admin choice (clash chooser), detected even when rabbi away or
  situation conditions are not set yet.
- Each door gets its own weekly Door Time Zone `SD <door>`, rewritten nightly; the old one is remembered for restore.
- Holidays, fasts, events, rabbi away, situations load as one time overrides up to `horizon_days`
  ahead, within `budget` per door (panel limit 32 per door, including people's own overrides, which are never touched).
- Overrides on one door must never overlap; Hartmann needs a 1 minute gap.
- Modes: practice, pilot (`pilot_doors`), live, restore. The system went live on all doors in early Nov 2026.
- Shabbos magnet: off from candle lighting until after Rabbeinu Tam, via nightly
  rewrite of the output's weekly schedule (outputs have no one time overrides).
- "The magnet" in casual talk usually means the mikva magnet (holds the mikva door open).
- Card only vs Card or PIN: members have PINs for outdoor doors, so Card only is the restrictive mode
  (used for chasunas etc.). Hershy can't change badge group access in Protector.Net.
- Rosh Chodesh: tish or lechaim when the Rav is local; 2 day RC = day 1 lechaim, day 2 tish; 1 day = tish;
  tish is in the morning after Shacharis and Musaf (also on Shabbos); RC Tishrei follows Rosh Hashana;
  RC Av is lechaim only with its own schedule. Affects lighting and HVAC only, not doors.
- Temporary maintenance and setup windows (open doors, lights, HVAC for an event setup), above regular schedule.
- Texting: door opens and temporary locks by texting the shul's Twilio number as a natural AI
  conversation; no text PIN (caller ID spoofing seen as the only real risk). Door texts and member
  notices use separate numbers and campaigns.
- Remote access: Cloudflare Tunnel with Cloudflare Access email code sign in (60 day sessions);
  new users added to Access automatically from Shul Manager.

## Roadmap (Hershy's stated plans)
- HVAC: staying with Pelican; heat and cool by zmanim or clock, thermostats grouped by area,
  per person per area permissions; schedule UI should look like Pelican's, with rules on individual
  changes (skip or only when the Rav is away, weddings, holidays, Rosh Chodesh), outdoor temperature
  rules. Users set every switch point; Claude may only suggest. Read only, then pilot, then live.
- Lighting: replace Zeitech controllers (API has fees and limits) with local controllers that keep
  their own schedules (Shelly being considered); import Pelican lighting controls into a Lighting section.
- Mikva: whole schedule (lighting, filters, water temperature); Meross thermostats being replaced by Shelly.
- Parking: wire up Locked; controller logs in Shul Manager.
- AI and text assistant to cover every device added.
