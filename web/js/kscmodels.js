// Kennedy Uzay Merkezi yapılarının resmî NASA 3D Resources modelleri (web/models/ksc/*.glb; üretim: tools/ksc_modelleri.mjs, ayrıntı docs/modeller.md §4):
//   VAB (Araç Montaj Binası) gerçek yerinde — OSM'deki yüksek bölme çokgenine oturtulur, OSM'nin aynı binası gizlenir (exclusion);
//   Crawler (paletli taşıyıcı) SLS kalkışında OSM'deki Crawlerway üzerinde, rampadan güvenli uzaklıkta park hâlinde.
// Rampa çerçevesi: metre, x doğu, y yukarı, z güney (osmbuildings.js ile aynı).
const R_E = 6371008.8, D2R = Math.PI / 180;

// VAB yüksek bölmesi (OSM yapı çokgeni, render_height 160 m): köşeler ~(28,58660 K, 80,65079 B) çevresinde 157 m × 137 m, kenarlar ızgaraya göre ~13° dönük.
// Model ekseni: +z uzun kenar (157 m), ±z cepheleri yüksek bölme kapıları (doğu–batı), bayraklı cepheler kuzey–güney; yaw: model +z'nin doğudan kuzeye dönüşü.
export const VAB = { lat: 28.586117, lon: -80.651010, yaw: 103.24 * D2R, len: 157, wid: 137, h: 160, file: 'models/ksc/vab.glb' };
export const CRAWLER = { len: 40, wid: 32.8, file: 'models/ksc/crawler.glb', park: 900 };     // park: rampa merkezinden Crawlerway boyunca uzaklık (m)

// enlem/boylam → rampa çerçevesi (x doğu, z güney; m)
export function siteXZ(site, lat, lon) {
  return [(lon - site.lon) * D2R * R_E * Math.cos(site.lat * D2R), -(lat - site.lat) * D2R * R_E];
}
// VAB'ın rampa çerçevesindeki yeri: { x, z, rotY, rect } (rect: OSM binalarını gizleyen döndürülmüş dikdörtgen) | null (uzaksa)
export function vabPlacement(site, maxD = 12000) {
  const [x, z] = siteXZ(site, VAB.lat, VAB.lon);
  if (Math.hypot(x, z) > maxD) return null;
  // three.js Y dönüşü θ: model +z → (sin θ, cos θ) (x, z); +x → (cos θ, −sin θ)
  const u = [Math.sin(VAB.yaw), Math.cos(VAB.yaw)], v = [Math.cos(VAB.yaw), -Math.sin(VAB.yaw)];
  return { x, z, rotY: VAB.yaw, rect: { c: [x, z], u, v, hu: VAB.len / 2 + 8, hv: VAB.wid / 2 + 8 } };
}
// döndürülmüş dikdörtgen içinde mi (rect: { c, u, v, hu, hv }; u, v birim eksenler)
export function inRect(x, z, r) {
  const dx = x - r.c[0], dz = z - r.c[1];
  return Math.abs(dx * r.u[0] + dz * r.u[1]) <= r.hu && Math.abs(dx * r.v[0] + dz * r.v[1]) <= r.hv;
}
// OSM transportation_name katmanından ada göre çizgiler (rampa çerçevesinde, [[x, z], …] dizileri). tile: { z, x, y }
export function namedLines(layer, tile, site, name = 'Crawlerway') {
  const out = [];
  if (!layer) return out;
  const n = 2 ** tile.z, cosL = Math.cos(site.lat * D2R);
  for (const f of layer.features) {
    if (f.type !== 2 || (f.props.name !== name && f.props.name_en !== name)) continue;
    for (const ring of f.rings) out.push(ring.map(([px, py]) => {
      const lon = (tile.x + px / layer.extent) / n * 360 - 180, yy = Math.PI * (1 - 2 * (tile.y + py / layer.extent) / n), lat = Math.atan(Math.sinh(yy)) / D2R;
      return [(lon - site.lon) * D2R * R_E * cosL, -(lat - site.lat) * D2R * R_E];
    }));
  }
  return out;
}
// Crawlerway üzerinde rampadan d metre uzaklıktaki park yeri ve yol yönü: { x, z, rotY } | null. Crawlerway iki paletli şerittir (OSM'de iki paralel çizgi, ~30 m arayla):
// her çizgide merkezden uzaklığı d olan nokta bulunur; rampaya çıkan (rampaya 150 m'den yakın ucu olan) şeritler alınır, birbirine yakın iki şeridin ortası taşıyıcının ortasıdır.
export function crawlerPark(lines, d = CRAWLER.park) {
  const cand = [];
  for (const L of lines) {
    if (Math.min(...L.map((p) => Math.hypot(p[0], p[1]))) > 150) continue;     // rampaya çıkmayan kol
    for (let i = 0; i + 1 < L.length; i++) {
      const [ax, az] = L[i], [bx, bz] = L[i + 1], ra = Math.hypot(ax, az), rb = Math.hypot(bx, bz);
      if ((ra - d) * (rb - d) > 0) continue;
      const t = Math.abs(rb - ra) < 1e-9 ? 0 : (d - ra) / (rb - ra), l = Math.hypot(bx - ax, bz - az) || 1;
      cand.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l, dz: (bz - az) / l }); break;
    }
  }
  if (!cand.length) return null;
  let a = cand[0], b = null;
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) if (Math.hypot(cand[i].x - cand[j].x, cand[i].z - cand[j].z) < 60) { a = cand[i]; b = cand[j]; }
  const x = b ? (a.x + b.x) / 2 : a.x, z = b ? (a.z + b.z) / 2 : a.z;
  return { x, z, rotY: Math.atan2(-a.dz, a.dx) };                                  // model +x (yürüyüş yönü) yol boyunca
}
