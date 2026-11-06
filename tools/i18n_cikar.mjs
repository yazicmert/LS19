// Arayüz metinlerini çıkarır: web/index.html (metin düğümleri ve title/aria-label/placeholder/alt/data-short/data-empty) ve
// web/js/*.js (dize ve şablon değişmezleri, '+' ile birleştirilen dizeler). Çıktı, çeviri sözlüğünün (web/js/i18n/en.js) anahtar kümesidir.
// Anahtar biçimi web/js/i18n.js ile aynıdır: boşluklar tek boşluğa indirilir, uçlar kırpılır; şablondaki her ${…} yerine sırayla {0}, {1}…;
// HTML içeren dizeler etiketlerden bölünür (tarayıcıda her parça ayrı metin düğümü olur).
// JS'te yalnız Türkçe olduğu anlaşılan metinler alınır (Türkçe harf ya da sık Türkçe sözcük); index.html'de harf içeren her metin. Yorumlar, içe aktarma yolları, nesne anahtarları ve
// console.* argümanları alınmaz.
// Kullanım: node tools/i18n_cikar.mjs            → anahtarları JSON olarak yazar (dosya → anahtar listesi)
//           node tools/i18n_cikar.mjs --eksik    → sözlükte karşılığı olmayan anahtarlar
// test/test_i18n.js aynı işlevi (extractKeys) kullanır.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as espree from 'espree';
import { normKey, isTurkish as isTurkishBase, fold } from '../web/js/i18n.js';
import EN from '../web/js/i18n/en.js';

// Türkçe sezgisi: Türkçe harf / sık sözcük (js/i18n.js) ya da sözlüğün Türkçe anahtarlarında geçip İngilizce karşılıklarında geçmeyen bir sözcük
// ("Periyot", "Motor", "Pay"). Böylece Türkçe harfsiz metinler de yakalanır; sözlük büyüdükçe sezgi de güçlenir.
const words = (s) => (s.match(/[A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]{3,}/g) || []).map(fold);
const EN_WORDS = new Set(Object.values(EN).flatMap(words));
const TR_VOCAB = new Set(Object.keys(EN).flatMap(words).filter((w) => !EN_WORDS.has(w)));
export const isTurkish = (k) => isTurkishBase(k) || words(k).some((w) => TR_VOCAB.has(w));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
// Ekranda görünmeyen ya da tarayıcıya hiç gitmeyen modüller (Node araçları, worker iç günlükleri) çıkarılmaz
const SKIP_FILES = new Set(['i18n.js']);

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&hellip;': '…', '&mdash;': '—', '&ndash;': '–', '&thinsp;': ' ', '&middot;': '·', '&times;': '×', '&minus;': '−', '&rarr;': '→', '&larr;': '←', '&ldquo;': '“', '&rdquo;': '”', '&lsquo;': '‘', '&rsquo;': '’', '&laquo;': '«', '&raquo;': '»' };
const decode = (s) => s.replace(/&[a-z]+;|&#\d+;/gi, (e) => ENT[e.toLowerCase()] ?? (e.startsWith('&#') ? String.fromCodePoint(+e.slice(2, -1)) : e));
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'data-short', 'data-empty'];

