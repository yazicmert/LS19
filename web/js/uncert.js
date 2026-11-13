// Saptırma deneyinin belirsizlik hesabı (saf; DOM yok, Node'da sınanır: test/test_uncert.js).
//   1) Hız değişiminin belirsizliği: asteroidin kütlesi (çap, yoğunluk ya da ölçülmüş GM) ve kinetik çarpmada momentum artış çarpanı β log-normal kabul edilir.
//      Kayma vektörü Δv ile doğrusal olduğundan örnek başına ölçeklenir: s = k·s₀, k = Δv/Δv₀.
//   2) Yörünge belirsizliği: JPL SBDB kovaryansı (kuyrukluyıldız öğeleri e, q, tp, Ω, ω, i) Kartezyen duruma (sayısal Jacobian), oradan durum geçiş
//      matrisi Φ ve B-düzlemi türevleri J ile yakın geçişe taşınır: Σ_B = (J Φ Jx) C (J Φ Jx)ᵀ (2×2, km²). Kütleçekimsel olmayan parametrelerin (A1, A2)
//      sütunları atılır (koşullu değil, marjinal blok: Apophis'te A2'nin 2029'a katkısı küçüktür).
//   3) Monte Carlo (tohumlu, yeniden üretilebilir): B-düzlemindeki geçiş noktası = nominal + yörünge hatası + k·kayma; |B| < bE ise çarpma.
import { AU, DAY } from './deflect.js';

const D2R = Math.PI / 180, GM_SUN = 132712440041.279419;

// ---------------------------------------------------------------- tohumlu normal dağılım (mulberry32 + Box–Muller)
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1, spare = null;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    const r = Math.sqrt(-2 * Math.log(Math.max(1e-300, u()))), th = 2 * Math.PI * u();
    spare = r * Math.sin(th); return r * Math.cos(th);
  };
  return { u, normal };
}

// ---------------------------------------------------------------- kütle ve β belirsizliği (doğal logaritmada 1σ)
// Varsayımlar (belgede gerekçeli):
//   β: DART'ta β = 3,61 (+0,19/−0,25) Dimorphos yoğunluğu bilinseydi; yoğunluk 1500–3300 kg/m³ aralığında β 2,2–4,9 (Cheng vd. 2023).
//      Başka bir hedefin yüzeyi bilinmediğinden σ_ln β = 0,25 (≈ 2,8–4,7 aralığı 1σ, β = 3,6 için).
//   Yoğunluk: tayf türünden tahmin σ_ln = 0,30 (S türü 2000–3300, C türü 1000–1800 kg/m³); ölçülmüşse 0,15.
//   Çap: ölçülmüşse (radar, termal) SBDB'nin σ'sı, yoksa %10; mutlak parlaklıktan (albedo bilinmiyor) σ_ln D = 0,35 (albedo 0,05–0,25 aralığı),
//   albedo biliniyorsa SBDB σ'sıyla σ_ln D = ½ σ_ln p. Ölçülmüş GM: SBDB σ'sı ya da %10.
export const BETA_SIG = 0.25;
export function massSigma(src = {}) {
  if (src.GM > 0) return src.GMsig > 0 ? src.GMsig / src.GM : 0.1;
  const sRho = src.rhoMeasured ? 0.15 : 0.30;
  let sD;
  if (src.Dmeasured) sD = src.Dsig > 0 && src.D > 0 ? src.Dsig / src.D : 0.10;
  else if (src.alb > 0 && src.albSig > 0) sD = 0.5 * Math.min(1, src.albSig / src.alb);
  else sD = 0.35;
  return Math.hypot(3 * sD, sRho);
}
// Δv'nin ln-σ'sı: kinetik Δv = β m U / (M + m) ≈ β m U / M; sürekli itki Δv = F t / M
export const dvSigma = (method, sM, sBeta = BETA_SIG) => (method === 'kinetic' ? Math.hypot(sM, sBeta) : sM);

