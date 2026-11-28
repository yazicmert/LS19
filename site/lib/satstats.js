// Uydu istatistiği (saf; sunucu, istemci ve test): data/satstats.json'u (scripts/uydu_istatistik.mjs) açar, süzgeçlerle yıl / ay / ISO haftası
// toplamlarını ve seçilen boyuta (sınıf, görev, ülke, araç, işletmeci) göre ilk N + "Diğer" kırılımını çıkarır; sayfa durumu ⇄ adres;
// seri renkleri varlığa bağlı (süzgeç değişince kalanların rengi değişmez); başlık sayıları (bu yıl, geçen yıl, son ay, son hafta, toplam).
import { readParams, writeParams } from './search.js';
import { num } from './i18n.js';

export const DIMS = ['cls', 'mis', 'cc', 'lv', 'op'];
export const RES = ['year', 'month', 'week'];
export const TOPS = ['3', '5', '7'];
export const OTHER = '__other';
export const DEFAULTS = { res: 'year', by: 'cls', from: '', to: '', cc: '', cls: '', mis: '', lv: '', op: '', top: '7', view: 'chart', sort: 'n', dir: 'desc' };
// sınıf renkleri sabit (başlıktaki pay çubuğu ve grafik aynı): B ticari 1, D savunma 2, C sivil 3, A amatör 4; ortak kullanım ve sınıfsız "Diğer"de
export const CLASS_SLOTS = { B: 1, D: 2, C: 3, A: 4 };
export const MAIN_CLASSES = ['B', 'C', 'D', 'A'];
export const SLOTS = 7;
// pay: Türkçede yüzde işareti önde (%87,6), İngilizcede sonda (87.6%)
export const pct = (lang, x) => (lang === 'tr' ? `%${num(lang, 100 * x, 1)}` : `${num(lang, 100 * x, 1)}%`);

const DAY = 864e5;
const dayMs = (epoch) => Date.parse(`${epoch}T00:00:00Z`);
// veri → sütunlu diziler (günler mutlak), kod → sıra numarası dizinleri, boyut başına toplamlar
export function decode(data) {
  const R = data.rows, len = R.n.length, d = new Int32Array(len);
  let acc = 0; for (let i = 0; i < len; i++) { acc += R.d[i]; d[i] = acc; }
  const col = (k) => Uint16Array.from(R[k]), e0 = dayMs(data.epoch);
  const idx = Object.fromEntries(DIMS.map((k) => [k, new Map(data.dims[k].map((x, i) => [x.k, i]))]));
  const counts = Object.fromEntries(DIMS.map((k) => [k, new Array(data.dims[k].length).fill(0)]));
  const D = { len, d, n: Uint32Array.from(R.n), dims: data.dims, idx, counts, e0, total: data.total, asOfDay: Math.round((Date.parse(`${data.asOf}T00:00:00Z`) - e0) / DAY), minDay: len ? d[0] : 0 };
  for (const k of DIMS) { D[k] = col(k); for (let i = 0; i < len; i++) counts[k][D[k][i]] += D.n[i]; }
  return D;
}
// gün numarası (veri epokundan) ⇄ takvim (UTC)
export const ymdOf = (D, day) => { const t = new Date(D.e0 + day * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: (t.getUTCDay() + 6) % 7 }; };
export const dayFrom = (D, y, m = 1, d = 1) => Math.round((Date.UTC(y, m - 1, d) - D.e0) / DAY);
export const isoOf = (D, day) => new Date(D.e0 + day * DAY).toISOString().slice(0, 10);
// ISO 8601 haftası: pazartesi başlar; yılı, perşembesinin düştüğü yıl
export function isoWeek(D, day) {
  const mon = day - ymdOf(D, day).wd, thu = mon + 3, y = ymdOf(D, thu).y;
  return { y, w: Math.floor((thu - dayFrom(D, y, 1, 1)) / 7) + 1, mon };
}
// zaman kovası: yıl → yıl; ay → yıl×12 + ay−1; hafta → pazartesinin gün numarası
export function bucketOf(D, res, day) {
  if (res === 'week') return day - ymdOf(D, day).wd;
  const { y, m } = ymdOf(D, day);
  return res === 'month' ? y * 12 + m - 1 : y;
}
export const nextBucket = (res, key) => (res === 'week' ? key + 7 : key + 1);
export function bucketSpan(D, res, key) {                                     // kovanın ilk ve son günü
  if (res === 'week') return [key, key + 6];
  if (res === 'month') { const y = Math.floor(key / 12), m = (key % 12) + 1; return [dayFrom(D, y, m, 1), dayFrom(D, y, m + 1, 1) - 1]; }
  return [dayFrom(D, key, 1, 1), dayFrom(D, key + 1, 1, 1) - 1];
}

