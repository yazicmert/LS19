// Rezonans çemberleri (keyhole.js) ve saptırmadan sonraki geçişler (labtext.js › verdictOf, laterRows):
//   1) Valsecchi formülü Apophis 2029 sonrası yarı büyük ekseni tam tümlemeyle verir (ζ ekseninin işaret kuralı dahil)
//   2) çember üzerindeki her nokta istenen rezonansa (a' = (k/h)^(2/3)) götürür
//   3) bir rezonans çemberine konan saptırılmış yörünge gerçekten k yıl sonra Dünya'ya yeniden yaklaşır
//   4) yargı: saptırma ileride çarpmaya yol açarsa "kırmızı"; nominaldeki ileriki çarpma kalkarsa "yeşil"
import fs from 'fs';
import * as D from '../js/deflect.js';
import * as K from '../js/keyhole.js';
import * as L from '../js/labtext.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const ab = (f) => { const b = fs.readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eng = new D.DeflectEngine(ab('../data/de440s.bsp'));
const j = JSON.parse(fs.readFileSync(new URL('./fixtures/sbdb_99942.json', import.meta.url))), el = {}; for (const x of j.orbit.elements) el[x.name] = +x.value;
eng.ng = D.ngFromSbdb(j.orbit.model_pars);
const et0 = D.etFromJd(+j.orbit.epoch), [r, v] = D.keplerHelio({ ...el, epoch: +j.orbit.epoch }, et0), [ps, vs] = eng.sun(et0);
const y0 = [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]];
const ca = eng.scan(et0, y0, D.etFromJd(2462300), { maxDist: 0.01 * D.AU }).list[0], b = eng.bplaneAt(ca);
const [, vEc] = eng.earth(ca.et), [, vSc] = eng.sun(ca.et), g = K.encounter(b.S, b.vinf, [vEc[0] - vSc[0], vEc[1] - vSc[1], vEc[2] - vSc[2]]);
const helioA = (et, y) => { const [p2, v2] = eng.sun(et); return D.helioElements([y[0] - p2[0], y[1] - p2[1], y[2] - p2[2]], [y[3] - v2[0], y[4] - v2[1], y[5] - v2[2]]).a / D.AU; };

