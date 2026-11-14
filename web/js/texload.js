// Ana doku yükleme hattı. Dokular fetch + createImageBitmap ile ana iş parçacığı dışında çözülür, GPU'ya yükleme yükleme ekranındayken
// (doku başına ayrı görevde, araya bir boyama girerek) yapılır ve çözülmüş bitmap yüklenince serbest bırakılır.
// Neden: 9 büyük harita (8192×4096) eskiden ilk çizimde tek karede GPU'ya gidiyordu (texImage2D + mip üretimi, ≈1 GB): sayfa 1 sn'den uzun donuyordu,
// çözülmüş bitmap'ler de (≈1 GB) yaşam boyu bellekte kalıyordu. Plan (hangi dosya, hangi biçim): texplan.js.
// Tarayıcı farklarına karşı üç savunma (gerçek cihaz/Safari'de sınanamadığı için): flipY yoklaması (<img> yedeği), resize seçeneğini yok sayan tarayıcıda tuvalle küçültme,
// R8 yüklemesi reddedilirse RGBA'ya dönüş. Düşük bellek katmanı üç yolda da çalışır (aksi halde tam da bellek darken devre dışı kalırdı).
// KTX2 (Basis Universal; texplan.js "ktx"): renk dokuları ve Dünya normali ekran kartının sıkıştırılmış biçiminde gelir (BC7/BC1 masaüstü, ASTC/ETC2 telefon):
// bellek RGBA8'in ¼–⅛'i, mip'ler dosyada, GPU'ya yükleme kısa. Biçime çevirme web işçilerinde (three KTX2Loader + basis_transcoder). Tarayıcı uygun
// biçimi desteklemezse (texplan.js ktxConfig), ?ktx=0 ise ya da dosya inmez/çözülmezse o doku WebP yolundan yüklenir.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { TEX, lowMemoryFrom, fileFor, ktxWanted, ktxConfig } from './texplan.js';

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
// KTX2: tek yükleyici (çevirici web işçileri + WASM) bir loadTextures çağrısı boyunca yaşar, sonra atılır: işçilerin WASM belleği
// (8192'lik dokuda ~100 MB) geri verilmez, işçi kapanınca boşalır. Bir sonraki çağrı (tam çözünürlüğe yükseltme) yenisini kurar (çevirici HTTP önbelleğinden).
function ktxLoader(renderer, base, workers) {
  try {
    const l = new KTX2Loader().setTranscoderPath(base + 'lib/addons/libs/basis/').setWorkerLimit(workers).detectSupport(renderer);
    const c = ktxConfig(l.workerConfig, (n) => renderer.extensions.has(n));
    if (!c) { l.dispose(); return null; }
    l.workerConfig = c;
    l.init().catch(() => {});                                                     // çevirici (JS + WASM, ~0,6 MB) dokularla birlikte hemen insin; hata ilk çevirmede görülür
    return l;
  } catch (e) { console.warn('KTX2 kullanılamıyor: ' + (e && e.message)); return null; }
}
async function decodeKtx(loader, blob, s) {
  const buf = await blob.arrayBuffer(), t = await new Promise((res, rej) => loader.parse(buf, res, rej));
  if (!t || !t.isCompressedTexture) throw new Error('sıkıştırılmış doku değil');      // yalnız sıkıştırmasız RGBA32'ye çevrilebildiyse WebP daha iyi
  t.colorSpace = s.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;          // DFD ile aynı (tools/doku_ktx2.mjs denetler); mip'ler dosyada
  t.userData.size = [t.image.width, t.image.height];
  t.userData.release = () => { t.mipmaps = []; };                                  // GPU'ya yüklendikten sonra çevrilmiş blokları bırak
  t.userData.ktx = true;
  return t;
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
// Tarayıcı ImageBitmap → R8 (tek kanal) yüklemesini kabul ediyor mu: ilk R8 dokusunda bir kez GL hatasıyla denetlenir (null: henüz bilinmiyor).
// gl.getError eşzamanlıdır: GPU'nun kuyruğu bitirmesini bekler (8192'lik doku + mip yüklemesinde ana iş parçacığı yüzlerce ms donar). Bu yüzden
// yalnız o tek denetimde çağrılır; öteki yüklemeler (tam çözünürlüğe yükseltme dahil, kullanıcı gezinirken) beklemeden geçer.
let r8 = null;
// idle: yüklemeyi tarayıcının boşta olduğu ana bırak (en çok 2 sn bekler): tam çözünürlüğe yükseltme kullanıcı gezinirken kare kaçırtmasın
const idleFrame = () => new Promise((res) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => res(), { timeout: 2000 }) : setTimeout(res, 50)));
// ?bant=1 (deneme, varsayılan kapalı): tam çözünürlüğe yükseltmede (idle yolu) sıkıştırılmış dokunun 0. seviyesi tek çağrı yerine ~2 MB'lık
// satır bantlarıyla karelere yayılır. Ölçüm (yazılım çizimi, SwiftShader): 8192×4096 BC7'nin 32 MB'lık 0. seviyesi tek çağrıda ana iş parçacığını
// 1,3–3,6 sn kilitliyordu. Gerçek GPU'da bu sürenin ne olduğu bilinmiyor: bayrak açık/kapalı karşılaştırması için (?olcum=1 en uzun kare aralığını gösterir).
// three r170'te copyTextureToTexture sıkıştırılmış biçimi renk uzayı olmadan çevirir (sRGB dokularda yanlış biçim → GL hatası): bu yüzden yer
// three ile ayrılır (source.dataReady = false: texStorage2D, veri yok), bantlar doğrudan GL ile yazılır. Bir şey eksik ya da GL hatası olursa
// dokunun tamamı three'nin olağan yoluyla yüklenir.
const BANDED = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bant') === '1';
const BAND_BYTES = 2 * 1024 * 1024;
// gerçek kare (rAF); sekme gizliyse rAF durur: o zaman kısa zamanlayıcı (çizilen kare yok, bekletmenin anlamı yok)
const nextFrame = () => new Promise((res) => { if (typeof document !== 'undefined' && document.hidden) setTimeout(res, 16); else requestAnimationFrame(() => res()); });
// dönüş: 'tamam' (bantlar yüklendi), 'yedek' (GL hatası: three ilk çizimde tek parça yükler, veri bırakılmamalı), false (bantlanamaz: olağan yol)
async function uploadBanded(renderer, t) {
  const m0 = t.mipmaps && t.mipmaps[0];
  if (!m0 || !m0.data || m0.width % 4 || m0.height % 4) return false;
  if (t.mipmaps.some((m) => m.height >= 4 && (m.width % 4 || m.height % 4 || m.data.byteLength % (m.height / 4)))) return false;   // 4×4 bloklu değil (ör. PVRTC)
  const gl = renderer.getContext(), fmt = new THREE.WebGLUtils(gl, renderer.extensions).convert(t.format, t.colorSpace);
  if (!fmt) return false;
  t.source.dataReady = false;
  try { renderer.initTexture(t); } catch (e) { t.source.dataReady = true; return false; }          // yer ayrılır (texStorage2D), veri yazılmaz
  const tex = renderer.properties.get(t).__webglTexture;
  if (!tex) { t.source.dataReady = true; t.needsUpdate = true; return false; }
  const put = (level, y, w, h, data) => { renderer.state.bindTexture(gl.TEXTURE_2D, tex); gl.compressedTexSubImage2D(gl.TEXTURE_2D, level, 0, y, w, h, fmt, data); renderer.state.unbindTexture(); };
  // BAND_BYTES'tan büyük her seviye bantlanır (8192'lik dokuda 0. seviye 32 MB, 1. seviye 8 MB); her banttan sonra gerçek bir kare beklenir
  // (frame()'in 150 ms yedeği kullanılmaz: kare çizilmeden bant göndermek GPU kuyruğunu doldurup bir sonraki bantta bekletiyordu). Küçük seviyeler birlikte.
  for (let l = 0; l < t.mipmaps.length; l++) {
    const m = t.mipmaps[l], b = m.data.byteLength;
    if (b <= BAND_BYTES || m.height < 8) { put(l, 0, m.width, m.height, m.data); continue; }
    const rows = m.height / 4, rowB = b / rows, per = Math.max(1, Math.floor(BAND_BYTES / rowB)), E = m.data.BYTES_PER_ELEMENT;
    for (let r = 0; r < rows; r += per) {
      const n = Math.min(per, rows - r);
      put(l, r * 4, m.width, n * 4, m.data.subarray(r * rowB / E, (r + n) * rowB / E));
      await nextFrame();
    }
  }
  const err = gl.getError();                                                   // tek eşzamanlı denetim, son banttan sonra (önceden kalmış bir hata da tek parça yüklemeye düşürür: güvenli yön)
  t.source.dataReady = true;
  if (err !== gl.NO_ERROR) { t.needsUpdate = true; console.warn('Bantlı doku yüklemesi başarısız (GL ' + err + '): doku tek parça yüklenecek'); return 'yedek'; }
  return 'tamam';
}
async function upload(renderer, t, idle = false) {
  await (idle ? idleFrame() : frame());
  if (idle && BANDED && t.isCompressedTexture) {
    let st = false; try { st = await uploadBanded(renderer, t); } catch (e) { t.source.dataReady = true; t.needsUpdate = true; st = 'yedek'; }
    if (st === 'tamam') { if (t.userData.release) t.userData.release(); return; }
    if (st === 'yedek') return;                                                  // veri kalır: three ilk çizimde tamamını yükler
  }
  const gl = renderer.getContext(), drain = () => { for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++); };       // önceki hatalar bu yüklemeye yazılmasın
  if (t.format === THREE.RedFormat && r8 === false) { t.format = THREE.RGBAFormat; t.needsUpdate = true; }          // R8 bu tarayıcıda çalışmıyor: baştan RGBA
  const probe = t.format === THREE.RedFormat && r8 === null;
  if (probe) drain();
  try { renderer.initTexture(t); } catch (e) { return; }                         // başarısızsa ilk çizimde yeniden denenir (bitmap kapatılmaz)
  if (probe) {
    r8 = gl.getError() === gl.NO_ERROR;
    if (!r8) {                                                                   // tarayıcı ImageBitmap → R8 yüklemesini reddetti: RGBA'ya dön (bellek 4×, görüntü aynı)
      drain(); t.dispose(); t.format = THREE.RGBAFormat; t.needsUpdate = true;
      try { renderer.initTexture(t); } catch (e) { return; }
    }
  }
  if (t.userData.release) t.userData.release();                                  // çözülmüş piksel belleğini bırak (GPU kopyası kalır)
}

