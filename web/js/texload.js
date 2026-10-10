// Ana doku yükleme hattı. Dokular fetch + createImageBitmap ile ana iş parçacığı dışında çözülür, GPU'ya yükleme yükleme ekranındayken
// (doku başına ayrı görevde, araya bir boyama girerek) yapılır ve çözülmüş bitmap yüklenince serbest bırakılır.
// Neden: 9 büyük harita (8192×4096) eskiden ilk çizimde tek karede GPU'ya gidiyordu (texImage2D + mip üretimi, ≈1 GB): sayfa 1 sn'den uzun donuyordu,
// çözülmüş bitmap'ler de (≈1 GB) yaşam boyu bellekte kalıyordu. Plan (hangi dosya, hangi biçim): texplan.js.
// Tarayıcı farklarına karşı üç savunma (gerçek cihaz/Safari'de sınanamadığı için): flipY yoklaması (<img> yedeği), resize seçeneğini yok sayan tarayıcıda tuvalle küçültme,
// R8 yüklemesi reddedilirse RGBA'ya dönüş. Düşük bellek katmanı üç yolda da çalışır (aksi halde tam da bellek darken devre dışı kalırdı).
import * as THREE from 'three';
import { TEX, lowMemoryFrom } from './texplan.js';

export const lowMemory = () => lowMemoryFrom({ search: location.search, deviceMemory: navigator.deviceMemory, ua: navigator.userAgent });

// 2B tuvale yeniden örnekleme: resize seçeneğini yok sayan tarayıcı (bitmap yolu) ve <img> yedek yolu için; src: ImageBitmap | HTMLImageElement
function downscale(src, w, h) {
  const cv = typeof OffscreenCanvas === 'function' && !(typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
  return cv;
}

// Tarayıcı ImageBitmap'in imageOrientation:'flipY' seçeneğini uyguluyor mu? (bazıları seçeneği sessizce yok sayar → doku ters çıkar; o zaman <img> yoluna düşülür)
let probe = null;
export function bitmapSupported() {
  if (!probe) probe = (async () => {
    try {
      if (typeof createImageBitmap !== 'function' || typeof ImageData !== 'function') return false;
      const src = new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 1, 2);                      // üst piksel kırmızı, alt mavi
      const bm = await createImageBitmap(src, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 2) : Object.assign(document.createElement('canvas'), { width: 1, height: 2 });
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); bm.close();
      const d = g.getImageData(0, 0, 1, 2).data;
      return d[2] > 200 && d[0] < 50;                                                                                // çevrildi: üst piksel artık mavi
    } catch (e) { return false; }
  })();
  return probe;
}

// release: GPU'ya yüklendikten sonra çözülmüş piksel belleğini bırakan işlev (bitmap.close, tuval boyutunu sıfırla)
function finish(t, s, w, h, release) {
  t.colorSpace = s.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (s.nearest) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }      // yükleme öncesi ayarlanmalı: mip üretimi ve süzgeç ilk yüklemede belirlenir
  t.userData.size = [w, h];                                                                           // bitmap kapatılınca image.width 0 olur: boyut burada saklanır
  t.userData.release = release || null;
  t.needsUpdate = true; return t;
}
async function decodeBitmap(blob, s, lowmem) {
  const want = lowmem && s.lo ? s.lo : null;
  const opt = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };      // WebGL ImageBitmap'te flipY/alfa/renk ayarlarını yok sayar: oluşturma seçenekleri geçerli
  if (want) { opt.resizeWidth = want[0]; opt.resizeHeight = want[1]; opt.resizeQuality = 'high'; }
  let bm = await createImageBitmap(blob, opt);
  if (want && (bm.width !== want[0] || bm.height !== want[1])) {                                         // tarayıcı resize'ı yok saydı: tuvalde küçült (içerik zaten çevrilmiş, ek yönelim yok)
    const cv = downscale(bm, want[0], want[1]); bm.close(); bm = await createImageBitmap(cv);
  }
  const t = new THREE.Texture(bm); t.flipY = false;
  if (s.red) { t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; }                          // R8: gölgelendirici yalnız .r okur
  const b = bm;
  return finish(t, s, b.width, b.height, () => b.close());
}
function decodeImage(blob, s, lowmem) {                                                               // yedek yol (eski davranış): <img>, RGBA; düşük bellekte tuvalle küçültülür
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (lowmem && s.lo) { const cv = downscale(img, s.lo[0], s.lo[1]); res(finish(new THREE.Texture(cv), s, s.lo[0], s.lo[1], () => { cv.width = cv.height = 0; })); }
      else res(finish(new THREE.Texture(img), s, img.naturalWidth, img.naturalHeight, null));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('görüntü çözülemedi')); };
    img.src = url;
  });
}

// bir boyama araya girsin (yükleme çubuğu akar); arka sekmede rAF durur: zaman aşımı yedeği
const frame = () => new Promise((res) => { let d = false; const go = () => { if (!d) { d = true; res(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 150); });
async function upload(renderer, t) {
  await frame();
  const gl = renderer.getContext(), drain = () => { for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++); };       // önceki hatalar bu yüklemeye yazılmasın
  drain();
  const red = t.format === THREE.RedFormat;
  try { renderer.initTexture(t); } catch (e) { return; }                         // başarısızsa ilk çizimde yeniden denenir (bitmap kapatılmaz)
  if (red && gl.getError() !== gl.NO_ERROR) {                                    // tarayıcı ImageBitmap → R8 yüklemesini reddetti: RGBA'ya dön (bellek 4×, görüntü aynı)
    drain(); t.dispose(); t.format = THREE.RGBAFormat; t.needsUpdate = true;
    try { renderer.initTexture(t); } catch (e) { return; }
  }
  if (t.userData.release) t.userData.release();                                  // çözülmüş piksel belleğini bırak (GPU kopyası kalır)
}

// { day, night, clouds, spec, enorm, mcol, mnorm, mh, stars } → THREE.Texture | null; tick(ad): ilerleme (doku başına 2 çağrı: çözüldü, GPU'da)
export async function loadTextures(renderer, base, { specs = TEX, lowmem = false, tick = () => {}, conc = lowmem ? 2 : 3 } = {}) {
  const useBm = await bitmapSupported();
  const blobs = specs.map((s) => fetch(base + 'textures/' + s.f).then((r) => (r.ok ? r.blob() : null)).catch(() => null));   // indirmeler birlikte başlar; çözme sınırlı eşzamanlı (tepe bellek)
  const out = {}; let gpu = Promise.resolve(), next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const i = next++, s = specs[i], blob = await blobs[i]; blobs[i] = null; let t = null;
      if (blob) { try { t = useBm ? await decodeBitmap(blob, s, lowmem) : await decodeImage(blob, s, lowmem); } catch (e) { t = null; } }
      out[s.key] = t; tick(s.f + (t ? '' : ' (yok)'));
      if (t) gpu = gpu.then(() => upload(renderer, t)).then(() => tick(s.f + ' (GPU)')); else tick(s.f + ' (GPU, yok)');          // GPU yüklemeleri sıralı: tek GL bağlamı
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, specs.length) }, worker));
  await gpu;
  return out;
}
