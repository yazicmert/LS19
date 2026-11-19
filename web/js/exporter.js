// Fragmanı video olarak dışa aktarma (4K / 1440p / 1080p, 24/30/60 kare/s, MP4): kare kare, gerçek saatten bağımsız.
//   · Sayfanın zaman kaynakları sanal saate bağlanır (vclock.js); fizik işçisi elle ilerler (worker.js 'clock' / 'step'): her kare için önce fizik tam
//     1/fps × zaman hızı kadar ilerler, sonra yönetmenin zamanlayıcıları ve çizim döngüsü o karenin zamanında çalışır. Bilgisayar yavaşsa dışa aktarım uzar,
//     video değişmez; kare atlanmaz, kalite kendiliğinden düşmez.
//   · Çizim tam çıktı boyunda yapılır: yerleşim 1920 × 1080 CSS pikseli, piksel oranı çıktı/1920 (4K'da 2); sahne ekranda küçültülmüş görünür.
//   · Yazı katmanı (kartlar, şerit, alt yazılar) DOM'dur: her kare hesaplanmış stilleriyle SVG foreignObject'e dökülür ve WebGL karesinin üstüne çizilir;
//     CSS geçişleri sanal saate göre konumlanır (Web Animations: duraklat + currentTime). Yazı tipleri veri adresi olarak gömülür.
//   · Kodlama tarayıcının WebCodecs'iyle (H.264, yoksa VP9 ya da AV1; ses AAC, yoksa Opus), MP4 yazımı mp4-muxer ile (lib/, MIT).
//     Dosya, tarayıcı izin verirse doğrudan diske yazılır (File System Access); yoksa parça parça bellekte toplanıp indirilir.
//   · Ses: fragman sırasında ses olayları kaydedilir (cineaudio.js AudioRecorder), video bitince OfflineAudioContext'te aynı zaman çizelgesiyle üretilir.
//     Konuşma sentezi (geri sayım, anonslar, anlatıcı) kaydedilemez: videoda yalnız yazı olarak bulunur.
// Saf yardımcılar (çözünürlükler, H.264 düzeyi, bit hızı, dosya boyu, dosya adı, bellek hedefi yamaları) test/test_exporter.js'te sınanır.
import { VirtualClock } from './vclock.js';
import { AudioRecorder, renderAudio } from './cineaudio.js';
import { FONTS, ACCENTS, loadFonts, normalize } from './producer.js';

// gerçek zamanlayıcılar (sanal saat kurulmadan önce alınır)
const RT = typeof window !== 'undefined' ? { st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window) } : { st: setTimeout, ct: clearTimeout };
const realWait = (ms) => new Promise((r) => RT.st(r, ms));

export const CSS_W = 1920, CSS_H = 1080;                                           // yazı katmanının yerleşim boyu (CSS px)
export const RES = {
  2160: { w: 3840, h: 2160, name: '4K', mbps: 45, level: 'ultra' },
  1440: { w: 2560, h: 1440, name: '1440p', mbps: 24, level: 'high' },
  1080: { w: 1920, h: 1080, name: '1080p', mbps: 12, level: 'high' },
};
export const FPS = [24, 30, 60];
export const QUALITY = { std: 0.7, high: 1, max: 1.5 };
export const AUDIO_BPS = 192000;

