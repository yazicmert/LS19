// Araç yönelimi doğrulaması — KİNEMATİK model (Mission({ attitude: 'kin' }): hız sınırlı, torksuz) (Node 20+): cd web && node test/test_attitude.js
//  Varsayılan model 6 serbestlik dereceli rijit cisimdir (Dyn6, bkz. test/test_dynamics6.js); kinematik model hafif seçenek ve çapraz kontrol olarak korunur.
//  1) attitude.js: dönme matematiği, açısal hız sınırı, aşım yok, tam ters komutta tekillik yok, yuvarlanma sürekliliği (dönme = yalnız eksen kayması)
//  2) Propagator: yönelim yokken eski davranış birebir; yönelim varken itki gerçek eksen boyunca, hizalıyken aynı sonuç, hizasızken gecikmeli
//  3) Tam görev (altı profil arasından Apollo, NRHO; tek ve iki kademeli araç; ZEM/ZEV, dengeli, serbest): kuaterniyon birim, açısal hız ≤ kademe sınırı, her adımda dönme = eksen kayması
//     (yuvarlanma sıçramaz, 360° döngü olmaz), ateşlemede yönelim hizası, inişte itki aşağı yönde değil, temasta dik, toplam dönüş makul
//  4) Ayrılan kademeler: sıra ve tür (TLI kademesi, iki kademeli inişte Ay yörünge kademesi), ayrılma anındaki yönelimi eylemsiz sabit tutar
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { qMul, qRot, qAxisAngle, qAngle, vAngle, qSlerp, qFromZ, attStep, Attitude, Z_AXIS, D2R } from '../js/attitude.js';
import { makeLive } from '../js/live.js';
import { Mission, twoStageDesign, siteIcrf, R_SITE } from '../js/mission.js';
import { initConic } from '../js/conic.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const { sub, dot, norm, unit, cross, scale } = E;
const DEG = 180 / Math.PI, angBetween = vAngle;

