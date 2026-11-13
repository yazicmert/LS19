// Laboratuvar › Lagrange noktaları: saf hesap (DOM yok; Node'da sınanır: test/test_lagrange.js).
// Dairesel kısıtlı üç cisim problemi (CR3BP), dönen çerçeve, boyutsuz birimler: uzunluk L (iki cisim arası), zaman 1/n, μ = m2/(m1+m2).
// Büyük cisim (−μ, 0, 0), küçük cisim (1−μ, 0, 0). Etkin potansiyel Ω = (x²+y²)/2 + (1−μ)/r1 + μ/r2; Jacobi sabiti C = 2Ω − v².
// Tümleyici cr3bp.js'teki (DOPRI5, μ parametreli); halo aile üyeleri halo.js › haloMember'dan (Dünya–Ay birimleri). Bu modül onları değiştirmez.
import * as E from './engine.js';
import * as C from './cr3bp.js';
import { haloMember, HALO_PRESETS } from './halo.js';

const AU = 149597870.7, YEAR = 365.256363004 * 86400, R_SUN = 695700;
// sistem: { id, name, mu, L_km (uzunluk birimi), T_s (zaman birimi = 1/n), p1/p2: { name, R (km) } }
export const SYSTEMS = {
  em: { id: 'em', name: 'Dünya–Ay', mu: C.MU, L_km: C.L_CR, T_s: C.T_CR, p1: { name: 'Dünya', R: E.R_E }, p2: { name: 'Ay', R: E.R_M } },
  // Güneş – (Dünya + Ay): Dünya–Ay kütle merkezi küçük cisim sayılır (JWST'nin L2'si bu sistemin L2'sidir)
  se: { id: 'se', name: 'Güneş–Dünya', mu: (E.MU_E + E.MU_M) / (E.MU_S + E.MU_E + E.MU_M), L_km: AU, T_s: YEAR / (2 * Math.PI), p1: { name: 'Güneş', R: R_SUN }, p2: { name: 'Dünya', R: E.R_E } },
};
// varsayımsal sistem: Dünya–Ay ölçeğinde (uzunluk, zaman, cisim yarıçapları) ama kütle oranı μ serbest
export const MU_MIN = 1e-7, MU_MAX = 0.5;
export function systemOf(id, mu = null) {
  if (id === 'ozel') {
    const m = Math.min(MU_MAX, Math.max(MU_MIN, +mu || C.MU));
    return { ...SYSTEMS.em, id: 'ozel', name: 'Varsayımsal', mu: m, p1: { name: 'Büyük cisim', R: E.R_E }, p2: { name: 'Küçük cisim', R: E.R_M } };
  }
  return SYSTEMS[id] || SYSTEMS.em;
}
// Routh ölçütü (Gascheau 1843, Routh 1875): L4/L5 doğrusal kararlıdır ⇔ 27·μ(1−μ) < 1 ⇔ μ < μ_R
export const MU_ROUTH = 0.5 * (1 - Math.sqrt(23 / 27));

// ---------------------------------------------------------------- potansiyel
export function omega(x, y, z, mu) {
  const r1 = Math.hypot(x + mu, y, z), r2 = Math.hypot(x - 1 + mu, y, z);
  return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
}
export function gradOmega(x, y, z, mu) {
  const r1 = Math.hypot(x + mu, y, z), r2 = Math.hypot(x - 1 + mu, y, z), a = (1 - mu) / r1 ** 3, b = mu / r2 ** 3;
  return [x - a * (x + mu) - b * (x - 1 + mu), y - a * y - b * y, -a * z - b * z];
}
export function hessOmega(x, y, z, mu) {
  const dx1 = x + mu, dx2 = x - 1 + mu, r1s = dx1 * dx1 + y * y + z * z, r2s = dx2 * dx2 + y * y + z * z, r1 = Math.sqrt(r1s), r2 = Math.sqrt(r2s);
  const a = (1 - mu) / (r1s * r1), b = mu / (r2s * r2), a5 = 3 * (1 - mu) / (r1s * r1s * r1), b5 = 3 * mu / (r2s * r2s * r2);
  return {
    xx: 1 - a - b + a5 * dx1 * dx1 + b5 * dx2 * dx2, yy: 1 - a - b + (a5 + b5) * y * y, zz: -a - b + (a5 + b5) * z * z,
    xy: (a5 * dx1 + b5 * dx2) * y, xz: (a5 * dx1 + b5 * dx2) * z, yz: (a5 + b5) * y * z,
  };
}
// s: [x, y, z, vx, vy, vz] → Jacobi sabiti
export const jacobi = (s, mu) => 2 * omega(s[0], s[1], s[2], mu) - (s[3] * s[3] + s[4] * s[4] + s[5] * s[5]);

