// lookstar19 fırlatma üsleri: 1957'den bu yana her yörünge/derin uzay fırlatmasının (GCAT launch.tsv, LaunchCode O/D) yapıldığı üs,
//   rampa, araç, görev, ulaşılan yörünge eğimi, yük sayısı ve sonuç; üs ve rampa koordinatları GCAT sites.tsv ve lp.tsv'den, eğim ve yükler satcat.tsv'den.
// GCAT aynı üssü dönemine ya da işletmecisine göre ayrı kodlarla tutar (Baykonur: NIIP-5, GIK-5; Plesetsk: NIIP-53, GIK-1, GNIIPV …):
//   kısa adı (ShortName) aynı olanlar tek üs sayılır; ayrıca BIRLES'teki ad değişiklikleri birleştirilir. Ülke, üssün bugün bulunduğu ülkedir (ISO 3166).
// Kaynak: GCAT, J. McDowell (planet4589.org), CC BY 4.0. Kullanım (depo kökünden): node site/scripts/usler.mjs [--yerel klasör] [--rapor rapor.md]
//   --yerel: launch.tsv, sites.tsv, lp.tsv, satcat.tsv, orgs.tsv önceden indirilmişse o klasörden okunur (vekilli ortamlar)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTsv, gcatDate } from '../lib/sat.js';
import { rocketSlug } from '../lib/rockets-match.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(ROOT, 'site/data/sites.json');
const GCAT = 'https://planet4589.org/space/gcat/tsv', UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null), YEREL = arg('--yerel'), RAPOR = arg('--rapor');
const num = (v) => { const s = String(v ?? '').trim().replace(/[?~]$/, ''); return s && s !== '-' && Number.isFinite(+s) ? +s : null; };
const txt = (v) => { const s = String(v ?? '').trim(); return s && s !== '-' ? s : null; };

