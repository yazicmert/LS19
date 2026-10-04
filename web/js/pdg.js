// LS19 motorlu iniş güdümü: yakıt-optimal iniş, kayıpsız dışbükeyleştirme (lossless convexification) ve ikinci derece koni programı (SOCP).
// Kaynaklar: Açıkmeşe & Ploen, JGCD 30(5), 2007 (z = ln m, u = T/m, σ = Γ/m; itki alt sınırının gevşetilmesi) · Açıkmeşe, Carson & Blackmore, IEEE TCST 21(6), 2013
// (işaretleme açısı, ‖u‖ ≤ σ gevşetmesinin kayıpsızlığı) · Blackmore, Açıkmeşe & Scharf, JGCD 33(4), 2010 (en küçük iniş hatası) · Malyuta vd., IEEE CSM 42(5), 2022 (eğitim: ZOH,
// log-kütle değişkeni, ikinci derece Taylor sınırları, son zaman araması). Formüller bu yayınlardan yazıldı; başka bir uygulamanın kodu kopyalanmadı.
//
// Problem (SI: m, s, kg, N; çerçeve dönüyorsa Ω ile): x = [r, v, z], z = ln m
//   ṙ = v,  v̇ = g + u − Ω×(Ω×r) − 2Ω×v,  ż = −α σ,  ‖u‖ ≤ σ,  ρ1 e^{−z} ≤ σ ≤ ρ2 e^{−z}  (ρ = itki sınırı, α = 1/(Isp g0))
//   n̂·u ≥ cosθ σ (işaretleme), ‖(r−rf)⊥‖ ≤ tanγ n̂·(r−rf) (süzülme konisi), n_k·r_k ≥ h_k (yüzey), ‖v‖ ≤ vmax, z_N ≥ ln m_kuru
//   min Σσ Δt  (yakıt)  ya da  min ‖(r_N − rf)⊥‖  (en küçük iniş hatası)
// Ayrıklaştırma: u, σ ve g aralıklarda sabit (ZOH), tam (matris üstelli) tümleme; böylece sonuç sürekli zamanlı modelle uyuşur.
// Sabit tf için dışbükeydir; tf için tek boyutlu arama yapılır (yakıt tf'nin tek tepeli işlevidir).
import { Conic } from './conic.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot(a, a));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 1]; };
// n̂'ye dik iki birim vektör
function perpBasis(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = unit(cross(n, a));
  return [e1, cross(n, e1)];
}

// ---------------------------------------------------------------- matris üstel (ölçekleme ve kare alma + Taylor), n×n satır öncelikli
function matMul(A, B, n) {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const a = A[i * n + k]; if (a !== 0) for (let j = 0; j < n; j++) C[i * n + j] += a * B[k * n + j]; }
  return C;
}
export function expm(A, n) {
  let nrm = 0; for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += Math.abs(A[i * n + j]); nrm = Math.max(nrm, s); }
  const sq = Math.max(0, Math.ceil(Math.log2(nrm / 0.5 + 1e-300)));
  const As = A.map((x) => x / 2 ** sq);
  let R = new Float64Array(n * n), term = new Float64Array(n * n);
  for (let i = 0; i < n; i++) { R[i * n + i] = 1; term[i * n + i] = 1; }
  for (let k = 1; k <= 18; k++) { term = matMul(term, As, n).map((x) => x / k); for (let i = 0; i < n * n; i++) R[i] += term[i]; }
  for (let s = 0; s < sq; s++) R = matMul(R, R, n);
  return R;
}
const skew = (w) => [[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]];
// ẋ = A x + B [u; σ] + G g,  x = [r, v, z]: dt'lik ZOH matrisleri (A_d 7×7, B_d 7×4, G_d 7×3)
export function discretize(omega, alpha, dt) {
  const n = 14, M = new Float64Array(n * n), S = skew(omega);
  for (let i = 0; i < 3; i++) {
    M[i * n + 3 + i] = 1;                                                   // ṙ = v
    for (let j = 0; j < 3; j++) {
      let s2 = 0; for (let k = 0; k < 3; k++) s2 += S[i][k] * S[k][j];
      M[(3 + i) * n + j] = -s2;                                             // merkezkaç: −Ω×(Ω×r)
      M[(3 + i) * n + 3 + j] = -2 * S[i][j];                                // Coriolis: −2Ω×v
    }
    M[(3 + i) * n + 7 + i] = 1;                                             // u → v̇
    M[(3 + i) * n + 11 + i] = 1;                                            // g → v̇
  }
  M[6 * n + 10] = -alpha;                                                   // ż = −α σ
  const F = expm(M.map((x) => x * dt), n);
  const Ad = [], Bd = [], Gd = [];
  for (let i = 0; i < 7; i++) {
    Ad.push(Array.from({ length: 7 }, (_, j) => F[i * n + j]));
    Bd.push(Array.from({ length: 4 }, (_, j) => F[i * n + 7 + j]));
    Gd.push(Array.from({ length: 3 }, (_, j) => F[i * n + 11 + j]));
  }
  return { Ad, Bd, Gd };
}