// ---------------------------------------------------------------- beş nokta
// x ekseni üzerinde Ωx = 0 kökü (aralıkta ikiye bölme, sonra Newton)
function collinear(lo, hi, mu) {
  const f = (x) => gradOmega(x, 0, 0, mu)[0];
  let a = lo, b = hi, fa = f(a);
  for (let k = 0; k < 200; k++) { const m = 0.5 * (a + b), fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; if (b - a < 1e-15) break; }
  let x = 0.5 * (a + b);
  for (let k = 0; k < 5; k++) { const d = f(x) / hessOmega(x, 0, 0, mu).xx; x -= d; if (Math.abs(d) < 1e-16) break; }
  return x;
}
// doğrusallaştırılmış dinamik (Szebehely 1967): düzlemde λ⁴ + (4 − Ωxx − Ωyy)λ² + (ΩxxΩyy − Ωxy²) = 0; düzleme dik ω_z² = −Ωzz.
//   growth: λ'nın en büyük gerçel kısmı (boyutsuz; > 0 kararsız), osc: düzlem içi salınım açısal hızları, wz
export function linearize(x, y, mu) {
  const H = hessOmega(x, y, 0, mu), b = 4 - H.xx - H.yy, c = H.xx * H.yy - H.xy * H.xy, disc = b * b - 4 * c;
  let growth = 0; const osc = [];
  if (disc >= 0) {
    for (const L2 of [(-b + Math.sqrt(disc)) / 2, (-b - Math.sqrt(disc)) / 2]) { if (L2 > 0) growth = Math.max(growth, Math.sqrt(L2)); else osc.push(Math.sqrt(-L2)); }
  } else {                                                                   // karmaşık λ²: λ = ±(p ± iq), p > 0 → kararsız (Routh ölçütü aşıldı)
    const re = -b / 2, im = Math.sqrt(-disc) / 2, mod = Math.hypot(re, im);
    growth = Math.sqrt((mod + re) / 2); osc.push(Math.sqrt((mod - re) / 2));
  }
  return { growth, osc, wz: Math.sqrt(Math.max(0, -H.zz)), stable: growth < 1e-9 };
}
// μ → [{ id: 'L1'…'L5', x, y, C (Jacobi), lin }]; L1 küçük cisimle büyük cisim arasında, L2 küçük cismin ötesinde, L3 büyük cismin ötesinde
export function points(mu) {
  const x1 = collinear(-mu + 1e-9, 1 - mu - 1e-12, mu), x2 = collinear(1 - mu + 1e-12, 2, mu), x3 = collinear(-2, -mu - 1e-9, mu);
  const P = [['L1', x1, 0], ['L2', x2, 0], ['L3', x3, 0], ['L4', 0.5 - mu, Math.sqrt(3) / 2], ['L5', 0.5 - mu, -Math.sqrt(3) / 2]];
  return P.map(([id, x, y]) => ({ id, x, y, C: 2 * omega(x, y, 0, mu), lin: linearize(x, y, mu) }));
}
// noktanın sistem birimleriyle özeti: küçük cisme ve büyük cisme uzaklık (km), kararsızlıkta e-katlanma süresi (gün), salınım periyotları (gün)
export function pointInfo(p, sys) {
  const mu = sys.mu, d1 = Math.hypot(p.x + mu, p.y) * sys.L_km, d2 = Math.hypot(p.x - 1 + mu, p.y) * sys.L_km, day = sys.T_s / 86400;
  return { ...p, d1Km: d1, d2Km: d2, efoldDays: p.lin.stable ? null : day / p.lin.growth,
    oscDays: p.lin.osc.map((w) => 2 * Math.PI / w * day), zDays: 2 * Math.PI / p.lin.wz * day };
}

