// Yer ağı ve iletişim/gölge olayları (js/groundnet.js) doğrulaması (Node 20+): cd web && node test/test_groundnet.js
//  1) istasyonlar: DSN 810-005 301 Rev. K Tablo 5'in jeodezik koordinatları, aynı belgenin Tablo 4 kartezyen koordinatlarıyla (bağımsız) metre altında
//  2) bakış geometrisi: istasyonun tepesindeki araç (yükseklik 90°), menzil ve ışık süresi; Ay'ın arkasındaki araç (Ay engeli); TDRS rölesi; NSN → DSN devri 35.406 km'de
//  3) varsayılan görev (Apollo profili) baştan sona: park yörüngesinde 2 × ~37 dk Dünya gölgesi, Ay yörüngesinde 2 × ~46 dk Ay gölgesi, LLO'da LOS 45–49 dk
//     (Apollo 11: 45–47 dk), LOI ve DOI Ay'ın arkasında (bağlantısız), TLI'da DSN'de 10° üstünde kompleks yok (TDRS), PDI'da Madrid ~19°
//  4) olay anları bağımsız 1 s örneklemeyle (ayrı ışın–küre ve gölge hesabı) ±1 s içinde; ağ devri aracın 35.406 km'den geçtiği anda
//  5) öngörü: Ay yörüngesinde itkisiz N-cisim yolundan beklenen olaylar gerçekleşenlerle ±3 s içinde aynı
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { Mission } from '../js/mission.js';
import { ecfFromGeodetic } from '../js/geo.js';
import * as G from '../js/groundnet.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const { sub, add, scale, norm, unit, dot, mtv } = E;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// ---------------------------------------------------------------- 1) istasyon koordinatları (efemeris gerekmez)
{
  const TAB4 = { 'DSS-14': [-2353621.420, -4641341.472, 3677052.318], 'DSS-43': [-4460894.917, 2682361.507, -3674748.152], 'DSS-63': [4849092.518, -360180.3480, 4115109.251] };   // m, 810-005 301 Tablo 4
  let worst = 0;
  for (const s of G.DSN) worst = Math.max(worst, norm(sub(scale(s.ecf, 1000), TAB4[s.id])));
  check('DSN: Tablo 5 (WGS-84 jeodezik) → ECF, Tablo 4 kartezyen koordinatlarıyla aynı', worst < 1.0, `en kötü fark ${worst.toFixed(3)} m`);
  check('DSN: maskeler (alma 6°, gönderme 10,4° / 10,2° / 10,2°) ve kompleks adları', G.DSN.map((s) => `${s.name}:${s.rx}/${s.tx}`).join(',') === 'Goldstone:6/10.4,Canberra:6/10.2,Madrid:6/10.2');
  check('ağ devri uzaklığı 22.000 mil = 35.405,6 km', Math.abs(G.HANDOVER_KM - 35405.568) < 1e-3);
}

// ---------------------------------------------------------------- canlı efemeris
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const DEF = JSON.parse(fs.readFileSync(new URL('../data/design_default.json', import.meta.url))), D = DEF.design;
makeLive(ab(new URL('../data/de440s.bsp', import.meta.url)), ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)), eo, DEF.tStart);