// 1) Apophis 2029 sonrası a
{
  const aPost = K.postA(g, b.xi / D.AU, b.zeta / D.AU), t = ca.et + 60 * 86400, aNum = helioA(t, eng.integrate(ca.et, ca.y, t).y);
  console.log(`  U ${g.U.toFixed(4)}, cos θ ${g.cth.toFixed(4)}; a' Valsecchi ${aPost.toFixed(4)} AB, tam tümleme ${aNum.toFixed(4)} AB`);
  check(Math.abs(aPost - aNum) < 0.002 && aNum > 1.09 && aNum < 1.12, 'Apophis 2029 sonrası yarı büyük eksen: Valsecchi ↔ tam tümleme (0,002 AB içinde; Aten → Apollo)');
  const flip = K.postA(g, b.xi / D.AU, -b.zeta / D.AU);
  check(Math.abs(flip - aNum) > 0.01, 'ζ ekseninin işareti önemli (ters işaretle uyum bozulur)');
}
// 2) çember üzerindeki noktalar
{
  let worst = 0; const C = K.resonanceCircle(g, 7, 6);
  for (let k = 0; k < 24; k++) { const t = 2 * Math.PI * k / 24, a2 = K.postA(g, C.R * Math.cos(t), C.D + C.R * Math.sin(t)); worst = Math.max(worst, Math.abs(a2 - C.a)); }
  check(C && worst < 1e-9, `7:6 rezonans çemberi (D ${(C.D * D.AU).toFixed(0)} km, R ${(C.R * D.AU).toFixed(0)} km): üzerindeki her nokta a' = (7/6)^(2/3)`);
  const vis = K.circlesInView(g, b.xi / D.AU, b.zeta / D.AU, 50000 / D.AU, 30, 50);
  check(vis.length > 0 && vis.every((c) => Math.abs(Math.hypot(b.xi / D.AU, b.zeta / D.AU - c.D) - c.R) < 50000 * Math.SQRT2 / D.AU) && vis.every((c, i) => !i || vis[i - 1].k <= c.k), 'görünen kareye giren çemberler (kısa dönüş önce)');
}
// 3) rezonans çemberine konan yörünge k yıl sonra Dünya'ya yaklaşır: geçişten 2 yıl önce STM ile tam o çembere götüren yörünge boyu Δv
{
  // hedef: çemberin nominal ξ'deki noktalarından nominale yakın olanı (yörünge boyu itki çoğunlukla ζ'yi, yani geçiş zamanını değiştirir)
  const C = K.resonanceCircle(g, 7, 6), xi0 = b.xi / D.AU, dzc = Math.sqrt(C.R * C.R - xi0 * xi0), z0 = b.zeta / D.AU;
  const target = [C.D + dzc, C.D - dzc].reduce((q, x) => (Math.abs(x - z0) < Math.abs(q - z0) ? x : q));
  const etA = ca.et - 2 * 365.25 * 86400, yA = eng.integrate(et0, y0, etA).y, Phi = eng.stm(etA, yA, ca.et)[0].Phi, { J } = eng.bplanePartials(ca);
  const vh = yA.slice(3, 6), vn = Math.hypot(...vh), u = vh.map((x) => x / vn), dz = J[1].reduce((s, jk, k) => s + jk * (Phi[k][3] * u[0] + Phi[k][4] * u[1] + Phi[k][5] * u[2]), 0);
  const dvk = (target * D.AU - b.zeta) / dz, y1 = Float64Array.from(yA); for (let k = 0; k < 3; k++) y1[3 + k] += u[k] * dvk;
  const ca2 = eng.scan(etA, y1, ca.et + 5 * 86400, { maxDist: 0.01 * D.AU }).list[0], b2 = eng.bplaneAt(ca2);
  const t2 = ca2.et + 60 * 86400, a2 = helioA(t2, eng.integrate(ca2.et, ca2.y, t2).y);
  const later = eng.scan(t2, eng.integrate(ca2.et, ca2.y, t2).y, ca2.et + 7.5 * 365.25 * 86400, { maxDist: 0.2 * D.AU }).list;
  const back = later.find((c) => Math.abs((c.et - ca2.et) / (365.25 * 86400) - 7) < 0.3);
  console.log(`  Δv ${(dvk * 1e6).toFixed(2)} mm/s → ζ ${(b2.zeta / 1000).toFixed(0)} bin km (hedef ${(target * D.AU / 1000).toFixed(0)}), a' ${a2.toFixed(4)} (7:6 → ${C.a.toFixed(4)}), 7 yıl sonra: ${back ? (back.dist / 1e6).toFixed(2) + ' milyon km' : 'yok'}`);
  check(Math.abs(a2 - C.a) < 0.003 && back && back.dist < 0.1 * D.AU, '7:6 çemberine konan yörünge: a\' rezonansta ve 7 yıl sonra Dünya\'ya yeniden yaklaşır (rezonanslı dönüş)');
}
// 4) yargı ve tablo
{
  const yr = 365.25 * 86400, base = { dXi: 10, dZeta: 20, b0: { bE: 13773, rp: 38011, impact: false }, after: { rp: 38030, impact: false } };
  const vBad = L.verdictOf({ ...base, later: { N: [{ et: 2 * yr, dist: 1e6, impact: false }], D: [{ et: 7 * yr, dist: 5000, impact: true }], etEnd: 50 * yr } }, { hypo: false });
  check(vBad.kind === 'bad' && /ileride çarpmaya yol açar/.test(vBad.title) && /anahtar deliğine/.test(vBad.detail), 'saptırılmış yörünge 7 yıl sonra çarparsa: "Saptırma ileride çarpmaya yol açar"');
  const vGood = L.verdictOf({ ...base, later: { N: [{ et: 7 * yr, dist: 5000, impact: true }], D: [{ et: 7.01 * yr, dist: 9e5, impact: false }], etEnd: 50 * yr } }, { hypo: false });
  check(vGood.kind === 'good' && /İleriki çarpma önlendi/.test(vGood.title), 'nominaldeki ileriki çarpma kalkarsa: "İleriki çarpma önlendi"');
  const vSame = L.verdictOf({ ...base, later: { N: [{ et: 7 * yr, impact: true }], D: [{ et: 7.1 * yr, impact: true }], etEnd: 50 * yr } }, { hypo: false });
  check(vSame.kind === 'info', 'iki yörünge de aynı ileriki geçişte çarpıyorsa yargı değişmez (o geçiş için ayrı deney gerekir)');
  const rows = L.laterRows({ N: [{ et: 1, dist: 1 }, { et: 10 * yr, dist: 2 }], D: [{ et: 1 + 86400, dist: 3 }, { et: 5 * yr, dist: 4, impact: true }] });
  check(rows.length === 3 && rows[0].n && rows[0].d && rows[1].n === null && rows[1].d.impact && rows[2].d === null && L.passText(rows[1].d) === 'ÇARPMA', 'tablo: geçişler zamana göre eşlenir, eşsizler ayrı satır');
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
