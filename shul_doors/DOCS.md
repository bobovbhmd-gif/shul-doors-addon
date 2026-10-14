# Shul Doors

Runs the shul's Hartmann Protector.Net doors by zmanim, Jewish holidays, events and situations,
with the Shul Doors portal in the Home Assistant sidebar.

## Modes
- **practice** (start here): reads Protector.Net and writes down what it would do. Nothing at the doors changes.
  The banner and **See details** also show where the rules you entered differ from what the doors do today and tomorrow.
- **pilot**: only the doors listed in `pilot_doors` (for example `D301, D302`) are run by this add-on.
- **live**: every door in the portal is run by this add-on.
- **restore**: puts every door back on the schedule it had before, removes this add-on's schedules and overrides, then does nothing. Use it to switch the system off.

Practice mode never changes anything. Switching from live to practice leaves the doors on the last schedule the add-on loaded
(special days for about a month ahead). To hand the doors back, use **restore**.

Safety: if more than 3 doors drop off the list at once (for example by mistake), they are not put back automatically.
Use restore, or take doors off one or two at a time.

## How it runs the doors
- Each door gets its own weekly Door Time Zone named `SD <door>`, rewritten every night with the coming week's times.
  The door's previous Door Time Zone is remembered so it can be put back.
- Holidays, fasts, events, rabbi away and situations are loaded ahead as one-time overrides (up to `horizon_days` ahead,
  at most `budget` per door, whole days only). They are stored on the panels, so the doors keep following them even if this box is off.
- Overrides people make in Protector.Net are never touched, and they count toward the panel's limit of 32 per door.
- Opening or locking a door by hand in the portal reaches the door within a few seconds; other changes within about 20 seconds.
- Every run reads everything back and compares it with the rules minute by minute.
- If the box is off: holidays stay exact for as long as they were loaded (about a month); ordinary days slowly drift by the zmanim
  (about a minute a day), because the weekly schedule is not being rewritten.

## Not connected yet
Guest codes and vendor access, badge access rules, alerts (texts and emails), door activity reports, power and UPS status.
The portal says so where they appear.

## Settings
- `protector_url`: like `https://192.168.10.200:11001`
- `protector_username` / `protector_password`: a Protector.Net System Administrator. Type these here yourself.
- `partition`: leave empty to use the first partition.
- `sync_time`: nightly run, New York time.

## Your data
Rules and settings are in the add-on's data folder, with a copy every day for 60 days (`backups`).
If the rules file is ever damaged, the newest good copy is loaded and the damaged one is kept. If there is no good copy,
the add-on pauses and changes nothing; the doors keep running on what is already in the panels.
