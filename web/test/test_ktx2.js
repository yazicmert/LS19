// KTX2 dokuları (Basis Universal; tools/doku_ktx2.mjs üretir) ve KTX2 yolu doğrulaması (Node 20+): cd web && node test/test_ktx2.js
//  1) texplan.js'te "ktx" olan her doku için .ktx2 (ve küçük dosyası olanlarda _lo.ktx2) var; başlık: Basis (vkFormat 0), ETC1S (BasisLZ),
//     boyut WebP ile aynı, tam mip zinciri, sRGB bayrağı plandaki gibi, tek katman/yüz
//  2) tek kanallı haritalar (R8) ve Ay yükseklik haritası KTX2'ye geçmez (bellek kazancı yok / kayıpsız gerekir)
//  3) ktxConfig: sRGB türü olmayan biçimler kapatılır, hiçbiri kalmazsa null (WebP); ktxWanted (?ktx=0)
//  4) fileFor KTX2 yolu; indirme ve ekran kartı belleği karşılaştırması (WebP yolu ile)
//  5) parseKtx2 bozuk/kısa dosyayı reddeder; texload KTX2 yolunun sözleşmeleri (WebP'ye dönüş, yükleyici atılır, bloklar bırakılır)
//  6) çevirici dosyaları (three r170 basis_transcoder) ve KTX2Loader bağımlılıkları yerinde
import fs from 'fs';
import { createRequire } from 'module';
import { TEX, ktxName, fileFor, ktxConfig, ktxWanted } from '../js/texplan.js';
import { parseKtx2, fullMipLevels, MODEL, KTX2_ID } from '../../tools/ktx2.mjs';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const tex = (f) => new URL(`../textures/${f}`, import.meta.url);
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const size = (f) => fs.statSync(tex(f)).size;
// WebP boyutu (VP8/VP8L/VP8X)
function webpDims(f) {
  const b = fs.readFileSync(tex(f)), c = b.toString('latin1', 12, 16);
  if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (c === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1]; }
  return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
}

