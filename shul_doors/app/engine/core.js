// GENERATED from the portal source. Do not edit here.

const CAL = __CAL__;
const HEB = __HEB__;            // per day from 2026-09-01: leap*10000 + month*100 + day
const HEB_START = "2026-09-01";
const PARSHA = __PARSHA__;
const LAT=40.633, LON=-73.997, TZ="America/New_York";

const GROUPS=[
 ["General",[["yt_any","Yom tov (any day)"],["erev_yt_any","Erev yom tov (any)"],["motzaei_yt_any","Motzei yom tov (any)"],["chol_any","Chol hamoed (any)"],["fast_any","Fast day (any)"],["erev_fast_any","Erev fast day (any)"]]],
 ["Rosh Chodesh",[["erev_rc","Erev Rosh Chodesh"],["rc_any","Rosh Chodesh (any day)"],["rc1","Rosh Chodesh day 1"],["rc2","Rosh Chodesh day 2"],["motzaei_rc","Motzei Rosh Chodesh"]]],
 ["Rosh Hashana",[["erev_rh","Erev Rosh Hashana"],["rh1","Rosh Hashana 1"],["rh2","Rosh Hashana 2"],["motzaei_rh","Motzei Rosh Hashana"]]],
 ["Yom Kippur",[["erev_yk","Erev Yom Kippur"],["yk","Yom Kippur"],["motzaei_yk","Motzei Yom Kippur"]]],
 ["Succos",[["erev_succos","Erev Succos"],["succos1","Succos 1"],["succos2","Succos 2"],["succos3","Succos 3"],["succos4","Succos 4"],["succos5","Succos 5"],["succos6","Succos 6"],["hoshana_rabba","Hoshana Rabba"],["shmini_atzeres","Shmini Atzeres"],["simchas_torah","Simchas Torah"],["motzaei_simchas_torah","Motzei Simchas Torah"]]],
 ["Chanuka",[["erev_chanuka","Erev Chanuka"],["chanuka1","Chanuka 1"],["chanuka2","Chanuka 2"],["chanuka3","Chanuka 3"],["chanuka4","Chanuka 4"],["chanuka5","Chanuka 5"],["chanuka6","Chanuka 6"],["chanuka7","Chanuka 7"],["zos_chanuka","Zos Chanuka"]]],
 ["Tu B'Shvat",[["erev_tub","Erev Tu B'Shvat"],["tub","Tu B'Shvat"]]],
 ["Purim",[["purim_katan","Purim Katan"],["erev_purim","Erev Purim"],["purim","Purim"],["shushan_purim","Shushan Purim"]]],
 ["Pesach",[["erev_pesach","Erev Pesach"],["pesach1","Pesach 1"],["pesach2","Pesach 2"],["pesach3","Pesach 3"],["pesach4","Pesach 4"],["pesach5","Pesach 5"],["pesach6","Pesach 6"],["shvii_pesach","Shvii shel Pesach"],["acharon_pesach","Acharon shel Pesach"],["motzaei_pesach","Motzei Pesach"]]],
 ["Sefira",[["pesach_sheni","Pesach Sheni"],["erev_lag","Erev Lag Ba'omer"],["lag","Lag Ba'omer"]]],
 ["Shavuos",[["erev_shavuos","Erev Shavuos"],["shavuos1","Shavuos 1"],["shavuos2","Shavuos 2"],["motzaei_shavuos","Motzei Shavuos"]]],
 ["Fasts",[["tzom_gedalia","Tzom Gedalia"],["bhb_c1","BaHaB Cheshvan 1"],["bhb_c2","BaHaB Cheshvan 2"],["bhb_c3","BaHaB Cheshvan 3"],["asara_teves","Asara B'Teves"],["taanis_esther","Taanis Esther"],["bhb_i1","BaHaB Iyar 1"],["bhb_i2","BaHaB Iyar 2"],["bhb_i3","BaHaB Iyar 3"],["shiva_asar_tammuz","17 Tammuz"],["erev_tisha_bav","Erev Tisha B'Av"],["tisha_bav","Tisha B'Av"]]],
 ["US legal holidays",[["legal_any","Legal holiday (any)"],["us_newyear","New Year's Day"],["us_mlk","Martin Luther King Jr. Day"],["us_presidents","Presidents' Day"],["us_memorial","Memorial Day"],["us_juneteenth","Juneteenth"],["us_july4","Independence Day"],["us_labor","Labor Day"],["us_columbus","Columbus Day"],["us_veterans","Veterans Day"],["us_thanksgiving","Thanksgiving"],["us_christmas","Christmas Day"]]],
 ["Periods",[["elul","Elul"],["aseres_yemei","Aseres Yemei Teshuva"],["shovavim","Shovavim (Tat in leap years)"],["sefira","Sefira"],["three_weeks","Three Weeks"],["nine_days","Nine Days"]]]
];
const FEST={};GROUPS.forEach(([g,items])=>items.forEach(([k,l])=>FEST[k]={label:l,group:g,rank:(g==="General"||g==="Periods"||k==="rc_any")?50:60}));
function festName(k){return (S&&S.holNames&&S.holNames[k])||FEST[k].label}
const WDN=["Sun","Mon","Tue","Wed","Thu","Fri","Shabbos"];
const HMONTHS=[[7,"Tishrei"],[8,"Cheshvan"],[9,"Kislev"],[10,"Teves"],[11,"Shvat"],[14,"Adar I"],[12,"Adar"],[1,"Nissan"],[2,"Iyar"],[3,"Sivan"],[4,"Tammuz"],[5,"Av"],[6,"Elul"]];
const HMN={1:"Nissan",2:"Iyar",3:"Sivan",4:"Tammuz",5:"Av",6:"Elul",7:"Tishrei",8:"Cheshvan",9:"Kislev",10:"Teves",11:"Shvat",12:"Adar",13:"Adar II"};
const MODES=["Unlock","Card or Pin","Card","Pin","Card and Pin","First Credential In","Lockdown"];
const ANCHORS={clock:"Clock time",alos:"Alos",sunrise:"Netz (sunrise)",chatzos:"Chatzos",plag:"Plag hamincha",sunset:"Shkiah (sunset)",candles:"Candle lighting",tzeis:"Tzeis",havdalah:"Havdalah",rt:"Rabbeinu Tam"};
const ALERTS=[["offline","A panel goes offline"],["ups","Power goes out and the box runs on the UPS battery"],["batt","The UPS battery drops below 50%"],["push","The nightly push to the doors fails"],["heartbeat","This system stops responding (checked from outside every 5 min)"],["held","A door is held open longer than"],["conflicts","The preview finds a conflict in the next 14 days"]];