// süzgeçlerin gün aralığı: "from"/"to" yıl (dahil); boşsa ilk yükten veri tarihine
export function dayRange(D, st) {
  const y0 = /^\d{4}$/.test(st.from) ? +st.from : null, y1 = /^\d{4}$/.test(st.to) ? +st.to : null;
  const lo = Math.max(D.minDay, y0 ? dayFrom(D, y0, 1, 1) : D.minDay), hi = Math.min(D.asOfDay, y1 ? dayFrom(D, y1 + 1, 1, 1) - 1 : D.asOfDay);
  return [lo, hi];
}
// kırılım: süzgeçten geçen yükler; boyutun bütün değerleri (tablo), ilk N + Diğer (grafik), kova × seri sayıları
export function aggregate(D, st) {
  const by = DIMS.includes(st.by) ? st.by : 'cls', res = RES.includes(st.res) ? st.res : 'year', [lo, hi] = dayRange(D, st);
  const F = DIMS.filter((k) => st[k]).map((k) => [D[k], D.idx[k].has(st[k]) ? D.idx[k].get(st[k]) : -1]);
  const B = D[by], m = D.dims[by].length, tot = new Array(m).fill(0), first = new Array(m).fill(-1), last = new Array(m).fill(-1), keep = [];
  let total = 0;
  for (let i = 0; i < D.len; i++) {
    const day = D.d[i]; if (day < lo || day > hi) continue;
    let ok = true; for (const [col, v] of F) if (col[i] !== v) { ok = false; break; }
    if (!ok) continue;
    const e = B[i], n = D.n[i]; tot[e] += n; total += n; keep.push(i);
    if (first[e] < 0) first[e] = day; last[e] = day;
  }
  // başlangıç yılı verilmemişse grafik süzgece uyan ilk yükten başlar (ör. bir ülkenin ilk uydusu)
  const lo2 = !/^\d{4}$/.test(st.from) && keep.length ? D.d[keep[0]] : lo;
  const entities = [];
  for (let e = 0; e < m; e++) if (tot[e]) entities.push({ k: D.dims[by][e].k, e, n: tot[e], first: first[e], last: last[e] });
  entities.sort((a, b) => b.n - a.n || a.e - b.e);
  // sınıf boyutunda yalnız dört ana sınıf ayrı seri olur (ortak kullanım ve sınıfsız toplam ~30 yük: "Diğer")
  const cap = Math.min(Number(TOPS.includes(st.top) ? st.top : DEFAULTS.top), SLOTS);
  const pool = by === 'cls' ? entities.filter((x) => CLASS_SLOTS[x.k]) : entities, top = pool.slice(0, cap);
  const topSet = new Map(top.map((x, j) => [x.e, j])), otherN = total - top.reduce((s, x) => s + x.n, 0);
  const series = top.map((x) => ({ k: x.k, n: x.n }));
  if (otherN > 0) series.push({ k: OTHER, n: otherN, count: entities.length - top.length });
  const S = series.length, oj = otherN > 0 ? S - 1 : -1;
  const b0 = bucketOf(D, res, lo2), b1 = bucketOf(D, res, hi), buckets = [], at = new Map();
  // son kova veri tarihinde ya da "to" yılında bitmiyorsa yarımdır (ör. içinde bulunulan yıl): grafikte ve ipucunda işaretlenir
  const cut0 = /^\d{4}$/.test(st.from) ? lo : -Infinity;
  for (let b = b0; b <= b1; b = nextBucket(res, b)) {
    const [s0, s1] = bucketSpan(D, res, b);
    at.set(b, buckets.length); buckets.push({ key: b, vals: new Array(S).fill(0), total: 0, partial: s1 > hi || s0 < cut0 });
  }
  for (const i of keep) {
    const j = topSet.has(B[i]) ? topSet.get(B[i]) : oj, bk = buckets[at.get(bucketOf(D, res, D.d[i]))];
    bk.vals[j] += D.n[i]; bk.total += D.n[i];
  }
  return { by, res, lo: lo2, hi, total, entities, series, buckets };
}

