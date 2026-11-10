// Kalkış canlandırmasında rampa çevresinin gerçek binaları — anahtarsız, açık veri: OpenStreetMap (ODbL) binaları, OpenFreeMap'in OpenMapTiles
// vektör karolarından (https://openfreemap.org; ücretsiz, anahtar yok, kullanım sınırı yok). Herkese açık sitenin varsayılan 3B katmanı budur;
// Google Photorealistic 3D Tiles (google3d.js) yalnız kendi anahtarını veren kurulumlarda açılır ve açıkken bu katman gizlenir.
//   · Karolar: 14. seviye (OpenFreeMap'in en ince seviyesi; ~2,4 km), rampa çevresinde RADIUS_M yarıçapındaki karolar. building katmanı:
//     taban halkaları + render_height / render_min_height (OSM height, min_height, building:levels'tan; yoksa OpenMapTiles varsayılanı)
//   · Halkalar: MVT'de dış halka saat yönünde (karo biriminde y aşağı: işaretli alan > 0), delikler ters yönde; her dış halka kendinden sonraki deliklerle bir çokgen
//   · Konum: karo → enlem/boylam (Web Mercator) → rampa çerçevesi (padground.js ile aynı: m; x doğu, y yukarı, z güney); Dünya eğriliği y'de (d²/2R)
//   · Çizim: duvarlar (dörtgenler) + çatı (ShapeUtils üçgenlemesi), tek birleştirilmiş geometri, köşe renkleri (OSM colour ya da açık gri), Lambert ışığı
// Saf yardımcılar (tilesAround, ringArea, polygonsFromLayer, padXZ) Node'da sınanır: test/test_padground.js.
import { decodeTile } from './mvt.js';
import { inRect } from './kscmodels.js';

export const TILEJSON = 'https://tiles.openfreemap.org/planet';
export const Z = 14, RADIUS_M = 8000, MIN_H = 2.5;
export const ATTRIB = '© OpenStreetMap katkıcıları · OpenFreeMap';
const R_E = 6378137, D2R = Math.PI / 180;

// enlem/boylam → 14. seviye karo (kesirli)
export function tileXY(lat, lon, z = Z) {
  const n = 2 ** z, la = lat * D2R;
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n];
}
// rampa çevresinde r metre içindeki karolar (yakından uzağa)
export function tilesAround(lat, lon, r = RADIUS_M, z = Z) {
  const [x, y] = tileXY(lat, lon, z), m = (2 * Math.PI * R_E * Math.cos(lat * D2R)) / 2 ** z, k = Math.ceil(r / m), out = [];
  for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) {
    const tx = Math.floor(x) + i, ty = Math.floor(y) + j, cx = tx + 0.5 - x, cy = ty + 0.5 - y;
    if (Math.hypot(cx, cy) * m <= r + m * 0.75) out.push({ x: ((tx % 2 ** z) + 2 ** z) % 2 ** z, y: ty, z, d: Math.hypot(cx, cy) });
  }
  return out.sort((a, b) => a.d - b.d);
}
// karo içi nokta → rampa çerçevesi (m): [doğu, güney] ve eğrilik düşüşü
export function padXZ(tile, extent, px, py, site) {
  const n = 2 ** tile.z, lon = (tile.x + px / extent) / n * 360 - 180, yy = Math.PI * (1 - 2 * (tile.y + py / extent) / n), lat = Math.atan(Math.sinh(yy)) / D2R;
  const east = (lon - site.lon) * D2R * R_E * Math.cos(site.lat * D2R), north = (lat - site.lat) * D2R * R_E;
  return [east, -north];
}
// işaretli alan (karo biriminde, y aşağı): > 0 saat yönü (MVT dış halkası)
export function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; }
// building katmanı → çokgenler { outer: [[x, z]], holes: [[[x, z]]], h, minH, color } (rampa çerçevesi, m); r metre dışı ve alçak yapılar atılır
export function polygonsFromLayer(layer, tile, site, { radius = RADIUS_M, minH = MIN_H } = {}) {
  const out = [];
  if (!layer) return out;
  for (const f of layer.features) {
    if (f.type !== 3) continue;
    const h = +f.props.render_height, h0 = Math.max(0, +f.props.render_min_height || 0);
    if (!(h >= minH) || h <= h0) continue;
    let cur = null;
    for (const ring of f.rings) {
      if (ring.length < 3) continue;
      const pts = ring.map(([px, py]) => padXZ(tile, layer.extent, px, py, site));
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      if (ringArea(ring) > 0) { cur = { outer: pts, holes: [], h, minH: h0, color: typeof f.props.colour === 'string' ? f.props.colour : null }; out.push(cur); }
      else if (cur) cur.holes.push(pts);
    }
  }
  return out.filter((p) => { const c = p.outer.reduce((a, q) => [a[0] + q[0] / p.outer.length, a[1] + q[1] / p.outer.length], [0, 0]); p.c = c; p.d = Math.hypot(c[0], c[1]); return p.d <= radius; });
}