const K = TEX.filter((s) => s.ktx);
// ---------------------------------------------------------------- 1) dosyalar ve başlıklar
{
  const bad = [], info = [];
  for (const s of K) {
    for (const lo of s.flo ? [false, true] : [false]) {
      const f = ktxName(s, lo);
      if (!fs.existsSync(tex(f))) { bad.push(`${f} yok`); continue; }
      let h;
      try { h = parseKtx2(new Uint8Array(fs.readFileSync(tex(f)))); } catch (e) { bad.push(`${f}: ${e.message}`); continue; }
      const want = webpDims(lo ? s.flo : s.f), why = [];
      if (h.width !== want[0] || h.height !== want[1]) why.push(`boyut ${h.width}×${h.height} ≠ WebP ${want.join('×')}`);
      if (h.vkFormat !== 0 || h.scheme !== 1 || h.model !== MODEL.ETC1S) why.push(`biçim vk${h.vkFormat}/üst${h.scheme}/model${h.model} (ETC1S BasisLZ değil)`);
      if (h.levels !== fullMipLevels(h.width, h.height)) why.push(`mip ${h.levels} ≠ ${fullMipLevels(h.width, h.height)}`);
      if (h.srgb !== !!s.srgb) why.push(`sRGB ${h.srgb}, plan ${!!s.srgb}`);
      if (h.layers > 1 || h.faces !== 1) why.push('katman/yüz');
      if (h.width % 4 || h.height % 4) why.push('4\'ün katı değil');
      if (why.length) bad.push(`${f}: ${why.join(', ')}`); else info.push(`${f} ${h.width}×${h.height} ${(size(f) / 1e6).toFixed(1)} MB`);
    }
  }
  check(`KTX2: "ktx" olan ${K.length} doku için dosyalar var; ETC1S, boyut WebP ile aynı, tam mip, sRGB bayrağı plandaki gibi`, K.length >= 5 && bad.length === 0, bad.join('; ') || info.slice(0, 3).join(', ') + '…');
  // -y_flip: ilk satır görüntünün altı olmalı (sıkıştırılmış dokuda flipY yok; WebGL'de v=0 ilk satırdır). basisu yönelim anahtarı yazmadığından
  // sitenin çeviricisiyle (three r170 basis_transcoder) çözüp bakılır: gece haritasında şehir ışıkları kuzeyde, yani dosyanın SON yarısında
  const src = rd('../lib/addons/libs/basis/basis_transcoder.js'), mod = { exports: {} }, dir = new URL('../lib/addons/libs/basis/', import.meta.url).pathname;
  new Function('module', 'exports', 'require', '__dirname', '__filename', src)(mod, mod.exports, createRequire(import.meta.url), dir, dir + 'basis_transcoder.js');      // CommonJS sarmalı (depo "type": "module")
  const B = await mod.exports({ wasmBinary: fs.readFileSync(new URL('../lib/addons/libs/basis/basis_transcoder.wasm', import.meta.url)) });
  B.initializeBasis();
  const f = new B.KTX2File(new Uint8Array(fs.readFileSync(tex('earth_night_lo.ktx2')))), L = 2;            // 1024×512 mip yeter
  let half = null;
  if (f.isValid() && f.startTranscoding()) {
    const n = f.getImageTranscodedSizeInBytes(L, 0, 0, 13), d = new Uint8Array(n), w = 4096 >> L, h = 2048 >> L;
    if (f.transcodeImage(d, L, 0, 0, 13, 0, -1, -1)) {
      half = [0, 0];                                                                                   // parlak (şehir ışığı) piksel sayısı: ilk yarı, ikinci yarı
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (d[o] + d[o + 1] + d[o + 2] > 360) half[y < h / 2 ? 0 : 1]++; }
    }
  }
  f.close(); f.delete();
  check('KTX2: yönelim y_flip (r170 çevirici açar; gece haritasında ışıklı kuzey dosyanın ikinci yarısında: ilk satır görüntünün altı = WebGL v=0)', !!half && half[1] > 3 * half[0], half ? `parlak piksel: ilk yarı ${half[0]}, ikinci yarı ${half[1]}` : 'çözülemedi');
  const extra = fs.readdirSync(new URL('../textures/', import.meta.url)).filter((f) => f.endsWith('.ktx2') && !K.some((s) => f === ktxName(s) || (s.flo && f === ktxName(s, true))));
  check('KTX2: planda olmayan artık .ktx2 dosyası yok', extra.length === 0, extra.join(','));
}

