// İki kademeli iniş doğrulaması (Node 20+): cd web && node test/test_twostage.js
//  1) twoStageDesign: toplam kütle ve yörünge kademesinin Δv'si tutarlı (roket denklemi), hazır tasarımlar değişmeden kullanılır
//  2) Altı görev profili × üç iniş güdümü (ZEM/ZEV, optimal dengeli, optimal serbest): yörünge kademesi PDI'dan önce ~15 km irtifada ayrılır, iniş kademesi temasla bitirir;
//     kalan yakıt tek kademeli araçtan fazladır (ölü kütle motorlu inişe taşınmaz)
//  3) Telemetri: üç kademeli Δv bütçesi — istisna yok, NaN yok, yanlış alarm yok, Δv payı sabit; PDI planlı manevrası iniş kademesine yazılır
//  4) Dayanıklılık: Apollo profilinde DOI öncesi (yörünge kademesinin Δv payı) ve DOI'dan sonra, PDI'dan 300–900 s önce rastgele 10 m/s hız bozulmaları — hepsi yumuşak temas
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { Mission, twoStageDesign, TWO_STAGE, siteIcrf, R_SITE } from '../js/mission.js';
import { dvFromEvents } from '../js/dvbudget.js';
import * as T from '../js/telemetry.js';
import { initConic } from '../js/conic.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
await initConic();
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
const fly = (D, landing) => {
  E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing }); M.P.tLimit = Infinity; M.attachHistory(); return M;
};
const run = (M) => { for (;;) { if (M.gen.next().done) break; } return M; };

// ---------------------------------------------------------------- 1) araç bölme
for (const [name, entry] of Object.entries(ALL.profiles)) {
  const D0 = entry.design, D = twoStageDesign(D0), L = D0.STAGES[1], [, s1, s2] = D.STAGES;
  const tot0 = L.dry + L.prop, tot1 = s1.dry + s1.prop + s2.dry + s2.prop, dv1 = (D.TWO.dv1) / 1000;
  const cEx = s1.isp * E.G0, have = cEx * Math.log((tot1) / (tot1 - s1.prop));                                  // yörünge kademesinin roket denklemi Δv'si (km/s)
  check(`araç bölme ${name}: toplam kütle aynı, yörünge kademesinin Δv'si tasarım ihtiyacından fazla, iniş kademesi PDI'ya yeter`,
    D.STAGES.length === 3 && Math.abs(tot1 - tot0) < 1e-9 && have >= dv1 - 1e-9 && have < dv1 * 1.02 + 0.01 && s2.prop > 900 && D.SEP2.hSep === TWO_STAGE.H_SEP && D.TLI === D0.TLI,
    `${tot0} kg = ${s1.name} ${s1.dry}+${s1.prop} + ${s2.name} ${s2.dry}+${s2.prop.toFixed(0)}; yörünge kademesi Δv ${(have * 1000).toFixed(0)} m/s (gereken ${(dv1 * 1000).toFixed(0)})`);
}

// ---------------------------------------------------------------- 2) uçuşlar
const flights = {};
for (const [name, entry] of Object.entries(ALL.profiles)) {
  const out = {};
  for (const mode of ['zem', 'opt', 'free']) {
    const one = run(fly(entry.design, mode)), two = run(fly(twoStageDesign(entry.design), mode));
    out[mode] = { one, two };
  }
  flights[name] = out;
  const okAll = Object.values(out).every(({ two }) => two.result && two.result.ok && Math.abs(two.result.v_mps[2]) < 1.2 && Math.hypot(...two.result.posErr_m) < 5 && two.veh.k === 2);
  const sep = (M) => M.events.filter((e) => e.key === 'SEP2'), pdi = (M) => M.events.find((e) => e.key === 'PDI');
  const m = out.opt.two, sp = sep(m);
  const dt = sp.length === 1 ? pdi(m).t - sp[0].t : NaN, alt = sp.length === 1 ? parseFloat(/irtifa ([\d.]+) km/.exec(sp[0].msg)[1]) : NaN;
  const more = ['zem', 'opt', 'free'].every((k) => out[k].two.result.prop > out[k].one.result.prop + 40);
  check(`profil ${name}: iki kademeli araç üç güdümle de yumuşak temas; yörünge kademesi PDI'dan önce ~15 km'de ayrılır; kalan yakıt tek kademeliden ≥ 40 kg fazla`,
    okAll && sp.length === 1 && dt > 0 && dt < 600 && alt <= 15.0 + 1e-6 && alt > 13.5 && more && m.stageP,
    `kalan yakıt (tek → iki kademe): ZEM ${out.zem.one.result.prop.toFixed(0)} → ${out.zem.two.result.prop.toFixed(0)}, dengeli ${out.opt.one.result.prop.toFixed(0)} → ${out.opt.two.result.prop.toFixed(0)}, serbest ${out.free.one.result.prop.toFixed(0)} → ${out.free.two.result.prop.toFixed(0)} kg; ayrılma PDI−${dt.toFixed(0)} s, ${alt.toFixed(1)} km`);
  const p1left = parseFloat(/(\d+) kg yakıt atıldı/.exec(sp[0].msg)[1]), p1 = twoStageDesign(entry.design).STAGES[1].prop;
  check(`profil ${name}: yörünge kademesi atılırken hâlâ yakıt payı var (atılan yakıt tasarım yakıtının %1–15'i)`, p1left > 0.01 * p1 && p1left < 0.15 * p1, `atılan ${p1left} kg / ${p1} kg`);
}

