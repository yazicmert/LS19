// Ana dokuların KTX2 sürümleri (web/textures/*.ktx2, *_lo.ktx2): Basis Universal, ekran kartında sıkıştırılmış kalır (RGBA8'e göre 4–8 kat az
// bellek; GPU'ya yükleme kısa, mip üretimi yok). Plan web/js/texplan.js'teki "ktx" alanı; kodlama ayarları aşağıdaki PLAN.
//   node tools/doku_ktx2.mjs [ad süzgeci] [--lo] [--dene] [--kip etc1s|uastc] [--kalite N] [--efor N] [--is N]
//     --lo yalnız _lo dosyaları · --dene ölç ama web/textures'a yazma · --kip/--kalite/--efor PLAN'ı geçersiz kılar (deneme için) · --is eşzamanlı kodlama
// Gerekenler: Node ≥ 20, Python 3 + Pillow (kaynak çözme, _lo küçültme ve karşılaştırma; tools/doku_webp.py ile aynı).
// Kodlayıcı: Basis Universal'ın resmî, hazır derlenmiş komut satırı aracı (bin/basisu_st.wasm, WASI; Apache-2.0, Binomial LLC). Sabit bir
// sürümden indirilir, SHA-256 ile denetlenir, tools/basis/ altına konur (depoya girmez). Node'un WASI korumalı alanında çalışır: yalnız kaynak
// doku klasörünü ve geçici çıktı klasörünü görür. (Tarayıcı/JS kodlayıcı API'si 12 milyon pikselden büyük görüntüyü reddeder: 8192×4096 için gerekir.)
// Kurallar:
//   - renk dokuları (gündüz, gece, Ay rengi, yıldızlar): ETC1S, sRGB
//   - Dünya normal haritası: ETC1S, -normal_map (doğrusal ölçüt, RDO kapalı), mip'lerde yeniden birim uzunluk
//   - eşikler (PLAN son sütun) ölçülenin ~1,5 dB altında: kodlayıcı ya da kaynak değişip kalite düşerse araç dosyayı yazmaz
//   - tam mip zinciri dosyada; -y_flip: ilk satır görüntünün altı (WebGL'in v=0'ı; sıkıştırılmış dokuda flipY yoktur)
//   - _lo: texplan.js "lo" boyutuna Lanczos ile küçültülmüş kaynak (doku_webp.py ile aynı). Ay yükseklik haritası WebP kalır (16 bit paketli veri, kayıpsız gerekir)
// Ölçüm: her dosya sitenin kullandığı çözücüyle (three r170 basis_transcoder, web/lib/addons/libs/basis) açılır; düzey 0, ETC1S/UASTC'nin kendisi
// (RGBA32) ve BC1 olarak (ETC1S; BC7'siz masaüstü) çözülüp kaynakla karşılaştırılır (PSNR, dB). Başlık (boyut, mip sayısı, sRGB bayrağı, kip) denetlenir.
// Eşiğin altındaki ya da başlığı tutmayan dosya web/textures'a yazılmaz, çıkış kodu 1 olur.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASISU = {
  url: 'https://raw.githubusercontent.com/BinomialLLC/basis_universal/073eb6a0a34a23d77e75e54f41dcd9653a52da83/bin/basisu_st.wasm',
  sha256: '3d659f443504fb64dcb28b80f8fd8e4af8e911c96e364f994d9161e2c9716dbf',
};
// key -> [kip, kalite (1–100), efor (0–10), en düşük PSNR dB (ETC1S/UASTC çözülmüş, düzey 0)]
// Tek kanallı haritalar (bulut, özyansıma) burada yok: WebP R8 kalırlar (texplan.js; bulut ETC1S'te 28,8 dB, masaüstünde bellek kazancı yok).
// Dünya normal haritası ETC1S (-normal_map: doğrusal, RDO yok; mip'ler birim uzunluğa; yumuşak harita, 42,7 dB). Ay normal haritası burada yok:
// ETC1S'te 31,5/34,5 dB ve yakın planda krater gölgeleri bloklaşıyor; UASTC 3,5 kat büyük dosyada 37 dB verdi. WebP kalır (texplan.js).
const PLAN = {
  day: ['etc1s', 100, 6, 33], night: ['etc1s', 100, 6, 36], mcol: ['etc1s', 100, 6, 35], stars: ['etc1s', 100, 4, 44],            // yıldızlar: efor 6'da 8192'lik harita 4 GB WASM belleğini aşıyor
  enorm: ['etc1s', 85, 4, 41],
};