// ---------------------------------------------------------------- sabit tf için dışbükey problem
// P: { r0, v0, m0, rf, vf, g (3-vektör ya da N uzunlukta dizi), omega?, rho1, rho2, alpha, mDry,
//      point?: {n, cosTheta, tail?, ramp?, cosFrom?, sched?}, point2?: {cosTheta, tail?, ramp?, cosFrom?, sched?} (ikinci işaretleme konisi: örn. son saniyelerde daha dar; ramp: koni tail'den önceki ramp saniyede cosFrom'dan cosTheta'ya daralır; sched: [[kalan süre, cos], …] çizelge), glide?: {n, tanGamma, tail?, pyramid?}, funnel?: {n, vd0, kd, vh0, kh, tail?, vsite?}, floor?: [{n, h}] (N+1 düğüm), vmax?,
//      soft?: w (>0: işaretleme, süzülme konisi ve hız hunisi gevşek kısıt olur: eksik değeri w ağırlıkla cezalanır, bozulma sonrası da çözüm bulunur),
//      objective?: 'fuel' | 'error', errAxis?: n̂ (en küçük hatada yükseklik ekseni) }
//   tail: kısıt yalnız son `tail` saniyede geçerli · funnel: yüzeye göre iniş hızı ≤ vd0 + kd·h ve yatay hız ≤ vh0 + kh·h (h = n̂·(r − rf))
// Döner: { ok, status, ... } SI birimlerinde düğüm dizileri (r, v, m, u, sigma, thrust), yakıt ve (soft ise) viol = en büyük kısıt aşımı.
export function solveFixed(P, tf, N, opts = {}) {
  const dt = tf / N, omega = P.omega || [0, 0, 0], err = P.objective === 'error';
  const Ls = P.lengthScale || Math.max(norm(sub(P.r0, P.rf)), 200), Ts = tf, Vs = Ls / Ts, As = Ls / (Ts * Ts);
  const { Ad, Bd, Gd } = discretize(omega, P.alpha, dt);
  const gAt = (k) => (Array.isArray(P.g[0]) ? P.g[k] : P.g), lnm0 = Math.log(P.m0);
  const nx = 7, nw = 4, X = (k, i) => k * nx + i, W = (k, j) => nx * (N + 1) + nw * k + j, base = nx * (N + 1) + nw * N;
  const tailOk = (c, k) => !c.tail || tf - k * dt <= c.tail + 1e-9;                   // c.tail: kısıt yalnız son c.tail saniyede geçerli
  // işaretleme konisi (point/point2): kalan süre ≤ tail iken cosTheta; c.ramp > 0 ise tail ile tail + ramp arasında koni kosinüsü cosFrom'dan cosTheta'ya doğrusal daralır.
  // c.sched = [[kalan süre (s), cos(açı)], …] (kalan süre azalan sırada) verilirse koni açısı bu çizelgede parçalı doğrusal değişir (ilk kalan süreden önce kısıt yok, son noktadan sonra son değer).
  // Koni açısı basamak yerine eğimdir: itki yönü sıçramaz, araç yumuşak döner. Kısıt yoksa null.
  const coneCos = (c, k) => {
    const tgo = tf - k * dt;
    if (c.sched) {
      const S = c.sched; if (tgo > S[0][0] + 1e-9) return null;
      for (let i = 1; i < S.length; i++) if (tgo >= S[i][0] - 1e-9) { const f = (S[i - 1][0] - tgo) / Math.max(1e-9, S[i - 1][0] - S[i][0]); return S[i - 1][1] + (S[i][1] - S[i - 1][1]) * Math.min(1, Math.max(0, f)); }
      return S[S.length - 1][1];
    }
    if (!c.tail || tgo <= c.tail + 1e-9) return c.cosTheta;
    if (c.ramp > 0 && tgo <= c.tail + c.ramp + 1e-9) return c.cosTheta + ((c.cosFrom ?? 0) - c.cosTheta) * (tgo - c.tail) / c.ramp;
    return null;
  };
  // gevşek kısıtların dolgu değişkenleri (soft > 0): süzülme, işaretleme, huni dikey, huni yatay
  const soft = P.soft || 0, sl = { glide: [], point: [], point2: [], fun1: [], fun2: [] }; let ns = 0;
  const TE = err ? base : -1, sb = base + (err ? 1 : 0);
  if (soft) for (let k = 0; k <= N; k++) {
    if (P.glide && !P.glide.pyramid && tailOk(P.glide, k)) sl.glide[k] = sb + ns++;
    if (P.point && k < N && coneCos(P.point, k) !== null) sl.point[k] = sb + ns++;
    if (P.point2 && k < N && coneCos(P.point2, k) !== null) sl.point2[k] = sb + ns++;
    if (P.funnel && tailOk(P.funnel, k)) { sl.fun1[k] = sb + ns++; sl.fun2[k] = sb + ns++; }
  }
  const nvar = sb + ns, C = new Conic(nvar), S = [Ls, Ls, Ls, Vs, Vs, Vs, 1], xbar = [P.rf[0], P.rf[1], P.rf[2], 0, 0, 0, lnm0];
  // başlangıç ve son koşullar
  const x0 = [(P.r0[0] - P.rf[0]) / Ls, (P.r0[1] - P.rf[1]) / Ls, (P.r0[2] - P.rf[2]) / Ls, P.v0[0] / Vs, P.v0[1] / Vs, P.v0[2] / Vs, 0];
  for (let i = 0; i < nx; i++) C.eq(-x0[i], [[X(0, i), 1]]);
  const nEnd = err ? (P.errAxis || [0, 0, 1]) : null;
  if (!err) for (let i = 0; i < 3; i++) C.eq(0, [[X(N, i), 1]]);
  else C.eq(0, [0, 1, 2].map((i) => [X(N, i), nEnd[i]]));                   // yalnız yükseklik sıfır; yatay hata en aza indirilir
  for (let i = 0; i < 3; i++) C.eq(-P.vf[i] / Vs, [[X(N, 3 + i), 1]]);
  // dinamik: x'_{k+1} = Ad S x'_k / S + Bd As w'_k / S + (Ad x̄ − x̄ + Gd g)/S  (satır ölçekli)
  for (let k = 0; k < N; k++) {
    const g = gAt(k);
    for (let i = 0; i < nx; i++) {
      let c = -xbar[i]; for (let j = 0; j < nx; j++) c += Ad[i][j] * xbar[j];
      for (let j = 0; j < 3; j++) c += Gd[i][j] * g[j];
      const terms = [[X(k + 1, i), 1]];
      for (let j = 0; j < nx; j++) if (Ad[i][j] !== 0) terms.push([X(k, j), -Ad[i][j] * S[j] / S[i]]);
      for (let j = 0; j < nw; j++) if (Bd[i][j] !== 0) terms.push([W(k, j), -Bd[i][j] * As / S[i]]);
      C.eq(-c / S[i], terms);
    }
  }
  // itki sınırları (kayıpsız dışbükeyleştirme): z0_k = ln(m0 − αρ2 t_k) referansında Taylor sınırları
  const mClamp = Math.max(P.mDry, 1e-3 * P.m0);
  for (let k = 0; k < N; k++) {
    const tk = k * dt, Z0 = Math.log(Math.max(P.m0 - P.alpha * P.rho2 * tk, mClamp) / P.m0), Z1 = Math.log(Math.max(P.m0 - P.alpha * P.rho1 * tk, mClamp) / P.m0);
    // Taylor noktası: varsayılan en büyük itkıyla kütle yolu Z0; ardışık yaklaşımda (P.zRef) bir önceki çözümün ζ'sı (sınırlar yine Z0 ≤ ζ ≤ Z1)
    const z = X(k, 6), sg = W(k, 3), Zr = P.zRef ? P.zRef[k] : Z0, ex = Math.exp(-Zr), a2 = (P.rho2 / (P.m0 * As)) * ex, a1 = (P.rho1 / (P.m0 * As)) * ex;
    C.soc([0, [[sg, 1]]], [0, 1, 2].map((j) => [0, [[W(k, j), 1]]]));                // ‖U‖ ≤ Σ
    C.geq(-Z0, [[z, 1]]);                                                         // ζ ≥ Z0
    C.geq(Z1, [[z, -1]]);                                                         // ζ ≤ Z1
    C.geq(a2 * (1 + Zr), [[z, -a2], [sg, -1]]);                                   // Σ ≤ a2 (1 − (ζ − Zr)): e^{−ζ}'nın teğeti, gerçek sınırın altında kalır
    if (P.rho1 > 0) {                                                             // Σ ≥ a1 (1 − d + d²/2), d = ζ − Zr  (dönel koni)
      C.soc([-1 - 2 * Zr, [[sg, 2 / a1], [z, 2]]], [[-2 * Zr, [[z, 2]]], [-3 - 2 * Zr, [[sg, 2 / a1], [z, 2]]]]);
    }
    for (const [cone, slk] of [[P.point, sl.point], [P.point2, sl.point2]]) if (cone) {
      const ct = coneCos(cone, k); if (ct === null) continue;
      C.geq(0, [[W(k, 3), -ct], ...[0, 1, 2].map((j) => [W(k, j), cone.n[j]]), ...(slk[k] !== undefined ? [[slk[k], 1]] : [])]);
    }
  }
  C.geq(-Math.log(mClamp / P.m0), [[X(N, 6), 1]]);                                  // z_N ≥ ln m_kuru
  if (P.glide) {
    const [e1, e2] = perpBasis(P.glide.n), tg = P.glide.tanGamma, up = (k) => [0, 1, 2].map((j) => [X(k, j), tg * P.glide.n[j]]);
    for (let k = 0; k <= N; k++) {
      if (!tailOk(P.glide, k)) continue;
      if (P.glide.pyramid) {                                                   // |e1·R| ≤ tanγ n̂·R ve |e2·R| ≤ tanγ n̂·R (Malyuta vd. Mars örneğindeki biçim)
        for (const e of [e1, e2]) for (const sg of [1, -1]) C.geq(0, [...up(k), ...[0, 1, 2].map((j) => [X(k, j), -sg * e[j]])]);
      } else C.soc([0, [...up(k), ...(sl.glide[k] !== undefined ? [[sl.glide[k], 1]] : [])]], [e1, e2].map((e) => [0, [0, 1, 2].map((j) => [X(k, j), e[j]])]));
    }
  }
  if (P.floor) for (let k = 0; k <= N; k++) { const f = P.floor[k]; if (f) C.geq(dot(f.n, P.rf) - f.h, [0, 1, 2].map((j) => [X(k, j), Ls * f.n[j]])); }
  if (P.funnel) {                                                                  // hız hunisi: iniş hızı ve yatay hız yükseklikle doğrusal sınırlı (yüzeye göre, son c.tail saniyede)
    const F = P.funnel, n = F.n, [e1, e2] = perpBasis(n), vs = F.vsite || [0, 0, 0], nvs = dot(n, vs);
    for (let k = 0; k <= N; k++) {
      if (!tailOk(F, k)) continue;
      // Vs'ye bölünmüş (ölçekli) biçim; dolgu (varsa) ölçekli hız birimindedir
      C.geq((F.vd0 - nvs) / Vs, [...[0, 1, 2].map((j) => [X(k, j), F.kd * Ls / Vs * n[j]]), ...[0, 1, 2].map((j) => [X(k, 3 + j), n[j]]), ...(sl.fun1[k] !== undefined ? [[sl.fun1[k], 1]] : [])]);      // −n̂·v_göreli ≤ vd0 + kd h
      C.soc([F.vh0 / Vs, [...[0, 1, 2].map((j) => [X(k, j), F.kh * Ls / Vs * n[j]]), ...(sl.fun2[k] !== undefined ? [[sl.fun2[k], 1]] : [])]],
        [e1, e2].map((e) => [-dot(e, vs) / Vs, [0, 1, 2].map((j) => [X(k, 3 + j), e[j]])]));   // ‖v_yatay‖ ≤ vh0 + kh h
    }
  }
  if (P.vmax) for (let k = 0; k <= N; k++) C.soc([P.vmax / Vs, []], [0, 1, 2].map((j) => [0, [[X(k, 3 + j), 1]]]));
  if (P.reg) for (let k = 0; k < N; k++) for (let j = 0; j < 3; j++) C.quad(W(k, j), P.reg.w / N, P.reg.u[k][j] / As);   // sürekliliği korur: düz yönleri ayırt eder
  for (const key of ['glide', 'point', 'point2', 'fun1', 'fun2']) for (const j of sl[key]) if (j !== undefined) { C.geq(0, [[j, 1]]); C.cost(j, soft / N); }   // dolgu ≥ 0, ağır ceza
  // amaç
  if (!err) for (let k = 0; k < N; k++) C.cost(W(k, 3), 1 / N);
  else {
    C.cost(TE, 1);
    const [e1, e2] = perpBasis(nEnd);
    C.soc([0, [[TE, 1]]], [e1, e2].map((e) => [0, [0, 1, 2].map((j) => [X(N, j), e[j]])]));
  }
  // Clarabel'in "unknown" (yetersiz ilerleme) durumu sıkı toleransta görülür: tolerans gevşetilerek yeniden denenir (kesin infeasible/unbounded yeniden denenmez)
  let res = null;
  for (const tol of [opts.tol || 1e-9, 1e-8, 1e-7]) { res = C.solve({ tol }); if (res.ok || res.status === 'infeasible' || res.status === 'unbounded') break; }
  if (!res.x || !(res.ok || res.status.startsWith('almost'))) return { ok: false, status: res.status, tf, N, ms: res.ms };
  const x = res.x, out = { ok: true, status: res.status, tf, N, dt, ms: res.ms, iters: res.iters, r: [], v: [], m: [], u: [], sigma: [], thrust: [], gap: 0 };
  for (let k = 0; k <= N; k++) {
    out.r.push([0, 1, 2].map((j) => P.rf[j] + Ls * x[X(k, j)])); out.v.push([0, 1, 2].map((j) => Vs * x[X(k, 3 + j)])); out.m.push(P.m0 * Math.exp(x[X(k, 6)]));
  }
  for (let k = 0; k < N; k++) {
    const u = [0, 1, 2].map((j) => As * x[W(k, j)]), sg = As * x[W(k, 3)];
    out.u.push(u); out.sigma.push(sg); out.thrust.push(out.m[k] * sg);
    out.gap = Math.max(out.gap, (sg - norm(u)) / Math.max(sg, 1e-9));
  }
  if (soft) {
    const mx = (a, f) => a.reduce((q, j) => (j === undefined ? q : Math.max(q, f * x[j])), 0);
    out.viol = { glide: mx(sl.glide, Ls), point: mx(sl.point, 1), point2: mx(sl.point2, 1), vd: mx(sl.fun1, Vs), vh: mx(sl.fun2, Vs) };
    out.violMax = Math.max(out.viol.glide, out.viol.vd, out.viol.vh, 1e3 * out.viol.point, 1e3 * out.viol.point2);
  }
  out.zeta = out.m.map((m) => Math.log(m / P.m0));
  out.fuel = P.m0 - out.m[N];
  out.landErr = err ? Ls * x[TE] : norm(sub(out.r[N], P.rf));
  return out;
}

