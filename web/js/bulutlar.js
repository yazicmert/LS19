// Görev gününün gerçek bulutları: NASA GIBS, VIIRS (NOAA-20) günlük gerçek renk mozaiği (kamu malı; EPSG:4326, 250m matrisi, 512 px parçalar).
// Parçalar bir tuvalde birleştirilir; bulut maskesi gölgelendiricide çıkarılır (bodyshaders.js FS_EARTH: parlak ve renksiz = bulut; veri boşluğu ve kar/buz durağan
// bulut dokusuna bırakılır). Tarih: görevin kalkış günü; gelecekteyse ya da henüz yayımlanmadıysa dün. Ağ yoksa ya da ?bulut=0 ise durağan doku kalır.
export const GIBS_KATMAN = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/';
// seviye 3: 10 × 5 parça → 5120 × 2560 (0,07°/px); seviye 2: 5 × 3 parça → 2560 × 1280 (son satır yarım)
export const SEVIYE = { 2: { cols: 5, rows: 3, w: 2560, h: 1280 }, 3: { cols: 10, rows: 5, w: 5120, h: 2560 } };
const GUN = 864e5;

// mozaiğin günü (UTC, YYYY-MM-DD): kalkış günü; bugün ya da gelecekse dün (günlük mozaik ertesi gün tamamlanır)
export function bulutGunu(ms, now = Date.now()) {
  const dun = Math.floor(now / GUN) * GUN - GUN;
  const t = Number.isFinite(ms) ? Math.min(Math.floor(ms / GUN) * GUN, dun) : dun;
  return new Date(t).toISOString().slice(0, 10);
}
export const parcaAdresi = (gun, z, x, y) => `${GIBS}${GIBS_KATMAN}/default/${gun}/250m/${z}/${y}/${x}.jpg`;

// gün → tuval (satır 0 = 90° K, sütun 0 = 180° B). En çok 6 eşzamanlı istek; inmeyen parça siyah kalır (gölgelendirici o yerde durağan bulutu kullanır).
export async function bulutMozaigi(gun, seviye = 3, { signal } = {}) {
  const S = SEVIYE[seviye] || SEVIYE[3];
  const cv = document.createElement('canvas'); cv.width = S.w; cv.height = S.h;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S.w, S.h);
  const isler = []; for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) isler.push([x, y]);
  let gelen = 0;
  const calis = async () => {
    for (let it = isler.shift(); it; it = isler.shift()) {
      const [x, y] = it;
      try {
        const r = await fetch(parcaAdresi(gun, seviye, x, y), { signal, mode: 'cors' }); if (!r.ok) continue;
        const bmp = await createImageBitmap(await r.blob()); g.drawImage(bmp, x * 512, y * 512); bmp.close(); gelen++;
      } catch (e) { if (signal && signal.aborted) throw e; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, calis));
  return gelen >= Math.ceil(S.cols * S.rows * 0.6) ? cv : null;                    // çoğu inmediyse (ağ, kesinti) kullanılmaz
}