const W5=[0,1,2,3,4];
const C=()=>({wd:[],fest:[],dates:[],hr:[]});
const R=(o)=>{const r=Object.assign({kind:"door",note:"",rabbi:"any",season:"any",stop:true,inc:C(),exc:C()},o);r.inc=Object.assign(C(),r.inc);r.exc=Object.assign(C(),r.exc);return r};
const SAMPLE={
  rabbiAwayNow:false, candleOff:18, havOff:72, rtOff:72, away:[{from:"2026-10-25",to:"2026-11-01"}],
  doors:[{"id": "8D104", "name": "8D104", "def": "Card or Pin"}, {"id": "8D105", "name": "8D105", "def": "Card or Pin"}, {"id": "8D201", "name": "8D201", "def": "Card or Pin"}, {"id": "8D401", "name": "8D401", "def": "Card or Pin"}, {"id": "9D108", "name": "9D108", "def": "Card or Pin"}, {"id": "9D202", "name": "9D202", "def": "Card or Pin"}, {"id": "9D604", "name": "9D604", "def": "Card or Pin"}, {"id": "D101", "name": "D101", "def": "Card or Pin"}, {"id": "D102", "name": "D102", "def": "Unlock"}, {"id": "D103", "name": "D103", "def": "Unlock"}, {"id": "D106", "name": "D106", "def": "Unlock"}, {"id": "D107", "name": "D107", "def": "Unlock"}, {"id": "D203", "name": "D203", "def": "Unlock"}, {"id": "D204", "name": "D204", "def": "Card or Pin"}, {"id": "D205", "name": "D205", "def": "Card or Pin"}, {"id": "D206", "name": "D206", "def": "Card or Pin"}, {"id": "D301", "name": "D301", "def": "Card or Pin"}, {"id": "D302", "name": "D302", "def": "Card or Pin"}, {"id": "D303", "name": "D303", "def": "Card or Pin"}, {"id": "D304", "name": "D304", "def": "Card or Pin"}, {"id": "D305", "name": "D305", "def": "Card or Pin"}, {"id": "D501", "name": "D501", "def": "Card or Pin"}, {"id": "D502", "name": "D502", "def": "Card or Pin"}, {"id": "D503", "name": "D503", "def": "Unlock"}, {"id": "D504", "name": "D504", "def": "Unlock"}, {"id": "D505", "name": "D505", "def": "Unlock"}, {"id": "D506", "name": "D506", "def": "Card or Pin"}, {"id": "D507", "name": "D507", "def": "Card or Pin"}, {"id": "D508", "name": "D508", "def": "Card or Pin"}, {"id": "D601", "name": "D601", "def": "Card or Pin"}, {"id": "D602", "name": "D602", "def": "Card or Pin"}, {"id": "D603", "name": "D603", "def": "Card or Pin"}, {"id": "D605", "name": "D605", "def": "Card or Pin"}, {"id": "D606", "name": "D606", "def": "Card or Pin"}, {"id": "D607", "name": "D607", "def": "Card or Pin"}, {"id": "D608", "name": "D608", "def": "Card or Pin"}, {"id": "D701", "name": "D701", "def": "Card or Pin"}, {"id": "D702", "name": "D702", "def": "Unlock"}, {"id": "D703", "name": "D703", "def": "Card or Pin"}, {"id": "D704", "name": "D704", "def": "Card or Pin"}, {"id": "D705", "name": "D705", "def": "Card or Pin"}, {"id": "D706", "name": "D706", "def": "Card or Pin"}, {"id": "D707", "name": "D707", "def": "Card or Pin"}, {"id": "D708", "name": "D708", "def": "Card or Pin"}],
  groups:[],
  types:["Wedding","Sheva brachos","Kiddush"],
  accessGroups:["Members","Mikva attendants","Staff","Kitchen staff"],
  events:[{id:"e1",name:"Weiss wedding",type:"Wedding",from:"2026-10-20",to:"2026-10-20"},{id:"e2",name:"Weiss sheva brachos",type:"Sheva brachos",from:"2026-10-21",to:"2026-10-27"}],
  hdates:[{id:"h1",name:"Rosh Chodesh Av seudah",m:5,d:1}],
  gdates:[{id:"c1",name:"Annual boiler service",m:10,d:20}],
  overrides:[],
  requests:[{id:"q1",from:"Mikva attendant",to:"admins",subject:"Mikva open 30 minutes earlier on Sundays?",status:"open",created:Date.UTC(2026,9,12,14,0),
    msgs:[{u:"Mikva attendant",t:Date.UTC(2026,9,12,14,0),text:"Several women asked if the mikva could open 30 minutes earlier on Sunday nights this winter. Can someone change it?"}],change:null,read:{}}],
  notes:[{id:"n1",text:"When someone says kiddush, they mean the main shul doors open 11 AM to 2 PM.",status:"active",by:"Hershy",created:Date.UTC(2026,9,5,15,0),approvedBy:"Hershy",src:"typed"},{id:"n2",text:"The mikva entrance is never opened on Shabbos or yom tov, whatever anyone asks. Send it to a super admin instead.",status:"active",by:"Hershy",created:Date.UTC(2026,9,6,15,0),approvedBy:"Hershy",src:"typed"},{id:"n3",text:"Green Pest Control comes the first Monday of every month, 9 to 12.",status:"pending",by:"Gabbai",created:Date.UTC(2026,9,11,18,0),src:"chat"}],
  vendors:[{id:"v1",name:"Cohen Plumbing",contact:"Moshe Cohen",phone:"718-555-0100",doors:["D301","D702"],hours:"work",samePin:true,pin:"482915",notes:"Boiler and mikva pumps",arriveAlert:true,notifyUsers:["Hershy"]},{id:"v2",name:"Green Pest Control",contact:"",phone:"718-555-0142",doors:["g:g_shabbos_open","D702"],hours:"day",samePin:true,pin:"730264",notes:"Monthly, first Monday"},{id:"v3",name:"Boro Elevator Service",contact:"Front desk",phone:"347-555-0177",doors:["D301"],hours:"",samePin:false,pin:"",notes:""}],
  codes:[{id:"t1",vendorId:"v1",name:"Cohen Plumbing",phone:"718-555-0100",pin:"482915",doors:["D301","D702"],from:Date.UTC(2026,9,13,12,0),to:Date.UTC(2026,9,13,21,0),hours:"",by:"Hershy",created:Date.UTC(2026,9,12,13,0)}],
  users:[{name:"Hershy",role:"Super admin",phone:"917-555-0123"},
    {name:"Gabbai",role:"Restricted",perm:{D301:"edit",D204:"view",D702:"hidden"},can:{rules:true,override:true,events:true,rabbi:true,codes:true},sched:"temp"},
    {name:"Mikva attendant",role:"Restricted",perm:{D301:"hidden",D204:"hidden",D702:"edit"},can:{rules:false,override:true,events:false,rabbi:false},sched:"none"}], me:"Hershy",
  contacts:[{name:"Hershy",to:"718-555-0142"}],
  situations:[{id:"s1",name:"Bein hazmanim",on:false,top:false,ranges:[{from:"2027-04-14",to:"2027-05-02"}]},{id:"s2",name:"Snow day",on:false,top:false,ranges:[]},{id:"s3",name:"Building closed",on:false,top:true,ranges:[]}],
  alerts:{offline:true,ups:true,batt:true,battPct:50,push:true,heartbeat:true,held:true,heldMin:5,conflicts:true},
  log:[{t:Date.UTC(2026,9,12,3,10),u:"Hershy",text:"Example entry: added rule \"Wedding\"",push:"sent",sentAt:Date.UTC(2026,9,12,3,10,22)},{t:Date.UTC(2026,9,12,3,5),u:"Gabbai",text:"Example entry: added event \"Weiss sheva brachos\"",push:"sent",sentAt:Date.UTC(2026,9,12,3,5,19)}],
  rules:[
    R({id:1,name:"Weekday Shacharis",doors:["D301"],stop:false,inc:{wd:W5},exc:{fest:["yt_any","tisha_bav"]},start:{a:"clock",t:"05:45",o:0},end:{a:"clock",t:"09:30",o:0},mode:"Unlock"}),
    R({id:2,name:"Weekday Mincha / Maariv",note:"Mincha is 30 min before shkiah; doors close after the last Maariv.",doors:["g:g_shabbos_open"],inc:{wd:W5},start:{a:"sunset",o:-30},end:{a:"clock",t:"22:30",o:0},mode:"Unlock"}),
    R({id:3,name:"Rabbi away, weeknights",doors:["D301"],rabbi:"away",inc:{wd:W5},start:{a:"sunset",o:-20},end:{a:"clock",t:"21:30",o:0},mode:"Unlock"}),
    R({id:4,name:"Erev Shabbos",doors:["g:g_shabbos_open"],inc:{wd:[5]},start:{a:"candles",o:-60},end:{a:"clock",t:"23:30",o:0},mode:"Unlock"}),
    R({id:5,name:"Shabbos day",doors:["g:g_shabbos_open"],inc:{wd:[6]},start:{a:"clock",t:"07:00",o:0},end:{a:"havdalah",o:30},mode:"Unlock"}),
    R({id:6,name:"Erev yom tov",doors:["g:g_shabbos_open"],inc:{fest:["erev_yt_any"]},start:{a:"candles",o:-60},end:{a:"clock",t:"23:59",o:0},mode:"Unlock"}),
    R({id:17,name:"Rosh Hashana, ezras nashim open through both days",doors:["D204"],inc:{fest:["erev_rh"]},start:{a:"candles",o:-60},end:{a:"havdalah",o:15,days:2},mode:"Unlock"}),
    R({id:7,name:"Yom tov",doors:["g:g_shabbos_open"],inc:{fest:["yt_any"]},start:{a:"clock",t:"07:00",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Unlock"}),
    R({id:8,name:"First day Succos, early (not on Shabbos)",doors:["g:g_shabbos_open"],inc:{fest:["succos1"]},exc:{wd:[6]},start:{a:"alos",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Unlock"}),
    R({id:9,name:"Shovavim Thursdays",doors:["D301"],stop:false,inc:{fest:["shovavim"]},exc:{wd:[0,1,2,3,5,6]},start:{a:"clock",t:"04:30",o:0},end:{a:"clock",t:"05:45",o:0},mode:"Unlock"}),
    R({id:10,name:"Rosh Chodesh Av seudah",doors:["g:g_shabbos_open"],stop:false,inc:{fest:["hd:h1"]},start:{a:"plag",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Unlock"}),
    R({id:11,name:"Late Maariv, Tammuz to Av",doors:["D301"],stop:false,inc:{hr:[{fm:4,fd:1,tm:5,td:30}]},exc:{wd:[5,6],fest:["tisha_bav"]},start:{a:"tzeis",o:0},end:{a:"clock",t:"23:30",o:0},mode:"Unlock"}),
    R({id:12,name:"Wedding",doors:["g:g_shabbos_open"],stop:false,inc:{fest:["type:Wedding"]},start:{a:"clock",t:"17:00",o:0},end:{a:"clock",t:"01:00",o:0},mode:"Unlock"}),
    R({id:13,name:"Sheva brachos",doors:["D204"],stop:false,inc:{fest:["type:Sheva brachos"]},exc:{wd:[5,6]},start:{a:"clock",t:"19:00",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Unlock"}),
    R({id:14,name:"Mikva, summer clock",doors:["g:g_mikva"],season:"dst",inc:{wd:W5},start:{a:"sunset",o:0},end:{a:"clock",t:"23:30",o:0},mode:"Card or Pin"}),
    R({id:15,name:"Mikva, winter clock",doors:["g:g_mikva"],season:"std",inc:{wd:W5},start:{a:"sunset",o:0},end:{a:"clock",t:"22:30",o:0},mode:"Card or Pin"}),
    R({id:18,name:"Mikva attendants' cards, mikva hours",kind:"access",group:"Mikva attendants",note:"Attendants come 30 min early to set up.",doors:["g:g_mikva"],inc:{wd:[0,1,2,3,4,5]},exc:{fest:["yt_any"]},start:{a:"sunset",o:-30},end:{a:"clock",t:"23:59",o:0}}),
    R({id:19,name:"Members' cards, weekdays",kind:"access",group:"Members",doors:["g:g_shabbos_open"],inc:{wd:W5},start:{a:"clock",t:"05:00",o:0},end:{a:"clock",t:"23:00",o:0}}),
    R({id:20,name:"Snow day: shul doors card only",sit:"s2",doors:["g:g_shabbos_open"],inc:{wd:[0,1,2,3,4,5,6]},start:{a:"clock",t:"00:00",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Card or Pin",note:"Keeps doors shut against the cold; members still get in with a card."}),
    R({id:21,name:"Building closed",sit:"s3",doors:["g:g_outdoor","g:g_mikva","g:g_bathroom"],inc:{wd:[0,1,2,3,4,5,6]},start:{a:"clock",t:"00:00",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Lockdown"}),
    R({id:22,name:"Bein hazmanim Shacharis later",sit:"s1",doors:["D301"],stop:false,inc:{wd:W5},exc:{fest:["yt_any"]},start:{a:"clock",t:"06:30",o:0},end:{a:"clock",t:"10:30",o:0},mode:"Unlock"}),
    R({id:23,name:"Yom Kippur extra doors",doors:["D204"],inc:{dates:[{from:"2026-09-21",to:"2026-09-21"}]},start:{a:"clock",t:"06:00",o:0},end:{a:"clock",t:"20:00",o:0},mode:"Unlock",note:"One time, 5787."}),
    R({id:16,name:"Mikva closed on yom tov",note:"Per the Rav: mikva closed on yom tov days.",doors:["g:g_mikva"],inc:{fest:["yt_any"]},start:{a:"clock",t:"00:00",o:0},end:{a:"clock",t:"23:59",o:0},mode:"Lockdown"})
  ]};
const KEY="shulDoorProto.v6";

let S;
const ON_BOX=typeof window!=="undefined"&&!!window.__SD_STATE; // running on the shul's box, not as a preview
if(ON_BOX){S=window.__SD_STATE;document.addEventListener("DOMContentLoaded",()=>document.querySelector(".brand .proto")?.remove())} else try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){S=null}
let BOX_ST=null; // latest status from the box

if(!S||!S.rules||!S.groups) S=structuredClone(SAMPLE);
if(!S.gdates) S.gdates=structuredClone(SAMPLE.gdates);
if(!S.accessGroups) S.accessGroups=structuredClone(SAMPLE.accessGroups);
S.doors.forEach(d=>{if(!d.def)d.def="Card or Pin"});
function doorDef(id){const d=S.doors.find(x=>x.id===id);return d&&d.def||"Card or Pin"}
const DEF_RULE=id=>({id:"def:"+id,name:"Default",mode:doorDef(id),isDef:true});
function save(){if(ON_BOX){boxSave();return}try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
let BOX_T=null;function boxSave(){clearTimeout(BOX_T);BOX_T=setTimeout(()=>{fetch("api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:window.__SD_VERSION,state:S})}).then(r=>r.json()).then(j=>{if(j.version)window.__SD_VERSION=j.version;if(j.conflict){toast("Someone else just made a change. Loading the latest.");setTimeout(()=>location.reload(),1500)}}).catch(()=>toast("Could not save. Check the connection to the box."))},400)}
function log(text){
  const e={t:Date.now(),u:S.me,text,push:"pending"};S.log.unshift(e);S.log=S.log.slice(0,500);
  // prototype: pretend the push and the read-back check take a few seconds
  if(ON_BOX){e.push="box";return}
  setTimeout(()=>{e.push="sent";e.sentAt=Date.now();save();renderLog()},2500);
}
// roles: "Super admin" sees and changes everything; "Restricted" gets Edit / View / Hidden per door plus a few switches
S.users.forEach(u=>{if(u.role==="Admin")u.role="Super admin";if(u.role==="Editor"){u.role="Restricted";u.perm=u.perm||{};u.can=u.can||{rules:false,override:true,events:true,rabbi:true}}});
if(!S.users.some(u=>u.name==="Mikva attendant")&&S.users.length===2)S.users.push(structuredClone(SAMPLE.users[2]));
function me(){return S.users.find(x=>x.name===S.me)||{role:"Super admin"}}
function isAdmin(){return me().role==="Super admin"}
S.users.forEach(u=>{if(u.role==="Restricted"&&!u.sched)u.sched=(u.can||{}).rules?"both":"none"});
function sched(){return isAdmin()?"both":(me().sched||"none")}
function can(k){if(k==="rules")return sched()!=="none";return isAdmin()||!!(me().can||{})[k]}
// a temporary rule runs only on specific one-time dates or one specific event; anything that repeats is permanent
function isTempRule(r){const n=r.inc;return !n.wd.length&&!n.hr.length&&n.fest.every(k=>k.startsWith("ev:"))&&n.dates.every(d=>!d.yearly)&&(n.dates.length+n.fest.length)>0}
function ruleLastDay(r){let last="";r.inc.dates.forEach(d=>{if(d.to>last)last=d.to});r.inc.fest.forEach(k=>{const e=S.events.find(x=>"ev:"+x.id===k);if(e&&e.to>last)last=e.to});return last}
function isArchived(r){if(!isTempRule(r))return false;const last=ruleLastDay(r);return !!last&&addDays(last,(+r.end.days||0)+1)<todayNY()}
function canSchedule(r){const sc=sched();return sc==="both"||(sc==="temp"&&isTempRule(r))}
function perm(d){return isAdmin()?"edit":((me().perm||{})[d]||"hidden")}
function visDoors(){return S.doors.filter(d=>perm(d.id)!=="hidden")}
function editDoors(){return S.doors.filter(d=>perm(d.id)==="edit")}
function canSeeRule(r){return isAdmin()||expandDoors(r.doors).some(d=>perm(d)!=="hidden")}
function canEditRule(r){const ds=expandDoors(r.doors);return isAdmin()||(canSchedule(r)&&ds.length>0&&ds.every(d=>perm(d)==="edit"))}
function groupEditable(g){return isAdmin()||(g.doors.length>0&&g.doors.every(d=>perm(d)==="edit"))}
function shownDoorsText(list){ // hide door names this user may not see
  if(isAdmin()) return doorsText(list);
  const vis=list.filter(x=>x.startsWith("g:")?groupEditable(S.groups.find(g=>"g:"+g.id===x)||{doors:[]})||(S.groups.find(g=>"g:"+g.id===x)||{doors:[]}).doors.every(d=>perm(d)!=="hidden"):perm(x)!=="hidden");
  const hiddenCount=expandDoors(list).filter(d=>perm(d)==="hidden").length;
  const named=vis.length===list.length?doorsText(list):expandDoors(list).filter(d=>perm(d)!=="hidden").map(doorName).join(", ");
  return named+(hiddenCount?` and ${hiddenCount} other door${hiddenCount===1?"":"s"}`:"");
}

/* ---------- dates and zmanim ---------- */
const pad=n=>String(n).padStart(2,"0");
function iso(y,m,d){return `${y}-${pad(m)}-${pad(d)}`}
function parseIso(s){const [y,m,d]=s.split("-").map(Number);return {y,m,d}}
function addDays(s,n){const {y,m,d}=parseIso(s);const t=new Date(Date.UTC(y,m-1,d+n));return iso(t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate())}
function daysBetween(a,b){const A=parseIso(a),B=parseIso(b);return Math.round((Date.UTC(B.y,B.m-1,B.d)-Date.UTC(A.y,A.m-1,A.d))/864e5)}
const F_DATE=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"});
const F_HM=new Intl.DateTimeFormat("en-US",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const F_TZ=new Intl.DateTimeFormat("en-US",{timeZone:TZ,timeZoneName:"short"});
function nyDate(ms){return F_DATE.format(new Date(ms))}
function todayNY(){return nyDate(Date.now())}
function dow(s){const {y,m,d}=parseIso(s);return new Date(Date.UTC(y,m-1,d)).getUTCDay()}
function heb(s){const i=daysBetween(HEB_START,s);if(i<0||i>=HEB.length)return null;const v=HEB[i];return {leap:v>=10000,m:Math.floor((v%10000)/100),d:v%100}}
function hebText(h){if(!h)return "";let mn=HMN[h.m];if(h.leap&&h.m===12)mn="Adar I";return `${h.d} ${mn}`}
const RAD=Math.PI/180;
function sunUTCms(s,rise,zen){ // NOAA solar calculator (Meeus), within a few seconds
  const {y,m,d}=parseIso(s), jd0=Date.UTC(y,m-1,d)/864e5+2440587.5;
  const sun=t=>{const L0=(280.46646+t*(36000.76983+0.0003032*t))%360, M=357.52911+t*(35999.05029-0.0001537*t), e=0.016708634-t*(0.000042037+0.0000001267*t);
    const C=Math.sin(M*RAD)*(1.914602-t*(0.004817+0.000014*t))+Math.sin(2*M*RAD)*(0.019993-0.000101*t)+Math.sin(3*M*RAD)*0.000289;
    const om=125.04-1934.136*t, lam=L0+C-0.00569-0.00478*Math.sin(om*RAD);
    const eps=23+(26+(21.448-t*(46.815+t*(0.00059-t*0.001813)))/60)/60+0.00256*Math.cos(om*RAD);
    const decl=Math.asin(Math.sin(eps*RAD)*Math.sin(lam*RAD))/RAD; let q=Math.tan(eps/2*RAD);q*=q;
    const eqt=4*(q*Math.sin(2*L0*RAD)-2*e*Math.sin(M*RAD)+4*e*q*Math.sin(M*RAD)*Math.cos(2*L0*RAD)-0.5*q*q*Math.sin(4*L0*RAD)-1.25*e*e*Math.sin(2*M*RAD))/RAD;
    return {decl,eqt}};
  let tmin=720-4*LON;
  for(let i=0;i<3;i++){const {decl,eqt}=sun((jd0+tmin/1440-2451545)/36525);
    const cosH=(Math.cos(zen*RAD)-Math.sin(LAT*RAD)*Math.sin(decl*RAD))/(Math.cos(LAT*RAD)*Math.cos(decl*RAD));
    const H=Math.acos(Math.min(1,Math.max(-1,cosH)))/RAD; tmin=720-4*(LON+(rise?H:-H))-eqt}
  return Date.UTC(y,m-1,d)+tmin*60000;
}
function nyMinutes(ms){const p=F_HM.formatToParts(new Date(ms));
  return +p.find(x=>x.type==="hour").value*60 + +p.find(x=>x.type==="minute").value}
function isDST(s){const {y,m,d}=parseIso(s);return F_TZ.formatToParts(new Date(Date.UTC(y,m-1,d,17))).find(x=>x.type==="timeZoneName").value==="EDT"}
function fmt(min){min=((Math.round(min)%1440)+1440)%1440;let h=Math.floor(min/60),m=min%60;const ap=h>=12?"PM":"AM";h=h%12||12;return `${h}:${pad(m)} ${ap}`}
function zmanim(s){
  const zm=ms=>nyMinutes(ms+30000); // nearest minute
  const R=sunUTCms(s,true,90.833), T=sunUTCms(s,false,90.833), netz=zm(R), shkia=zm(T);
  return {alos:zm(sunUTCms(s,true,106.1)),sunrise:netz,chatzos:zm((R+T)/2),plag:zm(T-1.25*(T-R)/12),
    sunset:shkia,candles:shkia-S.candleOff,tzeis:zm(sunUTCms(s,false,98.5)),havdalah:shkia+S.havOff,rt:shkia+S.rtOff};
}

/* ---------- what is this day ---------- */
function hdMatches(hd,h){
  if(!h) return false;
  if(hd.m===14) return h.leap&&h.m===12&&h.d===hd.d;
  if(hd.m===12) return (h.leap?h.m===13:h.m===12)&&h.d===hd.d;
  return h.m===hd.m&&h.d===hd.d;
}
// position inside the Hebrew year (Tishrei first), for date ranges
const MORD={7:0,8:1,9:2,10:3,11:4,14:5,12:6,13:6,1:7,2:8,3:9,4:10,5:11,6:12};
function hOrd(h){const m=(h.leap&&h.m===12)?14:h.m;return MORD[m]*31+h.d}
function hrMatches(r,h){if(!h)return false;const a=MORD[r.fm]*31+r.fd,b=MORD[r.tm]*31+r.td,x=hOrd(h);return a<=b?(x>=a&&x<=b):(x>=a||x<=b)}
function hrText(r){return `${r.fd} ${monthName(r.fm)} to ${r.td} ${monthName(r.tm)}`}
function monthName(m){return (HMONTHS.find(x=>x[0]===m)||[0,"?"])[1]}
const RH_DAYS=Object.keys(CAL).filter(k=>CAL[k].includes("rh1")).sort();   // Rosh Hashana of 5787, 5788, ...
function hebYear(s){let y=5786;RH_DAYS.forEach(d=>{if(s>=d)y++});return y}
function hebYearSpan(y){const a=RH_DAYS[y-5787],b=RH_DAYS[y-5786];return a?(a.slice(0,4)+(b?"–"+b.slice(0,4):"")):""}
let DI_CACHE=null, PLAIN=false, NO_OV=false;
function dayInfo(s){
  if(DI_CACHE&&DI_CACHE.has(s)) return DI_CACHE.get(s);
  const r=dayInfoRaw(s); if(DI_CACHE) DI_CACHE.set(s,r); return r;
}
function dayInfoRaw(s){
  const w=dow(s), h=heb(s);
  if(PLAIN) return {s,w,h,keys:new Set(),z:zmanim(s),dst:isDST(s),away:false,sits:new Set(),plain:true};
  const keys=new Set(CAL[s]||[]);
  S.hdates.forEach(x=>{ if(hdMatches(x,h)) keys.add("hd:"+x.id) });
  const {m:gm,d:gd}=parseIso(s);
  S.gdates.forEach(x=>{ if(x.m===gm&&x.d===gd) keys.add("gd:"+x.id) });
  usHolidays(s).forEach(k=>{keys.add(k);keys.add("legal_any")});
  S.events.forEach(e=>{ if(s>=e.from&&s<=e.to){ keys.add("ev:"+e.id); keys.add("type:"+e.type) } });
  return {s,w,h,keys,z:zmanim(s),dst:isDST(s),away:rabbiAway(s),sits:sitsOn(s)};
}
function sitsOn(s){const out=new Set();(S.situations||[]).forEach(x=>{if((x.on&&s>=(x.since||todayNY()))||x.ranges.some(r=>s>=r.from&&s<=r.to))out.add(x.id)});return out}
function sitOf(id){return (S.situations||[]).find(x=>x.id===id)}
function sitBonus(r){if(!r.sit)return 0;const x=sitOf(r.sit);return x&&x.top?200:10}
function rabbiAway(s){
  if(S.rabbiAwayNow && s>=(S.rabbiAwaySince||todayNY())) return true;
  return S.away.some(r=>r.from&&r.to&&s>=r.from&&s<=r.to);
}
function keyLabel(k){
  if(FEST[k]) return festName(k);
  if(k.startsWith("hd:")){const x=S.hdates.find(h=>"hd:"+h.id===k);return x?x.name:"(deleted date)"}
  if(k.startsWith("gd:")){const x=S.gdates.find(h=>"gd:"+h.id===k);return x?x.name:"(deleted date)"}
  if(k.startsWith("type:")) return "Any "+k.slice(5)+" event";
  if(k.startsWith("ev:")){const x=S.events.find(e=>"ev:"+e.id===k);return x?x.name:"(deleted event)"}
  return k;
}
function keyRank(k){ if(FEST[k]) return FEST[k].rank; return 70 }
// US federal holidays, on the day they are observed (Saturday moves to Friday, Sunday to Monday)
function nthWd(y,m,wd,n){const first=new Date(Date.UTC(y,m-1,1)).getUTCDay();let d=1+((wd-first+7)%7)+(n-1)*7;if(n<0){const last=new Date(Date.UTC(y,m,0)).getUTCDate();const lw=new Date(Date.UTC(y,m-1,last)).getUTCDay();d=last-((lw-wd+7)%7)}return iso(y,m,d)}
function observed(y,m,d){const s=iso(y,m,d),w=dow(s);return w===6?addDays(s,-1):w===0?addDays(s,1):s}
const US_CACHE={};
function usHolidays(s){
  const y=+s.slice(0,4);
  if(!US_CACHE[y]){const t={};
    const add=(k,day)=>{(t[day]=t[day]||[]).push(k)};
    [y,y+1].forEach(yy=>{const o=observed(yy,1,1);if(o.startsWith(String(y)))add("us_newyear",o)});
    add("us_mlk",nthWd(y,1,1,3));add("us_presidents",nthWd(y,2,1,3));add("us_memorial",nthWd(y,5,1,-1));
    add("us_juneteenth",observed(y,6,19));add("us_july4",observed(y,7,4));add("us_labor",nthWd(y,9,1,1));
    add("us_columbus",nthWd(y,10,1,2));add("us_veterans",observed(y,11,11));add("us_thanksgiving",nthWd(y,11,4,4));add("us_christmas",observed(y,12,25));
    US_CACHE[y]=t}
  return US_CACHE[y][s]||[];
}
// calendar dates: one-time, or every year (by month and day, may wrap past Dec 31)
function dateMatch(d,s){
  if(!d.yearly) return s>=d.from&&s<=d.to;
  const md=s.slice(5), a=d.from.slice(5), b=d.to.slice(5);
  return a<=b?(md>=a&&md<=b):(md>=a||md<=b);
}
const GMON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortDate(s){const {y,m,d}=parseIso(s);return new Date(Date.UTC(y,m-1,d)).toLocaleDateString("en-US",{timeZone:"UTC",month:"short",day:"numeric",year:"numeric"})}
function mdText(x){const [m,d]=x.slice(5).split("-").map(Number);return `${GMON[m-1]} ${d}`}
function dateText(d){
  if(d.yearly) return (d.from===d.to?mdText(d.from):`${mdText(d.from)} to ${mdText(d.to)}`)+", every year";
  return d.from===d.to?shortDate(d.from):`${shortDate(d.from)} to ${shortDate(d.to)}`;
}
function doorName(id){const d=S.doors.find(x=>x.id===id);return d?d.name:id}
function expandDoors(list){const out=new Set();list.forEach(x=>{if(x.startsWith("g:")){const g=S.groups.find(g=>"g:"+g.id===x);if(g)g.doors.forEach(d=>out.add(d))}else out.add(x)});return [...out]}
function doorsText(list){return list.map(x=>x.startsWith("g:")?((S.groups.find(g=>"g:"+g.id===x)||{name:"(deleted group)"}).name):doorName(x)).join(", ")}

/* ---------- rule logic ---------- */
function evalRule(r,info){
  if(r.rabbi==="local"&&info.away) return null;
  if(r.rabbi==="away"&&!info.away) return null;
  if(r.sit&&!info.sits.has(r.sit)) return null;
  if(r.season==="dst"&&!info.dst) return null;
  if(r.season==="std"&&info.dst) return null;
  if(r.year&&hebYear(info.s)!==+r.year) return null;
  const x=r.exc;
  if(x.wd.includes(info.w)) return null;
  // the plain week (what goes into each door's weekly schedule) only uses weekday rules;
  // anything tied to dates, Hebrew dates or holidays is sent separately as one-time overrides
  if(info.plain) return r.inc.wd.includes(info.w)?{score:10+(r.rabbi!=="any"?10:0)+(r.season!=="any"?5:0),via:WDN[info.w]}:null;
  if(x.fest.some(k=>info.keys.has(k))) return null;
  if(x.dates.some(d=>dateMatch(d,info.s))) return null;
  if(x.hr.some(hr=>hrMatches(hr,info.h))) return null;
  let best=-1, via="";
  const n=r.inc;
  if(n.wd.includes(info.w)&&10>best){best=10;via=WDN[info.w]}
  n.hr.forEach(hr=>{ if(hrMatches(hr,info.h)&&55>best){best=55;via=hrText(hr)} });
  n.fest.forEach(k=>{ if(info.keys.has(k)&&keyRank(k)>best){best=keyRank(k);via=keyLabel(k)} });
  n.dates.forEach(d=>{ const r=d.yearly?55:100; if(dateMatch(d,info.s)&&r>best){best=r;via=dateText(d)} });
  if(best<0) return null;
  return {score:best+sitBonus(r)+(r.rabbi!=="any"?10:0)+(r.season!=="any"?5:0),via};
}
function staticScore(r){
  const n=r.inc; let b=n.wd.length?10:0;
  if(n.hr.length) b=Math.max(b,55);
  n.fest.forEach(k=>b=Math.max(b,keyRank(k))); if(n.dates.length) b=100;
  return b+sitBonus(r)+(r.rabbi!=="any"?10:0)+(r.season!=="any"?5:0);
}
function anchorMin(x,info){
  if(x.a==="clock"){const [h,m]=(x.t||"00:00").split(":").map(Number);return h*60+m}
  return info.z[x.a]+(+x.o||0);
}
function resolve(door,info,kind){
  kind=kind||"door";
  const m=S.rules.filter(r=>(r.kind||"door")===kind&&expandDoors(r.doors).includes(door)).map(r=>({r,e:evalRule(r,info)})).filter(x=>x.e);
  const stops=m.filter(x=>x.r.stop!==false);
  const top=stops.length?Math.max(...stops.map(x=>x.e.score)):Infinity;
  return m.filter(x=>x.r.stop===false||x.e.score===top)
    .map(({r,e})=>{const a=anchorMin(r.start,info),k=+r.end.days||0;let b=anchorMin(r.end,k?dayInfo(addDays(info.s,k)):info)+k*1440;if(!k&&b<=a)b+=1440;return {r,via:e.via,sc:e.score,a,b,s:info.s,next:b>1440}})
    .sort((x,y)=>x.a-y.a);
}
// end times: minutes counted from midnight of the start day, so they can run several days
function maxDays(){return Math.max(1,...S.rules.map(r=>+r.end.days||0))}
function endLabel(x){
  if(x.b<=1440) return fmt(x.b);
  const k=Math.floor((x.b-1)/1440);
  return `${WDN[dow(addDays(x.s,k))]} ${fmt(x.b)}`+(k===1?" (next day)":` (${k} days later)`);
}
function carried(door,s){ // windows that started on an earlier day and are still running today
  const out=[];
  for(let k=1;k<=maxDays();k++){
    const from=addDays(s,-k);
    resolve(door,dayInfo(from)).filter(x=>x.b>k*1440).forEach(x=>out.push({x,k,until:x.b-k*1440}));
  }
  return out;
}
/* ---------- clash check: equal-score rules may not overlap with different modes ---------- */
function scanAll(doors,from,days){
  const out={clash:[],applied:new Map(),cuts:[],top:new Map()};DI_CACHE=new Map();
  try{
    for(const door of doors){
      const list=[];
      for(let i=0;i<days;i++){const s=addDays(from,i);resolve(door,dayInfo(s)).forEach(x=>{
        list.push({x,st:i*1440+x.a,en:i*1440+x.b,s});
        out.applied.set(door+"|"+s+"|"+x.r.id,{door,s,r:x.r,sc:x.sc});
        const t=out.top.get(door+"|"+s);if(!t||x.sc>t.sc)out.top.set(door+"|"+s,{r:x.r,sc:x.sc});
      })}
      list.sort((p,q)=>p.st-q.st);
      for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length&&list[j].st<list[i].en;j++){
        const A=list[i],B=list[j];
        if(A.x.r.id===B.x.r.id||A.x.r.mode===B.x.r.mode) continue;
        const off=daysBetween(from,B.s)*1440, st=Math.max(A.st,B.st)-off, en=Math.min(A.en,B.en)-off;
        if(A.x.sc===B.x.sc) out.clash.push({key:door+"|"+B.s+"|"+[A.x.r.id,B.x.r.id].sort().join("-"),door,s:B.s,a:A.x.r,b:B.x.r,st,en,sc:A.x.sc});
        else{const hi=A.x.sc>B.x.sc?A.x:B.x, lo=hi===A.x?B.x:A.x;
          out.cuts.push({key:door+"|"+B.s+"|"+hi.r.id+">"+lo.r.id,door,s:B.s,hi:hi.r,lo:lo.r,hs:hi.sc,ls:lo.sc,st,en})}
      }
    }
  }finally{DI_CACHE=null}
  return out;
}
// try a change without keeping it: what would clash, and which lower-score schedules it would replace
function trial(change,doors,from,days,selfId){
  const keep={rules:structuredClone(S.rules),events:structuredClone(S.events),hdates:structuredClone(S.hdates),gdates:structuredClone(S.gdates)};
  const B=scanAll(doors,from,days);
  change();
  const A=scanAll(doors,from,days);
  Object.assign(S,keep);
  const bClash=new Set(B.clash.map(c=>c.key)), bCut=new Set(B.cuts.map(c=>c.key));
  const clashes=A.clash.filter(c=>!bClash.has(c.key));
  const g={};
  // rules that ran before but no longer run that day, because something scored higher
  B.applied.forEach((v,k)=>{ if(A.applied.has(k)||v.r.id===selfId) return; const t=A.top.get(v.door+"|"+v.s); if(!t||t.sc<=v.sc) return;
    const gk="r|"+v.door+"|"+v.r.id+"|"+t.r.id;(g[gk]=g[gk]||{type:"replaced",door:v.door,lo:v.r,ls:v.sc,hi:t.r,hs:t.sc,n:0,first:v.s}).n++; if(v.s<g[gk].first)g[gk].first=v.s });
  // rules that still run but lose part of their time to a higher-score rule with a different mode
  A.cuts.filter(c=>!bCut.has(c.key)&&c.lo.id!==selfId).forEach(c=>{const gk="c|"+c.door+"|"+c.lo.id+"|"+c.hi.id;
    (g[gk]=g[gk]||{type:"cut",door:c.door,lo:c.lo,ls:c.ls,hi:c.hi,hs:c.hs,n:0,first:c.s,st:c.st,en:c.en}).n++; if(c.s<g[gk].first){g[gk].first=c.s;g[gk].st=c.st;g[gk].en=c.en} });
  const cg={};clashes.forEach(c=>{const k=c.door+"|"+[c.a.id,c.b.id].sort().join("-");(cg[k]=cg[k]||{c,n:0}).n++});
  return {
    clashes:Object.values(cg).slice(0,5).map(({c,n})=>`"${c.a.name}" and "${c.b.name}" clash on ${c.door} (${c.a.mode} vs ${c.b.mode}, both score ${c.sc}) on ${n} day${n===1?"":"s"}, first ${WDN[dow(c.s)]}, ${shortDate(c.s)}, ${fmt(c.st)} to ${fmt(c.en)}`),
    displaced:Object.values(g)
  };
}
function clashMsg(list){return `Not saved. ${list.join(". ")}. Change the times, make one rule more or less specific, or set one to run alongside.`}
function displacedLine(d){
  const when=`${d.n} day${d.n===1?"":"s"} in the next year, first ${WDN[dow(d.first)]}, ${shortDate(d.first)}`;
  return d.type==="replaced"
    ?`"${d.lo.name}" (score ${d.ls}) will not run on ${d.door} on ${when}. "${d.hi.name}" (score ${d.hs}) replaces it.`
    :`"${d.lo.name}" (score ${d.ls}, ${d.lo.mode}) is overridden on ${d.door} by "${d.hi.name}" (score ${d.hs}, ${d.hi.mode}) for part of ${when}, ${fmt(d.st)} to ${fmt(d.en)}.`;
}
// run a change through the checks: block clashes, ask before replacing lower-score schedules
function attempt({change,doors,from,days,selfId,el,done}){
  const t=trial(change,doors,from,days,selfId);
  if(t.clashes.length){el.innerHTML=`<div class="warnbox" style="background:var(--lock-soft);color:var(--lock)">${esc(clashMsg(t.clashes))}</div>`;el.hidden=false;return}
  const finish=()=>{change();el.innerHTML="";const sum=t.displaced.length?` (replaces lower-score schedules: ${[...new Set(t.displaced.map(d=>`"${d.lo.name}" on ${d.door}`))].join(", ")})`:"";done(sum)};
  if(!t.displaced.length){finish();return}
  el.innerHTML=`<div class="warnbox"><b>This changes schedules that have a lower score.</b><ul>${t.displaced.slice(0,8).map(d=>`<li>${esc(displacedLine(d))}</li>`).join("")}</ul>
    ${t.displaced.length>8?`<p style="margin:4px 0">and ${t.displaced.length-8} more.</p>`:""}
    <div class="tline" style="margin-top:8px"><button class="btn sm pri" type="button" data-cyes>Save anyway</button><button class="btn sm" type="button" data-cno>Cancel</button></div></div>`;
  el.hidden=false;
  el.querySelector("[data-cyes]").onclick=finish;
  el.querySelector("[data-cno]").onclick=()=>{el.innerHTML=""};
}
function conflicts(door,info,w){
  const out=[];
  for(let i=0;i<w.length;i++)for(let j=i+1;j<w.length;j++){
    const A=w[i],B=w[j]; if(A.r.mode===B.r.mode||A.sc!==B.sc) continue;
    const ae=A.b, be=B.b;
    const s=Math.max(A.a,B.a), e=Math.min(ae,be);
    if(s<e) out.push(`${door}: "${A.r.name}" (${A.r.mode}) and "${B.r.name}" (${B.r.mode}) overlap ${fmt(s)} to ${fmt(e)} with the same score`);
  }
  if(!w.length&&info.keys.has("yt_any")&&S.rules.some(r=>expandDoors(r.doors).includes(door)))
    out.push(`${door}: no rule on yom tov, so it falls back to its regular Protector.Net schedule`);
  return out;
}
// manual overrides that touch this day, clipped to the day, in minutes
function overridesFor(door,s){
  const res=[];
  S.overrides.forEach(o=>{
    if(!expandDoors(o.doors).includes(door)) return;
    const ds=nyDate(o.from), de=o.to?nyDate(o.to):"9999-12-31";
    if(s<ds||s>de) return;
    const a=s===ds?nyMinutes(o.from):0, b=o.to&&s===de?nyMinutes(o.to):1440;
    res.push({o,a,b,open:!o.to});
  });
  return res;
}

/* ---------- render ---------- */

function daySegments(door,s){
  const info=dayInfo(s), cand=[];
  carried(door,s).forEach(c=>cand.push({a:0,b:Math.min(c.until,1440),r:c.x.r,pr:c.x.sc,src:`continues from ${WDN[dow(c.x.s)]}`,end:c.x}));
  resolve(door,info).forEach(x=>cand.push({a:x.a,b:Math.min(x.b,1440),r:x.r,pr:x.sc,src:x.via,end:x}));
  if(!NO_OV) overridesFor(door,s).forEach(o=>cand.push({a:o.a,b:o.b,ov:o.o,pr:1000}));
  const slot=new Array(1440).fill(null);
  cand.forEach(c=>{const rank=c.pr+((c.r&&c.r.mode==="Lockdown")?500:0);
    for(let m=Math.max(0,c.a);m<Math.min(1440,c.b);m++){const cur=slot[m];if(!cur||rank>cur.rank)slot[m]={c,rank}}});
  const dc={r:DEF_RULE(door),isDef:true};
  for(let m=0;m<1440;m++) if(!slot[m]) slot[m]={c:dc,rank:-1};
  const segs=[];let m=0;
  while(m<1440){const cur=slot[m];let e=m+1;while(e<1440&&slot[e]?.c===cur?.c)e++;if(cur)segs.push({a:m,b:e,c:cur.c});m=e}
  return segs;
}