// ---------------------------------------------------------------- merkezi çekim, son zaman araması ve plan
// Çözüm düğümlerinden normalleşmiş zamanda (τ ∈ [0,1]) konum: kübik Hermite (v = dr/dt, tf ile ölçekli)
export function posAt(sol, tau) {
  const N = sol.N, x = Math.min(Math.max(tau, 0), 1) * N, k = Math.min(Math.floor(x), N - 1), s = x - k, h = sol.dt;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  return [0, 1, 2].map((j) => h00 * sol.r[k][j] + h10 * h * sol.v[k][j] + h01 * sol.r[k + 1][j] + h11 * h * sol.v[k + 1][j]);
}
// ilk referans: r0 ile rf arasında küresel (slerp) yol, yarıçap doğrusal; yalnız çekim yinelemesini başlatır
function slerpRef(r0, rf) {
  const a = norm(r0), b = norm(rf), c = Math.max(-1, Math.min(1, dot(r0, rf) / (a * b))), om = Math.acos(c), so = Math.sin(om);
  return (tau) => {
    if (so < 1e-9) return add(scale(r0, 1 - tau), scale(rf, tau));
    const w0 = Math.sin((1 - tau) * om) / so, w1 = Math.sin(tau * om) / so, rr = a + (b - a) * tau, d = add(scale(r0, w0 / a), scale(rf, w1 / b));
    return scale(d, rr / norm(d) * 1);
  };
}

