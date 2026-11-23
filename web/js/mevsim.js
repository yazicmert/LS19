// Mevsimsel Dünya: görev tarihinin karası (kar örtüsü, yeşeren ya da sararan bitki örtüsü). Kaynak NASA GIBS, VIIRS (NOAA-20) 8 günlük bulutsuz yüzey yansıması
// (M5-M4-M3 = gerçek renk; kamu malı; EPSG:4326, 500m matrisi). Yalnız düşük frekans aktarılır: 1280 × 640 (≈ 31 km/px) bir "oran" dokusu, yüksek çözünürlüklü
// taban dokunun (Blue Marble) ayrıntısını korur, rengini ve parlaklığını görev dönemine çeker:
//   gündüz = taban × 2^((oran − 0,5) · 12 · geçerlilik · kara)              (bodyshaders.js FS_EARTH seasonal)
// Oran = mozaik / taban (doğrusal), algılayıcı farkı ortanca ile ayıklanır (yalnız mevsim değişimi kalır). Kalan bulutlar: art arda 4 dönemin her pikselinde
// parlaklığa göre alt ortanca seçilir (geçici bulut ve gölge elenir); tropiklerde aşırı parlama sınırlanır (orada kar yok, beyaz leke buluttur).
// Saf hesaplar (dönemler, oran) DOM'suz: Node'da sınanır. Taban dokusu sahneden okunur (scene.js setSeason).
export const MEVSIM_KATMAN = 'VIIRS_NOAA20_L3_SurfaceReflectance_BandsM5-M4-M3_8Day';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/';
export const MW = 1280, MH = 640;                                   // 500m matrisi seviye 1: 3 × 2 parça (512 px), dünya 1280 × 640
export const KODLA = 12;                                             // oran kodlaması: v = 0,5 + log2(oran) / 12 (1/64 … 64: koyu orman üstüne kar ~35 kat)
const GUN = 864e5, ILK = Date.UTC(2018, 0, 1) + 32 * GUN;            // NOAA-20 8 günlükleri 2018-01-01'de başlar; 4 dönem geriye gidilebilmeli
const GECIKME = 16 * GUN, YAKIN = 45 * GUN;                         // dönem bitip yayımlanana dek ~1 hafta; yakın gelecekteki görev için güncel dönem

// dönem başı: her yıl 1 Ocak'tan 8'er gün (son dönem 27 Aralık, kısa)
export function donemBasi(ms) {
  const y = new Date(ms).getUTCFullYear(), j1 = Date.UTC(y, 0, 1);
  return j1 + 8 * Math.floor(Math.floor((ms - j1) / GUN) / 8) * GUN;
}
const yilKaydir = (ms, y) => { const d = new Date(ms); d.setUTCFullYear(y); return d.getTime(); };
// görev tarihi → art arda 4 dönem (YYYY-MM-DD, en yenisi önce). Yayımlanmamış gelecek: 45 güne dek güncel dönem, daha ötesi geçen yılın aynı mevsimi;
// 2018 öncesi (tarihsel görevler): yayımlanmış son yılın aynı mevsimi. Mevsim yıl yıl değişir ama ay ayına benzer: önemli olan yılın günü
export function mevsimDonemleri(ms, now = Date.now()) {
  const son = now - GECIKME;
  let a = Number.isFinite(ms) ? ms : son;
  if (a > son) a = a - son <= YAKIN ? son : yilKaydir(a, new Date(son).getUTCFullYear());
  if (a > son) a = yilKaydir(a, new Date(a).getUTCFullYear() - 1);
  if (a < ILK) { a = yilKaydir(a, new Date(son).getUTCFullYear()); if (a > son) a = yilKaydir(a, new Date(a).getUTCFullYear() - 1); }
  const out = []; let p = donemBasi(a);
  for (let k = 0; k < 4; k++) { out.push(new Date(p).toISOString().slice(0, 10)); p = donemBasi(p - GUN); }
  return out;
}
export const mevsimAdresi = (gun, x, y) => `${GIBS}${MEVSIM_KATMAN}/default/${gun}/500m/1/${y}/${x}.jpg`;

// bir dönemin 1280 × 640 RGBA'sı (satır 0 = 90° K, sütun 0 = 180° B); inmeyen parça siyah (geçersiz) kalır. Hiç parça inmezse null
export async function mevsimKaresi(gun, { signal } = {}) {
  const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, MW, MH);
  let gelen = 0;
  await Promise.all([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].map(async ([x, y]) => {
    try {
      const r = await fetch(mevsimAdresi(gun, x, y), { signal, mode: 'cors' }); if (!r.ok) return;
      const bmp = await createImageBitmap(await r.blob()); g.drawImage(bmp, x * 512, y * 512); bmp.close(); gelen++;
    } catch (e) { if (signal && signal.aborted) throw e; }
  }));
  return gelen >= 4 ? g.getImageData(0, 0, MW, MH).data : null;
}

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const EPS = 0.005;                                                   // koyu yüzeyde (orman, gölge) oran gürültüsünü bastırır