// ---------------------------------------------------------------- 1) attitude.js
{
  // dönme: eksen-açı kuaterniyonu ile vektör döndürme, matris dönmesiyle aynı
  const q = qAxisAngle(unit([1, 2, 3]), 0.7), v = [0.3, -1.1, 0.8], r = qRot(q, v), k = unit([1, 2, 3]);
  const c = Math.cos(0.7), s = Math.sin(0.7), rod = [0, 1, 2].map((i) => v[i] * c + cross(k, v)[i] * s + k[i] * dot(k, v) * (1 - c));        // Rodrigues
  check('kuaterniyon dönmesi = Rodrigues dönmesi; çarpım birleşir; norm korunur', norm(sub(r, rod)) < 1e-12 && norm(sub(qRot(qMul(q, q), v), qRot(qAxisAngle(k, 1.4), v))) < 1e-12 && Math.abs(Math.hypot(...qMul(q, q)) - 1) < 1e-12,
    `fark ${norm(sub(r, rod)).toExponential(1)}`);
  // hız sınırı ve aşımsız yaklaşma: 90° komut, 15°/s, τ = 0.8 s, adım 0.2 s
  let qq = qFromZ([1, 0, 0], [0, 0, 1]); const cmd = [0, 1, 0], prm = { rate: 15 * D2R, tau: 0.8, snap: 0.5 * D2R };
  let prevTh = Infinity, maxRate = 0, mono = true, tSnap = null, t = 0;
  for (let i = 0; i < 400; i++) {
    const A = attStep(qq, cmd, 0.2, prm); t += 0.2;
    maxRate = Math.max(maxRate, qAngle(qq, A.q) / 0.2); if (A.theta > prevTh + 1e-12) mono = false; prevTh = A.theta; qq = A.q;
    if (tSnap === null && A.theta <= prm.snap) tSnap = t;
  }
  const fin = angBetween(qRot(qq, Z_AXIS), cmd);
  check('açısal hız sınırı (15°/s), açı hatası tekdüze azalır (aşım yok), komuta tam oturur', maxRate <= 15 * D2R * (1 + 1e-9) + 1e-12 && mono && fin < 1e-9 && tSnap !== null && tSnap < 8,
    `azami hız ${(maxRate * DEG).toFixed(2)}°/s, ${tSnap} s'de ≤ 0,5° içinde, son hata ${fin.toExponential(1)} rad`);
  // tam ters komut (180°): tekillik yok; dönme sürekli ve tek yönlü azalır
  qq = qFromZ([1, 0, 0], [0, 0, 1]); let th = Math.PI, ok180 = true, steps = 0;
  for (let i = 0; i < 400 && th > 1e-6; i++) { const A = attStep(qq, [-1, 0, 0], 0.2, prm); if (A.phi === 0 && A.theta > 1e-6) ok180 = false; if (A.theta > th + 1e-12) ok180 = false; qq = A.q; th = angBetween(qRot(qq, Z_AXIS), [-1, 0, 0]); steps++; }
  check('tam ters komut (180°) tekilliksiz: dönme tamamlanır', ok180 && th < 1e-6, `${steps} adım, son hata ${th.toExponential(1)}`);
  // yuvarlanma sürekliliği: komut düşey (ref) eksenden geçen büyük daire boyunca süpürülür; her adımda toplam dönme = eksen kayması
  qq = qFromZ([1, 0, 0], [0, 0, 1]); let worst = 0, n = 0;
  for (let i = 0; i <= 3600; i++) {
    const a = (i / 3600) * 2 * Math.PI, cm = [Math.cos(a), 0, Math.sin(a)];                       // x–z düzleminde tam tur (düşey [0,0,1] ve ters yönü dahil)
    const A = attStep(qq, cm, 0.1, { rate: 1e3, tau: 0.8, snap: 0.5 * D2R }), z0 = qRot(qq, Z_AXIS), z1 = qRot(A.q, Z_AXIS);
    worst = Math.max(worst, Math.abs(qAngle(qq, A.q) - angBetween(z0, z1))); qq = A.q; n++;
  }
  check('yuvarlanma sıçramaz: eksen düşeyden (ve tam turdan) geçerken her adımda dönme = eksen kayması', worst < 1e-7, `${n} adım, en büyük fark ${worst.toExponential(1)} rad`);
  // slerp: uç noktalar, ara değer yarı dönme
  const qa = qAxisAngle([0, 0, 1], 0.2), qb = qAxisAngle([0, 0, 1], 1.2), qm = qSlerp(qa, qb, 0.5);
  check('qSlerp: uçlar, ara değer, işaret tersi (q ≡ −q) en kısa yay', qAngle(qSlerp(qa, qb, 0), qa) < 1e-12 && qAngle(qSlerp(qa, qb, 1), qb) < 1e-12 && Math.abs(qAngle(qa, qm) - 0.5) < 1e-12 && Math.abs(qAngle(qa, qSlerp(qa, qb.map((x) => -x), 0.5)) - 0.5) < 1e-12,
    `yarım açı ${qAngle(qa, qm).toFixed(6)} rad`);
}

