// Yakınlaştıkça yüksek çözünürlüklü yüzey: küre üzerinde kuadağaç (quadtree) parça (tile) yükleyici.
// Dünya: NASA GIBS (Blue Marble + kabartma + deniz tabanı, ≈490 m/piksel) · Ay: NASA Trek (LRO WAC mozaiği, ≈83 m/piksel). Her ikisi de kamu malı,
// tarayıcıdan doğrudan (CORS açık). Taban küre (8K doku) uzaktan yeter; kamera yaklaştıkça yalnız görünen bölgenin daha ince parçaları iner.
// Her parça, taban küreyle aynı gölgelendiriciyi kullanan küçük bir küre dilimidir (aynı ışık, bulut, gece ışıkları, gölge, kabartma).
//
// Hız: parçalar Cache API'de saklanır (ikinci ziyarette ağ yok) · indirme + çözme ana iş parçacığı dışında (fetch + createImageBitmap) ·
// yakından uzağa öncelik; her parça için iki seviye üst ata da hemen istenir (önce bulanık, sonra net, boşluk yok) ·
// kamera yaklaşırken bir sonraki seviye önceden istenir (boşta bant genişliğiyle) · gerekmeyen istekler iptal edilir ·
// kare başına en çok MAX_PROMOTE yeni parça GPU'ya yüklenir (takılma olmasın) · başarısız parça 15 sn sonra yeniden denenir.
import * as THREE from 'three';
import { bitmapSupported } from './texload.js';

const D2R = Math.PI / 180;
const NSEG = 14;
const MAX_PROMOTE = 4, LOOKAHEAD = 0.5, RETRY_MS = 15000, STALE_MS = 2500, CACHE_NAME = 'ls19-tiles-v1';

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

let cachePromise = null;
const openCache = () => (cachePromise = cachePromise || (typeof caches !== 'undefined' ? caches.open(CACHE_NAME).catch(() => null) : Promise.resolve(null)));
const closeBitmap = (t) => { const im = t && t.image; if (im && typeof im.close === 'function') try { im.close(); } catch (err) { /* zaten kapalı */ } };      // atılan dokunun çözülmüş piksel belleğini bırak

