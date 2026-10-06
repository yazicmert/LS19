// REFERANS (eski) uygulama: iniş arazisinin ana iş parçacığında, THREE.BufferGeometry.computeVertexNormals ve tuval dokusuyla üretildiği özgün sürüm.
// js/terraingen.js (worker'da çalışan saf sayısal kod) bunun çıktısıyla bit düzeyinde aynı olmalı: test/test_terrain.js karşılaştırır. Özgün kodda değişiklik yok.
// İniş bölgesi arazisi: Apollo 11 iniş yeri çevresinde 60 km yarıçaplı yama.
// Taban: LOLA 16 ppd yükseklik (site_dem.json); iniş noktası çevresi fizikteki R_SITE yüzeyine oturtulur;
// üzerine deterministik krater alanı + ince pürüzlülük eklenir. Kenarda küresel Ay ağına (LOLA ile yer değiştirmiş) bağlanır.
import * as THREE from 'three';

export const PATCH_R = 60.0;      // km
export const HOLE_R = 52.0;       // km: küresel ağ bu yarıçapın içinde çizilmez

function hash2(ix, iy, s) {                 // [0,1) deterministik
  let h = (ix * 374761393 + iy * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {                  // değer gürültüsü
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// krater sınıfları: yarıçap (km), hücre boyu, doluluk olasılığı
const CRATERS = [[1.6, 9.0, 0.45], [0.7, 4.0, 0.45], [0.3, 1.8, 0.5], [0.12, 0.75, 0.5], [0.05, 0.32, 0.55], [0.02, 0.13, 0.55], [0.008, 0.055, 0.5]];

export function craterField(x, y) {        // km -> km (yükseklik), ve taze krater parlaklığı
  let h = 0, fresh = 0;
  for (let k = 0; k < CRATERS.length; k++) {
    const [r0, cell, occ] = CRATERS[k];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy;
      if (hash2(gx, gy, 11 + k) > occ) continue;
      const px = (gx + hash2(gx, gy, 23 + k)) * cell, py = (gy + hash2(gx, gy, 37 + k)) * cell;
      const r = r0 * (0.55 + 0.9 * hash2(gx, gy, 51 + k));
      const d = Math.hypot(x - px, y - py) / r;
      if (d > 1.8) continue;
      const age = hash2(gx, gy, 71 + k);                    // yaşlı kraterler yumuşak
      const depth = r * (0.14 + 0.1 * (1 - age));
      if (d < 1) h += -depth * (1 - d * d) * (0.6 + 0.4 * (1 - age));
      h += depth * 0.22 * Math.exp(-(((d - 1) / 0.28) ** 2)) * (1 - 0.6 * age);
      if (d < 1.3 && age < 0.25) fresh = Math.max(fresh, (1 - age / 0.25) * (1 - d / 1.3));
    }
  }
  // ince dalgalanma (fBm)
  let a = 0.0025, f = 1 / 0.08, n = 0;
  for (let o = 0; o < 4; o++) { n += a * (vnoise(x * f, y * f, 101 + o) - 0.5); a *= 0.45; f *= 2.3; }
  return [h + n, fresh];
}

// dem: site_dem.json; siteDir: iniş yeri birim vektörü (ME); hSite: R_SITE - R_M (km)
// yakın plan için döşenebilir ayrıntı normal haritası (regolit pürüzü + metre ölçekli çukurlar)
export function detailNormalTexture(size = 512) {
  const H = new Float32Array(size * size);
  const wrap = (i) => ((i % size) + size) % size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0, a = 1, f = 8;
    for (let o = 0; o < 5; o++) { h += a * (vnoise((x / size) * f, (y / size) * f, 300 + o) - 0.5); a *= 0.5; f *= 2; }   // tile için f tam sayı
    H[y * size + x] = h * 0.6;
  }
  for (let k = 0; k < 70; k++) {                       // küçük çukurlar
    const cx = hash2(k, 1, 901) * size, cy = hash2(k, 2, 902) * size, r = 4 + 26 * hash2(k, 3, 903) ** 2;
    for (let dy = -r * 1.6; dy <= r * 1.6; dy++) for (let dx = -r * 1.6; dx <= r * 1.6; dx++) {
      const d = Math.hypot(dx, dy) / r; const i = wrap(Math.round(cy + dy)) * size + wrap(Math.round(cx + dx));
      if (d < 1) H[i] -= 0.9 * (1 - d * d); else if (d < 1.6) H[i] += 0.2 * Math.exp(-(((d - 1) / 0.25) ** 2));
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = H[y * size + wrap(x + 1)] - H[y * size + wrap(x - 1)], hy = H[wrap(y + 1) * size + x] - H[wrap(y - 1) * size + x];
    let nx = -hx * 1.5, ny = hy * 1.5, nz = 1; const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
    const i = (y * size + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.channel = 1; t.anisotropy = 8;
  return t;
}

export function buildTerrain(dem, siteLatDeg, siteLonDeg, R_M, hSite, N = 513) {
  const lat0 = siteLatDeg * Math.PI / 180, lon0 = siteLonDeg * Math.PI / 180;
  const up = [Math.cos(lat0) * Math.cos(lon0), Math.cos(lat0) * Math.sin(lon0), Math.sin(lat0)];
  const east = [-Math.sin(lon0), Math.cos(lon0), 0];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  const demH = (latD, lonD) => {                 // LOLA çift doğrusal
    const fy = (dem.lat_top - latD) / dem.step_deg, fx = (lonD - dem.lon_left) / dem.step_deg;
    const y0 = Math.max(0, Math.min(dem.rows - 2, Math.floor(fy))), x0 = Math.max(0, Math.min(dem.cols - 2, Math.floor(fx)));
    const ty = Math.min(1, Math.max(0, fy - y0)), tx = Math.min(1, Math.max(0, fx - x0));
    const g = dem.h;
    return (g[y0][x0] * (1 - tx) + g[y0][x0 + 1] * tx) * (1 - ty) + (g[y0 + 1][x0] * (1 - tx) + g[y0 + 1][x0 + 1] * tx) * ty;
  };
  const sitePos = up.map((c) => c * (R_M + hSite));
  const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2), uv1 = new Float32Array(N * N * 2), col = new Float32Array(N * N * 3);
  const P = 3.2, idx = [];
  const map = (s) => PATCH_R * Math.sign(s) * Math.abs(s) ** P;
  let i = 0;
  for (let iy = 0; iy < N; iy++) {
    const y = map(-1 + (2 * iy) / (N - 1));
    for (let ix = 0; ix < N; ix++) {
      const x = map(-1 + (2 * ix) / (N - 1));
      const rr = Math.hypot(x, y);
      // yön (teğet düzlemden küreye)
      const dx = up[0] + (east[0] * x + north[0] * y) / R_M, dy = up[1] + (east[1] * x + north[1] * y) / R_M, dz = up[2] + (east[2] * x + north[2] * y) / R_M;
      const dn = Math.hypot(dx, dy, dz), ux = dx / dn, uy = dy / dn, uz = dz / dn;
      const latD = Math.asin(uz) * 180 / Math.PI, lonD = Math.atan2(uy, ux) * 180 / Math.PI;
      let base = demH(latD, lonD);
      base = base + (hSite - base) * (1 - smooth(3.0, 12.0, rr));        // iniş noktası fizik yüzeyine oturur
      const [cf, fresh] = craterField(x, y);
      const detailAmp = smooth(0.015, 0.06, rr) * (1 - smooth(46, 56, rr));  // iniş noktası düz, kenarda sıfır
      let h = base + cf * detailAmp;
      h -= 0.05 * smooth(HOLE_R, PATCH_R, rr) + (rr > PATCH_R * 0.985 ? 0.4 : 0);   // kenar: küreye yer bırak + etek
      const R = R_M + h;
      pos[i * 3] = ux * R - sitePos[0]; pos[i * 3 + 1] = uy * R - sitePos[1]; pos[i * 3 + 2] = uz * R - sitePos[2];
      uv[i * 2] = (lonD + 180) / 360; uv[i * 2 + 1] = (latD + 90) / 180;
      uv1[i * 2] = x / 0.012; uv1[i * 2 + 1] = y / 0.012;          // ayrıntı dokusu: 12 m'de bir döşeme
      const alb = 0.9 + 0.2 * (vnoise(x * 3.1, y * 3.1, 7) - 0.5) + 0.12 * (vnoise(x * 40, y * 40, 9) - 0.5) + 0.35 * fresh * detailAmp;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = alb;
      i++;
    }
  }
  for (let iy = 0; iy < N - 1; iy++) for (let ix = 0; ix < N - 1; ix++) {
    const a = iy * N + ix, b = a + 1, c = a + N, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, sitePosMe: sitePos, up, east, north };
}
