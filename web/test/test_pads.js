// Fırlatma rampaları (Node): cd web && node test/test_pads.js
// (1) data/pads.json: LL2'den derlenen yörüngesel rampalar; (2) kalkış fiziği: Dünya dönüşünün katkısı, eğim sınırları, menzil azimutları;
// (3) tasarım: başka rampalardan (Baykonur, Kourou, Vandenberg) Ay görevi; gerçek roket yalnız kendi rampasından; (4) arayüz sözleşmesi.
import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import * as P from '../js/pads.js';
import { designMission, normalizeConfig, PROFILES } from '../js/design.js';
import { Mission, twoStageDesign } from '../js/mission.js';
import { parkPropellant } from '../js/rockets.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const J = JSON.parse(read('data/pads.json')), idx = P.padIndex(J), pad = (id) => idx.get(id);

console.log('rampa verisi');
check(J.pads.length > 150 && J.pads.every((p) => p.n > 0 && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.name && p.loc) && /Launch Library 2/.test(J.kaynak), `${J.pads.length} yörüngesel rampa (LL2), koordinat ve deneme sayısı geçerli`);
check(new Set(J.pads.map((p) => p.id)).size === J.pads.length, 'kimlikler tekil (LL2 sayfalaması ordering=id ile)');
const near = (id, lat, lon, tol = 0.05) => { const p = pad(id); return p && Math.abs(p.lat - lat) < tol && Math.abs(p.lon - lon) < tol; };
check(near(87, 28.608, -80.604) && near(4, 28.627, -80.621) && near(80, 28.562, -80.577) && near(29, 28.583, -80.583) && near(16, 34.632, -120.611), 'roketlerin rampaları: LC-39A, LC-39B, SLC-40, SLC-41, SLC-4E (bilinen koordinatlar)');
check(Object.values(P.ROCKET_PADS).flat().every((id) => idx.has(id)), 'roket ↔ rampa eşlemesindeki her kimlik listede');
check(['Baikonur', 'Guiana', 'Wenchang', 'Vandenberg', 'Plesetsk', 'Tanegashima', 'Satish Dhawan'].every((k) => J.pads.some((p) => p.loc.includes(k))), 'dünyadaki başlıca uzay üsleri listede');

console.log('kalkış fiziği');
check(Math.abs(P.V_EQ - 0.46510) < 1e-4, `ekvator dönüş hızı ω·R = ${(P.V_EQ * 1000).toFixed(1)} m/s`);
check(Math.abs(P.rotationBoost(28.5) * 1000 - 408.7) < 0.5 && Math.abs(P.rotationBoost(51.6) * 1000 - 288.9) < 0.5, 'dönüş katkısı V_EQ·cos i: 28,5° → 408,7 m/s, 51,6° (ISS) → 288,9 m/s');
// cos i = cos φ sin A → rampanın eylemsiz hızının yörünge yönündeki bileşeni ω R cos φ sin A = ω R cos i (enlemden bağımsız)
for (const [lat, inc] of [[28.6, 35], [5.24, 10], [45.9, 51.6]]) {
  const A = P.launchAzimuth(lat, inc) * Math.PI / 180, proj = P.V_EQ * Math.cos(lat * Math.PI / 180) * Math.sin(A);
  check(Math.abs(proj - P.rotationBoost(inc)) < 1e-12, `φ=${lat}°, i=${inc}°: azimut ${(A * 180 / Math.PI).toFixed(2)}°, izdüşüm = V_EQ·cos i`);
}
check(Number.isNaN(P.launchAzimuth(45.9, 40)) && P.minIncl(45.92) === 46 && P.minIncl(-5.24) === 5.3, 'eğim enlemden küçük olamaz (doğrudan fırlatma): Baykonur ≥ 46,0°, Kourou ≥ 5,3°');
check(Math.abs(P.incPenalty(51.6) * 1000 - 119.8) < 0.5 && P.incPenalty(5.3) < 0, `eğim cezası: 51,6° → +${(P.incPenalty(51.6) * 1000).toFixed(1)} m/s, 5,3° → ${(P.incPenalty(5.3) * 1000).toFixed(1)} m/s (kazanç)`);
const ccsfs = P.inclRange(28.56, [35, 120]), vsfb = P.inclRange(34.63, [140, 260]), kou = P.inclRange(5.24, [-10.5, 93.5]);
check(ccsfs[0] === 28.6 && Math.abs(ccsfs[1] - 59.6) < 0.3 && vsfb[0] > 55 && vsfb[1] >= 89.5 && kou[0] === 5.3 && kou[1] >= 89.5, `menzil azimutlarından eğim aralığı: Florida ${ccsfs}, Vandenberg ${vsfb}, Kourou ${kou}`);
check(P.azInRange(-5, [-10.5, 93.5]) && P.azInRange(355, [-10.5, 93.5]) && !P.azInRange(120, [-10.5, 93.5]) && P.azInRange(150, [140, 260]) && !P.azInRange(90, [140, 260]), 'azimut aralığı 360°\'yi sarabilir (Kourou −10,5°)');
check(P.siteOf(pad(16)).az.join() === '140,260' && P.siteOf(pad(80)).az.join() === '35,120' && !P.siteOf(pad(32)).az, 'menzil sınırı yalnız kaynağı olan üslerde (Baykonur: yok)');
const M0 = parkPropellant('F9', 3600, 0), M1 = parkPropellant('F9', 3600, P.incPenalty(40));
check(M1 < M0 && Math.abs((M0 + 4000 + 3600) * Math.exp(-P.incPenalty(40) * 1000 / (348 * 9.80665)) - 4000 - 3600 - M1) < 1, `park yakıtı eğimle azalır: Falcon 9, 40° → ${(M0 - M1).toFixed(0)} kg daha az (exp(−Δv/c))`);

