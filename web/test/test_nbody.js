// N-cisim çözücü doğrulaması (Node 20+): cd web && node test/test_nbody.js
//  1) Değişken kütleli sonlu itki roket denklemine uyar (boş uzay; eski sabit-ivme ayrıklaştırmasıyla karşılaştırma)
//  2) Çerçeve dönüşümleri ('E' ↔ 'M' ↔ 'N') kesin
//  3) Motorun N-cisim yayınımı, motordan bağımsız yazılmış barisentrik-tutarlı N-cisim entegrasyonuyla (nbody_ref.js) uyuşur:
//     TLI→MCC-1, MCC-1→MCC-2, MCC-2→LOI (Ay'ın etki küresi içinde ve dışında) ve alçak Ay yörüngesi
//  4) Tüm görev N-cisim ve etki küresi çözücüleriyle aynı sonucu verir; uçuş sırasında çözücü değiştirilebilir
//  5) Kuvvet dökümü büyüklük sıraları
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { Mission, DEFAULT_DESIGN } from '../js/mission.js';
import { dvFromEvents } from '../js/dvbudget.js';
import { makeRef, integrate } from './nbody_ref.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const { norm, sub } = E;

// ---------------------------------------------------------------- 1) itki: boş uzayda (Dünya'dan 1e9 km, Ay/Güneş çok uzakta)
{
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  E.setProvider({ kind: 'stub', moonPos: () => [1e12, 0, 0], moonVel: () => [0, 0, 0], sunPos: () => [0, 1e12, 0], planets: () => [], pole: () => [0, 0, 1], npb: () => I3,
    earthIcrfToItrf: () => I3, moonIcrfToPa: () => I3, ttMinusUtc: () => 69.184 });
  const stages = [{ name: 'a', dry: 2300, prop: 6200, T: 100, isp: 450 }, { name: 'b', dry: 1300, prop: 2300, T: 16, isp: 320 }];
  const burn = (dur, hMax, exact) => {
    E.OPTS.exactMass = exact;
    const veh = new E.Vehicle(stages), P = new E.Propagator(new E.State(0, [1e9, 0, 0], [0, 0, 0], 'E'), veh, 900, hMax);
    P.runUntil(dur, () => [1.0, [0, 1, 0]]); P.runUntil(dur + 100);
    E.OPTS.exactMass = true;
    return { vy: P.s.v[1] * 1000, dvUsed: P.dvUsed * 1000, prop: veh.stages[0].prop, m: veh.mass() };
  };
  const m0 = 12100, mdot = 100 / (450 * E.G0), exp = (dur) => 450 * E.G0 * 1000 * Math.log(m0 / (m0 - mdot * dur));
  for (const hMax of [1.0, 0.25]) {
    const r = burn(270, hMax, true);
    check(`itki: Δv roket denklemine uyar (h≤${hMax} s, 270 s)`, Math.abs(r.vy - exp(270)) < 0.01 && Math.abs(r.dvUsed - exp(270)) < 1e-6, `uygulanan ${r.vy.toFixed(4)} m/s, roket denklemi ${exp(270).toFixed(4)} m/s`);
  }
  const leg = burn(270, 1.0, false);
  check('itki: eski sabit-ivme ayrıklaştırması Δv\'yi eksik uygular (karşılaştırma)', exp(270) - leg.vy > 3 && exp(270) - leg.vy < 6, `eksik ${(exp(270) - leg.vy).toFixed(2)} m/s (%${((exp(270) - leg.vy) / exp(270) * 100).toFixed(3)})`);
  const bo = burn(300, 1.0, true), tb = 6200 / mdot;
  check('itki: yakıt bitince itki kesilir, Δv tam yakıt değeri', bo.prop === 0 && Math.abs(bo.vy - exp(tb)) < 0.01, `yakıt ${bo.prop}, Δv ${bo.vy.toFixed(3)} / ${exp(tb).toFixed(3)} m/s, bitiş ${tb.toFixed(2)} s`);
}

// ---------------------------------------------------------------- canlı efemeris
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const T_START = DEFAULT_DESIGN.LAUNCH.t_ins - 86400;
const live = () => makeLive(SPK, PCK, eo, T_START);

