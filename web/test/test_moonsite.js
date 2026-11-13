// Ay iniş yeri seçimi (moonsite.js): yer tasarım nesnesiyle (MOONSITE) her tüketiciye ulaşır mı?
//   1) varsayılan (Apollo 11) bugünkü sabitlerle bit düzeyinde aynı (hazır tasarımlar ve test_nominalby değişmez)
//   2) her yer için aydınlanma penceresi (findLandingWindow) bulunur
//   3) Apollo 15 (26,13° K, listedeki en yüksek enlem): tasarım, nominal uçuş ve dağılımlı uçuş (TLI hatası + seyrüsefer) seçilen yere iner:
//      temas noktası seçilen yere < 50 m, Apollo 11 yerine > 100 km (varsayılanı kullanan bir tüketici ikinci koşulda yakalanır)
// Ölçütler koşturmadan önce sabitlendi.
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { designMission, findLandingWindow, normalizeConfig, DEFAULT_CONFIG, PROFILES } from '../js/design.js';
import { Mission, twoStageDesign, siteIcrf, siteMe, R_SITE } from '../js/mission.js';
import { initConic } from '../js/conic.js';
import * as MS from '../js/moonsite.js';
const { siteOf, LUNAR_SITES, DEFAULT_SITE, validSite, ephSpanDays } = MS;

