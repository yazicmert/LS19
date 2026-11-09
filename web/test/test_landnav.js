// İniş seyrüseferi (Node 20+): cd web && node test/test_landnav.js
//  1) Süzgeç birimleri: başlangıç kovaryansı, ivmeölçer sapmasıyla hata büyümesi (kapalı çözüm), skaler Kalman güncellemesi, makullük kapısı, tohum belirlenimciliği
//  2) Tam görev: varsayılan seyrüseferle (tohum 1) iniş; seyrüsefer kapalıyken güdüm gerçek durumu bilir
//  3) Monte Carlo (50 tohum, ZEM/ZEV; 8 tohum dengeli optimal): çarpma yok, iniş dağılımı metreler (SLIM ≤ 10 m)
//  4) Arızalar: altimetrede +30 m sapma (son 150 m'de ani, ya da baştan) → reddedilir, arızalı sayılır, iniş güvenli;
//     ispace M1 senaryosu (TRN yok, PDI'da kestirim 3 km alçak): kalıcı ret kuralı altimetreyi yeniden kabul eder ve iner; kural kapalıyken (yalnız ret) yakıt biter, araç çarpar
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { Mission, twoStageDesign } from '../js/mission.js';
import { LandNav, NAV } from '../js/landnav.js';
import { initConic } from '../js/conic.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// ---------------------------------------------------------------- 1) birimler
{
  const N = new LandNav({ seed: 7 }); N.init(0, [1737.4, 0, 0], [0, 1.6, 0], I3);
  check('başlangıç kovaryansı = yerel eksenlerde NAV.INIT σ²', Math.abs(N.P[0][0] - NAV.INIT.pos[0] ** 2) < 1e-9 && Math.abs(N.P[2][2] - NAV.INIT.pos[2] ** 2) < 1e-9 && Math.abs(N.P[5][5] - NAV.INIT.vel[2] ** 2) < 1e-12 && N.P[0][1] === 0);
  // ivmeölçer sapması: çekim gradyanı yokken (mu = 0) e_v = b·t, e_r = e_r0 + e_v0·t + ½·b·t² (gürültüsüz: itki yok)
  const M = new LandNav({ seed: 7, imu: { noise: 0, mis: 0 } }); M.init(0, [1737.4, 0, 0], [0, 1.6, 0], I3);
  const e0 = M.e.slice(), b = M.ba; for (let k = 1; k <= 1000; k++) M.propagate(k * 0.01, [0, 0, 0], [1737.4, 0, 0], 0);
  const er = [0, 1, 2].map((i) => e0[i] + e0[3 + i] * 10 + 0.5 * b[i] * 100), dv = [0, 1, 2].map((i) => e0[3 + i] + b[i] * 10);
  const dr = Math.max(...[0, 1, 2].map((i) => Math.abs(M.e[i] - er[i]))), dV = Math.max(...[0, 1, 2].map((i) => Math.abs(M.e[3 + i] - dv[i])));
  check('IMU ilerletmesi: sabit ivmeölçer sapmasında hız hatası b·t, konum hatası ½·b·t² (yarı kapalı Euler, 0,01 s adım)', dV < 1e-12 && dr < 0.6 * Math.max(...b.map(Math.abs)) * 0.01 * 10 + 1e-12, `konum farkı ${dr.toExponential(1)} m, hız ${dV.toExponential(1)} m/s`);
  // skaler güncelleme: tek eksende K = P/(P+R)
  const K = new LandNav({ seed: 1 }); K.init(0, [1737.4, 0, 0], [0, 1.6, 0], I3);
  const p0 = K.P[0][0], ex0 = K.e[0], R = 25, y = -ex0 + 3, r = K.scalar([1, 0, 0, 0, 0, 0], y, R, Infinity);
  check('Kalman: e ← e + K·y, P ← (1 − K)·P, K = P/(P + R)', r.ok && Math.abs(K.e[0] - (ex0 + (p0 / (p0 + R)) * y)) < 1e-9 && Math.abs(K.P[0][0] - p0 * R / (p0 + R)) < 1e-9);
  const G = new LandNav({ seed: 1 }); G.init(0, [1737.4, 0, 0], [0, 1.6, 0], I3);
  const sig = Math.sqrt(G.P[0][0] + 1), rj = G.scalar([1, 0, 0, 0, 0, 0], 4.5 * sig, 1), e1 = G.e[0];
  check('makullük kapısı: 4,5σ yenilik reddedilir, kestirim değişmez', !rj.ok && Math.abs(rj.nis - 4.5) < 1e-9 && e1 === G.e[0]);
  const A = new LandNav({ seed: 42 }), B = new LandNav({ seed: 42 }), C = new LandNav({ seed: 43 });
  for (const X of [A, B, C]) X.init(0, [1737.4, 0, 0], [0, 1.6, 0], I3);
  check('tohum: aynı tohum aynı hata, farklı tohum farklı', A.e.every((x, i) => x === B.e[i]) && A.e.some((x, i) => x !== C.e[i]));
}