// ---------------------------------------------------------------- 2) Propagator ve yönelim
await initConic();
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
{
  makeLive(SPK, PCK, eo, ALL.tStart);
  const t0 = ALL.profiles.APOLLO.design.INS ? ALL.profiles.APOLLO.design.INS.t : 1083171.07, rp = E.R_E + 400, vc = Math.sqrt(E.MU_E / rp);
  const veh = () => new E.Vehicle([{ name: 'k', dry: 1000, prop: 500, T: 5, isp: 320, thr_min: 0 }]);          // 5 kN, ~15°/s sınıfı (T < 50 kN)
  const mk = (att) => { const P = new E.Propagator(new E.State(t0, [rp, 0, 0], [0, vc, 0], 'N'), veh(), 30, 0.5, { nbody: true }); if (att) P.att = new Attitude(att.axis, att.ref); return P; };
  const dir = [0, 1, 0], burn = () => [1.0, dir];
  // (a) yönelim yok: eski davranış; (b) yönelim hizalı: aynı sonuç
  const A = mk(null), B = mk({ axis: dir, ref: [1, 0, 0] });
  A.runUntil(t0 + 40, burn); B.runUntil(t0 + 40, burn);
  check('hizalı yönelim itki sonucunu değiştirmez (yönelimsiz ile aynı durum)', norm(sub(A.s.r, B.s.r)) < 1e-9 && norm(sub(A.s.v, B.s.v)) < 1e-12 && Math.abs(A.dvUsed - B.dvUsed) < 1e-12,
    `Δr ${norm(sub(A.s.r, B.s.r)).toExponential(1)} km, Δv ${norm(sub(A.s.v, B.s.v)).toExponential(1)} km/s`);
  // (c) hizasız (90°): itki gerçek eksen boyunca, hız sınırlı döner; Δv, komuta göre gecikmeli
  const C = mk({ axis: [1, 0, 0], ref: [0, 0, 1] }), samp = [], Cc = mk({ axis: [1, 0, 0], ref: [0, 0, 1] });
  let dvExp = [0, 0, 0];                                                                    // kayıtlı gerçek eksenlerden beklenen itki Δv'si (km/s): Σ (T/m_orta) h ekseni
  C.onStep = (P, h, thr, u) => { const st = P.veh.active, mMid = P.veh.mass() + 0.5 * (thr > 0 ? thr * st.T / (st.isp * E.G0) * h : 0), a = (thr * st.T) / mMid;
    dvExp = [0, 1, 2].map((i) => dvExp[i] + a * h * P.lastU[i]); samp.push({ t: P.s.t, q: P.att.q.slice(), th: P.lastTheta }); };
  C.runUntil(t0 + 40, burn); Cc.runUntil(t0 + 40);                                          // Cc: itkisiz süzülme (yerçekimi etkisini ayırmak için)
  let maxR = 0, tAlign = null; for (let i = 1; i < samp.length; i++) { const dt = samp[i].t - samp[i - 1].t; if (dt > 1e-6) maxR = Math.max(maxR, qAngle(samp[i - 1].q, samp[i].q) / dt); if (tAlign === null && samp[i].th <= 0.5 * D2R) tAlign = samp[i].t - t0; }
  const dvThr = sub(C.s.v, Cc.s.v), lag = angBetween(dvThr, dir), rel = norm(sub(dvThr, dvExp)) / norm(dvExp);
  check('hizasız ateşleme: açısal hız ≤ 15°/s, ≈ 8 s içinde hizalanır, itki Δv\'si gerçek eksenlerin toplamına uyar (% 1 içinde) ve komutun gerisindedir',
    maxR <= 15 * D2R * (1 + 1e-6) && tAlign > 1 && tAlign < 9 && rel < 0.01 && lag > 1 * D2R && lag < 15 * D2R,
    `azami hız ${(maxR * DEG).toFixed(2)}°/s, hizalanma ${tAlign?.toFixed(1)} s, Δv yönü komuttan ${(lag * DEG).toFixed(2)}° geride, ölçülen ↔ eksenlerden beklenen Δv ${(rel * 100).toFixed(3)} %`);
}