// narin yapı (kule: yıldırım kuleleri, anten, servis kulesi): OSM'de taban alanı + yükseklikle "bina"; dolu prizma duvar gibi görünür → kafes kule çizilir
export const isSlender = (p) => {
  if (p.outer.length > 8 || p.h - p.minH < 40) return false;                       // delikler önemsiz (kafes kuleler OSM'de delikli çokgen olabilir)
  const xs = p.outer.map((q) => q[0]), zs = p.outer.map((q) => q[1]), span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  return span >= 6 && (p.h - p.minH) / span >= 4;                                  // 6 m'den ince direkler (su kulesi ayakları) dolu kalır
};
// kafes kule kirişleri: tabanın köşelerinden tepeye daralan ayaklar (tepe TOP oranında), yatay kuşaklar ve çaprazlar → [[a, b], …] (rampa çerçevesi, m)
export function latticeBeams(p, { top = 0.22, bay = 12 } = {}) {
  const [cx, cz] = p.c || p.outer.reduce((a, q) => [a[0] + q[0] / p.outer.length, a[1] + q[1] / p.outer.length], [0, 0]);
  const H = p.h - p.minH, nB = Math.max(2, Math.round(H / bay)), out = [];
  const at = (q, k) => { const s = 1 - (1 - top) * k; return [cx + (q[0] - cx) * s, p.minH + H * k, cz + (q[1] - cz) * s]; };
  const V = p.outer;
  for (const q of V) out.push([at(q, 0), at(q, 1)]);                                                  // ayaklar
  for (let i = 0; i <= nB; i++) for (let j = 0; j < V.length; j++) {
    const a = V[j], b = V[(j + 1) % V.length], k0 = i / nB, k1 = (i + 1) / nB;
    out.push([at(a, k0), at(b, k0)]);                                                                  // kuşak
    if (i < nB) out.push(i % 2 ? [at(a, k0), at(b, k1)] : [at(b, k0), at(a, k1)]);                     // çapraz (zikzak)
  }
  return out;
}