// tf ve referans yol r(τ) için solveFixed girdisi: hedef (tf'e bağlı), merkezi çekim düğümlerde, yüzey (teğet yarı uzay)
export function makeForTf(P) {
  return (tf, r, Nn) => {
    const T = P.target ? P.target(tf) : {}, Q = { ...P, ...T };
    if (Q.up) {
      if (P.point) Q.point = { ...P.point, n: Q.up }; if (P.point2) Q.point2 = { ...P.point2, n: Q.up }; if (P.glide) Q.glide = { ...P.glide, n: Q.up };
      if (P.funnel) Q.funnel = { ...P.funnel, n: Q.up, vsite: T.vsite || P.funnel.vsite };
    }
    if (P.gfun) Q.g = Array.from({ length: Nn }, (_, k) => P.gfun(r((k + 0.5) / Nn)));
    if (P.surfaceR) Q.floor = Array.from({ length: Nn + 1 }, (_, k) => (k === Nn ? null : { n: unit(r(k / Nn)), h: P.surfaceR + (P.floorMargin || 0) }));
    return Q;
  };
}

// maliyet (kg eşdeğeri): yakıt + gevşek kısıt aşımı cezası (aşımsız çözümlerde yakıttır)
const costOf = (sol) => sol.fuel + (sol.viol ? 20 * (sol.viol.vd + sol.viol.vh) + 0.2 * sol.viol.glide + 5000 * (sol.viol.point + (sol.viol.point2 || 0)) : 0);
// ζ düğümlerinden normalleşmiş zamanda doğrusal ara değer (ż = −ασ aralıkta sabit olduğundan ζ parçalı doğrusaldır)
function zetaAt(sol, tau) { const x = Math.min(Math.max(tau, 0), 1) * sol.N, k = Math.min(Math.floor(x), sol.N - 1), f = x - k; return sol.zeta[k] + f * (sol.zeta[k + 1] - sol.zeta[k]); }
const zRefOf = (sol, Nn) => Array.from({ length: Nn }, (_, k) => zetaAt(sol, k / Nn));

