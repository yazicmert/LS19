// Arayüz dili (Türkçe | İngilizce). Kaynak dil Türkçedir: kod ve index.html Türkçe yazılır, İngilizce karşılıklar tek sözlükte durur
// (js/i18n/en.js; anahtar = Türkçe metin). Anahtar biçimi: boşluklar tek boşluğa indirilmiş, uçları kırpılmış metin; değişen kısımlar {0}, {1}…
// (örn. "{0} milyon km" → "{0} million km"; İngilizcede yer tutucuların sırası değişebilir).
//
// Çeviri üç yoldan uygulanır:
//  1) DOM çevirmeni (installDom): sayfadaki metin düğümleri ve title/aria-label/placeholder/alt öznitelikleri, değiştikçe (MutationObserver).
//     Modüller Türkçe yazmaya devam eder; ekrana çıkan metin çevrilir. JS değerleri ve mantık değişmez (yalnız görünen metin).
//     Önce tam eşleşme, sonra yer tutuculu kalıplar (yakalanan kısımlar da özyinelemeli çevrilir: "Kalan {0}" + "{0} gün").
//     Sayıları farklı aynı biçimdeki metinler (telemetri) "şekil" önbelleğiyle tek aramada çözülür. Bütünün karşılığı yoksa
//     " · " / " — " parçaları, cümleler ve parantez içi ayrı ayrı denenir. Aynı sözcüğün başka anlamı için öğe data-en taşır.
//  2) t(): DOM'a gitmeyen metinler (tuval çizimleri, toast/başlık gibi elle kurulanlar) ve yer tutucu doldurma.
//  3) LOC, yön harfleri, ay adları: sayı/tarih biçimi (tr-TR / en-US), K/G/D/B ↔ N/S/E/W.
//  Tuval yazıları (fillText/strokeText/measureText) İngilizcede aynı sözlükle çevrilir.
// Dil seçimi: ?lang=en|tr (hatırlanır) → localStorage 'ls19.lang' → tarayıcı dili (tr* ise Türkçe, değilse İngilizce).
// index.html'deki erken betik aynı kuralla window.LS19_LANG'i kurar ve İngilizcede sayfayı çeviri bitene dek gizler (i18n-wait).
// Worker'lar dili adlarından alır (workerOpts: name = 'ls19:<dil>'). Node'da (testler, araçlar) dil Türkçedir.
// Sözlük kapsamı: tools/i18n_cikar.mjs metinleri çıkarır, test/test_i18n.js eksik/bozuk çeviri bırakmaz.

export const LANGS = ['tr', 'en'];
const KEY = 'ls19.lang';

function detect() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof window === 'undefined') {
    const nm = typeof self !== 'undefined' && typeof self.name === 'string' ? self.name : '';
    return nm.startsWith('ls19:') && LANGS.includes(nm.slice(5)) ? nm.slice(5) : 'tr';
  }
  if (LANGS.includes(g.LS19_LANG)) return g.LS19_LANG;
  try { const q = new URLSearchParams(location.search).get('lang'); if (LANGS.includes(q)) return q; } catch { /* yok */ }
  try { const s = localStorage.getItem(KEY); if (LANGS.includes(s)) return s; } catch { /* gizli pencere */ }
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'tr';
  return /^tr\b/i.test(nav) ? 'tr' : 'en';
}

export const lang = detect();
export const LOC = lang === 'en' ? 'en-US' : 'tr-TR';
export const isEn = lang === 'en';
export const workerOpts = () => ({ type: 'module', name: 'ls19:' + lang });

// dili değiştir: hatırla ve sayfayı yeniden yükle (modüller dili açılışta bir kez okur)
export function setLang(l) {
  if (!LANGS.includes(l) || typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, l); } catch { /* yok */ }
  const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href);
}

// yön harfleri
const DIRS = isEn ? { N: 'N', S: 'S', E: 'E', W: 'W' } : { N: 'K', S: 'G', E: 'D', W: 'B' };
export const ns = (lat) => (lat >= 0 ? DIRS.N : DIRS.S);
export const ew = (lon) => (lon >= 0 ? DIRS.E : DIRS.W);
const COMPASS = isEn
  ? ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  : ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
