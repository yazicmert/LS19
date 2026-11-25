// Kalkış zemini paftaları iş parçacığında (padground.js): uydu görüntüsü ve Terrarium kabartma paftalarının indirilmesi (Cache Storage önbelleğiyle),
// çözülmesi, seviye dokusuna birleştirilmesi ve yer tutucu ayıklaması ana iş parçacığını tutmaz. Ana iş parçacığında bu iş her adımda bir kareyi
// bekliyordu: kuyruktaki yuvalar ağ yerine ana iş parçacığını beklerken dolu kalıyor, seviyeler sırayla iniyormuş gibi davranıyordu.
//   { cmd: 'level', id, owner, n, urls } → { id, got, pix: Uint8ClampedArray (n·256)², RGBA, satır 0 = kuzey } (yarıdan azı geldiyse pix yok)
//   { cmd: 'dem', id, owner, z, r, n }   → { id, grid: Float32Array (n·256)² | null }
//   { cmd: 'abort', owner }              → o zeminin süren indirmeleri durur (PadGround.dispose)
import { composeLevel, demGrid, limiter } from './padground.js';

const slotImg = limiter(12), slotDem = limiter(8), ctls = new Map();
globalThis.onmessage = async ({ data: d }) => {
  if (!d) return;
  if (d.cmd === 'abort') { const c = ctls.get(d.owner); if (c) c.abort(); ctls.delete(d.owner); return; }
  let c = ctls.get(d.owner); if (!c) ctls.set(d.owner, (c = new AbortController()));
  try {
    if (d.cmd === 'level') {
      const W = d.n * 256, cv = new OffscreenCanvas(W, W), g = cv.getContext('2d', { willReadFrequently: true });
      const got = await composeLevel(g, d.n, (i, j) => d.urls[j * d.n + i], c.signal, slotImg);
      if (c.signal.aborted || got < d.n * d.n * 0.5) { postMessage({ id: d.id, got }); return; }
      const pix = g.getImageData(0, 0, W, W).data;
      postMessage({ id: d.id, got, pix }, [pix.buffer]);
    } else if (d.cmd === 'dem') {
      const grid = await demGrid(d.z, d.r, d.n, c.signal, slotDem);
      if (grid && !c.signal.aborted) postMessage({ id: d.id, grid }, [grid.buffer]); else postMessage({ id: d.id, grid: null });
    }
  } catch (e) { postMessage({ id: d.id, err: String((e && e.message) || e) }); }
};