// ---------------------------------------------------------------- 2) çerçeve dönüşümleri
{
  live();
  const t = 1300000, rm = E.moonPos(t), vm = E.moonVel(t);
  const s0 = new E.State(t, [rm[0] + 30000, rm[1] - 20000, rm[2] + 5000], [vm[0] + 0.3, vm[1] - 0.2, vm[2] + 0.1], 'N');
  const back = s0.toFrame('M').toFrame('E').toFrame('N');
  check('çerçeve: N → M → E → N gidiş-dönüş', norm(sub(back.r, s0.r)) < 1e-8 && norm(sub(back.v, s0.v)) < 1e-12, `Δr ${(norm(sub(back.r, s0.r)) * 1e6).toExponential(1)} mm, Δv ${(norm(sub(back.v, s0.v)) * 1e9).toExponential(1)} µm/s`);
  check('çerçeve: N durumu etki küresi içindeyse inMoonFrame()', s0.inMoonFrame() && !new E.State(t, [1e5, 0, 0], [0, 1, 0], 'N').inMoonFrame());
  const q = s0.copy(); const sw = q.switchIfNeeded();
  check("çerçeve: N durumu etki küresinde çerçeve değiştirmez", !sw && q.central === 'N');
}

// ---------------------------------------------------------------- 3) bağımsız N-cisim referansı
{
  const { L } = live(), ref = makeRef(L), M = new Mission(); M.P.tLimit = Infinity;
  const plan = Object.fromEntries(M.plan.map((p) => [p.key, p.t]));
  const runTo = (t) => { M.P.tLimit = t; while (M.P.s.t < t - 1e-9 && !M.done) if (M.gen.next().done) break; };
  const leg = (name, tA, tB, maxM, hmax = 1800) => {
    runTo(tA);
    const sA = M.P.s.copy(), [rg, vg] = sA.geo();
    const P = new E.Propagator(sA.copy(), E.dummyVehicle(), hmax, 1.0, { nbody: true }); P.runUntil(tB);
    const [rE, vE] = P.s.geo(), R = integrate(ref, sA.t, rg, vg, tB, { hmax });
    const dr = norm(sub(rE, R.y)) * 1000, dv = norm(sub(vE, R.v)) * 1e6, dist = norm(P.s.seleno()[0]);
    check(`N-cisim ≈ bağımsız referans: ${name}`, dr < maxM, `${((tB - tA) / 3600).toFixed(1)} sa, Ay'a ${dist.toFixed(0)} km: Δr ${dr.toFixed(3)} m, Δv ${dv.toFixed(3)} mm/s (sınır ${maxM} m)`);
  };
  leg('TLI kesme → MCC-1', plan.SEP + 5, plan['MCC-1'] - 5, 2);
  runTo(plan['MCC-1'] + 120);
  leg('MCC-1 → MCC-2', plan['MCC-1'] + 120, plan['MCC-2'] - 5, 2);
  runTo(plan['MCC-2'] + 60);
  leg('MCC-2 → LOI (etki küresine giriş dahil)', plan['MCC-2'] + 60, plan.LOI - 5, 2);
  // alçak Ay yörüngesi: LOI tamam → DOI öncesi
  runTo(plan.LOI + 600);
  const tLoiEnd = M.events.find((e) => e.key === 'LOI_END').t;
  runTo(tLoiEnd + 30);
  leg('alçak Ay yörüngesi (LOI → DOI)', tLoiEnd + 30, plan.DOI - 60, 1, 60);
}