// ---------------------------------------------------------------- Jacobi sabiti → hangi kapılar açık (sıfır hız eğrileri)
// C'ye göre hareket bölgesi: C > C1: iki cismin çevresi ayrı (hapsolur); C1 > C > C2: L1 kapısı açık (iki cisim arası geçiş);
// C2 > C > C3: L2 kapısı da açık (sistemden çıkış); C3 > C > C4: L3 de; C < C4 (= C5): her yer açık
export function gates(Cj, pts) {
  const [c1, c2, c3, c4] = pts.slice(0, 4).map((p) => p.C);
  return { L1: Cj < c1, L2: Cj < c2, L3: Cj < c3, L4: Cj < c4, L5: Cj < c4 };
}
// görünür pencerede yasak bölge ızgarası (2Ω < C: o enerjiyle hız sanal olur). view: { x0, x1, y0, y1 }; n×m hücre → Uint8Array (1: yasak)
export function forbiddenGrid(Cj, mu, view, n, m) {
  const out = new Uint8Array(n * m);
  for (let j = 0; j < m; j++) {
    const y = view.y1 - (j + 0.5) / m * (view.y1 - view.y0);
    for (let i = 0; i < n; i++) { const x = view.x0 + (i + 0.5) / n * (view.x1 - view.x0); out[j * n + i] = 2 * omega(x, y, 0, mu) < Cj ? 1 : 0; }
  }
  return out;
}

// ---------------------------------------------------------------- deney: noktaya bırakılan araç
// noktanın "yakını": iki cisim arasında ölçek, küçük cisme L1 uzaklığının yarısı (Hill küresi ölçeği; Dünya–Ay ≈ 29.000 km, Güneş–Dünya ≈ 750.000 km)
export const nearRadius = (pts, mu) => 0.5 * Math.abs(1 - mu - pts[0].x);
// sys, id ('L1'…'L5'), dr: konum hatası (km, [x, y, z]), dv: hız hatası (m/s, [x, y, z]), days: süre
// Dönüş: { pts: [[x, y, z]…] (boyutsuz, örneklenmiş), t: [gün…], d: [noktaya uzaklık km…], outcome: 'stay'|'leave'|'hit1'|'hit2'|'escape',
//   tLeave (gün; yakından ilk çıkış), maxKm, growthMeas (ölçülen e-katlanma oranı, 1/gün; doğrusal bölgede 10× ve 100× büyüme arası), dC (Jacobi kayması) }
export function runFrom(sys, id, { dr = [0, 0, 0], dv = [0, 0, 0], days = 60, samples = 1500 } = {}) {
  const mu = sys.mu, P = points(mu), p = P.find((q) => q.id === id) || P[0], L = sys.L_km, V = L / sys.T_s;     // km/s
  const Y0 = Float64Array.from([p.x + dr[0] / L, p.y + dr[1] / L, dr[2] / L, dv[0] / 1000 / V, dv[1] / 1000 / V, dv[2] / 1000 / V]);
  const tEnd = days * 86400 / sys.T_s, R1 = sys.p1.R / L, R2 = sys.p2.R / L, near = nearRadius(P, mu), C0 = jacobi(Y0, mu);
  const dist = (Y) => Math.hypot(Y[0] - p.x, Y[1] - p.y, Y[2]);
  const d0 = Math.max(dist(Y0), 1e-12);
  let outcome = 'stay', tLeave = null, maxD = d0, t10 = null, t100 = null;
  const pts = [[Y0[0], Y0[1], Y0[2]]], ts = [0], ds = [d0 * L];
  const stop = (tn, Yn) => {
    if (Math.hypot(Yn[0] + mu, Yn[1], Yn[2]) < R1) { outcome = 'hit1'; return true; }
    if (Math.hypot(Yn[0] - 1 + mu, Yn[1], Yn[2]) < R2) { outcome = 'hit2'; return true; }
    if (Math.hypot(Yn[0], Yn[1], Yn[2]) > 3) { outcome = 'escape'; return true; }
    return false;
  };
  let last = 0;
  const onStep = (t, Y) => {
    const d = dist(Y); maxD = Math.max(maxD, d);
    if (t10 == null && d > 10 * d0) t10 = t;
    if (t100 == null && d > 100 * d0) t100 = t;
    if (tLeave == null && d > near) tLeave = t;
    if (t - last >= tEnd / samples) { pts.push([Y[0], Y[1], Y[2]]); ts.push(t * sys.T_s / 86400); ds.push(d * L); last = t; }
  };
  const res = C.integrate(Y0, 0, tEnd, { mu, stop, onStep, hmax: tEnd / samples });
  const Yf = res.stopped ? res.Yn : res.Y;
  pts.push([Yf[0], Yf[1], Yf[2]]); ts.push((res.stopped ? res.tn : res.t) * sys.T_s / 86400); ds.push(dist(Yf) * L);
  if (outcome === 'stay' && tLeave != null) outcome = 'leave';
  const toDay = sys.T_s / 86400;
  return { id, pts, t: ts, d: ds, outcome, tEnd: ts[ts.length - 1], tLeave: tLeave == null ? null : tLeave * toDay, maxKm: maxD * L, nearKm: near * L,
    growthMeas: t10 != null && t100 != null && t100 > t10 ? Math.log(10) / ((t100 - t10) * toDay) : null,
    growthLin: p.lin.stable ? 0 : p.lin.growth / toDay, dC: Math.abs(jacobi(Yf, mu) - C0), d0Km: d0 * L };
}

