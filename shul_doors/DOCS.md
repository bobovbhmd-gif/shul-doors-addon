# Shul Manager

Runs the shul's Hartmann Protector.Net doors, the mikva magnet and the parking lot by zmanim,
Jewish holidays, events and situations, with the Shul Manager portal in the Home Assistant sidebar.

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
- Opening or locking a door by hand, switching a situation, or setting the rabbi away reaches the doors within a few seconds; other changes within about 20 seconds.
- **Buzz open** (super admins) unlocks a door for a few seconds, like the release button. It doesn't change any schedule and is written to the history.
- **Open a door** on Home: tap it, pick a door, then Buzz open or open it for 5, 10, 20, 30 or 60 minutes.
- **Live entries** (admins) shows the last 100 entries and door changes, newest first. While it's open the box reads the doors every few seconds.
- **Shabbos magnet** (Settings): the magnet output is Off from candle lighting until a set time after Shabbos or yom tov ends, including two-day yom tov. Protector.Net has no one-time changes for outputs, so the box rewrites the output's weekly schedule every night for the coming 7 days. To let the box run it in pilot, add `MAG` to pilot_doors. Taking it off the list puts back the schedule it had before.
- **Speak instead of typing**: with an OpenAI key in `openai_api_key` (Configuration), speech goes to OpenAI's transcription (model in `stt_model`, about $0.006 a minute), which is told the shul's door names and words like Shabbos and Rabbeinu Tam so it spells them right. Without a key, the browser's own speech typing is used when it can, then Whisper on the box.
- **Screenshots in the assistant**: tap the paperclip, paste (Ctrl+V) or drop up to 4 pictures. They are made smaller before sending.
- **Text alerts (Twilio)**: `sms_mode` is `test` (nothing is sent, each text is listed under Settings, Alerts, Recent texts), `live` or `off`. For live, enter `twilio_account_sid`, an API key (`twilio_api_key_sid`, `twilio_api_key_secret`) and `twilio_messaging_service_sid`. Only contacts marked as having agreed get texts; anyone who replies STOP is never texted again. Alerts that work now: a door held open (from Home Assistant's door sensors), the box failing to update the doors, and rules that overlap.
- Every run reads everything back and compares it with the rules minute by minute.
- If the box is off: holidays stay exact for as long as they were loaded (about a month); ordinary days slowly drift by the zmanim
  (about a minute a day), because the weekly schedule is not being rewritten.

## Not connected yet
Guest codes and vendor access, badge access rules, alerts (texts and emails), door contact sensors, power and UPS status.
The portal says so where they appear.

## Settings
- `protector_url`: like `https://192.168.10.200:11001`
- `protector_username` / `protector_password`: a Protector.Net System Administrator. Type these here yourself.
- `partition`: leave empty to use the first partition.
- `sync_time`: nightly run, New York time.
- `mikva_url`: the mikva magnet controller (ControlByWeb X-600M), like `http://192.168.1.50`. Add `mikva_password` only if its password protection is on.
- `atrium_url`: the parking lot controller (CDVI Atrium), like `http://192.168.1.60:8081`, with `atrium_username` / `atrium_password` of a user made for Shul Manager. Type these here yourself.
- Changes to the mikva magnet and opening the parking lot stay off until a super admin turns them on under Settings, Controllers.
- Parking lot schedule: each entrance can be Normal (key tags), Open (anyone) or Locked, by weekly times, Yom Tov, one-off dates, or by hand. Times can follow the zmanim (for example Shkiah minus 30). Locked isn't connected to the controller yet; until it is, a Locked entrance is left as it was.
- Mikva heat-ups: from the temperature log, how long each pool takes for the preheat and for the heat to the temperature people use, with a suggested start time. The "isn't warming up" alert compares the rise with each pool's usual speed.
- Sign-in accounts: Shul Manager makes and resets Home Assistant logins for the people you add. It never changes a Home Assistant administrator, and passwords are never stored.

## Door activity
Reports read the card swipes from the Protector.Net integration's "Last Door Log" sensors in Home Assistant (read only) and keep them for about a year.

## Your data
Rules and settings are in the add-on's data folder, with a copy every day for 60 days (`backups`).
If the rules file is ever damaged, the newest good copy is loaded and the damaged one is kept. If there is no good copy,
the add-on pauses and changes nothing; the doors keep running on what is already in the panels.
