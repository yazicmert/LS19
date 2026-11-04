// Dormand–Prince 5(4) Butcher tablosu ve genel boyutlu uyarlanır adım. Tek kaynak: tablo engine, ephem, deflect, cr3bp ve halo'da ayrı ayrı yazılıydı.
// Hız gerektiren özel döngüler (engine: r/v ayrık, ephem: FSAL + yoğun çıktı, deflect: STM) kendi döngülerini korur, yalnız tabloyu buradan alır.
export const DP_A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
export const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
export const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
export const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
export const DP_E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];   // hata tahmini katsayıları (B5 − B4, kesirli yazım)

// tek adım: f(t, Y) → Float64Array; errScale(q, y0, y5) → q. bileşenin hata ölçeği (yalnız ilk nErr bileşen ölçülür)
// dönüş [y5, err] (err ≤ 1: kabul)
export function dpStep(f, t, Y, h, errScale, nErr = Y.length) {
  const n = Y.length, K = [];
  for (let i = 0; i < 7; i++) {
    const Yi = new Float64Array(Y);
    for (let j = 0; j < i; j++) { const a = DP_A[i][j]; if (a) { const kj = K[j]; for (let q = 0; q < n; q++) Yi[q] += h * a * kj[q]; } }
    K.push(f(t + DP_C[i] * h, Yi));
  }
  const y5 = new Float64Array(Y); let err = 0;
  for (let q = 0; q < n; q++) {
    let s5 = 0, s4 = 0;
    for (let i = 0; i < 7; i++) { s5 += DP_B5[i] * K[i][q]; s4 += DP_B4[i] * K[i][q]; }
    y5[q] += h * s5;
    if (q < nErr) err = Math.max(err, Math.abs(h * (s5 - s4)) / errScale(q, Y[q], y5[q]));
  }
  return [y5, err];
}
// t0 → t1 uyarlanır tümleme. opts: h0 (ilk adım, işaretsiz), hmax, errScale, nErr, stop(tn, Yn, Y, t) (true: dur, son kabul edilmeyen adımla döner), onStep(t, Y), tol (bitiş toleransı)
export function dpIntegrate(f, Y0, t0, t1, { h0, hmax = Infinity, errScale, nErr, stop = null, onStep = null, tol = 1e-14 }) {
  let Y = Y0, t = t0, h = Math.sign(t1 - t0) * h0;
  while ((t1 - t) * Math.sign(h) > tol) {
    if (Math.abs(h) > Math.abs(t1 - t)) h = t1 - t;
    const [Yn, err] = dpStep(f, t, Y, h, errScale, nErr);
    if (err > 1) { h *= Math.max(0.2, 0.9 * err ** -0.2); continue; }
    const tn = t + h;
    if (stop && stop(tn, Yn, Y, t)) return { t, Y, tn, Yn, stopped: true };
    t = tn; Y = Yn; if (onStep) onStep(t, Y);
    h = Math.sign(h) * Math.min(Math.abs(h) * Math.min(5, 0.9 * Math.max(err, 1e-10) ** -0.2), hmax);
  }
  return { t, Y, stopped: false };
}
