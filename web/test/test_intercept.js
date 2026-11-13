// Önleme görevi (intercept.js, lambert.js, rockets.js › c3Capacity):
//   1) DART: 24 Kasım 2021 fırlatma → 26 Eylül 2022 Didymos çarpması; Lambert çarpma hızı ölçülen 6,1449 km/s ile karşılaştırılır
//   2) C3 → yük kapasitesi: TLI (C3 = −2) değeriyle aynı, C3 arttıkça azalır
//   3) porkchop: Apophis 2029 için örgü; en iyi hücrenin öngördüğü B-düzlemi kayması, Δv'yi o anda uygulayıp yakın geçişe tam tümlemeyle aynı
import fs from 'fs';
import * as D from '../js/deflect.js';
import { porkchop, transfer } from '../js/intercept.js';
import { c3Capacity, tliCapacity, ROCKET_IDS } from '../js/rockets.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const ab = (f) => { const b = fs.readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eng = new D.DeflectEngine(ab('../data/de440s.bsp'));
const iso = (s) => D.etFromJd(Date.parse(s) / 864e5 + 2440587.5) + 69.184;
const helio = (et, y) => { const [ps, vs] = eng.sun(et); return [[y[0] - ps[0], y[1] - ps[1], y[2] - ps[2]], [y[3] - vs[0], y[4] - vs[1], y[5] - vs[2]]]; };
const earthH = (et) => { const [pE, vE] = eng.earth(et), [ps, vs] = eng.sun(et); return [[pE[0] - ps[0], pE[1] - ps[1], pE[2] - ps[2]], [vE[0] - vs[0], vE[1] - vs[1], vE[2] - vs[2]]]; };
const startOf = (el) => { const et = D.etFromJd(el.epoch), [r, v] = D.keplerHelio(el, et), [ps, vs] = eng.sun(et); return { et, y: [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]] }; };

// ---------------------------------------------------------------- 1) DART
{
  const neo = JSON.parse(fs.readFileSync(new URL('./fixtures/sb_neo.json', import.meta.url))), f = neo.fields, row = neo.data.find((r) => r[0] === '65803');
  const g = (k) => +row[f.indexOf(k)], s = startOf({ a: g('a'), e: g('e'), i: g('i'), om: g('om'), w: g('w'), ma: g('ma'), epoch: g('epoch') });
  const etL = iso('2021-11-24T06:21Z'), etA = iso('2022-09-26T23:14Z'), yA = eng.integrate(s.et, s.y, etA).y, [rA, vA] = helio(etA, yA), [rE, vE] = earthH(etL);
  const t = transfer(rE, vE, rA, vA, etA - etL);
  console.log(`  DART: C3 ${t.C3.toFixed(2)} km²/s², çarpma hızı ${t.U.toFixed(3)} km/s (ölçülen 6,1449)`);
  check(Math.abs(t.U - 6.1449) < 0.03 * 6.1449, 'DART: iki cisimli Lambert çarpma hızı ölçülenle %3 içinde (DART ara manevra yaptı)');
  check(t.C3 > 0 && t.C3 < 15, 'DART: kalkış enerjisi Falcon 9 ile ulaşılabilir aralıkta');
}

// ---------------------------------------------------------------- 2) C3 kapasitesi
{
  const ids = ROCKET_IDS.filter((id) => tliCapacity(id) > 0);
  check(ids.length >= 4 && ids.every((id) => Math.abs(c3Capacity(id, -2) - tliCapacity(id)) < 1e-6), 'C3 = −2 km²/s²: TLI kapasitesiyle aynı (' + ids.join(', ') + ')');
  check(ids.every((id) => c3Capacity(id, 0) > c3Capacity(id, 10) && c3Capacity(id, 10) > c3Capacity(id, 30) && c3Capacity(id, 1e4) === 0), 'kapasite C3 ile azalır, ulaşılamayan enerjide 0');
  check(c3Capacity('GENEL', 10) === null, 'başarımı yayımlanmamış (genel) kademe: kapasite yok');
}

