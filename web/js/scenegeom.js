// Sahne yardımcıları (scene.js'ten ayrıldı): küre geometrisi, yönelim matrisleri, ışıltı/halka dokuları, oskülatör konik örnekleme.
import * as THREE from 'three';
import { sub, scale, dot, cross, norm, unit } from './vec3.js';

export const SUN_I = 1.6;                       // tonlamadan önce Güneş aydınlığı (Ay, araç, arazi)

export function sphereGeometry(R, nLon, nLat) {
  // dizin sayısı kesin bilinir (kutup şeritlerinde tek üçgen): düz tipli dizi, ara JS dizisi (3 milyon eleman) ve boyut dönüşümü yok
  const n = (nLon + 1) * (nLat + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new (n > 65535 ? Uint32Array : Uint16Array)(6 * nLon * (nLat - 1));
  const cx = new Float64Array(nLon + 1), sx = new Float64Array(nLon + 1);                  // boylam kosinüs/sinüsü satırdan satıra aynı
  for (let k = 0; k <= nLon; k++) { const lon = -Math.PI + (k / nLon) * 2 * Math.PI; cx[k] = Math.cos(lon); sx[k] = Math.sin(lon); }
  let i = 0;
  for (let j = 0; j <= nLat; j++) {
    const v = j / nLat, lat = -Math.PI / 2 + v * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let k = 0; k <= nLon; k++) {
      pos[i * 3] = R * cl * cx[k]; pos[i * 3 + 1] = R * cl * sx[k]; pos[i * 3 + 2] = R * sl;
      uv[i * 2] = k / nLon; uv[i * 2 + 1] = v; i++;
    }
  }
  let q = 0;
  for (let j = 0; j < nLat; j++) for (let k = 0; k < nLon; k++) {
    const a = j * (nLon + 1) + k, b = a + 1, c = a + nLon + 1, d = c + 1;
    if (j > 0) { idx[q++] = a; idx[q++] = b; idx[q++] = d; }
    if (j < nLat - 1) { idx[q++] = a; idx[q++] = d; idx[q++] = c; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
export const m3ToQuat = (M) => {            // satır matrisi (ICRF sütunları) -> THREE.Quaternion; M: yerel -> ICRF
  const m = new THREE.Matrix4().set(M[0][0], M[0][1], M[0][2], 0, M[1][0], M[1][1], M[1][2], 0, M[2][0], M[2][1], M[2][2], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(m);
};
export function bodyMatrix(z, ref) {       // z ekseni verilen, x ref'e yakın: yerel -> ICRF (sütunlar x,y,z)
  z = unit(z); let x = sub(ref, scale(z, dot(ref, z)));
  if (norm(x) < 1e-6) x = cross(z, [0, 0, 1]);
  x = unit(x); const y = cross(z, x);
  return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
}
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function ringTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.strokeStyle = 'white'; g.lineWidth = size * 0.1; g.beginPath(); g.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'white'; g.beginPath(); g.arc(size / 2, size / 2, size * 0.12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function unit3(a) { const u = unit(a); return new THREE.Vector3(u[0], u[1], u[2]); }

// oskülatör konik noktaları (merkeze göre): her nokta için f(i, x, y, z) çağrılır (ara dizi yok); döner: nokta sayısı n
export function conicEach(el, r, mu, rMax, n, f) {
  const e = el.e, p = el.p, W = unit(el.h);
  const Pv = e > 1e-8 ? scale(el.evec, 1 / e) : unit(r), Qv = cross(W, Pv);
  let nu0, nu1;
  if (e < 1 && p / (1 - e) <= rMax) { nu0 = 0; nu1 = 2 * Math.PI; }
  else {
    let lim = Math.acos(Math.max(-1, Math.min(1, (p / rMax - 1) / e)));
    if (e >= 1) lim = Math.min(lim, Math.acos(-1 / e) - 1e-3);
    nu0 = -lim; nu1 = lim;
  }
  for (let i = 0; i < n; i++) {
    const nu = nu0 + ((nu1 - nu0) * i) / (n - 1), rr = p / (1 + e * Math.cos(nu)), a = rr * Math.cos(nu), b = rr * Math.sin(nu);
    f(i, Pv[0] * a + Qv[0] * b, Pv[1] * a + Qv[1] * b, Pv[2] * a + Qv[2] * b);
  }
  return n;
}
export function conicPoints(el, r, mu, rMax, n) {
  const out = []; conicEach(el, r, mu, rMax, n, (i, x, y, z) => out.push([x, y, z])); return out;
}
// sınıf yöntemlerini (getter/async dahil) hedef sınıfın prototipine kopyalar: World'ü dosyalara bölmek için
export function mixin(Target, ...Srcs) {
  for (const S of Srcs) for (const k of Object.getOwnPropertyNames(S.prototype)) if (k !== 'constructor') Object.defineProperty(Target.prototype, k, Object.getOwnPropertyDescriptor(S.prototype, k));
}