export const compass16 = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
// ay adları ve süre biçimindeki gün harfi ("4g 06:32:06" / "4d 06:32:06")
export const MONTHS = isEn
  ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTHS_SHORT = isEn
  ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  : ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const DAY = isEn ? 'd' : 'g';
// süre birimleri ("1 sa 50 dk" / "1 h 50 min")
export const UNIT = isEn ? { d: 'd', h: 'h', min: 'min' } : { d: 'g', h: 'sa', min: 'dk' };

// ---------------------------------------------------------------- anahtar yardımcıları (araç ve testlerle ortak)
export const normKey = (s) => String(s).replace(/\s+/g, ' ').trim();
// Türkçe metin mi? Türkçeye özgü harf ya da sık Türkçe sözcük (tools/i18n_cikar.mjs ve test/test_i18n.js aynı kuralı kullanır)
const TR_CHARS = /[çğışöüÇĞİŞÖÜ]/;
const TR_WORDS = new Set(('ve ile bir bu da de en ya yok var ama gibi kadar sonra once ilk tam yeni eski kapat kapali acik ac sec secin goster gizle ' +
  'tarih saat dakika saniye yil ay hafta hata durum konum hiz irtifa kutle yakit itki gaz kademe arac roket yorunge inis kalkis gorev uydu ' +
  'asteroit dunya gunes gezegen uzaklik kalan sonraki onceki yakin uzak yuksek alcak buyuk kucuk orta toplam ortalama yaklasik olasilik ' +
  'kaynak kaynaklar veri yukleniyor hesapla hesaplaniyor tasarla baslat durdur devam tekrar sifirla ileri geri ust alt sol sag bak izle takip ' +
  'tamam iptal evet hayir bilgi ayrinti ayrintilar modeli yer yeri nokta noktasi ekseni zaman zamani tur tasarim profil profili ozel ' +
  'deney laboratuvar canli gokyuzu gozlemci sehir pencere pencereyi firlatma rampa rampasi kule hava ruzgar bulut yagmur sicaklik basinc ' +
  'olarak icin olan olur olmaz degil daha cok az her hic hep simdi bugun yarin dun gece gun ' +
  'sapma saptirma carpma cisim cisimler kayit listesi liste ara bul yolu yol yollar sure suresi deger degeri oran orani ' +
  'kapsama gecis gecisler ufuk ufkun dogus batis gorunur gorunmez sinir siniri ayar ayarlar secenek secenekler ' +
  'potansiyel tehlikeli kesen kentaur kip denklemi hiperbolde zamanlama bin milyon rusya kazakistan japonya hindistan brezilya avustralya cezayir ' +
  'hedefleniyor gerekmedi emekli boy vakum serisi ikizi konumum').split(' '));
export const fold = (w) => w.replace(/İ/g, 'I').toLowerCase().replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
export function isTurkish(s) {
  if (TR_CHARS.test(s)) return true;
  const words = s.match(/[A-Za-zÀ-ÿ]{2,}/g);
  return !!(words && words.some((w) => TR_WORDS.has(fold(w))));
}

