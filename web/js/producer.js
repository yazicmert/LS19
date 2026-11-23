// LS19 fragman yapımcılığı ("Yapımcı masası"): izleyicinin kendi fragman kurgusu.
//   · Kurgu (cut) düz bir nesnedir: künye (fragman adı, üst satır, yapımcı), bölümler (aç/kapa, başlık, alt yazı, anlatıcı notu, kamera, uzunluk),
//     görünüm (tempo, kadraj, film dokusu, vurgu rengi, yayın grafikleri) ve ses (müzik ruhu, anonslar, anlatıcı, efektler).
//   · Fizik hiç değişmez: yapımcı yalnız yönetmenin elindeki ipleri (hangi bölüm, hangi kamera, ne kadar, hangi söz) tutar; olayların sırası gerçek görev akışıdır.
//     Kapatılan bölümlerin süresi kararma altında hızla geçilir (cinema.js 'catch'), kayıt dışı hiçbir şey taklit edilmez.
//   · Kurgu tarayıcıda saklanır (localStorage) ve paylaşılabilir bağlantıya kodlanır (?kurgu=…, varsayılandan farklar, UTF-8 → base64url).
//   · Dışarıdan gelen her değer normalize() ile süzülür: bilinmeyen anahtarlar atılır, seçenekler listeden, metinler kırpılır (denetim karakteri yok, uzunluk sınırlı).
//     Metinler ekrana yalnız kaçışlanarak (esc) ya da textContent ile yazılır.
// Saf işlevler test/test_producer.js'te sınanır.

// bölüm grupları: çekim kimlikleri (cinema.js buildShots) → bölüm; body: omuz üstü kamerada arkadaki cisim (E Dünya, M Ay); asc: kalkış açılışı (çekim değil)
export const GROUPS = [
  { k: 'asc', name: 'Kalkış', ids: [], body: 'E', title: 'KALKIŞ' },
  { k: 'open', name: 'Açılış', ids: ['open'], body: 'E' },
  { k: 'uydu', name: 'Uydum', ids: ['sat-deploy'], body: 'E', fixedCam: true, title: 'UYDUM' },          // yalnız kullanıcı kendi uydusunu eklediyse (usersat.js); kamera uyduya bağlı
  { k: 'park', name: 'Park yörüngesi', ids: ['park-wide', 'park-close'], body: 'E' },
  { k: 'tli', name: "Ay'a transfer yakışı", ids: ['tli-ignite', 'tli-burn'], body: 'E' },
  { k: 'sep', name: 'Kademe ayrılması', ids: ['sep'], body: 'E' },
  { k: 'coast', name: "Ay'a yolculuk", ids: ['coast-a', 'coast-b', 'coast-b2', 'coast-c'], body: 'E', bodyOf: { 'coast-b2': 'M', 'coast-c': 'M' } },
  { k: 'loi', name: 'Ay yörüngesine giriş', ids: ['loi-approach', 'loi-burn'], body: 'M' },
  { k: 'llo', name: 'Ay yörüngesi', ids: ['llo'], body: 'M' },
  { k: 'sep2', name: 'İniş kademesi ayrılır', ids: ['sep2'], body: 'M' },
  { k: 'pdi', name: 'Motorlu iniş', ids: ['pdi', 'approach'], body: 'M' },
  { k: 'land', name: 'Temas', ids: ['touchdown'], body: 'M' },
  { k: 'outro', name: 'Kapanış', ids: ['outro'], body: 'M' },
];
export const GROUP_OF = Object.fromEntries(GROUPS.flatMap((g) => g.ids.map((id) => [id, g.k])));