// ---------------------------------------------------------------- 3) tam görevler
const fly = (D, landing) => {
  E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing, attitude: 'kin' }); M.P.tLimit = Infinity;
  const rec = []; M.P.onStep = (P, h, thr) => rec.push({ t: P.s.t, h, thr, k: M.veh.k, ph: P.phase, q: P.att.q.slice(), u: P.lastU.slice(), th: P.lastTheta, r: P.s.geo()[0], v: P.s.geo()[1], rs: P.s.seleno()[0] });
  for (;;) { if (M.gen.next().done) break; }
  return { M, rec };
};
const cases = [['APOLLO', 'zem', false], ['APOLLO', 'opt', false], ['APOLLO', 'free', false], ['APOLLO', 'opt', true], ['APOLLO', 'zem', true], ['NRHO', 'opt', true]];
for (const [name, mode, two] of cases) {
  const D0 = ALL.profiles[name].design, D = two ? twoStageDesign(D0) : D0, { M, rec } = fly(D, mode), R = M.result;
  const label = `${name} ${mode}, ${two ? 'iki' : 'tek'} kademeli`;
  const rate = D.STAGES.map((st) => E.attParams(st).rate);
  // kuaterniyon normu ve açısal hız (adım başına dönme / süre)
  let nrm = 0, worstRate = 0, worstTwist = 0, bigStep = 0, rateOver = 0;
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i], dt = b.t - a.t; nrm = Math.max(nrm, Math.abs(Math.hypot(...b.q) - 1));
    if (dt <= 1e-6) continue;
    const rot = qAngle(a.q, b.q), sw = angBetween(qRot(a.q, Z_AXIS), qRot(b.q, Z_AXIS)), lim = rate[b.k] * (1 + 1e-6);
    worstTwist = Math.max(worstTwist, Math.abs(rot - sw)); bigStep = Math.max(bigStep, rot);
    if (dt > 0.05) { worstRate = Math.max(worstRate, rot / dt / rate[b.k]); if (rot / dt > lim + 1e-9) rateOver++; }
  }
  check(`${label}: kuaterniyonlar birim, açısal hız ≤ kademe sınırı, her adımda dönme = eksen kayması (yuvarlanma sıçramaz, döngü yok)`, nrm < 1e-12 && rateOver === 0 && worstTwist < 1e-7,
    `norm sapması ${nrm.toExponential(1)}, azami hız/sınır ${worstRate.toFixed(3)}, en büyük yuvarlanma sıçraması ${worstTwist.toExponential(1)} rad, ${rec.length} adım`);
  // ateşleme hizası: her yakışın ilk itkili adımında yönelim hatası
  let prev = 0, worstIgn = 0, nIgn = 0; const igns = [];
  for (const r of rec) { if (r.thr > 0 && prev === 0) { nIgn++; igns.push(`${r.ph} ${(r.th * DEG).toFixed(2)}°`); if (r.ph !== 'PDI') worstIgn = Math.max(worstIgn, r.th); } prev = r.thr > 0 ? 1 : 0; }
  const pdiIgn = rec.find((r) => r.ph === 'PDI' && r.thr > 0).th;
  check(`${label}: yakışlar hizalı başlar (TLI/MCC/LOI/NRI/DOI hata ≤ 0,5°; PDI ≤ 5°)`, nIgn >= 5 && worstIgn <= 0.5 * D2R && pdiIgn <= 5 * D2R, `${nIgn} yakış: ${igns.join(', ')}`);
  // inişte (irtifa < 2 km) itki yatayın altında değil; toplam dönüş makul; temasta dik
  const tPdi = M.events.find((e) => e.key === 'PDI').t, land = rec.filter((r) => r.t >= tPdi), altOf = (r) => norm(r.rs) - R_SITE;
  let down = 0; for (const r of land) if (r.thr > 0 && altOf(r) < 2 && dot(unit(r.u), unit(siteIcrf(r.t))) <= 0) down++;
  let tot = 0, term = 0; for (let i = 1; i < land.length; i++) { const a = qAngle(land[i - 1].q, land[i].q) * DEG; tot += a; if (land[i].ph === 'SON_INIS') term += a; }
  const last = rec[rec.length - 1], upErr = angBetween(qRot(last.q, Z_AXIS), siteIcrf(last.t)) * DEG;
  const termLim = mode === 'opt' ? 60 : 400;
  check(`${label}: iniş yumuşak (dikey ${R.v_mps[2].toFixed(2)} m/s), itki 2 km altında aşağı yönde değil, toplam dönüş ≤ 400° (son iniş ≤ ${termLim}°), temasta dik`,
    R.ok && Math.abs(R.v_mps[2]) < 1.5 && Math.hypot(R.v_mps[0], R.v_mps[1]) < 0.5 && down === 0 && tot < 400 && term < termLim && upErr < 0.1,
    `kalan yakıt ${R.prop.toFixed(0)} kg, aşağı itkili adım ${down}, iniş dönüşü ${tot.toFixed(0)}° (son iniş ${term.toFixed(0)}°), temasta dikeyden ${upErr.toFixed(3)}°`);
  // ayrılan kademeler
  const kinds = M.debris.map((d) => d.kind), want = two ? ['tli', 'orb'] : ['tli'];
  const frozen = M.debris.every((d) => d.q && Math.abs(Math.hypot(...d.q) - 1) < 1e-12);
  // ayrılma itkisi kademenin kendi ekseni boyunca, araçtan uzağa: enkaz hızı − araç hızı = −0,5 m/s · eksen (ayrıldığı andaki yönelimle). Enkaz yayınımı ilerletilmedi: başlangıç durumu
  let sepErr = 0, sepAlong = []; for (const d of M.debris) {
    const iv = rec.findIndex((r) => r.t === d.t), dv = sub(d.P.s.v, rec[iv].v), ax = qRot(d.q, Z_AXIS);
    sepErr = Math.max(sepErr, norm(sub(dv, scale(ax, -0.0005)))); sepAlong.push(`${d.kind} ${(dot(dv, unit(rec[iv].v)) * 1000).toFixed(2)} m/s`);
  }
  const sepOk = sepErr < 1e-12 && (!two || dot(sub(M.debris[1].P.s.v, rec[rec.findIndex((r) => r.t === M.debris[1].t)].v), unit(rec[rec.findIndex((r) => r.t === M.debris[1].t)].v)) > 0);       // iki kademeli inişte yörünge kademesi önde (ters yönelim), ileriye ayrılır
  const sepEv = M.events.filter((e) => e.key === 'SEP' || e.key === 'SEP2').map((e) => e.key);
  check(`${label}: ayrılan kademeler sırayla ${want.join(' → ')} (${two ? 'SEP, SEP2' : 'SEP'} olayları), ayrıldığı andaki yönelimi taşır, ayrılma itkisi kendi ekseni boyunca araçtan uzağa`, JSON.stringify(kinds) === JSON.stringify(want) && frozen && sepOk && JSON.stringify(sepEv) === JSON.stringify(two ? ['SEP', 'SEP2'] : ['SEP']),
    `enkaz ${kinds.join(', ')}; olaylar ${sepEv.join(', ')}; ${M.debris.map((d) => `${d.name} t=${(d.t - M.t0).toFixed(0)} s`).join(', ')}; ayrılma Δv (hız yönünde): ${sepAlong.join(', ')}`);
}

