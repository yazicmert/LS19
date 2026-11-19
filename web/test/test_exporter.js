// Video dışa aktarımı (exporter.js, vclock.js, cineaudio.js AudioRecorder, worker.js elle saat) — Node 20+: cd web && node test/test_exporter.js
//  1) sanal saat: zaman kaynakları değişir; zamanlayıcılar vakit sırasıyla, aralıklılar tekrar; rAF kare başına bir kez; kaldırınca özgünler geri, bekleyenler gerçek saate taşınır
//  2) H.264 düzeyi (makroblok sınırları), bit hızı, dosya boyu, dosya adı, çözünürlük listesi
//  3) kodlayıcı seçimi: H.264 donanım → yazılım → VP9 → AV1; ses AAC → Opus; desteklenmezse null
//  4) bellek hedefi: sıralı yazım + geri dönük yama (MP4 başlığı) doğru yere
//  5) ses kaydı: sanal zaman, motor düzeyi seyreltilir, aynı söz bir kez; yazı tipi gömme (latin alt kümeleri, veri adresi)
//  6) bağlantılar: worker 'clock'/'step', sahnede piksel oranı geçersiz kılma, CSS kap birimleri, masa ve panel
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const { VirtualClock } = await import('../js/vclock.js');
const X = await import('../js/exporter.js');
const A = await import('../js/cineaudio.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 1) sanal saat (sahte küresel nesne)
{
  const log = [];
  let realNow = 1000;
  const realTimers = [];
  const g = { performance: { now: () => realNow }, Date: { now: () => 1.7e12 + realNow },
    requestAnimationFrame: () => 'gerçek', cancelAnimationFrame: () => {}, setTimeout: (fn, ms) => { realTimers.push({ fn, ms }); return 99; }, clearTimeout: () => {}, setInterval: () => 98, clearInterval: () => {} };
  const orig = { st: g.setTimeout, raf: g.requestAnimationFrame };
  const C = new VirtualClock(g); C.install();
  const t0 = g.performance.now();
  g.setTimeout(() => log.push('t50@' + (g.performance.now() - t0)), 50);
  const iv = g.setInterval(() => log.push('iv@' + (g.performance.now() - t0)), 30);
  g.setTimeout(() => log.push('t30@' + (g.performance.now() - t0)), 30);
  const cancel = g.setTimeout(() => log.push('İPTAL'), 10); g.clearTimeout(cancel);
  g.requestAnimationFrame((ts) => { log.push('raf@' + (ts - t0).toFixed(1)); g.requestAnimationFrame(() => log.push('raf2')); });
  C.advance(33.3333);
  const a = log.join();
  C.advance(33.3333);
  const b = log.join();
  g.clearInterval(iv);
  check('sanal saat: zamanlayıcılar vakit sırasıyla (eşitlikte kuruluş sırasıyla) kendi vaktinde, iptal edilen çalışmaz; rAF kare sonunda bir kez, içinde istenen sonraki kareye',
    a === 'iv@30,t30@30,raf@33.3' && b === a + ',t50@50,iv@60,raf2', b);
  check('sanal saat: performance.now ve Date.now sanal zamanı verir (gerçek saat ilerlese de)', (realNow += 5000, g.performance.now() - t0 > 66 && g.performance.now() - t0 < 67) && Math.abs(g.Date.now() - (1.7e12 + 1000 + 66.6666)) < 1);
  g.setTimeout(() => log.push('taşındı'), 100);
  C.uninstall();
  check('kaldırınca: özgün işlevler geri; bekleyen zamanlayıcı kalan süresiyle gerçek saate; sanal saat öndeyse performance.now geri gitmez',
    g.setTimeout === orig.st && g.requestAnimationFrame === orig.raf && realTimers.some((t) => Math.abs(t.ms - 100) < 1e-6) && g.performance.now() >= 1000 + 66);
}

// ---------------------------------------------------------------- 2) düzey, bit hızı, boy, ad
{
  check('H.264 düzeyi: 4K30 → 5.1, 4K60 → 5.2, 1440p60 → 5.1, 1080p30 → 4.0, 1080p60 → 4.2', X.avcCodec(3840, 2160, 30) === 'avc1.640033' && X.avcCodec(3840, 2160, 60) === 'avc1.640034' && X.avcCodec(2560, 1440, 60) === 'avc1.640033' && X.avcCodec(1920, 1080, 30) === 'avc1.640028' && X.avcCodec(1920, 1080, 60) === 'avc1.64002a',
    [X.avcCodec(3840, 2160, 30), X.avcCodec(3840, 2160, 60), X.avcCodec(1920, 1080, 30)].join());
  const v = X.videoBitrate('2160', 30, 'high');
  check('bit hızı: 4K yüksek 30 kare/s 45 Mbit/s; 60 kare/s ×1,6; standart ×0,7; dosya boyu süre × hız / 8', v === 45e6 && X.videoBitrate('2160', 60, 'high') === 72e6 && X.videoBitrate('2160', 30, 'std') === 31.5e6 && X.estimateBytes(100, 8e6, 0) === Math.round(100e6 * 1.01));
  check('çözünürlükler 16:9, CSS yerleşimi 1920 × 1080 (4K\'da piksel oranı 2)', Object.values(X.RES).every((r) => r.w * 9 === r.h * 16) && X.RES[2160].w / X.CSS_W === 2 && X.FPS.join() === '24,30,60');
  check('dosya adı: Türkçe harfler sadeleşir, güvenli karakterler, çözünürlük ve kare hızı', X.fileName({ title: 'Ayşe’nin Ay’ı: İLK/1' }, '2160', 30) === 'LS19-Aysenin-Ayi-ILK1-4K-30fps.mp4' && X.fileName({}, '1080', 60) === 'LS19-fragman-1080p-60fps.mp4', X.fileName({ title: 'Ayşe’nin Ay’ı: İLK/1' }, '2160', 30));
}

// ---------------------------------------------------------------- 3) kodlayıcı seçimi (sahte WebCodecs)
{
  const fakeVE = (ok) => ({ isConfigSupported: async (c) => ({ supported: ok(c), config: c }) });
  const hw = await X.pickVideoConfig(3840, 2160, 30, 1, fakeVE((c) => c.codec.startsWith('avc1') && c.hardwareAcceleration === 'prefer-hardware'));
  const sw = await X.pickVideoConfig(3840, 2160, 30, 1, fakeVE((c) => c.codec.startsWith('avc1') && c.hardwareAcceleration === 'no-preference'));
  const vp9 = await X.pickVideoConfig(3840, 2160, 30, 1, fakeVE((c) => c.codec.startsWith('vp09')));
  const none = await X.pickVideoConfig(3840, 2160, 30, 1, fakeVE(() => false));
  check('video kodlayıcı: H.264 donanım → yazılım → VP9 → yok; H.264 avc biçiminde (MP4)', hw.name === 'H.264' && hw.hw && hw.config.avc.format === 'avc' && hw.mux === 'avc' && sw.name === 'H.264' && !sw.hw && vp9.mux === 'vp9' && none === null && (await X.pickVideoConfig(1, 1, 1, 1, undefined)) === null);
  const aac = await X.pickAudioConfig({ isConfigSupported: async () => ({ supported: true }) }), opus = await X.pickAudioConfig({ isConfigSupported: async (c) => ({ supported: c.codec === 'opus' }) });
  check('ses kodlayıcı: AAC, yoksa Opus; 48 kHz stereo 192 kbit/s', aac.mux === 'aac' && opus.mux === 'opus' && aac.config.sampleRate === 48000 && aac.config.numberOfChannels === 2 && aac.config.bitrate === X.AUDIO_BPS);
}

// ---------------------------------------------------------------- 4) bellek hedefi
{
  const S = new X.BlobSink(8);
  const bytes = (...a) => new Uint8Array(a);
  S.write(bytes(1, 2, 3, 4, 5), 0); S.write(bytes(6, 7, 8, 9, 10), 5); S.write(bytes(11, 12), 10);
  S.write(bytes(90, 91), 3);                                                      // geri dönük yama: iki parçaya taşar
  S.write(bytes(99), 11);
  const b = S.build('video/mp4');
  const out = new Uint8Array(await b.arrayBuffer());
  check('bellek hedefi: sıralı parçalar Blob\'a; geri dönük yazımlar (MP4 mdat boyu) doğru konuma, parça sınırını aşsa da', out.join() === '1,2,3,90,91,6,7,8,9,10,11,99' && b.type === 'video/mp4' && b.size === 12, out.join());
}

// ---------------------------------------------------------------- 5) ses kaydı ve yazı tipleri
{
  let now = 0; const P = globalThis.performance, orig = P.now; P.now = () => now;
  const R = new A.AudioRecorder({ mood: 'umut', sfx: false });
  R.chapter(1); R.t0 = 1000; now = 1000; R.update(1, 1, true); now = 1030; R.update(1, 1, true); now = 1050; R.update(0.5, 1, true); now = 1200; R.update(0.5, 1, true);
  now = 2000; R.thump(); R.say('LOS', 'x'); R.say('LOS', 'x'); R.setMix({ mood: 'off' });
  P.now = orig;
  const ms = R.log.map((e) => `${e.m}@${e.t.toFixed(2)}`).join();
  check('ses kaydı: t0 öncesi 0 s; motor düzeyi değişmedikçe 0,1 s seyreltilir; aynı söz bir kez; başlangıç ruhu saklanır (canlı değişiklik olay)',
    ms === 'chapter@0.00,update@0.00,update@0.05,update@0.20,thump@1.00,say@1.00,setMix@1.00' && R.mood0 === 'umut' && R.sfx0 === false && R.lead === 0, ms);
  check('renderAudio: OfflineAudioContext yoksa (Node) null döner', (await A.renderAudio(R, 2)) === null);
  const css = '/* cyrillic */\n@font-face { src: url(https://f/c.woff2); }\n/* latin-ext */\n@font-face { src: url(https://f/le.woff2); }\n/* latin */\n@font-face { src: url(https://f/l.woff2); }\n';
  const seen = [];
  const fetchFn = async (u) => { seen.push(u); return u.includes('googleapis') ? { text: async () => css } : { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
  const out = await X.embedFonts(['Exo:wght@400', 'Cinzel'], fetchFn);
  check('yazı tipi gömme: yalnız latin ve latin-ext, woff2 veri adresine; istek iki aileyle; hata olursa boş', !out.includes('cyrillic') && (out.match(/data:font\/woff2;base64,AQID/g) || []).length === 2 && !seen.includes('https://f/c.woff2') && /family=Exo:wght@400&family=Cinzel/.test(seen[0])
    && (await X.embedFonts(['Exo'], async () => { throw new Error('ağ yok'); })) === '');
}

// ---------------------------------------------------------------- 6) bağlantılar
{
  const wk = rd('../js/worker.js'), sc = rd('../js/scene.js'), css = rd('../css/cinema.css'), cin = rd('../js/cinema.js'), app = rd('../js/app.js'), ex = rd('../js/exporter.js'), desk = rd('../js/producerui.js'), ui = rd('../js/exportui.js');
  check('worker.js: elle saat (clock) zamanlayıcıyı durdurur; step tam kare süresi kadar ilerler ve fizik hedefe varana dek hesaplar; durum iletisi adım numarasını taşır',
    /case 'clock':/.test(wk) && /if \(!manualClock\) timer = setInterval\(tick, TICK_MS\);/.test(wk) && /case 'step': if \(manualClock\) tick\(\{ dt:/.test(wk) && /if \(step\) for \(let k = 0; k < 100000 && M\.P\.s\.t < tTarget - 1e-9/.test(wk) && /step: step \? step\.n : undefined/.test(wk));
  check('sahne: dışa aktarımda piksel oranı tam çıktı boyuna (prOverride); CSS katmanı kap birimleriyle (vw/vh yok)', /this\.cine\.prOverride \|\| this\._prOf/.test(sc) && !/\dv[wh]\b/.test(css) && /\.cine\.exporting \.cine-exit/.test(css));
  check('yönetmen: dışa aktarımda ses kaydedici, düz sayılar (gölge DOM yok); app.js: adım bekleyici, panel ve dışa aktarıcı ilk kullanımda yüklenir',
    /this\.opts\.export \? this\.opts\.export\.recorder/.test(cin) && /ui\.plain = !!this\.opts\.export/.test(cin) && /stepWaiter && d\.step === stepWaiter\.n/.test(app) && /import\('\.\/exporter\.js'\), import\('\.\/exportui\.js'\)/.test(app) && /if \(exporter && exporter\.busy\) return;/.test(app));
  check('dışa aktarıcı: önce kodlayıcı/GPU/yazı katmanı denetimi; sanal saat ve elle fizik; çizimden hemen sonra kareye kopya; kodlayıcı kuyruğu sınırlı; bitince her şey geri (yönetmen sanal saat kaldırılmadan durur)',
    /pickVideoConfig\(R\.w, R\.h, fps, vbps\); if \(!vcfg\) throw new ExportError\('codec'\)/.test(ex) && /cmd: 'clock', manual: true/.test(ex) && /clock\.install\(\)/.test(ex) && /cx\.drawImage\(W\.renderer\.domElement/.test(ex) && /encodeQueueSize > 3/.test(ex)
    && ex.indexOf("if (H.cinema.on) H.cinema.stop(); } catch") < ex.indexOf('if (clock) clock.uninstall();') && /cmd: 'clock', manual: false/.test(ex) && /fastStart: false/.test(ex));
  check('masa ve panel: "Video olarak kaydet"; panel seçenekleri hatırlar, diske yazma seçicisi, İptal, indirme bağlantısı; ayrı pencere LS19\'a iletir',
    /Video olarak kaydet/.test(desk) && /'ls19\.export'/.test(ui) && /showSaveFilePicker/.test(ui) && /this\.o\.exporter\.cancel\(\)/.test(ui) && /a\.download = name/.test(ui) && /send\('export', \{ cut \}\)/.test(rd('../js/yapimci.js')));
  check('lib/mp4-muxer.esm.js ve lisansı (MIT) yerel', fs.existsSync(new URL('../lib/mp4-muxer.esm.js', import.meta.url)) && /MIT License/.test(rd('../lib/mp4-muxer.LICENSE.md')));
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
