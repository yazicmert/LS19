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
const K = (search, visited = false, view = 'lab', exp = 'ay') => B.briefKind({ search, visited, view, exp });
check('kim görür: ilk ziyaret "new", geri dönen "return"; Canlı Gökyüzü ve öteki deneyler görmez',
  K('') === 'new' && K('?lang=tr', true) === 'return' && K('', false, 'sky', null) === null && K('', false, 'lab', 'saptirma') === null);
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
const app = read('js/app.js'), br = read('js/brifing.js'), css = read('css/brifing.css'), html = read('index.html');
check('stil ve modüller sayfada; panelde "LS19 ile adım adım tasarla" düğmesi', /href="css\/brifing\.css"/.test(html) && /id="btnBrief"/.test(html) && /modulepreload" href="js\/brifing\.js"/.test(html));
check('brifing açıkken araç, uçuş göstergeleri, deney paneli, görev çubuğu ve yüzey uyarıları gizli; üst çubuk kalır',
  /body\.briefing #hud, body\.briefing #controls, body\.briefing #manual, body\.briefing #labPanel/.test(css) && !/body\.briefing #modebar/.test(css)
  && /W\.vehicle\.visible = false/.test(br) && /W\[k\]\.visible = !!c\.orbit && k === 'embMoon'/.test(br));
check('ilk görev hazır olunca açılır (yükleme örtüsü kalkmadan: araç görünmez); başka alana geçince kapanır; Esc bir adım geri, öteki kısayollar kapalı',
  /const bk = briefKind\(\{ search: location\.search, visited: Briefing\.seen\(\), view: S\.VIEW, exp: labui\.page \}\); if \(bk && brief\) brief\.open\(bk\);/.test(app)
  && /brief\.close\('away'\)/.test(app) && /if \(brief && brief\.active && k !== 'escape'\) return;/.test(app) && /e\.key !== 'Escape'/.test(br) && /window\.addEventListener\('keydown', this\.onKey, true\)/.test(br));
check('tasarım yalnız sonda bir kez: seçimler yapılandırmaya yazılır (araç ve roket yeniden tasarım tetiklemeden), startDesign çağrılır; hazır olunca özet, hata brifingde',
  /applyRocket\(sel\.rocket\)/.test(app) && /ui\.setConfig\(\{ \.\.\.PROFILES\[sel\.profile\]\.cfg, moonSite: sel\.site \}\)/.test(app) && /await startDesign\(sel\.date\);/.test(app)
  && /if \(brief\) brief\.onReady\(S\.DESIGN\);/.test(app) && /brief\.onFail\(m\)/.test(app) && /function applyRocket\(id\)/.test(app));
check('başlatma: rampadan (kalkış, sonra görev kendiliğinden sürer), yörüngeden ya da fragman', /if \(how === 'pad'\) \{ ascentThenPlay = true; \$\('#btnAscent'\)\.click\(\); \}/.test(app)
  && /if \(ascentThenPlay\) \{ ascentThenPlay = false; setTimeout\(\(\) => setPlay\(true\), 300\); \}/.test(app) && /data-go="pad"/.test(br) && /data-go="orbit"/.test(br) && /data-go="cine"/.test(br));
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

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
