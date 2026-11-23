// LS19 sinematik fragman sesi (Web Audio; ses dosyası yok, hepsi üretilir):
//   · müzik: yumuşak ortam tınısı (dört ses: üçgen + sinüs, alt bas, alçak geçiren süzgeç ve yavaş LFO) üretilmiş yankı odasında; akorun seslerinden seyrek çan notaları;
//     akor her bölüm kartında değişir (2,5 s geçiş, kabarma)
//   · görev kontrol havası: anonsların başında ve sonunda Quindar tonları (Apollo hattının 2525/2475 Hz bip'leri), geri sayımda saniye tıkları
//   · motor: kahverengi gürültü → alçak geçiren süzgeç; düzey ve kesim gaza göre. Kalkışta (atmosfer) güçlü ve çatırtılı, uzayda alçak bir uğultu
//     (gerçekte vakumda ses yoktur: fragman alışkanlığı, gövdeden duyulan titreşim gibi stilize), yüksek zaman hızında susar
//   · tek seferlik: ayrılma (boğuk çarpma), temas ışığı (iki kısa bip), bölüm kabarması
//   · görev kontrol anonsları: tarayıcının konuşma sentezi (Web Speech; yoksa sessizce atlanır)
// Saf işlevler (engineLevel, chordFreqs) test/test_cinema.js'te sınanır.
import { isEn } from './i18n.js';

// akorlar: kök (MIDI) + aralıklar; bölüm sırasıyla döner (karanlık → açık → gerilim → çözülme)
export const CHORDS = [[45, [0, 7, 12, 15]], [41, [0, 7, 11, 16]], [48, [0, 7, 14, 16]], [43, [0, 5, 10, 14]], [45, [0, 7, 14, 15]], [40, [0, 7, 12, 17]], [41, [0, 4, 11, 19]], [48, [0, 7, 12, 16]]];
// müzik ruhu (Yapımcı masası, producer.js): gizem = yukarıdaki dizi; umut = majör, açık aralıklar; gerilim = küçük, asılı ve yarım ses sürtüşmeli; off = müzik yok
export const MOODS = {
  gizem: CHORDS,
  umut: [[48, [0, 7, 12, 16]], [43, [0, 7, 14, 16]], [45, [0, 7, 12, 15]], [41, [0, 7, 12, 16]], [48, [0, 4, 11, 14]], [43, [0, 5, 12, 14]], [41, [0, 7, 14, 16]], [48, [0, 7, 16, 19]]],
  gerilim: [[40, [0, 7, 13, 15]], [40, [0, 6, 12, 15]], [41, [0, 7, 13, 16]], [38, [0, 7, 12, 13]], [40, [0, 5, 10, 15]], [43, [0, 6, 13, 15]], [40, [0, 7, 12, 14]], [45, [0, 7, 12, 15]]],
};
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
export function chordFreqs(i, mood = 'gizem') { const L = MOODS[mood] || CHORDS; const [root, iv] = L[((i % L.length) + L.length) % L.length]; return iv.map((d) => midiHz(root + d)); }
// motor sesi: gaz (0..1), zaman hızı, atmosferde mi (kalkış) → { gain, cutoff (Hz), crackle (0..1) }. Zaman hızı ×60'ın üstünde söner (×200'de sessiz).
export function engineLevel(thr, warp = 1, air = false) {
  const t = Math.max(0, Math.min(1, thr || 0)), fade = warp <= 60 ? 1 : warp >= 200 ? 0 : 1 - (warp - 60) / 140;
  if (t <= 0.005 || fade <= 0) return { gain: 0, cutoff: 120, crackle: 0 };
  const gain = (air ? 0.55 + 0.35 * t : 0.1 + 0.16 * t) * fade;
  return { gain, cutoff: air ? 260 + 900 * t : 90 + 260 * t, crackle: air ? 0.35 * t * fade : 0 };
}

const LS_KEY = 'ls19.cineMute';