// seçenekler (ilki varsayılan); etiketler arayüzde (producerui.js)
export const OPT = {
  cam: ['auto', 'close', 'orbit', 'ots', 'engine', 'wide', 'top', 'custom'],
  len: ['normal', 'short', 'long'],
  aspect: ['239', '185', 'full'],
  film: ['normal', 'off', 'light', 'strong'],
  accent: ['amber', 'ice', 'mint', 'rose', 'white'],
  mood: ['gizem', 'umut', 'gerilim', 'off'],
  // yazı
  hFont: ['exo', 'mono', 'cinzel', 'bebas', 'playfair', 'grotesk', 'rajdhani', 'serif', 'typewriter'],
  tFont: ['mono', 'exo', 'cinzel', 'bebas', 'playfair', 'grotesk', 'rajdhani', 'serif', 'typewriter'],
  hWeight: ['normal', 'light', 'bold'],
  track: ['normal', 'tight', 'wide'],
  ink: ['cream', 'white', 'gold', 'ice'],
  shade: ['normal', 'off', 'light', 'strong'],
  // yerleşim
  cardPos: ['bl', 'tl', 'tr', 'br', 'bc', 'c'],
  titlePos: ['c', 'top', 'bottom'],
  closePos: ['l', 'c', 'r'],
  cuePos: ['br', 'bl', 'bc', 'tc'],
  bugPos: ['tl', 'tr', 'off'],
  // renk
  grade: ['natural', 'warm', 'cool', 'teal', 'bw', 'sepia'],
  // bölüm
  pos: ['auto', 'bl', 'tl', 'tr', 'br', 'bc', 'c', 'none'],
  trans: ['auto', 'fade', 'cut', 'flash'],
  cMove: ['none', 'left', 'right', 'in', 'out', 'rise', 'orbit'],
};
export const LEN_K = { short: 0.6, normal: 1, long: 1.6 };
export const TEMPO = [0.5, 2];
// sayısal ayarlar: [alt, üst, adım]
export const RANGE = { tempo: [0.5, 2, 0.05], hSize: [0.6, 1.6, 0.05], tSize: [0.7, 1.5, 0.05], hold: [0.5, 2, 0.1],
  cAz: [-180, 180, 1], cEl: [-30, 85, 1], cDist: [12, 3000, 1], cFov: [12, 80, 1], cYaw: [-20, 20, 1], cShake: [0, 1, 0.05] };
export const ACCENTS = { amber: '#ffb35c', ice: '#8fd3ff', mint: '#7ee2b8', rose: '#ff8fa3', white: '#f3efe6' };
// yazı rengi: [ana, ikincil (soluk)]
export const INKS = { cream: ['#f3efe6', 'rgba(243, 239, 230, 0.74)'], white: ['#ffffff', 'rgba(255, 255, 255, 0.76)'], gold: ['#ffe2a8', 'rgba(255, 226, 168, 0.74)'], ice: ['#e4f3ff', 'rgba(228, 243, 255, 0.74)'] };
// yazı tipleri: CSS yığını ve (yerel değilse) Google Fonts ailesi; hepsinde Türkçe harfler (latin-ext) var. Exo ve Roboto Mono sayfayla yüklüdür, ötekiler seçilince yüklenir
export const FONTS = {
  exo: { css: '"Exo", system-ui, sans-serif' },
  mono: { css: '"Roboto Mono", ui-monospace, monospace' },
  cinzel: { css: '"Cinzel", Georgia, serif', g: 'Cinzel:wght@400;600;800' },
  bebas: { css: '"Bebas Neue", "Arial Narrow", sans-serif', g: 'Bebas+Neue' },
  playfair: { css: '"Playfair Display", Georgia, serif', g: 'Playfair+Display:wght@400;600;800' },
  grotesk: { css: '"Space Grotesk", system-ui, sans-serif', g: 'Space+Grotesk:wght@300;500;700' },
  rajdhani: { css: '"Rajdhani", "Arial Narrow", sans-serif', g: 'Rajdhani:wght@400;600;700' },
  serif: { css: 'Georgia, "Times New Roman", serif' },
  typewriter: { css: '"Courier New", Courier, monospace' },
};
export const WEIGHTS = { light: 400, normal: 600, bold: 800 };
export const TRACKS = { tight: 0.45, normal: 1, wide: 1.6 };
export const SHADES = { off: 0, light: 0.5, normal: 1, strong: 1.5 };
// film dokusu → post.js film geçişi (vinyet, tane, kromatik sapma); 'normal' post.js'in özgün değerleri
export const FILM_LOOK = { off: { vignette: 0, grain: 0, chroma: 0 }, light: { vignette: 0.28, grain: 0.02, chroma: 0.0008 }, normal: { vignette: 0.5, grain: 0.045, chroma: 0.0016 }, strong: { vignette: 0.72, grain: 0.09, chroma: 0.0028 } };
// renk düzeni → post.js film geçişi (doygunluk, renk süzgeci, sepya, sıcak/soğuk ayrımı, kontrast); 'natural' özgün değerler
export const GRADE = {
  natural: { sat: 1, tint: [1, 1, 1], sepia: 0, split: 0.6, contrast: 0.22 },
  warm: { sat: 1.06, tint: [1.07, 1.0, 0.88], sepia: 0, split: 0.6, contrast: 0.24 },
  cool: { sat: 0.94, tint: [0.9, 0.99, 1.1], sepia: 0, split: 0.6, contrast: 0.22 },
  teal: { sat: 1.14, tint: [1, 1, 1], sepia: 0, split: 1.8, contrast: 0.32 },
  bw: { sat: 0, tint: [1, 1, 1], sepia: 0, split: 0, contrast: 0.34 },
  sepia: { sat: 0, tint: [1, 1, 1], sepia: 1, split: 0, contrast: 0.26 },
};
export const filmLook = (cut) => ({ ...FILM_LOOK[cut.film] || FILM_LOOK.normal, ...GRADE[cut.grade] || GRADE.natural });
// metin sınırları (karakter)
export const MAX = { title: 24, over: 40, producer: 40, chTitle: 40, chSub: 90, narr: 160 };