// HTML parçası → metin parçaları ve öznitelik değerleri (etiketlerden bölünür)
function splitHtml(s, out) {
  if (!/<\/?[a-zA-Z!]/.test(s)) { out.push(s); return; }
  let last = 0;
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^<>]*)>|<!--[\s\S]*?-->|<![^>]*>/g)) {
    out.push(s.slice(last, m.index)); last = m.index + m[0].length;
    const attrs = m[3] || '';
    for (const a of ATTRS) { const re = new RegExp(`\\s${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'); const am = attrs.match(re); if (am) out.push(am[2] ?? am[3]); }
  }
  out.push(s.slice(last));
}

// kod parçaları ve kimlikler: gölgelendirici kaynağı, CSS seçicisi, BÜYÜK_ALT_ÇİZGİLİ ya da boşluksuz küçük ASCII kimlik ('gorev', 'kp-sec')
export const isCode = (k) => /^https?:\/\//.test(k) || /\b(uniform|varying|gl_Frag\w*|void main|#include|#ifdef|texture2D|discard|vec[234]|ivec2)\b/.test(k) || /^[#.][\w-]+([\s>.[:]|$)/.test(k) || /\[data-[\w-]+/.test(k) ||
  /^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(k) || /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(k);

// şablon parçalarını (dize, '\u0000' yer tutucu işaretiyle) anahtarlara çevir: her parça kendi içinde {0}.. diye yeniden numaralanır
function piecesToKeys(raw, keys, all = false) {
  const parts = []; splitHtml(raw, parts);
  for (const p of parts) {
    let n = 0; const k = normKey(decode(p).replace(/\u0000/g, () => `{${n++}}`));
    if (k && (all ? /\p{L}\p{L}/u.test(k) : isTurkish(k)) && !isCode(k)) keys.add(k);
  }
}

function walk(node, visit, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit, node);
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

// a + b + c zincirini düzleştir: dize değişmezleri metin, geri kalan her şey yer tutucu
function flattenPlus(node, out) {
  if (node.type === 'BinaryExpression' && node.operator === '+') { flattenPlus(node.left, out); flattenPlus(node.right, out); }
  else out.push(node);
  return out;
}
const isStr = (n) => n.type === 'Literal' && typeof n.value === 'string';
const isConsole = (n) => n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'console';

export function extractJs(src) {
  const keys = new Set();
  const ast = espree.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const tpl = (q, exprs) => q.map((x, i) => (i < exprs ? x + '\u0000' : x)).join('');
  const visitor = (n, parent) => {
    if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || isConsole(n)) return false;
    if (n.type === 'ExportNamedDeclaration' && n.source) return false;
    if (n.type === 'Property' && !n.computed && isStr(n.key)) { walk(n.value, visitor, n); return false; }
    if (n.type === 'TemplateLiteral') {
      if (parent && parent.type === 'TaggedTemplateExpression') return;
      piecesToKeys(tpl(n.quasis.map((q) => q.value.cooked ?? q.value.raw), n.expressions.length), keys);
      return;                                                   // ${} içindeki dizeler de ayrıca gezilir
    }
    if (n.type === 'BinaryExpression' && n.operator === '+' && !(parent && parent.type === 'BinaryExpression' && parent.operator === '+')) {
      const items = flattenPlus(n, []);
      if (items.some(isStr) && items.length > 1) {
        let s = ''; for (const it of items) s += isStr(it) ? it.value : it.type === 'TemplateLiteral' ? tpl(it.quasis.map((q) => q.value.cooked ?? ''), it.expressions.length) : '\u0000';
        piecesToKeys(s, keys);
        for (const it of items) if (!isStr(it)) walk(it, visitor, n);
        return false;
      }
    }
    if (isStr(n)) piecesToKeys(n.value, keys);
  };
  walk(ast, visitor);
  return keys;
}

export function extractHtml(src) {
  const keys = new Set();
  const body = src.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  piecesToKeys(body, keys, true);                             // index.html'de her metin arayüzdür: Türkçe sezgisi uygulanmaz
  const t = src.match(/<title>([^<]*)<\/title>/i); if (t) piecesToKeys(t[1], keys, true);
  return keys;
}

// dosya → anahtar kümesi
export function extractKeys(root = ROOT) {
  const out = {};
  out['index.html'] = [...extractHtml(fs.readFileSync(path.join(root, 'index.html'), 'utf8'))];
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && !SKIP_FILES.has(f)).sort()) {
    const k = [...extractJs(fs.readFileSync(path.join(root, 'js', f), 'utf8'))];
    if (k.length) out['js/' + f] = k;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const all = extractKeys();
  if (process.argv.includes('--eksik')) {
    const { default: EN, same } = await import('../web/js/i18n/en.js');
    const keep = new Set(same), miss = {}; let n = 0;
    for (const [f, ks] of Object.entries(all)) { const m = ks.filter((k) => !(k in EN) && !keep.has(k)); if (m.length) { miss[f] = m; n += m.length; } }
    console.log(JSON.stringify(miss, null, 1)); console.error(`eksik: ${n}`);
  } else {
    console.log(JSON.stringify(all, null, 1));
    console.error(`anahtar: ${new Set(Object.values(all).flat()).size} (dosya: ${Object.keys(all).length})`);
  }
}
