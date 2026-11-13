// Laboratuvar › Lagrange noktaları sınaması (Node): lagrange.js saf hesabı analitik sonuçlarla ve yayımlanmış değerlerle karşılaştırılır,
// arayüz sözleşmesi (deney kaydı, sayfa, bağlantı anahtarları) denetlenir. Tarayıcı akışı: tools/lab_deneme.mjs
import fs from 'fs';
import * as G from '../js/lagrange.js';
import * as C from '../js/cr3bp.js';
import { LINK_KEYS } from '../js/labtext.js';
import { AY_LINK_KEYS } from '../js/aytext.js';
import { EXPERIMENTS } from '../js/labui.js';

let ok = true;
const check = (c, m, info = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (info ? ' — ' + info : '')); ok = ok && !!c; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const EM = G.SYSTEMS.em, SE = G.SYSTEMS.se;

console.log('beş nokta');
for (const S of [EM, SE, G.systemOf('ozel', 0.2)]) {
  const P = G.points(S.mu), g = Math.max(...P.map((p) => Math.hypot(...G.gradOmega(p.x, p.y, 0, S.mu))));
  check(g < 1e-12, `${S.name} (μ = ${S.mu.toPrecision(4)}): beş noktada da potansiyelin eğimi sıfır`, g.toExponential(1));
}
const P = G.points(EM.mu);
check(near(P[3].x, 0.5 - EM.mu, 1e-15) && near(P[3].y, Math.sqrt(3) / 2, 1e-15) && near(P[4].y, -Math.sqrt(3) / 2, 1e-15), 'L4/L5 eşkenar üçgen köşelerinde: (½ − μ, ±√3/2)');
check(near(P[0].x, C.xL(1), 1e-12) && near(P[1].x, C.xL(2), 1e-12), 'L1/L2 halo kodunun (cr3bp.js › xL) değeriyle aynı');
check(near(P[3].C, 3 - EM.mu * (1 - EM.mu), 1e-14) && P[0].C > P[1].C && P[1].C > P[2].C && P[2].C > P[3].C, 'Jacobi: C_L4 = 3 − μ(1−μ) ve C1 > C2 > C3 > C4');
// yayımlanmış Dünya–Ay CR3BP değerleri (Szebehely 1967; Koon, Lo, Marsden, Ross 2011): C1 3,18834, C2 3,17216, C3 3,01215, C4 2,98800
check([3.18834, 3.17216, 3.01215, 2.988].every((c, k) => near(P[k].C, c, 6e-6)), 'Dünya–Ay Jacobi sabitleri yayımlanmış değerlerle (5 basamak)', P.slice(0, 4).map((p) => p.C.toFixed(5)).join(' / '));
const I = P.map((p) => G.pointInfo(p, EM));
check(near(I[0].d2Km, 58000, 400) && near(I[1].d2Km, 64500, 400), 'Dünya–Ay L1 Ay\'dan ≈ 58.000 km, L2 ≈ 64.500 km', `${Math.round(I[0].d2Km)} / ${Math.round(I[1].d2Km)} km`);
const Ise = G.points(SE.mu).map((p) => G.pointInfo(p, SE));
check(near(Ise[1].d2Km, 1.5e6, 2e4), 'Güneş–Dünya L2 Dünya\'dan ≈ 1,5 milyon km (JWST)', `${Math.round(Ise[1].d2Km)} km`);
for (const mu of [1e-4, 1e-6, 1e-8]) {
  const Q = G.points(mu), h = Math.cbrt(mu / 3), g1 = 1 - mu - Q[0].x, g2 = Q[1].x - (1 - mu);
  check(Math.abs(g1 / h - 1) < 3 * h && Math.abs(g2 / h - 1) < 3 * h, `μ = ${mu}: L1/L2'nin küçük cisme uzaklığı Hill yarıçapına (μ/3)^(1/3) yaklaşır`, `${(g1 / h).toFixed(5)} / ${(g2 / h).toFixed(5)}`);
}

console.log('kararlılık');
check(P.slice(0, 3).every((p) => !p.lin.stable) && P.slice(3).every((p) => p.lin.stable), 'Dünya–Ay: L1, L2, L3 kararsız (eyer); L4, L5 kararlı (μ < Routh sınırı)');
check(near(G.MU_ROUTH, 0.0385209, 1e-7), 'Routh sınırı μ_R = (1 − √(23/27))/2 = 0,03852');
for (const [mu, st] of [[G.MU_ROUTH * 0.98, true], [G.MU_ROUTH * 1.02, false]]) check(G.points(mu)[3].lin.stable === st, `μ = ${mu.toFixed(5)}: L4 ${st ? 'kararlı' : 'kararsız'} (27·μ(1−μ) ${st ? '<' : '>'} 1)`);
check(near(I[0].efoldDays, 1.48, 0.01) && near(Ise[1].efoldDays, 23.4, 0.3), 'e-katlanma süresi: Dünya–Ay L1 1,48 gün, Güneş–Dünya L2 23,4 gün (kaynaklarda ~23 gün)', `${I[0].efoldDays.toFixed(3)} / ${Ise[1].efoldDays.toFixed(2)} gün`);

