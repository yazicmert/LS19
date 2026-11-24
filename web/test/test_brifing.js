// Görev brifingi sınaması (Node): cd web && node test/test_brifing.js
//  1) brifingtext.js saf yardımcıları: kim görür (ilk ziyaret / geri dönen / bağlantı), LS19 önerileri, profil istatistikleri (hazır tasarımlar),
//     roket–araç uyumu, tasarım süresi kestirimi, tarih seçenekleri, özet
//  2) arayüz sözleşmesi: brifing açıkken araç, göstergeler, panel ve görev çubuğu gizli; Esc ve kısayollar; tasarım bir kez, sonda; kalkış sonrası uçuş
//  3) kalkış ön yüklemesi: seçilen roket ve rampası önceden hazırlanır, setAscent hazır grubu taşır (bekleme yok)
import fs from 'fs';
import * as B from '../js/brifingtext.js';

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}`); if (!ok) fail++; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const defs = JSON.parse(read('data/designs_default.json'));

// ---------------------------------------------------------------- 1) saf yardımcılar
check('beş adım: Nereye → Ne zaman → Nasıl → Neyle → Brifing', B.BRIEF_STEPS.map((s) => s.k).join() === 'yer,tarih,profil,roket,brifing');
const K = (search, visited = false, view = 'lab', exp = 'ay', entered = true) => B.briefKind({ search, visited, view, exp, entered });
check('kim görür: Ay görevine girilince ilk ziyaret "new", geri dönen "return"; Canlı Gökyüzü, deney merkezi ve öteki deneyler görmez',
  K('') === 'new' && K('?lang=tr', true) === 'return' && K('', false, 'sky', null) === null && K('', false, 'lab', 'saptirma') === null && K('', false, 'lab', 'home') === null && K('', false, 'lab', null) === null);
check('Laboratuvar açılınca kendiliğinden açılmaz: sayfa doğrudan Ay görevinde açılsa da (kayıtlı son deney, ?exp=ay) yalnız ?brifing=1 açar (merkezde değil: açık deneyin brifingi)',
  K('', false, 'lab', 'ay', false) === null && K('?mode=lab&exp=ay', false, 'lab', 'ay', false) === null && K('?brifing=1', false, 'lab', 'home', false) === null && K('?brifing=1', true, 'lab', 'ay', false) === 'return');
check('bağlantıyla gelen brifingi görmez: görev anahtarları (date, profile, yer, roket…), sekme, fragman; ?brifing=0 kapatır, ?brifing=1 açar',
  K('?date=2026-10-13') === null && K('?profile=NRHO') === null && K('?yer=A15&arac=two') === null && K('?tab=kontrol') === null && K('?cine=1') === null
  && K('?brifing=0') === null && K('?brifing=1&date=2026-10-13') === 'new' && K('?mode=lab&exp=ay') === 'new');
const st = B.profileStats(defs, 'APOLLO'), nr = B.profileStats(defs, 'NRHO');
check('profil istatistikleri hazır tasarımlardan: Apollo ~4,3 gün, Δv ~5.911 m/s, iniş aracı 3.600 kg; NRHO daha uzun ve daha pahalı',
  Math.abs(st.days - 4.29) < 0.05 && Math.abs(st.dv - 5911) < 2 && st.lander === 3600 && nr.days > st.days && nr.dv > st.dv && B.profileStats(defs, 'YOK') === null);
check('her profilin kartı ve istatistiği var', B.PROFILE_ORDER.every((k) => B.PROFILE_NOTES[k] && B.profileStats(defs, k)));
check('roket uyumu: genel kademe göreve göre boyutlanır; Falcon 9 (3.787 kg) Apollo aracını (3.600) taşır, L2 aracını (4.540) taşımaz',
  B.rocketFit(null, 3600).ok && B.rocketFit(null, 3600).sized && B.rocketFit(3787, 3600).ok && !B.rocketFit(3787, B.profileStats(defs, 'L2').lander).ok);
check('tasarım süresi: hazır tasarım (Apollo 11 yeri, Ekim 2026, genel kademe) anında; başka yer/roket 10–30 sn; halo profilleri 1–2 dk',
  B.designEta({ site: 'A11', date: '2026-10-13', rocket: 'GENEL', profile: 'APOLLO' }).k === 'now' && B.designEta({ site: 'A15', date: '2026-10-13', rocket: 'GENEL', profile: 'APOLLO' }).k === 'mid'
  && B.designEta({ site: 'A11', date: '2026-10-13', rocket: 'SATURN_V', profile: 'APOLLO' }).k === 'mid' && B.designEta({ site: 'A15', date: '2026-10-13', rocket: 'SLS1', profile: 'NRHO' }).k === 'long');
check('LS19 önerileri: Hadley; Apollo 11 yerinde hazır pencere, başka yerde bugünden sonraki pencere; Apollo hızlı; Apollo profillerine Saturn V, halo profillerine SLS',
  B.recommend('yer').v === 'A15' && B.recommend('tarih', { site: 'A11' }).v === B.DEFAULT_BRIEF_DATE && B.recommend('tarih', { site: 'A15' }, '2026-11-24').v === '2026-11-24'
  && B.recommend('profil').v === 'APOLLO' && B.recommend('roket', { profile: 'APOLLO11' }).v === 'SATURN_V' && B.recommend('roket', { profile: 'NRHO' }).v === 'SLS1'
  && ['yer', 'tarih', 'profil', 'roket'].every((k) => B.recommend(k, {}).why.length > 20));
check('tarih seçenekleri: hazır pencere, bugün, Apollo 11 günü', B.datePresets('2026-11-24').map((d) => d.d).join() === '2026-10-13,2026-11-24,1969-07-16');
check('iniş yeri notları LUNAR_SITES kimlikleriyle', Object.keys(B.SITE_NOTES).join() === 'A11,A12,A14,A15,A16,A17');
const D = defs.profiles.APOLLO.design, sm = B.briefSummary(D, (t) => 'T' + Math.round(t));
check('özet: fırlatma ve iniş anı, süre, Δv dökümü ve toplamı, inişte Güneş', sm.launch === 'T' + Math.round(D.LAUNCH.t_launch) && sm.landing === 'T' + Math.round(D.t_L)
  && Math.abs(sm.days - st.days) < 1e-9 && sm.dv.map(([k]) => k).join() === 'TLI,LOI,DOI,PDI' && Math.abs(sm.total - st.dv) < 1e-9 && sm.sunEl > 5 && B.briefSummary(null, String) === null);

// ---------------------------------------------------------------- 2) arayüz sözleşmesi
const app = read('js/app.js'), br = read('js/brifing.js') + read('js/brifkabuk.js'), css = read('css/brifing.css'), html = read('index.html');
check('stil ve modüller sayfada; panelde "LS19 ile adım adım tasarla" düğmesi', /href="css\/brifing\.css"/.test(html) && /id="btnBrief"/.test(html) && /modulepreload" href="js\/brifing\.js"/.test(html));
check('brifing açıkken araç, uçuş göstergeleri, deney paneli, görev çubuğu ve yüzey uyarıları gizli; üst çubuk kalır',
  /body\.briefing #hud, body\.briefing #controls, body\.briefing #manual, body\.briefing #labPanel/.test(css) && !/body\.briefing #modebar/.test(css)
  && /W\.vehicle\.visible = false/.test(br) && /W\[k\]\.visible = this\.keepVisible\(k, c\)/.test(br) && /keepVisible\(k, c\) \{ return !!c\.orbit && k === 'embMoon'; \}/.test(br) && /hideVehicle: true/.test(br));
check('Laboratuvar merkezinden Ay görevi seçilince açılır (sayfa başına bir kez; ilk görev hazır değilse hazır olunca); açılış deney merkezi; başka alana geçince kapanır; Esc bir adım geri, öteki kısayollar kapalı',
  /const B = briefs\[labui\.page\], ent = briefEntered\.has\(labui\.page\), bk = B && briefKind\(\{ search: ent \? '' : location\.search, visited: B\.seen\(\), view: S\.VIEW, exp: labui\.page, entered: ent, briefed: Object\.keys\(briefs\) \}\); if \(bk\) B\.open\(bk\);/.test(app)
  && /\$\('#lab-home'\)\.addEventListener\('click', \(e\) => \{\s*const b = e\.target\.closest\('\[data-exp\]'\), exp = b && b\.dataset\.exp, B = briefs\[exp\];\s*if \(!B \|\| briefEntered\.has\(exp\)\) return;/.test(app)
  && /briefs\.ay = brief;/.test(app)
  && /new LabUI\(\{ initial: LAB_HOME \}\)/.test(app)
  && /B\.close\('away'\)/.test(app) && /if \(briefOn\(\) && k !== 'escape'\) return;/.test(app) && /e\.key !== 'Escape'/.test(br) && /window\.addEventListener\('keydown', this\.onKey, true\)/.test(br));
check('tasarım yalnız sonda bir kez: seçimler yapılandırmaya yazılır (araç ve roket yeniden tasarım tetiklemeden), startDesign çağrılır; hazır olunca özet, hata brifingde',
  /applyRocket\(sel\.rocket\)/.test(app) && /ui\.setConfig\(\{ \.\.\.PROFILES\[sel\.profile\]\.cfg, moonSite: sel\.site \}\)/.test(app) && /await startDesign\(sel\.date\);/.test(app)
  && /if \(brief\) brief\.onReady\(S\.DESIGN\);/.test(app) && /brief\.onFail\(m\)/.test(app) && /function applyRocket\(id\)/.test(app));
check('başlatma: rampadan (kalkış, sonra görev kendiliğinden sürer), yörüngeden ya da fragman', /if \(how === 'pad'\) \{ ascentThenPlay = true; \$\('#btnAscent'\)\.click\(\); \}/.test(app)
  && /if \(ascentThenPlay\) \{ ascentThenPlay = false; setTimeout\(\(\) => setPlay\(true\), 300\); \}/.test(app) && /go: 'pad'/.test(br) && /go: 'orbit'/.test(br) && /go: 'cine'/.test(br) && /data-go="\$\{first\.go\}"/.test(br));
check('telefonda alttan çıkan sayfa; hareket azaltma tercihine uyar', /@media \(max-width: 700px\)/.test(css) && /prefers-reduced-motion: reduce/.test(css));

// ---------------------------------------------------------------- 3) kalkış ön yüklemesi
const av = read('js/ascentview.js'), ap = read('js/ascentplay.js');
check('ön yükleme: modeller, gökyüzü gölgelendiricisi, rampa zemini ve binalar görünmez grupta; setAscent aynı rampa için grubu taşır (indirme ve çözme yok)',
  /preloadAscent\(spec\) \{/.test(av) && /if \(P\) pad\.add\(P\.G\);/.test(av) && /this\._pre && this\._pre\.key === ascKey\(spec\)/.test(av)
  && /this\._skyMatP \|\| \(this\._skyMatP = this\.skyMaterial\(\)\)/.test(av) && /dropPreload\(\)/.test(av));
check('kalkış ve ön yükleme aynı tanımla (ascentSpec): roket türü, rampa düzeni ve konumu eşleşir', /setAscent\(ascentSpec\(rk, \{ \.\.\.site, name: L\.site \}\)\)/.test(ap)
  && /preloadAscent\(ascentSpec\(rocketOf\(rocketId\)/.test(ap) && /preloadAscent\(ascentSpec\(rk, \{ lat: L\.lat \?\? LEGACY_SITE\.lat/.test(ap));
check('ne zaman: brifingde roket adımında seçilen roket ve rampası; her görev hazır olunca (boşta, veri tasarrufunda değil)',
  /if \(this\.h\.preload\) this\.h\.preload\(this\.sel\.rocket\);/.test(br) && /ascent\.preloadDesign\(D0\)/.test(app) && /saveData/.test(app));

// ---------------------------------------------------------------- 4) Aşama 2: yer seçme, canlı tasarım, gerçek yol, gerekçeler, telefon
{
const EO = await import('../js/earth.js'), { makeLive } = await import('../js/live.js'), { missionPath } = await import('../js/design.js');
const ab = (f) => { const b = fs.readFileSync(new URL('../' + f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(read('data/earth_orient.json')); EO.loadEarthOrientation(eo);
makeLive(ab('data/de440s.bsp'), ab('data/moon_pa_de440_200625.bpc'), eo, defs.tStart);
const mp = (k) => missionPath(defs.profiles[k].design), dM = (q) => Math.hypot(q[0] - 1, q[1], q[2]);
const pA = mp('APOLLO'), nr = mp('NRHO'), l2 = mp('L2'), l1 = mp('L1'), yk = mp('YUKSELTME');
const trA = pA[0].pts, haloX = (P) => P[1].pts.map((q) => q[0]);
check('gerçek yol (tasarımın kuvvet modeli): Apollo TLI Dünya yakınında başlar, Ay\'da (perilün) biter; Dünya–Ay dönen çerçevesinde, birim Ay uzaklığı',
  pA.length === 1 && pA[0].kind === 'transfer' && Math.hypot(...trA[0]) < 0.03 && dM(trA[trA.length - 1]) < 0.01 && trA.every((q) => q.every(Number.isFinite)));
check('halo profillerinde gerçek halo: NRHO Ay\'ın çevresinde (|x−1| < 0,06), L2 Ay\'ın ötesinde (x > 1,1), L1 Dünya ile Ay arasında (0,8 < x < 0,9)',
  nr[1].kind === 'halo' && haloX(nr).every((x) => Math.abs(x - 1) < 0.06) && haloX(l2).every((x) => x > 1.1) && haloX(l1).every((x) => x > 0.8 && x < 0.9));
check('Ay\'a ulaşmayan yol çizilmez (yükseltmeli profil: şematik kalır)', yk === null && B.livePath('YUKSELTME', yk) === null);
const lp = B.livePath('APOLLO', pA);
check('canlı çizim: gerçek aktarma + şematik park ve Ay yörüngesi', lp.some((p) => p.real && p.kind === 'transfer') && lp.some((p) => p.kind === 'park' && !p.real) && lp.some((p) => p.kind === 'moon'));
const svgIn = (G) => G.paths.every((p) => p.d.slice(1).split('L').every((xy) => { const [x, y] = xy.split(' ').map(Number); return x >= 0 && x <= 132 && y >= 0 && y <= 64; }));
check('kart çizimi sığar: şematik ve gerçek yolların her noktası çizimin içinde; Dünya solda, Ay sağda',
  B.PROFILE_ORDER.every((k) => svgIn(B.profileSvg(k))) && svgIn(B.profileSvg('APOLLO', 132, 64, lp)) && svgIn(B.profileSvg('L2', 132, 64, B.livePath('L2', l2))) && B.profileSvg('APOLLO').E[0] < B.profileSvg('APOLLO').M[0]);
check('şematik yollar: her profilde park + aktarma + Ay yörüngesi; halo profillerinde halo, yükseltmelide üç elips',
  B.PROFILE_ORDER.every((k) => { const P = B.profilePath(k); return P.some((p) => p.kind === 'park') && P.some((p) => p.kind === 'transfer') && P.some((p) => p.kind === 'moon'); })
  && ['NRHO', 'L2', 'L1'].every((k) => B.profilePath(k).some((p) => p.kind === 'halo')) && B.profilePath('YUKSELTME').filter((p) => p.kind === 'raise').length === 3);
const sA = B.statsOf(defs.profiles.APOLLO.design);
check('yakıt özeti: TLI ve iniş için gereken ve kademede olan (Apollo: iniş 1.950 / 2.300 kg)', sA.landNeed === 1950 && sA.landHave === 2300 && sA.tliNeed === 6200 && sA.tliHave === 6200);
const R = B.reasons('profil', { profile: 'APOLLO' }, { stats: (k) => B.statsOf(defs.profiles[k].design) }), RN = B.reasons('profil', { profile: 'NRHO' }, { stats: (k) => B.statsOf(defs.profiles[k].design) });
const RR = B.reasons('roket', { profile: 'APOLLO', rocket: 'SATURN_V' }, { defs, cap: () => 46768 }), RY = B.reasons('yer', { site: 'A15' }, { lat: () => 26.13 });
check('gerekçeler sayılarla: en kısa/en ucuz karşılaştırması, iniş yakıtı payı (ya da "boyutlandı"), roketin taşıma katı, enleme göre yörünge eğimi',
  R.some((q) => /En kısa görev/.test(q.t)) && R.some((q) => /pay \{2\}/.test(q.t) && q.a[2].n === 350) && RN.some((q) => /en kısadan/.test(q.t))
  && RR.some((q) => /katı/.test(q.t) && Math.abs(q.a[1].n - 13) < 0.1) && RY.some((q) => /Enlem/.test(q.t) && Math.abs(q.a[0].n - 26.13) < 1e-9) && R.every((q) => q.a.every((x) => typeof x === 'string' || Number.isFinite(x.n))));
check('canlı tasarım: seçilen yer, tarih, roket ve rampasıyla iş parçacığında (önce seçili profil), ortak önbelleğe yazılır (son tasarım anında), yol da hesaplanır; seçim değişince yeniden, brifing kapanınca durur',
  /async function briefDesign\(sel, key, onProg, stop\)/.test(app) && /designCache\.set\(ck, hit\)/.test(app) && /path: true/.test(app) && /pathFor: hit\.design/.test(app)
  && /liveKey\(\) \{ const s = this\.sel; return \[s\.site, s\.date, s\.rocket\]\.join\('\|'\); \}/.test(br) && /this\.sel\.profile\].st === 'wait' \? this\.sel\.profile/.test(br)
  && /this\.stopLive\(\); this\.waitLive = false;/.test(br) && /if \(row && row\.st === 'busy'\) \{ this\.waitLive = true; return; \}/.test(br)
  && /missionPath\(design\)/.test(read('js/designwork.js')) && /this\.lastPath = d\.path \|\| null/.test(read('js/designjob.js')));
check('Ay\'da yer seçme: altı yer işaretli, Nereye adımında işarete dokununca seçilir; Ay görünüm için aydınlatılır (görev gününde yer gecede olabilir)',
  /this\.placePin\('s:' \+ k/.test(br) && /n\.onclick = o\.pick \|\| null/.test(br) && /W\.moonU\.sunDir\.value\.set/.test(br) && /button\.brief-pin\.pick \{ pointer-events: auto/.test(css));
check('görüntü kaydırma: cisim kartın arkasında kalmaz (masaüstü sağa, telefon yukarı); kapanınca kalkar; telefonda liste tam ekrana büyür',
  /cam\.setViewOffset\(w, h, ox, oy, w, h\)/.test(br) && /this\.viewOffset\(this\.h\.world, true\)/.test(br) && /\.brief-step\.full \{/.test(css) && /class="brief-grab"/.test(br));
check('sahnede yol: hesap bitince gerçek yola döner (gerçek yoksa şematik), Dünya kayan başlangıç noktasında', /for \(const part of real \|\| profilePath\(key\)\)/.test(br) && /this\.path3d\.g\.position\.set\(-eye\[0\], -eye\[1\], -eye\[2\]\)/.test(br));
}

// ---------------------------------------------------------------- 5) video analizi düzeltmeleri
{
  const tl = B.briefTimeline(defs.profiles.APOLLO.design), tn = B.briefTimeline(defs.profiles.NRHO.design);
  check('brifing çizelgesi: fırlatma → TLI → Ay yörüngesine giriş → iniş (sıralı, T+); halo profilinde halo girişi ve ayrılışı',
    tl.map((r) => r.k).join() === "Fırlatma,Ay'a aktarma yakışı (TLI),Ay yörüngesine giriş (LOI),İniş" && tl[0].dt === 0 && tl.every((r, i) => !i || r.dt >= tl[i - 1].dt)
    && tn.map((r) => r.k).includes('Halo yörüngesine giriş') && tn.map((r) => r.k).includes('Halodan ayrılış') && B.tPlus(4 * 86400 + 7 * 3600 + 4 * 60 + 30).d === 4 && B.tPlus(4 * 86400 + 7 * 3600 + 4 * 60).m === 4);
  check('arka plan hesabı: ötekiler yalnız profil adımında; roket ve brifing adımlarında yalnız seçili profil; profil adımına dönünce döngü sürer',
    /const k = L\.rows\[this\.sel\.profile\] && L\.rows\[this\.sel\.profile\]\.st === 'wait' \? this\.sel\.profile : onProfile \?/.test(br) && /if \(!this\.liveState\.running\) this\.runLive\(this\.liveState\)/.test(br) && /L\.running = false;/.test(br));
  check('brifingde tasarım sırasında tam ekran yükleme örtüsü yok (brifing kendi göstergesini gösterir)', /if \(!\(brief && brief\.active\)\) \{ \$\('#loading'\)\.style\.display = 'grid';/.test(app));
  check('roket adımı: Dünya seçilen roketin rampasına döner, rampa işaretli (ad: roket · rampa)', /c\.pad && this\.h\.padOf/.test(br) && /this\.placePin\('pad'/.test(br) && /padOf: \(id\) =>/.test(app));
  check('kart: "yakınsamadı" kısa; açıklama kart metninde (başlık sıkışmaz)', /row\.st === 'err' \? 'yakınsamadı'/.test(br) && /Görevi tasarla bir sonraki pencereyi dener/.test(br));
  check('işaret çakışması: Apollo 12 ve 15\'in adı solda (düğme işaretlerinde de)', /left: k === 'A12' \|\| k === 'A15'/.test(br) && /button\.brief-pin\.left:not\(\.on\) b \{ left: auto; right: 12px; \}/.test(css));
  check('dikey ekran: kamera uzaklaşır (Dünya–Ay sistemi en çok 2,2 kat, cisim 1,75 kat); telefonda Dünya–Ay görünümü sola kayar (Ay sığar)',
    /asp < 1 \? this\.portraitScale\(c, asp\) : 1/.test(br) && /c\.mode === 'SYSTEM' \|\| c\.mode === 'SOLAR' \? Math\.min\(2\.2, 0\.95 \/ asp\) : 1\.75/.test(br) && /if \(sys && !intro\) ox = Math\.round\(w \* 0\.28\)/.test(br));
}

// ---------------------------------------------------------------- 6) ortak brifing kabuğu (Laboratuvar deneyleri)
{
  const ksh = read('js/brifkabuk.js'), ayb = read('js/brifing.js');
  check('kabuk deneyden bağımsız: Ay görevine, rokete, iniş yerine ve tasarıma dair hiçbir şey içermez',
    !/moonsite|rockets|brifingtext|design|PROFILE|LUNAR_SITES|sel\.site|sel\.rocket/.test(ksh) && /export class BriefShell/.test(ksh));
  check('Ay görevi brifingi kabuğun üstünde: kart, adımlar, öneri/gerekçe, işaretler, kamera ve görüntü kaydırma kabuktan gelir',
    /export class Briefing extends BriefShell/.test(ayb) && /super\(host, \{ id: 'ay', domId: 'brief'/.test(ayb) && !/setViewOffset|placePin\(key, p, label/.test(ayb)
    && ['introCard', 'renderStep', 'recommendFor', 'reasonsFor', 'aim'].every((m) => new RegExp('\\n  ' + m + '\\(').test(ayb)));
  check('kabuk: alt sınıfın dolduracağı yerler boş varsayılanlı (aim → null, keepVisible → false); adım anahtarı, yeniden çizim, başlatma düğmeleri, bekleme ve hata kutusu ortak',
    /aim\(\) \{ return null; \}/.test(ksh) && /keepVisible\(\) \{ return false; \}/.test(ksh) && /stepKey\(\)/.test(ksh) && /goButtons\(acts, backLabel, onGo\)/.test(ksh) && /waitBox\(body, lead, note\)/.test(ksh) && /failBox\(body, msg, hint\)/.test(ksh));
  check('app.js: deney → brifing kaydı; açık brifing deneyin motorundayken kare alır; brifingi olmayan deney (?brifing=1) açılmaz',
    /const briefs = \{\}, briefEntered = new Set\(\);/.test(app) && /if \(B && S\.MODE === EXPERIMENTS\[B\.id\]\.engine && !ascent\.active\) B\.frame\(dt\);/.test(app)
    && K('?brifing=1', false, 'lab', 'lagrange', false) === null && B.briefKind({ search: '?brifing=1', view: 'lab', exp: 'saptirma', briefed: ['ay', 'saptirma'] }) === 'new'
    && B.briefKind({ view: 'lab', exp: 'saptirma', entered: true, briefed: ['ay', 'saptirma'] }) === 'new' && B.briefKind({ view: 'lab', exp: 'saptirma', entered: true }) === null);
}

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