async function get(f) {
  if (YEREL) return fs.readFileSync(path.join(YEREL, path.basename(f)), 'utf8');
  for (let k = 1; ; k++) {
    try { const r = await fetch(`${GCAT}/${f}`, { headers: UA, signal: AbortSignal.timeout(180_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
    catch (e) { if (k >= 3) throw new Error(`${f}: ${e.message}`); await new Promise((res) => setTimeout(res, 3000 * k)); }
  }
}
const [launchTxt, sitesTxt, lpTxt, satTxt, orgsTxt] = await Promise.all(['launch/launch.tsv', 'tables/sites.tsv', 'tables/lp.tsv', 'cat/satcat.tsv', 'tables/orgs.tsv'].map(get));
const orgs = new Map(parseTsv(orgsTxt).map((r) => [r.Code, r]));
const updated = (/# Updated (\d{4} \w{3} +\d{1,2})/.exec(launchTxt) || [])[1] || null;
const launches = parseTsv(launchTxt), sites = new Map(parseTsv(sitesTxt).map((r) => [r.Site, r]));
const pads = new Map(parseTsv(lpTxt).map((r) => [`${r.Site}|${r.Code}`, r]));
if (launches.length < 50000 || sites.size < 500 || pads.size < 1000) throw new Error('GCAT tabloları eksik');
// ulaşılan eğim: fırlatma kaydında (Inc) yoksa o fırlatmanın katalogdaki ilk roket gövdesinin (üst kademe: fırlatma yörüngesinde kalır) eğimi;
// o da yoksa ilk yükün. Yükün sonraki eğimi fırlatmayı değil kendi manevrasını gösterebilir (yer eşzamanlı uydular ~0°), bu yüzden son seçenek.
// Yük sayısı: katalogda Type'ı P ile başlayan nesneler.
const sat = parseTsv(satTxt), byTag = new Map();
if (sat.length < 60000) throw new Error('GCAT satcat eksik');
for (const o of sat) {
  const tag = txt(o.Launch_Tag), ty = String(o.Type || '').trim(), inc = num(o.Inc); if (!tag) continue;
  const r = byTag.get(tag) || { incR: null, incP: null, np: 0 };
  if (/^R/.test(ty) && r.incR == null && inc != null) r.incR = inc;
  if (/^P/.test(ty)) { r.np++; if (r.incP == null && inc != null) r.incP = inc; }
  byTag.set(tag, r);
}

// aynı yerin farklı kısa adları (GCAT kısa adı → üs). Point Arguello 1964'te Vandenberg'e katıldı; Kagoshima Uzay Merkezi 2003'ten beri Uchinoura.
const BIRLES = { 'Wallops I': 'Wallops', 'Wallops MARS': 'Wallops', Kagoshima: 'Uchinoura', 'Spaceport Florida': 'Canaveral', 'Pt Arguello': 'Vandenberg' };
// üssün bugün bulunduğu ülke (ISO 3166-1 alfa-2; GCAT'in devlet kodu tarihseldir: SU, J, GUF …). Deniz bölgeleri: işletmecinin ülkesi, deniz=true
const ULKE = {
  Plesetsk: 'RU', 'Kapustin Yar': 'RU', Vostochniy: 'RU', Svobodniy: 'RU', Yasniy: 'RU', 'Barents Sea': 'RU', Baykonur: 'KZ',
  Canaveral: 'US', Kennedy: 'US', Vandenberg: 'US', Wallops: 'US', Kodiak: 'US', Starbase: 'US', 'China Lake': 'US', 'Edwards AFB': 'US', Mojave: 'US', Kauai: 'US',
  Kourou: 'GF', Jiuquan: 'CN', Xichang: 'CN', Taiyuan: 'CN', Wenchang: 'CN', 'Hainan CLS': 'CN', 'Huang Hai': 'CN', Yangjiang: 'CN', 'East China Sea': 'CN',
  Sriharikota: 'IN', Tanegashima: 'JP', Uchinoura: 'JP', Kii: 'JP', Mahia: 'NZ', Kirimati: 'KI', Semnan: 'IR', Shahroud: 'IR', Palmachim: 'IL', Kwajalein: 'MH',
  'San Marco': 'KE', Naro: 'KR', Jeju: 'KR', Tonghae: 'KP', Woomera: 'AU', Bowen: 'AU', Hammaguir: 'DZ', Alcantara: 'BR', Andoya: 'NO', Gando: 'ES', Newquay: 'GB',
};
const DENIZ = new Set(['Kirimati', 'Barents Sea', 'East China Sea', 'Huang Hai', 'Yangjiang', 'Jeju']);
const outcome = (code) => { const c = String(code || '').trim()[1]; return c === 'S' ? 'S' : c === 'F' ? 'F' : c === 'E' ? 'E' : 'U'; };
const slugOf = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const orbital = launches.filter((l) => /^[OD]/.test(l.LaunchCode || ''));
const groups = new Map(), unknown = [];
for (const l of orbital) {
  let code = txt(l.Launch_Site); if (code === 'TYSC?') code = 'TYSC';                      // GCAT'te kuşkulu işaretli tek kayıt: Taiyuan
  const s = sites.get(code); if (!s) { unknown.push(l.Launch_Tag); continue; }
  const short = txt(s.ShortName) || code, key = BIRLES[short] || short;
  const g = groups.get(key) || { key, codes: new Set(), names: new Set(), site: s, rows: [] };
  g.codes.add(code); g.names.add(txt(s.Name)); g.rows.push({ l, s, code }); groups.set(key, g);
}
const out = [];
for (const g of groups.values()) {
  const padStat = new Map(), lvStat = new Map(), byYear = {};
  const L = g.rows.map(({ l, code }) => {
    const d = gcatDate(l.Launch_Date), pc = txt(l.Launch_Pad), p = pc ? pads.get(`${code}|${pc}`) : null, pk = p ? `${code}|${pc}` : null;
    if (pk) { const ps = padStat.get(pk) || { code: pc, name: txt(p.ShortName) || txt(p.Name) || pc, lat: num(p.Latitude), lon: num(p.Longitude), n: 0, first: null, last: null }; ps.n++; padStat.set(pk, ps); if (d) { ps.first = ps.first && ps.first < d.iso ? ps.first : d.iso; ps.last = ps.last && ps.last > d.iso ? ps.last : d.iso; } }
    const lv = txt(l.LV_Type); lvStat.set(lv, (lvStat.get(lv) || 0) + 1);
    if (d) byYear[d.iso.slice(0, 4)] = (byYear[d.iso.slice(0, 4)] || 0) + 1;
    const air = txt(l.Platform) && !/^(MLP|LUT|ML)/.test(l.Platform.trim()) ? txt(l.Platform) : null;  // uçak, gemi, platform (seyyar kule değil)
    const tg = txt(l.Launch_Tag), c = byTag.get(tg) || {}, inc = num(l.Inc) ?? c.incR ?? c.incP ?? null;
    return { tag: tg, d: d && d.iso, t: d && d.time, lv, v: txt(l.Variant), m: txt(l.Mission) || txt(l.Flight), pad: pc, inc, np: c.np || 0, o: outcome(l.LaunchCode), deep: /^D/.test(l.LaunchCode), air };
  }).filter((x) => x.d).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : String(a.t).localeCompare(String(b.t))));
  if (!L.length) continue;
  // üs konumu: fırlatma sayısıyla ağırlıklı rampa ortalaması (rampa koordinatı yoksa GCAT üs koordinatı)
  const P = [...padStat.values()].filter((p) => p.lat != null && p.lon != null), w = P.reduce((n, p) => n + p.n, 0);
  const lat = w ? P.reduce((s, p) => s + p.lat * p.n, 0) / w : num(g.site.Latitude), lon = w ? P.reduce((s, p) => s + p.lon * p.n, 0) / w : num(g.site.Longitude);
  const name = g.key, ok = L.filter((x) => x.o === 'S').length, bad = L.filter((x) => x.o === 'F').length;
  // işletmeci: en son fırlatma yapılan GCAT kodunun üst kuruluşu (Parent → orgs.tsv; İngilizce adı, sınıfı B ticari / C sivil / D savunma);
  // üst kuruluş bir devletse (Type CY) işletmeci yazılmaz. Kullanımda: kodların en erken TStart'ı ile ilk fırlatma yılının küçüğü
  const lastCode = g.rows.reduce((b, r) => ((r.l.Launch_Date || '') > (b.l.Launch_Date || '') ? r : b), g.rows[0]).code, par = txt(sites.get(lastCode).Parent), og = par ? orgs.get(par) : null;
  const operator = og && !/^CY/.test(String(og.Type || '').trim()) ? { short: txt(og.ShortName) || par, name: txt(og.EName) || txt(og.Name) || null, code: par, cls: /^[BCD]$/.test(String(og.Class || '').trim()) ? og.Class.trim() : null } : null;
  const ys = [...g.codes].map((c) => +(String(sites.get(c).TStart || '').match(/^\d{4}/) || [0])[0]).filter((y) => y > 1900);
  out.push({
    slug: slugOf(name), name, full: [...g.names].filter(Boolean)[0] || name, gcat: [...g.codes].sort(), cc: ULKE[name] || null, sea: DENIZ.has(name),
    operator, established: Math.min(...ys, +L[0].d.slice(0, 4)),
    lat: lat == null ? null : +lat.toFixed(4), lon: lon == null ? null : +lon.toFixed(4),
    stats: { total: L.length, success: ok, failure: bad, deep: L.filter((x) => x.deep).length, first: L[0].d, last: L[L.length - 1].d },
    byYear, rockets: [...lvStat.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ name: n, n: c, slug: rocketSlug(n) })),
    pads: [...padStat.values()].sort((a, b) => b.n - a.n).map((p) => ({ ...p, lat: p.lat == null ? null : +p.lat.toFixed(4), lon: p.lon == null ? null : +p.lon.toFixed(4) })),
    launches: L,
  });
}
out.sort((a, b) => b.stats.total - a.stats.total || a.name.localeCompare(b.name));

// doğrulama: tekil adres, koordinat, ülke, toplam; tutmazsa yazılmaz
const errors = [], seen = new Set(), total = out.reduce((n, s) => n + s.stats.total, 0);
for (const s of out) {
  if (seen.has(s.slug)) errors.push(`${s.name}: adres çakışması`); seen.add(s.slug);
  if (!(Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180)) errors.push(`${s.name}: koordinat yok`);
  if (!s.cc) errors.push(`${s.name}: ülke eşlemesi yok (ULKE'ye ekleyin)`);
}
if (unknown.length > 5) errors.push(`üs kodu bulunamayan ${unknown.length} fırlatma`);
if (out.length < 40 || total < 7000) errors.push(`beklenenden az: ${out.length} üs, ${total} fırlatma`);
let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* ilk çalıştırma */ }
if (prev && total < prev.total) errors.push(`fırlatma sayısı azaldı: ${prev.total} → ${total}`);
if (errors.length) { console.error(`veri yazılmadı:\n${errors.map((x) => `  - ${x}`).join('\n')}`); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify({ retrieved: new Date().toISOString().slice(0, 10), source: 'GCAT, J. McDowell, planet4589.org (CC BY 4.0)', updated, total, sites: out }) + '\n');
const summary = `${out.length} fırlatma üssü, ${total} yörünge/derin uzay fırlatması (1957–); GCAT ${updated}.${prev ? ` Önceki: ${prev.total}.` : ''}`;
console.log(summary);
if (RAPOR) fs.writeFileSync(RAPOR, `### Fırlatma üsleri\n\n${summary}\n`);