// ---------------------------------------------------------------- 2) bakış geometrisi
{
  const t = D.LAUNCH.t_launch + 3 * 86400, M = E.earthIcrfToItrf(t), s14 = G.DSN[0];
  const stI = mtv(M, s14.ecf), upI = mtv(M, s14.up), rv = add(stI, scale(upI, 100000));
  const L = G.linkState(t, rv), q = L.stations[0];
  check('istasyonun tepesindeki araç: yükseklik 90°, menzil 100.000 km, tek yön = menzil/c, etkin DSS-14 (DSN)', Math.abs(q.el * R2D - 90) < 1e-6 && Math.abs(q.range - 100000) < 1e-6 && Math.abs(q.oneWay - 100000 / G.C_KM_S) < 1e-12
    && L.net === 'DSN' && L.active && L.active.id === 'DSS-14' && Math.abs(L.rtlt - 2 * q.oneWay) < 1e-12, `el ${(q.el * R2D).toFixed(6)}°, gidiş-dönüş ${L.rtlt.toFixed(4)} s`);
  // Ay'ın tam arkası: istasyon → Ay merkezi doğrultusunda Ay'ın 5.000 km ötesi
  const rm = E.moonPos(t), u = unit(sub(rm, stI)), behind = add(rm, scale(u, 5000)), Lb = G.linkState(t, behind), qb = Lb.stations[0];
  check('Ay\'ın arkasındaki araç: istasyon–araç doğrusunu Ay kesiyor (moon), istasyon bağlantısız', qb.moon && !qb.ok);
  const side = add(rm, scale(unit(E.cross(u, [0, 0, 1])), 3 * E.R_M)), qs = G.linkState(t, side).stations[0];
  check('Ay\'ın yanındaki araç (3 R_M yanda): engel yok', !qs.moon);
  // TDRS: alçak yörüngede 41° B'nin altında
  const ecfV = ecfFromGeodetic(0, -41, 400), rvL = mtv(M, ecfV), LT = G.linkState(t, rvL), qT = LT.stations.find((x) => x.id === 'TDRS-E');
  const relay = norm(sub(G.TDRS[0].gt.ecf, G.TDRS[0].ecf));
  check('LEO, TDRS Doğu\'nun altında: ağ NSN, etkin TDRS-E, tek yön = (araç–TDRS + TDRS–White Sands)/c', LT.net === 'NSN' && LT.active.id === 'TDRS-E' && Math.abs(qT.oneWay - (norm(sub(rvL, mtv(M, G.TDRS[0].ecf))) + relay) / G.C_KM_S) < 1e-12,
    `gidiş-dönüş ${LT.rtlt.toFixed(3)} s`);
  const ecfF = ecfFromGeodetic(0, 139, 400), qF = G.linkState(t, mtv(M, ecfF)).stations.find((x) => x.id === 'TDRS-E');
  check('LEO, Dünya\'nın öbür yüzünde: TDRS Doğu\'yu Dünya engelliyor', qF.earth && !qF.ok);
  const dir = unit(rv);
  check('ağ: 35.000 km NSN, 36.000 km DSN', G.linkState(t, scale(dir, 35000)).net === 'NSN' && G.linkState(t, scale(dir, 36000)).net === 'DSN');
}