console.log('deney (tam tümleme)');
let r = G.runFrom(EM, 'L1', { dr: [10, 0, 0], days: 30 });
check(r.outcome === 'leave' && r.growthMeas && Math.abs(r.growthMeas / r.growthLin - 1) < 0.03, 'L1\'e 10 km hatayla bırakılan araç ayrılır; ölçülen büyüme hızı doğrusal kuramla %3 içinde', `${r.growthMeas.toFixed(4)} / ${r.growthLin.toFixed(4)} 1/gün, ayrılış ${r.tLeave.toFixed(1)} gün`);
check(r.dC < 1e-9, 'Jacobi sabiti tümleme boyunca korunur', r.dC.toExponential(1));
r = G.runFrom(SE, 'L2', { dr: [100, 0, 0], days: 730 });
check(r.outcome === 'leave' && Math.abs(r.growthMeas / r.growthLin - 1) < 0.03, 'Güneş–Dünya L2: 100 km hata ~7 ayda noktayı terk ettirir', `${r.tLeave.toFixed(0)} gün`);
r = G.runFrom(EM, 'L4', { dr: [100, 0, 0], days: 365 });
check(r.outcome === 'stay' && r.maxKm < 5000 && r.dC < 1e-9, 'L4\'e 100 km hatayla bırakılan araç bir yıl çevresinde salınır (Truva noktası)', `en çok ${Math.round(r.maxKm)} km`);
r = G.runFrom(G.systemOf('ozel', 0.05), 'L4', { dr: [100, 0, 0], days: 365 });
check(r.outcome !== 'stay', 'μ = 0,05 (Routh sınırının üstü): aynı L4 deneyinde araç noktadan ayrılır', r.outcome);
r = G.runFrom(EM, 'L1', { dv: [0, -60, 0], days: 60 });
check(['hit1', 'hit2', 'leave', 'escape'].includes(r.outcome) && Number.isFinite(r.tEnd) && r.t.length === r.d.length && r.pts.length === r.t.length, 'çarpma/kaçış durumunda tümleme durur, örnekler tutarlı', r.outcome);
const v = G.verdict(G.runFrom(EM, 'L2', { dr: [10, 0, 0], days: 30 }), EM);
check(v.kind === 'bad' && /L2 noktasında kalmaz/.test(v.title) && /uzaklaştı/.test(v.detail), 'yargı kartı: kararsız noktada "kalmaz"');

console.log('halo yörüngeleri');
for (const sp of [{ L: 1, Az: G.HALO_AZ[1][0] }, { L: 1, Az: G.HALO_AZ[1][1] }, { L: 2, Az: G.HALO_AZ[2][0] }, { L: 2, Az: G.HALO_AZ[2][1] }]) {
  const h = G.haloOf(sp);
  check(Math.abs(h.Az - sp.Az) < 5 && h.closeKm < 0.01 && h.stability > 1, `L${sp.L} halo Az = ${sp.Az} km (aralığın ucu): yakınsar, bir periyot sonra kapanır`, `${h.periodDays.toFixed(2)} gün, kapanma ${h.closeKm.toExponential(1)} km, ν ${h.stability.toFixed(0)}`);
}
const nr = G.haloOf({ nrho: true });
check(near(nr.periodDays, C.SYNODIC_DAYS / 4.5, 1e-6) && nr.rpKm < 4000 && nr.stability < 3 && nr.preset === 'NRHO', 'NRHO 9:2: periyot kameri ayın 2/9\'u (6,56 gün), Ay\'a ~3.300 km, neredeyse kararlı', `${nr.periodDays.toFixed(3)} gün, ${Math.round(nr.rpKm)} km, ν ${nr.stability.toFixed(2)}`);
check(G.haloOf({ L: 2, Az: 13000 }).preset === 'L2' && G.haloOf({ L: 1, Az: 10000 }).preset === 'L1' && G.haloOf({ L: 2, Az: 99999 }).Az <= G.HALO_AZ[2][1] + 5, 'Ay görevi profilleriyle eşleşen üyeler tanınır; aralık dışı genlik kırpılır');

console.log('bağlantı ve sözleşme');
check(G.LG_LINK_KEYS.every((k) => !LINK_KEYS.includes(k) && !AY_LINK_KEYS.includes(k)), 'bağlantı anahtarları saptırma ve Ay görevi anahtarlarıyla çakışmaz');
const st = { sys: 'ozel', mu: 0.03, point: 'L4', drKm: 100, dvMps: 0.5, dir: 'y', days: 365, Cj: 3.0123456, haloL: '2', haloAz: 20000 };
const back = G.lgStateFromLink(new URLSearchParams(G.lgLinkFromState(st)));
check(back.sys === 'ozel' && back.mu === 0.03 && back.point === 'L4' && back.drKm === 100 && back.dvMps === 0.5 && back.dir === 'y' && back.days === 365 && near(back.Cj, 3.01235, 1e-9) && back.haloL === '2' && back.haloAz === 20000, 'bağlantı → durum gidiş-dönüş');
const bad = G.lgStateFromLink(new URLSearchParams({ sistem: 'mars', nokta: 'L7', sapma: '-1', yonu: 'w', sure: '0', kutle: '9' }));
check(!bad.sys && !bad.point && bad.drKm == null && !bad.dir && bad.days == null && bad.mu === G.MU_MAX && G.lgStateFromLink(new URLSearchParams({ hedef: '1' })) === null, 'bozuk değerler atılır, μ sınırlanır; anahtar yoksa durum yok');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
check(EXPERIMENTS.lagrange && EXPERIMENTS.lagrange.engine === 'sky' && /id="lab-lagrange"/.test(html) && /data-exp="lagrange"/.test(html), 'deney kaydı, ağaç düğmesi ve sayfa');
check(/LG_LINK_KEYS/.test(app) && /exp !== 'lagrange'/.test(app), 'app.js: Lagrange anahtarları yalnız o deneyde adreste kalır');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
