# Shul Manager tests

Not part of the add-on: Home Assistant only builds `shul_doors/`. Everything here uses a made up
building (doors T101, T102, T201, T301). Never put real door names, people or schedules in a test.

## Run

```bash
pip install pyluach==2.3.0
cd tests && npm ci
npm test            # rule engine, calendar and zmanim, overrides and budget, sync (about 5 seconds)
npm run test:ui     # main screens in a real browser at phone, tablet and PC widths (about 20 seconds)
npm run planted     # plants deliberate bugs in a copy of the add-on and checks the tests catch every one (about 4 minutes)
npm run planted:all # the same, with the screen bugs too
```

GitHub runs `npm test` and `npm run test:ui` on every pull request (Actions, "Tests").

## What is checked

| File | What |
|---|---|
| `unit/calendar.test.mjs` | Every day 2026 to 2030 against hebcal (`@hebcal/core`, the engine behind hebcal.com): Hebrew date, every holiday, fast (with postponements), Rosh Chodesh day 1 and 2, BaHaB, erev and motzei yom tov, Shovavim, Sefira, Three Weeks, Nine Days, parsha, zmanim within a minute (alos, netz, chatzos, plag, shkiah, tzeis), candle lighting and havdalah, summer and winter clock, US legal holidays. |
| `unit/engine.test.mjs` | Rule layers (by hand > situation that beats all > situation > event > schedule), rabbi away, summer and winter clock rules, "but not on", windows past midnight and over several days, Overridden by, clash check (also before the Rav is away or a situation is on), Hebrew year, Shabbos magnet. |
| `unit/planner.test.mjs` | Weekly Door Time Zones (7 days, every minute once, 20 parts a day at most), one time overrides, overrides never overlapping, hand overrides, Protector.Net's own overrides, per door budget (whole days only, 32 per door), a year of nightly plans. |
| `unit/sync.test.mjs` | Against a pretend Protector.Net (`fakes/protector.mjs`) that refuses overlaps, more than 32 overrides and broken schedules: practice writes nothing, live, pilot, restore, people's own overrides untouched, the 1 minute gap, safety stops, retrying a failed panel update, the magnet. |
| `unit/textbot.test.mjs` | The text assistant with a pretend AI: a text only mikva person is offered only the mikva tool, a door request is refused even if the AI tries, the answer without the AI, who may ask. |
| `unit/text-mikva.test.mjs` | End to end: the real server with a pretend Twilio, Home Assistant (two Meross pools) and AI. The exact reply a text only person gets, with door texting off; they can't open Shul Manager and no login can be made for them. |
| `unit/time.test.mjs` | New York time and UTC, including both clock change days. |
| `ui/screens.test.mjs` | Starts the real server (practice mode, pretend Home Assistant) and opens every main screen: no script errors, nothing empty, no sideways scrolling. Screenshots go to `tests/screens/` (not committed). |
| `planted.mjs` | The planted bugs and which test catches each. Add one whenever a test is added. |

When a test fails, read its message: it names the date, door or rule that differs.