// özel kamera varsayılanı (yönetmenin araç çevresi çekimlerine yakın): yatay açı ° (0 önden, 180 arkadan), yükseklik °, uzaklık m, görüş açısı °, hareket, kadraj kaydırma °, titreşim
const CAM0 = { cAz: 150, cEl: 12, cDist: 60, cFov: 34, cMove: 'left', cYaw: 0, cShake: 0.2 };
const CH0 = { on: true, title: '', sub: '', narr: '', cam: 'auto', len: 'normal', pos: 'auto', trans: 'auto', ...CAM0 };
export const DEFAULT_CUT = Object.freeze({
  v: 1, title: '', over: '', producer: '',
  tempo: 1, aspect: '239', film: 'normal', accent: 'amber', grade: 'natural',
  strip: true, timeline: true, cues: true, tags: true,
  mood: 'gizem', voice: true, narrate: true, sfx: true,
  hFont: 'exo', tFont: 'mono', hSize: 1, tSize: 1, hWeight: 'normal', track: 'normal', upper: true, ink: 'cream', shade: 'normal',
  cardPos: 'bl', titlePos: 'c', closePos: 'l', cuePos: 'br', bugPos: 'tl', chNum: true, hold: 1,
  ch: Object.freeze(Object.fromEntries(GROUPS.map((g) => [g.k, Object.freeze({ ...CH0 })]))),
});

// metin süzgeci: denetim karakterleri (satır sonu dahil) boşluğa, boşluklar teke, uçlar kırpılır, uzunluk sınırı (kod noktası; vekil çiftler bölünmez)
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');    // denetim, sıfır genişlikli ve yön değiştiren karakterler
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  const t = s.replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
  return [...t].slice(0, max).join('').trim();
}
const pick = (v, list) => (list.includes(v) ? v : list[0]);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

// sayı: aralığa sıkıştırılır ve adıma yuvarlanır; sayı değilse varsayılan
export function numIn(v, key, d) {
  const [lo, hi, st] = RANGE[key], x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(x)) return d;
  const q = Math.round(Math.max(lo, Math.min(hi, x)) / st) * st;
  return Math.round(q * 1000) / 1000;
}
const PICKS = ['aspect', 'film', 'accent', 'grade', 'mood', 'hFont', 'tFont', 'hWeight', 'track', 'ink', 'shade', 'cardPos', 'titlePos', 'closePos', 'cuePos', 'bugPos'];
const BOOLS = ['strip', 'timeline', 'cues', 'tags', 'voice', 'narrate', 'sfx', 'upper', 'chNum'];
const NUMS = ['tempo', 'hSize', 'tSize', 'hold'];

