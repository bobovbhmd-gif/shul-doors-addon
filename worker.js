// Congregation K'hal Shaarei Zion: the shul's public website (info.khalbobov.org), with its text message pages.
const CSS = `
:root{--ink:#14213d;--ink2:#3d4a66;--gold:#b08d3c;--gold2:#8a6a22;--paper:#fbf8f1;--card:#ffffff;--line:#e6dfcf;--soft:#f3eee1}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--paper)}
a{color:var(--gold2)}h1,h2,h3,.brand b,.he{font-family:Georgia,"Times New Roman",serif}
.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
.top{background:var(--ink);color:#fff}.top .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 24px;padding-top:14px;padding-bottom:14px}
.brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none}.brand svg{flex:none}.brand b{display:block;font-size:19px;letter-spacing:.2px}.brand span{display:block;font-size:13px;color:#d9c48e}
.top nav{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:15px}.top nav a{color:#e9ecf3;text-decoration:none}.top nav a:hover,.top nav a.on{color:#e7cf8f}
.hero{background:linear-gradient(180deg,var(--ink) 0%,#1d2f55 100%);color:#fff;text-align:center;padding:64px 0 72px}
.hero .he{font-size:34px;color:#e7cf8f;margin:0 0 6px;direction:rtl;text-align:center}.hero h1{text-align:center;font-size:44px;line-height:1.15;margin:0 0 14px;font-weight:700}
.hero p{max-width:640px;margin:0 auto 26px;color:#d5dbea;font-size:19px}.rule{width:72px;height:2px;background:var(--gold);margin:18px auto}
.btn{display:inline-block;background:var(--gold);color:#14213d;font-weight:650;text-decoration:none;padding:12px 22px;border-radius:999px;margin:4px}.btn.ghost{background:transparent;color:#fff;border:1.5px solid #8794b3}
main{padding:44px 0 28px}main.page{padding-top:36px}main.page .wrap{max-width:780px}
h1{font-size:34px;line-height:1.2;margin:0 0 12px}h2{font-size:26px;margin:44px 0 12px}h3{font-size:19px;margin:0 0 6px}
.kicker{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2);margin:0 0 6px}
.lead{font-size:19px;color:var(--ink2)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px}.card p{margin:0;color:var(--ink2);font-size:16px}
.ico{width:40px;height:40px;border-radius:12px;background:var(--soft);display:grid;place-items:center;margin-bottom:12px;color:var(--gold2)}
.band{background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:36px 0;margin:48px 0 0}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;align-items:start}
.box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 22px;margin:16px 0}
.msg{background:#eef3fb;border-radius:16px 16px 16px 4px;padding:10px 14px;margin:8px 0;font-size:15.5px;max-width:520px}
.info{list-style:none;padding:0;margin:0}.info li{padding:10px 0;border-bottom:1px solid var(--line)}.info li:last-child{border:0}.info b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold2)}

.map{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--soft)}.map iframe{display:block;width:100%;height:300px;border:0}.sms-note{text-align:center;font-size:13.5px;margin:40px 0 0}.sms-note a{color:var(--ink2)}

.rev{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px 26px}.rev-score{display:flex;align-items:center;gap:16px;margin-bottom:6px}.rev-score b{font:700 46px/1 Georgia,serif}.rev-score span{display:block;font-size:14.5px;color:var(--ink2)}.stars{display:flex;gap:2px}.btn.line{background:transparent;border:1.5px solid var(--gold);color:var(--gold2)}
.hero.sm{padding:44px 0 48px}.hero.sm h1{font-size:36px}.pill{display:inline-block;font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#14213d;background:#e7cf8f;border-radius:999px;padding:5px 12px;margin-bottom:14px}.steps{counter-reset:st}.steps .card{position:relative;padding-top:54px}.steps .card:before{counter-increment:st;content:counter(st);position:absolute;top:18px;left:22px;width:28px;height:28px;border-radius:50%;background:var(--ink);color:#e7cf8f;display:grid;place-items:center;font:700 14px Georgia,serif}.card .msg{max-width:none}.card h3 small{display:block;font:600 12.5px/1.4 -apple-system,Segoe UI,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--gold2);margin-bottom:4px}
footer{background:var(--ink);color:#c9d0e0;margin-top:56px;padding:34px 0;font-size:15px}footer a{color:#e7cf8f}footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px 40px}footer b{color:#fff;font-family:Georgia,serif;font-size:17px}
@media(max-width:640px){.hero{padding:44px 0 52px}.hero h1{font-size:32px}.hero .he{font-size:27px}h1{font-size:28px}h2{font-size:22px}}
`;
const LOGO = `<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><rect x="1" y="1" width="40" height="40" rx="10" fill="none" stroke="#b08d3c" stroke-width="1.5"/><path d="M11 31V19a10 10 0 0 1 20 0v12" fill="none" stroke="#e7cf8f" stroke-width="1.8"/><path d="M16 31V20a5 5 0 0 1 10 0v11" fill="none" stroke="#b08d3c" stroke-width="1.5"/><path d="M8 31h26" stroke="#e7cf8f" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const NAV = [["/", "Home"], ["/about", "About"], ["/contact", "Contact"]];
const page = (title, body, path, wide) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="Congregation K'hal Shaarei Zion, a Bobover shul at 4715 15th Avenue, Boro Park, Brooklyn, NY.">
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="/">${LOGO}<div><b>K'hal Shaarei Zion</b><span>Bobov · Boro Park, Brooklyn</span></div></a>
<nav>${NAV.map(([h, t]) => `<a href="${h}"${h === path ? ' class="on"' : ""}>${t}</a>`).join("")}<a href="https://secure.cardknox.com/khalbobov" rel="noopener">Donate</a></nav></div></header>
${wide ? body : `<main class="page"><div class="wrap">${body}</div></main>`}
<footer><div class="wrap"><div><b>Congregation K'hal Shaarei Zion</b><br>4715 15th Avenue, Brooklyn, NY 11219<br><a href="tel:+17188513037">(718) 851-3037</a> · <a href="mailto:info@khalbobov.org">info@khalbobov.org</a></div>
<div><a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/texts">SMS notices</a><br><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms and Conditions</a><br>© ${new Date().getFullYear()} Congregation K'hal Shaarei Zion. A nonprofit religious organization.</div></div></footer>
</body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });

const home = `<section class="hero"><div class="wrap"><p class="he">ק״ק שערי ציון באבוב</p><h1>Congregation K'hal Shaarei Zion</h1><div class="rule"></div>
<p>A Bobover shul in the heart of Boro Park. A place of tefillah, Torah and community at 4715 15th Avenue, Brooklyn.</p>
<a class="btn" href="/contact">Visit and contact</a><a class="btn ghost" href="https://secure.cardknox.com/khalbobov" rel="noopener">Donate</a></div></section>
<main><div class="wrap">
<p class="kicker">Welcome</p><h2 style="margin-top:0">About the shul</h2>
<p class="lead">Congregation K'hal Shaarei Zion is a nonprofit synagogue of the Bobov community in Boro Park, Brooklyn, New York.</p>
<p>The shul is open every day of the year for davening and learning. Its members come together for Shabbos and Yom Tov, for shiurim, and for each other's simchas. The congregation is run by its members and supported by their dues and donations. <a href="/about">More about the shul</a>.</p>
<div class="grid">
<div class="card"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg></div><h3>Tefillah</h3><p>Daily minyanim for Shacharis, Mincha and Maariv, and davening on Shabbos and Yom Tov.</p></div>
<div class="card"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20"/></svg></div><h3>Torah study</h3><p>Shiurim and chavrusa learning in the beis medrash throughout the day and evening.</p></div>
<div class="card"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.2A5 5 0 0 1 21 19"/></svg></div><h3>Community</h3><p>Kiddushim, simchas and gatherings for members and their families.</p></div>
<div class="card"><div class="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z"/></svg></div><h3>Mikva</h3><p>A men's mikva in the building for the members of the congregation.</p></div>
</div></div>
<div class="band"><div class="wrap" style="text-align:center"><p class="kicker">Support</p><h2 style="margin-top:0">Support the shul</h2><p style="max-width:560px;margin:0 auto 14px">The shul depends on its members and friends. Dues and donations keep the building open and cover its upkeep.</p><a class="btn" href="https://secure.cardknox.com/khalbobov" rel="noopener">Donate online</a></div></div>
<div class="wrap"><p class="kicker" style="margin-top:44px">Reviews</p><h2 style="margin-top:0">What visitors say</h2>
<div class="rev"><div class="rev-score"><b>4.7</b><div><div class="stars" aria-label="4.7 out of 5 stars"><svg width="22" height="22" viewBox="0 0 24 24" fill="#b08d3c" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.500 9.500l6.600-.900z"/></svg><svg width="22" height="22" viewBox="0 0 24 24" fill="#b08d3c" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.500 9.500l6.600-.900z"/></svg><svg width="22" height="22" viewBox="0 0 24 24" fill="#b08d3c" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.500 9.500l6.600-.900z"/></svg><svg width="22" height="22" viewBox="0 0 24 24" fill="#b08d3c" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.500 9.500l6.600-.900z"/></svg><svg width="22" height="22" viewBox="0 0 24 24" fill="#b08d3c" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.500 9.500l6.600-.900z"/></svg></div><span>267 reviews on Google, as of November 2026</span></div></div>
<p>Visitors and members rate the shul on Google. Read what they wrote, or add your own review.</p>
<a class="btn" href="https://www.google.com/maps/place/?q=place_id:ChIJGeqLzitFwokRZGU4l2-dLI0" rel="noopener">Read our Google reviews</a><a class="btn line" href="https://search.google.com/local/writereview?placeid=ChIJGeqLzitFwokRZGU4l2-dLI0" rel="noopener">Write a review</a></div></div>
<div class="wrap"><p class="kicker" style="margin-top:44px">Find us</p><h2 style="margin-top:0">Visit and contact</h2>
<div class="two"><ul class="info"><li><b>Address</b>4715 15th Avenue, Brooklyn, NY 11219<br><a href="https://www.google.com/maps/dir/?api=1&destination=4715+15th+Avenue,+Brooklyn,+NY+11219" rel="noopener">Get directions</a></li><li><b>Phone</b><a href="tel:+17188513037">(718) 851-3037</a></li><li><b>Email</b><a href="mailto:info@khalbobov.org">info@khalbobov.org</a></li><li><b>Office</b>The shul office answers questions about membership, seats, dues and the building.</li></ul>
<div class="map"><iframe title="Map to Congregation K'hal Shaarei Zion" src="https://www.google.com/maps?q=4715+15th+Avenue,+Brooklyn,+NY+11219&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>
<p class="sms-note"><a href="/texts">SMS notices coming soon. Click here for more information.</a></p>
</div></main>`;
const about = `<p class="kicker">About</p><h1>About Congregation K'hal Shaarei Zion</h1>
<p class="lead">K'hal Shaarei Zion is a Bobover shul and a nonprofit religious congregation at 4715 15th Avenue in Boro Park, Brooklyn.</p>
<h2>What the shul does</h2>
<p>The shul's purpose is tefillah, Torah study and chesed. Its doors are open every day for minyanim and learning, and its members gather there on Shabbos and Yom Tov and for family simchas.</p>
<ul><li><b>Davening.</b> Daily Shacharis, Mincha and Maariv, with Shabbos and Yom Tov davening.</li><li><b>Learning.</b> Shiurim and chavrusa learning in the beis medrash.</li><li><b>Mikva.</b> A men's mikva in the building for members.</li><li><b>Community.</b> Kiddushim, simchas, and help for members in times of need.</li></ul>
<h2>Membership and seats</h2>
<p>Members hold seats in the shul and support it through dues. For membership, seats or dues, email <a href="mailto:info@khalbobov.org">info@khalbobov.org</a> or speak to the shul office.</p>
<h2>Supporting the shul</h2>
<p>Congregation K'hal Shaarei Zion is a nonprofit organization. Donations go to the upkeep of the building and the running of the shul. <a href="https://secure.cardknox.com/khalbobov" rel="noopener">Donate online</a>.</p>
<h2>How the shul keeps in touch</h2>
<p>The shul sends notices to its members by email. For anything else, call the office at <a href="tel:+17188513037">(718) 851-3037</a> or email <a href="mailto:info@khalbobov.org">info@khalbobov.org</a>.</p>`;
const texts = `<section class="hero sm"><div class="wrap"><span class="pill">Coming soon</span><h1>Text messages from the shul</h1><div class="rule"></div>
<p>Congregation K'hal Shaarei Zion uses text messages for two things only. We never send advertising, and we never text anyone who did not agree to it.</p></div></section>
<main><div class="wrap">
<p class="kicker">Two programs</p><h2 style="margin-top:0">What we text about</h2>
<div class="two" style="margin-top:18px">
<div class="card"><h3><small>Program 1</small>Door alerts and access codes</h3>
<p>The shul office texts its own administrators about the building doors, and texts a one-time door code to a vendor, contractor or guest who is expected at the building.</p>
<div class="msg" style="margin-top:14px">K'hal Shaarei Zion: your door code for the 15th Ave entrance is 4821. It works today 9:00 AM to 1:00 PM. Reply STOP to opt out, HELP for help.</div>
<div class="msg">K'hal Shaarei Zion: the side door has been open for 10 minutes. Reply STOP to opt out, HELP for help.</div>
<p style="margin-top:12px"><a href="/door-texts">How door texts work</a></p></div>
<div class="card"><h3><small>Program 2</small>Shul notices</h3>
<p>Members who sign up get notices about davening and zmanim changes, events, simchas and levayos.</p>
<div class="msg" style="margin-top:14px">K'hal Shaarei Zion: Mincha today is at 4:25 PM. Reply STOP to opt out, HELP for help.</div>
<div class="msg">K'hal Shaarei Zion: Kiddush this Shabbos after davening in the main hall. Reply STOP to opt out, HELP for help.</div>
<p style="margin-top:12px"><a href="/join">How to sign up</a></p></div>
</div>
<p class="kicker" style="margin-top:44px">Consent first</p><h2 style="margin-top:0">How sign-up works</h2>
<div class="grid steps">
<div class="card"><h3>You agree</h3><p>Door texts: you give your number and your consent to a shul administrator, in person or in writing. Shul notices: you text JOIN, or sign up in the office.</p></div>
<div class="card"><h3>We record it</h3><p>The shul keeps a record of who agreed, when and how. Nobody is added without it.</p></div>
<div class="card"><h3>You can stop any time</h3><p>Reply STOP to any text and the texts stop. Reply HELP for help.</p></div>
</div></div>
<div class="band"><div class="wrap two">
<div><p class="kicker">Your choices</p><h2 style="margin-top:0">The fine print</h2><p>Message frequency varies. Message and data rates may apply. Reply <b>STOP</b> to stop, <b>HELP</b> for help. We do not sell or share mobile numbers or text message consent with anyone for marketing.</p><p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms and Conditions</a></p></div>
<div><p class="kicker">Questions</p><h2 style="margin-top:0">Contact the office</h2><ul class="info"><li><b>Phone</b><a href="tel:+17188513037">(718) 851-3037</a></li><li><b>Email</b><a href="mailto:info@khalbobov.org">info@khalbobov.org</a></li><li><b>Address</b>4715 15th Avenue, Brooklyn, NY 11219</li></ul></div>
</div></div></main>`;
const contact = `<p class="kicker">Contact</p><h1>Visit and contact</h1>
<ul class="info"><li><b>Congregation</b>Congregation K'hal Shaarei Zion (Bobov)</li><li><b>Address</b>4715 15th Avenue, Brooklyn, NY 11219<br><a href="https://www.google.com/maps/dir/?api=1&destination=4715+15th+Avenue,+Brooklyn,+NY+11219" rel="noopener">Get directions</a></li><li><b>Phone</b><a href="tel:+17188513037">(718) 851-3037</a></li><li><b>Email</b><a href="mailto:info@khalbobov.org">info@khalbobov.org</a></li><li><b>Donations</b><a href="https://secure.cardknox.com/khalbobov" rel="noopener">Donate online</a></li></ul>
<div class="map" style="margin-top:22px"><iframe title="Map to Congregation K'hal Shaarei Zion" src="https://www.google.com/maps?q=4715+15th+Avenue,+Brooklyn,+NY+11219&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
<p style="margin-top:22px">For membership, seats, dues, or anything about the building, call or email the shul office.</p>`;
const privacy = `<h1>Privacy Policy: K'hal Shaarei Zion Text Messages</h1>
<p>Last updated November 10, 2026. This policy covers both of our text message programs: <b>Shul Notices</b> and <b>Door Alerts and Access Codes</b>.</p>
<h2>Who we are</h2><p>Congregation K'hal Shaarei Zion is a nonprofit synagogue at 4715 15th Avenue, Brooklyn, NY 11219.</p>
<h2>What we collect</h2><p>The name and mobile number of members, staff, volunteers and approved service vendors who sign up for our texts, how and when they signed up, and the messages we send them with their delivery status.</p>
<h2>How we use it</h2><p>Only to send the texts each person signed up for: shul notices to members who joined, and door alerts or door access codes to staff and approved vendors. We do not send marketing or promotional messages for others.</p>
<h2>Sharing</h2><p>We do not sell, rent or share mobile numbers or text message consent with any third party or affiliate for marketing or promotional purposes. Text messaging opt-in data and consent are never shared with third parties. Numbers are given only to our text message provider, Twilio, so it can deliver our messages.</p>
<h2>Your choices</h2><p>Reply <b>STOP</b> to any message to stop receiving texts from that program. Reply <b>HELP</b> for help. When you opt out we stop texting you and remove your number from that list.</p>
<h2>Contact</h2><p>Email <a href="mailto:info@khalbobov.org">info@khalbobov.org</a>.</p>`;
const terms = `<h1>Terms and Conditions: K'hal Shaarei Zion Text Messages</h1>
<p>Last updated November 10, 2026.</p>
<h2>Program 1: Shul Notices</h2>
<p>K'hal Shaarei Zion Shul Notices sends members updates about the shul: davening and zmanim changes, events, simchas, levayos and other community announcements.</p>
<p><b>How to join:</b> text <b>JOIN</b> to <b>(718) 550-1343</b>, sign the text sign-up sheet in the shul office, or tick the text box on the membership form. See <a href="/join">how to join</a>.</p>
<p><b>Message frequency</b> varies, usually a few messages a week, more around Yom Tov.</p>
<h2>Program 2: Door Alerts and Access Codes</h2>
<p>K'hal Shaarei Zion Door Alerts and Access Codes sends alerts about the building doors to administrators, and one-time door access codes, with the times they work, to vendors and guests an administrator approved. An administrator adds a mobile number only after that person agrees, in person or in writing, to receive these texts.</p>
<p><b>Message frequency</b> varies, usually a few messages a month.</p>
<h2>For both programs</h2>
<p><b>Message and data rates may apply.</b></p>
<p>Reply <b>HELP</b> for help, or email <a href="mailto:info@khalbobov.org">info@khalbobov.org</a>.</p>
<p>Reply <b>STOP</b> at any time to cancel. You will receive one message confirming that you will get no more texts from that program. Reply <b>START</b> or <b>JOIN</b> to sign up again.</p>
<p>Carriers are not liable for delayed or undelivered messages.</p>`;
const join = `<h1>Get shul notices by text</h1>
<p>Get K'hal Shaarei Zion notices on your phone: davening and zmanim changes, events, simchas and levayos.</p>
<div class="box"><p style="margin:0;font-size:20px">Text <b>JOIN</b> to <b>(718) 550-1343</b></p></div>
<p>You can also sign the text sign-up sheet in the shul office, or tick the text box on the membership form.</p>
<p>By joining you agree to receive recurring text messages from K'hal Shaarei Zion. Message frequency varies. Message and data rates may apply. Reply <b>HELP</b> for help, <b>STOP</b> to stop at any time. Signing up is not required to be a member. See our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>.</p>`;
const doorTexts = `<h1>Door alerts and access codes</h1>
<p>K'hal Shaarei Zion's building doors are run by an access system. The shul office uses text messages to keep the building safe and to let expected visitors in.</p>
<h2>Who gets these texts</h2>
<ul><li><b>Shul administrators and staff</b>, who get alerts about the doors, such as a door left open.</li>
<li><b>Vendors, contractors and guests</b> the office is expecting, who get a one-time door code and the times it works.</li></ul>
<h2>How people sign up</h2>
<p>Nobody is added without agreeing first. An administrator asks the person, in person or in writing, for their mobile number and for permission to text it, using this wording:</p>
<div class="box"><p style="margin:0">"I agree to receive text messages from Congregation K'hal Shaarei Zion about building door access, including door codes and door alerts, at the mobile number I gave. Message frequency varies. Message and data rates may apply. Reply STOP to stop, HELP for help. Consent is not a condition of any purchase. See info.khalbobov.org/privacy and info.khalbobov.org/terms."</p></div>
<p>The administrator records who agreed, when and how, and only then adds the number.</p>
<h2>Stopping</h2>
<p>Reply <b>STOP</b> to any text to stop getting them. Reply <b>HELP</b> for help, or email <a href="mailto:info@khalbobov.org">info@khalbobov.org</a>. Message frequency varies, usually a few messages a month. Message and data rates may apply.</p>
<p>See our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms and Conditions</a>.</p>`;

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    const T = " | Congregation K'hal Shaarei Zion";
    if (path === "/") return page("Congregation K'hal Shaarei Zion | Bobov, Boro Park, Brooklyn", home, path, true);
    if (path === "/about") return page("About" + T, about, path);
    if (path === "/texts") return page("Text messages" + T, texts, path, true);
    if (path === "/contact") return page("Contact" + T, contact, path);
    if (path === "/privacy") return page("Privacy Policy" + T, privacy, path);
    if (path === "/terms") return page("Terms and Conditions" + T, terms, path);
    if (path === "/join") return page("Get shul notices by text" + T, join, path);
    if (path === "/door-texts") return page("Door alerts and access codes" + T, doorTexts, path);
    return new Response("Page not found", { status: 404 });
  },
};