// seri renkleri: sınıf sabit; diğer boyutlarda önceki atamadaki varlık rengini korur, yeniler boş yuvaları sırayla alır
export function assignSlots(by, keys, prev = {}) {
  const out = {}, used = new Set();
  for (const k of keys) {
    if (k === OTHER) continue;
    const s = by === 'cls' ? CLASS_SLOTS[k] : prev[k];
    if (s && !used.has(s)) { out[k] = s; used.add(s); }
  }
  let free = 1;
  for (const k of keys) {
    if (k === OTHER || out[k]) continue;
    while (used.has(free) || (by === 'cls' && Object.values(CLASS_SLOTS).includes(free) && free <= 4)) free++;
    if (free > SLOTS) break;
    out[k] = free; used.add(free);
  }
  return out;
}

// sayfa durumu ⇄ adres: bilinmeyen değerler varsayılana döner; süzgeç kodu veride yoksa atılır (D verilirse)
export function readState(search, D = null) {
  const s = readParams(search, DEFAULTS);
  if (!RES.includes(s.res)) s.res = DEFAULTS.res;
  if (!DIMS.includes(s.by)) s.by = DEFAULTS.by;
  if (!TOPS.includes(s.top)) s.top = DEFAULTS.top;
  if (!['chart', 'table'].includes(s.view)) s.view = DEFAULTS.view;
  if (!['n', 'name', 'first', 'last'].includes(s.sort)) s.sort = DEFAULTS.sort;
  if (!['asc', 'desc'].includes(s.dir)) s.dir = DEFAULTS.dir;
  for (const k of ['from', 'to']) if (!/^(19[5-9]\d|2\d{3})$/.test(s[k])) s[k] = '';
  if (s.from && s.to && +s.from > +s.to) [s.from, s.to] = [s.to, s.from];
  if (D) for (const k of DIMS) if (s[k] && !D.idx[k].has(s[k])) s[k] = '';
  return s;
}
export const writeState = (st) => writeParams(st, DEFAULTS);

// başlık sayıları: verinin tarihine göre (GCAT güncellemesi); "bu yıl" ve geçen yılın aynı tarihine kadar, son tam ay ve son tam ISO haftası
export function headline(D) {
  const a = ymdOf(D, D.asOfDay), Y = a.y, md = a.m * 100 + a.d, years = new Map();
  const lastMonth = a.m === 1 ? { y: Y - 1, m: 12 } : { y: Y, m: a.m - 1 };
  const wk = a.wd === 6 ? D.asOfDay - 6 : D.asOfDay - a.wd - 7;             // son tam haftanın pazartesisi
  const cls = (k) => (CLASS_SLOTS[D.dims.cls[k].k] ? D.dims.cls[k].k : OTHER);
  const sh = { last: {}, all: {} };
  let ytd = 0, ytdPrev = 0, month = 0, week = 0;
  for (let i = 0; i < D.len; i++) {
    const day = D.d[i], n = D.n[i], t = ymdOf(D, day), c = cls(D.cls[i]);
    years.set(t.y, (years.get(t.y) || 0) + n);
    sh.all[c] = (sh.all[c] || 0) + n;
    if (t.y === Y) ytd += n;
    if (t.y === Y - 1) { sh.last[c] = (sh.last[c] || 0) + n; if (t.m * 100 + t.d <= md) ytdPrev += n; }
    if (t.y === lastMonth.y && t.m === lastMonth.m) month += n;
    if (day >= wk && day <= wk + 6) week += n;
  }
  const full = [...years.entries()].filter(([y]) => y < Y), rec = full.reduce((b, x) => (x[1] > b[1] ? x : b), [0, 0]);
  const lastN = years.get(Y - 1) || 0, daysLast = dayFrom(D, Y, 1, 1) - dayFrom(D, Y - 1, 1, 1);
  const w = isoWeek(D, wk);
  return {
    asOf: isoOf(D, D.asOfDay), year: Y, ytd, ytdPrev, lastYear: Y - 1, lastN, perMonth: lastN / 12, perWeek: (lastN * 7) / daysLast,
    month: { ...lastMonth, n: month }, week: { y: w.y, w: w.w, start: isoOf(D, wk), end: isoOf(D, wk + 6), n: week },
    total: D.total, firstYear: ymdOf(D, D.minDay).y, record: { y: rec[0], n: rec[1] }, share: sh,
  };
}