// ---------------------------------------------------------------- dışa aktarım (exporter.js): fragman sırasında ses olaylarını sanal zamanla kaydeder, sonra
// OfflineAudioContext'te aynı sesi kare doğruluğunda üretir (renderAudio). CineAudio ile aynı arayüz; canlı ses çalmaz.
export class AudioRecorder {
  constructor(opts = {}) { this.mood = this.mood0 = opts.mood || 'gizem'; this.sfx = this.sfx0 = opts.sfx !== false; this.muted = false; this.log = []; this.t0 = null; this.lastUpd = null; this.spoken = new Set(); }
  get lead() { return 0; }
  get ok() { return true; }
  at() { const t = performance.now(); return this.t0 == null ? 0 : Math.max(0, (t - this.t0) / 1000); }
  rec(m, a = []) { this.log.push({ t: this.at(), m, a }); }
  start() {} stop() {} setMuted() {}
  // motor düzeyi her denetim adımında gelir: değişmedikçe ya da 0,1 s dolmadıkça yazılmaz
  update(thr, warp, air) {
    const L = this.lastUpd, t = this.at();
    if (L && t - L.t < 0.1 && Math.abs(L.thr - thr) < 0.02 && Math.abs(Math.log((L.warp || 1) / (warp || 1))) < 0.1 && L.air === air) return;
    this.lastUpd = { t, thr, warp, air }; this.rec('update', [thr, warp, air]);
  }
  chapter(i) { this.rec('chapter', [i]); }
  thump() { this.rec('thump'); }
  beep() { this.rec('beep'); }
  intensity(v) { this.rec('intensity', [v]); }
  hit(p = 1) { this.rec('hit', [p]); }
  land() { this.rec('land'); }
  finale() { this.rec('finale'); }
  tick(last = false) { this.rec('tick', [last]); }
  say(key, text, o = {}) { if (this.spoken.has(key)) return; this.spoken.add(key); this.rec('say', [key, text, o]); }
  setMix(o) { if (o.mood) this.mood = o.mood; if (o.sfx != null) this.sfx = o.sfx; this.rec('setMix', [o]); }
}
// kayıttan sesi üret: süre (s), örnekleme 48 kHz stereo; çanlar müzik açıkken 2,3 s'de bir (canlıdaki zamanlayıcının eşi). Olaylar işleme kuantumuna (128 örnek)
// yuvarlanır ve aynı kuantumdakiler birlikte uygulanır (OfflineAudioContext.suspend). Dönen: AudioBuffer
export async function renderAudio(rec, duration, sampleRate = 48000) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext; if (!OAC) return null;
  const len = Math.max(1, Math.ceil(duration * sampleRate)), ctx = new OAC(2, len, sampleRate);
  const a = new CineAudio({ mood: rec.mood0, sfx: rec.sfx0 });                      // kayıt başındaki ayarlar; sonraki canlı değişiklikler setMix olayıyla
  a.muted = false; a.start(ctx);
  const ev = rec.log.filter((e) => e.t < duration).map((e) => ({ ...e })), Q = 128 / sampleRate;
  let musicOn = a.mood !== 'off';
  for (let t = 2.3; t < duration; t += 2.3) ev.push({ t, m: 'bell', a: [] });
  ev.sort((x, y) => x.t - y.t);
  const groups = new Map();
  for (const e of ev) { const q = Math.max(1, Math.round(e.t / Q)); if (!groups.has(q)) groups.set(q, []); groups.get(q).push(e); }
  const apply = (e) => {
    if (e.m === 'bell') { if (musicOn) a.bell(); return; }
    if (e.m === 'setMix') { a.setMix(e.a[0]); musicOn = a.mood !== 'off'; return; }
    if (typeof a[e.m] === 'function') a[e.m](...e.a);
  };
  for (const [q, list] of groups) { const t = q * Q; if (t >= len / sampleRate) continue; ctx.suspend(t).then(() => { for (const e of list) apply(e); ctx.resume(); }); }
  return ctx.startRendering();
}
export class CineAudio {
  // opts (Yapımcı masası): mood (müzik ruhu; 'off' müzik yok), sfx (motor, çarpma, bip, tık; false: susar)
  constructor(opts = {}) { this.mood = opts.mood || 'gizem'; this.sfx = opts.sfx !== false; this.ctx = null; this.muted = false; try { this.muted = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* özel pencere */ } this.chord = -1; this.spoken = new Set(); }
  get ok() { return !!this.ctx; }
  // ctx: hazır bağlam (dışa aktarımda OfflineAudioContext: ses çevrimdışı üretilir; çan zamanlayıcısı, konuşma ve tarayıcı izni yok)
  start(ctx = null) {
    const AC = window.AudioContext || window.webkitAudioContext; if ((!AC && !ctx) || this.ctx) return;
    const c = this.ctx = ctx || new AC(), now = c.currentTime; this.offline = !!ctx && typeof ctx.startRendering === 'function';
    // ana yol: ana kazanç → sıkıştırıcı → çıkış
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(c.destination);
    this.fx = c.createGain(); this.fx.gain.value = this.sfx ? 1 : 0; this.fx.connect(this.master);          // efekt kanalı (motor, ayrılma, temas bip'i, geri sayım tıkı)
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, now, 0.8);
    // yankı: üretilmiş dürtü yanıtı (üstel sönen gürültü, 3,2 s) — müzik ve çanlar geniş bir odada
    const rev = c.createConvolver(); rev.buffer = this.impulse(3.2); const wet = c.createGain(); wet.gain.value = 0.55; rev.connect(wet); wet.connect(this.master);
    // müzik: dört ses (üçgen + bir oktav üstü sinüs, hafif akort farkı) + alt bas → süzgeç (LFO) → kazanç → kuru + yankı
    this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master); this.music.connect(rev);
    const lp = this.musicLp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.5; lp.connect(this.music);
    const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 0.045; lfoG.gain.value = 180; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const fs0 = chordFreqs(0, this.mood), musicOn = this.mood !== 'off';
    this.voices = fs0.map((f, i) => {
      const g = c.createGain(); g.gain.value = i === 0 ? 0.13 : 0.07; g.connect(lp);
      const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'triangle'; o2.type = 'sine';
      o1.frequency.value = f; o2.frequency.value = f * 2; o1.detune.value = -5; o2.detune.value = 6; o1.connect(g);
      const g2 = c.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(g); o1.start(); o2.start();
      // her sesin kendi yavaş nefesi (0,05–0,09 Hz): tını durağan kalmaz
      const tr = c.createOscillator(), trG = c.createGain(); tr.frequency.value = 0.05 + 0.013 * i; trG.gain.value = g.gain.value * 0.45; tr.connect(trG); trG.connect(g.gain); tr.start();
      return { o1, o2, g, k2: 2 };
    });
    this.sub = c.createOscillator(); this.sub.type = 'sine'; this.sub.frequency.value = fs0[0] / 2; const subG = c.createGain(); subG.gain.value = 0.16; this.sub.connect(subG); subG.connect(this.music); this.sub.start();
    if (musicOn) this.music.gain.setTargetAtTime(0.3, now, 2.5);
    // çanlar: akorun seslerinden seyrek, yumuşak notalar (sinüs, 2,6 s sönüm) yankıya; müziğe hareket verir
    this.bellOut = c.createGain(); this.bellOut.gain.value = 0.5; this.bellOut.connect(rev); const bd = c.createGain(); bd.gain.value = 0.25; this.bellOut.connect(bd); bd.connect(this.master);
    this.bellN = 0; if (musicOn && !this.offline) this.bellTimer = setInterval(() => this.bell(), 2300);
    // gerilim katmanı (nabız): alçak sinüs vuruşu + ince gürültü; zarf düşen testere LFO'dan (saldırı anlık, üstel sönüm) — zamanlayıcı yok, çevrimdışı üretimde de aynı.
    // Yoğunluk (intensity) bölüme göre: kazanç ve tempo; müzik kapalıyken sessiz
    this.perc = c.createGain(); this.perc.gain.value = 0; this.perc.connect(this.master); const pw = c.createGain(); pw.gain.value = 0.18; this.perc.connect(pw); pw.connect(rev);
    const env = (rate) => {                                                        // [0,1] zarf: 1'den 0'a düşen testere → u⁴
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = rate; const inv = c.createGain(); inv.gain.value = -0.5; o.connect(inv);
      const dc = c.createConstantSource(); dc.offset.value = 0.5; const sh = c.createWaveShaper(); const cv = new Float32Array(257);
      for (let i = 0; i < 257; i++) { const x = i / 128 - 1, u = Math.max(0, x); cv[i] = u ** 4; } sh.curve = cv; inv.connect(sh); dc.connect(sh); o.start(); dc.start(); return { o, out: sh };
    };
    this.pulseEnv = env(1.05);
    const kick = c.createOscillator(); kick.type = 'sine'; kick.frequency.value = 49; const kickG = c.createGain(); kickG.gain.value = 0; this.pulseEnv.out.connect(kickG.gain); kick.connect(kickG); kickG.connect(this.perc); kick.start();
    const hiEnv = this.hiEnv = env(2.1), hiSrc = c.createBufferSource(); hiSrc.buffer = this.noiseBuffer(2); hiSrc.loop = true;
    const hiBp = c.createBiquadFilter(); hiBp.type = 'highpass'; hiBp.frequency.value = 2600; const hiG = c.createGain(); hiG.gain.value = 0; hiEnv.out.connect(hiG.gain);
    this.hi = c.createGain(); this.hi.gain.value = 0; hiSrc.connect(hiBp); hiBp.connect(hiG); hiG.connect(this.hi); this.hi.connect(this.perc); hiSrc.start(); this.intens = 0;
    // motor: döngülü kahverengi gürültü → alçak geçiren → kazanç; çatırtı: aynı gürültü → yüksek geçiren → kazanç (rastgele genlik)
    const noise = this.noiseBuffer(4);
    const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
    this.engLp = c.createBiquadFilter(); this.engLp.type = 'lowpass'; this.engLp.frequency.value = 120; this.engLp.Q.value = 0.9;
    this.eng = c.createGain(); this.eng.gain.value = 0; src.connect(this.engLp); this.engLp.connect(this.eng); this.eng.connect(this.fx);
    const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900; hp.Q.value = 0.6;
    this.crk = c.createGain(); this.crk.gain.value = 0; src.connect(hp); hp.connect(this.crk); this.crk.connect(this.fx);
    src.start(); this.src = src;
    if (this.offline) return;
    this.warmSpeech();
    // tarayıcı kendiliğinden başlatmayı engellediyse ilk dokunuşta sürdür
    if (c.state === 'suspended') { this.resume = () => { c.resume(); }; window.addEventListener('pointerdown', this.resume, { once: true }); window.addEventListener('keydown', this.resume, { once: true }); }
  }
  // yankı dürtü yanıtı: iki kanal, üstel sönen beyaz gürültü
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }
  // çan notası: akorun bir sesi (bir ya da iki oktav üstte), sırayla dolaşır; ara sıra susar
  bell() {
    const c = this.ctx; if (!c || (c.state !== 'running' && !this.offline)) return;
    const k = this.bellN++; if (k % 5 === 4) return;
    const fs = chordFreqs(Math.max(0, this.chord), this.mood), f = fs[[0, 2, 1, 3, 2][k % 5]] * (k % 3 === 0 ? 4 : 2), t = c.currentTime + 0.05;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.085, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
    o.connect(g); g.connect(this.bellOut); o.start(t); o.stop(t + 2.7);
  }
  // kısa ton (görev kontrol hattı): Quindar giriş 2525 Hz / çıkış 2475 Hz (250 ms), geri sayım tıkı
  tone(f, dur = 0.25, gain = 0.07, delay = 0, bus = null) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.setValueAtTime(gain, t + dur - 0.012); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(bus || this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  // geri sayım tıkı: her saniyede kısa bip, kalkışta uzun ve bir oktav üstü (konuşma sentezi olmasa da geri sayım duyulur)
  tick(last = false) { this.tone(last ? 1320 : 660, last ? 0.5 : 0.09, last ? 0.11 : 0.09, 0, this.fx); }
  // kahverengi (1/f²) gürültü: rastgele yürüyüş, sızıntılı
  noiseBuffer(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  stop() {
    const c = this.ctx; if (!c) return;
    if (this.resume) { window.removeEventListener('pointerdown', this.resume); window.removeEventListener('keydown', this.resume); }
    clearInterval(this.bellTimer); this.utter = [];
    try { if (this.onVoices && window.speechSynthesis && speechSynthesis.removeEventListener) speechSynthesis.removeEventListener('voiceschanged', this.onVoices); } catch (e) { /* yok */ }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* yok */ }
    this.master.gain.setTargetAtTime(0, c.currentTime, 0.25);
    this.ctx = null; setTimeout(() => c.close(), 1200);
  }
  setMuted(on) {
    this.muted = !!on; try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch (e) { /* özel pencere */ }
    if (this.ctx) { this.master.gain.setTargetAtTime(on ? 0 : 0.8, this.ctx.currentTime, 0.15); if (!on && this.ctx.state === 'suspended') this.ctx.resume(); }
    if (on) { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* yok */ } }
  }
  // yapımcının canlı değişikliği (Yapımcı masası, fragman oynarken): müzik ruhu ve efekt kanalı
  setMix({ mood = this.mood, sfx = this.sfx } = {}) {
    const c = this.ctx; this.sfx = sfx !== false;
    if (c) this.fx.gain.setTargetAtTime(this.sfx ? 1 : 0, c.currentTime, 0.15);
    if (mood === this.mood) return;
    const was = this.mood; this.mood = mood; if (!c) return;
    if (mood === 'off') { this.music.gain.setTargetAtTime(0, c.currentTime, 0.6); clearInterval(this.bellTimer); this.bellTimer = 0; if (this.perc) this.perc.gain.setTargetAtTime(0, c.currentTime, 0.6); return; }
    if (was === 'off') { this.music.gain.setTargetAtTime(0.3, c.currentTime, 1.2); if (!this.bellTimer) this.bellTimer = setInterval(() => this.bell(), 2300); this.intensity(this.intens || 0); }
    const k = Math.max(0, this.chord); this.chord = -1; this.chapter(k);              // akor yeni ruhla
  }
  // her denetim adımı: gaz, zaman hızı, atmosfer (kalkış)
  update(thr, warp, air) {
    const c = this.ctx; if (!c) return;
    const L = engineLevel(thr, warp, air), t = c.currentTime;
    this.eng.gain.setTargetAtTime(L.gain, t, 0.12); this.engLp.frequency.setTargetAtTime(L.cutoff, t, 0.2);
    this.crk.gain.setTargetAtTime(L.crackle * (0.6 + 0.4 * Math.random()), t, 0.05);
  }
  // bölüm: akor değişir, kısa bir kabarma (süzgeç açılır, sonra kapanır)
  chapter(i) {
    const c = this.ctx; if (!c || i === this.chord) return;
    this.chord = i; if (this.mood === 'off') return;
    const t = c.currentTime, fs = chordFreqs(i, this.mood);
    this.voices.forEach((v, k) => { v.o1.frequency.setTargetAtTime(fs[k], t, 0.9); v.o2.frequency.setTargetAtTime(fs[k] * 2, t, 0.9); });
    this.sub.frequency.setTargetAtTime(fs[0] / 2, t, 1.2);
    const f = this.musicLp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.linearRampToValueAtTime(1300, t + 1.2); f.linearRampToValueAtTime(620, t + 4.5);
    this.music.gain.setTargetAtTime(0.4, t, 0.6); this.music.gain.setTargetAtTime(0.3, t + 2.5, 1.5);
  }
  // ayrılma: boğuk çarpma (alçak sinüs ve gürültü patlaması, hızlı sönüm)
  thump() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + 0.8);
    const n = c.createBufferSource(), ng = c.createGain(), lp = c.createBiquadFilter(); n.buffer = this.src.buffer; lp.type = 'lowpass'; lp.frequency.value = 600;
    ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45); n.connect(lp); lp.connect(ng); ng.connect(this.fx); n.start(t, Math.random() * 2); n.stop(t + 0.5);
  }
  // temas ışığı: iki kısa bip
  beep() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    for (const d of [0, 0.22]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 1180; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.16, t + d + 0.01); g.gain.setValueAtTime(0.16, t + d + 0.12); g.gain.linearRampToValueAtTime(0, t + d + 0.14); o.connect(g); g.connect(this.fx); o.start(t + d); o.stop(t + d + 0.16); }
  }
  // gerilim düzeyi 0…1 (cinema.js bölüm başlarken): nabız kazancı ve temposu, ince vuruş yalnız yüksek düzeyde; müzik kapalıyken nabız yok
  intensity(v) {
    const c = this.ctx; if (!c || !this.perc) return; const I = Math.max(0, Math.min(1, +v || 0)), t = c.currentTime; this.intens = I;
    const on = this.mood !== 'off' ? 1 : 0;
    this.perc.gain.setTargetAtTime(on * 0.55 * I ** 1.6, t, 1.2);
    this.hi.gain.setTargetAtTime(on * 0.05 * Math.max(0, I - 0.45) / 0.55, t, 1.2);
    this.pulseEnv.o.frequency.setTargetAtTime(0.95 + 0.55 * I, t, 2); this.hiEnv.o.frequency.setTargetAtTime(2 * (0.95 + 0.55 * I), t, 2);
  }
  // darbe (motor ateşleme): derin vuruş + gürültü patlaması, yankılı
  hit(p = 1) {
    const c = this.ctx; if (!c) return; const t = c.currentTime, k = Math.max(0.2, Math.min(1.2, p));
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * k, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6); o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + 1.7);
    const n = c.createBufferSource(), ng = c.createGain(), lp = c.createBiquadFilter(); n.buffer = this.src.buffer; lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.9);
    ng.gain.setValueAtTime(0.6 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.0); n.connect(lp); lp.connect(ng); ng.connect(this.fx); n.start(t, Math.random() * 2); n.stop(t + 1.1);
  }
  // temas: nabız susar (sessizlik anı), sonra müzik açılır: parlak akor, süzgeç açılır, çan
  land() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    if (this.perc) { this.perc.gain.cancelScheduledValues(t); this.perc.gain.setTargetAtTime(0, t, 0.08); this.intens = 0; }
    if (this.mood === 'off') return;
    this.music.gain.setTargetAtTime(0.12, t, 0.2);
    const f = this.musicLp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.setValueAtTime(f.value, t + 1.1); f.linearRampToValueAtTime(1900, t + 3.4); f.linearRampToValueAtTime(900, t + 9);
    this.music.gain.setTargetAtTime(0.5, t + 1.1, 0.7); this.music.gain.setTargetAtTime(0.32, t + 6, 2);
    const fs = chordFreqs(7, this.mood); this.voices.forEach((v, k) => { v.o1.frequency.setTargetAtTime(fs[k], t + 1.1, 0.3); v.o2.frequency.setTargetAtTime(fs[k] * 2, t + 1.1, 0.3); }); this.chord = 7;
    for (const [d, m] of [[1.15, 4], [1.6, 4], [2.1, 8]]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = fs[d === 2.1 ? 2 : 0] * m; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.07, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + d + 2.8); o.connect(g); g.connect(this.bellOut); o.start(t + d); o.stop(t + d + 2.9); }
  }
  // son kart: kapanış akoru kabarır, üç çan yükselir, müzik yavaşça söner
  finale() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    if (this.perc) this.perc.gain.setTargetAtTime(0, t, 0.3);
    if (this.mood === 'off') return;
    const fs = chordFreqs(0, this.mood);
    this.voices.forEach((v, k) => { v.o1.frequency.setTargetAtTime(fs[k], t, 0.6); v.o2.frequency.setTargetAtTime(fs[k] * 2, t, 0.6); }); this.chord = 0;
    const f = this.musicLp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.linearRampToValueAtTime(1500, t + 1.5); f.linearRampToValueAtTime(500, t + 8);
    this.music.gain.setTargetAtTime(0.45, t, 0.5); this.music.gain.setTargetAtTime(0, t + 3.5, 1.8);
    [0, 2, 3].forEach((i, n) => { const d = 0.2 + n * 0.55, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = fs[i] * 4; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.08, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + d + 3.2); o.connect(g); g.connect(this.bellOut); o.start(t + d); o.stop(t + d + 3.3); });
  }
  // konuşma sesi: gösterim boyunca TEK ses. Ses listesi tarayıcıda geç yüklenir; ilk sözce listesiz (dilin varsayılan sesiyle), sonrakiler listeden seçilen başka bir
  // sesle söylenirse geri sayımda bir kadın bir erkek sesi duyulur. Ses bir kez seçilir ve değişmez: liste hazırsa dilin varsayılanı (yoksa ilk eşleşen),
  // hazır değilse gösterim sonuna dek dilin varsayılanı (voice atanmaz).
  pickVoice() {
    if (this.voiceSet) return this.voice;
    const S = window.speechSynthesis, lang = isEn ? 'en' : 'tr', L = S ? S.getVoices().filter((x) => x.lang && x.lang.toLowerCase().startsWith(lang)) : [];
    this.voice = L.find((x) => x.default) || L.find((x) => x.localService) || L[0] || null; this.voiceSet = true;
    return this.voice;
  }
  // konuşma sentezini ısıt: ses listesini yüklet (start'ta çağrılır); liste ilk sözceden önce gelirse ses oradan seçilir
  warmSpeech() {
    try {
      const S = window.speechSynthesis; if (!S) return;
      S.getVoices(); this.onVoices = () => { if (!this.voiceSet && S.getVoices().length) this.pickVoice(); };
      if (S.addEventListener) S.addEventListener('voiceschanged', this.onVoices);
      if (S.getVoices().length) this.pickVoice();
      // sessiz bir ön sözce: motoru uyandırır (ilk sözcenin gecikmesi en uzunudur) ve başlama gecikmesini geri sayımdan önce ölçer
      if (!this.muted && typeof SpeechSynthesisUtterance === 'function') {
        const u = new SpeechSynthesisUtterance('a'); u.volume = 0; u.lang = isEn ? 'en-US' : 'tr-TR'; u.rate = 2; const v = this.voiceSet ? this.voice : null; if (v) u.voice = v;
        const t0 = performance.now(); u.onstart = () => { const d = (performance.now() - t0) / 1000; if (d >= 0 && d < 2) this.ttsLead = Math.min(d, 0.6); };
        this.utter = [u]; u.onend = u.onerror = () => { this.utter = (this.utter || []).filter((x) => x !== u); }; S.speak(u);
      }
    } catch (e) { /* yok */ }
  }
  // sözcenin duyulmaya başlama gecikmesi (s): speak() ile onstart arası ölçülür (üssel ortalama). Geri sayım sayıları bu kadar ERKEN söyletilir ki
  // ses saniye tıkıyla aynı anda duyulsun (cinema.js tickAscent).
  get lead() { return Math.max(0, Math.min(0.8, this.ttsLead ?? 0.25)); }
  // görev kontrol anonsu (Web Speech): aynı anahtar bir kez; sessizse ya da tarayıcıda yoksa atlanır. urgent (geri sayım): önceki sözce hâlâ bekliyorsa
  // kuyruk boşaltılır (sayılar birikip kaymasın). Sözceler bitene dek saklanır: bazı tarayıcılar başvurusu kalmayan sözceyi atıp kuyruğu durdurur.
  // quindar: anonsun başında ve sonunda hat tonları.
  say(key, text, { urgent = false, quindar = !urgent } = {}) {
    if (this.muted || !this.ctx || this.spoken.has(key)) return; this.spoken.add(key);
    if (quindar) this.tone(2525, 0.25, 0.05);
    if (this.offline) { if (quindar) this.tone(2475, 0.25, 0.05, 1.6); return; }      // dışa aktarım: konuşma sentezi kaydedilemez (yalnız hat tonları)
    try {
      const S = window.speechSynthesis; if (!S || typeof SpeechSynthesisUtterance !== 'function') return;
      if (S.paused) S.resume();
      if (urgent && S.pending) S.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = isEn ? 'en-US' : 'tr-TR'; u.rate = urgent ? 1.2 : 1.04; u.pitch = 0.92; u.volume = 0.9;
      const v = this.pickVoice(); if (v) u.voice = v;
      this.utter = this.utter || []; this.utter.push(u);
      const t0 = performance.now();
      u.onstart = () => { const d = (performance.now() - t0) / 1000; if (d >= 0 && d < 2) this.ttsLead = this.ttsLead == null ? d : this.ttsLead + (d - this.ttsLead) * 0.5; };
      const done = () => { this.utter = (this.utter || []).filter((x) => x !== u); if (quindar && this.ctx && !this.muted) this.tone(2475, 0.25, 0.05); };
      u.onend = done; u.onerror = done;
      S.speak(u);
    } catch (e) { /* konuşma sentezi yok */ }
  }
}
