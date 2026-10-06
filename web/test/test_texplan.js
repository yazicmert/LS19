// Ana doku planı (texplan.js) ve yükleme hattı (texload.js, scene.js World.load) doğrulaması (Node 20+): cd web && node test/test_texplan.js
//  1) plandaki her dosya var; "lo" (düşük bellek) boyutu gerçek boyutun en-boy oranını korur ve gerçekten küçültür
//  2) R8 (red) dokuları gölgelendiricide yalnız .r ile okunur (yoksa G/B kanalı 0 gelir ve görüntü bozulur)
//  3) World.build'in beklediği doku anahtarlarının hepsi planda (ya da dem/model); nearest haritası texelFetch ile okunur
//  4) lowMemoryFrom doğruluk tablosu (?lowmem=1/0 her şeyden önce gelir)
//  5) yükleme hattı sözleşmeleri: bitmap kapatma yalnız GPU yüklemesinden sonra, yedek yol, derleme zaman aşımı, bağlam kaybı, boyut userData'dan
import fs from 'fs';
import { TEX, lowMemoryFrom } from '../js/texplan.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const tex = (f) => new URL(`../textures/${f}`, import.meta.url);

// görüntü boyutu: PNG IHDR / JPEG SOF
function dims(file) {
  const b = fs.readFileSync(tex(file));
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

// ---------------------------------------------------------------- 1) plan ↔ dosyalar
{
  const keys = TEX.map((s) => s.key), uniq = new Set(keys).size === keys.length && new Set(TEX.map((s) => s.f)).size === TEX.length;
  check('plan: anahtarlar ve dosyalar tekil', uniq, keys.join(','));
  const missing = TEX.filter((s) => !fs.existsSync(tex(s.f))).map((s) => s.f);
  check('plan: her dosya web/textures içinde var', missing.length === 0, missing.join(','));
  const bad = [], info = [];
  for (const s of TEX) {
    const d = dims(s.f); if (!d) { bad.push(`${s.f}: boyut okunamadı`); continue; }
    if (s.lo) {
      const ratio = Math.abs(s.lo[0] / s.lo[1] - d[0] / d[1]) < 1e-3, smaller = s.lo[0] < d[0] && s.lo[1] < d[1], enough = s.lo[0] * 2 >= d[0] * 0.5;        // en-boy oranı korunur; küçülür; ≥ ¼ alan
      if (!ratio || !smaller || !enough) bad.push(`${s.f}: ${d.join('×')} → ${s.lo.join('×')}`);
      info.push(`${s.f} ${d.join('×')}→${s.lo.join('×')}`);
    }
  }
  check('plan: düşük bellek boyutları en-boy oranını korur, küçültür ve ¼ alandan az değil', bad.length === 0, bad.join('; ') || info.slice(0, 2).join(', ') + '…');
  // bellek: RGBA8 (+mip %33) varsayımıyla toplam GPU belleği; R8 ve düşük bellek katmanı belirgin düşürür
  const mem = (lo) => TEX.reduce((a, s) => { const d = lo && s.lo ? s.lo : dims(s.f); return a + d[0] * d[1] * (s.red ? 1 : 4) * (s.nearest ? 1 : 4 / 3); }, 0) / 1e6;
  const full = mem(false), low = mem(true);
  check('bellek: tam katman ≤ 1000 MB, düşük bellek katmanı ≤ 300 MB', full <= 1000 && low <= 300, `${full.toFixed(0)} MB / ${low.toFixed(0)} MB`);
}

// ---------------------------------------------------------------- 2) R8 yalnız .r ile okunur
{
  const src = rd('../js/scene.js');
  const names = { clouds: 'cloudMap', spec: 'specMap' };
  for (const s of TEX.filter((t) => t.red)) {
    const u = names[s.key], uses = [...src.matchAll(new RegExp(`texture2D\\(\\s*${u}\\s*,[^;]*?\\)(\\.[a-z]+)?`, 'g'))];
    // eşleşme içinde iç içe parantez olabilir: kanal seçiciyi doğrudan çağrının hemen sonrasında ara
    const calls = [...src.matchAll(new RegExp(`texture2D\\(\\s*${u}\\s*,\\s*[a-zA-Z0-9_.]+\\s*\\)(\\.[a-z]+)?`, 'g'))];
    const chans = calls.map((m) => m[1] || '(yok)');
    check(`${s.f} (R8): gölgelendiricide ${u} yalnız .r ile okunur`, calls.length > 0 && chans.every((c) => c === '.r') && uses.length === calls.length, `${calls.length} okuma: ${chans.join(',')}`);
  }
  const nearest = TEX.filter((s) => s.nearest).map((s) => s.key);
  check('nearest: yalnız LOLA yükseklik haritası (mh); köşe gölgelendiricisinde texelFetch ile okunur', nearest.join() === 'mh' && /texelFetch\(\s*heightMap/.test(src), nearest.join());
}

// ---------------------------------------------------------------- 3) World.build anahtarları
{
  const src = rd('../js/scene.js'), build = src.slice(src.indexOf('  build(A) {'), src.indexOf('  prepModel('));
  const used = new Set([...build.matchAll(/\bA\.([a-zA-Z]+)\b/g)].map((m) => m[1]));
  const planKeys = new Set(TEX.map((s) => s.key)), extra = new Set(['dem', 'lander', 'stage', 'orb']);
  const unknown = [...used].filter((k) => !planKeys.has(k) && !extra.has(k)), unused = [...planKeys].filter((k) => !used.has(k));
  check('World.build: kullandığı her doku anahtarı planda; plandaki her doku kullanılıyor', unknown.length === 0 && unused.length === 0, `bilinmeyen: ${unknown.join(',') || '-'}; kullanılmayan: ${unused.join(',') || '-'}`);
}

// ---------------------------------------------------------------- 4) lowMemoryFrom
{
  const L = lowMemoryFrom, chrome = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', phone = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile Safari';
  const rows = [
    [{}, false], [{ ua: chrome }, false], [{ ua: chrome, deviceMemory: 8 }, false], [{ ua: chrome, deviceMemory: 4 }, true], [{ ua: chrome, deviceMemory: 2 }, true],
    [{ ua: phone }, true], [{ ua: phone, deviceMemory: 8 }, true], [{ ua: 'iPhone' }, true],
    [{ search: '?lowmem=1', ua: chrome, deviceMemory: 16 }, true], [{ search: '?lowmem=0', ua: phone, deviceMemory: 2 }, false], [{ search: '?a=1&lowmem=1' }, true], [{ search: '?lowmem=x', ua: chrome }, false],
  ];
  const bad = rows.filter(([o, w]) => L(o) !== w).map(([o, w]) => `${JSON.stringify(o)} → ${!w}`);
  check('lowMemoryFrom: ?lowmem=1/0 her şeyden önce; deviceMemory ≤ 4 GB ve mobil UA düşük bellek', bad.length === 0, bad.join('; '));
}

// ---------------------------------------------------------------- 5) hat sözleşmeleri (kaynak denetimi)
{
  const tl = rd('../js/texload.js'), sc = rd('../js/scene.js'), tiles = rd('../js/tiles.js');
  check('texload: createImageBitmap seçenekleri flipY + premultiplyAlpha none + colorSpaceConversion none (WebGL ImageBitmap\'te bu ayarları yok sayar)', /imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none'/.test(tl) && /t\.flipY = false/.test(tl));
  check('texload: tarayıcı flipY desteğini yoklar, desteklemiyorsa <img> yedeği (decodeImage)', /bitmapSupported/.test(tl) && /useBm \? await decodeBitmap/.test(tl) && /decodeImage/.test(tl));
  check('texload: bitmap yalnız initTexture başarılı olunca kapatılır; başarısızsa kapatılmaz (ilk çizimde yeniden denenir)', /try \{ renderer\.initTexture\(t\); \} catch \(e\) \{ return; \}[^\n]*\n\s*const im = t\.image; if \(im && typeof im\.close === 'function'\) im\.close\(\)/.test(tl));
  check('texload: yükleme boyutları userData.size\'da saklanır (kapatılan bitmap\'te image.width 0 olur)', /userData\.size = \[w, h\]/.test(tl) && /userData\.size/.test(sc) && !/A\.mh\.image/.test(sc));
  check('texload: nearest/mip ayarı yükleme öncesi (finish) yapılır; build() sonradan değiştirmez', /nearest\) \{ t\.magFilter = t\.minFilter = THREE\.NearestFilter; t\.generateMipmaps = false/.test(tl) && !/A\.mh\.(magFilter|minFilter|generateMipmaps|flipY)/.test(sc));
  check('texload: R8 yalnız bitmap yolunda (yedek yol RGBA: eski davranış)', /if \(s\.red\) \{ t\.format = THREE\.RedFormat/.test(tl) && !/decodeImage[\s\S]{0,400}RedFormat/.test(tl));
  check('World.load: dokular, arazi verisi ve modeller birlikte iner; derleme ardından ready', /Promise\.all\(\[loadTextures\(this\.renderer, base, \{ lowmem, tick \}\)/.test(sc) && /await this\.precompile\(\);[^]*this\.ready = true/.test(sc) && /TEX\.length \* 2 \+ 5/.test(sc));
  check('precompile: derleme sırasında checkShaderErrors kapalı (paralel derleme), sonra eski değer ve bağlama durumu denetimi; 10 sn zaman aşımı; eklenti yoksa eşzamanlı compile (uyarı yok)', /checkShaderErrors = false/.test(sc) && /finally \{ r\.debug\.checkShaderErrors = was; \}/.test(sc) && /LINK_STATUS/.test(sc) && /setTimeout\(res, 10000\)/.test(sc) && /extensions\.has\('KHR_parallel_shader_compile'\)/.test(sc) && /else r\.compile\(this\.scene, this\.camera\)/.test(sc));
  check('bağlam kaybı: webglcontextlost preventDefault; geri gelince bir kez yenile (30 sn içinde ikinci kayıpta döngü yok)', /webglcontextlost[^\n]*preventDefault/.test(sc) && /webglcontextrestored/.test(sc) && /ls19\.ctxReload/.test(sc) && /Date\.now\(\) - last > 30000/.test(sc));
  check('tiles: parça bitmap\'i GPU yüklemesinden sonra (onUpdate) ve atılırken kapatılır', /t\.onUpdate = \(\) => \{ t\.onUpdate = null; bm\.close\(\); \}/.test(tiles) && (tiles.match(/closeBitmap\(/g) || []).length >= 3);
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
