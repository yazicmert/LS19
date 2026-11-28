// Tüm uydular kataloğu: CelesTrak GP "active" kümesindeki her uydu (~17 000). Saf işlevler (betik, sunucu ve test aynılarını kullanır).
// GCAT özeti (data/satcat.json; scripts/uydular.mjs haftada bir üretir): yalnız etkin kümedeki uyduların GCAT satırlarından gereken sütunlar
// ve bu satırların başvurduğu fırlatma, kurum ve fırlatma yeri satırları. GCAT ham biçiminde saklanır; okurken lib/sat.js mapGcat ile
// zengin uydu sayfalarıyla aynı biçime çevrilir. Yörünge (GP) bu dosyada yok: sunucu LS19'un 2 saatlik kopyasından okur (lib/satcat-live.js).
import { mapGp, mapGcat } from './sat.js';
import { norm } from './search.js';

// GCAT satcat sütunları (+ psatcat'ten Program, Category); ilk sütun NORAD numarası (sayı)
export const CAT_COLS = ['Satcat', 'JCAT', 'Launch_Tag', 'Type', 'Name', 'PLName', 'LDate', 'SDate', 'DDate', 'Status', 'Owner', 'State', 'Manufacturer', 'Bus', 'Shape', 'ODate',
  'Mass', 'DryMass', 'Length', 'Diameter', 'Span', 'Program', 'Category'];
export const LAUNCH_COLS = ['Launch_Date', 'LV_Type', 'Flight', 'Launch_Site', 'Launch_Pad'];
export const ORG_COLS = ['Name', 'ShortName'];
const clean = (v) => { const s = v == null ? '' : String(v).trim(); return s === '-' ? '' : s; };
const pickCols = (row, cols) => cols.map((c) => clean(row[c]));
const codes = (s) => (clean(s) ? clean(s).split('/').map((c) => c.trim()).filter(Boolean) : []);

// GCAT satcat dizini: NORAD numarasına göre (satcat.tsv'de "00900" gibi sıfırlı, numarasız olanlar "NNA")
export function indexSatcat(rows) { const m = new Map(); for (const r of rows) { const k = clean(r.Satcat); if (/^\d+$/.test(k)) m.set(+k, r); } return m; }

