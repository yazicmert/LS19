// Kalkış rampası çevresinin OSM verisi iş parçacığında (osmbuildings.js, osmnature.js): karoların indirilmesi ve çözülmesi (MVT), bina çokgenleri,
// doğa alanları ve bitki yerleşimi, bina geometrisi (duvar, çatı üçgenlemesi, normaller). Ana iş parçacığında bunlar kalkış sahnesi tamamlanırken
// ~1–1,3 sn sürüyordu (docs/performans.md §19). Zemin yüksekliği ve uydu görüntüsünden renk ana iş parçacığında kalır; çokgen başına değer olarak gelir.
//   { cmd: 'load', id, owner, site }                → { id, polys, tiles: [{ t, layers: { transportation_name } }], nature: { polys (su), plants (paketli) } }
//   { cmd: 'build', id, owner, exclude, y0s, rgbs } → { id, pos, col, fac, nrm } (Float32Array, aktarılır)
//   { cmd: 'abort', owner }
import * as THREE from '../lib/three.module.js';
import { fetchOsm, buildingArrays } from './osmbuildings.js';
import { naturePolygons, scatter, packPlants } from './osmnature.js';

const owners = new Map();
globalThis.onmessage = async ({ data: d }) => {
  if (!d) return;
  if (d.cmd === 'abort') { const o = owners.get(d.owner); if (o) o.ctl.abort(); owners.delete(d.owner); return; }
  try {
    if (d.cmd === 'load') {
      const o = { ctl: new AbortController(), polys: [] }; owners.set(d.owner, o);
      const r = await fetchOsm(d.site, (u, opt) => fetch(u, opt), o.ctl.signal);
      if (o.ctl.signal.aborted) return;
      o.polys = r.polys;
      const np = r.tiles.flatMap(({ t, layers }) => naturePolygons(layers, t, d.site)), plants = packPlants(scatter(np, 7));
      postMessage({ id: d.id, polys: r.polys, tiles: r.tiles.map(({ t, layers }) => ({ t, layers: { transportation_name: layers.transportation_name } })),
        nature: { polys: np.filter((p) => p.kind === 'water'), plants } }, [plants.buffer]);
    } else if (d.cmd === 'build') {
      const o = owners.get(d.owner); if (!o) { postMessage({ id: d.id }); return; }
      const a = buildingArrays(THREE, o.polys, { exclude: d.exclude, y0s: d.y0s, rgbs: d.rgbs });
      let nrm = null;
      if (a.pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3)); g.computeVertexNormals(); nrm = g.attributes.normal.array; }
      postMessage({ id: d.id, ...a, nrm }, [a.pos.buffer, a.col.buffer, a.fac.buffer, ...(nrm ? [nrm.buffer] : [])]);
    }
  } catch (e) { postMessage({ id: d.id, err: String((e && e.message) || e) }); }
};
