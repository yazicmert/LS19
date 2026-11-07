// Ana doku planı (texplan.js) ve yükleme hattı (texload.js, scene.js World.load) doğrulaması (Node 20+): cd web && node test/test_texplan.js
//  1) plandaki her dosya var; "lo" (düşük bellek) boyutu gerçek boyutun en-boy oranını korur ve gerçekten küçültür
//  2) R8 (red) dokuları gölgelendiricide yalnız .r ile okunur (yoksa G/B kanalı 0 gelir ve görüntü bozulur)
//  3) World.build'in beklediği doku anahtarlarının hepsi planda (ya da dem/model); nearest haritası texelFetch ile okunur
//  4) lowMemoryFrom doğruluk tablosu (?lowmem=1/0 her şeyden önce gelir)
//  5) yükleme hattı sözleşmeleri: bitmap kapatma yalnız GPU yüklemesinden sonra, yedek yol, derleme zaman aşımı, bağlam kaybı, boyut userData'dan
//  6) ilk yükleme her cihazda önceden küçültülmüş dosyalar (index.html erken indirmesi aynı liste); masaüstü tam çözünürlüğe yükseltir
import fs from 'fs';
import { TEX, lowMemoryFrom, fileFor, UPGRADE } from '../js/texplan.js';
import { sceneSrc } from './scenesrc.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const tex = (f) => new URL(`../textures/${f}`, import.meta.url);

// görüntü boyutu: PNG IHDR / JPEG SOF / WebP (VP8, VP8L, VP8X)
function dims(file) {
  const b = fs.readFileSync(tex(file));
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const c = b.toString('latin1', 12, 16);
    if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (c === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1]; }
    if (c === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    return null;
  }
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
  // WebP ana dosyalar, önceden küçültülmüş düşük bellek dosyaları, özgün yedekler (tools/doku_webp.py)
  const fbBad = TEX.filter((s) => !s.fb || !fs.existsSync(tex(s.fb)) || String(dims(s.fb)) !== String(dims(s.f))).map((s) => s.f);
  check('plan: her WebP dokunun özgün yedeği (JPG/PNG) var ve aynı boyutta', fbBad.length === 0, fbBad.join(','));
  const loBad = TEX.filter((s) => s.lo && (!s.flo || !fs.existsSync(tex(s.flo)) || String(dims(s.flo)) !== String(s.lo))).map((s) => s.flo || s.f);
  check('plan: "lo" boyutlu her dokunun önceden küçültülmüş dosyası var, boyutu tam lo', loBad.length === 0 && TEX.every((s) => !s.flo || s.lo), loBad.join(','));
  check('plan: tüm ana dosyalar WebP', TEX.every((s) => /\.webp$/.test(s.f)));
  const mhs = TEX.find((s) => s.key === 'mh'), p1 = fileFor(TEX[0], true), p2 = fileFor(TEX[0], false), p3 = fileFor(TEX[0], true, true), pm = fileFor(mhs, true), pmf = fileFor(mhs, true, true);
  check('fileFor: düşük bellekte küçük dosya (yeniden küçültme yok), tam katmanda ana dosya, yedekte özgün dosya + cihazda küçültme; yükseklik haritası yedekte küçültülmez (paketli 16 bit)',
    p1.file === TEX[0].flo && p1.spec.lo === null && p2.file === TEX[0].f && p2.spec === TEX[0] && p3.file === TEX[0].fb && p3.spec.lo === TEX[0].lo && pm.file === 'moon_height_lo.webp' && pm.spec.lo === null && pmf.file === 'moon_height.png' && pmf.spec.lo === null);
  const first = TEX.reduce((a, s) => a + fs.statSync(tex(fileFor(s, true).file)).size, 0), whole = TEX.reduce((a, s) => a + fs.statSync(tex(s.f)).size, 0);
  check('ilk yükleme (önceden küçültülmüş dosyalar) tam çözünürlüğün en çok %40\'ı', first <= 0.4 * whole, `${(first / 1e6).toFixed(1)} MB / ${(whole / 1e6).toFixed(1)} MB`);
  const sz = (lo) => TEX.reduce((a, s) => a + fs.statSync(tex(fileFor(s, lo).file)).size, 0) / 1e6, szOld = TEX.reduce((a, s) => a + fs.statSync(tex(s.fb)).size, 0) / 1e6;
  check('indirme: WebP masaüstünde özgünden ≥ %25, düşük bellekte ≥ %60 az', sz(false) <= 0.75 * szOld && sz(true) <= 0.4 * szOld, `özgün ${szOld.toFixed(1)} MB → masaüstü ${sz(false).toFixed(1)} MB, düşük bellek ${sz(true).toFixed(1)} MB`);
  // bellek: RGBA8 (+mip %33) varsayımıyla toplam GPU belleği; R8 ve düşük bellek katmanı belirgin düşürür
  const mem = (lo) => TEX.reduce((a, s) => { const d = lo && s.lo ? s.lo : dims(s.f); return a + d[0] * d[1] * (s.red ? 1 : 4) * (s.nearest ? 1 : 4 / 3); }, 0) / 1e6;
  const full = mem(false), low = mem(true);
  check('bellek: tam katman ≤ 1000 MB, düşük bellek katmanı ≤ 300 MB', full <= 1000 && low <= 300, `${full.toFixed(0)} MB / ${low.toFixed(0)} MB`);
}