// ---------------------------------------------------------------- halo yörüngeleri (yalnız Dünya–Ay: halo.js birimleri)
// Genlik aralığı: halo.js'in Richardson + düzeltme yöntemiyle yakınsadığı aralık (Node taraması, test_lagrange.js kilitler).
// Daha büyük genlikler aile boyunca süreklilik ister (yapılmadı); NRHO periyotla seçilir (Gateway: kameri ayın 2/9'u).
export const HALO_AZ = { 1: [2000, 26000], 2: [2000, 34000] };
// spec: { L: 1|2, Az (km) } ya da { nrho: true } → { L, south, Az, periodDays, rpKm (Ay'a en yakın), raKm, stability (ν), pts (dönen çerçeve, boyutsuz), closeKm (bir periyot sonra kapanma hatası) }
export function haloOf(spec) {
  let s;
  if (spec.nrho) s = HALO_PRESETS.NRHO92;
  else { const L = spec.L === 1 ? 1 : 2, [a, b] = HALO_AZ[L]; s = { L, south: L === 2, by: 'Az', value: Math.round(Math.min(b, Math.max(a, +spec.Az || 10000)) / 100) * 100 }; }
  const h = haloMember({ L: s.L, south: s.south, by: s.by, value: s.value });
  const T = h.T, pts = [];
  let last = -1;
  const r = C.integrate(Float64Array.from(h.X0), 0, T, { hmax: T / 300, onStep: (t, Y) => { if (t - last >= T / 300 * 0.999) { pts.push([Y[0], Y[1], Y[2]]); last = t; } } });
  pts.unshift(h.X0.slice(0, 3));
  const closeKm = Math.hypot(r.Y[0] - h.X0[0], r.Y[1] - h.X0[1], r.Y[2] - h.X0[2]) * C.L_CR;
  return { L: s.L, south: s.south, nrho: !!spec.nrho, Az: h.stats.AzKm, periodDays: h.stats.periodDays, rpKm: h.stats.rpKm, raKm: h.stats.raKm, stability: h.stability, pts, closeKm,
    preset: spec.nrho ? 'NRHO' : (s.L === 2 && s.value === 13000 ? 'L2' : s.L === 1 && s.value === 10000 ? 'L1' : null) };
}