// ---------------------------------------------------------------- 5) elle uçuş: seçili yön moduna (ters yön) itkisiz de dönülür; itki gerçek eksen boyunca, gecikmeli
{
  const D = ALL.profiles.APOLLO.design; E.setMoonZone(E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing: 'zem', attitude: 'kin' }); M.attachHistory(); M.P.tLimit = Infinity;
  const tStart = D.TLI.t_ign + D.TLI.x[1] + 2400, now = () => 0;                      // TLI'dan sonra, TLI kademesi ayrıldıktan sonra (iniş aracı sınıfı, 15°/s)
  M.advance(tStart, 1e9, null, now);
  M.setAuto(false, M.P.s.t);
  const P = M.P, pro = () => M.manualDir('PRO'), retro = () => M.manualDir('RETRO');
  const rec = []; const push0 = P.onStep; P.onStep = (...a) => { push0(...a); rec.push({ t: P.s.t, q: P.att.q.slice(), thr: P.lastThr }); };
  const a0 = angBetween(qRot(P.att.q, Z_AXIS), pro());
  // (a) itkisiz: ters yön komutu → yönelim ≈ 14 s içinde ters yöne oturur, hız sınırı 15°/s
  const t0 = P.s.t, v0 = P.s.v.slice(); M.advance(t0 + 40, 1e9, () => [0, retro()], now);
  const coastRate = rec.reduce((m, r, i) => (i && r.t - rec[i - 1].t > 0.05 ? Math.max(m, qAngle(rec[i - 1].q, r.q) / (r.t - rec[i - 1].t)) : m), 0);
  const a1 = angBetween(qRot(P.att.q, Z_AXIS), retro());
  check('elle uçuş, itkisiz: ters yön komutuna hız sınırıyla dönülür (≤ 15°/s), 40 s sonra hizalı; başlangıçta ileri yönelimliydi',
    a0 < 1 * D2R && coastRate <= 15 * D2R * (1 + 1e-6) && coastRate > 5 * D2R && a1 < 0.5 * D2R, `başlangıç hatası ${(a0 * DEG).toFixed(3)}°, azami hız ${(coastRate * DEG).toFixed(2)}°/s, 40 s sonra ters yönden ${(a1 * DEG).toFixed(3)}°`);
  // (b) itkili: başka bir moda (ileri) dönerken itki gerçek eksen boyunca; ilk saniyelerde ters yönde değil ileri yönde Δv, sonra ters
  rec.length = 0; const t1 = P.s.t, vA = P.s.v.slice(), ctrl = () => [1.0, pro()];
  const prog = [], hook = P.onStep; P.onStep = (...a) => { hook(...a); prog.push({ t: P.s.t - t1, v: P.s.v.slice() }); };
  M.advance(t1 + 40, 1e9, ctrl, now);
  const along = (v) => dot(sub(v, vA), unit(vA)), dvEarly = along(prog.find((r) => r.t >= 5).v), dvLate = along(P.s.v);
  check('elle uçuş, itkili: ters yönelimden ileri komuta dönerken itki gerçek eksen boyunca (ilk 5 s’de ters yönde Δv, sonra ileri)', dvEarly < -0.002 && dvLate > 0.02 && angBetween(qRot(P.att.q, Z_AXIS), pro()) < 0.5 * D2R,
    `5 s'de hız yönünde Δv ${(dvEarly * 1000).toFixed(1)} m/s, 40 s'de ${(dvLate * 1000).toFixed(1)} m/s, son yönelim hatası ${(angBetween(qRot(P.att.q, Z_AXIS), pro()) * DEG).toFixed(3)}°`);
}

console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
