// Temas ve yüzey evresi (Node 20+): cd web && node test/test_touchdown.js
//  1) Hız zarfı (NASA TN D-6850, "10-7-4"): köşe noktaları ve doğrusal kenar
//  2) Enerjiye dayalı devrilme: bağımsız kapalı çözümle kritik yatay hız, eğim ve yatıklığın etkisi, ayak yönü/kenar kolu
//  3) Tam görev (Apollo, iki kademe, dengeli güdüm): temas ışığı → motor kesme (1,0 s) → serbest düşüş → temas sırası; temas yönelimi fizikten (dikeye ışınlanmaz);
//     yüzey evresi: saat işler, araç dönen Ay'a bağlı kalır, dört ayağına oturur, olay çizelgesi Apollo 11 zamanlarıyla günlüğe düşer
//  4) Eğim: 8° zeminde araç 8° eğik durur; 14° zemin (> 12°) başarısız sayılır
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { Mission, twoStageDesign, R_SITE } from '../js/mission.js';
import { qRot, Z_AXIS } from '../js/attitude.js';
import { TOUCH, POST_LANDING, velEnvelope, tipOver } from '../js/touchdown.js';
import { initConic } from '../js/conic.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const D2R = Math.PI / 180, FT = 0.3048;

// ---------------------------------------------------------------- 1) hız zarfı
{
  const e = (vz, vh) => velEnvelope(vz, vh).ok;
  check('hız zarfı: dikey 10 ft/s (yatay 0), yatay 4 ft/s\'de dikey 7 ft/s, arası doğrusal; yatay > 4 ft/s her zaman dışarıda',
    e(-3.04, 0) && !e(-3.06, 0) && e(-2.13, 1.219) && !e(-2.15, 1.219) && !e(-0.1, 1.23) && Math.abs(velEnvelope(0, 2 * FT).vzMax - 8.5 * FT) < 1e-12 && TOUCH.VZ0 === 10 * FT && TOUCH.VH === 4 * FT,
    `vzMax(0) ${TOUCH.VZ0.toFixed(3)}, vzMax(2 ft/s) ${velEnvelope(0, 2 * FT).vzMax.toFixed(3)} m/s`);
}

// ---------------------------------------------------------------- 2) devrilme (bağımsız kapalı çözüm)
{
  const m = 2000, It = 3000, h = 1.8, g = 1.62, R = TOUCH.R_PAD;
  // ayaklar gövde ±x, ±y'de; hız iki ayak arasındaki kenara dik (45°): kol R/√2, en kötü yön budur
  const a = R / Math.SQRT2, L = Math.hypot(a, h), beta = Math.atan2(a, h), Ip = It + m * L * L;
  const vCrit = Math.sqrt(2 * Ip * m * g * L * (1 - Math.cos(beta))) / (m * h);
  const d45 = [Math.SQRT1_2, Math.SQRT1_2, 0], base = { axis: [0, 0, 1], xb: [1, 0, 0], w: [0, 0, 0], m, It, h, g };
  const lo = tipOver({ ...base, v: d45.map((x) => x * vCrit * 0.99) }), hi = tipOver({ ...base, v: d45.map((x) => x * vCrit * 1.01) });
  check('devrilme: kenara dik yatay hızda kritik hız = √(2·I_P·m·g·L·(1−cos β))/(m·h) (±%1), en kötü yön 45°',
    lo.stable && !hi.stable && Math.abs(lo.dirDeg - 45) < 1e-9 && Math.abs(lo.lever - a) < 1e-12, `v_kritik ${vCrit.toFixed(3)} m/s, β ${(beta / D2R).toFixed(1)}°, pay ${lo.margin.toFixed(3)} / ${hi.margin.toFixed(3)}`);
  // aynı hız ayak yönünde (0°): kol R, daha kararlı
  const p0 = tipOver({ ...base, v: [vCrit * 1.01, 0, 0] });
  check('devrilme: ayak yönünde kol R (kenardan büyük) — aynı hız kararlı', p0.stable, `pay ${p0.margin.toFixed(2)}`);
  // açısal hız eşdeğeri: I_t·ω = m·h·v
  const w = (m * h * vCrit * 1.01) / It, r = tipOver({ ...base, v: [0, 0, 0], w: [-d45[1] * w, d45[0] * w, 0] });
  check('devrilme: devrilme yönündeki açısal hız aynı açısal momentumla aynı sonucu verir', !r.stable && Math.abs(r.margin - hi.margin) < 1e-9, `pay ${r.margin.toFixed(4)}`);
  // eğim ve yatıklık: β'yı aşan yokuş aşağı eğim + yatıklık hızsız da devirir; 12° eğim kritik hızı düşürür
  const tilt = (beta / D2R - 10) * D2R, ax = [Math.sin(tilt) * d45[0], Math.sin(tilt) * d45[1], Math.cos(tilt)];
  const st = tipOver({ ...base, v: [0, 0, 0], axis: ax, slope: { deg: 11, az: 45 } }), sl = tipOver({ ...base, v: d45.map((x) => x * vCrit * 0.8), slope: { deg: 12, az: 45 } });
  check('devrilme: β − 10° yatıklık + 11° yokuş aşağı hızsız devirir; 12° eğimde kritik hızın %80\'i devirir', !st.stable && st.phiDeg < 0 && !sl.stable && tipOver({ ...base, v: d45.map((x) => x * vCrit * 0.8) }).stable,
    `φ ${st.phiDeg.toFixed(2)}°, 12° eğimde pay ${sl.margin.toFixed(2)}`);
}