const TOL_SITE_M = 50, MIN_FROM_A11_KM = 100;
let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const ab = (f) => { const b = fs.readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab('../data/de440s.bsp'), PCK = ab('../data/moon_pa_de440_200625.bpc'), eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
EO.loadEarthOrientation(eo); await initConic();
const tOf = (ms) => { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; };
const startMs = Date.parse('2026-10-13T00:00:00Z'), tStart = tOf(startMs) - 86400;
makeLive(SPK, PCK, eo, tStart);

// 1) varsayılan bit düzeyinde aynı
{
  const a = siteOf(DEFAULT_SITE), t = tStart + 5 * 86400, x = a.icrf(t), y = siteIcrf(t);
  check(a.r === R_SITE && a.me.every((v, i) => v === siteMe()[i]) && x.every((v, i) => v === y[i]) && siteOf({}) === a && siteOf({ MOONSITE: 'XX' }) === a, 'varsayılan yer (Apollo 11) bugünkü siteMe/siteIcrf/R_SITE ile bit düzeyinde aynı; bilinmeyen kimlik varsayılana düşer');
  check(JSON.stringify(normalizeConfig(DEFAULT_CONFIG)) === JSON.stringify(normalizeConfig({ ...DEFAULT_CONFIG, moonSite: 'A11' })) && normalizeConfig({ ...DEFAULT_CONFIG, moonSite: 'A15' }).moonSite === 'A15', 'varsayılan yer yapılandırmaya yazılmaz (önbellek anahtarı değişmez); öteki yer yazılır');
  check(validSite('A15') === 'A15' && validSite('polar') === DEFAULT_SITE && Object.keys(LUNAR_SITES).every((k) => Math.abs(LUNAR_SITES[k].lat) <= 30), 'yalnız düşük enlemli yerler (|enlem| ≤ 30°)');
  // yarıçaplar ve koordinatlar arazi dosyasıyla (tools/ay_yerleri.py, küresel LOLA dokusu) kilitli; dosya Apollo 11 doğrulamasını taşır
  const dems = JSON.parse(fs.readFileSync(new URL('../data/site_dems.json', import.meta.url)));
  const bad = Object.keys(LUNAR_SITES).filter((k) => k !== DEFAULT_SITE && !(dems.sites[k] && Math.abs(LUNAR_SITES[k].r - (1737.4 + dems.sites[k].h_site)) < 5e-4));
  check(bad.length === 0 && dems.validation.corr >= 0.99 && dems.validation.a11_site_err_m < 150, `yerel yarıçap = 1737,4 + doku yüksekliği (h_site) her yerde; doku eşlemesi Apollo 11 ölçümüyle doğrulanmış (korelasyon ${dems.validation.corr}, ${dems.validation.a11_site_err_m} m)` + (bad.length ? ' — uyuşmayan: ' + bad : ''));
  const cover = Object.keys(dems.sites).every((k) => { const d = dems.sites[k], S = LUNAR_SITES[k], c = Math.cos(S.lat * Math.PI / 180), need = 85 / 1737.4 * 180 / Math.PI;
    return d.lat_top - S.lat > need && S.lat - (d.lat_top - (d.rows - 1) * d.step_deg) > need && S.lon - d.lon_left > need / c && d.lon_left + (d.cols - 1) * d.step_deg - S.lon > need / c; });
  check(cover, 'arazi yamaları 60 km yamanın köşelerini (85 km) enlem ve boylamda (cos enlem ile) kapsar');
}
// sözleşme: ana iş parçacığı modülleri yeri mission.js'in Apollo 11 sabitlerinden değil, görüntülenen yerden (moonsite.js VIEW) alır;
// iş parçacıkları Mission örneğinin yerini kullanır; worker hazır Apollo 11 tasarımını başka yerde kullanmaz
{
  const rd = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  const main = ['scene.js', 'camerarig.js', 'cinema.js', 'ui.js', 'flighttools.js', 'controlpanel.js', 'app.js', 'worker.js', 'design.js'];
  const leak = main.filter((f) => /import \{[^}]*\b(SITE_LAT|SITE_LON|R_SITE|siteIcrf|siteMe)\b[^}]*\} from '\.\/mission\.js'/.test(rd(f)));
  check(leak.length === 0, 'hiçbir modül iniş yerini mission.js\'in Apollo 11 sabitlerinden almaz' + (leak.length ? ': ' + leak : ''));
  const mis = rd('mission.js').split('\n').filter((l, i) => i > 150 && /\b(R_SITE|siteIcrf)\b/.test(l) && !/^\s*\/\//.test(l));
  check(mis.length === 0, 'Mission içindeki tüm kullanım this.site üzerinden' + (mis.length ? ': ' + mis[0].trim().slice(0, 80) : ''));
  check(/world\.setMoonSite\(setViewSite\(d\.design\)\)/.test(rd('app.js')) && /validSite\(d\.cfg\.moonSite\) !== DEFAULT_SITE/.test(rd('worker.js')) && /seq !== this\.terrainSeq/.test(rd('scene.js')) && /siteDir\.value\.set/.test(rd('scene.js')),
    'app.js görüntülenen yeri ve araziyi görev hazır olunca günceller; worker hazır tasarımı yalnız Apollo 11\'de kullanır; sahne eski arazi yüklemesini atar, deliği taşır');
  // tasarım başlatan her yol seçili iniş yerini taşır: ana tasarım ve pencere taramaları ui.getConfig() ile, profil karşılaştırması açıkça
  check(/moonSite: this\.ui\.getConfig\(\)\.moonSite/.test(rd('profilecompare.js')) && (rd('windowscan.js').match(/designMissionAsync\(/g) || []).length === 2 && (rd('windowscan.js').match(/this\.ui\.getConfig\(\)/g) || []).length >= 2 && /moonSite: \$\('#cfgMoonSite'\)\.value/.test(rd('ui.js')),
    'profil karşılaştırması, pencere taramaları ve ana tasarım seçili Ay iniş yerini kullanır');
}
// 2) aydınlanma penceresi her yerde
for (const id of Object.keys(LUNAR_SITES)) {
  let tl = null; try { tl = findLandingWindow(tStart + 4 * 86400, siteOf(id)); } catch (e) { tl = null; }
  check(tl != null && tl > tStart && tl < tStart + 45 * 86400, `${id}: aydınlanma penceresi bulunur (${tl ? E.utcString(tl).slice(0, 16) : 'yok'})`);
}
// 3) Apollo 15: tasarım → nominal ve dağılımlı uçuş
{
  const S15 = siteOf('A15'), S11 = siteOf(DEFAULT_SITE), t0 = performance.now();
  makeLive(SPK, PCK, eo, tStart);
  const design = JSON.parse(JSON.stringify(designMission(tOf(startMs), () => {}, { ...DEFAULT_CONFIG, moonSite: 'A15' })));
  check(design.MOONSITE === 'A15', `tasarım Ay iniş yerini taşır (MOONSITE = A15; ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  const fly = (o) => {
    makeLive(SPK, PCK, eo, tStart); E.setMoonZone(E.SOI_M);
    const M = new Mission({ design: twoStageDesign(design), landing: 'opt', ...o }); M.P.tLimit = Infinity;
    let inc = null;
    for (;;) {
      const r = M.gen.next(); if (r.done) break;
      if (inc == null && M.events.some((e) => e.key === 'LOI_END')) { const [rs, vs] = M.P.s.seleno(), R = E.moonIcrfToMe(M.P.s.t), h = E.mv(R, E.cross(rs, vs)); inc = Math.acos(h[2] / E.norm(h)) * 180 / Math.PI; }
    }
    const td = M.events.find((e) => e.key === 'INDI') || M.events.find((e) => e.key === 'CONTACT'), t = M.result ? M.result.t : M.P.s.t, [rs] = M.P.s.seleno();
    const d15 = E.norm(E.sub(rs, S15.icrf(M.P.s.t))) - 0, d11 = E.norm(E.sub(rs, S11.icrf(M.P.s.t)));
    // temas noktası: yüzeyde, yere göre yatay uzaklık (ayak yüksekliği farkı dahil olmaması için yön üzerinden)
    const horiz = (S) => { const u = E.unit(S.icrf(M.P.s.t)), rr = E.unit(rs); return Math.acos(Math.min(1, E.dot(u, rr))) * S.r * 1000; };
    return { ok: !!(M.result && M.result.ok), inc, h15: horiz(S15), d11, d15, t, td: !!td, site: M.site.id };
  };
  const n = fly({});
  console.log(`  nominal: LLO eğimi ${n.inc && n.inc.toFixed(2)}° (ekvatora ${n.inc && Math.min(n.inc, 180 - n.inc).toFixed(2)}°), iniş ${n.ok ? 'başarılı' : 'BAŞARISIZ'}, seçilen yere ${n.h15.toFixed(1)} m, Apollo 11 yerine ${n.d11.toFixed(0)} km`);
  check(n.site === 'A15' && Math.min(n.inc, 180 - n.inc) >= 26 && Math.min(n.inc, 180 - n.inc) < 40, `Mission yeri tasarımdan alır; LLO'nun Ay ekvatoruna eğimi (${Math.min(n.inc, 180 - n.inc).toFixed(1)}°; geri yönlü yörünge) iniş yerinin enleminden (26,1°) küçük değil`);
  check(n.ok && n.h15 < TOL_SITE_M && n.d11 > MIN_FROM_A11_KM, `nominal uçuş Apollo 15 yerine iner (< ${TOL_SITE_M} m), Apollo 11'den > ${MIN_FROM_A11_KM} km uzakta`);
  const dsp = fly({ tliDisp: { sigma: 1, seed: 1 }, nav: { seed: 7919 } });
  console.log(`  dağılımlı (tohum 1): iniş ${dsp.ok ? 'başarılı' : 'BAŞARISIZ'}, seçilen yere ${dsp.h15.toFixed(1)} m, Apollo 11 yerine ${dsp.d11.toFixed(0)} km`);
  check(dsp.ok && dsp.h15 < TOL_SITE_M && dsp.d11 > MIN_FROM_A11_KM, 'dağılımlı uçuş (TLI hatası + seyrüsefer) da seçilen yere iner');
}
// 4) bir aydınlanma penceresi yakınsamazsa sonraki pencere (yalnız Apollo 11 dışında): APOLLO11 profili × Apollo 16, 13 Ekim 2026'da yakınsamaz, bir ay sonra yakınsar
{
  const t0 = performance.now(), logs = [];
  makeLive(SPK, PCK, eo, tStart);
  let noRetry = '';
  try { designMission(tOf(startMs), () => {}, { ...PROFILES.APOLLO11.cfg, moonSite: 'A16' }); } catch (e) { noRetry = e.message; }
  check(/yakınsamadı/.test(noRetry), 'yeniden deneme istenmezse (taramalar, profil karşılaştırması) yakınsamayan pencere hata olarak kalır: "bu tarih" başka aya kaymaz');
  makeLive(SPK, PCK, eo, tStart);
  const D = JSON.parse(JSON.stringify(designMission(tOf(startMs), (m) => logs.push(m), { ...PROFILES.APOLLO11.cfg, moonSite: 'A16' }, { retry: true })));
  const later = D.LAUNCH.t_launch - tOf(startMs);
  console.log(`  APOLLO11 × A16: fırlatma ${E.utcString(D.LAUNCH.t_launch).slice(0, 16)} (${(later / 86400).toFixed(1)} gün sonra; ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  check(D.MOONSITE === 'A16' && later > 25 * 86400 && logs.some((m) => /sonraki pencere deneniyor/.test(m)), 'yakınsamayan pencerede sonraki aydınlanma penceresi denenir ve günlüğe yazılır; tasarım iniş yerini taşır');
  const n = (() => { makeLive(SPK, PCK, eo, tStart); E.setMoonZone(E.SOI_M); const M = new Mission({ design: twoStageDesign(D), landing: 'opt' }); M.P.tLimit = Infinity; for (;;) { if (M.gen.next().done) break; }
    const S = siteOf('A16'), [rs] = M.P.s.seleno(); return { ok: !!(M.result && M.result.ok), m: Math.acos(Math.min(1, E.dot(E.unit(S.icrf(M.P.s.t)), E.unit(rs)))) * S.r * 1000 }; })();
  check(n.ok && n.m < TOL_SITE_M, `bir ay sonraki tasarım da seçilen yere iner (${n.m.toFixed(1)} m)`);
  check(!('BLOCKED' in MS) && !('siteBlocked' in MS) && !/siteBlocked|syncSiteBlock/.test(fs.readFileSync(new URL('../js/design.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8')),
    'kapalı profil × yer kombinasyonu yok (L2 halo × Apollo 12/17 de sonraki pencerede yakınsar: docs/laboratuvar.md)');
  let def = ''; try { designMission(tOf(startMs), () => {}, { ...PROFILES.APOLLO.cfg }); } catch (e) { def = e.message; }
  const src = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  check(def === '' && /retry = opts\.retry && cfg\.moonSite && cfg\.moonSite !== DEFAULT_SITE \? 2 : 0/.test(src('design.js')), 'yeniden deneme yalnız istenince ve yalnız Apollo 11 dışında (hazır tasarımlar bit düzeyinde aynı)');
  check(/cfg, \{ retry: true \}\)/.test(src('app.js')) && !/retry/.test(src('windowscan.js')) && !/retry/.test(src('profilecompare.js')), 'yeniden denemeyi yalnız Tasarla açar; pencere/gün taramaları ve profil karşılaştırması açmaz');
  check(ephSpanDays({ moonSite: 'A16' }) === 200 && ephSpanDays({ MOONSITE: 'A16' }) === 200 && ephSpanDays({}) === 120 && ephSpanDays(null) === 120 && D.LAUNCH.t_launch + 40 * 86400 < tStart + 200 * 86400,
    'efemeris penceresi: Apollo 11 dışında 200 gün (iki yeniden deneme + görev sığar), varsayılanda 120 gün (eskisi gibi)');
}

console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