// ---------------------------------------------------------------- JPL SBDB kovaryansı
// orbit: SBDB yanıtının orbit nesnesi (cov=mat). Dönüş: { epoch (JD TDB), el: { e, q, tp, om, w, i }, C (6×6; birimler AB, gün, derece) } ya da null.
// Biçim: orbit.covariance = { epoch, labels: ['e','q','tp','node','peri','i', ('A1','A2'…)], data: tam ya da alt üçgen matris, elements: [{ name, value }] }.
const ALIAS = { node: 'om', peri: 'w', om: 'om', w: 'w', e: 'e', q: 'q', tp: 'tp', i: 'i' };
const ORDER = ['e', 'q', 'tp', 'om', 'w', 'i'];
export function covFromSbdb(orbit) {
  const cv = orbit && orbit.covariance; if (!cv || !Array.isArray(cv.labels) || !Array.isArray(cv.data)) return null;
  const lab = cv.labels.map((l) => ALIAS[l] || l), n = lab.length, M = [];
  for (let r = 0; r < n; r++) { M.push([]); for (let c = 0; c < n; c++) M[r].push(NaN); }
  cv.data.forEach((row, r) => { if (Array.isArray(row)) row.forEach((x, c) => { M[r][c] = +x; if (row.length <= r + 1) M[c][r] = +x; }); });       // alt üçgen de olabilir
  const idx = ORDER.map((k) => lab.indexOf(k)); if (idx.some((k) => k < 0)) return null;
  const C = ORDER.map((_, a) => ORDER.map((__, b) => M[idx[a]][idx[b]]));
  if (C.some((row) => row.some((x) => !Number.isFinite(x)))) return null;
  for (let a = 0; a < 6; a++) for (let b = 0; b < a; b++) { const s = 0.5 * (C[a][b] + C[b][a]); C[a][b] = C[b][a] = s; }
  if (C.some((row, a) => !(row[a] >= 0))) return null;
  const epoch = +(cv.epoch ?? orbit.cov_epoch);
  const el = {};
  for (const x of cv.elements || []) { const k = ALIAS[x.name] || x.name; if (ORDER.includes(k)) el[k] = +x.value; }
  if (ORDER.some((k) => !Number.isFinite(el[k]))) {                                                   // öğeler yoksa yörüngenin kendisi (aynı devirdeyse)
    if (!(Math.abs(+orbit.epoch - epoch) < 1e-6)) return null;
    const o = {}; for (const x of orbit.elements || []) o[x.name] = +x.value;
    if (!Number.isFinite(o.tp)) { const a = o.a * AU, nn = Math.sqrt(GM_SUN / a ** 3); o.tp = epoch - (((o.ma + 180) % 360) - 180) * D2R / nn / DAY; }
    Object.assign(el, { e: o.e, q: o.q ?? o.a * (1 - o.e), tp: o.tp, om: o.om, w: o.w, i: o.i });
  }
  if (!(Number.isFinite(epoch) && ORDER.every((k) => Number.isFinite(el[k])) && el.e < 1)) return null;
  return { epoch, el, C };
}
// kuyrukluyıldız öğeleri → deflect.js keplerHelio biçimi (a AB, ortalama anomali derece, devir JD)
export function cometaryToKepler(el, epochJd) {
  const a = el.q / (1 - el.e), n = Math.sqrt(GM_SUN / (a * AU) ** 3);
  return { a, e: el.e, i: el.i, om: el.om, w: el.w, ma: n * (epochJd - el.tp) * DAY / D2R, epoch: epochJd };
}
// ∂x/∂el (6×6) sayısal (merkezî fark). state(el) → [r, v] (Güneş merkezli ICRF, km, km/s)
export function stateJacobian(el, state) {
  const H = { e: 1e-8, q: 1e-9, tp: 1e-5, om: 1e-7, w: 1e-7, i: 1e-7 }, J = Array.from({ length: 6 }, () => new Array(6).fill(0));
  ORDER.forEach((k, c) => {
    const p = { ...el, [k]: el[k] + H[k] }, m = { ...el, [k]: el[k] - H[k] }, [rp, vp] = state(p), [rm, vm] = state(m), xp = [...rp, ...vp], xm = [...rm, ...vm];
    for (let r = 0; r < 6; r++) J[r][c] = (xp[r] - xm[r]) / (2 * H[k]);
  });
  return J;
}
const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
const tr = (A) => A[0].map((_, j) => A.map((row) => row[j]));
// Σ_B = G C Gᵀ, G = J (2×6) · Φ (6×6) · Jx (6×6)
export function bplaneCov(J, Phi, Jx, C) { const G = mul(mul(J, Phi), Jx); return mul(mul(G, C), tr(G)); }
// 2×2 kovaryansın elipsi: yarı eksenler (1σ) ve ξ ekseninden açı
export function ellipse(S) {
  const a = S[0][0], b = S[0][1], d = S[1][1], m = 0.5 * (a + d), q = Math.sqrt(Math.max(0, 0.25 * (a - d) ** 2 + b * b));
  return { s1: Math.sqrt(Math.max(0, m + q)), s2: Math.sqrt(Math.max(0, m - q)), ang: 0.5 * Math.atan2(2 * b, a - d) };
}