export class TileLayer {
  // cfg: { parent, R (km), urls(z, x, y) -> [adres…] (sırayla denenir; isteğe bağlı, ör. HLS için son günler), minBytes (bundan küçük yanıt = veri yok), noBoost, latLimit (derece; bu enlemin ötesinde katman yok), scheme: 'gibs'|'eq', tileSize, rootZ (taramanın başladığı seviye, varsayılan minZ), minZ (çizilen en kaba seviye), maxZ, url(z, x, y), baseTexelKm, lift, material(tex, node) -> THREE.Material, maxTextures, concurrency, lodBias }
  constructor(cfg) {
    Object.assign(this, cfg);
    this.rootZ = cfg.rootZ == null ? cfg.minZ : cfg.rootZ; this.S = SCHEMES[cfg.scheme]; this.nodes = new Map(); this.cache = new Map(); this.meshes = new Map(); this.queue = []; this.loading = new Set(); this.frame = 0;
    this.maxTextures = cfg.maxTextures || 150; this.concurrency = cfg.concurrency || 6; this.lodBias = cfg.lodBias || 1.15;
    this.group = new THREE.Group(); this.group.frustumCulled = false; cfg.parent.add(this.group);
    this.enabled = true; this.puts = 0; this.fails = 0; this.okCount = 0; this.nReady = 0; this.stats = { drawn: 0, pending: 0, cached: 0, maxZ: 0, failed: 0, loaded: 0 };   // nReady: GPU'ya açılmayı bekleyen hazır doku sayısı
  }
  node(z, x, y) {
    const key = (z * 4096 + x) * 4096 + y; let n = this.nodes.get(key); if (n) return n;          // sayısal anahtar (metin birleştirme her karede yüzlerce kez çalışırdı)
    const S = this.S, span = S.span(z), lon0 = -180 + x * span, lat1 = 90 - y * span, lon1 = Math.min(180, lon0 + span), lat0 = Math.max(-90, lat1 - span);
    const latc = (lat0 + lat1) / 2, lonc = (lon0 + lon1) / 2, cl = Math.cos(latc * D2R);
    n = { key, z, x, y, lat0, lat1, lon0, lon1, span, uMax: (lon1 - lon0) / span, vMin: 1 - (lat1 - lat0) / span,
      c: new THREE.Vector3(cl * Math.cos(lonc * D2R), cl * Math.sin(lonc * D2R), Math.sin(latc * D2R)),
      rad: Math.hypot((lat1 - lat0) / 2, (lon1 - lon0) / 2 * Math.max(0.05, Math.cos(Math.min(89, Math.max(Math.abs(lat0), Math.abs(lat1))) * D2R))) * D2R,
      texelKm: span * D2R * this.R / this.tileSize };
    n.radKm = Math.max(Math.sin(Math.min(n.rad, 1.5)) * this.R, 1e-3); this.nodes.set(key, n); return n;
  }
  up(n) { return n.z > this.minZ ? this.node(n.z - 1, n.x >> 1, n.y >> 1) : null; }
  // cam: kamera konumu (cisim sabit çerçevede, km) · fwd: bakış yönü (birim) · fov: dikey (rad) · aspect · viewH: piksel
  update(cam, fwd, fov, aspect, viewH) {
    this.frame++; this.allHidden = false; const now = performance.now();
    const R = this.R, d = cam.length(), tf = 2 * Math.tan(fov / 2) / viewH, halfDiag = Math.atan(Math.tan(fov / 2) * Math.hypot(1, aspect));
    const leaves = [], ahead = [];
    // en yakın nokta bile taban dokudan ince ayrıntı gerektirmeyecek kadar uzaksa kuadağaç gezilmez (yalnız yüklemeler/çıkarma sürer)
    const far = d > R * 1.0005 && this.baseTexelKm <= Math.max(0.03, d - R) * tf * 0.9;
    if (this.enabled && d > R * 1.0005 && !far) {
      const camDir = cam.clone().divideScalar(d), horizon = Math.acos(Math.min(1, R / d)), v = new THREE.Vector3(), dirV = new THREE.Vector3();
      // k: piksel boyu çarpanı (1: şimdi, <1: yaklaşırken ihtiyaç duyulacak daha ince seviye) · out: yaprak listesi
      const visit = (n, k, out) => {
        if (Math.acos(Math.min(1, Math.max(-1, n.c.dot(camDir)))) > horizon + n.rad) return;                 // ufkun ardında
        if (this.latLimit && n.lat0 * n.lat1 > 0 && Math.min(Math.abs(n.lat0), Math.abs(n.lat1)) > this.latLimit) return;   // kapsam dışı enlem (yalnız ilgili katman)
        v.copy(n.c).multiplyScalar(R).sub(cam); const dc = v.length(), dist = Math.max(0.03, dc - n.radKm);
        dirV.copy(v).divideScalar(dc); const ang = Math.acos(Math.min(1, Math.max(-1, dirV.dot(fwd))));
        if (ang > halfDiag + Math.atan(n.radKm / Math.max(dc, 1e-3)) + 0.05) return;                         // görüntü dışı
        const pf = dist * tf * k;                                                                            // piksel başına km (düğümün en yakın noktasında)
        if (this.baseTexelKm <= pf * 0.9) return;                                                            // taban doku yeter
        if (n.z < this.maxZ && (n.z < this.minZ || n.texelKm > pf * this.lodBias)) {
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const x = n.x * 2 + dx, y = n.y * 2 + dy; if (x >= this.S.cols(n.z + 1) || y >= this.S.rows(n.z + 1)) continue;
            visit(this.node(n.z + 1, x, y), k, out);
          }
        } else { n.dist = dist; out.push(n); }
      };
      const zr = this.rootZ;
      for (let y = 0; y < this.S.rows(zr); y++) for (let x = 0; x < this.S.cols(zr); x++) visit(this.node(zr, x, y), 1, leaves);
      // boşta bant genişliği varken: kamera yaklaşırsa gerekecek bir sonraki seviyeyi önceden iste
      if (this.queue.length + this.loading.size < 4 && leaves.length) {
        for (let y = 0; y < this.S.rows(zr); y++) for (let x = 0; x < this.S.cols(zr); x++) visit(this.node(zr, x, y), LOOKAHEAD, ahead);
      }
    }
    // her yaprak için: dokusu hazırsa kendisi, değilse en yakın hazır atası çizilir; hazır olmayan (ve iki seviye üst atası) istenir
    const draw = new Map(); let maxZ = 0;
    leaves.sort((a, b) => a.dist - b.dist);
    for (const n of leaves) {
      let a = n; while (a && !(this.cache.get(a.key) && this.cache.get(a.key).tex)) a = this.up(a);
      if (a !== n) {
        this.request(n, n.dist);
        let g = n; for (let i = 0; i < 2 && g && !this.noBoost; i++) g = this.up(g);
        if (g && !this.noBoost && !(this.cache.get(g.key) && this.cache.get(g.key).tex)) this.request(g, n.dist * 0.15);       // kaba ata önce gelir
      }
      if (a) { draw.set(a.key, a); maxZ = Math.max(maxZ, a.z); }
    }
    for (const n of ahead) if (!this.cache.has(n.key)) this.request(n, n.dist * 4 + 1e4, true);                      // en düşük öncelik
    const dt = this.lastT ? now - this.lastT : 16; this.lastT = now;
    if (this.nReady > 0) this.promote(Math.min(24, Math.max(MAX_PROMOTE, Math.round(dt / 6))));                // yavaş karede daha çok (kare başına sabit sınır yavaş cihazda beklemeye yol açmasın)
    this.pump(now);
    // görünürlük: yalnız değişenlere yazılır (yüzlerce mesh üzerinde her karede döngü yok)
    const vis = this.visSet || (this.visSet = new Set()), next = new Set();
    for (const n of draw.values()) {
      const e = this.cache.get(n.key); e.last = this.frame; e.t = now;
      let m = this.meshes.get(n.key);
      if (!m) { m = new THREE.Mesh(tileGeometry(this.R, n.lat0, n.lat1, n.lon0, n.lon1, n.uMax, n.vMin, this.lift || 0), this.material(e.tex, n)); m.frustumCulled = false; m.renderOrder = 1; this.group.add(m); this.meshes.set(n.key, m); }
      if (!vis.has(n.key)) m.visible = true;
      next.add(n.key);
    }
    for (const k of vis) if (!next.has(k)) { const m = this.meshes.get(k); if (m) m.visible = false; }
    this.visSet = next;
    this.evict();
    let need = 0; for (const e of this.queue) if (!e.ahead) need++; for (const e of this.loading) if (!e.ahead) need++;
    this.stats = { drawn: draw.size, pending: need, cached: this.cache.size, maxZ, failed: this.fails, loaded: this.okCount };
  }
  request(n, prio, ahead = false) {
    let e = this.cache.get(n.key); const now = performance.now();
    if (e) {
      e.last = this.frame; e.t = now; if (!ahead) e.ahead = false;
      if (e.failed && now - e.failedAt > RETRY_MS) { e.failed = false; e.loading = false; e.prio = prio; e.queued = true; this.queue.push(e); }   // geçici hatada yeniden dene
      else {
        if (prio < e.prio) e.prio = prio;
        // kuyruktan düşmüş (uzun süre istenmemiş) ama şimdi yine gerekli: yeniden kuyruğa al — yoksa parça sonsuza dek eksik kalırdı
        if (!e.tex && !e.ready && !e.loading && !e.empty && !e.failed && !e.queued) { e.queued = true; e.prio = prio; this.queue.push(e); }
      }
      return;
    }
    e = { tex: null, ready: null, loading: false, queued: true, ahead, last: this.frame, t: now, n, prio, ctl: null }; this.cache.set(n.key, e); this.queue.push(e);
  }
  // adresleri sırayla dene; yeterli büyüklükte ilk yanıt kazanır (HLS'te günlük şeritler boş olabilir); hiçbiri yoksa null
  async getBlobs(urls, ctl) {
    let last = null, err = null;
    for (const u of urls) {
      try { last = await this.getBlob(u, ctl); } catch (e) { if (e && e.name === 'AbortError') throw e; err = e; continue; }   // henüz yayımlanmamış tarih vb.: sonrakini dene
      if (!this.minBytes || last.size >= this.minBytes) return last;
    }
    if (this.minBytes && last) return null;                                                                  // yanıt geldi ama hepsi boş: veri yok
    throw err || new Error('veri yok');
  }
  async getBlob(url, ctl) {
    const c = await openCache(); let blob = null;
    if (c) try { const hit = await c.match(url); if (hit) blob = await hit.blob(); } catch (err) { /* önbellek isteğe bağlı */ }
    if (blob) return blob;
    const r = await fetch(url, { signal: ctl.signal, mode: 'cors', credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (c) { c.put(url, r.clone()).catch(() => {}); if (++this.puts % 300 === 0) this.trimCache(c); }
    return r.blob();
  }
  async trimCache(c) { try { const ks = await c.keys(); if (ks.length > 4000) for (const k of ks.slice(0, 1000)) await c.delete(k); } catch (err) { /* */ } }
  async decode(blob) {
    if (await bitmapSupported()) {                                                                            // tarayıcı flipY'yi uyguluyor (yoklama texload.js'te): çözme ana iş parçacığı dışında
      try {
        const bm = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const t = new THREE.Texture(bm); t.flipY = false;
        t.onUpdate = () => { t.onUpdate = null; bm.close(); };                                                 // GPU'ya yüklenince çözülmüş piksel belleği bırakılır (yüzlerce parça × 1 MB)
        return t;
      } catch (err) { /* aşağıdaki <img> yoluna düş */ }
    }
    const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();                       // yedek: flipY'yi sessizce yok sayan tarayıcılarda parçalar ters çıkmasın
    const t = new THREE.Texture(img); t.flipY = true; return t;
  }
  pump(now) {
    // gerekmeyen istekleri at / sürenleri iptal et
    if (this.loading.size) for (const e of [...this.loading]) if (now - e.t > STALE_MS && e.last < this.frame - 30) { if (e.ctl) e.ctl.abort(); this.loading.delete(e); this.cache.delete(e.n.key); }
    if (this.queue.length) {
      this.queue = this.queue.filter((e) => { const keep = this.cache.get(e.n.key) === e && !e.loading && now - e.t < 6000; if (!keep) e.queued = false; return keep; });
      this.queue.sort((a, b) => a.prio - b.prio);
    }
    while (this.loading.size < this.concurrency && this.queue.length) {
      const e = this.queue.shift(); e.queued = false; e.loading = true; e.ctl = new AbortController(); this.loading.add(e);
      this.getBlobs(this.urls ? this.urls(e.n.z, e.n.x, e.n.y) : [this.url(e.n.z, e.n.x, e.n.y)], e.ctl).then((b) => (b ? this.decode(b) : null)).then((t) => {
        this.loading.delete(e); if (!t) { e.empty = true; e.loading = false; return; }                          // bu parçada veri yok (taban doku kalır)
        if (this.cache.get(e.n.key) !== e) { t.dispose(); closeBitmap(t); return; }
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; e.ready = t; this.okCount++; this.nReady++;
      }).catch((err) => { this.loading.delete(e); if (this.cache.get(e.n.key) !== e) return; e.failed = true; e.failedAt = performance.now(); e.loading = false; if (!(err && err.name === 'AbortError')) this.fails++; });
    }
  }
  // hazır dokulardan kare başına en çok MAX_PROMOTE tanesini (en yakınlar önce) çizime aç: GPU yüklemesi takılma yapmasın
  promote(max = MAX_PROMOTE) {
    let k = 0, list = [];
    for (const e of this.cache.values()) if (e.ready && !e.tex) list.push(e);
    list.sort((a, b) => (a.prio || 0) - (b.prio || 0));
    for (const e of list) { if (k++ >= max) break; e.tex = e.ready; this.nReady--; }
  }
  evict() {
    if (this.cache.size <= this.maxTextures) return;
    const old = [...this.cache.entries()].filter(([, e]) => e.last < this.frame - 2 && !e.loading).sort((a, b) => a[1].last - b[1].last);
    while (this.cache.size > this.maxTextures && old.length) {
      const [k, e] = old.shift(); this.cache.delete(k);
      const m = this.meshes.get(k); if (m) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); this.meshes.delete(k); }
      if (e.tex) { e.tex.dispose(); closeBitmap(e.tex); } else if (e.ready) { e.ready.dispose(); closeBitmap(e.ready); this.nReady--; }
    }
  }
  setEnabled(on) { this.enabled = on; if (!on && !this.allHidden) { for (const m of this.meshes.values()) m.visible = false; this.visSet = new Set(); this.allHidden = true; } }       // kapalıyken her karede yinelenmesin
}
