// Asteroit iş parçacığı: JPL SBDB oskülatör öğelerinden (Güneş merkezli, J2000 ekliptiği) iki cisim Kepler çözümüyle
// her asteroidin Güneş merkezli ICRF konum/hızı. Görüntü için yeterli (gezegen pertürbasyonları saptırma motorunda).
const AU = 149597870.7, GM = 132712440041.279419, D2R = Math.PI / 180;
const EPS = (84381.448 / 3600) * D2R, CE = Math.cos(EPS), SE = Math.sin(EPS);
let N = 0, K = null;       // K: nesne başına [ep(s, J2000), n, M0, a, e, P(3), Q(3)] önceden hesaplı

onmessage = (ev) => {
  const d = ev.data;
  if (d.cmd === 'load') {
    const c = d.cols; N = c.a.length; K = new Float64Array(N * 12);
    for (let i = 0; i < N; i++) {
      const a = c.a[i] * AU, e = c.e[i], O = c.om[i] * D2R, inc = c.i[i] * D2R, w = c.w[i] * D2R;
      const cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc), cw = Math.cos(w), sw = Math.sin(w);
      const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si], Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
      const o = i * 12;
      K[o] = (c.ep[i] - 2451545.0) * 86400; K[o + 1] = e < 1 && a > 0 ? Math.sqrt(GM / (a * a * a)) : NaN; K[o + 2] = c.ma[i] * D2R; K[o + 3] = a; K[o + 4] = e;
      // ekliptik -> ICRF dönüşümü P ve Q'ya gömülür
      K[o + 5] = P[0]; K[o + 6] = CE * P[1] - SE * P[2]; K[o + 7] = SE * P[1] + CE * P[2];
      K[o + 8] = Q[0]; K[o + 9] = CE * Q[1] - SE * Q[2]; K[o + 10] = SE * Q[1] + CE * Q[2];
    }
    postMessage({ type: 'loaded', n: N });
    return;
  }
  if (d.cmd === 'prop') {
    const pos = new Float32Array(3 * N), vel = new Float32Array(3 * N), et = d.et;
    for (let i = 0; i < N; i++) {
      const o = i * 12, n = K[o + 1];
      if (!(n > 0)) { pos[3 * i] = pos[3 * i + 1] = pos[3 * i + 2] = NaN; continue; }
      const a = K[o + 3], e = K[o + 4];
      let M = (K[o + 2] + n * (et - K[o])) % (2 * Math.PI); if (M > Math.PI) M -= 2 * Math.PI; else if (M < -Math.PI) M += 2 * Math.PI;
      let E = e < 0.8 ? M : (M >= 0 ? Math.PI : -Math.PI);
      for (let k = 0; k < 30; k++) { const f = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= f; if (Math.abs(f) < 1e-12) break; }
      const cE = Math.cos(E), sE = Math.sin(E), b = a * Math.sqrt(1 - e * e), r = a * (1 - e * cE);
      const xp = a * (cE - e), yp = b * sE, vxp = -a * a * n * sE / r, vyp = b * a * n * cE / r;
      for (let k = 0; k < 3; k++) {
        pos[3 * i + k] = K[o + 5 + k] * xp + K[o + 8 + k] * yp;
        vel[3 * i + k] = K[o + 5 + k] * vxp + K[o + 8 + k] * vyp;
      }
    }
    postMessage({ type: 'pos', id: d.id, et, pos, vel }, [pos.buffer, vel.buffer]);
  }
};