// P: solveFixed girdisi + { gfun?: (r) => g (merkezi çekim; yoksa P.g sabit), target?: (tf) => { rf, vf, up, vsite }, surfaceR?, floorMargin? }
// opts: { N (son çözüm düğüm sayısı), Nsearch (arama düğümü, vars. ≤ 40), tfMin, tfMax, tfGuess, tfSpan, scan, passes, refine, convPasses }
// Arama iki aşamalıdır: (1) standart sınırlarla (en büyük itkı referanslı Taylor) kaba tarama + altın oran, (2) ardışık yaklaşımla (Taylor noktası = çözümün kendi kütle yolu)
// tf çevresinde yerel altın oran: standart sınırlar üst itki sınırını tf'ye bağlı olarak gereğinden sıkar, bu yüzden iki aşamanın en iyi tf'si birkaç yüzde ayrışabilir.
// Son çözüm daha sık ağda, çekim sabit noktasına kadar yinelenir.  Döner: { ok, sol, tf, fuel, search, calls, ms } ya da { ok:false, why }
export function solvePDG(P, opts = {}) {
  const Nf = opts.Nfinal || opts.N || 40, Ns = opts.Nsearch || Math.min(Nf, 40), t0 = Date.now(), search = [];
  const tgt0 = P.target ? P.target(opts.tfGuess || 100) : null;
  let ref = slerpRef(P.r0, tgt0 ? tgt0.rf : P.rf), calls = 0;
  const forTf = makeForTf(P), central = !!(P.gfun || P.surfaceR);
  const solve1 = (tf, Nn, r, zRef) => { calls++; return solveFixed({ ...forTf(tf, r, Nn), ...(zRef ? { zRef } : {}) }, tf, Nn); };
  const golden = (f, x1, x2, tol, maxIt = 16) => {
    const gr = (Math.sqrt(5) - 1) / 2; let c = x2 - gr * (x2 - x1), d = x1 + gr * (x2 - x1), fc = f(c), fd = f(d), it = 0;
    while (x2 - x1 > tol && it++ < maxIt) {
      if (fc < fd) { x2 = d; d = c; fd = fc; c = x2 - gr * (x2 - x1); fc = f(c); } else { x1 = c; c = d; fc = fd; d = x1 + gr * (x2 - x1); fd = f(d); }
    }
    return fc < fd ? [c, fc] : [d, fd];
  };
  const track = (sol) => { if (sol.ok && central) { const q = sol; ref = (tau) => posAt(q, tau); } };
  // aşama 1: standart sınırlar, tek çekim geçişi (referans her çözümle iyileşir)
  const J1 = (tf) => { const q = solve1(tf, Ns, ref); track(q); const J = q.ok ? costOf(q) : Infinity; search.push([tf, J, 1]); return J; };
  const vRel = norm(sub(P.v0, tgt0 ? tgt0.vf : P.vf));
  const lo = opts.tfMin ?? Math.max(2, 0.9 * P.mDry * vRel / P.rho2), hi = opts.tfMax ?? (P.m0 - P.mDry) / (P.alpha * Math.max(P.rho1, 1e-9));
  let a = lo, b = hi;
  if (opts.tfGuess) { const sp = opts.tfSpan ?? 0.25; a = Math.max(lo, opts.tfGuess * (1 - sp)); b = Math.min(hi, opts.tfGuess * (1 + 0.6 * sp)); }
  const M = opts.scan ?? 14, pts = [];
  for (let i = 0; i < M; i++) { const tf = a * (b / a) ** (i / (M - 1)); pts.push([tf, J1(tf)]); }
  let bi = -1; pts.forEach((p, i) => { if (p[1] < Infinity && (bi < 0 || p[1] < pts[bi][1])) bi = i; });
  if (bi < 0) return { ok: false, why: 'uygun son zaman bulunamadı', search, calls, ms: Date.now() - t0 };
  let [tfb] = golden(J1, pts[Math.max(0, bi - 1)][0], pts[Math.min(M - 1, bi + 1)][0], Math.max(0.3, 0.004 * pts[bi][0]), 12);
  // aşama 2: ardışık yaklaşımla yerel arama; en iyi çözüm tutulur
  let best = null;
  const J2 = (tf) => {
    const a1 = solve1(tf, Ns, ref); if (!a1.ok) { search.push([tf, Infinity, 2]); return Infinity; }
    track(a1);
    const q = solve1(tf, Ns, ref, a1.zeta.slice(0, Ns)), pick = q.ok && costOf(q) <= costOf(a1) + 1e-9 ? q : a1, J = costOf(pick);
    search.push([tf, J, 2]); if (!best || J < costOf(best)) { best = pick; track(pick); } return J;
  };
  if ((opts.refine ?? 1) > 0) { [tfb] = golden(J2, tfb * 0.96, tfb * 1.04, Math.max(0.25, 0.003 * tfb), 8); J2(tfb); }
  else { const q = solve1(tfb, Ns, ref); if (q.ok) best = q; }
  if (!best) return { ok: false, why: 'son çözüm başarısız', search, calls, ms: Date.now() - t0 };
  // son çözüm: istenen düğüm sayısında, çekim sabit noktasına kadar
  const bs = best;
  let fin = solve1(bs.tf, Nf, (tau) => posAt(bs, tau), zRefOf(bs, Nf));
  if (!fin.ok) fin = bs;
  fin = converge(P, fin, forTf, central, opts.convPasses ?? 2, () => calls++);
  return { ok: true, sol: fin, tf: fin.tf, fuel: fin.fuel, search, calls, ms: Date.now() - t0 };
}
// merkezi çekim sabit noktası: çekim, önceki çözümün yolu boyunca yeniden değerlendirilir (her geçişte hata ~10 kat azalır); Taylor noktası da çözümden alınır
function converge(P, sol, forTf, central, passes, count = () => {}) {
  if (!central) return sol;
  for (let i = 0; i < passes; i++) {
    const s0 = sol; count();
    const q = solveFixed({ ...forTf(s0.tf, (tau) => posAt(s0, tau), s0.N), zRef: s0.zeta.slice(0, s0.N) }, s0.tf, s0.N);
    if (!q.ok) break;
    let dr = 0; for (let k = 0; k <= q.N; k++) dr = Math.max(dr, norm(sub(q.r[k], s0.r[k])));
    sol = q; if (dr < 0.2) break;
  }
  return sol;
}