// kareler: dönemlerin RGBA'ları (en az 1, sRGB), taban: RGBA (RGB = taban dokunun sRGB'si, A = özyansıma: 0 kara, 255 su); hepsi W × H, satır 0 = kuzey.
// Dönüş: { data: RGBA (satır 0 = kuzey; RGB = 0,5 + log2(oran)/8, A = geçerlilik, kenarları yumuşatılmış), kalibre: kanal başına çıkarılan log2 ortanca }
export function mevsimOrani(kareler, taban, W = MW, H = MH) {
  const N = W * H, sel = new Uint8Array(N * 3), gec = new Uint8Array(N), lr = new Float32Array(N * 3);
  const lum = new Float32Array(kareler.length), ix = new Int8Array(kareler.length);
  for (let p = 0; p < N; p++) {
    let n = 0;
    for (let k = 0; k < kareler.length; k++) {
      const q = kareler[k], o = p * 4, r = q[o], g = q[o + 1], b = q[o + 2];
      if (Math.max(r, g, b) <= 10) continue;                         // veri boşluğu (kutup gecesi, şerit arası) siyahtır
      let j = n++; const L = r + g + b;
      while (j > 0 && lum[j - 1] > L) { lum[j] = lum[j - 1]; ix[j] = ix[j - 1]; j--; }
      lum[j] = L; ix[j] = k;
    }
    if (!n) continue;
    const q = kareler[ix[(n - 1) >> 1]], o = p * 4;                  // alt ortanca: bulut (parlak) ve bulut gölgesi (koyu) tek dönemde kalır, elenir
    gec[p] = 1; sel[p * 3] = q[o]; sel[p * 3 + 1] = q[o + 1]; sel[p * 3 + 2] = q[o + 2];
    for (let c = 0; c < 3; c++) lr[p * 3 + c] = Math.log2((LIN[q[o + c]] + EPS) / (LIN[taban[o + c]] + EPS));
  }
  // algılayıcı ve işleme farkı (VIIRS yüzey yansıması ↔ Blue Marble): kara, |enlem| < 60° pikselleri üzerinden kanal başına ortanca (64'te bir log2 kutuları)
  const B = 1024, hist = [new Uint32Array(B), new Uint32Array(B), new Uint32Array(B)]; let say = 0;
  for (let y = 0; y < H; y++) {
    if (Math.abs(90 - (y + 0.5) / H * 180) >= 60) continue;
    for (let x = 0; x < W; x++) {
      const p = y * W + x; if (!gec[p] || taban[p * 4 + 3] > 77) continue;
      say++; for (let c = 0; c < 3; c++) hist[c][Math.max(0, Math.min(B - 1, Math.round(lr[p * 3 + c] * 64) + B / 2))]++;
    }
  }
  const kalibre = hist.map((h) => { if (!say) return 0; let s = 0; for (let i = 0; i < B; i++) { s += h[i]; if (s * 2 >= say) return (i - B / 2) / 64; } return 0; });
  const out = new Uint8Array(N * 4), al = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(90 - (y + 0.5) / H * 180), tavan = lat <= 30 ? 0.68 : lat >= 40 ? 99 : 0.68 + (lat - 30) * 0.8;   // tropik: parlaklık en çok 1,6 kat
    for (let x = 0; x < W; x++) {
      const p = y * W + x, o = p * 4;
      if (!gec[p]) { out[o] = out[o + 1] = out[o + 2] = 128; continue; }
      const v = [lr[p * 3] - kalibre[0], lr[p * 3 + 1] - kalibre[1], lr[p * 3 + 2] - kalibre[2]];
      const Ls = 0.2126 * LIN[sel[p * 3]] / 2 ** kalibre[0] + 0.7152 * LIN[sel[p * 3 + 1]] / 2 ** kalibre[1] + 0.0722 * LIN[sel[p * 3 + 2]] / 2 ** kalibre[2];
      const Lt = 0.2126 * LIN[taban[o]] + 0.7152 * LIN[taban[o + 1]] + 0.0722 * LIN[taban[o + 2]];
      const fazla = Math.log2((Ls + EPS) / (Lt + EPS)) - tavan;
      let kay = -Math.max(0, fazla); const lim = KODLA / 2 - 0.02;                 // aralık dışı: üç kanal birlikte kaydırılır (tek kanal kırpılırsa renk döner: karda yeşil)
      kay -= Math.max(0, Math.max(v[0], v[1], v[2]) + kay - lim); kay += Math.max(0, -lim - (Math.min(v[0], v[1], v[2]) + kay));
      for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round((0.5 + (v[c] + kay) / KODLA) * 255)));
      al[p] = 1;
    }
  }
  // geçerlilik kenarı (kutup gecesi sınırı, veri boşluğu): ayrılabilir kutu bulanıklığı (yarıçap 6 px ≈ 1,7°), içe doğru söner; sert çizgi kalmaz
  const R = 6, tmp = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let d = -R; d <= R; d++) s += al[y * W + ((x + d + W) % W)]; tmp[y * W + x] = s / (2 * R + 1); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let d = -R; d <= R; d++) s += tmp[Math.max(0, Math.min(H - 1, y + d)) * W + x]; out[(y * W + x) * 4 + 3] = al[y * W + x] ? Math.round(s / (2 * R + 1) * 255) : 0; }
  return { data: out, kalibre };
}