// H.264 (AVC High) düzeyi: makroblok/kare ve makroblok/s sınırlarından (ITU-T H.264 Tablo A-1)
const AVC_LEVELS = [['28', 245760, 8192], ['29', 245760, 8192], ['2a', 522240, 8704], ['32', 589824, 22080], ['33', 983040, 36864], ['34', 2073600, 36864], ['3c', 4177920, 139264]];
export function avcCodec(w, h, fps) {
  const fs = Math.ceil(w / 16) * Math.ceil(h / 16), rate = fs * fps;
  const L = AVC_LEVELS.find(([, r, f]) => rate <= r && fs <= f) || AVC_LEVELS[AVC_LEVELS.length - 1];
  return 'avc1.6400' + L[0];
}
// video bit hızı (bit/s): çözünürlüğün temel değeri × kalite × kare hızı etkisi (60 kare/s ≈ 1,6×, 24 ≈ 0,85×)
export function videoBitrate(res, fps, quality = 'high') {
  const R = RES[res] || RES[2160], k = QUALITY[quality] ?? 1, f = fps >= 50 ? 1.6 : fps <= 25 ? 0.85 : 1;
  return Math.round(R.mbps * 1e6 * k * f);
}
// tahmini dosya boyu (bayt): süre × (video + ses) / 8, kap ek yükü %1
export const estimateBytes = (sec, vbps, abps = 0) => Math.round(sec * (vbps + abps) / 8 * 1.01);
// dosya adı: LS19-<fragman adı>-<çözünürlük>-<fps>fps.mp4 (Türkçe harfler sadeleşir, güvenli karakterler)
export function fileName(cut, res, fps) {
  const c = normalize(cut), tr = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
  const base = (c.title || 'fragman').replace(/[çğıöşüÇĞİÖŞÜ]/g, (x) => tr[x]).normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'fragman';
  return `LS19-${base}-${(RES[res] || RES[2160]).name}-${fps}fps.mp4`;
}

// kodlayıcı seçimi: H.264 (donanım tercihli) → VP9 → AV1; VE: VideoEncoder (testte sahte)
export async function pickVideoConfig(w, h, fps, bitrate, VE = globalThis.VideoEncoder) {
  if (!VE || !VE.isConfigSupported) return null;
  const cands = [{ codec: avcCodec(w, h, fps), mux: 'avc', extra: { avc: { format: 'avc' } }, name: 'H.264' }, { codec: 'vp09.00.51.08', mux: 'vp9', name: 'VP9' }, { codec: 'av01.0.12M.08', mux: 'av1', name: 'AV1' }];
  for (const c of cands) for (const hw of ['prefer-hardware', 'no-preference']) {
    const config = { codec: c.codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, latencyMode: 'quality', bitrateMode: 'variable', ...(c.extra || {}) };
    try { const r = await VE.isConfigSupported(config); if (r && r.supported) return { config: r.config || config, mux: c.mux, name: c.name, hw: hw === 'prefer-hardware' }; } catch (e) { /* bu kodlayıcı yok */ }
  }
  return null;
}
export async function pickAudioConfig(AE = globalThis.AudioEncoder) {
  if (!AE || !AE.isConfigSupported) return null;
  for (const c of [{ codec: 'mp4a.40.2', mux: 'aac', name: 'AAC' }, { codec: 'opus', mux: 'opus', name: 'Opus' }]) {
    const config = { codec: c.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: AUDIO_BPS };
    try { const r = await AE.isConfigSupported(config); if (r && r.supported) return { config, mux: c.mux, name: c.name }; } catch (e) { /* yok */ }
  }
  return null;
}

// bellek hedefi (dosya sistemine yazılamıyorsa): sıralı veri eklenir (her ~64 MB bir Blob parçası: tarayıcı büyük Blob'ları diske taşıyabilir);
// geri dönük yazımlar (MP4 başlığındaki mdat boyu) sonradan ilgili parçaya yama olarak uygulanır
export class BlobSink {
  constructor(part = 64 * 1024 * 1024) { this.segs = []; this.pending = []; this.pendingBytes = 0; this.size = 0; this.patches = []; this.part = part; }
  write(data, pos) {
    if (pos === this.size) { const c = data.slice(); this.pending.push(c); this.pendingBytes += c.byteLength; this.size += c.byteLength; if (this.pendingBytes >= this.part) this.seal(); }
    else this.patches.push({ pos, data: data.slice() });
  }
  seal() { if (!this.pending.length) return; const start = this.size - this.pendingBytes; this.segs.push({ start, len: this.pendingBytes, parts: this.pending }); this.pending = []; this.pendingBytes = 0; }
  // parçalar + yamalar → Blob listesi (yama bir parçanın içine düşer: o parça yeniden kurulur)
  build(type = 'video/mp4', B = globalThis.Blob) {
    this.seal();
    const segs = this.segs.map((s) => ({ ...s }));
    for (const p of this.patches) {
      let rem = p.data, at = p.pos;
      for (const s of segs) {
        if (!rem.byteLength) break;
        if (at >= s.start + s.len || at < s.start) continue;
        const flat = new Uint8Array(s.len); let o = 0; for (const q of s.parts) { if (q instanceof Uint8Array) flat.set(q, o); o += q.byteLength; }
        const n = Math.min(rem.byteLength, s.start + s.len - at); flat.set(rem.subarray(0, n), at - s.start); s.parts = [flat]; rem = rem.subarray(n); at += n;
      }
      if (rem.byteLength) throw new Error('MP4 yaması dosyanın dışında');
    }
    return new B(segs.flatMap((s) => s.parts), { type });
  }
}

