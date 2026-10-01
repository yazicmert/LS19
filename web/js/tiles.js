// Yakınlaştıkça yüksek çözünürlüklü yüzey: küre üzerinde kuadağaç (quadtree) parça (tile) yükleyici.
// Dünya: NASA GIBS (Blue Marble + kabartma + deniz tabanı, ≈490 m/piksel) · Ay: NASA Trek (LRO WAC mozaiği, ≈83 m/piksel). Her ikisi de kamu malı,
// tarayıcıdan doğrudan (CORS açık). Taban küre (8K doku) uzaktan yeter; kamera yaklaştıkça yalnız görünen bölgenin daha ince parçaları iner.
// Her parça, taban küreyle aynı gölgelendiriciyi kullanan küçük bir küre dilimidir (aynı ışık, bulut, gece ışıkları, gölge, kabartma).
import * as THREE from 'three';

const D2R = Math.PI / 180;
const NSEG = 14;

// ızgara şemaları: parça açısal genişliği (derece), sütun/satır sayısı
export const SCHEMES = {
  gibs: { span: (z) => 288 / 2 ** z, cols: (z) => Math.ceil(360 / (288 / 2 ** z) - 1e-9), rows: (z) => Math.ceil(180 / (288 / 2 ** z) - 1e-9) },     // EPSG:4326, 512 px
  eq: { span: (z) => 180 / 2 ** z, cols: (z) => 2 ** (z + 1), rows: (z) => 2 ** z },                                                              // Trek eşdikdörtgen, 256 px
};

function tileGeometry(R, lat0, lat1, lon0, lon1, uMax, vMin, lift) {
  const n = NSEG, pos = [], uvg = [], uvt = [], idx = [], r = R * (1 + lift);
  for (let i = 0; i <= n; i++) {
    const a = lat1 + (lat0 - lat1) * (i / n), ca = Math.cos(a * D2R), sa = Math.sin(a * D2R);
    for (let j = 0; j <= n; j++) {
      const l = lon0 + (lon1 - lon0) * (j / n), cl = Math.cos(l * D2R), sl = Math.sin(l * D2R);
      pos.push(r * ca * cl, r * ca * sl, r * sa);
      uvg.push((l + 180) / 360, (a + 90) / 180);
      uvt.push(uMax * (j / n), 1 - (1 - vMin) * (i / n));
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvg, 2)); g.setAttribute('uvT', new THREE.Float32BufferAttribute(uvt, 2));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.01); return g;
}