// betik: etkin GP + GCAT tabloları → özet. GCAT'ta aynı NORAD numarası yoksa uydu özette yer almaz (sayfada "GCAT kaydı yok" yazar)
export function buildCat(gp, { satcat, psat, launches, orgs, sites }, info) {
  const sats = [], L = {}, O = {}, S = {}, ST = {}, seen = new Set();
  for (const g of gp) {
    const k = +g.NORAD_CAT_ID, r = satcat.get(k); if (!r || seen.has(k)) continue; seen.add(k);
    const p = psat.get(clean(r.JCAT)) || {}, tag = clean(r.Launch_Tag), lr = launches.get(tag);
    const row = CAT_COLS.map((c) => (c === 'Satcat' ? k : clean(c === 'Program' || c === 'Category' ? p[c] : r[c])));
    if (lr) { row[CAT_COLS.indexOf('LDate')] = ''; if (!L[tag]) { L[tag] = pickCols(lr, LAUNCH_COLS); const s = sites.get(clean(lr.Launch_Site)); if (s) S[clean(lr.Launch_Site)] = pickCols(s, ORG_COLS); } }
    for (const c of [...codes(r.Owner), ...codes(r.Manufacturer)]) { const o = orgs.get(c); if (o && !O[c]) O[c] = pickCols(o, ORG_COLS); }
    const st = clean(r.State), so = orgs.get(st); if (so && !ST[st]) ST[st] = clean(so.ShortEName) || clean(so.ShortName) || st;
    sats.push(row);
  }
  sats.sort((a, b) => a[0] - b[0]);
  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return { ...info, gp: { ...info.gp, count: gp.length, matched: sats.length }, cols: CAT_COLS, sats, launchCols: LAUNCH_COLS, launches: sortObj(L), orgCols: ORG_COLS, orgs: sortObj(O), sites: sortObj(S), states: sortObj(ST) };
}
// özet dosyası: satır başına bir uydu ya da tablo satırı (haftalık farklar okunur kalsın)
export function catJson(cat) {
  const lines = (arr) => arr.map((x) => `  ${JSON.stringify(x)}`).join(',\n'), obj = (o) => Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  const head = Object.fromEntries(Object.entries(cat).filter(([k]) => !['sats', 'launches', 'orgs', 'sites', 'states'].includes(k)));
  return `${JSON.stringify(head, null, 1).replace(/\n}$/, '')},\n "sats": [\n${lines(cat.sats)}\n ],\n "launches": {\n${obj(cat.launches)}\n },\n "orgs": {\n${obj(cat.orgs)}\n },\n "sites": {\n${obj(cat.sites)}\n },\n "states": {\n${obj(cat.states)}\n }\n}\n`;
}
// özetin doğrulaması ve önceki özetle karşılaştırma: tutarsızlıkta ya da kuşkulu toplu kayıpta dosya yazılmaz
export function checkCat(cat, prev) {
  const err = [], n = cat.sats.length, ix = Object.fromEntries(cat.cols.map((c, i) => [c, i]));
  if (cat.cols.join() !== CAT_COLS.join()) err.push('özet sütunları beklenenden farklı');
  if (!(cat.gp.count >= 5000)) err.push(`GP kümesi yalnız ${cat.gp.count} uydu`);
  if (!(n >= cat.gp.count * 0.85)) err.push(`GCAT eşleşmesi düşük: ${n} / ${cat.gp.count}`);
  if (new Set(cat.sats.map((r) => r[0])).size !== n) err.push('NORAD numaraları tekil değil');
  const bad = cat.sats.filter((r) => !(r[0] > 0) || r.length !== CAT_COLS.length || !/^[A-Z]/.test(r[ix.JCAT]) || (r[ix.Mass] !== '' && !(+r[ix.Mass].replace(/[?~]$/, '') >= 0)));
  if (bad.length) err.push(`${bad.length} geçersiz satır (ör. ${bad[0][0]})`);
  const noLaunch = cat.sats.filter((r) => !cat.launches[r[ix.Launch_Tag]] && !r[ix.LDate]);
  if (noLaunch.length > n * 0.02) err.push(`${noLaunch.length} uydunun fırlatma tarihi yok`);
  if (prev && Array.isArray(prev.sats) && prev.sats.length) {
    const N = new Set(cat.sats.map((r) => r[0])), gone = prev.sats.filter((r) => !N.has(r[0])).length;
    if (gone > Math.max(200, prev.sats.length * 0.2)) err.push(`${gone} uydu özetten birden çıktı (kaynak eksik olabilir)`);
  }
  return err;
}

// okuma: özet tabloları (mapGcat'in beklediği Map'ler)
export function catTables(cat) {
  const toMap = (o, cols) => new Map(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(cols.map((c, i) => [c, v[i]]))]));
  return { launches: toMap(cat.launches, cat.launchCols), orgs: toMap(cat.orgs, cat.orgCols), sites: toMap(cat.sites, cat.orgCols) };
}
// tek özet satırı → zengin sayfalarla aynı GCAT kaydı (+ program, kategori)
export function catGcat(cat, tables, arr) {
  if (!arr) return null;
  const row = Object.fromEntries(cat.cols.map((c, i) => [c, arr[i]])), G = mapGcat(row, tables);
  return { ...G, program: row.Program || null, category: row.Category || null };
}
// GCAT programını aile adına indirger (yalnız süzgeç için, "türetilmiş"): "Starlink 2MO S1" → Starlink, "Flock-4" → Flock
export const progGroup = (p) => (p ? String(p).split(/[\s-]/)[0] || null : null);