// ---------------------------------------------------------------- 4) tüm görev: N-cisim ≡ etki küresi; uçuş sırasında çözücü değişimi
{
  const fly = (nbody, toggleAt = null) => {
    live();
    const M = new Mission({ nbody }); M.P.tLimit = Infinity;
    const toggles = toggleAt ? [...toggleAt] : [];
    for (;;) {
      if (toggles.length && M.P.s.t >= toggles[0]) { toggles.shift(); M.setSolver(!M.nbody); }
      if (M.gen.next().done) break;
    }
    return M;
  };
  const A = fly(true), B = fly(false), dA = dvFromEvents(A.events), dB = dvFromEvents(B.events);
  const keys = ['TLI', 'MCC-1', 'MCC-2', 'LOI', 'DOI', 'PDI'];
  const worst = Math.max(...keys.map((k) => Math.abs((dA[k] ?? 0) - (dB[k] ?? 0))));
  check('görev: N-cisim ve etki küresi çözücüleri aynı manevra Δv\'lerini verir', worst < 0.05, 'en büyük fark ' + worst.toFixed(4) + ' m/s; ' + keys.map((k) => `${k} ${(dA[k] ?? 0).toFixed(2)}`).join(', '));
  check('görev: iki çözücüyle de iniş başarılı ve aynı anda', A.result.ok && B.result.ok && Math.abs(A.result.t - B.result.t) < 2, `temas ${A.result.utc} / ${B.result.utc}; dikey ${A.result.v_mps[2].toFixed(2)} / ${B.result.v_mps[2].toFixed(2)} m/s; yakıt ${A.result.prop.toFixed(1)} / ${B.result.prop.toFixed(1)} kg`);
  const plan = Object.fromEntries(A.plan.map((p) => [p.key, p.t]));
  const C = fly(true, [plan['MCC-1'] + 3600, plan.LOI - 3600, plan.DOI + 1200]);        // transfer, LOI öncesi ve alçalış sırasında değiştir
  check('görev: uçuş sırasında çözücü değiştirilince (N→SOI→N→SOI) iniş yine başarılı', C.result.ok && Math.abs(C.result.t - A.result.t) < 5, `temas ${C.result.utc}, dikey ${C.result.v_mps[2].toFixed(2)} m/s, çözücü sonda: ${C.nbody ? 'N-cisim' : 'etki küresi'}`);
}

// ---------------------------------------------------------------- 5) kuvvet dökümü
{
  live();
  const t = 1083171 + 600, rm = E.moonPos(t);
  const f = E.accelBreakdown(t, [E.R_E + 185, 0, 0], 'N'), muE = E.MU_E;
  check('kuvvet dökümü: LEO\'da baskın cisim Dünya, merkezî çekim μ/r²', f.frame === 'E' && Math.abs(f.earth - (1000 * muE) / (E.R_E + 185) ** 2) < 1e-9 && f.earthEff === f.earth, f.earth.toFixed(4) + ' m/s²');
  check('kuvvet dökümü: Dünya J2 ≈ 1,4e-2 m/s²', f.earthJ2 > 0.5e-2 && f.earthJ2 < 3e-2, f.earthJ2.toExponential(2));
  check('kuvvet dökümü: Güneş\'in doğrudan çekimi ~6e-3 m/s² ama etkin (bozucu) ~1e-7…1e-6 (ortak kısım Dünya\'yla düşer)', f.sun > 5e-3 && f.sun < 7e-3 && f.sunEff > 1e-7 && f.sunEff < 1e-6, `doğrudan ${f.sun.toExponential(2)}, etkin ${f.sunEff.toExponential(2)}`);
  check('kuvvet dökümü: Ay\'ın LEO\'daki gelgit etkisi ~1e-6 m/s², Ay figürü kapsam dışı', f.moonEff > 3e-7 && f.moonEff < 3e-6 && f.moonFig === 0, `${f.moonEff.toExponential(2)}, Ay figürü ${f.moonFig}`);
  const g = E.accelBreakdown(t, [rm[0] + E.R_M + 110, rm[1], rm[2]], 'N');
  check('kuvvet dökümü: LLO\'da baskın cisim Ay (≈1,4 m/s²), Ay figürü ≈4e-4 m/s²', g.frame === 'M' && g.moon > 1.2 && g.moon < 1.7 && g.moonEff === g.moon && g.moonFig > 1e-4 && g.moonFig < 2e-3, `Ay ${g.moon.toFixed(3)}, J2/C22 ${g.moonFig.toExponential(2)}`);
  check('kuvvet dökümü: LLO\'da Dünya\'nın etkin (gelgit) ivmesi ~3e-5 m/s² (doğrudan çekimi 2,7e-3)', g.earthEff > 5e-6 && g.earthEff < 2e-4 && g.earth > 2e-3 && g.earth < 4e-3, `doğrudan ${g.earth.toExponential(2)}, etkin ${g.earthEff.toExponential(2)}`);
  const h = E.accelBreakdown(t, E.sub(E.add(rm, [E.R_M + 110, 0, 0]), rm), 'M');
  check('kuvvet dökümü: aynı durum Ay çerçevesinde verilince aynı sonuç', Math.abs(h.moon - g.moon) < 1e-9 && Math.abs(h.earthEff - g.earthEff) < 1e-12);
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
