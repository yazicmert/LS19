// Fırlatma veritabanı: 1957'den bugüne tüm yörüngesel ve derin uzay fırlatmaları -> web/data/launchdb.json (sütunlu, küçük).
// Kaynak: GCAT — General Catalog of Artificial Space Objects, Jonathan C. McDowell (planet4589.org/space/gcat), lisans CC-BY-4.0:
// kaynak gösterilerek serbestçe kullanılabilir ("Data from J. McDowell, planet4589.org"). Üç tablo: launch.tsv (fırlatma kaydı; sonda
// roketleri dahil ~76.000 satır), orgs.tsv (kuruluşlar: kısa ad, ülke), sites.tsv (fırlatma yerleri: ad, ülke, konum).
// Süzgeç: LaunchCode ilk harfi O (yörünge) ya da D (derin uzay), ikinci harfi S (başarılı) ya da F (başarısız); ekteki sayı McDowell'in
// başarı oranıdır (OS75 = 0,75; 0,75'in altı başarısız sayılır). Yaklaşan ve son günlerin fırlatmaları ayrıca canlı LL2'den gelir (launchdata.js).
// Kullanım (depo kökünden):
//   node tools/firlatma_db.mjs                       GCAT'ten indirir
//   node tools/firlatma_db.mjs <klasör>              önceden indirilmiş TSV'lerden (vekilli ortamlarda; FILES'taki dosya adları)
// Yükler (uydu, uzay aracı, kapsül) fırlatma yılına göre web/data/payloads/<yıl>.json'a yazılır; amaç GCAT yük kataloğundan
// (Category, Discipline, Program, Class), güncel durum GCAT güncel kataloğundan. Vikipedi maddeleri Wikidata'dan (CC0) eşlenir:
// NORAD (P377) ya da COSPAR (P247) numarası olan ve tr/en Vikipedi maddesi bulunan nesneler. Wikidata'ya ulaşılamazsa var olan
// yük dosyalarındaki eşleme korunur. --wikidata <dosya.json> önceden indirilmiş SPARQL yanıtını kullanır. Vekilli ortamda Node'un fetch'i
// vekili ancak NODE_USE_ENV_PROXY=1 ile kullanır.
import fs from 'fs';
import path from 'path';

const BASE = 'https://planet4589.org/space/gcat/tsv/';
const FILES = { launch: 'launch/launch.tsv', orgs: 'tables/orgs.tsv', sites: 'tables/sites.tsv',
  // yükler: nesne katalogları (standart, yardımcı, yörüngeye ulaşamayanlar), yük katalogları (amaç, sınıf, program), güncel durum, etkin uydular
  satcat: 'cat/satcat.tsv', auxcat: 'cat/auxcat.tsv', ftocat: 'cat/ftocat.tsv', psatcat: 'cat/psatcat.tsv', pauxcat: 'cat/pauxcat.tsv', pftocat: 'cat/pftocat.tsv',
  currentcat: 'derived/currentcat.tsv', active: 'derived/active.tsv' };
const UA = { 'User-Agent': 'LS19/1.1 (Look Star 19 egitim simulasyonu; +https://github.com/yazicmert/LS19)' };
const args = process.argv.slice(2), wdAt = args.indexOf('--wikidata'), wdFile = wdAt >= 0 ? args.splice(wdAt, 2)[1] : null, dir = args[0];