// ---------------------------------------------------------------- 3) varsayılan görev
const M = new Mission({ design: D, attitude: false }); M.P.tLimit = Infinity; M.attachHistory();
const scanner = new G.EventScanner(), evs = [], rec = [];
{
  const push = M.P.onStep;
  M.P.onStep = (...a) => {
    push(...a); const H = M.hist, b = H[H.length - 1], a2 = H[H.length - 2];
    rec.push({ t: b.t, r: b.r.slice(), v: b.v.slice(), ph: b.phase, thr: b.thr });
    if (!a2) { scanner.start(b.t, b.r); return; }
    evs.push(...scanner.scan(b.t, G.hermitePos(a2, b)));
  };
  for (;;) { const r = M.gen.next(); if (r.done || M.done) break; }
}
check('görev yumuşak temasla bitti', M.done && M.result && M.result.ok);
const ev = (k) => M.events.find((e) => e.key === k);
const within = (t, a, b) => t >= a && t <= b;
const hermAt = (t) => { const j = rec.findIndex((x) => x.t >= t); if (j <= 0) return rec[Math.max(0, j)].r; return G.hermitePos(rec[j - 1], rec[j])(t); };
const tLoi = ev('LOI').t, tLlo0 = ev('LOI_END').t, tDoi = ev('DOI').t, tPdi = ev('PDI').t;
{
  const parkSh = evs.filter((e) => e.key === 'ECL_OUT' && e.by === 'Dünya' && e.t < ev('TLI').t).map((e) => e.dur / 60);
  check('park yörüngesi: 2 Dünya gölgesi, her biri 36–38 dk', parkSh.length === 2 && parkSh.every((d) => d > 36 && d < 38), parkSh.map((d) => d.toFixed(1) + ' dk').join(', '));
  const lloSh = evs.filter((e) => e.key === 'ECL_OUT' && e.by === 'Ay' && within(e.t, tLlo0, tPdi)).map((e) => e.dur / 60);
  check('Ay yörüngesi: 2 Ay gölgesi, her biri 44–48 dk (Apollo 11 LLO ~45 dk)', lloSh.length === 2 && lloSh.every((d) => d > 44 && d < 48), lloSh.map((d) => d.toFixed(1) + ' dk').join(', '));
  const lloLos = evs.filter((e) => e.key === 'AOS' && e.dur != null && within(e.t, tLlo0 + 1800, tPdi + 3600)).map((e) => e.dur / 60);
  check('Ay yörüngesi: tam turlarda LOS 45–49 dk (Apollo 11 AFJ: 45–47 dk)', lloLos.length >= 2 && lloLos.every((d) => d > 45 && d < 49), lloLos.map((d) => d.toFixed(1) + ' dk').join(', '));
  // LOI ve DOI yakışları LOS içinde
  const losIv = []; let open = null;
  for (const e of evs) { if (e.key === 'LOS') open = e.t; if (e.key === 'AOS' && open != null) { losIv.push([open, e.t]); open = null; } }
  const inLos = (a, b) => losIv.some(([x, y]) => a >= x && b <= y);
  check('LOI yakışı tümüyle Ay\'ın arkasında (Apollo LOI gibi)', inLos(tLoi, ev('LOI_END').t), `LOS aralıkları ${losIv.map(([a, b]) => `${E.utcString(a).slice(11, 19)}–${E.utcString(b).slice(11, 19)}`).join(', ')}`);
  check('DOI yakışı Ay\'ın arkasında', inLos(tDoi, ev('DOI_END').t));
  const at = (t) => { let j = rec.findIndex((x) => x.t >= t); if (j < 0) j = rec.length - 1; return rec[j]; };
  const dsnUp = (t) => G.linkState(t, at(t).r).stations.filter((q) => q.net === 'DSN' && q.el > 10 * D2R && !q.moon);
  const Ltli = G.linkState(tLoi, at(tLoi).r), Lt = G.linkState(ev('TLI').t, at(ev('TLI').t).r);
  check('TLI: ağ NSN (TDRS bağlı), 10° üstünde engelsiz DSN kompleksi yok', Lt.net === 'NSN' && !!Lt.active && dsnUp(ev('TLI').t).length === 0);
  check('LOI ve DOI: 10° üstünde engelsiz DSN kompleksi yok, bağlantı yok (Ay)', dsnUp(tLoi).length === 0 && dsnUp(tDoi).length === 0 && !Ltli.active && Ltli.cause === 'moon');
  const Lp = G.linkState(tPdi, at(tPdi).r), mad = Lp.stations.find((q) => q.id === 'DSS-63');
  check('PDI: Madrid etkin, ~19° yükseklikte', Lp.active && Lp.active.id === 'DSS-63' && Math.abs(mad.el * R2D - 19) < 1.5, `${(mad.el * R2D).toFixed(1)}°, gidiş-dönüş ${Lp.rtlt.toFixed(3)} s`);
  const net = evs.find((e) => e.key === 'NET');
  check('ağ devri (NSN → DSN) aracın Dünya\'dan 35.406 km geçtiği anda', !!net && Math.abs(norm(hermAt(net.t)) - G.HANDOVER_KM) < 5, net ? `${E.utcString(net.t)}, ${norm(hermAt(net.t)).toFixed(1)} km` : '');
  check('olaylar zaman sırasında, NaN yok', evs.every((e, i) => Number.isFinite(e.t) && (i === 0 || e.t >= evs[i - 1].t - 1)));
}