// ---------------------------------------------------------------- 2) R8 yalnız .r ile okunur
{
  const src = sceneSrc();
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
  const src = sceneSrc(), build = src.slice(src.indexOf('  build(A) {'), src.indexOf('  prepModel('));
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
  const tl = rd('../js/texload.js'), sc = sceneSrc(), tiles = rd('../js/tiles.js');
  check('texload: createImageBitmap seçenekleri flipY + premultiplyAlpha none + colorSpaceConversion none (WebGL ImageBitmap\'te bu ayarları yok sayar)', /imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none'/.test(tl) && /t\.flipY = false/.test(tl));
  check('texload: tarayıcı flipY desteğini yoklar, desteklemiyorsa <img> yedeği (decodeImage)', /bitmapSupported/.test(tl) && /useBm \? (await )?decodeBitmap/.test(tl) && /decodeImage/.test(tl));
  check('texload: çözülmüş piksel belleği (release: bitmap.close / tuval 0×0) yalnız initTexture başarılı olunca bırakılır; başarısızsa bırakılmaz (ilk çizimde yeniden denenir)', /try \{ renderer\.initTexture\(t\); \} catch \(e\) \{ return; \}[^\n]*\n\s*if \(probe\) \{/.test(tl) && /if \(t\.userData\.release\) t\.userData\.release\(\)/.test(tl) && /\(\) => b\.close\(\)/.test(tl) && /cv\.width = cv\.height = 0/.test(tl));
  check('texload: R8 yüklemesi GL hatası verirse (tarayıcı ImageBitmap → RED desteklemiyor) doku atılıp RGBA olarak yeniden yüklenir; sonraki R8 dokular baştan RGBA (bulut/özyansıma kaybolmaz)', /t\.dispose\(\); t\.format = THREE\.RGBAFormat; t\.needsUpdate = true;\s*\n?\s*try \{ renderer\.initTexture\(t\)/.test(tl) && /drain\(\)/.test(tl) && /r8 = gl\.getError\(\) === gl\.NO_ERROR/.test(tl) && /t\.format === THREE\.RedFormat && r8 === false\) \{ t\.format = THREE\.RGBAFormat/.test(tl));
  const getErr = (tl.match(/gl\.getError\(\)/g) || []).length;
  check('texload: eşzamanlı gl.getError (GPU kuyruğunu bekler) yalnız ilk R8 denetiminde; öteki yüklemeler (tam çözünürlüğe yükseltme) beklemeden', getErr === 2 && /const probe = t\.format === THREE\.RedFormat && r8 === null;/.test(tl) && /if \(probe\) drain\(\);/.test(tl), `${getErr} çağrı`);
  check('texload: düşük bellek katmanı üç yolda da çalışır: resize destekli bitmap, resize\'ı yok sayan tarayıcı (tuvalle küçült), <img> yedek yolu (tuvalle küçült)', /opt\.resizeWidth = want\[0\]/.test(tl) && /bm\.width !== want\[0\] \|\| bm\.height !== want\[1\]/.test(tl) && /downscale\(bm, want\[0\], want\[1\]\)/.test(tl) && /downscale\(img, s\.lo\[0\], s\.lo\[1\]\)/.test(tl) && /decodeImage\(blob, s, lowmem\)/.test(tl));
  check('tiles: parça çözme de aynı flipY yoklamasını kullanır (flipY\'yi yok sayan tarayıcıda parçalar ters çıkmasın); yoklama başarısızsa <img> yolu', /import \{ bitmapSupported \} from '\.\/texload\.js'/.test(tiles) && /if \(await bitmapSupported\(\)\)/.test(tiles) && /t\.flipY = true; return t;/.test(tiles));
  check('bağlam kaybı: 30 sn içinde ikinci kayıpta yenileme yok; onContextProblem ile kullanıcıya "sayfayı yenileyin" bildirilir (sessiz bozulma yok)', /else if \(this\.onContextProblem\) this\.onContextProblem\(\)/.test(sc) && /world\.onContextProblem = \(\) => \{/.test(rd('../js/app.js')) && /Sayfayı yenileyin/.test(rd('../js/app.js')));
  check('texload: yükleme boyutları userData.size\'da saklanır (kapatılan bitmap\'te image.width 0 olur)', /userData\.size = \[w, h\]/.test(tl) && /userData\.size/.test(sc) && !/A\.mh\.image/.test(sc));
  check('texload: nearest/mip ayarı yükleme öncesi (finish) yapılır; build() sonradan değiştirmez', /nearest\) \{ t\.magFilter = t\.minFilter = THREE\.NearestFilter; t\.generateMipmaps = false/.test(tl) && !/A\.mh\.(magFilter|minFilter|generateMipmaps|flipY)/.test(sc));
  check('texload: R8 yalnız bitmap yolunda (yedek yol RGBA: eski davranış)', /if \(s\.red\) \{ t\.format = THREE\.RedFormat/.test(tl) && !/decodeImage[\s\S]{0,400}RedFormat/.test(tl));
  check('World.load: dokular (her cihazda önce küçük dosyalar), arazi verisi ve modeller birlikte iner; derleme ardından ready', /Promise\.all\(\[loadTextures\(this\.renderer, base, \{ lowmem: true, conc: lowmem \? 2 : 3, tick \}\)/.test(sc) && /await this\.precompile\(\);[^]*this\.ready = true/.test(sc) && /TEX\.length \* 2 \+ 5/.test(sc));
  check('precompile: derleme sırasında checkShaderErrors kapalı (paralel derleme), sonra eski değer ve bağlama durumu denetimi; 10 sn zaman aşımı; eklenti yoksa eşzamanlı compile (uyarı yok)', /checkShaderErrors = false/.test(sc) && /finally \{ r\.debug\.checkShaderErrors = was; \}/.test(sc) && /LINK_STATUS/.test(sc) && /setTimeout\(res, 10000\)/.test(sc) && /extensions\.has\('KHR_parallel_shader_compile'\)/.test(sc) && /else r\.compile\(this\.scene, this\.camera\)/.test(sc));
  check('bağlam kaybı: webglcontextlost preventDefault; geri gelince bir kez yenile (30 sn içinde ikinci kayıpta döngü yok)', /webglcontextlost[^\n]*preventDefault/.test(sc) && /webglcontextrestored/.test(sc) && /ls19\.ctxReload/.test(sc) && /Date\.now\(\) - last > 30000/.test(sc));
  check('tiles: parça bitmap\'i GPU yüklemesinden sonra (onUpdate) ve atılırken kapatılır', /t\.onUpdate = \(\) => \{ t\.onUpdate = null; bm\.close\(\); \}/.test(tiles) && (tiles.match(/closeBitmap\(/g) || []).length >= 3);
}

// ---------------------------------------------------------------- 6) index.html erken indirme listesi = texplan.js (dosyalar ve düşük bellek kuralı)
{
  const html = rd('../index.html'), m = /<script id="earlyFetch">([\s\S]*?)<\/script>/.exec(html);
  check('index.html: erken indirme betiği var, modül betiklerinden önce', !!m && html.indexOf('id="earlyFetch"') < html.indexOf('type="module"'));
  const vm = await import('node:vm'), cases = [];
  for (const search of ['', '?lowmem=1', '?lowmem=0']) for (const deviceMemory of [0, 2, 4, 8]) for (const ua of ['Mozilla/5.0 (X11; Linux x86_64) Chrome/130', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari']) cases.push({ search, deviceMemory, ua });
  const bad = [];
  for (const c of cases) {
    const links = [], fetched = [], document = { head: { appendChild: (l) => links.push(l) }, createElement: () => ({ setAttribute(k, v) { this[k] = v; } }) };
    const fetch = (u, o) => { fetched.push([u, o]); return { then: () => ({ catch: () => null }) }; }, window = {};
    vm.runInNewContext(m[1], { document, window, fetch, location: { search: c.search }, navigator: { deviceMemory: c.deviceMemory || undefined, userAgent: c.ua }, URLSearchParams });
    window.fetch = fetch; fetched.length = 0; links.length = 0;
    vm.runInNewContext(m[1], { document, window, fetch, location: { search: c.search }, navigator: { deviceMemory: c.deviceMemory || undefined, userAgent: c.ua }, URLSearchParams });
    const tex = fetched.map(([u]) => u.slice(9)), want = TEX.map((s) => fileFor(s, true).file);          // ilk yükleme her cihazda aynı
    if (JSON.stringify(tex) !== JSON.stringify(want) || !fetched.every(([u, o]) => u.startsWith('textures/') && o.priority === 'low') || JSON.stringify(Object.keys(window.LS19_EARLY.tex)) !== JSON.stringify(want)) bad.push(JSON.stringify(c));
    if (!links.some((l) => l.href === 'data/eph/v1/index.json') || !links.some((l) => l.href === 'data/eph/v1/head.bin') || links.some((l) => /textures\//.test(l.href))) bad.push('eph ' + JSON.stringify(c));
  }
  check(`erken indirme: ${cases.length} durumda (?lowmem, deviceMemory, mobil UA) dokular texload.js'in ilk yüklemede indireceğiyle aynı, fetch ile başlatılır (preload değil) ve sözler LS19_EARLY'de; efemeris dizini preload`, bad.length === 0, bad.slice(0, 2).join(' | '));
  check('texload: erken sözü kullanır (tek istek), yoksa ya da boş dönerse base + "textures/" + dosya adıyla indirir, başarısızsa bir kez yeniden dener', /LS19_EARLY/.test(rd('../js/texload.js')) && /delete early\[f\]/.test(rd('../js/texload.js')) && /fetch\(base \+ 'textures\/' \+ f, priority \? \{ priority \} : undefined\)/.test(rd('../js/texload.js')) && /net\(f, n - 1\)/.test(rd('../js/texload.js')) && /world\.load\('\.\/'/.test(rd('../js/app.js')));
}

// ---------------------------------------------------------------- 7) tam çözünürlüğe yükseltme (masaüstü)
{
  const sc = sceneSrc(), up = sc.slice(sc.indexOf('  async upgradeTextures('), sc.indexOf("    this.texUp[group] = 'tamam';"));
  const keys = [...UPGRADE.earth, ...UPGRADE.moon];
  check('yükseltme grupları: Dünya (gündüz, gece, bulut, yıldız) ve Ay (renk, normal, yükseklik); hepsinin küçük dosyası var, küçük dosyası olan her doku bir grupta',
    keys.every((k) => TEX.find((s) => s.key === k && s.flo)) && TEX.filter((s) => s.flo).every((s) => keys.includes(s.key)), keys.join(','));
  check('yükseltme: yalnız düşük bellekli olmayan ve veri tasarrufu kapalı cihazda; Dünya ilk görüntüden sonra, Ay kamera ~40 Ay yarıçapına yaklaşınca; tek sefer',
    /if \(!lowmem && !saveData\) \{ this\.texUp = \{\}; setTimeout\(\(\) => this\.upgradeTextures\('earth'\)/.test(sc) && /this\.texUp && !this\.texUp\.moon && this\.moon\.position\.length\(\) < 40 \* E\.R_M\) this\.upgradeTextures\('moon'\)/.test(sc) && /if \(!this\.texUp \|\| this\.texUp\[group\]\) return;/.test(up));
  check('yükseltme: tam dosyalar düşük öncelikle, tek tek, GPU yüklemesi tarayıcı boştayken; yükseklikte boyut da güncellenir; eski doku atılır, inmeyen küçük kalır',
    /lowmem: false, conc: 1, priority: 'low', idle: true/.test(up) && /requestIdleCallback\(\(\) => res\(\), \{ timeout: 2000 \}\)/.test(rd('../js/texload.js')) && /day: \[this\.earthU, 'dayMap'\][^\n]*mh: \[this\.moonU, 'heightMap'\]/.test(up) && /this\.moonU\.hSize\.value\.set\(\.\.\.t\.userData\.size\)/.test(up) &&
    /old\.dispose\(\)/.test(up) && /if \(!t\) continue;/.test(up) && /swap\(old, t\);/.test(up));
  check('yükseltme: eski doku sahnedeki her malzemede (özellikler ve uniform\'lar) yenisiyle değişir, sonra atılır (iniş arazisi Ay renk dokusunu map olarak kullanır)',
    /this\.scene\.traverse\(/.test(up) && /if \(m\[k\] === old\) \{ m\[k\] = t; m\.needsUpdate = true; \}/.test(up) && /if \(u && u\.value === old\) u\.value = t;/.test(up) && up.indexOf('swap(old, t)') < up.indexOf('old.dispose()') && /map: A\.mcol/.test(sc));
  const surf = rd('../js/surfaceview.js');
  check('yüzey parçaları Dünya/Ay uniform nesnelerini paylaşır ({ ...eu }, { ...mu }): yükseltilen doku parçalarda da görünür', /uniforms: \{ \.\.\.eu,/.test(surf) && /uniforms: \{ \.\.\.mu,/.test(surf));
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
