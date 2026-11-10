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
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
export function chordFreqs(i) { const [root, iv] = CHORDS[((i % CHORDS.length) + CHORDS.length) % CHORDS.length]; return iv.map((d) => midiHz(root + d)); }
// motor sesi: gaz (0..1), zaman hızı, atmosferde mi (kalkış) → { gain, cutoff (Hz), crackle (0..1) }. Zaman hızı ×60'ın üstünde söner (×200'de sessiz).
export function engineLevel(thr, warp = 1, air = false) {
  const t = Math.max(0, Math.min(1, thr || 0)), fade = warp <= 60 ? 1 : warp >= 200 ? 0 : 1 - (warp - 60) / 140;
  if (t <= 0.005 || fade <= 0) return { gain: 0, cutoff: 120, crackle: 0 };
  const gain = (air ? 0.55 + 0.35 * t : 0.1 + 0.16 * t) * fade;
  return { gain, cutoff: air ? 260 + 900 * t : 90 + 260 * t, crackle: air ? 0.35 * t * fade : 0 };
}

const LS_KEY = 'ls19.cineMute';
export class CineAudio {
  constructor() { this.ctx = null; this.muted = false; try { this.muted = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* özel pencere */ } this.chord = -1; this.spoken = new Set(); }
  get ok() { return !!this.ctx; }
  start() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || this.ctx) return;
    const c = this.ctx = new AC(), now = c.currentTime;
    // ana yol: ana kazanç → sıkıştırıcı → çıkış
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(c.destination);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, now, 0.8);
    // yankı: üretilmiş dürtü yanıtı (üstel sönen gürültü, 3,2 s) — müzik ve çanlar geniş bir odada
    const rev = c.createConvolver(); rev.buffer = this.impulse(3.2); const wet = c.createGain(); wet.gain.value = 0.55; rev.connect(wet); wet.connect(this.master);
    // müzik: dört ses (üçgen + bir oktav üstü sinüs, hafif akort farkı) + alt bas → süzgeç (LFO) → kazanç → kuru + yankı
    this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master); this.music.connect(rev);
    const lp = this.musicLp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.5; lp.connect(this.music);
    const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 0.045; lfoG.gain.value = 180; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const fs0 = chordFreqs(0);
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
    this.music.gain.setTargetAtTime(0.3, now, 2.5);
    // çanlar: akorun seslerinden seyrek, yumuşak notalar (sinüs, 2,6 s sönüm) yankıya; müziğe hareket verir
    this.bellOut = c.createGain(); this.bellOut.gain.value = 0.5; this.bellOut.connect(rev); const bd = c.createGain(); bd.gain.value = 0.25; this.bellOut.connect(bd); bd.connect(this.master);
    this.bellN = 0; this.bellTimer = setInterval(() => this.bell(), 2300);
    // motor: döngülü kahverengi gürültü → alçak geçiren → kazanç; çatırtı: aynı gürültü → yüksek geçiren → kazanç (rastgele genlik)
    const noise = this.noiseBuffer(4);
    const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
    this.engLp = c.createBiquadFilter(); this.engLp.type = 'lowpass'; this.engLp.frequency.value = 120; this.engLp.Q.value = 0.9;
    this.eng = c.createGain(); this.eng.gain.value = 0; src.connect(this.engLp); this.engLp.connect(this.eng); this.eng.connect(this.master);
    const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900; hp.Q.value = 0.6;
    this.crk = c.createGain(); this.crk.gain.value = 0; src.connect(hp); hp.connect(this.crk); this.crk.connect(this.master);
    src.start(); this.src = src;
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
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const k = this.bellN++; if (k % 5 === 4) return;
    const fs = chordFreqs(Math.max(0, this.chord)), f = fs[[0, 2, 1, 3, 2][k % 5]] * (k % 3 === 0 ? 4 : 2), t = c.currentTime + 0.05;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.085, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
    o.connect(g); g.connect(this.bellOut); o.start(t); o.stop(t + 2.7);
  }
  // kısa ton (görev kontrol hattı): Quindar giriş 2525 Hz / çıkış 2475 Hz (250 ms), geri sayım tıkı
  tone(f, dur = 0.25, gain = 0.07, delay = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.setValueAtTime(gain, t + dur - 0.012); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  // geri sayım tıkı: her saniyede kısa bip, kalkışta uzun ve bir oktav üstü (konuşma sentezi olmasa da geri sayım duyulur)
  tick(last = false) { this.tone(last ? 1320 : 660, last ? 0.5 : 0.09, last ? 0.11 : 0.09); }
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
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* yok */ }
    this.master.gain.setTargetAtTime(0, c.currentTime, 0.25);
    this.ctx = null; setTimeout(() => c.close(), 1200);
  }
  setMuted(on) {
    this.muted = !!on; try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch (e) { /* özel pencere */ }
    if (this.ctx) { this.master.gain.setTargetAtTime(on ? 0 : 0.8, this.ctx.currentTime, 0.15); if (!on && this.ctx.state === 'suspended') this.ctx.resume(); }
    if (on) { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* yok */ } }
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
    this.chord = i; const t = c.currentTime, fs = chordFreqs(i);
    this.voices.forEach((v, k) => { v.o1.frequency.setTargetAtTime(fs[k], t, 0.9); v.o2.frequency.setTargetAtTime(fs[k] * 2, t, 0.9); });
    this.sub.frequency.setTargetAtTime(fs[0] / 2, t, 1.2);
    const f = this.musicLp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.linearRampToValueAtTime(1300, t + 1.2); f.linearRampToValueAtTime(620, t + 4.5);
    this.music.gain.setTargetAtTime(0.4, t, 0.6); this.music.gain.setTargetAtTime(0.3, t + 2.5, 1.5);
  }
  // ayrılma: boğuk çarpma (alçak sinüs ve gürültü patlaması, hızlı sönüm)
  thump() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.8);
    const n = c.createBufferSource(), ng = c.createGain(), lp = c.createBiquadFilter(); n.buffer = this.src.buffer; lp.type = 'lowpass'; lp.frequency.value = 600;
    ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45); n.connect(lp); lp.connect(ng); ng.connect(this.master); n.start(t, Math.random() * 2); n.stop(t + 0.5);
  }
  // temas ışığı: iki kısa bip
  beep() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    for (const d of [0, 0.22]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 1180; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.16, t + d + 0.01); g.gain.setValueAtTime(0.16, t + d + 0.12); g.gain.linearRampToValueAtTime(0, t + d + 0.14); o.connect(g); g.connect(this.master); o.start(t + d); o.stop(t + d + 0.16); }
  }
  // görev kontrol anonsu (Web Speech): aynı anahtar bir kez; sessizse ya da tarayıcıda yoksa atlanır. urgent (geri sayım): bekleyen anons varsa kuyruk boşaltılır
  // (sayılar birikip gecikmesin). Sözceler bitene dek saklanır: bazı tarayıcılar başvurusu kalmayan sözceyi çöpe atıp kuyruğu durdurur (yalnız ilk sayı duyulurdu).
  // quindar: anonsun başında ve sonunda hat tonları.
  say(key, text, { urgent = false, quindar = !urgent } = {}) {
    if (this.muted || !this.ctx || this.spoken.has(key)) return; this.spoken.add(key);
    if (quindar) this.tone(2525, 0.25, 0.05);
    try {
      const S = window.speechSynthesis; if (!S || typeof SpeechSynthesisUtterance !== 'function') return;
      if (S.paused) S.resume();
      if (urgent && (S.pending || S.speaking)) S.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = isEn ? 'en-US' : 'tr-TR'; u.rate = urgent ? 1.15 : 1.04; u.pitch = 0.92; u.volume = 0.9;
      const v = S.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(isEn ? 'en' : 'tr')); if (v) u.voice = v;
      this.utter = this.utter || []; this.utter.push(u);
      const done = () => { this.utter = (this.utter || []).filter((x) => x !== u); if (quindar && this.ctx && !this.muted) this.tone(2475, 0.25, 0.05); };
      u.onend = done; u.onerror = done;
      S.speak(u);
    } catch (e) { /* konuşma sentezi yok */ }
  }
}
