// Kalkış canlandırması (Node): cd web && node test/test_ascent.js
// ascent.js'in kinematik yolu gerçek bir tasarımın yörüngeye giriş durumuyla: rampada başlar (WGS-84 yüzeyi, Dünya ile döner), girişte konum ve hızla birleşir,
// irtifa tekdüze artar ve tipik çıkışa yakındır; kademe ayrılmaları gerçek zamanlardan ölçeklenir; arayüz sözleşmesi.
import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import { Mission } from '../js/mission.js';
import { buildAscent, scaleEvents } from '../js/ascent.js';
import { solveAscent, sampleAt, atmosphere } from '../js/ascentsim.js';
import { ROCKETS, ROCKET_IDS } from '../js/rockets.js';
import { LEGACY_SITE } from '../js/pads.js';
import { sceneSrc } from './scenesrc.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const DEF = JSON.parse(read('data/design_default.json')), D = DEF.design;
makeLive(ab(new URL('../data/de440s.bsp', import.meta.url)), ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)), JSON.parse(read('data/earth_orient.json')), DEF.tStart);
const M = new Mission({ design: D }), ins = { t: M.P.s.t, r: M.P.s.r.slice(), v: M.P.s.v.slice() };
const site = { lat: D.LAUNCH.lat ?? LEGACY_SITE.lat, lon: D.LAUNCH.lon ?? LEGACY_SITE.lon };
const P = buildAscent({ site, tLaunch: D.LAUNCH.t_launch, ins, icrfToItrf: E.earthIcrfToItrf, rE: E.R_E });
const norm = (a) => Math.hypot(...a), sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// jeodezik irtifa (WGS-84) — telemetrinin kullandığı
const geodH = (rIcrf, t) => {
  const M3 = E.earthIcrfToItrf(t), x = [0, 1, 2].map((i) => M3[i][0] * rIcrf[0] + M3[i][1] * rIcrf[1] + M3[i][2] * rIcrf[2]);
  const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f), p = Math.hypot(x[0], x[1]); let la = Math.atan2(x[2], p * (1 - e2)), h = 0;
  for (let k = 0; k < 8; k++) { const N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2); h = p / Math.cos(la) - N; la = Math.atan2(x[2], p * (1 - e2 * N / (N + h))); }
  return h;
};
check(Math.abs(P.T - (ins.t - D.LAUNCH.t_launch)) < 1e-6 && P.T > 500 && P.T < 700, `canlandırma süresi = giriş − fırlatma = ${P.T.toFixed(0)} s (tasarımın çıkış süresi)`);
const s0 = P.at(D.LAUNCH.t_launch - 10), s00 = P.at(D.LAUNCH.t_launch);
check(Math.abs(geodH(s0.r, D.LAUNCH.t_launch - 10)) < 0.01 && Math.abs(geodH(s00.r, D.LAUNCH.t_launch)) < 0.01, `rampada jeodezik irtifa ${(geodH(s0.r, D.LAUNCH.t_launch - 10) * 1000).toFixed(1)} m (WGS-84 yüzeyi)`);
const vRot = norm(s0.v);
check(Math.abs(vRot - 0.4651 * Math.cos(28.627 * Math.PI / 180)) < 0.003, `rampa Dünya ile döner: eylemsiz hız ${(vRot * 1000).toFixed(0)} m/s (ω·R·cos φ)`);
const s1 = P.at(ins.t - 1e-3);
check(norm(sub(s1.r, ins.r)) < 0.05, `girişte konum birleşir (fark ${(norm(sub(s1.r, ins.r)) * 1000).toFixed(1)} m)`);
const vr = dot(s1.v, ins.r) / norm(ins.r), dv = norm(sub(s1.v, ins.v));
check(Math.abs(vr) < 0.02 && Math.abs(norm(s1.v) - norm(ins.v)) / norm(ins.v) < 0.01 && dv < 0.15, `girişte hız: dikey ${(vr * 1000).toFixed(1)} m/s, büyüklük farkı %${(Math.abs(norm(s1.v) - norm(ins.v)) / norm(ins.v) * 100).toFixed(2)}, vektör farkı ${(dv * 1000).toFixed(0)} m/s`);
let mono = true, prev = -1; for (let k = 0; k <= 200; k++) { const h = P.at(D.LAUNCH.t_launch + P.T * k / 200).h; if (h < prev - 1e-9) mono = false; prev = h; }
const hMeco = P.at(D.LAUNCH.t_launch + 0.3 * P.T).h, h10 = P.at(D.LAUNCH.t_launch + 0.1 * P.T).h;
check(mono && hMeco > 40 && hMeco < 100 && h10 < 30, `irtifa tekdüze artar; τ=0,1'de ${h10.toFixed(0)} km, birinci kademe ayrılmasında (τ≈0,3) ${hMeco.toFixed(0)} km (tipik ~70 km)`);
const up = P.at(D.LAUNCH.t_launch + 2);
check(dot(up.dir, up.up) > 0.98, 'kalkışta itki yönü yerel düşeye yakın (dikey yükseliş)');
for (const id of ROCKET_IDS) {
  const A = ROCKETS[id].ascent, ev = scaleEvents(A.events, A.tIns, P.T);
  check(A && A.lv && A.tIns > 400 && ev.every((e, i) => e.tScaled > 0 && e.tScaled <= P.T + 1e-9 && (!i || e.t >= A.events[i - 1].t) && (e.cut != null || e.part)) && (A.approx || A.src),
    `${id}: kalkış modeli "${A.lv}", ${A.events.length} olay (gerçek giriş T+${Math.floor(A.tIns / 60)}:${String(A.tIns % 60).padStart(2, '0')} → ${P.T.toFixed(0)} s'ye ölçekli)${A.approx ? ', yaklaşık' : ''}`);
}
// ---------------------------------------------------------------- fiziksel çıkış (ascentsim.js)
console.log('fiziksel çıkış');
const atm0 = atmosphere(0), atm11 = atmosphere(11), atm50 = atmosphere(50);
check(Math.abs(atm0.p - 101325) < 1 && Math.abs(atm0.rho - 1.225) < 0.002 && Math.abs(atm11.p - 22700) < 300 && Math.abs(atm50.p - 79.8) < 2, `U.S. Standard Atmosphere 1976: 0 km ${atm0.rho.toFixed(3)} kg/m³, 11 km ${atm11.p.toFixed(0)} Pa, 50 km ${atm50.p.toFixed(1)} Pa`);
// Apollo 11 (NASA SP-4029 Apollo 11 Ascent Phase): S-IC kesme T+161,63 s 35,7 nmi (66,1 km), Dünya'ya göre 7.852 ft/s (2,393 km/s);
// S-II kesme T+548,22 s 101,1 nmi (187,2 km), 21.368 ft/s (6,513 km/s); giriş T+709,33 s
const SV = ROCKETS.SATURN_V.ascent, Ssv = solveAscent(SV.veh, { r0: 6373.2, r1: 6378.137 + 185, v1: 7.793, inc: 28.7, tEnd: SV.tIns });
const a1 = sampleAt(Ssv.samples, 161.6), a2 = sampleAt(Ssv.samples, 548.2);
check(Ssv.ok && Math.abs(a1.h - 66.1) / 66.1 < 0.1 && Math.abs(a1.vrel - 2.393) / 2.393 < 0.08, `Saturn V S-IC kesme: ${a1.h.toFixed(1)} km, ${a1.vrel.toFixed(3)} km/s (Apollo 11: 66,1 km, 2,393 km/s)`);
check(Math.abs(a2.h - 187.2) / 187.2 < 0.1 && Math.abs(a2.vrel - 6.513) / 6.513 < 0.03, `Saturn V S-II kesme: ${a2.h.toFixed(1)} km, ${a2.vrel.toFixed(3)} km/s (Apollo 11: 187,2 km, 6,513 km/s)`);
for (const id of ROCKET_IDS) {
  const A = ROCKETS[id].ascent, S = solveAscent(A.veh, { r0: 6373.2, r1: 6378.137 + 185, v1: 7.793, inc: 28.7, tEnd: A.tIns }), mq = S.maxQ;
  check(S.ok && mq.t > 40 && mq.t < 100 && mq.h > 8 && mq.h < 16 && mq.q > 20e3 && mq.q < 80e3, `${id}: güdüm hedefe varır (giriş ${A.tIns} s), max-Q T+${mq.t.toFixed(0)} s, ${mq.h.toFixed(1)} km, ${(mq.q / 1000).toFixed(0)} kPa (tipik 10–15 km)`);
}
const PP = buildAscent({ site, tLaunch: D.LAUNCH.t_launch, ins, icrfToItrf: E.earthIcrfToItrf, rE: E.R_E, veh: SV.veh, tInsReal: SV.tIns, inc: D.inc });
const e1 = PP.at(ins.t - 1e-3), e0 = PP.at(D.LAUNCH.t_launch + 0.3);
check(PP.physical && norm(sub(e1.r, ins.r)) < 0.05 && norm(sub(e1.v, ins.v)) < 0.005 && Math.abs(geodH(e0.r, D.LAUNCH.t_launch + 0.3)) < 0.05, `fiziksel yol görevin giriş durumuna oturur: konum farkı ${(norm(sub(e1.r, ins.r)) * 1000).toFixed(1)} m, hız farkı ${(norm(sub(e1.v, ins.v)) * 1000).toFixed(2)} m/s`);
check(dot(PP.at(D.LAUNCH.t_launch + 5).dir, PP.at(D.LAUNCH.t_launch + 5).up) > 0.999, 'fiziksel yol: dikey yükselişle başlar');
const html = read('index.html'), app = read('js/app.js'), scene = sceneSrc(), rm = read('js/rocketmodels.js');
check(/id="btnAscent"/.test(html) && /id="ascBar"/.test(html) && /data-asc="end"/.test(html), 'Uçuş adımında "Kalkışı izle"; oynatma çubuğu (hız, yörüngeye atla)');
check(/ascent\.tick\(dt\)/.test(app) && /cmd: 'seek', t: ui\.t0/.test(app) && /insState/.test(app), 'oynatma ana iş parçacığında; bitince görev girişten sürer');
check(/setAscent\(/.test(scene) && /clippingPlanes/.test(scene) && /localClippingEnabled/.test(scene), 'sahne: tam roket, kademe ayrılması kesme düzlemiyle');
check(['booster', 'fairing', 'las'].every((k) => new RegExp(`part = '${k}'`).test(rm)) && /key === 'generic'/.test(rm.slice(rm.indexOf('export function makeLaunchVehicle'))), 'ayrılabilir parçalar etiketli (iticiler, kaporta, LAS); genel roketin de modeli var');
const ap = read('js/ascentplay.js');
check(/loadPadGround/.test(scene) && /s2cloudless_3857/.test(scene) && /CC BY-SA 4\.0/.test(scene) && /models\/rockets\/ml\.glb/.test(scene) && fs.existsSync(new URL('../models/rockets/ml.glb', import.meta.url)),
  'rampa: NASA Mobile Launcher (SLS), çevresi Sentinel-2 cloudless 2016 (atıflı, CC BY-SA 4.0); yüklenemezse gösterilmez');
check(/PLUME_COL/.test(scene) && /pAmb/.test(scene) && /diamonds\.value = 0\.32 \* pr/.test(scene) && ['saturnv', 'sls', 'vulcan'].every((lv) => Object.values(ROCKETS).some((r) => r.ascent.lv === lv && r.ascent.props.length === r.ascent.veh.stages.length)),
  'alev: ortam basıncıyla genişler, şok elmasları alçakta; renk o anki kademenin yakıtına göre (her kademenin yakıtı tanımlı)');
check(/A\.sky/.test(scene) && /Math\.sqrt\(2 \* 6378/.test(scene) && /skyFade/.test(scene) && /logdepthbuf_vertex/.test(scene) && !/depthTest: false/.test(scene.slice(scene.indexOf('async skyMaterial'), scene.indexOf('async loadPadGround'))),
  'gökyüzü: Preetham (three Sky), Güneş konumuna göre renk, irtifayla sönüm; ufkun ötesinde derinlik testli kubbe (log derinlik)');
check(/propagate\(d, dt\)/.test(ap) && /atmosphere\(alt\)\.rho/.test(ap) && /debris\.push/.test(ap) && /applyAscent/.test(scene), 'ayrılan kademeler: ayrılma anındaki durumdan balistik (çekim + sürüklenme), takla atarak düşer');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