// sunucu dizini: GP (ham OMM dizisi) + özet + modelli uyduların kimlikleri. Satırlar süzgeç ve sıralama içindir; tam kayıt satRecordOf ile
export function buildIndex(gp, cat, modelIds = new Set()) {
  const tables = catTables(cat), byNorad = new Map(cat.sats.map((r) => [r[0], r])), rows = [], raw = new Map();
  const ix = Object.fromEntries(cat.cols.map((c, i) => [c, i]));
  for (const g of gp) {
    const k = +g.NORAD_CAT_ID; if (!(k > 0) || raw.has(k) || !(+g.MEAN_MOTION > 0) || !(+g.ECCENTRICITY >= 0 && +g.ECCENTRICITY < 1)) continue;
    const o = mapGp(g), a = byNorad.get(k), oc = a ? codes(a[ix.Owner]) : [];
    const os = oc.map((c) => { const x = tables.orgs.get(c); return x ? x.ShortName || c : c; });
    const ld = a ? ((tables.launches.get(a[ix.Launch_Tag]) || {}).Launch_Date || a[ix.LDate]) : '';
    const mass = a && a[ix.Mass] !== '' ? +a[ix.Mass].replace(/[?~]$/, '') : null;
    raw.set(k, g);
    rows.push({
      k, n: o.name || String(k), c: o.cospar, r: o.derived.regime, sso: o.derived.sso, hp: o.derived.perigee, ha: o.derived.apogee, i: o.elements.i, p: o.derived.period,
      oc, o: os, s: a ? a[ix.State] || null : null, y: /^\d{4}/.test(ld || '') ? ld.slice(0, 4) : null, m: Number.isFinite(mass) ? mass : null, g: progGroup(a && a[ix.Program]), M: modelIds.has(String(k)),
      key: [o.name, a && a[ix.Name], a && a[ix.PLName], o.cospar, ...os].filter(Boolean).map(norm), ks: String(k),
    });
  }
  return { rows, raw, cat, tables, byNorad, states: cat.states || {} };
}
// tek uydu: GP (türetilmiş değerlerle) + GCAT; etkin kümede yoksa null
export function satRecordOf(index, norad) {
  const k = +norad, g = Number.isInteger(k) && k > 0 ? index.raw.get(k) : null; if (!g) return null;
  const o = mapGp(g), gc = catGcat(index.cat, index.tables, index.byNorad.get(k));
  return { id: String(k), ...o, title: { en: o.name, tr: o.name }, gcat: gc, note: null, model: null };
}

