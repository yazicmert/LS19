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

export class OsmBuildings {
  // THREE: three.js · parent: rampa grubu (ölçek KM, birim m) · site: { lat, lon } · onReady(this): binalar eklendi
  constructor(THREE, parent, site, { onReady, fetchFn = (u, o) => fetch(u, o) } = {}) {
    this.T = THREE; this.parent = parent; this.site = site; this.onReady = onReady; this.fetch = fetchFn;
    this.ctl = new AbortController(); this.group = new THREE.Group(); parent.add(this.group); this.polys = []; this.ready = false; this.status = 'loading';
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
          this.polys.push(...polygonsFromLayer(decodeTile(buf).building, t, this.site));
        } catch (e) { if (e.name === 'AbortError') throw e; }
      }));
      if (this.ctl.signal.aborted) return;
      this.build(); this.ready = true; this.status = 'ready'; if (this.onReady) this.onReady(this);
    } catch (e) { this.status = 'error'; this.msg = String(e.message || e); }
  }
  build() {
    const THREE = this.T, pos = [], col = [], c = new THREE.Color();
    const drop = (x, z) => -(x * x + z * z) / (2 * R_E);                         // Dünya eğriliği (12 km'de ~11 m)
    for (const p of this.polys) {
      try { c.set(p.color || '#d8d6d0'); } catch (e) { c.set('#d8d6d0'); }
      const tone = 0.85 + 0.15 * ((p.h * 7.3) % 1), cr = c.r * tone, cg = c.g * tone, cb = c.b * tone;
      const put = (x, y, z, k = 1) => { pos.push(x, y + drop(x, z), z); col.push(cr * k, cg * k, cb * k); };
      for (const ring of [p.outer, ...p.holes]) for (let i = 0; i < ring.length; i++) {        // duvarlar
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
        put(x0, p.minH, z0, 0.8); put(x1, p.minH, z1, 0.8); put(x1, p.h, z1); put(x0, p.minH, z0, 0.8); put(x1, p.h, z1); put(x0, p.h, z0);
      }
      const o2 = p.outer.map(([x, z]) => new THREE.Vector2(x, z)), h2 = p.holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
      const all = [...o2, ...h2.flat()];
      for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(o2, h2)) { for (const k of [a, b, d]) put(all[k].x, p.h, all[k].y, 1.05); }   // çatı
      if (p.minH > 0) for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(o2, h2)) { for (const k of [d, b, a]) put(all[k].x, p.minH, all[k].y, 0.7); }   // yükseltilmiş parçanın tabanı (tank)
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x3a3a3a }));   // öz ışıma: Güneş görmeyen yüzler simsiyah olmasın (gökyüzü ışığı yerine)
    this.mesh.frustumCulled = false; this.group.add(this.mesh);
  }
  set visible(v) { this.group.visible = v; }
  dispose() { this.ctl.abort(); if (this.group.parent) this.group.parent.remove(this.group); if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); } }
}