// dışarıdan gelen (saklanan ya da bağlantıdaki) kurgu → geçerli tam kurgu
export function normalize(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, D = DEFAULT_CUT;
  const out = { v: 1, title: cleanText(r.title, MAX.title), over: cleanText(r.over, MAX.over), producer: cleanText(r.producer, MAX.producer) };
  for (const k of NUMS) out[k] = numIn(r[k], k, D[k]);
  for (const k of PICKS) out[k] = pick(r[k] == null ? r[k] : String(r[k]), OPT[k]);
  for (const k of BOOLS) out[k] = bool(r[k], D[k]);
  out.ch = {};
  const rc = r.ch && typeof r.ch === 'object' && !Array.isArray(r.ch) ? r.ch : {};
  for (const g of GROUPS) {
    const c = rc[g.k] && typeof rc[g.k] === 'object' ? rc[g.k] : {};
    out.ch[g.k] = { on: bool(c.on, true), title: cleanText(c.title, MAX.chTitle), sub: cleanText(c.sub, MAX.chSub), narr: cleanText(c.narr, MAX.narr), cam: pick(c.cam, OPT.cam), len: pick(c.len, OPT.len),
      pos: pick(c.pos, OPT.pos), trans: pick(c.trans, OPT.trans),
      cAz: numIn(c.cAz, 'cAz', CAM0.cAz), cEl: numIn(c.cEl, 'cEl', CAM0.cEl), cDist: numIn(c.cDist, 'cDist', CAM0.cDist), cFov: numIn(c.cFov, 'cFov', CAM0.cFov),
      cMove: OPT.cMove.includes(c.cMove) ? c.cMove : CAM0.cMove, cYaw: numIn(c.cYaw, 'cYaw', CAM0.cYaw), cShake: numIn(c.cShake, 'cShake', CAM0.cShake) };
  }
  if (!GROUPS.some((g) => out.ch[g.k].on)) out.ch.land.on = out.ch.outro.on = true;      // boş fragman olmaz: hepsi kapatıldıysa temas ve kapanış kalır
  return Object.fromEntries(Object.keys(D).map((k) => [k, out[k]]));               // anahtar sırası varsayılanla aynı (karşılaştırma ve bağlantı kararlı)
}

// varsayılandan farklar (paylaşım bağlantısı kısa kalsın); diff(normalize(x)) → normalize ile geri tam kurgu
export function diff(cut) {
  const c = normalize(cut), D = DEFAULT_CUT, o = {};
  for (const k of Object.keys(D)) if (k !== 'ch' && k !== 'v' && c[k] !== D[k]) o[k] = c[k];
  const ch = {};
  for (const g of GROUPS) { const a = c.ch[g.k], b = D.ch[g.k], d = {}; for (const k of Object.keys(b)) if (a[k] !== b[k]) d[k] = a[k]; if (Object.keys(d).length) ch[g.k] = d; }
  if (Object.keys(ch).length) o.ch = ch;
  return o;
}
export const isDefault = (cut) => Object.keys(diff(cut)).length === 0;

// masa sekmelerine düşen genel ayarlar (sekme rozetinde "kaç ayar değişti")
export const TAB_FIELDS = {
  credits: ['title', 'over', 'producer'],
  type: ['hFont', 'tFont', 'hSize', 'tSize', 'hWeight', 'track', 'upper', 'ink', 'shade', 'cardPos', 'titlePos', 'closePos', 'cuePos', 'bugPos', 'chNum', 'hold'],
  look: ['tempo', 'aspect', 'film', 'grade', 'accent', 'strip', 'timeline', 'cues', 'tags', 'mood', 'voice', 'narrate', 'sfx'],
};
export const DEFAULT_CH = Object.freeze({ ...CH0 });
// bölüm varsayılandan farklı mı (özel kamera değerleri yalnız özel kamera seçiliyken sayılır)
export function chapterChanged(cut, k) {
  const c = normalize(cut).ch[k]; if (!c) return false;
  return Object.keys(CH0).some((f) => (f in CAM0 && c.cam !== 'custom' ? false : c[f] !== CH0[f]));
}
// sekme başına değişiklik sayısı: bölümler (değişen bölüm sayısı), isimler, yazılar, görüntü ve ses (değişen ayar sayısı)
export function changedCounts(cut) {
  const c = normalize(cut), D = DEFAULT_CUT, n = (keys) => keys.filter((k) => c[k] !== D[k]).length;
  return { ch: GROUPS.filter((g) => chapterChanged(c, g.k)).length, credits: n(TAB_FIELDS.credits), type: n(TAB_FIELDS.type), look: n(TAB_FIELDS.look) };
}