// katalog sorgusu: yalnız izin verilen süzgeçler ve sıralamalar; metin her alanda harf duyarsız (başlayan önce)
export const REGIMES = ['LEO', 'MEO', 'GEO', 'HEO', 'HIGH'];
export const CAT_SORTS = { norad: (r) => r.k, name: (r) => r.n, owner: (r) => r.o[0] || null, state: (r) => r.s, launched: (r) => r.y, regime: (r) => r.r, alt: (r) => r.hp, i: (r) => r.i, period: (r) => r.p, mass: (r) => r.m };
export const CAT_PAGE = 50;
const CODE = /^[A-Za-z0-9][A-Za-z0-9 .&+'()-]{0,31}$/;
export function parseCatQuery(get) {
  const g = (k) => String(get(k) || '').trim();
  const q = g('q').slice(0, 40), regime = REGIMES.includes(g('regime')) ? g('regime') : '', sort = Object.hasOwn(CAT_SORTS, g('sort')) ? g('sort') : 'norad';
  const page = Math.max(0, Math.min(Number.parseInt(g('page'), 10) || 0, 10000));
  return { q, regime, state: CODE.test(g('state')) ? g('state') : '', owner: CODE.test(g('owner')) ? g('owner') : '', prog: CODE.test(g('prog')) ? g('prog') : '', sso: g('sso') === '1', model: g('model') === '1', sort, dir: g('dir') === 'desc' ? 'desc' : 'asc', page };
}
const coll = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
// metin eşleşmesi: 3 tam NORAD, 2 başlayan, 1 içeren, 0 yok
function score(r, k, digits) {
  if (digits && r.ks === k) return 3;
  if ((digits && r.ks.startsWith(k)) || r.key.some((x) => x.startsWith(k))) return 2;
  return r.key.some((x) => x.includes(k)) ? 1 : 0;
}
const pub = (r) => ({ k: r.k, n: r.n, c: r.c, r: r.r, sso: r.sso, hp: r.hp, ha: r.ha, i: r.i, p: r.p, o: r.o, s: r.s, y: r.y, m: r.m, M: r.M });
export function queryCat(index, Q) {
  const k = norm(Q.q), digits = /^\d+$/.test(k);
  let rows = index.rows.filter((r) => (!Q.regime || r.r === Q.regime) && (!Q.state || r.s === Q.state) && (!Q.owner || r.oc.includes(Q.owner)) && (!Q.prog || r.g === Q.prog) && (!Q.sso || r.sso) && (!Q.model || r.M));
  let sc = null;
  if (k) { sc = new Map(); rows = rows.filter((r) => { const s = score(r, k, digits); if (s) sc.set(r, s); return s > 0; }); }
  const get = CAT_SORTS[Q.sort] || CAT_SORTS.norad, sgn = Q.dir === 'desc' ? -1 : 1, rel = sc && Q.sort === 'norad' && Q.dir === 'asc';
  rows.sort((a, b) => {
    if (rel) { const d = sc.get(b) - sc.get(a); if (d) return d; }
    const x = get(a), y = get(b);
    if (x == null || y == null) return x == null && y == null ? a.k - b.k : x == null ? 1 : -1;           // değeri olmayan her yönde sonda
    const d = typeof x === 'string' ? coll.compare(x, y) : x - y;
    return d ? sgn * d : a.k - b.k;
  });
  const pages = Math.max(1, Math.ceil(rows.length / CAT_PAGE)), page = Math.min(Q.page, pages - 1);
  return { count: rows.length, total: index.rows.length, page, rows: rows.slice(page * CAT_PAGE, (page + 1) * CAT_PAGE).map(pub) };
}
// süzgeç seçenekleri (tüm küme üzerinden sayılar): bölge, ülke (GCAT), işletmeci (en az 3 uydu), program ailesi (en az 10 uydu)
export function catFacets(index) {
  const cnt = (f) => { const m = new Map(); for (const r of index.rows) for (const v of [].concat(f(r) || [])) m.set(v, (m.get(v) || 0) + 1); return m; };
  const desc = (m, min = 1) => [...m.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || coll.compare(String(a[0]), String(b[0])));
  const own = new Map(); for (const r of index.rows) r.oc.forEach((c, i) => own.set(c, r.o[i]));
  return {
    regimes: REGIMES.map((x) => [x, index.rows.filter((r) => r.r === x).length]).filter((x) => x[1]),
    states: desc(cnt((r) => r.s)).map(([c, n]) => [c, index.states[c] || c, n]),
    owners: desc(cnt((r) => r.oc), 3).map(([c, n]) => [c, own.get(c) || c, n]),
    progs: desc(cnt((r) => r.g), 10).map(([g, n]) => [g, g, n]),
    models: index.rows.filter((r) => r.M).length,
  };
}
// site araması: en çok n uydu (tam NORAD, sonra başlayan, sonra içeren)
export function findCat(index, q, n = 8) {
  const k = norm(q); if (!k || k.length > 40) return [];
  return queryCat(index, { q, regime: '', state: '', owner: '', prog: '', sso: false, model: false, sort: 'norad', dir: 'asc', page: 0 }).rows.slice(0, n).map((r) => ({ k: r.k, n: r.n, c: r.c, r: r.r, M: r.M }));
}
