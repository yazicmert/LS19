// Fırlatma veritabanı: 1957'den bugüne tüm yörüngesel ve derin uzay fırlatmaları -> web/data/launchdb.json (sütunlu, küçük).
// Kaynak: GCAT — General Catalog of Artificial Space Objects, Jonathan C. McDowell (planet4589.org/space/gcat), lisans CC-BY-4.0:
// kaynak gösterilerek serbestçe kullanılabilir ("Data from J. McDowell, planet4589.org"). Üç tablo: launch.tsv (fırlatma kaydı; sonda
// roketleri dahil ~76.000 satır), orgs.tsv (kuruluşlar: kısa ad, ülke), sites.tsv (fırlatma yerleri: ad, ülke, konum).
// Süzgeç: LaunchCode ilk harfi O (yörünge) ya da D (derin uzay), ikinci harfi S (başarılı) ya da F (başarısız); ekteki sayı McDowell'in
// başarı oranıdır (OS75 = 0,75; 0,75'in altı başarısız sayılır). Yaklaşan ve son günlerin fırlatmaları ayrıca canlı LL2'den gelir (launchdata.js).
// Kullanım (depo kökünden):
//   node tools/firlatma_db.mjs                       GCAT'ten indirir
//   node tools/firlatma_db.mjs <klasör>              önceden indirilmiş launch.tsv, orgs.tsv, sites.tsv'den (vekilli ortamlarda)
import fs from 'fs';
import path from 'path';

const BASE = 'https://planet4589.org/space/gcat/tsv/';
const FILES = { launch: 'launch/launch.tsv', orgs: 'tables/orgs.tsv', sites: 'tables/sites.tsv' };
const UA = { 'User-Agent': 'LS19/1.1 (Look Star 19 egitim simulasyonu; +https://github.com/yazicmert/LS19)' };
const dir = process.argv[2];

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
const out = {
  meta: { kaynak: 'GCAT — General Catalog of Artificial Space Objects, J. C. McDowell', url: 'https://planet4589.org/space/gcat', lisans: 'CC-BY-4.0',
    atif: 'Data from J. McDowell, planet4589.org', surum: rel, veri: upd, derlendi: new Date().toISOString().slice(0, 10), n: cols.t.length },
  lv: LV.list, site: SITE.list, ag: AG.list, c: cols,
};
fs.writeFileSync(new URL('../web/data/launchdb.json', import.meta.url), JSON.stringify(out));
const y = new Date().getUTCFullYear(), thisYear = cols.t.filter((t) => new Date(t * 1000).getUTCFullYear() === y).length;
console.log(`${cols.t.length} fırlatma (${cols.r.filter((r) => r === 'F').length} başarısız), ${LV.list.length} roket, ${SITE.list.length} fırlatma yeri, ${AG.list.length} kuruluş; ${y}: ${thisYear}; atlanan ${skipped}; GCAT ${rel || '?'} (${upd || '?'})`);
