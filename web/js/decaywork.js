// Uydu bozunma iş parçacığı (Laboratuvar › Çarpma riski): tüm GP kataloğunun yeniden giriş tahmini (decayhist.js decayOf → impact.js assessSat).
// ~17.000 cisim, cisim başına ~1 ms: ana iş parçacığında 12 ms'lik dilimlerle ~20 sn sürüyor, çizim kareleriyle yarışıyordu (yazılım çiziminde dakikalar).
// Burada kesintisiz koşar; ana iş parçacığı yalnız sonucu alır. Geçmiş özeti ve F10.7 tablosu burada ayrıca yüklenir (tarayıcı önbelleğinden).
//   iste: { cmd: 'warm' } (erken kurulum) · { cmd: 'run', id, omm: [GP kaydı…], now }  →  { type: 'progress', id, i, n } … { type: 'done', id, out: [{ h, r }…] (omm sırasıyla), ms }
// Yeni bir istek (yeni katalog) süreni bırakır: dilimler arasında sıra numarasına bakılır.
import { loadHist, decayOf } from './decayhist.js';

let cur = 0;
globalThis.onmessage = async (ev) => {
  const d = ev.data; if (!d) return;
  if (d.cmd === 'warm') { loadHist(); return; }                                 // erken kurulum (deney açılınca): modüller ve geçmiş verisi katalog gelmeden hazır
  if (d.cmd !== 'run') return;
  const id = d.id; cur = id;
  const t0 = performance.now();
  await loadHist();
  const omm = d.omm, n = omm.length, out = new Array(n), now = d.now;
  let last = 0;
  for (let i = 0; i < n; i++) {
    if (cur !== id) return;                                                    // daha yeni bir katalog geldi
    const { h, r } = decayOf(omm[i], now, false); out[i] = { h, r };
    if (i - last >= 500) { last = i; postMessage({ type: 'progress', id, i, n }); await new Promise((r) => setTimeout(r, 0)); }      // yeni istek iletisi işlenebilsin
  }
  postMessage({ type: 'done', id, out, ms: performance.now() - t0 });
};