// ---------------------------------------------------------------- 2–4) tam görev
await initConic();
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
const D = twoStageDesign(ALL.profiles.APOLLO.design);
const fly = (landing, nav) => {
  E.setMoonZone(E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing, ...(nav === undefined ? {} : { nav }) }); M.P.tLimit = Infinity;
  for (;;) { if (M.gen.next().done) break; }
  return M;
};
const err = (M) => Math.hypot(...M.result.posErr_m), keys = (M) => new Set(M.events.map((e) => e.key));
{
  const A = fly('opt', {}), B = fly('opt', {}), O = fly('opt'), k = keys(A);
  check('seyrüsefer açık (nav: {}, tohum 1): iniş başarılı, kestirimle güdüm metre içinde; aynı tohum bit düzeyinde aynı uçuş',
    A.result.ok && err(A) < 5 && err(A) > 0.2 && A.result.t === B.result.t && err(A) === err(B) && ['NAV', 'NAV_ALT', 'NAV_VEL', 'NAV_TRN'].every((x) => k.has(x)),
    `hata ${err(A).toFixed(2)} m, dikey ${A.result.v_mps[2].toFixed(2)} m/s`);
  check('seyrüsefer kapalı (varsayılan): güdüm gerçek durumu bilir, iniş yerine < 0,5 m', O.result.ok && err(O) < 0.5 && !keys(O).has('NAV'), `hata ${err(O).toFixed(2)} m`);
}
const mc = (landing, seeds, extra = {}) => {
  const out = [];
  for (const s of seeds) { const M = fly(landing, { seed: s, ...extra }); out.push({ s, ok: M.result.ok, err: err(M), vz: M.result.v_mps[2], k: keys(M), M }); }
  const e = out.map((o) => o.err).sort((a, b) => a - b);
  return { out, ok: out.filter((o) => o.ok).length, p50: e[Math.floor(e.length / 2)], p95: e[Math.floor(e.length * 0.95)], max: e[e.length - 1] };
};
{
  const Z = mc('zem', Array.from({ length: 50 }, (_, i) => i + 1));
  check('Monte Carlo 50 tohum (ZEM/ZEV): çarpma yok, iniş dağılımı metreler (SLIM ≤ 10 m): p95 < 10 m',
    Z.ok === 50 && Z.p95 < 10 && Z.max < 20, `başarılı ${Z.ok}/50, hata p50 ${Z.p50.toFixed(2)} · p95 ${Z.p95.toFixed(2)} · en çok ${Z.max.toFixed(2)} m`);
  const O = mc('opt', [11, 12, 13, 14, 15, 16, 17, 18]);
  check('Monte Carlo 8 tohum (dengeli optimal): çarpma yok, hata < 10 m', O.ok === 8 && O.max < 10, `hata p50 ${O.p50.toFixed(2)} · en çok ${O.max.toFixed(2)} m`);
}
{
  const S = mc('zem', [1, 2, 3], { faults: [{ sensor: 'alt', bias: 30, below: 150 }] }), C = mc('opt', [4], { faults: [{ sensor: 'alt', bias: 30 }] });
  const flagged = (R) => R.out.every((o) => o.k.has('NAV_REJ') && o.k.has('NAV_FAULT'));
  check('altimetre +30 m: son 150 m\'de ani sapma (ZEM, 3 tohum) ve baştan sapma (dengeli): makullük sınamasıyla reddedilir, arızalı sayılır, iniş güvenli',
    S.ok === 3 && C.ok === 1 && flagged(S) && flagged(C) && S.out.every((o) => Math.abs(o.vz) < 2.2), `dikey ${S.out.map((o) => o.vz.toFixed(2)).join(', ')} / ${C.out[0].vz.toFixed(2)} m/s; ${C.out[0].M.events.find((e) => e.key === 'NAV_FAULT').msg}`);
  const ok = mc('zem', [5], { trn: false, init: { off: [0, 0, -3000] } }), bad = mc('zem', [5], { trn: false, persist: false, init: { off: [0, 0, -3000] } });
  check('ispace M1 senaryosu (TRN yok, PDI kestirimi 3 km alçak): kalıcı ret kuralıyla altimetre yeniden kabul edilir ve iner; kural yokken (yalnız ret) yakıt biter, çarpar',
    ok.ok === 1 && ok.out[0].k.has('NAV_ACCEPT') && bad.ok === 0 && !bad.out[0].k.has('NAV_ACCEPT') && bad.out[0].M.result.prop < 1,
    `kuralla: hata ${ok.out[0].err.toFixed(0)} m, dikey ${ok.out[0].vz.toFixed(2)} m/s; kuralsız: dikey ${bad.out[0].vz.toFixed(1)} m/s, kalan yakıt ${bad.out[0].M.result.prop.toFixed(0)} kg`);
}

console.log(fail ? `\n${fail} HATA` : '\nTüm seyrüsefer testleri geçti');
process.exit(fail ? 1 : 0);
