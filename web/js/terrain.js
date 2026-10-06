// İniş bölgesi arazisi (görüntü tarafı): sayısal üretim terraingen.js'te (saf kod); bu dosya ham dizilerden THREE nesneleri kurar.
// Üretim ~0,9 sn sürdüğü için normalde terrainwork.js (Web Worker) içinde yapılır: loadTerrain bir söz döner; worker yoksa/çökerse aynı kod ana iş parçacığında çalışır.
import * as THREE from 'three';
import { PATCH_R, HOLE_R, craterField, terrainArrays, detailNormalData, terrainBasis } from './terraingen.js';

export { PATCH_R, HOLE_R, craterField, terrainBasis };

// terrainArrays çıktısından geometri (köşe normalleri üretimde hesaplandı)
export function terrainGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(a.uv1, 2));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  g.computeBoundingSphere();
  return g;
}
// ayrıntı normal haritası dokusu (döşenebilir): GL satır sırasında RGBA8 veriden; eskiden tuval dokusuydu, görüntü aynı
export function detailNormalTexture(size = 512, data = detailNormalData(size)) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace; t.channel = 1; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// eşzamanlı yol (yedek ve testler): { geometry, sitePosMe, up, east, north }
export function buildTerrain(dem, siteLatDeg, siteLonDeg, R_M, hSite, N = 513) {
  const a = terrainArrays(dem, siteLatDeg, siteLonDeg, R_M, hSite, N);
  return { geometry: terrainGeometry(a), sitePosMe: a.sitePos, up: a.up, east: a.east, north: a.north };
}

// arazi ve ayrıntı normal haritasını Web Worker'da üretir; Promise<{ geometry, detail }>. Worker açılamaz/çökerse ana iş parçacığında üretir.
export function loadTerrain(dem, siteLatDeg, siteLonDeg, R_M, hSite, N = 513) {
  const here = () => ({ geometry: terrainGeometry(terrainArrays(dem, siteLatDeg, siteLonDeg, R_M, hSite, N)), detail: detailNormalTexture() });
  return new Promise((resolve) => {
    let w = null;
    const fallback = () => { try { if (w) w.terminate(); } catch (e) { /* */ } resolve(here()); };
    try {
      w = new Worker(new URL('./terrainwork.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const a = e.data; w.terminate(); resolve({ geometry: terrainGeometry(a), detail: detailNormalTexture(a.detailSize, a.detail) }); };
      w.onerror = fallback; w.onmessageerror = fallback;
      w.postMessage({ dem, siteLatDeg, siteLonDeg, R_M, hSite, N });
    } catch (e) { fallback(); }
  });
}