export class TileLayer {
  // cfg: { parent, R (km), scheme: 'gibs'|'eq', tileSize, minZ, maxZ, url(z, x, y), baseTexelKm, lift, material(tex, node) -> THREE.Material, maxTextures }
  constructor(cfg) {
    Object.assign(this, cfg);
    this.S = SCHEMES[cfg.scheme]; this.nodes = new Map(); this.cache = new Map(); this.meshes = new Map(); this.queue = []; this.active = 0; this.frame = 0;
    this.maxTextures = cfg.maxTextures || 150; this.group = new THREE.Group(); this.group.frustumCulled = false; cfg.parent.add(this.group);
    this.loader = new THREE.TextureLoader(); this.loader.setCrossOrigin('anonymous'); this.enabled = true; this.stats = { drawn: 0, pending: 0, cached: 0, maxZ: 0 };
  }
  node(z, x, y) {
    const key = z + '/' + x + '/' + y; let n = this.nodes.get(key); if (n) return n;
    const S = this.S, span = S.span(z), lon0 = -180 + x * span, lat1 = 90 - y * span, lon1 = Math.min(180, lon0 + span), lat0 = Math.max(-90, lat1 - span);
    const latc = (lat0 + lat1) / 2, lonc = (lon0 + lon1) / 2, cl = Math.cos(latc * D2R);
    n = { key, z, x, y, lat0, lat1, lon0, lon1, span, uMax: (lon1 - lon0) / span, vMin: 1 - (lat1 - lat0) / span,
      c: new THREE.Vector3(cl * Math.cos(lonc * D2R), cl * Math.sin(lonc * D2R), Math.sin(latc * D2R)),
      rad: Math.hypot((lat1 - lat0) / 2, (lon1 - lon0) / 2 * Math.max(0.05, Math.cos(Math.min(89, Math.max(Math.abs(lat0), Math.abs(lat1))) * D2R))) * D2R,
      texelKm: span * D2R * this.R / this.tileSize };
    n.radKm = Math.max(Math.sin(Math.min(n.rad, 1.5)) * this.R, 1e-3); this.nodes.set(key, n); return n;
  }
  // cam: kamera konumu (cisim sabit çerçevede, km) · fwd: bakış yönü (birim) · fov: dikey (rad) · aspect · viewH: piksel
  update(cam, fwd, fov, aspect, viewH) {
    this.frame++;
    const R = this.R, d = cam.length(), tf = 2 * Math.tan(fov / 2) / viewH, halfDiag = Math.atan(Math.tan(fov / 2) * Math.hypot(1, aspect));
    const leaves = [];
    if (this.enabled && d > R * 1.0005) {
      const camDir = cam.clone().divideScalar(d), horizon = Math.acos(Math.min(1, R / d)), v = new THREE.Vector3(), dirV = new THREE.Vector3();
      const visit = (n) => {
        if (Math.acos(Math.min(1, Math.max(-1, n.c.dot(camDir)))) > horizon + n.rad) return;                 // ufkun ardında
        v.copy(n.c).multiplyScalar(R).sub(cam); const dc = v.length(), dist = Math.max(0.03, dc - n.radKm);
        dirV.copy(v).divideScalar(dc); const ang = Math.acos(Math.min(1, Math.max(-1, dirV.dot(fwd))));
        if (ang > halfDiag + Math.atan(n.radKm / Math.max(dc, 1e-3)) + 0.05) return;                         // görüntü dışı
        const pf = dist * tf;                                                                                // piksel başına km (düğümün en yakın noktasında)
        if (this.baseTexelKm <= pf * 0.9) return;                                                            // taban doku yeter
        if (n.z < this.maxZ && n.texelKm > pf) {
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const x = n.x * 2 + dx, y = n.y * 2 + dy; if (x >= this.S.cols(n.z + 1) || y >= this.S.rows(n.z + 1)) continue;
            visit(this.node(n.z + 1, x, y));
          }
        } else { n.dist = dist; leaves.push(n); }
      };
      const zr = this.minZ; for (let y = 0; y < this.S.rows(zr); y++) for (let x = 0; x < this.S.cols(zr); x++) visit(this.node(zr, x, y));
    }
    // her yaprak için: dokusu hazırsa kendisi, değilse en yakın hazır atası çizilir; hazır olmayan istenir
    const draw = new Map(); let maxZ = 0;
    leaves.sort((a, b) => a.dist - b.dist);
    for (const n of leaves) {
      let a = n; while (a && !(this.cache.get(a.key) && this.cache.get(a.key).tex)) a = a.z > this.minZ ? this.node(a.z - 1, a.x >> 1, a.y >> 1) : null;
      if (a !== n) this.request(n);
      if (a) { draw.set(a.key, a); maxZ = Math.max(maxZ, a.z); }
    }
    this.pump();
    for (const m of this.meshes.values()) m.visible = false;
    for (const n of draw.values()) {
      const e = this.cache.get(n.key); e.last = this.frame;
      let m = this.meshes.get(n.key);
      if (!m) { m = new THREE.Mesh(tileGeometry(this.R, n.lat0, n.lat1, n.lon0, n.lon1, n.uMax, n.vMin, this.lift || 0), this.material(e.tex, n)); m.frustumCulled = false; m.renderOrder = 1; this.group.add(m); this.meshes.set(n.key, m); }
      m.visible = true;
    }
    this.evict();
    this.stats = { drawn: draw.size, pending: this.queue.length + this.active, cached: this.cache.size, maxZ };
  }
  request(n) {
    let e = this.cache.get(n.key); if (e) { e.last = this.frame; return; }
    e = { tex: null, loading: false, last: this.frame, n }; this.cache.set(n.key, e); this.queue.push(e);
  }
  pump() {
    this.queue = this.queue.filter((e) => this.cache.get(e.n.key) === e && e.last >= this.frame - 90);                    // artık gerekmeyen istekleri at
    this.queue.sort((a, b) => (a.n.dist || 1e9) - (b.n.dist || 1e9));
    while (this.active < 6 && this.queue.length) {
      const e = this.queue.shift(); if (e.loading) continue; e.loading = true; this.active++;
      this.loader.load(this.url(e.n.z, e.n.x, e.n.y), (t) => {
        this.active--; if (this.cache.get(e.n.key) !== e) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; e.tex = t;
      }, undefined, () => { this.active--; e.failed = true; e.last = -1e9; });
    }
  }
  evict() {
    if (this.cache.size <= this.maxTextures) return;
    const old = [...this.cache.entries()].filter(([, e]) => e.last < this.frame - 2).sort((a, b) => a[1].last - b[1].last);
    while (this.cache.size > this.maxTextures && old.length) {
      const [k, e] = old.shift(); this.cache.delete(k);
      const m = this.meshes.get(k); if (m) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); this.meshes.delete(k); }
      if (e.tex) e.tex.dispose();
    }
  }
  setEnabled(on) { this.enabled = on; if (!on) for (const m of this.meshes.values()) m.visible = false; }
}