// ---------------------------------------------------------------- düz dil
// deney sonucu → kart { kind: 'good'|'bad'|'info', title, detail }
export function verdict(run, sys) {
  const where = run.id, near = Math.round(run.nearKm / 1000) * 1000;
  if (run.outcome === 'hit1' || run.outcome === 'hit2') {
    const b = run.outcome === 'hit1' ? sys.p1.name : sys.p2.name;
    return { kind: 'bad', title: HIT_TITLE[b] || 'Cisme düşer', detail: `${where} noktasından ayrılan araç ${fmtDays(run.tEnd)} sonra yüzeye ulaştı.` };
  }
  if (run.outcome === 'escape') return { kind: 'bad', title: 'Sistemden kaçar', detail: `${where} noktasından ayrılan araç ${fmtDays(run.tEnd)} içinde iki cisimden de uzaklaştı.` };
  if (run.outcome === 'leave') return { kind: 'bad', title: `${where} noktasında kalmaz`, detail: `${fmtDays(run.tLeave)} sonra noktadan ${fmtKm(near)} uzaklaştı. Bu nokta kararsızdır: küçük bir hata üstel büyür; araç konumunu korumak için düzenli yakış yapmalıdır.` };
  return { kind: 'good', title: `${where} noktası çevresinde kalır`, detail: `${fmtDays(run.tEnd)} boyunca noktadan en çok ${fmtKm(run.maxKm)} uzaklaştı (sınır ${fmtKm(near)}).` };
}
const HIT_TITLE = { 'Dünya': "Dünya'ya düşer", 'Ay': "Ay'a düşer", 'Güneş': "Güneş'e düşer", 'Büyük cisim': 'Büyük cisme düşer', 'Küçük cisim': 'Küçük cisme düşer' };
const nf = (x, d = 0) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtKm = (km) => (km >= 1e6 ? nf(km / 1e6, 2) + ' milyon km' : km >= 100 ? nf(Math.round(km)) + ' km' : nf(km, 1) + ' km');
export const fmtDays = (d) => (d >= 730 ? nf(d / 365.25, 1) + ' yıl' : d >= 10 ? nf(d, 0) + ' gün' : nf(d, 1) + ' gün');

// ---------------------------------------------------------------- paylaşılabilir bağlantı
// Anahtarlar saptırmanın (labtext.js LINK_KEYS) ve Ay görevinin (aytext.js AY_LINK_KEYS) anahtarlarıyla çakışmaz (test_lagrange.js).
export const LG_LINK_KEYS = ['sistem', 'kutle', 'nokta', 'sapma', 'hata', 'yonu', 'sure', 'enerji', 'aile', 'genlik'];
export const DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
// st: { sys, mu, point, drKm, dvMps, dir, days, Cj, haloL ('1'|'2'|'nrho'), haloAz } → { anahtar: metin }
export function lgLinkFromState(st) {
  const o = { sistem: st.sys, nokta: st.point, sapma: String(st.drKm), hata: String(st.dvMps), yonu: st.dir, sure: String(st.days) };
  if (st.sys === 'ozel') o.kutle = String(st.mu);
  if (Number.isFinite(st.Cj)) o.enerji = st.Cj.toFixed(5);
  if (st.haloL) { o.aile = st.haloL; if (st.haloL !== 'nrho') o.genlik = String(st.haloAz); }
  return o;
}
const numOf = (s) => (s != null && s !== '' && Number.isFinite(+s) ? +s : null);
// q: URLSearchParams → durum ya da null (anahtar yoksa); bozuk değerler atılır, sınırlar kırpılır
export function lgStateFromLink(q) {
  if (!LG_LINK_KEYS.some((k) => q.has(k))) return null;
  const st = {};
  const s = q.get('sistem'); if (s === 'em' || s === 'se' || s === 'ozel') st.sys = s;
  const mu = numOf(q.get('kutle')); if (mu != null && mu > 0) st.mu = Math.min(MU_MAX, Math.max(MU_MIN, mu));
  const p = q.get('nokta'); if (/^L[1-5]$/.test(p || '')) st.point = p;
  const dr = numOf(q.get('sapma')); if (dr != null && dr >= 0) st.drKm = Math.min(1e6, dr);
  const dv = numOf(q.get('hata')); if (dv != null && dv >= 0) st.dvMps = Math.min(1000, dv);
  const d = q.get('yonu'); if (Object.hasOwn(DIRS, d || '')) st.dir = d;
  const t = numOf(q.get('sure')); if (t != null && t > 0) st.days = Math.min(3650, t);
  const c = numOf(q.get('enerji')); if (c != null) st.Cj = c;
  const a = q.get('aile'); if (a === '1' || a === '2' || a === 'nrho') st.haloL = a;
  const az = numOf(q.get('genlik')); if (az != null && az > 0) st.haloAz = az;
  return st;
}