// Node 22'nin WASI'sinde hızlı API çağrısı (path_open vb.) içinde çöp toplama tetiklenince V8 yığını gezemez ve süreç çöker (SIGSEGV,
// InnerPointerToCodeCache). V8 bayrağı süreç genelinde olduğundan araç kendini bayrakla yeniden başlatır (iş parçacıkları da bayrağı alır).
const FLAG = '--no-turbo-fast-api-calls';
if (isMainThread && !process.execArgv.includes(FLAG)) {
  const { spawnSync } = await import('node:child_process');
  process.exit(spawnSync(process.execPath, [...process.execArgv, FLAG, new URL(import.meta.url).pathname, ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1);
} else if (isMainThread) await main();
else await encodeWorker();

// ---- WASI'de basisu (iş parçacığı başına bir örnek; tek iş parçacıklı derleme)
async function encodeWorker() {
  process.removeAllListeners('warning');                                  // "WASI deneysel" uyarısı her iş parçacığında basılmasın
  const { WASI } = await import('node:wasi');
  const { module, args, preopens, log } = workerData;
  const fd = fs.openSync(log, 'w');
  const wasi = new WASI({ version: 'preview1', args: ['basisu', ...args], env: {}, preopens, stdout: fd, stderr: fd, returnOnExit: true });
  let code;
  try { code = wasi.start(await WebAssembly.instantiate(module, wasi.getImportObject())); } catch (e) { fs.writeSync(fd, `\n${e && e.stack || e}\n`); code = 99; }
  fs.closeSync(fd);
  parentPort.postMessage(code);
}

async function main() {
  const { TEX, ktxName } = await import('../web/js/texplan.js');
  const { parseKtx2, fullMipLevels, MODEL } = await import('./ktx2.mjs');
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const TEXDIR = path.join(ROOT, 'web', 'textures'), LIB = path.join(ROOT, 'web', 'lib', 'addons', 'libs', 'basis');
  const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; }, flag = (k) => { const i = argv.indexOf(k); return i >= 0 && argv.splice(i, 1).length > 0; };
  const mOver = opt('--kip'), qOver = opt('--kalite'), eOver = opt('--efor'), jobsOpt = opt('--is'), onlyLo = flag('--lo'), dry = flag('--dene'), only = argv[0] || '';

  for (const s of TEX) if (s.ktx && !PLAN[s.key]) throw new Error(`PLAN'da ${s.key} yok`);
  const work = [];
  for (const s of TEX.filter((t) => t.ktx)) {
    const [m0, q, e, min] = PLAN[s.key], mode = mOver || m0, src = s.fb;
    const vs = [];
    if (!onlyLo) vs.push({ out: ktxName(s), lo: null });
    if (s.flo && s.lo) vs.push({ out: ktxName(s, true), lo: s.lo });
    for (const v of vs) if (v.out.includes(only)) work.push({ s, src, mode, q: Number(qOver ?? q), e: Number(eOver ?? e), min, ...v });
  }
  if (!work.length) { console.log('süzgece uyan doku yok'); return; }

  const wasmPath = await encoder(path.join(ROOT, 'tools', 'basis', 'basisu_st.wasm'));
  const module = await WebAssembly.compile(fs.readFileSync(wasmPath));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-ktx2-'));
  const PY_LO = 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]); im.load()\nim.convert("RGB").resize((int(sys.argv[2]), int(sys.argv[3])), Image.LANCZOS).save(sys.argv[4], "PNG", compress_level=1)';
  const PY_RAW = 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]); im.load()\nsys.stdout.buffer.write(im.convert("RGB").tobytes())';
  const py = (code, ...a) => execFileSync('python3', ['-I', '-c', code, ...a], { maxBuffer: 1 << 30 });

  // çözücü: sitenin kullandığı three r170 basis_transcoder (Emscripten, CommonJS sarmalı: depo "type": "module" olduğundan .cjs kopyasından yüklenir)
  fs.copyFileSync(path.join(LIB, 'basis_transcoder.js'), path.join(tmp, 'basis_transcoder.cjs'));
  const BASIS = createRequire(import.meta.url)(path.join(tmp, 'basis_transcoder.cjs'));
  const T = await BASIS({ wasmBinary: fs.readFileSync(path.join(LIB, 'basis_transcoder.wasm')) });
  T.initializeBasis();

  const jobs = Math.max(1, Number(jobsOpt) || Math.min(os.availableParallelism ? os.availableParallelism() : os.cpus().length, Math.floor(os.totalmem() / 3.5e9)));
  console.log(`${work.length} dosya, ${jobs} eşzamanlı kodlama (basisu WASI, tek iş parçacığı)`);
  let failed = 0, next = 0, measure = Promise.resolve();
  const rows = [];
  const runOne = async (w) => {
    const t0 = Date.now();
    let inPath = '/src/' + w.src;
    if (w.lo) { py(PY_LO, path.join(TEXDIR, w.src), String(w.lo[0]), String(w.lo[1]), path.join(tmp, w.out + '.png')); inPath = '/tmp/' + w.out + '.png'; }
    const log = path.join(tmp, w.out + '.log');
    const encode = (effort) => new Promise((res, rej) => {
      const args = ['-ktx2', '-mipmap', '-y_flip', '-no_alpha', ...(w.mode === 'uastc' ? ['-uastc'] : ['-etc1s']), ...(w.s.srgb ? ['-srgb'] : ['-linear']), ...(/norm/.test(w.s.key) ? ['-normal_map', '-mip_renorm'] : []),
        '-quality', String(w.q), '-effort', String(effort), '-file', inPath, '-output_file', '/tmp/' + w.out];
      const wk = new Worker(new URL(import.meta.url), { workerData: { module, args, preopens: { '/src': TEXDIR, '/tmp': tmp }, log } });
      wk.once('message', res); wk.once('error', rej); wk.once('exit', (c) => { if (c) rej(new Error('iş parçacığı çıkış ' + c)); });
    });
    let code = await encode(w.e);
    // 32 bit WASM'ın 4 GB sınırı: ayrıntılı 8192×4096 haritada (yıldızlar) yüksek efor belleği aşabilir; bir kez 2 düşük eforla denenir
    if (code !== 0 && /Allocation failed|resize failed/.test(fs.readFileSync(log, 'utf8')) && w.e > 2) {
      console.log(`${w.out}: WASM belleği yetmedi (efor ${w.e}), efor ${w.e - 2} ile yeniden`);
      w.e -= 2; code = await encode(w.e);
    }
    const sec = (Date.now() - t0) / 1000;
    if (code !== 0 || !fs.existsSync(path.join(tmp, w.out))) {
      failed++; console.log(`HATA ${w.out}: basisu çıkış ${code}\n` + fs.readFileSync(log, 'utf8').split('\n').slice(-15).join('\n')); return;
    }
    measure = measure.then(() => check(w, sec));                       // ölçüm sıralı: kaynak + çözülmüş görüntü (8192×4096: ~230 MB) aynı anda bir kez
    await measure;
  };
  const check = (w, sec) => {
    const file = path.join(tmp, w.out), buf = new Uint8Array(fs.readFileSync(file)), errs = [];
    const h = parseKtx2(buf);
    const ref = w.lo ? [w.lo[0], w.lo[1]] : null;
    const raw = py(PY_RAW, w.lo ? path.join(tmp, w.out + '.png') : path.join(TEXDIR, w.src));
    const W = h.width, H = h.height;
    if (ref && (W !== ref[0] || H !== ref[1])) errs.push(`boyut ${W}×${H}, beklenen ${ref.join('×')}`);
    if (raw.length !== W * H * 3) errs.push('kaynak boyutu tutmuyor');
    if (h.levels !== fullMipLevels(W, H)) errs.push(`mip ${h.levels}, beklenen ${fullMipLevels(W, H)}`);
    if (h.vkFormat !== 0) errs.push('vkFormat 0 (Basis) değil');
    if (h.model !== (w.mode === 'uastc' ? MODEL.UASTC : MODEL.ETC1S)) errs.push('renk modeli ' + h.model);
    if (h.srgb !== !!w.s.srgb) errs.push('sRGB bayrağı ' + h.srgb);
    const gray = !!w.s.red, f = new T.KTX2File(buf);
    let p0 = 0, p1 = null;
    try {
      if (!f.isValid() || !f.startTranscoding()) throw new Error('three r170 çözücüsü dosyayı açamadı');
      const tr = (fmt) => { const d = new Uint8Array(f.getImageTranscodedSizeInBytes(0, 0, 0, fmt)); if (!f.transcodeImage(d, 0, 0, 0, fmt, 0, -1, -1)) throw new Error('çözme başarısız (biçim ' + fmt + ')'); return d; };
      if (!errs.length) {
        p0 = psnr(raw, tr(13), 4, W, H, gray);                            // RGBA32: ETC1S/UASTC'nin kendisi
        if (w.mode === 'etc1s') p1 = psnr(raw, bc1Decode(tr(2), W, H), 4, W, H, gray);       // BC1 (BC7 desteklemeyen masaüstü)
      }
    } catch (e) { errs.push(e.message); } finally { f.close(); f.delete(); }
    if (!errs.length && p0 < w.min) errs.push(`PSNR ${p0.toFixed(1)} < ${w.min}`);
    const webp = fs.statSync(path.join(TEXDIR, w.lo ? w.s.flo : w.s.f)).size;
    const mip = 4 / 3, px = W * H, now = px * (gray ? 1 : 4) * mip, k8 = px * mip, k4 = px * 0.5 * mip;     // bayt: RGBA8/R8, 8 bpp (BC7/ASTC/ETC2+EAC), 4 bpp (BC1/ETC1)
    rows.push({ now, k8, k4: w.mode === 'uastc' ? k8 : k4 });
    const mb = (b) => (b / 1048576).toFixed(1);
    const line = `${w.out}: ${W}×${H} ${w.mode} q${w.q} e${w.e}, ${mb(buf.length)} MB (WebP ${mb(webp)} MB), PSNR ${p0.toFixed(1)} dB` +
      (p1 !== null ? ` · BC1 ${p1.toFixed(1)} dB` : '') + `, ekran kartı ${mb(now)} → ${mb(k8)} MB (8 bpp)` + (w.mode === 'etc1s' ? ` / ${mb(k4)} MB (4 bpp)` : '') + `, ${sec.toFixed(0)} sn`;
    if (errs.length) { failed++; console.log(`HATA ${line}: ${errs.join('; ')}`); return; }
    console.log(line);
    if (!dry) fs.copyFileSync(file, path.join(TEXDIR, w.out));
  };
  await Promise.all(Array.from({ length: Math.min(jobs, work.length) }, async () => { while (next < work.length) await runOne(work[next++]); }));
  await measure;
  const sum = (k) => (rows.reduce((a, r) => a + r[k], 0) / 1048576).toFixed(0);
  console.log(`ekran kartı (yazılan ${rows.length} dosya): ${sum('now')} MB → ${sum('k8')} MB (8 bpp) / ${sum('k4')} MB (ETC1S 4 bpp)` + (dry ? ' — deneme: web/textures değişmedi' : ''));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed) { console.log(`${failed} dosya başarısız`); process.exit(1); }
}