// ---------------------------------------------------------------- Monte Carlo
// o: { n0: [ξ, ζ] nominal geçiş noktası (çarpacak olsaydı: [0, 0]), shift: [Δξ, Δζ] nominal kayma, bE, sDv (ln-σ), SB (2×2 ya da null), N, seed }
// Dönüş: { pImpact0 (itkisiz), pImpact (itkili), kQ: [5, 50, 95] yüzdelik Δv çarpanı, shiftQ (km), N }
export function monteCarlo(o) {
  const N = o.N || 4000, R = rng(o.seed || 1), bE2 = o.bE * o.bE, S = o.SB;
  let L = null;                                                          // Cholesky (2×2)
  if (S && S[0][0] > 0) { const l11 = Math.sqrt(S[0][0]), l21 = S[1][0] / l11; L = [l11, l21, Math.sqrt(Math.max(0, S[1][1] - l21 * l21))]; }
  let hit0 = 0, hit = 0; const ks = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const kk = Math.exp(o.sDv * R.normal());                               // log-normal: medyan = nominal Δv
    let ex = 0, ez = 0; if (L) { const z1 = R.normal(), z2 = R.normal(); ex = L[0] * z1; ez = L[1] * z1 + L[2] * z2; }
    const x0 = o.n0[0] + ex, z0 = o.n0[1] + ez, x1 = x0 + kk * o.shift[0], z1 = z0 + kk * o.shift[1];
    if (x0 * x0 + z0 * z0 < bE2) hit0++;
    if (x1 * x1 + z1 * z1 < bE2) hit++;
    ks[k] = kk;
  }
  ks.sort();
  const q = (p) => ks[Math.min(N - 1, Math.floor(p * N))], s0 = Math.hypot(o.shift[0], o.shift[1]);
  return { pImpact0: hit0 / N, pImpact: hit / N, kQ: [q(0.05), q(0.5), q(0.95)], shiftQ: [q(0.05) * s0, q(0.5) * s0, q(0.95) * s0], N };
}
// "çarpacak olsaydı" senaryosunda belirli bir olasılıkla kurtarmak için gereken Δv çarpanı (yalnız Δv belirsizliği; yörünge hatası varsayımsal merkezde anlamsız):
// P(k·s₀ ≥ bE) = p  ⇔  Δv_p = Δv_req · exp(z_p σ)
export const dvForConfidence = (dvReq, sDv, z = 1.6449) => dvReq * Math.exp(z * sDv);