// ---------------------------------------------------------------- 3) telemetri: üç kademeli Δv bütçesi
for (const [name, entry] of Object.entries(ALL.profiles)) {
  const D = twoStageDesign(entry.design), nominal = dvFromEvents(flights[name].opt.two.events);                  // uygulamadaki gibi: aynı güdüm ve araçla bozulmasız koşunun Δv'si
  const M = fly(D, 'opt'), O = { stages: D.STAGES, siteIcrf, rSite: R_SITE, tLaunch: D.LAUNCH.t_launch };
  let last = -1e9, n = 0, errs = 0, nan = 0, hard = 0, ex = '', nS = 0;
  const mg = { 1: [], 2: [] }, noNaN = (o) => Object.values(o).every((v) => (typeof v === 'number' ? !Number.isNaN(v) : v && typeof v === 'object' && !Array.isArray(v) ? noNaN(v) : true));
  let pdiStage = null;
  for (;;) {
    if (M.gen.next().done) break;
    const h = M.hist[M.hist.length - 1];
    if (h.t - last > (h.thr > 0 ? 20 : 1800) || h.k !== (M._lastK ?? h.k)) {
      last = h.t; nS++; M._lastK = h.k;
      try {
        const tel = T.computeTelemetry({ ...h }, O), b = T.dvBudget(D, nominal, M.events, h, O.stages), al = T.alerts(tel, b.rows, O).filter((a) => a.level !== 'info');
        if (!noNaN(tel)) nan++; if (al.length) { hard++; ex = ex || `${h.phase}: ${al[0].text}`; }
        for (const q of b.rows) if (mg[q.stage]) mg[q.stage].push(q.margin);
        const pr = b.progress.find((q) => q.key === 'PDI'); if (pr) pdiStage = pr.stage;
      } catch (e) { errs++; ex = ex || e.message; }
    }
    if (++n > 8e6) break;
  }
  const sp = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
  // 6-DOF: RCS yakıtı kuru kütlenin parçasıdır; harcandıkça araç hafifler ve ana motorun Δv kapasitesi artar (≈ 0,3–1,8 m/s/kg): pay yayılımı bununla sınırlıdır
  const r1 = M.veh.stages[1].rcsUsed || 0, r2 = M.veh.stages[2].rcsUsed || 0, lim1 = 1.5 + 1.8 * r1, lim2 = 1.5 + 1.8 * r2;
  check(`profil ${name} (iki kademe): telemetri istisnasız, NaN yok, yanlış alarm yok, Δv payı sabit (6-DOF RCS kütle etkisi hariç), PDI iniş kademesinde`, M.result.ok && errs === 0 && nan === 0 && hard === 0 && pdiStage === 2 && sp(mg[1]) < lim1 && sp(mg[2]) < lim2,
    `${nS} örnek, pay yayılımı k1 ${sp(mg[1]).toFixed(2)} (RCS ${r1.toFixed(1)} kg, sınır ${lim1.toFixed(2)}) / k2 ${sp(mg[2]).toFixed(2)} (RCS ${r2.toFixed(1)} kg, sınır ${lim2.toFixed(2)}) m/s${ex ? ', ' + ex : ''}`);
}

// ---------------------------------------------------------------- 4) hız bozulmalarına dayanıklılık (yörünge kademesinin payı yalnız %3 + 15 m/s; tek kademeli araçtaki gibi her iki pencerede de kurtarılır)
{
  const D = twoStageDesign(ALL.profiles.APOLLO.design), base = flights.APOLLO.opt.two, ev = (k) => base.events.find((e) => e.key === k);
  const tA = ev('LOI_END').t, tD = ev('DOI').t, tP = ev('PDI').t;
  let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const [where, pick] of [['DOI öncesi (LLO)', () => tA + 300 + rnd() * (tD - tA - 600)], ["DOI'dan sonra, PDI'dan 5–15 dk önce", () => tP - 300 - rnd() * 600]]) {
    let okN = 0, worstV = 0, worstE = 0, minLeft = 1e9, fails = 0; const NT = 4;
    for (let i = 0; i < NT; i++) {
      const u = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], un = Math.hypot(...u), t = pick(), M = fly(D, 'opt');
      M.P.tLimit = t; for (let g = 0; g < 1e7; g++) { const r = M.gen.next(); if (r.done || r.value === 0) break; }
      M.P.s.v = M.P.s.v.map((v, k) => v + (u[k] / un) * 10 / 1000); M.P.tLimit = Infinity; run(M);
      const R = M.result, sp = M.events.find((e) => e.key === 'SEP2'), left = sp ? parseFloat(/(\d+) kg yakıt atıldı/.exec(sp.msg)[1]) : 0;
      if (R && R.ok && Math.abs(R.v_mps[2]) < 1.5 && Math.hypot(...R.posErr_m) < 5 && left > 0) okN++;
      if (R) { worstV = Math.max(worstV, Math.abs(R.v_mps[2])); worstE = Math.max(worstE, Math.hypot(...R.posErr_m)); } minLeft = Math.min(minLeft, left); fails += M.descentInfo ? M.descentInfo.fails : 0;
    }
    check(`iki kademeli araç, ${NT} rastgele 10 m/s bozulma ${where}: hepsi yumuşak temas, yörünge kademesinde yakıt kalır`, okN === NT && fails === 0,
      `${okN}/${NT}, en büyük |dikey| ${worstV.toFixed(2)} m/s, hata ${worstE.toFixed(1)} m, ayrılırken en az ${minLeft} kg yakıt, başarısız yeniden çözüm ${fails}`);
  }
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