// kodlayıcı: önbellekte yoksa sabit sürümden indir; her çalıştırmada SHA-256 denetlenir
async function encoder(file) {
  if (!fs.existsSync(file)) {
    console.log('basisu_st.wasm indiriliyor: ' + BASISU.url);
    const r = await fetch(BASISU.url);
    if (!r.ok) throw new Error('indirilemedi: HTTP ' + r.status);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.part', Buffer.from(await r.arrayBuffer())); fs.renameSync(file + '.part', file);
  }
  const got = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (got !== BASISU.sha256) throw new Error(`${file}: SHA-256 tutmuyor (${got}); dosyayı silip yeniden indirin`);
  return file;
}

// PSNR (dB): ref RGB yukarıdan aşağı; d çözülmüş (ch kanal), y_flip ile ilk satırı görüntünün altı. gray: yalnız R (gölgelendirici .r okur)
function psnr(ref, d, ch, W, H, gray) {
  let se = 0;
  for (let y = 0; y < H; y++) {
    const ro = y * W * 3, dO = (H - 1 - y) * W * ch;
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < (gray ? 1 : 3); c++) { const e = ref[ro + x * 3 + c] - d[dO + x * ch + c]; se += e * e; }
    }
  }
  const mse = se / (W * H * (gray ? 1 : 3));
  return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
}
// BC1 (DXT1) blok çözücü -> RGBA (yalnız ölçüm için; donanımın yuvarlaması bir birim farklı olabilir)
function bc1Decode(b, W, H) {
  const out = new Uint8Array(W * H * 4), bw = Math.ceil(W / 4), c565 = (v) => [((v >> 11) & 31) * 255 / 31 + 0.5 | 0, ((v >> 5) & 63) * 255 / 63 + 0.5 | 0, (v & 31) * 255 / 31 + 0.5 | 0];
  for (let by = 0; by < Math.ceil(H / 4); by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * 8, v0 = b[o] | (b[o + 1] << 8), v1 = b[o + 2] | (b[o + 3] << 8), bits = (b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24)) >>> 0;
      const a = c565(v0), c = c565(v1), pal = v0 > v1
        ? [a, c, a.map((x, i) => (2 * x + c[i]) / 3 + 0.5 | 0), a.map((x, i) => (x + 2 * c[i]) / 3 + 0.5 | 0)]
        : [a, c, a.map((x, i) => (x + c[i]) / 2 + 0.5 | 0), [0, 0, 0]];
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
        if (x >= W || y >= H) continue;
        const p = pal[(bits >>> (2 * i)) & 3], q = (y * W + x) * 4;
        out[q] = p[0]; out[q + 1] = p[1]; out[q + 2] = p[2]; out[q + 3] = 255;
      }
    }
  }
  return out;
}