export class OsmBuildings {
  // THREE: three.js · parent: rampa grubu (ölçek KM, birim m) · site: { lat, lon } · onReady(this): binalar eklendi
  constructor(THREE, parent, site, { onReady, fetchFn = (u, o) => fetch(u, o) } = {}) {
    this.T = THREE; this.parent = parent; this.site = site; this.onReady = onReady; this.fetch = fetchFn;
    this.ctl = new AbortController(); this.group = new THREE.Group(); parent.add(this.group); this.polys = []; this.tiles = []; this.exclude = []; this.ready = false; this.status = 'loading'; this.groundAt = null;
  }
  credit() { return this.polys.length ? ATTRIB : ''; }
  // rampanın r metresi içinde h metreden yüksek bina sayısı (prosedürel rampa yapılarını gizleme kararı)
  nearPad(r = 600, h = 20) { return this.polys.filter((p) => p.d <= r && p.h >= h).length; }
  async load() {
    try {
      const tj = await (await this.fetch(TILEJSON, { signal: this.ctl.signal })).json(), tpl = tj.tiles && tj.tiles[0];
      if (!tpl) throw new Error('TileJSON');
      const tiles = tilesAround(this.site.lat, this.site.lon);
      await Promise.all(tiles.map(async (t) => {
        try {
          const r = await this.fetch(tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y), { signal: this.ctl.signal });
          if (!r.ok) return;
          let buf = new Uint8Array(await r.arrayBuffer());
          if (buf[0] === 0x1f && buf[1] === 0x8b && typeof DecompressionStream === 'function') buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
          const layers = decodeTile(buf); this.tiles.push({ t, layers: { landcover: layers.landcover, water: layers.water, transportation_name: layers.transportation_name } });     // doğal unsurlar (osmnature.js), Crawlerway (kscmodels.js)
          this.polys.push(...polygonsFromLayer(layers.building, t, this.site));
        } catch (e) { if (e.name === 'AbortError') throw e; }
      }));
      if (this.ctl.signal.aborted) return;
      this.build(); this.ready = true; this.status = 'ready'; if (this.onReady) this.onReady(this);
    } catch (e) { this.status = 'error'; this.msg = String(e.message || e); }
  }
  build() {
    const THREE = this.T, pos = [], col = [], fac = [], c = new THREE.Color();
    const drop = (x, z) => -(x * x + z * z) / (2 * R_E);                         // Dünya eğriliği (12 km'de ~11 m)
    for (const p of this.polys) {
      if (this.exclude.some((r) => inRect(p.c[0], p.c[1], r))) continue;                  // yerine resmî 3B modeli konan yapı (kscmodels.js: VAB)
      if (p.rgb) c.setRGB(p.rgb[0], p.rgb[1], p.rgb[2], THREE.SRGBColorSpace);         // uydu görüntüsünden çatı rengi (recolor)
      else { try { c.set(p.color || '#d8d6d0'); } catch (e) { c.set('#d8d6d0'); } }
      const tone = 0.85 + 0.15 * ((p.h * 7.3) % 1), cr = c.r * tone, cg = c.g * tone, cb = c.b * tone;
      const y0 = this.groundAt ? this.groundAt(p.c[0], p.c[1]) - 0.25 : 0;                  // zeminin kabartması (rampa düzeyine göre; düz zeminde 0)
      const put = (x, y, z, k = 1, fu = 0, fv = 0, fw = 0) => { pos.push(x, y + y0 + drop(x, z), z); col.push(cr * k, cg * k, cb * k); fac.push(fu, fv, fw); };
      if (isSlender(p)) {                                                                    // kafes kule: her kiriş ince kare kesitli çubuk
        const w = Math.max(0.35, Math.min(1.2, (p.h - p.minH) / 300));
        for (const [a, b] of latticeBeams(p)) {
          const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); if (L < 1e-6) continue;
          const u = d.map((v) => v / L), ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
          let n1 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]]; const l1 = Math.hypot(...n1); n1 = n1.map((v) => (v / l1) * w / 2);
          const n2 = [u[1] * n1[2] - u[2] * n1[1], u[2] * n1[0] - u[0] * n1[2], u[0] * n1[1] - u[1] * n1[0]];
          const corner = (P, s1, s2) => [P[0] + s1 * n1[0] + s2 * n2[0], P[1] + s1 * n1[1] + s2 * n2[1], P[2] + s1 * n1[2] + s2 * n2[2]];
          const sq = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
          for (let k = 0; k < 4; k++) {
            const [s1, s2] = sq[k], [t1, t2] = sq[(k + 1) % 4], A0 = corner(a, s1, s2), A1 = corner(a, t1, t2), B0 = corner(b, s1, s2), B1 = corner(b, t1, t2), sh = k % 2 ? 0.8 : 1;
            for (const q of [A0, A1, B1, A0, B1, B0]) put(q[0], q[1], q[2], sh);
          }
        }
        continue;
      }
      for (const ring of [p.outer, ...p.holes]) for (let i = 0; i < ring.length; i++) {        // duvarlar
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
        // cephe koordinatı (fac: duvar boyunca m, yerden m, pencere bayrağı): pencere sıraları ve zemin gölgesi gölgelendiricide; pencere yalnız 6–70 m arası
        // yapılarda ve 6 m'den uzun duvarlarda (tank, baraka, kule ayağı düz kalır); bayrak 2: yalnız zemin gölgesi
        const L = Math.hypot(x1 - x0, z1 - z0), H = p.h - p.minH, w = H >= 6 && H <= 70 && L >= 6 && p.minH === 0 ? 1 : 2, u1 = Math.max(1, Math.round(L / 3.2)) * 3.2, v1 = w === 1 ? Math.max(1, Math.round(H / 3.4)) * 3.4 : H;
        put(x0, p.minH, z0, 0.92, 0, 0, w); put(x1, p.minH, z1, 0.92, u1, 0, w); put(x1, p.h, z1, 1, u1, v1, w); put(x0, p.minH, z0, 0.92, 0, 0, w); put(x1, p.h, z1, 1, u1, v1, w); put(x0, p.h, z0, 1, 0, v1, w);
      }
      const o2 = p.outer.map(([x, z]) => new THREE.Vector2(x, z)), h2 = p.holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const all = [...o2, ...h2.flat()];
      for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(o2, h2)) { for (const k of [a, b, d]) put(all[k].x, p.h, all[k].y, 1.05); }   // çatı
      if (p.minH > 0) for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(o2, h2)) { for (const k of [d, b, a]) put(all[k].x, p.minH, all[k].y, 0.7); }   // yükseltilmiş parçanın tabanı (tank)
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('fac', new THREE.Float32BufferAttribute(fac, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x3a3a3a });
    // cephe ayrıntısı: kat/aks ızgarasında koyu cam pencereler (uzakta, ızgara piksel altına inince söner: hare yok) ve duvar dibinde zemin gölgesi
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 fac; varying vec3 vFac;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFac = fac;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFac;').replace('#include <color_fragment>', `#include <color_fragment>
        if (vFac.z > 0.5) {
          diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 2.2, vFac.y));
          if (vFac.z < 1.5) {
            vec2 gq = vec2(vFac.x / 3.2, vFac.y / 3.4), gf = fract(gq);
            float aa = clamp(1.0 - 2.5 * max(fwidth(gq.x), fwidth(gq.y)), 0.0, 1.0);
            float win = smoothstep(0.2, 0.26, gf.x) * smoothstep(0.8, 0.74, gf.x) * smoothstep(0.34, 0.4, gf.y) * smoothstep(0.82, 0.76, gf.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.18, 0.25), win * 0.7 * aa);
          }
        }`);
    };
    this.mesh = new THREE.Mesh(g, mat);   // öz ışıma: Güneş görmeyen yüzler simsiyah olmasın (gökyüzü ışığı yerine)
    this.mesh.frustumCulled = false; this.group.add(this.mesh);
  }
  // çatı renkleri uydu görüntüsünden: sampler(lat, lon) → [r, g, b] (sRGB 0..1) | null; groundAt(e, s): zeminin yüksekliği (binalar kabartmaya oturur); geometri yeniden kurulur. Çok koyu/çok açık örnekler
  // (gölge, parlama) sınırlanır; narin yapılar (kafes kuleler) görüntüde zemin rengini verir, onlar OSM rengiyle kalır.
  recolor(sampler, groundAt = null) {
    if (groundAt) this.groundAt = groundAt;
    let n = 0;
    for (const p of this.polys) {
      if (isSlender(p)) continue;
      const lat = this.site.lat - p.c[1] / R_E / D2R, lon = this.site.lon + p.c[0] / (R_E * Math.cos(this.site.lat * D2R)) / D2R, v = sampler(lat, lon);
      if (!v) continue;
      const m = (v[0] + v[1] + v[2]) / 3, k = m < 0.25 ? 0.25 / Math.max(m, 0.01) : m > 0.92 ? 0.92 / m : 1;
      p.rgb = v.map((x) => Math.min(1, x * k)); n++;
    }
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    this.build(); return n;
  }
  set visible(v) { this.group.visible = v; }
  dispose() { this.ctl.abort(); if (this.group.parent) this.group.parent.remove(this.group); if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); } }
}
