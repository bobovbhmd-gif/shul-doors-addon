"""Hebrew calendar day keys for the door rules, for any range of years.
Usage: python3 calgen.py START END > out.json   (dates as YYYY-MM-DD)
Output: {"start":..., "cal":{date:[keys]}, "heb":[per day leap*10000+month*100+day], "parsha":{shabbos date: name}}
"""
import sys
from pyluach import dates, parshios, hebrewcal
import datetime, json
from collections import defaultdict
START=datetime.date.fromisoformat(sys.argv[1]); END=datetime.date.fromisoformat(sys.argv[2])
K=defaultdict(set)
def g2h(g): return dates.GregorianDate(g.year,g.month,g.day).to_heb()
def h2g(y,m,d):
    x=dates.HebrewDate(y,m,d).to_greg(); return datetime.date(x.year,x.month,x.day)
def g2h_y(g): return dates.GregorianDate(g.year,g.month,g.day).to_heb().year
def add(g,*keys):
    if START<=g<=END:
        for k in keys: K[g].add(k)
D=datetime.timedelta
for hy in range(g2h_y(START)-1, g2h_y(END)+2):
    leap=hebrewcal.Year(hy).leap
    # Rosh Hashana
    rh=h2g(hy,7,1); add(rh-D(1),'erev_rh','erev_yt_any'); add(rh,'rh1','yt_any'); add(rh+D(1),'rh2','yt_any','motzaei_rh','motzaei_yt_any')
    yk=h2g(hy,7,10); add(yk-D(1),'erev_yk','erev_yt_any'); add(yk,'yk','yt_any','motzaei_yk','motzaei_yt_any')
    s=h2g(hy,7,15); add(s-D(1),'erev_succos','erev_yt_any'); add(s,'succos1','yt_any'); add(s+D(1),'succos2','yt_any','motzaei_yt_any')
    for i in range(2,6): add(s+D(i),f'succos{i+1}','chol_any')
    add(s+D(6),'hoshana_rabba','chol_any','erev_yt_any'); add(s+D(7),'shmini_atzeres','yt_any'); add(s+D(8),'simchas_torah','yt_any','motzaei_simchas_torah','motzaei_yt_any')
    # Elul, aseres yemei teshuva
    for i in range(10): add(rh+D(i),'aseres_yemei')
    # Chanuka 25 Kislev (month 9)
    c=h2g(hy,9,25); add(c-D(1),'erev_chanuka')
    for i in range(7): add(c+D(i),f'chanuka{i+1}')
    add(c+D(7),'zos_chanuka')
    add(h2g(hy,11,14),'erev_tub'); add(h2g(hy,11,15),'tub')
    adar=13 if leap else 12
    if leap: add(h2g(hy,12,14),'purim_katan')
    p=h2g(hy,adar,14); add(p-D(1),'erev_purim'); add(p,'purim'); add(p+D(1),'shushan_purim')
    ps=h2g(hy,1,15); add(ps-D(1),'erev_pesach','erev_yt_any'); add(ps,'pesach1','yt_any'); add(ps+D(1),'pesach2','yt_any','motzaei_yt_any')
    for i in range(2,6): add(ps+D(i),f'pesach{i+1}','chol_any')
    add(ps+D(5),'erev_yt_any'); add(ps+D(6),'shvii_pesach','yt_any'); add(ps+D(7),'acharon_pesach','yt_any','motzaei_pesach','motzaei_yt_any')
    add(h2g(hy,2,14),'pesach_sheni'); add(h2g(hy,2,17),'erev_lag'); add(h2g(hy,2,18),'lag')
    for i in range(49): add(ps+D(1+i),'sefira')
    sv=h2g(hy,3,6); add(sv-D(1),'erev_shavuos','erev_yt_any'); add(sv,'shavuos1','yt_any'); add(sv+D(1),'shavuos2','yt_any','motzaei_shavuos','motzaei_yt_any')
    # Elul of hy (month 6) leads into hy+1
    for d in range(1,30): add(h2g(hy,6,d),'elul')
    # Rosh Chodesh, every month except Tishrei
    for m in [8,9,10,11,12]+([13] if leap else [])+[1,2,3,4,5,6]:
        first=h2g(hy,m,1); prevlen=(first-D(1)); hp=g2h(prevlen)
        if hp.day==30: days=[prevlen,first]
        else: days=[first]
        add(days[0]-D(1),'erev_rc'); add(days[0],'rc1','rc_any')
        if len(days)==2: add(days[1],'rc2','rc_any')
        add(days[-1],'motzaei_rc')
    # BHB: Mon, Thu, Mon after first Shabbos (on/after the 2nd) of Cheshvan(8) and Iyar(2)
    for m,tag in [(8,'bhb_c'),(2,'bhb_i')]:
        d=h2g(hy,m,2)
        while d.weekday()!=5: d+=D(1)
        for n,off in enumerate([2,5,9],1): add(d+D(off),f'{tag}{n}','fast_any')
    # three weeks / nine days
    t=h2g(hy,4,17)
    tb=h2g(hy,5,9)
    for i in range((tb-t).days+1): add(t+D(i),'three_weeks')
    for i in range(9): add(h2g(hy,5,1)+D(i),'nine_days')
# fasts with postponement from pyluach
g=START
while g<=END:
    f=g2h(g).fast_day()
    m={"Tzom Gedalia":'tzom_gedalia',"10 of Teves":'asara_teves',"Taanis Esther":'taanis_esther',"17 of Tamuz":'shiva_asar_tammuz',"9 of Av":'tisha_bav'}
    if f in m:
        add(g,m[f],'fast_any'); add(g-D(1),'erev_fast_any')
        if f=="9 of Av": add(g-D(1),'erev_tisha_bav')
    # Shovavim: Sun-Fri before Shabbos of Shemos..Mishpatim (leap: to Tetzaveh)
    if g.weekday()==5:
        p=parshios.getparsha(dates.GregorianDate(g.year,g.month,g.day),israel=False)
        if p:
            hy=g2h(g).year
            leap=hebrewcal.Year(hy).leap
            sv={12,13,14,15,16,17}|({18,19} if leap else set())
            if set(p)&sv:
                for i in range(1,7): add(g-D(i),'shovavim')
    g+=D(1)
out={k.isoformat():sorted(v) for k,v in sorted(K.items())}
heb=[];par={}
g=START
while g<=END:
    h=g2h(g); heb.append((10000 if hebrewcal.Year(h.year).leap else 0)+h.month*100+h.day)
    if g.weekday()==5:
        p=parshios.getparsha_string(dates.GregorianDate(g.year,g.month,g.day),israel=False)
        if p: par[g.isoformat()]=p
    g+=D(1)
json.dump({"start":START.isoformat(),"end":END.isoformat(),"cal":out,"heb":heb,"parsha":par},sys.stdout,separators=(',',':'))