// ---------------------------------------------------------------- 3) porkchop ↔ tam tümleme (Apophis 2029)
{
  const j = JSON.parse(fs.readFileSync(new URL('./fixtures/sbdb_99942.json', import.meta.url))), el = {};
  for (const x of j.orbit.elements) el[x.name] = +x.value;
  eng.ng = D.ngFromSbdb(j.orbit.model_pars);
  const s = startOf({ a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, epoch: +j.orbit.epoch }), et0 = iso('2026-11-13T00:00Z'), y0 = eng.integrate(s.et, s.y, et0).y;
  const ca = eng.scan(et0, y0, iso('2029-05-01T00:00Z'), { maxDist: 0.01 * D.AU }).list[0], { b0, J } = eng.bplanePartials(ca);
  const h = 8 * D.DAY, nK = Math.floor((ca.et - D.DAY - et0) / h) + 1, K = Array.from({ length: nK }, (_, k) => et0 + k * h), j0 = 4, nT = 60, nL = nK - j0;
  const recs = eng.stm(et0 - 1, eng.integrate(et0, y0, et0 - 1).y, ca.et, K.slice()), PhiCa = recs[recs.length - 1].Phi;
  const S = recs.slice(0, nK).map((rc) => { const P = D.matMul6(PhiCa, D.matInv6(rc.Phi)); return [0, 1].map((r) => [0, 1, 2].map((c) => J[r].reduce((a, jk, k) => a + jk * P[k][3 + c], 0))); });
  const AST = recs.slice(0, nK).map((rc) => helio(rc.et, rc.y)), L = K.slice(0, nL), EARTH = L.map(earthH);
  const t0 = performance.now(), M = 4e10;
  const pc = porkchop({ L, K, nT, kOf: (i, jj) => i + j0 + jj, earth: (i) => EARTH[i], ast: (k) => AST[k], S: (k) => S[k], cap: (c3) => c3Capacity('FH', c3), beta: 3.6, M, c3Max: 60 });
  const b = pc.best, finite = [...pc.shift].filter(Number.isFinite).length;
  console.log(`  örgü ${nL}×${nT} (${((performance.now() - t0) / 1000).toFixed(2)} s), çözüm ${finite}; en iyi: fırlatma ${new Date((D.jdFromEt(b.etL) - 2440587.5) * 864e5).toISOString().slice(0, 10)}, ${b.tofDays.toFixed(0)} gün, C3 ${b.C3.toFixed(1)}, U ${b.U.toFixed(2)} km/s, ${b.m.toFixed(0)} kg, Δv ${(b.dvMps * 1000).toFixed(3)} mm/s, kayma ${b.shift.toFixed(1)} km`);
  let valid = 0; for (let i = 0; i < nL; i++) valid += Math.max(0, Math.min(nT, nK - i - j0));                // varışı yakın geçişten önce olan hücreler
  check(finite > 0.25 * valid && b && b.shift === Math.max(...[...pc.shift].filter(Number.isFinite)), `geçerli hücrelerin önemli bir kısmında çözüm var (${finite}/${valid}, C3 ≤ 60); en iyi hücre en büyük kaymayı verir`);
  const tr = transfer(EARTH[b.i][0], EARTH[b.i][1], AST[b.k][0], AST[b.k][1], b.etA - b.etL);
  check(Math.abs(tr.C3 - b.C3) < 1e-9 && Math.abs(tr.U - b.U) < 1e-9 && Math.abs(c3Capacity('FH', b.C3) - b.m) < 1e-9, 'en iyi hücre: tek aktarım hesabıyla ve roket kapasitesiyle aynı');
  // Δv'yi çarpma anında uygula, yakın geçişe tam tümle
  const yA = eng.integrate(et0, y0, b.etA).y, dv = b.uDir.map((x) => x * b.dvMps / 1000), yD = Float64Array.from(yA); for (let k = 0; k < 3; k++) yD[3 + k] += dv[k];
  const ca2 = eng.scan(b.etA, yD, ca.et + 5 * D.DAY, { maxDist: 0.01 * D.AU }).list.reduce((a, c) => (Math.abs(c.et - ca.et) < Math.abs(a.et - ca.et) ? c : a)), b2 = eng.bplaneAt(ca2);
  const real = Math.hypot(b2.xi - b0.xi, b2.zeta - b0.zeta);
  console.log(`  tam tümleme: kayma ${real.toFixed(1)} km (öngörü ${b.shift.toFixed(1)} km)`);
  check(Math.abs(real - b.shift) < 0.03 * real + 0.5, 'öngörülen kayma (STM) tam tümlemeyle %3 içinde: yön ve birimler doğru');
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