// geri al / yinele geçmişi: durumlar dize (JSON); aynı alanın art arda düzenlemeleri (yazı yazma, sürgü sürükleme) ms içinde tek adım sayılır;
// seal() birleştirmeyi bitirir (alandan çıkınca, sürgü bırakılınca): masa ms = ∞ ile kullanır, adımı alan değişimi ya da seal ayırır
export class History {
  constructor(limit = 80) { this.limit = limit; this.clear(); }
  clear() { this.past = []; this.future = []; this.lastKey = null; this.lastAt = -1e15; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  // değişiklikten ÖNCEKİ durumu kaydet; key: birleştirme anahtarı (null: her zaman ayrı adım)
  record(prev, key = null, now = Date.now(), ms = 1500) {
    if (key && key === this.lastKey && now - this.lastAt < ms) { this.lastAt = now; return false; }
    this.past.push(prev); if (this.past.length > this.limit) this.past.shift();
    this.future = []; this.lastKey = key; this.lastAt = now; return true;
  }
  seal() { this.lastKey = null; }
  undo(cur) { if (!this.past.length) return null; this.future.push(cur); this.lastKey = null; return this.past.pop(); }
  redo(cur) { if (!this.future.length) return null; this.past.push(cur); this.lastKey = null; return this.future.pop(); }
}

// UTF-8 ↔ base64url (tarayıcı ve Node 16+: btoa/atob, TextEncoder)
function b64u(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s) { const t = s.replace(/-/g, '+').replace(/_/g, '/'), bin = atob(t + '==='.slice((t.length + 3) % 4)); return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))); }
export const encodeCut = (cut) => b64u(JSON.stringify(diff(cut)));
// çözülemeyen ya da çok uzun (> 24 000 karakter; en uzun geçerli kurgu ~11 000) bağlantı → null (çağıran varsayılanı kullanır). Kurgu adresin # kısmındadır: sunucuya gitmez
export function decodeCut(s) {
  if (typeof s !== 'string' || !s || s.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try { return normalize(JSON.parse(unb64u(s))); } catch (e) { return null; }
}

// hazır kurgular: yapısal ayarları (bölüm aç/kapa, kamera, uzunluk, geçiş, görünüm, yazı, yerleşim, ses) değiştirir; künye ve bölüm metinleri ile özel kamera değerleri korunur
export const PRESETS = {
  director: { name: 'Yönetmenin kurgusu', set: {} },
  short: { name: 'Kısa kurgu', set: { tempo: 0.7, mood: 'gerilim', ch: { asc: { on: false }, park: { on: false }, sep: { on: false }, llo: { on: false }, sep2: { on: false }, coast: { len: 'short' }, pdi: { len: 'short' } } } },
  // sosyal medya (Reels, TikTok, Shorts): ~1 dk, tam kadraj (dikey dışa aktarıma uygun), yalnız doruk anları: transfer yakışı, Ay'a varış, iniş, temas
  reels: { name: 'Sosyal medya (dikey, ~1 dk)', set: { tempo: 0.6, aspect: 'full', mood: 'gerilim', hSize: 1.15, timeline: false, hold: 0.8,
    ch: { asc: { on: false }, park: { on: false }, sep: { on: false }, llo: { on: false }, sep2: { on: false }, uydu: { len: 'short' }, tli: { len: 'short', trans: 'flash' }, coast: { len: 'short' }, loi: { len: 'short' }, pdi: { len: 'short' }, outro: { len: 'short' } } } },
  doc: { name: 'Belgesel', set: { tempo: 1.4, film: 'light', mood: 'umut', hFont: 'grotesk', tFont: 'grotesk', upper: false, track: 'tight', cardPos: 'tl', cuePos: 'bc', hold: 1.4, ch: { coast: { len: 'long' }, llo: { len: 'long' }, pdi: { len: 'long' } } } },
  epic: { name: 'Destansı', set: { tempo: 1.15, aspect: '239', film: 'strong', grade: 'teal', mood: 'gerilim', hFont: 'cinzel', hSize: 1.2, track: 'wide', cardPos: 'c', titlePos: 'c', closePos: 'c', ink: 'gold', accent: 'amber',
    ch: { tli: { cam: 'engine', trans: 'flash' }, sep: { trans: 'flash' }, coast: { cam: 'wide' }, loi: { cam: 'ots' }, llo: { cam: 'orbit' }, land: { trans: 'cut' } } } },
  silent: { name: 'Saf görüntü', set: { film: 'strong', grade: 'bw', strip: false, timeline: false, cues: false, tags: false, voice: false, bugPos: 'off', chNum: false, hFont: 'playfair', cardPos: 'bc', closePos: 'c', ch: { tli: { cam: 'orbit' }, loi: { cam: 'ots' }, llo: { cam: 'close' } } } },
};
const STRUCT = Object.keys(DEFAULT_CUT).filter((k) => !['v', 'title', 'over', 'producer', 'ch'].includes(k));
const CH_STRUCT = ['on', 'cam', 'len', 'pos', 'trans'];
export function applyPreset(cut, key) {
  const p = PRESETS[key]; if (!p) return normalize(cut);
  const c = normalize(cut), D = DEFAULT_CUT, o = { ...c, ch: {} };
  for (const k of STRUCT) o[k] = p.set[k] !== undefined ? p.set[k] : D[k];
  for (const g of GROUPS) { const s = (p.set.ch && p.set.ch[g.k]) || {}, d = D.ch[g.k]; o.ch[g.k] = { ...c.ch[g.k] }; for (const f of CH_STRUCT) o.ch[g.k][f] = s[f] ?? d[f]; }
  return normalize(o);
}
// kurgu hangi hazır kurguyla yapısal olarak aynı (yoksa null)
export function presetOf(cut) {
  const c = normalize(cut);
  for (const k of Object.keys(PRESETS)) { const p = applyPreset(c, k); if (STRUCT.every((s) => p[s] === c[s]) && GROUPS.every((g) => CH_STRUCT.every((f) => p.ch[g.k][f] === c.ch[g.k][f]))) return k; }
  return null;
}

// kamera seçenekleri → cinema.js düzeneği (RIG); null: yönetmenin seçimi. ch: bölüm ayarları (özel kamera değerleri)
const RAD = Math.PI / 180;
// özel kameranın hareketi: başlangıç ve bitiş değerleri (yatay açı ve yükseklik derece, uzaklık metre)
export function camMove(ch) {
  const a = ch.cAz, e = ch.cEl, d = ch.cDist, m = ch.cMove;
  const A = { left: [a, a - 40], right: [a, a + 40], orbit: [a, a + 360] }[m] || [a, a];
  const El = m === 'rise' ? [e, Math.min(85, e + 30)] : [e, e];
  const Dd = m === 'in' ? [d, Math.max(RANGE.cDist[0], d * 0.55)] : m === 'out' ? [d, Math.min(RANGE.cDist[1], d * 1.9)] : [d, d];
  return { az: A, el: El, dist: Dd };
}
export function camRig(cam, body = 'E', ch = CAM0) {
  if (cam === 'close') return { type: 'lvlh', az: [2.3, 3.1], el: [0.16, 0.24], dist: [0.05, 0.04], fov: [32, 30], look: 'mid' };
  if (cam === 'orbit') return { type: 'lvlh', az: [0.4, 0.4 + 1.25 * Math.PI], el: [0.3, 0.12], dist: [0.075, 0.06], fov: [36, 34], look: 'mid' };    // araç çevresinde yarım turdan fazla dönen kamera
  if (cam === 'ots') return { type: 'ots', body, dist: [72, 88], side: [30, 38], lift: [12, 16], aim: 0.06, fov: [32, 36], look: 'mid' };
  if (cam === 'engine') return { type: 'body', ref: 'engine', eye: [[7, -3.5, -14], [10, -2.5, -20]], tgt: [[0, 0, 4], [0, 0, 2]], fov: [30, 36], up: 'body' };     // gövde çerçevesinde motor çıkışı (yakışsız bölümde de)
  if (cam === 'wide') return { type: 'wideBody', body, fov: 42 };                                    // Dünya ya da Ay bütünüyle, Güneş'in aydınlattığı yüz
  if (cam === 'top') return { type: 'lvlh', az: [0.3, 0.9], el: [1.42, 1.38], dist: [0.09, 0.07], fov: [34, 32], look: 'mid' };   // tepeden, yerel dikeyden
  if (cam === 'custom') {
    const m = camMove(ch);
    return { type: 'lvlh', az: m.az.map((v) => v * RAD), el: m.el.map((v) => v * RAD), dist: m.dist.map((v) => v / 1000), fov: [ch.cFov, ch.cFov], look: 'mid', yaw: ch.cYaw * RAD };
  }
  return null;
}

// çekim listesine (cinema.js buildShots) kurguyu uygula: kapalı bölümler çıkar, uzunluk, kamera ve metin ayarları çekimlere yazılır.
// Çıkarılan bir çekimin ardından gelen çekim afterCut taşır: yönetmen aradaki benzetim süresini kararma altında hızla geçer (durum güdümlü çekimlerde de).
export function applyCut(shots, cut) {
  const c = normalize(cut), out = [], seen = new Set(); let cut0 = false;
  const by = Object.fromEntries(GROUPS.map((g) => [g.k, g]));
  for (const s0 of shots) {
    const k = GROUP_OF[s0.id], g = by[k], ch = k ? c.ch[k] : CH0;
    if (k && !ch.on) { cut0 = true; continue; }
    const s = { ...s0, grp: k || null };
    if (cut0) { s.afterCut = true; cut0 = false; }
    s.dur = s0.dur * LEN_K[ch.len];
    const rig = g && !g.fixedCam ? camRig(ch.cam, (g.bodyOf && g.bodyOf[s.id]) || g.body, ch) : null;
    if (rig) {
      s.rig = rig; delete s.rigs; s.userCam = ch.cam; if (ch.cam === 'custom') s.shake = ch.cShake;
      // geniş kamerada yörünge izi, anlık elips ve araç ışıltısı; yakın kameralarda yok (iz çizgileri aracın içinden geçmesin), cisim etiketleri yalnız geniş çekimde
      const wide = ch.cam === 'wide'; s.lines = wide; s.osc = wide; s.beacon = wide; s.syn = wide && g.k === 'coast'; s.tags = wide && g.k === 'coast';     // yolculukta geniş: Dünya–Ay sistemi, dönen çerçevede iz ve etiketler
    }
    // geçiş: kararma (dip), kesme (doğrudan), beyaz parlama; yalnız bölümün ilk çekimine (bölüm içi geçişler yönetmenin)
    if (k && !seen.has(k) && ch.trans !== 'auto') { s.dip = ch.trans === 'fade'; s.flashIn = ch.trans === 'flash'; }
    if (ch.pos !== 'auto') s.cardPos = ch.pos;
    if (s0.chapter) s.chapter = { ...s0.chapter, ...(ch.title ? { title: ch.title, user: true } : {}), ...(ch.sub ? { sub: ch.sub, userSub: true } : {}) };
    if (s0.card) s.card = { ...s0.card, ...(ch.title ? { title: ch.title, user: true } : c.title ? { title: c.title, user: true } : {}), ...(ch.sub ? { sub: ch.sub, userSub: true } : {}) };
    if (ch.narr && k && !seen.has(k)) s.narr = ch.narr;                              // anlatıcı notu bölümün ilk çekiminde bir kez
    if (k) seen.add(k);
    out.push(s);
  }
  return out;
}

// seçilen yazı tiplerini yükle (Google Fonts; yalnız seçilince, bir kez). Yüklenemezse CSS yığınındaki yerel yazı tipi kullanılır. Tarayıcı dışında bir şey yapmaz
const loadedFonts = new Set();
export function loadFonts(keys) {
  if (typeof document === 'undefined') return Promise.resolve();
  const fams = [...new Set(keys)].map((k) => FONTS[k]).filter((f) => f && f.g && !loadedFonts.has(f.g));
  if (fams.length) {
    for (const f of fams) loadedFonts.add(f.g);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?' + fams.map((f) => 'family=' + f.g).join('&') + '&display=swap'; document.head.appendChild(l);
  }
  // hazır olmasını kısa süre bekle (başlık kartı yedek yazı tipiyle başlayıp sonra sıçramasın); en çok 1,5 s
  const fams2 = [...new Set(keys)].map((k) => FONTS[k]).filter((f) => f && f.g);
  if (!fams2.length || !document.fonts || !document.fonts.load) return Promise.resolve();
  const name = (f) => f.css.split(',')[0];
  return Promise.race([Promise.all(fams2.map((f) => document.fonts.load(`600 32px ${name(f)}`, 'ĞŞİçö').catch(() => null))), new Promise((r) => setTimeout(r, 1500))]);
}

// HTML kaçışı (bölüm kartları innerHTML ile kurulur)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// saklama (tarayıcı): bozuk/eksik kayıt → varsayılan
const LS_KEY = 'ls19.cineCut';
export function loadCut() { try { const s = localStorage.getItem(LS_KEY); return s ? normalize(JSON.parse(s)) : normalize({}); } catch (e) { return normalize({}); } }
export function saveCut(cut) { try { localStorage.setItem(LS_KEY, JSON.stringify(diff(cut))); return true; } catch (e) { return false; } }