// ---------------------------------------------------------------- sözlük ve çevirmen
let EXACT = null;                    // Map: anahtar → karşılık
let PATS = [];                       // yer tutuculu kalıplar (uzun sabit metinli olan önce)
let DIGIT_PATS = [];                 // sabit metninde rakam olan kalıplar (şekil önbelleği bunları dışarıda bırakmasın)
const SHAPE = new Map();             // sayıları '#' yapılmış metin → kalıp sırası (−1: yok)
const SHAPE_MAX = 20000;
const PH = /\{(\d+)\}/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// sözlüğü kur (tarayıcıda en.js'ten; testlerde elle)
export function useDictionary(dict) {
  EXACT = new Map(); PATS = []; DIGIT_PATS = []; SHAPE.clear();
  if (!dict) { EXACT = null; return; }
  const entries = Object.entries(dict).filter(([, v]) => typeof v === 'string').map(([k, v]) => [normKey(k), v]);
  const have = new Set(entries.map(([k]) => k));
  // "· parça" biçimli anahtarlar " · " ile bölünmüş metinde öneksiz de bulunsun
  for (const [k, v] of [...entries]) if (k.startsWith('· ') && v.startsWith('· ') && !have.has(k.slice(2))) { entries.push([k.slice(2), v.slice(2)]); have.add(k.slice(2)); }
  for (const [k, v] of entries) {
    EXACT.set(k, v);
    if (!/\{\d+\}/.test(k)) continue;
    const lits = k.split(/\{\d+\}/), litLen = lits.join('').replace(/[^\p{L}]/gu, '').length;
    if (litLen < 2) continue;                                   // "{0}" ya da "{0} {1}" gibi her şeyi yakalayan kalıp kurulmaz
    const order = [...k.matchAll(PH)].map((m) => +m[1]);
    const re = new RegExp('^' + lits.map(esc).join('(.*?)') + '$', 'u');      // yer tutucu boş da olabilir ("…fırlatma{3})")
    const lit = lits.reduce((a, b) => (b.length > a.length ? b : a), '');
    const p = { re, en: v, order, lit, len: lits.join('').length, digits: /\d/.test(lits.join('')) };
    PATS.push(p);
  }
  PATS.sort((a, b) => b.len - a.len);
  PATS.forEach((p, i) => { p.i = i; if (p.digits) DIGIT_PATS.push(p); });
}
export const hasDictionary = () => !!EXACT;