// ---------------------------------------------------------------- 3) tam görev
await initConic();
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
const fly = (landing, slope = null, o = {}) => {
  const D = twoStageDesign(ALL.profiles.APOLLO.design);
  E.setMoonZone(E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing, ...o }); M.P.tLimit = Infinity; M.attachHistory(); M.siteSlope = slope;
  for (;;) { if (M.gen.next().done) break; }
  return M;
};
{
  const M = fly('opt'), R = M.result, ev = (k) => M.events.find((e) => e.key === k);
  const cl = ev('CONTACT'), es = ev('ENGINE_STOP'), td = ev('INDI'), keys = M.events.map((e) => e.key);
  const iC = keys.indexOf('CONTACT'), iS = keys.indexOf('ENGINE_STOP'), iT = keys.indexOf('INDI');
  check('sıra: temas ışığı → motor kesme (TOUCH.REACT = 1,0 s sonra) → temas (ayaklar)', cl && es && td && iC < iS && iS < iT && Math.abs(es.t - cl.t - TOUCH.REACT) < 0.03 && td.t > es.t && R.tContact === cl.t && R.tStop === es.t,
    cl && es && td ? `temas ışığı T−${(td.t - cl.t).toFixed(2)} s, motor kesme T−${(td.t - es.t).toFixed(2)} s` : keys.slice(-6).join());
  check('temas: hız zarfında, devrilmez, yönelim fizikten (dikeye ışınlanmadı: 0,1–6°), açısal hız ≤ 6°/s, iniş "ok"',
    R.ok && R.grade === 'ok' && R.env.vel && R.tip.stable && R.tilt_deg > 0.1 && R.tilt_deg < TOUCH.TILT && R.rate_dps <= TOUCH.RATE && Math.abs(R.v_mps[2]) > 1.0 && Math.abs(R.v_mps[2]) < 2.2,
    `dikey ${R.v_mps[2].toFixed(2)}, yatay ${Math.hypot(R.v_mps[0], R.v_mps[1]).toFixed(3)} m/s, eğim ${R.tilt_deg.toFixed(2)}°, ω ${R.rate_dps.toFixed(2)}°/s, devrilme payı ${R.tip.margin.toFixed(0)}`);
  const altTD = (E.norm(M.P.s.seleno()[0]) - R_SITE) * 1000, q0 = M.P.att.q.slice(), tilt0 = qRot(q0, Z_AXIS);
  check('temas anında en alçak ayak yüzeyde (merkez R_PAD·sinθ yukarıda, ±3 cm), temas yönelimi korunur', Math.abs(altTD - TOUCH.R_PAD * Math.sin(R.tilt_deg * D2R)) < 0.03 && Math.abs(Math.acos(E.dot(E.unit(tilt0), E.unit(M.P.s.seleno()[0]))) / D2R - R.tilt_deg) < 0.05, `merkez irtifası ${altTD.toFixed(3)} m`);
  // yüzey evresi: 600 s ilerle
  // ilk yüzey adımında araç yüzeye bağlanır (temas anındaki kayıt çarpma hızıyla)
  const t0 = M.P.s.t, meOf = () => E.mv(E.moonIcrfToMe(M.P.s.t), M.P.s.seleno()[0]), adv0 = M.advance(t0 + 1, 1e9), me0 = meOf(), adv = M.advance(t0 + 600, 1e9);
  const me1 = meOf(), drift = E.norm(E.sub(me1, me0)) * 1e6, up = E.unit(M.P.s.seleno()[0]), rest = Math.acos(Math.min(1, E.dot(qRot(M.P.att.q, Z_AXIS), up))) / D2R;
  const vRel = E.norm(E.sub(M.P.s.seleno()[1], E.cross(E.omegaMoon(M.P.s.t), M.P.s.seleno()[0]))) * 1e6;
  check('yüzey evresi: görev bitti (done) ama saat işler (advance → +600 s), araç Ay\'a bağlı (ME konumu sabit, yüzeye göre hız 0), dört ayağına oturdu (dik), geçmiş kaydı sürer',
    M.done && adv0 === "DONE" && adv === "DONE" && Math.abs(M.P.s.t - t0 - 600) < 1e-6 && drift < 1 && vRel < 1 && rest < 0.01 && M.hist[M.hist.length - 1].t === M.P.s.t && M.P.phase === 'INDI',
    `ME kayması ${drift.toFixed(3)} mm, yüzeye göre hız ${vRel.toFixed(3)} mm/s, duruş eğimi ${rest.toFixed(4)}°, son kayıt T+${(M.hist[M.hist.length - 1].t - t0).toFixed(0)} s`);
  const post = POST_LANDING.map((p) => [p, ev(p.key)]);
  check('temas sonrası olaylar Apollo 11 zamanlarıyla (temas ışığından +7, +18, +45, +89 s): motor emniyeti, duruş raporu, tank tahliyesi, kalış kararı',
    post.every(([p, e]) => e && Math.abs(e.t - cl.t - p.dt) < 1e-6) && /0\.0° eğik/.test(ev('TILT').msg) && ev('TOUCH_ENV'),
    post.map(([p, e]) => `${p.key} +${e ? (e.t - cl.t).toFixed(1) : '?'} s`).join(', '));
  // geçmişten ekran durumu: temas sonrası ara değer Ay'a bağlı noktada
  const x = M.stateAt(t0 + 300.5), rsX = E.sub(x.r, E.moonPos(x.t)), dX = E.norm(E.sub(E.mv(E.moonIcrfToMe(x.t), rsX), me0)) * 1e6;
  check('ekran ara değeri (Hermite) yüzeyde de Ay\'a bağlı noktada (< 1 cm)', dX < 10, `${dX.toFixed(2)} mm`);
}

// ---------------------------------------------------------------- 4) eğim
{
  const A = fly('zem', { deg: 8, az: 30 });
  A.surfaceAdvance(A.P.s.t + 30);
  const up = E.unit(A.P.s.seleno()[0]), rest = Math.acos(Math.min(1, E.dot(qRot(A.P.att.q, Z_AXIS), up))) / D2R;
  const B = fly('zem', { deg: 14, az: 30 });
  check('eğim: 8° zeminde araç 8° eğik durur (iniş başarılı); 14° zemin TN D-6850\'nin 12° sınırını aşar (başarısız)',
    A.result.ok && Math.abs(rest - 8) < 0.01 && !B.result.ok && B.result.why.some((w) => /eğim/.test(w)) && /ÇARPMA/.test(B.events.find((e) => e.key === 'INDI').msg),
    `duruş ${rest.toFixed(3)}°, 14°: ${B.result.why.join('; ')}`);
}

console.log(fail ? `\n${fail} HATA` : '\nTüm temas testleri geçti');
process.exit(fail ? 1 : 0);