// yazı tiplerini veri adresi olarak göm (foreignObject içindeki metin dış yazı tipi yükleyemez); yalnız latin ve latin-ext alt kümeleri
export async function embedFonts(families, fetchFn = globalThis.fetch) {
  if (!families.length || !fetchFn) return '';
  try {
    const css = await (await fetchFn('https://fonts.googleapis.com/css2?' + families.map((f) => 'family=' + f).join('&') + '&display=swap')).text();
    const blocks = css.split(/(?=\/\* )/).filter((b) => /^\/\* (latin|latin-ext) \*\//.test(b));
    const urls = [...new Set(blocks.join('').match(/url\((https:[^)]+)\)/g) || [])].map((u) => u.slice(4, -1));
    const data = {};
    await Promise.all(urls.map(async (u) => {
      const b = new Uint8Array(await (await fetchFn(u)).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      data[u] = 'data:font/woff2;base64,' + btoa(s);
    }));
    return blocks.join('').replace(/url\((https:[^)]+)\)/g, (m, u) => (data[u] ? `url(${data[u]})` : m));
  } catch (e) { return ''; }                                                       // çevrimdışı: yerel yedek yazı tipleri
}

// yazı katmanını (sinematik DOM) kareye dök: hesaplanmış stiller satır içi, sözde öğeler kural olarak, SVG içindeki değişkenler çözülmüş
const SKIP = ['.cine-exit', '.cine-mute', '.cine-edit', '.cine-hint', '.cine-pv'];
export class OverlayCapture {
  constructor(root, outW, outH, fontCss) { this.root = root; this.outW = outW; this.outH = outH; this.fontCss = fontCss; this.last = ''; this.img = null; this.anims = new Map(); }
  // CSS geçişleri ve animasyonları sanal saate göre (ms)
  sync(now) {
    if (!document.getAnimations) return;
    const live = new Set();
    for (const a of document.getAnimations()) {
      const t = a.effect && a.effect.target; if (!t || !this.root.contains(t)) continue;
      live.add(a);
      if (!this.anims.has(a)) { this.anims.set(a, now - (a.currentTime || 0)); a.pause(); }
      try { a.currentTime = Math.max(0, now - this.anims.get(a)); } catch (e) { /* bitmiş */ }
    }
    for (const a of this.anims.keys()) if (!live.has(a)) this.anims.delete(a);
  }
  serialize() {
    const root = this.root, clone = root.cloneNode(true), acc = getComputedStyle(root).getPropertyValue('--cine-accent').trim() || ACCENTS.amber;
    const walk = (o, c, out) => { out.push([o, c]); for (let i = 0; i < o.children.length; i++) walk(o.children[i], c.children[i], out); return out; };
    const pairs = walk(root, clone, []), drop = []; let css = '', n = 0;
    const text = (cs) => { let t = ''; for (let i = 0; i < cs.length; i++) { const p = cs[i]; t += `${p}:${cs.getPropertyValue(p)};`; } return t; };
    const svgIn = new Set();
    for (const [o, c] of pairs) {
      if (svgIn.has(o.parentElement) || (o.namespaceURI === 'http://www.w3.org/2000/svg' && o.tagName.toLowerCase() !== 'svg')) {
        svgIn.add(o);
        for (const at of [...c.attributes]) if (at.value.includes('var(')) c.setAttribute(at.name, at.value.replace(/var\(--cine-accent\)/g, acc).replace(/var\([^)]*\)/g, 'currentColor'));
        continue;
      }
      if (o !== root && SKIP.some((s) => o.matches(s))) { drop.push(c); continue; }
      const cs = getComputedStyle(o);
      if (cs.display === 'none') { drop.push(c); continue; }
      c.setAttribute('style', text(cs)); c.removeAttribute('class');
      if (o.tagName.toLowerCase() === 'svg') svgIn.add(o);
      for (const pe of ['::before', '::after']) {
        const ps = getComputedStyle(o, pe), ct = ps.getPropertyValue('content');
        if (ct && ct !== 'none' && ct !== 'normal') { const k = 'xp' + (++n); c.classList.add(k); css += `.${k}${pe}{${text(ps)}}`; }
      }
    }
    for (const c of drop) c.remove();
    clone.style.left = '0px'; clone.style.top = '0px'; clone.style.right = 'auto'; clone.style.bottom = 'auto'; clone.style.width = CSS_W + 'px'; clone.style.height = CSS_H + 'px'; clone.style.transform = 'none';
    return { html: new XMLSerializer().serializeToString(clone), css };
  }
  async image() {
    if (!this.root.classList.contains('live')) return null;
    const { html, css } = this.serialize();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.outW}" height="${this.outH}" viewBox="0 0 ${CSS_W} ${CSS_H}"><foreignObject x="0" y="0" width="${CSS_W}" height="${CSS_H}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${CSS_W}px;height:${CSS_H}px;overflow:hidden"><style>${this.fontCss}${css}</style>${html}</div></foreignObject></svg>`;
    if (svg === this.last && this.img) return this.img;                           // değişmeyen katman: önceki resim
    const img = new Image(); img.decoding = 'sync'; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    try { await img.decode(); } catch (e) { return this.img; }
    this.last = svg; this.img = img; return img;
  }
}
// tarayıcı foreignObject resmini tuvale çizince tuval "kirlenir" mi (Safari): kirlenirse yazı katmanı dışa aktarılamaz
export async function overlaySupported() {
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><foreignObject width="4" height="4"><div xmlns="http://www.w3.org/1999/xhtml" style="width:4px;height:4px;background:#f00"></div></foreignObject></svg>';
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(1, 1, 1, 1).data[0] > 200;
  } catch (e) { return false; }
}