// ---------------------------------------------------------------- 4) bağımsız 1 s örnekleme: olay anları
{
  // ayrı gerçekleme: DSS-63 → araç doğrusu Ay'a değiyor mu (ışın–küre), araç umbra/penumbra ortası mı (Güneş merkezinin görünür olup olmadığı: Güneş yönündeki ışın)
  const occ = (t) => { const M_ = E.earthIcrfToItrf(t), p = mtv(M_, G.DSN[2].ecf), r = hermAt(t), d = sub(r, p), L = norm(d), u = scale(d, 1 / L), w = sub(E.moonPos(t), p), s = dot(w, u); return s > 0 && s < L && norm(sub(w, scale(u, s))) < E.R_M; };
  const sunHidden = (t) => { const r = hermAt(t), sv = unit(sub(E.sunPos(t), r)); for (const [c, R] of [[[0, 0, 0], E.R_E], [E.moonPos(t), E.R_M]]) { const w = sub(c, r), s = dot(w, sv); if (s > 0 && norm(sub(w, scale(sv, s))) < R) return true; } return false; };
  let worstL = 0, worstS = 0, nL = 0, nS = 0;
  for (const e of evs) {
    if ((e.key === 'LOS' && e.from === 'DSS-63') || (e.key === 'AOS' && e.to === 'DSS-63')) {
      const want = e.key === 'LOS'; let tt = null;
      for (let t = e.t - 30; t <= e.t + 30; t += 1) if (occ(t) === want && occ(t - 1) !== want) { tt = t; break; }
      if (tt != null) { worstL = Math.max(worstL, Math.abs(tt - e.t)); nL++; }
    }
    if (e.key === 'ECL_IN' || e.key === 'ECL_OUT') {
      const want = e.key === 'ECL_IN'; let tt = null;
      for (let t = e.t - 30; t <= e.t + 30; t += 1) if (sunHidden(t) === want && sunHidden(t - 1) !== want) { tt = t; break; }
      if (tt != null) { worstS = Math.max(worstS, Math.abs(tt - e.t)); nS++; }
    }
  }
  check('LOS/AOS anları (Madrid, Ay engeli) bağımsız 1 s örneklemeyle ±1,5 s', nL >= 6 && worstL <= 1.5, `${nL} olay, en kötü ${worstL.toFixed(1)} s`);
  check('gölge giriş/çıkış anları bağımsız ışın (Güneş merkezi) örneklemesiyle ±1,5 s', nS >= 8 && worstS <= 1.5, `${nS} olay, en kötü ${worstS.toFixed(1)} s`);
}

// ---------------------------------------------------------------- 5) öngörü (worker'daki gibi itkisiz N-cisim) ↔ gerçekleşen
{
  const x = rec.find((q) => q.t >= ev('LOI_END').t + 1 && !(q.thr > 0));
  const Q = new E.Propagator(new E.State(x.t, x.r, x.v, 'E'), E.dummyVehicle(), 60, 1.0, { nbody: true }), pts = [{ t: x.t, r: x.r, v: x.v }];
  Q.onStep = (P) => { const [r, v] = P.s.geo(); pts.push({ t: P.s.t, r, v }); };
  Q.runUntil(tDoi - 60);
  const pred = G.scanPath(pts).filter((e) => e.key !== 'HANDOVER'), real = evs.filter((e) => e.t > x.t && e.t < tDoi - 60 && e.key !== 'HANDOVER');
  const worst = pred.length === real.length ? Math.max(...pred.map((e, i) => (e.key === real[i].key ? Math.abs(e.t - real[i].t) : Infinity))) : Infinity;
  check('öngörü: LLO\'da beklenen LOS/AOS ve gölge olayları gerçekleşenlerle aynı (±3 s)', pred.length >= 6 && worst < 3, `${pred.length} olay, en kötü ${worst.toFixed(2)} s`);
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
