// Saptırma iş parçacığı: DeflectEngine'i (deflect.js) arayüzden bağımsız koşturur.
//   target  : asteroidin öğeleri -> başlangıç durumu, yakın geçiş taraması (Dünya'ya < 0,05 AB)
//   deflect : seçilen yakın geçiş için itki senaryosu -> doğrusal (STM) + doğrusal olmayan sonuç, önceden uyarı süresi eğrisi, 3B yollar
import * as D from './deflect.js';

let eng = null, T = null, busy = 0;
const ready = fetch(new URL('../data/de440s.bsp', import.meta.url)).then((r) => r.arrayBuffer()).then((b) => { eng = new D.DeflectEngine(b); });
const post = (m) => postMessage(m);

function addV(y, dv) { const z = Float64Array.from(y); z[3] += dv[0]; z[4] += dv[1]; z[5] += dv[2]; return z; }
function stateAt(et) {                              // T.y0 (T.et0) -> et
  if (Math.abs(et - T.et0) < 1e-6) return Float64Array.from(T.y0);
  return eng.integrate(T.et0, T.y0, et).y;
}
function helioRV(et, y) { const [ps, vs] = eng.sun(et); return [[y[0] - ps[0], y[1] - ps[1], y[2] - ps[2]], [y[3] - vs[0], y[4] - vs[1], y[5] - vs[2]]]; }
// en büyük tekil değerin sağ tekil vektörü (SᵀS'in baskın özvektörü, kuvvet yöntemi)
function bestDir(S) {
  const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => S[0][i] * S[0][j] + S[1][i] * S[1][j]));
  let x = [1, 0.3, 0.2];
  for (let k = 0; k < 200; k++) { const y = [0, 1, 2].map((i) => A[i][0] * x[0] + A[i][1] * x[1] + A[i][2] * x[2]); const n = Math.hypot(...y); x = y.map((v) => v / n); }
  return x;
}
const S23 = (J, Phi) => [0, 1].map((r) => [0, 1, 2].map((c) => J[r].reduce((s, jk, k) => s + jk * Phi[k][3 + c], 0)));
const apply = (S, d) => [S[0][0] * d[0] + S[0][1] * d[1] + S[0][2] * d[2], S[1][0] * d[0] + S[1][1] * d[1] + S[1][2] * d[2]];

// yakın geçişi bul: nominal CA zamanına en yakın yerel minimum
function findCa(et0, y0, caEt, opt = {}) {
  const sc = eng.scan(et0, y0, caEt + 40 * D.DAY, { maxDist: 0.2 * D.AU, ...opt });
  if (!sc.list.length) return null;
  return sc.list.reduce((a, b) => (Math.abs(a.et - caEt) < Math.abs(b.et - caEt) ? a : b));
}
function geoPath(et0, y0, etA, etB, n, thrust, cuts) {
  const out = [], stops = [];
  for (let k = 0; k < n; k++) stops.push(etA + (etB - etA) * k / (n - 1));
  let et = et0, y = y0;
  for (const s of stops) {
    if (s < et) continue;
    const r = eng.integrateSegments(et, y, s, { thrust, cuts }); et = r.et; y = r.y;
    const [pE] = eng.earth(et); out.push(y[0] - pE[0], y[1] - pE[1], y[2] - pE[2]);
  }
  return out;
}