export class ExportError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

// sürücü. host: { world, cinema, appEl, resize(), send(msg), step(dt, n) → Promise<durum> }
export class Exporter {
  constructor(host) { this.h = host; this.busy = false; this.cancelled = false; }
  cancel() { this.cancelled = true; }
  // olanaklar: kodlayıcı, ses, GPU boyu, yazı katmanı (masa seçenekleri gösterirken çağırır)
  async probe(res, fps, quality, audio) {
    const R = RES[res], gl = this.h.world.renderer.getContext();
    const maxPx = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, (gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096])[0], gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096);
    const v = await pickVideoConfig(R.w, R.h, fps, videoBitrate(res, fps, quality)), a = audio ? await pickAudioConfig() : null;
    return { video: v, audio: a, gpuOk: R.w <= maxPx, maxPx, overlay: await overlaySupported(), webcodecs: typeof VideoEncoder === 'function', disk: typeof window.showSaveFilePicker === 'function' };
  }

  // o: { cut, res, fps, quality, audio, handle (FileSystemFileHandle | null), maxSec, onProgress(p) } → { blob | null, bytes, frames, seconds, codec }
  async run(o) {
    if (this.busy) throw new ExportError('busy'); this.busy = true; this.cancelled = false;
    // o.size: [w, h] (yalnız deneme: küçük çıktı, 16:9)
    const H = this.h, W = H.world, cut = normalize(o.cut), R = o.size ? { w: o.size[0], h: o.size[1], name: 'deneme', level: 'high' } : RES[o.res] || RES[2160], fps = o.fps || 30, pr = R.w / CSS_W;
    const vbps = o.size ? 4e6 : videoBitrate(o.res, fps, o.quality), prog = o.onProgress || (() => {});
    let clock = null, restore = null, venc = null, fail = null, sink = null, writable = null, overlay = null;
    try {
      prog({ phase: 'prepare' });
      const vcfg = await pickVideoConfig(R.w, R.h, fps, vbps); if (!vcfg) throw new ExportError('codec');
      const acfg = o.audio ? await pickAudioConfig() : null;
      const gl = W.renderer.getContext(), maxPx = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, (gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096])[0]);
      if (R.w > maxPx) throw new ExportError('gpu');
      const ovOk = await overlaySupported();
      await loadFonts([cut.hFont, cut.tFont]);
      const fams = ['Exo:wght@400;500;600;700', 'Roboto+Mono:wght@400;500', ...new Set([FONTS[cut.hFont].g, FONTS[cut.tFont].g].filter(Boolean))];
      const fontCss = ovOk ? await embedFonts(fams) : '';
      const MM = await import('../lib/mp4-muxer.esm.js');
      let target;
      if (o.handle) { writable = await o.handle.createWritable(); target = new MM.FileSystemWritableFileStreamTarget(writable, { chunkSize: 16 * 1024 * 1024 }); }
      else { sink = new BlobSink(); target = new MM.StreamTarget({ onData: (d, pos) => sink.write(d, pos), chunked: true, chunkSize: 16 * 1024 * 1024 }); }
      const muxer = new MM.Muxer({ target, video: { codec: vcfg.mux, width: R.w, height: R.h, frameRate: fps }, audio: acfg ? { codec: acfg.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined, fastStart: false, firstTimestampBehavior: 'offset' });
      venc = new VideoEncoder({ output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (e) { fail = e; } }, error: (e) => { fail = e; } });
      venc.configure(vcfg.config);

      // sahne: yerleşim 1920 × 1080 CSS px, ekranda sığacak kadar küçültülmüş; çizim tam çıktı boyunda
      if (H.cinema.on) H.cinema.stop();
      const app = H.appEl, prevStyle = app.getAttribute('style');
      const k = Math.min(innerWidth / CSS_W, innerHeight / CSS_H);
      document.body.classList.add('exporting');
      app.style.cssText = (prevStyle || '') + `;position:fixed;left:0;top:0;right:auto;bottom:auto;width:${CSS_W}px;height:${CSS_H}px;transform-origin:0 0;transform:translate(${Math.round((innerWidth - CSS_W * k) / 2)}px,${Math.round((innerHeight - CSS_H * k) / 2)}px) scale(${k});`;
      W.cine.prOverride = pr;
      restore = () => { if (prevStyle == null) app.removeAttribute('style'); else app.setAttribute('style', prevStyle); document.body.classList.remove('exporting'); W.cine.prOverride = 0; H.resize(); };
      H.resize();

      // saat: fizik elle, sayfa sanal
      H.send({ cmd: 'clock', manual: true });
      clock = new VirtualClock(window); clock.install();
      const recorder = new AudioRecorder({ mood: cut.mood, sfx: cut.sfx });
      const ok = await H.cinema.start({ cut, quality: R.level, export: { recorder } });
      if (!ok) throw new ExportError('start');
      H.resize();
      if (W.renderer.domElement.width !== R.w || W.renderer.domElement.height !== R.h) throw new ExportError('size', `${W.renderer.domElement.width}×${W.renderer.domElement.height}`);

      const comp = document.createElement('canvas'); comp.width = R.w; comp.height = R.h; const cx = comp.getContext('2d', { alpha: false });
      overlay = ovOk ? new OverlayCapture(H.cinema.ui.root, R.w, R.h, fontCss) : null;
      const dt = 1 / fps, maxFrames = Math.round((o.maxSec || 900) * fps);
      let n = 0, kf = 0, capturing = false, tail = null;
      const started = Date.now();
      while (!this.cancelled) {
        if (fail) throw fail;
        if (!H.cinema.on) break;
        const stepP = H.step(dt, ++n), to = realWait(120000).then(() => { throw new ExportError('worker'); });
        await Promise.race([stepP, to]);
        clock.advance(dt * 1000);                                                    // yönetmen (30 ms denetim), kart zamanlayıcıları, çizim döngüsü (sahne çizilir)
        const st = H.cinema.state;
        if (!capturing && (st === 'ascent' || st === 'run')) { capturing = true; recorder.t0 = clock.now; }
        if (!capturing) continue;
        if (W.tilesBusy) { for (let i = 0; i < 60 && W.tilesBusy; i++) await realWait(100); W.render(); }   // Ay yüzeyi parçaları yüklenirken bekle (kare eksik çizilmesin)
        cx.drawImage(W.renderer.domElement, 0, 0, R.w, R.h);                         // çizimden hemen sonra (aynı görevde): tampon geçerli
        if (overlay) { overlay.sync(clock.now); const img = await overlay.image(); if (img) cx.drawImage(img, 0, 0, R.w, R.h); }
        const vf = new VideoFrame(comp, { timestamp: Math.round(kf * 1e6 / fps), duration: Math.round(1e6 / fps) });
        venc.encode(vf, { keyFrame: kf % (fps * 2) === 0 }); vf.close(); kf++;
        while (venc.encodeQueueSize > 3 && !fail) await new Promise((r) => { venc.addEventListener('dequeue', r, { once: true }); RT.st(r, 2000); });
        if (st === 'ended' && tail == null) tail = kf + Math.round(fps * 3.5);       // kapanış kartı ve jenerik görünsün
        if ((tail != null && kf >= tail) || kf >= maxFrames) break;
        if (kf % 3 === 0) {
          const s = H.cinema.shot, el = (Date.now() - started) / 1000, est = H.cinema.estimate ? H.cinema.estimate(cut) : null;
          prog({ phase: 'video', frames: kf, seconds: kf / fps, total: est, grp: s && s.grp, elapsed: el, rate: kf / Math.max(0.001, el) / fps, bytes: estimateBytes(kf / fps, vbps) });
          await realWait(0);                                                          // arayüz (ilerleme, İptal) nefes alsın
        }
      }
      if (this.cancelled) throw new ExportError('cancel');
      await venc.flush(); venc.close(); venc = null;
      if (fail) throw fail;
      const seconds = kf / fps;
      // ses: kayıttan çevrimdışı üretim, sonra kodlama
      if (acfg && kf > 0) {
        prog({ phase: 'audio', seconds });
        const buf = await renderAudio(recorder, seconds);
        if (buf) {
          const aenc = new AudioEncoder({ output: (chunk, meta) => { try { muxer.addAudioChunk(chunk, meta); } catch (e) { fail = e; } }, error: (e) => { fail = e; } });
          aenc.configure(acfg.config);
          const L = buf.getChannelData(0), Rr = buf.getChannelData(1), STEP = 4800;
          for (let i = 0; i < buf.length; i += STEP) {
            const nfr = Math.min(STEP, buf.length - i), d = new Float32Array(nfr * 2); d.set(L.subarray(i, i + nfr), 0); d.set(Rr.subarray(i, i + nfr), nfr);
            const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: nfr, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / 48000), data: d });
            aenc.encode(ad); ad.close();
          }
          await aenc.flush(); aenc.close();
        }
      }
      prog({ phase: 'finish' });
      muxer.finalize();
      let blob = null, bytes = 0;
      if (writable) { await writable.close(); writable = null; const f = await o.handle.getFile(); bytes = f.size; }
      else { blob = sink.build('video/mp4'); bytes = blob.size; }
      return { blob, bytes, frames: kf, seconds, codec: vcfg.name + (acfg ? ' + ' + acfg.name : ''), overlay: !!overlay };
    } finally {
      try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { /* kapalı */ }
      if (writable) { try { await writable.abort(); } catch (e) { /* yok */ } }
      try { if (H.cinema.on) H.cinema.stop(); } catch (e) { console.error(e); }      // sanal saat kaldırılmadan: yönetmenin zamanlayıcısı sanal tabloda silinir
      if (clock) clock.uninstall();
      H.send({ cmd: 'clock', manual: false });
      if (overlay && document.getAnimations) for (const a of document.getAnimations()) { try { if (a.playState === 'paused') a.play(); } catch (e) { /* yok */ } }
      if (restore) restore();
      this.busy = false;
    }
  }
}