// Kapalı döngü yeniden çözüm (sıcak başlangıç): çekim yolu, Taylor noktası ve (opts.reg > 0 ise) kumanda önceki plandan alınır; her değerlendirme tek çözümdür.
// Varsayılan: iniş anı sabit (kalan süre) — yakıt tf'de düz olduğundan sık tf araması planı sürükler; yalnız uygun değilse kalan süre uzatılır.
// opts.span > 0 ise çevresinde altın oran araması yapılır (seyrek yeniden eniyileme için). prev: { t0 (mutlak), sol }, tNow: mutlak zaman.
// P.r0, P.v0, P.m0 şimdiki durumdur. Döner: { ok, sol, tf, fuel, calls, ms } (sol'ün zamanı tNow'dan başlar)
export function replanPDG(P, prev, tNow, opts = {}) {
  const t0 = Date.now(), ps = prev.sol, N = opts.N || ps.N, dtp = ps.dt, forTf = makeForTf(P), central = !!(P.gfun || P.surfaceR);
  const rem = prev.t0 + ps.tf - tNow;
  if (!(rem > 0.5)) return { ok: false, why: 'plan bitti', calls: 0, ms: 0 };
  const posPrev = (t) => posAt(ps, (t - prev.t0) / ps.tf);
  const zetaPrev = (t) => { const x = (t - prev.t0) / dtp, k = Math.min(ps.N - 1, Math.max(0, Math.floor(x))), f = Math.min(1, Math.max(0, x - k)); return ps.zeta[k] + f * (ps.zeta[k + 1] - ps.zeta[k]); };
  const uPrev = (t) => ps.u[Math.min(ps.N - 1, Math.max(0, Math.floor((t - prev.t0) / dtp + 1e-9)))];
  const z0 = zetaPrev(tNow), regW = opts.reg ?? 0, stat = []; let calls = 0, best = null;
  const J = (tf) => {
    calls++;
    const Q = forTf(tf, (tau) => posPrev(tNow + tau * tf), N);
    Q.zRef = Array.from({ length: N }, (_, k) => zetaPrev(tNow + k * tf / N) - z0);
    if (regW > 0) Q.reg = { w: regW, u: Array.from({ length: N }, (_, k) => uPrev(tNow + (k + 0.5) * tf / N)) };
    const q = solveFixed(Q, tf, N, { tol: opts.tol });
    stat.push(`${tf.toFixed(1)}:${q.status}`);
    if (!q.ok) return Infinity;
    const c = costOf(q); if (!best || c < costOf(best)) best = q;
    return c;
  };
  const f0 = J(rem);
  if (f0 === Infinity) {                                                           // kalan süre yetmiyor: uzatarak ara
    let tf = rem, ok = false; for (let i = 0; i < 14 && !ok; i++) { tf *= 1.06; ok = J(tf) < Infinity; }
    if (!ok) return { ok: false, why: 'yeniden çözüm uygun değil', stat, calls, ms: Date.now() - t0 };
  } else if (best.viol && best.violMax > (opts.violTol ?? 0.05)) {                // sabit iniş anında hız hunisi/işaretleme aşılıyor: iniş anını uzat (hız hunisi ihlalini en aza indirir)
    let tf = rem; for (let i = 0; i < 10; i++) { tf *= 1.04; const fv = J(tf); if (best.violMax <= (opts.violTol ?? 0.05) || fv === Infinity) break; }
  }
  if ((opts.span ?? 0) > 0 && best) {
    const gr = (Math.sqrt(5) - 1) / 2, c0 = best.tf; let a = c0 * (1 - opts.span), b = c0 * (1 + opts.span);
    const tol = Math.max(0.15, 0.004 * c0); let c = b - gr * (b - a), d = a + gr * (b - a), fc = J(c), fd = J(d), it = 0;
    while (b - a > tol && it++ < 8) { if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = J(c); } else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = J(d); } }
  }
  best = converge(P, best, forTf, central, opts.convPasses ?? 1, () => calls++);
  return { ok: true, sol: best, tf: best.tf, fuel: best.fuel, stat, calls, ms: Date.now() - t0 };
}