async function text(key) {
  if (dir) return fs.readFileSync(path.join(dir, path.basename(FILES[key])), 'utf8');
  const r = await fetch(BASE + FILES[key], { headers: UA });
  if (!r.ok) throw new Error(`GCAT ${FILES[key]}: HTTP ${r.status}`);
  return r.text();
}
// TSV: ilk satır "#" ile başlayan başlık; "#" ile başlayan öteki satırlar açıklama
function tsv(src) {
  const lines = src.split('\n'), head = lines[0].replace(/^#/, '').split('\t').map((s) => s.trim()), rows = [];
  for (const l of lines.slice(1)) { if (!l || l.startsWith('#')) continue; rows.push(l.split('\t').map((s) => s.trim())); }
  const ix = Object.fromEntries(head.map((k, i) => [k, i]));
  return { rows, get: (r, k) => (r[ix[k]] ?? '').trim() };
}
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// GCAT tarihi ("2026 Oct 31 0404:34", "1963 Jan  4 0849", belirsiz tarihlerde saat ya da gün eksik/soru işaretli) -> UTC saniye
function gcatTime(s) {
  const m = /^(\d{4})\s+([A-Z][a-z]{2})(?:\s+(\d{1,2}))?(?:\s+(\d{2})(\d{2})(?::(\d{2}))?)?/.exec(s || '');
  if (!m || !(m[2] in MON)) return null;
  return Math.round(Date.UTC(+m[1], MON[m[2]], m[3] ? +m[3] : 1, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0) / 1000);
}
const num = (s, k = 1) => { const v = Number(String(s).replace(/[^0-9.+-]/g, '')); return s && s !== '-' && Number.isFinite(v) ? Math.round(v * k) : null; };
const dash = (s) => (!s || s === '-' ? '' : s);
const deg = (s) => { const v = num(s, 1e3); return v === null ? null : v / 1e3; };

const [L, O, S] = await Promise.all(['launch', 'orgs', 'sites'].map(text));
const launch = tsv(L), orgs = tsv(O), sites = tsv(S);
const orgBy = new Map(orgs.rows.map((r) => [orgs.get(r, 'Code'), r])), siteBy = new Map(sites.rows.map((r) => [sites.get(r, 'Site'), r]));
const rel = (/Release\s+(\d+\.\d+(?:\.\d+)?)/.exec(L) || [])[1] || null, upd = (/# Updated (\d{4} \w{3}\s+\d+)/.exec(L) || [])[1] || null;

// tekrar eden adlar dizin tablosunda
const table = () => { const list = [], at = new Map(); return { list, id: (key, make) => { if (!at.has(key)) { at.set(key, list.length); list.push(make()); } return at.get(key); } }; };
const LV = table(), SITE = table(), AG = table();
const C = { tag: [], t: [], lv: [], v: [], mis: [], pl: [], flt: [], site: [], pad: [], ag: [], r: [], fr: [], orb: [], kg: [], pe: [], ap: [], inc: [] };
let skipped = 0;
for (const row of launch.rows) {
  const code = launch.get(row, 'LaunchCode');
  if (!/^[OD][SF]/.test(code)) continue;
  const t = gcatTime(launch.get(row, 'Launch_Date')); if (t === null) { skipped++; continue; }
  const sc = launch.get(row, 'Launch_Site'), s = siteBy.get(sc), ac = launch.get(row, 'Agency').split('/')[0], a = orgBy.get(ac);
  const frac = /^[OD][SF](\d{2,3})$/.exec(code);
  const cat = launch.get(row, 'Category').split(/\s+/);
  const mission = dash(launch.get(row, 'Mission')), flight = dash(launch.get(row, 'Flight'));
  C.tag.push(launch.get(row, 'Launch_Tag'));
  C.t.push(t);
  C.lv.push(LV.id(launch.get(row, 'LV_Type'), () => launch.get(row, 'LV_Type')));
  C.v.push(dash(launch.get(row, 'Variant')));
  // görünen ad: uçuş adı (Apollo 11, JWST, NVS-03); Starlink'te iç sıra adı yerine kamuya açık grup adı. Öteki ad yük/görev olarak saklanır.
  const name = (/Group/.test(mission) && /^Starlink-\d+$/.test(flight)) ? mission : (flight || mission || '?');
  C.mis.push(name);
  C.pl.push([mission, flight].find((x) => x && x !== name) || '');
  C.flt.push(dash(launch.get(row, 'Flight_ID')).replace(/^(x+|\d+)\//, '').replace(/\s+/g, ' '));
  C.site.push(SITE.id(sc, () => (s ? [sites.get(s, 'ShortName') || sc, sites.get(s, 'StateCode'), deg(sites.get(s, 'Latitude')), deg(sites.get(s, 'Longitude'))] : [sc, '', null, null])));
  C.pad.push(dash(launch.get(row, 'Launch_Pad')));
  C.ag.push(AG.id(ac, () => (a ? [orgs.get(a, 'ShortName') || ac, orgs.get(a, 'StateCode')] : [ac.replace(/\?$/, ''), ''])));
  C.r.push(code[1]);
  C.fr.push(frac ? Math.min(100, +frac[1].padEnd(3, '0').slice(0, 3) / 10) : null);   // OS75 -> 75, OF40 -> 40
  C.orb.push(code[0] === 'D' && cat[1] !== 'DSO' ? 'DSO' : (cat[1] || ''));
  C.kg.push(num(launch.get(row, 'OrbPay'), 1000));
  C.pe.push(num(launch.get(row, 'Perigee')));
  C.ap.push(num(launch.get(row, 'Apogee')));
  const inc = Number(launch.get(row, 'Inc')); C.inc.push(Number.isFinite(inc) && launch.get(row, 'Inc') !== '-' ? Math.round(inc * 10) / 10 : null);
}
// zaman sırası (aynı anda olanlar etikete göre)
const order = C.t.map((_, i) => i).sort((i, j) => C.t[i] - C.t[j] || (C.tag[i] < C.tag[j] ? -1 : 1));
const cols = Object.fromEntries(Object.entries(C).map(([k, a]) => [k, order.map((i) => a[i])]));
// GCAT belirsiz tarihi -> "1958-01-04" (yalnız bilinen kısım; sonda "?" belirsiz)
function vdate(s) {
  const m = /^(\d{4})(?:\s+([A-Z][a-z]{2}))?(?:\s+(\d{1,2}))?/.exec(s || '');
  if (!m) return '';
  let d = m[1];
  if (m[2] && m[2] in MON) { d += '-' + String(MON[m[2]] + 1).padStart(2, '0'); if (m[3]) d += '-' + m[3].padStart(2, '0'); }
  return d + (s.includes('?') ? '?' : '');
}
// güncel durum (GCAT güncel kataloğu ExpandedStatus) -> [kod, gökcismi ya da bağlı olduğu araç]; arayüz çevirir (js/payloads.js STATUS)
function statusOf(x) {
  let m;
  if (x === 'In Earth orbit') return ['O'];
  if ((m = /^(Attached to|Docked with) [ADS]\d+\s*(?:\/[ADS]\d+)?\s*(.*)$/.exec(x))) return [m[1] === 'Docked with' ? 'K' : 'A', m[2]];
  if (/^Reentered/.test(x)) return ['R'];
  if (/^Deorbited/.test(x)) return ['D'];
  if (/^Landed (?:on Earth|attached|inside)/.test(x)) return ['L'];
  if (x === 'In solar orbit') return ['H'];
  if ((m = /^In (.+?) orbit$/.exec(x))) return ['Y', m[1] === 'lunar' ? 'Luna' : m[1]];
  if ((m = /^Impacted (.+)$/.exec(x))) return ['I', m[1]];
  if (/^Impact attached/.test(x)) return ['I'];
  if ((m = /^(?:On (.+?), inactive|Landed on (.+))$/.exec(x))) return ['S', m[1] || m[2]];
  if ((m = /^Operating on (.+?) surface$/.exec(x))) return ['W', m[1] === 'lunar' ? 'Luna' : m[1]];
  const one = { Lost: 'X', Exploded: 'E', 'Crashed on Earth': 'C', 'Targeted suborbital reentry': 'B' };
  if (one[x]) return [one[x]];
  if (/^(?:Launched from|Reflown)/.test(x)) return ['T'];
  return ['?', x];
}
// güncel katalogda olmayanlar için nesne kataloğunun evre durumu (yaklaşık)
const PHASE = { O: 'O', OX: 'X', AO: 'A', R: 'R', AR: 'R', 'AR IN': 'R', D: 'D', L: 'L', AL: 'L', 'AL IN': 'L', E: 'E', S: 'B', F: 'F', AF: 'F', DK: 'K', DSO: 'H', DSA: 'H' };
const wikiTitle = (u) => decodeURIComponent(u.split('/wiki/')[1] || '').replace(/_/g, ' ');
// Wikidata: NORAD (P377) ya da COSPAR (P247) numarası olan ve Vikipedi maddesi bulunan nesneler (Wikidata CC0; madde metinleri çalışırken Vikipedi'den)
async function wikiMap(pdir) {
  const Q = 'SELECT ?c ?n ?en ?tr WHERE { { ?i wdt:P247 ?c . } UNION { ?i wdt:P377 ?n . } OPTIONAL { ?i wdt:P247 ?c . } OPTIONAL { ?i wdt:P377 ?n . } ' +
    'OPTIONAL { ?en schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> . } OPTIONAL { ?tr schema:about ?i ; schema:isPartOf <https://tr.wikipedia.org/> . } FILTER(BOUND(?en) || BOUND(?tr)) }';
  let json = null;
  try {
    if (wdFile) json = JSON.parse(fs.readFileSync(wdFile, 'utf8'));
    else {
      const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(Q), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      json = await r.json();
    }
  } catch (e) { console.warn(`Wikidata alınamadı (${e.message}); var olan yük dosyalarındaki eşleme korunur`); }
  const byN = new Map(), byC = new Map(), old = new Map();
  if (json) {
    const add = (m, k, t) => m.set(k, { ...m.get(k), ...t });
    for (const b of json.results.bindings) {
      const t = {}; if (b.en) t.we = wikiTitle(b.en.value); if (b.tr) t.wt = wikiTitle(b.tr.value);
      if (b.n && /^\d+$/.test(b.n.value)) add(byN, +b.n.value, t);
      if (b.c && /^\d{4}-\d{3}[A-Z]*$/.test(b.c.value)) add(byC, b.c.value, t);
    }
    return { byN, byC, old, note: 'Wikidata ' + new Date().toISOString().slice(0, 10) };
  }
  if (fs.existsSync(pdir)) for (const f of fs.readdirSync(pdir)) {
    if (!/^\d{4}\.json$/.test(f)) continue;
    const d = JSON.parse(fs.readFileSync(new URL(f, pdir), 'utf8'));
    for (const list of Object.values(d.L)) for (const p of list) if (p.we || p.wt) old.set(p.p + '|' + p.ad, { we: p.we, wt: p.wt });
    if (d.meta && d.meta.wiki) old.note = d.meta.wiki;
  }
  return { byN, byC, old, note: old.note || 'Vikipedi eşlemesi yok' };
}
// fırlatma başına yükler (yıla göre dosyalar), ana amaç ve arama sözcükleri
async function payloads(cols) {
  const [sat, aux, fto, psat, paux, pfto, cur, act] = (await Promise.all(['satcat', 'auxcat', 'ftocat', 'psatcat', 'pauxcat', 'pftocat', 'currentcat', 'active'].map(text))).map(tsv);
  const pdir = new URL('../web/data/payloads/', import.meta.url), wiki = await wikiMap(pdir);
  const tags = new Set(cols.tag), yearOf = new Map(cols.tag.map((tg, i) => [tg, new Date(cols.t[i] * 1000).getUTCFullYear()]));
  const purpose = new Map(); for (const c of [psat, paux, pfto]) for (const r of c.rows) purpose.set(c.get(r, 'JCAT'), [c, r]);
  const now = new Map(cur.rows.map((r) => [cur.get(r, 'JCAT'), r])), active = new Set(act.rows.map((r) => act.get(r, 'JCAT')));
  const items = [];
  for (const c of [sat, aux, fto]) for (const r of c.rows) {
    if (c.get(r, 'Type')[0] !== 'P' || !tags.has(c.get(r, 'Launch_Tag'))) continue;
    items.push({ c, r, j: c.get(r, 'JCAT'), tg: c.get(r, 'Launch_Tag') });
  }
  const pieceN = new Map(); for (const it of items) { const p = it.c.get(it.r, 'Piece'); pieceN.set(p, (pieceN.get(p) || 0) + 1); }
  const kg = (s) => { const v = num(s, 10); return v === null ? null : v / 10; };
  const orgName = (code) => { const o = orgBy.get(code); return o ? [dash(orgs.get(o, 'ShortName')) || code, dash(orgs.get(o, 'EName')) || dash(orgs.get(o, 'Name'))] : [code.replace(/\?$/, ''), '']; };
  const ownerOf = (code, state) => {
    if (!code) return null;
    if (orgBy.has(code)) { const [s, n] = orgName(code); return [s, n && n !== s ? n : '', state]; }
    return [code.split('/').map((k) => orgName(k)[0]).join(' / '), '', state];
  };
  const by = new Map();
  let nAct = 0, nWiki = 0;
  for (const { c, r, j, tg } of items) {
    const g = (k) => dash(c.get(r, k)), pp = purpose.get(j), pg = (k) => (pp ? dash(pp[0].get(pp[1], k)) : ''), cr = now.get(j), cg = (k) => (cr ? dash(cur.get(cr, k)) : '');
    const o = { p: g('Piece') };
    if (/^\d+$/.test(g('Satcat'))) o.n = +g('Satcat');
    o.ad = g('Name') || g('PLName') || '?';
    const alt = [...new Set([g('PLName'), cg('Name'), pg('Name').startsWith('[') ? '' : pg('Name')])].filter((x) => x && x !== o.ad && x !== '?');
    if (alt.length) o.ad2 = alt.slice(0, 3).join(' · ');
    const k = pg('Category').replace(/\*/g, ''), d = pg('Discipline').replace(/\*/g, '');
    if (k) o.k = k; if (d) o.d = d; if (pg('Program')) o.pr = pg('Program'); if (pg('Class')) o.s = pg('Class');
    o.o = ownerOf(g('Owner'), g('State'));
    const m = kg(g('Mass')); if (m) o.kg = m;
    const st = j[0] === 'F' ? ['F'] : cr ? statusOf(cur.get(cr, 'ExpandedStatus')) : [PHASE[g('Status')] || '?', PHASE[g('Status')] ? '' : g('Status')];
    o.st = st[0]; if (st[1]) o.sb = st[1];
    const dd = vdate(cr ? cg('DDate') : g('DDate')); if (dd && o.st !== 'O') o.sd = dd;
    if (active.has(j)) { o.ak = 1; nAct++; }
    // yörünge: hâlâ Dünya yörüngesindeyse güncel, değilse ilk (nesne kataloğu) değerleri
    const live = cr && ['O', 'A', 'K'].includes(o.st), og = live ? cg : g;
    const pe = num(og('Perigee')), ap = num(og('Apogee')), inc = deg(og('Inc'));
    if (pe !== null && ap !== null) { o.pe = pe; o.ap = ap; if (live) o.yg = 1; }
    if (inc !== null) o.inc = Math.round(inc * 10) / 10;
    const te = pg('TOp'); if (te && te !== '*' && !o.ak) o.te = vdate(te);
    if (['F', 'N'].includes(pg('Result'))) o.r = pg('Result');
    if (pg('Comment')) o.c = pg('Comment');
    const w = (o.n && wiki.byN.get(o.n)) || (pieceN.get(o.p) === 1 && wiki.byC.get(o.p)) || wiki.old.get(o.p + '|' + o.ad);
    if (w) { if (w.we) o.we = w.we; if (w.wt) o.wt = w.wt; nWiki++; }
    o._j = j;
    if (!by.has(tg)) by.set(tg, []);
    by.get(tg).push(o);
  }
  // sıra: standart katalog (NORAD sırası, genelde A, B, C…), sonra yardımcı ve yörüngeye ulaşamayanlar
  const rank = (o) => ({ S: 0, A: 1, F: 2 }[o._j[0]] ?? 3) * 1e7 + (+o._j.slice(1) || 0);
  const main = new Map(), years = new Map();
  for (const [tg, list] of by) {
    list.sort((a, b) => rank(a) - rank(b));
    if (list.length > 12) for (const o of list) delete o.ad2;     // kalabalık takımyıldız fırlatmalarında öteki adlar (Starlink-32713…) gereksiz
    const heavy = list.filter((o) => o.k).sort((a, b) => (b.kg || 0) - (a.kg || 0))[0];
    if (heavy) main.set(tg, heavy.k.split('/')[0].replace('?', ''));
    const y = yearOf.get(tg);
    if (!years.has(y)) years.set(y, { org: [], at: new Map(), L: {} });
    const Y = years.get(y);
    Y.L[tg] = list.map(({ _j, o: own, ...rest }) => {
      if (!own) return rest;
      const key = own.join('|'); if (!Y.at.has(key)) { Y.at.set(key, Y.org.length); Y.org.push(own); }
      return { ...rest, o: Y.at.get(key) };
    });
  }
  const fold = (s) => s.toLowerCase();
  const words = (tg, mis, pl) => {
    const list = by.get(tg) || [], have = fold(`${mis} ${pl}`), out = new Set();
    for (const o of list) if (o.pr) out.add(o.pr);
    if (list.length <= 12) for (const o of list) out.add(o.ad);
    return [...out].filter((w) => !have.includes(fold(w))).join(' · ');
  };
  return { by, main, words, n: items.length, nAct, nWiki, wikiNote: wiki.note, years: new Map([...years].sort((a, b) => a[0] - b[0]).map(([y, Y]) => [y, { org: Y.org, L: Y.L }])) };
}

const META = { kaynak: 'GCAT — General Catalog of Artificial Space Objects, J. C. McDowell', url: 'https://planet4589.org/space/gcat', lisans: 'CC-BY-4.0',
  atif: 'Data from J. McDowell, planet4589.org', surum: rel, veri: upd, derlendi: new Date().toISOString().slice(0, 10) };

// ---------------------------------------------------------------- yükler
const P = await payloads(cols);
cols.am = cols.tag.map((tg) => P.main.get(tg) || '');            // ana yükün amacı (en ağır yükün ilk kategorisi: COM, SCI, SS…)
cols.ny = cols.tag.map((tg) => (P.by.get(tg) || []).length);    // yük sayısı
cols.yn = cols.tag.map((tg, i) => P.words(tg, cols.mis[i], cols.pl[i]));   // aramada yük adları ve programlar

const out = { meta: { ...META, n: cols.t.length }, lv: LV.list, site: SITE.list, ag: AG.list, c: cols };
fs.writeFileSync(new URL('../web/data/launchdb.json', import.meta.url), JSON.stringify(out));
const pdir = new URL('../web/data/payloads/', import.meta.url);
fs.mkdirSync(pdir, { recursive: true });
for (const f of fs.readdirSync(pdir)) if (/^\d{4}\.json$/.test(f)) fs.unlinkSync(new URL(f, pdir));
let pBytes = 0;
for (const [y, file] of P.years) { const txt = JSON.stringify({ meta: { ...META, wiki: P.wikiNote, yil: y }, ...file }); pBytes += txt.length; fs.writeFileSync(new URL(`${y}.json`, pdir), txt); }
console.log(`yükler: ${P.n} (${P.nAct} etkin, ${P.nWiki} Vikipedi maddesi; ${P.wikiNote}), ${P.years.size} yıl dosyası, ${(pBytes / 1024).toFixed(0)} KB; yüksüz fırlatma ${cols.ny.filter((x) => !x).length}`);
const y = new Date().getUTCFullYear(), thisYear = cols.t.filter((t) => new Date(t * 1000).getUTCFullYear() === y).length;
console.log(`${cols.t.length} fırlatma (${cols.r.filter((r) => r === 'F').length} başarısız), ${LV.list.length} roket, ${SITE.list.length} fırlatma yeri, ${AG.list.length} kuruluş; ${y}: ${thisYear}; atlanan ${skipped}; GCAT ${rel || '?'} (${upd || '?'})`);