// { day, night, clouds, spec, enorm, mcol, mnorm, mh, stars } → THREE.Texture | null; tick(ad): ilerleme (doku başına 2 çağrı: çözüldü, GPU'da)
// priority: fetch önceliği (tam çözünürlüğe yükseltme 'low' ister: etkileşimi ve parça indirmelerini geciktirmesin)
export async function loadTextures(renderer, base, { specs = TEX, lowmem = false, tick = () => {}, conc = lowmem ? 2 : 3, priority = null, idle = false } = {}) {
  const useBm = await bitmapSupported();
  // index.html'deki erken indirme (#earlyFetch) bu dosyayı başlattıysa aynı söz kullanılır (tek istek); başarısız indirme bir kez yeniden denenir
  const early = (globalThis.LS19_EARLY && globalThis.LS19_EARLY.tex) || {};
  const net = (f, n = 1) => fetch(base + 'textures/' + f, priority ? { priority } : undefined).then((r) => (r.ok ? r.blob() : null)).catch((e) => {
    if (n > 0) return new Promise((res) => setTimeout(res, 400)).then(() => net(f, n - 1));
    console.warn(`Doku indirilemedi (${f}): ${e && e.message}`); return null;
  });
  const get = (f) => { const p = early[f]; delete early[f]; return p ? p.then((b) => b || net(f)) : net(f); };
  // KTX2: destek WebGL bağlamından bilinir (anında); indirmeler ve çevirici beklemeden başlar. Çevirici işçisi sayısı = eşzamanlı çözme (en çok 2)
  const kl = ktxWanted(typeof location !== 'undefined' ? location.search : '') && specs.some((s) => s.ktx) ? ktxLoader(renderer, base, Math.min(conc, 2)) : null;
  const plans = specs.map((s) => fileFor(s, lowmem, false, !!kl)), blobs = plans.map((p) => get(p.file));     // indirmeler birlikte başlar; çözme sınırlı eşzamanlı (tepe bellek)
  const decode = (blob, s) => (useBm ? decodeBitmap(blob, s, lowmem) : decodeImage(blob, s, lowmem));
  const out = {}; let gpu = Promise.resolve(), next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const i = next++, s = specs[i]; let blob = await blobs[i], plan = plans[i], t = null; blobs[i] = null;
      if (plan.ktx) {
        if (blob) { try { t = await decodeKtx(kl, blob, s); } catch (e) { t = null; console.warn(`KTX2 doku çevrilemedi (${plan.file}), WebP kullanılıyor: ${e && e.message || e}`); } }
        if (!t) { plan = fileFor(s, lowmem); blob = await get(plan.file); }        // WebP yolu: aynı doku, aynı katman
      }
      if (!t && blob) { try { t = await decode(blob, plan.spec); } catch (e) { t = null; console.warn(`Doku çözülemedi (${plan.file}): ${e && e.message}`); } }
      if (!t && blob) { await gpu; try { t = await decode(blob, plan.spec); } catch (e) { t = null; } }          // bellek darken eşzamanlı çözme düşebilir: önceki dokular GPU'ya geçip bitmap belleği bırakılınca bir kez daha
      if (!t && s.fb && s.fb !== plan.file) {                                    // WebP çözülemedi (eski tarayıcı) ya da inmedi: özgün JPG/PNG, gerekirse cihazda küçültülür
        const fb = fileFor(s, lowmem, true), b2 = await get(fb.file);
        if (b2) { try { t = await decode(b2, fb.spec); } catch (e) { t = null; } }
      }
      out[s.key] = t; tick(s.f + (t ? '' : ' (yok)'));
      if (t) gpu = gpu.then(() => upload(renderer, t, idle)).then(() => tick(s.f + ' (GPU)')); else tick(s.f + ' (GPU, yok)');          // GPU yüklemeleri sıralı: tek GL bağlamı
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, specs.length) }, worker));
  await gpu;
  if (kl) kl.dispose();                                                          // çevirici işçileri ve WASM belleği bırakılır
  return out;
}