console.log('tasarım');
check(!('site' in normalizeConfig({})) && normalizeConfig({ site: P.siteOf(pad(32)) }).earth.inc === 46 && normalizeConfig({ site: P.siteOf(pad(16)) }).earth.inc >= vsfb[0], 'yapılandırma: varsayılan rampa yazılmaz; park eğimi rampanın sınırına çekilir');
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(read('data/earth_orient.json'));
const spkB = ab(new URL('../data/de440s.bsp', import.meta.url)), pckB = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const ms = Date.parse('2026-10-13T00:00:00Z'), tStart = (ms / 86400000 + 2440587.5 + 69.18 / 86400 - E.jdTdb(0)) * 86400;
const design = (cfg) => { E.setProvider(null); makeLive(spkB, pckB, eo, tStart); return designMission(E.tFromUtcMs(ms), () => {}, { ...PROFILES.APOLLO.cfg, ...cfg }); };
for (const [id, label] of [[32, 'Baykonur 1/5'], [67, 'Kourou ELA-4'], [16, 'Vandenberg SLC-4E']]) {
  const st = P.siteOf(pad(id)), D = design({ site: st }), L = D.LAUNCH;
  const azOk = !st.az || P.azInRange(L.az, st.az), A = P.launchAzimuth(st.lat, D.inc);
  const M = new Mission({ design: twoStageDesign(D) }); M.P.tLimit = Infinity; for (;;) { if (M.gen.next().done) break; }
  check(D.inc >= P.minIncl(st.lat) && azOk && (Math.abs(L.az - A) < 1.5 || Math.abs(L.az - (180 - A)) < 1.5) && L.siteId === id && M.result && M.result.ok,
    `${label}: park eğimi ${D.inc}°, azimut ${L.az.toFixed(1)}° (cos i = cos φ sin A ile ${A.toFixed(1)}°${st.az ? ', menzil içinde' : ''}); Ay'a güvenli iniş`);
}
let err = null; try { design({ rocket: 'F9', site: P.siteOf(pad(32)) }); } catch (e) { err = e.message; }
check(err && /Falcon 9 Block 5 .*rampasından fırlatılmıyor/.test(err), 'gerçek roket yalnız kendi rampalarından (Falcon 9 Baykonur\'dan: anlaşılır hata)');
const Df = design({ rocket: 'F9', site: P.siteOf(pad(80)) });
check(Df.LAUNCH.siteId === 80 && Df.ASCENT && Df.TLI_NEED > 0 && Df.STAGES[0].prop - Df.TLI_NEED > 0 && Df.LANDER_NEED > 0, `Falcon 9 SLC-40: kalkış cezası ${Df.ASCENT.dvPen.toFixed(1)} m/s, TLI payı ${Df.STAGES[0].prop - Df.TLI_NEED} kg`);

console.log('arayüz');
const html = read('index.html'), app = read('js/app.js'), lui = read('js/launchui.js');
check(/id="padSel"/.test(html) && /id="padInfo"/.test(html) && /id="wxBox"/.test(html) && /id="btnScan"/.test(html) && /id="wintable"/.test(html), '1. adım: rampa seçimi, rampa bilgisi, hava kutusu, pencere tarayıcı');
check(/launch\.padFor\(id\)/.test(app) && /E\.setProvider\(prov0\)/.test(app) && /scanCancel/.test(app), 'roket değişince uygun rampaya geçilir; tarama efemeris kaynağını geri yükler ve iptal edilebilir');
check(/padAllowed\(rk, id\)/.test(lui) && /optgroup/.test(lui), 'rampa listesi ülkelere göre gruplu; seçili roketin uçmadığı rampalar devre dışı');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
