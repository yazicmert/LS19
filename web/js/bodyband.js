// Gök cisimlerinin küre ağında kameradan görülebilen bölge (saf; Node'da sınanır: test/test_bodyband.js). Ağ: scenegeom.js › sphereGeometry.
// Yüzey yarıçapı [rMin, rMax] içindeyse (kabartma, kiriş hatası), kameradan d > rMax uzaklıkta görülebilecek bir noktanın kameranın altındaki
// noktaya açısı ψ ≤ acos(rMin/d) + acos(rMin/rMax): görünür bir noktaya giden doğru parçası rMin küresinin içinden geçemez (yüzey her yerde ≥ rMin),
// en uç durum parçanın rMin küresine teğet olmasıdır. Kamera kabartma kabuğunun içindeyken de (rMin < d ≤ rMax, alçak iniş) geçerlidir.

// Ufuk yamaları: ince küre ağının dizini enlem dilimi (pr satır) × boylam dilimi (pc sütun) yamaları halinde sıralanır (patchIndex; sphereGeometry
// { patch }). Her yamanın birim yön konisi (merkez, açısal yarıçap) önceden hesaplanır. Bir yama, konisi kameranın altındaki noktaya
// ψ + yarıçap açısından uzaksa görülemez. Görülebilen yamalar dizinde art arda olanlar birleştirilerek
// [başlangıç, sayı] aralıkları olarak döner (geometry.groups: her aralık bir çizim çağrısı). Önceki enlem bandı yalnız satırları kırpıyordu:
// Ay'a ekvatordan bakınca ağın tamamı çiziliyordu; yamalar arka yarıyı da atar (9.000 km'de ağın %59'u).
// Hücre başına üçgen: kutup satırlarında (j = 0, j = H − 1) bir, aradakilerde iki (sphereGeometry ile aynı).
const cellIdx = (j, H) => 3 * ((j > 0 ? 1 : 0) + (j < H - 1 ? 1 : 0));
export function patchIndex(W, H, pr, pc, idx = null) {
  const n = (W + 1) * (H + 1); idx = idx || new (n > 65535 ? Uint32Array : Uint16Array)(6 * W * (H - 1));
  let q = 0;
  for (let c = 0; c < H / pr; c++) for (let s = 0; s < W / pc; s++) for (let j = c * pr; j < (c + 1) * pr; j++) for (let k = s * pc; k < (s + 1) * pc; k++) {
    const a = j * (W + 1) + k, b = a + 1, cc = a + W + 1, d = cc + 1;
    if (j > 0) { idx[q++] = a; idx[q++] = b; idx[q++] = d; }
    if (j < H - 1) { idx[q++] = a; idx[q++] = d; idx[q++] = cc; }
  }
  return idx;
}
export function patchTable(W, H, pr, pc) {
  const nC = H / pr, nS = W / pc, N = nC * nS, start = new Int32Array(N), count = new Int32Array(N), cen = new Float64Array(3 * N), half = new Float64Array(N);
  const dir = (j, k) => { const lat = -Math.PI / 2 + (j / H) * Math.PI, lon = -Math.PI + (k / W) * 2 * Math.PI; return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]; };
  let q = 0;
  for (let c = 0; c < nC; c++) for (let s = 0; s < nS; s++) {
    const i = c * nS + s, j0 = c * pr, j1 = j0 + pr, k0 = s * pc, k1 = k0 + pc;
    start[i] = q; for (let j = j0; j < j1; j++) q += pc * cellIdx(j, H); count[i] = q - start[i];
    let x = 0, y = 0, z = 0;
    for (const [j, k] of [[j0, k0], [j0, k1], [j1, k0], [j1, k1], [(j0 + j1) / 2, (k0 + k1) / 2]]) { const v = dir(j, k); x += v[0]; y += v[1]; z += v[2]; }
    const L = Math.hypot(x, y, z); x /= L; y /= L; z /= L;
    let h = 0;                                                                     // köşelerin en büyük açısı: üçgenlerin içi köşelerin küresel kabuğunda kalır
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const v = dir(j, k); h = Math.max(h, Math.acos(Math.max(-1, Math.min(1, v[0] * x + v[1] * y + v[2] * z)))); }
    cen[3 * i] = x; cen[3 * i + 1] = y; cen[3 * i + 2] = z; half[i] = h;
  }
  return { W, H, pr, pc, nC, nS, start, count, cen, half, total: q };
}
// p: kameranın kürenin yerel çerçevesindeki konumu (km); out: yeniden kullanılan dizi ([başlangıç, sayı] çiftleri düz: [s0, n0, s1, n1, …]).
// Kamera yüzeyin altındaysa (d ≤ rMin) ağın tamamı. eps: köşe yuvarlaması ve kayan nokta payı (rad).
export function patchRanges(p, rMin, rMax, T, out = [], eps = 2e-3) {
  out.length = 0;
  const d = Math.hypot(p[0], p[1], p[2]);
  if (!(d > rMin) || !(rMin > 0)) { out.push(0, T.total); return out; }
  const psi = Math.acos(Math.min(1, rMin / d)) + Math.acos(Math.min(1, rMin / rMax)) + eps, ex = p[0] / d, ey = p[1] / d, ez = p[2] / d;
  const N = T.start.length;
  let s0 = -1, e0 = -1;
  for (let i = 0; i < N; i++) {
    const c = T.cen, dt = c[3 * i] * ex + c[3 * i + 1] * ey + c[3 * i + 2] * ez;
    if (Math.acos(Math.max(-1, Math.min(1, dt))) > psi + T.half[i]) continue;
    const st = T.start[i], en = st + T.count[i];
    if (st === e0) e0 = en; else { if (s0 >= 0) out.push(s0, e0 - s0); s0 = st; e0 = en; }
  }
  if (s0 >= 0) out.push(s0, e0 - s0);
  return out;
}