// düğüm aralığındaki sabit (ZOH) kumanda: t, planın başlangıcından geçen süre (s)
export function controlAt(sol, t) {
  const k = Math.min(sol.N - 1, Math.max(0, Math.floor(t / sol.dt + 1e-9)));
  return { k, u: sol.u[k], sigma: sol.sigma[k], thrust: sol.thrust[k] };
}
// Uçuşta kullanılan kumanda: düğüm değerleri aralık ORTASINDA geçerli sayılıp aralarında doğrusal ara değer alınır (ZOH basamakları yerine sürekli itki vektörü).
// Aralık başına ortalama ivme korunur (ikinci farkın sekizde biri kadar sapma, komşu aralıklarda ters işaretli); ZOH'a göre yalnız itki yönü ve gazın basamakları yumuşar.
// from: bu indeksten önceki düğümler komşu olarak kullanılmaz (from = 1: ilk düğüm atlanır; kapalı döngüde yeni planın ilk düğümü önceki komuttan kesintisiz bağlanan ayrı bir eğriyle değiştirilir,
// ikinci aralığın ilk yarısı onu karıştırmadan düğüm 1'in değerinde kalır).
export function controlAtSmooth(sol, t, from = 0) {
  const N = sol.N, x = t / sol.dt, k = Math.min(N - 1, Math.max(0, Math.floor(x + 1e-9))), s = Math.min(1, Math.max(0, x - k));
  const j = s < 0.5 ? Math.max(from, k - 1) : Math.min(N - 1, k + 1), w = s < 0.5 ? (j >= k ? 0 : 0.5 - s) : (j === k ? 0 : s - 0.5);        // u_k'dan komşu aralık ortasına doğru
  const a = sol.u[k], b = sol.u[j], u = [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  return { k, u, sigma: sol.sigma[k], thrust: sol.thrust[k] };
}