// ---------------------------------------------------------------- 2) KTX2'ye geçmeyenler
{
  const red = TEX.filter((s) => s.red && s.ktx).map((s) => s.key), mh = TEX.find((s) => s.key === 'mh');
  check('tek kanallı haritalar (bulut, özyansıma) WebP R8 kalır: masaüstünde BC7 de 8 bit/piksel, bulut ETC1S\'te bozuluyor', red.length === 0 && TEX.filter((s) => s.red).length === 2, red.join(','));
  check('Ay yükseklik haritası (16 bit paketli, en yakın örnekleme) ve Ay normal haritası (ETC1S\'te krater gölgeleri bloklaşıyor) KTX2\'ye geçmez', !mh.ktx && mh.nearest && !TEX.find((s) => s.key === 'mnorm').ktx);
  const tool = rd('../../tools/doku_ktx2.mjs'), plan = /const PLAN = \{([\s\S]*?)\};/.exec(tool)[1], keys = [...plan.matchAll(/(\w+): \['(etc1s|uastc)'/g)].map((m) => m[1]);
  check('tools/doku_ktx2.mjs PLAN = texplan.js "ktx" dokuları (ne eksik ne fazla)', JSON.stringify([...keys].sort()) === JSON.stringify(K.map((s) => s.key).sort()), keys.join(','));
}

// ---------------------------------------------------------------- 3) ktxConfig / ktxWanted
{
  const base = { astcSupported: false, astcHDRSupported: false, etc1Supported: false, etc2Supported: false, dxtSupported: false, bptcSupported: false, pvrtcSupported: false };
  const has = (list) => (n) => list.includes(n);
  const rows = [
    ['masaüstü BC7 + S3TC sRGB', { ...base, bptcSupported: true, dxtSupported: true }, ['WEBGL_compressed_texture_s3tc_srgb'], (c) => c && c.bptcSupported && c.dxtSupported],
    ['masaüstü yalnız S3TC, sRGB eklentisi var', { ...base, dxtSupported: true }, ['WEBGL_compressed_texture_s3tc_srgb'], (c) => c && c.dxtSupported],
    ['masaüstü yalnız S3TC, sRGB eklentisi yok → WebP', { ...base, dxtSupported: true }, [], (c) => c === null],
    ['telefon ETC2 + ASTC', { ...base, etc2Supported: true, astcSupported: true, etc1Supported: true }, [], (c) => c && c.etc2Supported && c.astcSupported && !c.etc1Supported],
    ['yalnız ETC1/PVRTC (sRGB türü yok) → WebP', { ...base, etc1Supported: true, pvrtcSupported: true }, [], (c) => c === null],
    ['hiç sıkıştırma yok → WebP', base, [], (c) => c === null],
    ['detectSupport sonucu yok → WebP', null, [], (c) => c === null],
  ];
  const bad = rows.filter(([, cfg, ext, ok]) => !ok(ktxConfig(cfg, has(ext)))).map(([n]) => n);
  check('ktxConfig: ETC1/PVRTC kapatılır, S3TC yalnız sRGB eklentisiyle; uygun biçim kalmazsa null (WebP)', bad.length === 0, bad.join('; '));
  check('ktxConfig: girdi nesnesini değiştirmez', (() => { const c = { ...base, etc1Supported: true, etc2Supported: true }; ktxConfig(c, has([])); return c.etc1Supported === true; })());
  check('ktxWanted: ?ktx=0 WebP ister, öteki her durumda KTX2', ktxWanted('') && ktxWanted('?ktx=1') && ktxWanted('?lowmem=1') && !ktxWanted('?ktx=0') && !ktxWanted('?a=1&ktx=0'));
}

// ---------------------------------------------------------------- 4) fileFor ve boyut/bellek karşılaştırması
{
  const day = TEX.find((s) => s.key === 'day'), en = TEX.find((s) => s.key === 'enorm'), cl = TEX.find((s) => s.key === 'clouds');
  const a = fileFor(day, true, false, true), b = fileFor(day, false, false, true), c = fileFor(en, true, false, true), d = fileFor(cl, true, false, true), e = fileFor(day, true, true, true);
  check('fileFor(ktx): ilk yükleme _lo.ktx2, tam katman .ktx2, küçük dosyası olmayan tam .ktx2, KTX2\'siz doku WebP, yedekte özgün dosya; KTX2\'de cihazda küçültme yok',
    a.file === 'earth_day_lo.ktx2' && a.ktx && a.spec.lo === null && b.file === 'earth_day.ktx2' && c.file === 'earth_normal.ktx2' && d.file === cl.flo && !d.ktx && e.file === day.fb && !e.ktx);
  const first = (k) => TEX.reduce((s, t) => s + size(fileFor(t, true, false, k).file), 0) / 1e6, full = (k) => TEX.reduce((s, t) => s + size(fileFor(t, false, false, k).file), 0) / 1e6;
  check('indirme: KTX2 ilk yükleme ve tam katman WebP yolundan en çok %15 büyük', first(true) <= 1.15 * first(false) && full(true) <= 1.15 * full(false),
    `ilk ${first(false).toFixed(1)} → ${first(true).toFixed(1)} MB, tam ${full(false).toFixed(1)} → ${full(true).toFixed(1)} MB`);
  // ekran kartı belleği (mip +⅓): WebP yolu RGBA8 / R8; KTX2 en kötü 8 bit/piksel (BC7, ASTC 4×4), telefonda ETC1S → ETC1 4 bit/piksel
  const dim = (s, lo) => (lo && s.flo ? webpDims(s.flo) : webpDims(s.f));
  const vram = (lo, k, bpp = 8) => TEX.reduce((sum, s) => { const [w, h] = dim(s, lo), px = w * h * (s.nearest ? 1 : 4 / 3); return sum + px * (k && s.ktx ? bpp / 8 : (s.red ? 1 : 4)); }, 0) / 1048576;
  const v = [vram(false, false), vram(false, true), vram(true, false), vram(true, true, 4)];
  check('ekran kartı: masaüstü tam katman KTX2 ile en az 2,5 kat (BC7; bulut R8, Ay normali ve yüksekliği WebP kalır), telefon (düşük bellek, ETC1) en az 3,5 kat az', v[1] * 2.5 <= v[0] && v[3] * 3.5 <= v[2],
    `masaüstü ${v[0].toFixed(0)} → ${v[1].toFixed(0)} MB, telefon ${v[2].toFixed(0)} → ${v[3].toFixed(0)} MB`);
}

// ---------------------------------------------------------------- 5) parseKtx2 ve texload sözleşmeleri
{
  const ok = new Uint8Array(fs.readFileSync(tex(ktxName(K[0], !!K[0].flo))));
  const bad = [new Uint8Array(10), ok.slice(0, 60), (() => { const x = ok.slice(); x[1] = 0; return x; })(), (() => { const x = ok.slice(); new DataView(x.buffer).setUint32(80, 0xfffffff0, true); return x; })()];
  const rej = bad.map((b) => { try { parseKtx2(b); return false; } catch (e) { return true; } });
  check('parseKtx2: kısa, tanımlayıcısı bozuk ya da düzeyi dosya dışına taşan dosyayı reddeder', rej.every(Boolean) && KTX2_ID.length === 12, rej.join(','));
  const tl = rd('../js/texload.js');
  check('texload: KTX2Loader detectSupport → ktxConfig (uygun biçim yoksa WebP); çevirici yolu lib/addons/libs/basis/',
    /import \{ KTX2Loader \} from 'three\/addons\/loaders\/KTX2Loader\.js'/.test(tl) && /detectSupport\(renderer\)/.test(tl) && /ktxConfig\(l\.workerConfig, \(n\) => renderer\.extensions\.has\(n\)\)/.test(tl) && /setTranscoderPath\(base \+ 'lib\/addons\/libs\/basis\/'\)/.test(tl));
  check('texload: KTX2 inmez ya da çevrilemezse aynı doku WebP yolundan (aynı katman) yüklenir; sıkıştırmasız RGBA32\'ye düşerse de WebP',
    /if \(!t\) \{ plan = fileFor\(s, lowmem\); blob = await get\(plan\.file\); \}/.test(tl) && /if \(!t \|\| !t\.isCompressedTexture\) throw/.test(tl));
  check('texload: KTX2 dokusunda renk uzayı plandan, mip dosyadan; GPU\'ya yüklenince çevrilmiş bloklar bırakılır; yükleyici (işçiler, WASM belleği) çağrı sonunda atılır',
    /t\.colorSpace = s\.srgb \? THREE\.SRGBColorSpace : THREE\.NoColorSpace; t\.anisotropy = 8;/.test(tl) && /t\.userData\.release = \(\) => \{ t\.mipmaps = \[\]; \}/.test(tl) && /if \(kl\) kl\.dispose\(\);/.test(tl) && /ktxWanted\(typeof location !== 'undefined' \? location\.search : ''\)/.test(tl));
}

// ---------------------------------------------------------------- 6) çevirici ve yükleyici dosyaları
{
  const lib = (f) => new URL(`../lib/addons/${f}`, import.meta.url);
  const files = ['loaders/KTX2Loader.js', 'utils/WorkerPool.js', 'libs/ktx-parse.module.js', 'libs/zstddec.module.js', 'math/ColorSpaces.js', 'libs/basis/basis_transcoder.js', 'libs/basis/basis_transcoder.wasm'];
  const miss = files.filter((f) => !fs.existsSync(lib(f)));
  check('KTX2Loader (three r170) ve bağımlılıkları, basis_transcoder.js/.wasm web/lib/addons altında', miss.length === 0, miss.join(','));
  const w = fs.readFileSync(lib('libs/basis/basis_transcoder.wasm'));
  check('basis_transcoder.wasm geçerli WebAssembly', w.readUInt32BE(0) === 0x0061736d && WebAssembly.validate(w));
  const ld = fs.readFileSync(lib('loaders/KTX2Loader.js'), 'utf8');
  check('KTX2Loader değiştirilmemiş three r170 kopyası (ETC1S sıralama notu ve basis_transcoder adları yerinde)', /historical accident/.test(ld) && /'basis_transcoder\.js'/.test(ld) && /'basis_transcoder\.wasm'/.test(ld));
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