globalThis.onmessage = async (ev) => {
  const d = ev.data;
  await ready;
  const id = d.id, my = ++busy, stopped = () => my !== busy;
  try {
    if (d.cmd === 'target') {
      const el = d.el, etEp = D.etFromJd(el.epoch);
      if (!(d.etStart > D.ET_MIN && d.etStart < D.ET_MAX)) throw new Error('başlangıç tarihi 1850–2149 dışında');
      const [r, v] = D.keplerHelio(el, etEp), [ps, vs] = eng.sun(etEp);
      const yEp = [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]];
      post({ type: 'progress', id, msg: 'Başlangıç anına taşınıyor…', f: 0.02 });
      const y0 = eng.integrate(etEp, yEp, d.etStart).y;
      const et1 = Math.min(D.ET_MAX, d.etStart + d.years * D.YEAR);
      const T0 = performance.now();
      const sc = eng.scan(d.etStart, y0, et1, { maxDist: 0.05 * D.AU, stopped,
        onProgress: (f) => post({ type: 'progress', id, msg: `Yakın geçişler taranıyor… %${Math.round(100 * f)}`, f }) });
      if (stopped()) return;
      T = { el, et0: d.etStart, y0, name: d.name, cas: sc.list };
      const cas = sc.list.map((c) => { const b = eng.bplaneAt(c); return { et: c.et, dist: c.dist, vrel: c.vrel, bp: b && { xi: b.xi, zeta: b.zeta, b: b.b, bE: b.bE, rp: b.rp, vinf: b.vinf, impact: b.impact } }; });
      post({ type: 'target', id, cas, et0: d.etStart, et1, ms: performance.now() - T0, steps: sc.steps });
      return;
    }
    if (d.cmd === 'deflect') {
      if (!T) throw new Error('önce hedef seçin');
      const p = d.p, ca = T.cas[p.ca]; if (!ca) throw new Error('yakın geçiş yok');
      const M = p.M, etA = p.etApply;
      if (!(etA < ca.et - 3600)) throw new Error('itki, yakın geçişten önce olmalı');
      post({ type: 'progress', id, msg: 'Nominal yörünge ve durum geçiş matrisi…', f: 0.1 });
      const yA = stateAt(etA);
      const Phi = eng.stm(etA, yA, ca.et, [], { stopped })[0].Phi;
      const { b0, J } = eng.bplanePartials(ca), S = S23(J, Phi);           // km / (km/s)
      const [rh, vh] = helioRV(etA, yA);
      // itki yönü
      let dir;
      if (p.dir === 'best') {
        dir = bestDir(S);
        const g = apply(S, dir), Bn = [b0.xi, b0.zeta];
        if (!p.hypo ? g[0] * Bn[0] + g[1] * Bn[1] < 0 : dir[0] * vh[0] + dir[1] * vh[1] + dir[2] * vh[2] < 0) dir = dir.map((x) => -x);
      } else dir = D.dirVector(p.dir, rh, vh);
      // büyüklük
      let dvKms, thrust = null, cuts = [], tEnd = etA, Fn = 0;
      if (p.method === 'kinetic') dvKms = D.kineticDv(p.m, p.U, p.beta, M) / 1000;
      else {
        const aKms = p.F / M / 1000, dur = p.days * D.DAY; tEnd = etA + dur; Fn = p.F;
        if (tEnd >= ca.et - 3600) throw new Error('itki süresi yakın geçişe kadar bitmeli');
        dvKms = aKms * dur; cuts = [etA, tEnd];
        const follow = p.dir !== 'best';
        thrust = (et, y) => {
          if (et < etA || et > tEnd) return null;
          if (!follow) return [dir[0] * aKms, dir[1] * aKms, dir[2] * aKms];
          const [r2, v2] = helioRV(et, y), u = D.dirVector(p.dir, r2, v2); return [u[0] * aKms, u[1] * aKms, u[2] * aKms];
        };
      }
      const dv = dir.map((x) => x * dvKms);
      const lin = apply(S, dv);
      // doğrusal olmayan: saptırılmış yörüngeyle yeni yakın geçiş
      post({ type: 'progress', id, msg: 'Saptırılmış yörünge tümleniyor…', f: 0.35 });
      const yD = p.method === 'kinetic' ? addV(yA, dv) : yA;
      const ca2 = findCa(etA, yD, ca.et, { thrust, cuts, stopped });
      if (stopped()) return;
      const b2 = ca2 && eng.bplaneAt(ca2);
      const dXi = b2 ? b2.xi - b0.xi : lin[0], dZeta = b2 ? b2.zeta - b0.zeta : lin[1];
      const sens = Math.hypot(...apply(S, dir));                            // km kayma / (km/s)
      // önceden uyarı süresi eğrisi: aynı Δv, farklı itki anları (STM)
      post({ type: 'progress', id, msg: 'Önceden uyarı süresi eğrisi…', f: 0.6 });
      const leadMax = Math.min(ca.et - T.et0, 30 * D.YEAR), grid = [];
      for (let k = 0; k < 48; k++) grid.push(ca.et - Math.exp(Math.log(D.DAY) + (Math.log(leadMax) - Math.log(D.DAY)) * k / 47));
      grid.sort((a, b) => a - b);
      const etS = grid[0] - 1, yS = stateAt(etS);
      const recs = eng.stm(etS, yS, ca.et, grid, { stopped });
      if (stopped()) return;
      const PhiCa = recs[recs.length - 1].Phi, sweep = [];
      for (const rc of recs.slice(0, -1)) {
        const Pk = D.matMul6(PhiCa, D.matInv6(rc.Phi)), Sk = S23(J, Pk);
        const [r3, v3] = helioRV(rc.et, rc.y);
        let dk = p.dir === 'best' ? bestDir(Sk) : D.dirVector(p.dir, r3, v3);
        const g = apply(Sk, dk);
        sweep.push({ lead: (ca.et - rc.et) / D.DAY, shift: Math.hypot(...g) * dvKms, dvReq: b0.bE / Math.hypot(...g) * 1000 });
      }
      // 3B: yakın geçiş çevresinde Dünya merkezli yollar (±4 gün)
      post({ type: 'progress', id, msg: 'Yollar çiziliyor…', f: 0.85 });
      const W = 4 * D.DAY, n = 241, caD = ca2 || ca;
      const pathN = geoPath(etA, yA, ca.et - W, ca.et + W, n, null, []);
      const pathD = geoPath(etA, yD, caD.et - W, caD.et + W, n, thrust, cuts);
      const oc = D.orbitChange(rh, vh, dv);
      post({ type: 'deflect', id, r: {
        ca: { et: ca.et, dist: ca.dist, vrel: ca.vrel }, b0: { xi: b0.xi, zeta: b0.zeta, b: b0.b, bE: b0.bE, rp: b0.rp, vinf: b0.vinf, impact: b0.impact },
        after: b2 ? { et: ca2.et, dist: ca2.dist, xi: b2.xi, zeta: b2.zeta, b: b2.b, rp: b2.rp, impact: b2.impact } : null,
        dXi, dZeta, lin: { dXi: lin[0], dZeta: lin[1] }, dvMps: dvKms * 1000, dir, M, Fn, dtCa: ca2 ? ca2.et - ca.et : null,
        sensKmPerMps: sens / 1000, dvReqMps: b0.bE / sens * 1000, dvReqHypoMps: b0.bE / sens * 1000,
        FreqN: p.method === 'thrust' ? M * (b0.bE / sens * 1000) / (p.days * D.DAY) : null,
        orbit: { da: oc.da, dP: oc.dP, de: oc.de, di: oc.di, a0: oc.before.a, P0: oc.before.P },
        sweep, pathN, pathD, leadDays: (ca.et - etA) / D.DAY } });
      return;
    }
  } catch (err) {
    post({ type: 'error', id, msg: String(err.message || err) });
  }
};