function findPattern(core, list = PATS) {
  for (const p of list) if (core.includes(p.lit) && p.re.test(core)) return p.i;
  return -1;
}
function fill(p, core, depth) {
  const m = p.re.exec(core); if (!m) return null;
  const cap = {}; p.order.forEach((n, gi) => { cap[n] = m[gi + 1]; });
  return p.en.replace(PH, (s, n) => (n in cap ? translateText(cap[n], depth + 1) : s));
}
function translateCore(core, depth) {
  const ex = EXACT.get(core); if (ex !== undefined) return ex;
  const pc = /^%([\d.,]+)$/.exec(core); if (pc) return pc[1] + '%';            // "%12" → "12%"
  if (depth > 4 || !/\p{L}\p{L}/u.test(core) || !PATS.length) return core;
  const shape = core.replace(/\d+/g, '#');
  let i = SHAPE.get(shape);
  if (i === undefined) {
    i = findPattern(core);
    if (SHAPE.size >= SHAPE_MAX) SHAPE.clear();
    SHAPE.set(shape, i);
  }
  if (i < 0 && DIGIT_PATS.length) i = findPattern(core, DIGIT_PATS);
  if (i < 0) return joined(core, depth);
  let r = fill(PATS[i], core, depth);
  if (r === null) { const j = findPattern(core); if (j < 0) return core; r = fill(PATS[j], core, depth); }
  return r ?? core;
}
// Bütünün karşılığı yoksa parçalara bölüp dene (her parça yine tam/kalıp/bölme sırasından geçer):
//  " · ", " — " ya da ": " ile birleşen parçalar ("İki kademe · Optimal", "TLI kademesi: 6.200 kg"), ardışık cümleler, "baş (parantez içi)".
const SEPS = [' · ', ' — '];
const SENT = /(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9"“(])/u;
function joined(core, depth) {
  if (depth > 4) return core;
  const each = (parts, glue) => { const out = parts.map((x) => translateText(x, depth + 1)); return out.some((x, k) => x !== parts[k]) ? out.join(glue) : null; };
  for (const sep of SEPS) if (core.includes(sep)) { const r = each(core.split(sep), sep); if (r) return r; }
  const sent = core.split(SENT); if (sent.length > 1) { const r = each(sent, ' '); if (r) return r; }
  const ci = core.indexOf(': '); if (ci > 0) { const r = each([core.slice(0, ci), core.slice(ci + 2)], ': '); if (r) return r; }   // "etiket: değer"
  const m = /^(.+?) (\([^()]+\))$/.exec(core);
  if (m) { const a = translateText(m[1], depth + 1); let b = translateText(m[2], depth + 1); if (b === m[2]) b = `(${translateText(m[2].slice(1, -1), depth + 1)})`; if (a !== m[1] || b !== m[2]) return `${a} ${b}`; }
  return core;
}
// metni çevir (uçlardaki boşluklar korunur); sözlük yoksa ya da karşılık yoksa aynısı
export function translateText(text, depth = 0) {
  if (!EXACT || typeof text !== 'string') return text;
  const core = normKey(text); if (!core) return text;
  const r = translateCore(core, depth);
  if (r === core) return text;
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  return lead + r + trail;
}
// açık çeviri + yer tutucu doldurma: t('{0} gün', 5) → "5 days" (Türkçede "5 gün")
export function t(s, ...args) {
  const out = translateText(s);
  return args.length ? out.replace(PH, (m, n) => (+n < args.length ? String(args[+n]) : m)) : out;
}

// ---------------------------------------------------------------- DOM çevirmeni
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'svg', 'SVG']);
const LETTERS = /\p{L}/u;
function skipEl(el) { return SKIP.has(el.tagName) || el.getAttribute('translate') === 'no'; }
function trText(n) {
  const v = n.nodeValue; if (!v) return;
  const p = n.parentElement;
  // aynı Türkçe sözcüğün başka anlamı ("Etkin": kuvvet tablosunda Effective, roket durumunda Active): öğe kendi karşılığını data-en ile verir
  if (p && p.dataset && p.dataset.en && p.childNodes.length === 1) { if (v !== p.dataset.en) n.nodeValue = p.dataset.en; return; }
  if (!LETTERS.test(v) && !v.includes('%')) return;
  if (p && (skipEl(p) || p.closest('[translate="no"]'))) return;
  const o = translateText(v); if (o !== v) n.nodeValue = o;
}
function trAttrs(el) {
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v && LETTERS.test(v)) { const o = translateText(v); if (o !== v) el.setAttribute(a, o); } }
}
export function translateTree(root) {
  if (!EXACT || !root) return;
  if (root.nodeType === 3) { trText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (skipEl(root)) return; trAttrs(root); }
  const doc = root.ownerDocument || root;
  const w = doc.createTreeWalker(root, 5 /* ELEMENT | TEXT */, { acceptNode: (n) => (n.nodeType === 1 && skipEl(n) ? 2 /* REJECT */ : 1) });
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
}
let observer = null;
export function installDom(doc = document) {
  if (!EXACT || observer) return;
  translateTree(doc.body);
  if (doc.title) doc.title = translateText(doc.title);
  for (const m of doc.querySelectorAll('meta[name="description"], meta[property^="og:"]')) { const c = m.getAttribute('content'); if (c) m.setAttribute('content', translateText(c)); }
  observer = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'characterData') trText(r.target);
      else if (r.type === 'attributes') { if (r.target.nodeType === 1 && !skipEl(r.target)) trAttrs(r.target); }
      else for (const n of r.addedNodes) translateTree(n);
    }
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// tuval yazıları (grafik eksenleri, B-düzlemi, faz düzlemi, sahne etiketleri): fillText/strokeText/measureText çevrilmiş metinle çalışır
function patchCanvas(proto) {
  if (!proto || proto.__ls19i18n) return;
  for (const m of ['fillText', 'strokeText', 'measureText']) {
    const orig = proto[m]; if (typeof orig !== 'function') continue;
    proto[m] = function (text, ...rest) { return orig.call(this, typeof text === 'string' ? translateText(text) : text, ...rest); };
  }
  proto.__ls19i18n = true;
}

// ---------------------------------------------------------------- tarayıcıda açılış: İngilizcede sözlüğü yükle, sayfayı çevir, gizlemeyi kaldır
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  if (isEn) {
    try {
      useDictionary((await import('./i18n/en.js')).default); installDom(document);
      patchCanvas(globalThis.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype);
      patchCanvas(globalThis.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype);
    }
    catch (e) { console.warn('LS19: çeviri yüklenemedi', e); }
  }
  document.documentElement.classList.remove('i18n-wait');
}
