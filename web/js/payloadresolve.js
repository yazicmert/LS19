// Görev yükü çözümleyici: yük listesi veritabanında olmayan fırlatmalar (yaklaşan, veritabanından yeni) ve Vikipedi eşlemesi olmayan yükler için
// görev ya da yük adından bilgi toplar. Sıra:
//   1) LL2 yük uçuşları ve araç (launchdata.js d.yuk) — kaynak bildirmişse (ad, tür, işletmeci, kütle, hedef, kendi sitesi)
//   2) yük ailesi (data/payload_families.json, tools/firlatma_db.mjs): aynı adla daha önce fırlatılmış yüklerin amacı, programı, sahibi, sayısı
//   3) Wikidata (görev adıyla arama; uzay aracı ya da uzay görevi olmalı, fırlatma tarihi ya da COSPAR tutmalı): açıklama, görevin kendi sitesi
//      (P856), Vikipedi maddesi (özet payloads.js wikiSummary ile)
//   4) LL2 görev türü -> amaç grubu (payloads.js GROUPS)
// Görevlerin kendi sitelerinden doğrudan metin çekilmez (her site farklı, tarayıcı izin vermez); bağlantıları gösterilir.
// Saf yardımcılar Node'da sınanır (test/test_payloadresolve.js); ağ işlevleri fetchFn alır.
import { nameStem } from './payloads.js';

// LL2 görev türü -> amaç grubu
export const LL2_TYPE = {
  Communications: 'com', 'Earth Science': 'yer', Navigation: 'nav', 'Government/Top Secret': 'ask', 'Planetary Science': 'gez', 'Robotic Exploration': 'gez',
  'Lunar Exploration': 'gez', Astrophysics: 'bil', Heliophysics: 'bil', Biology: 'bil', 'Human Exploration': 'ins', Resupply: 'ins', Tourism: 'ins',
  Technology: 'tek', 'Test Flight': 'tek', 'Mission Extension': 'tek',
};
export const ll2Group = (type) => LL2_TYPE[type] || '';

const fold = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// görev adından aranacak adlar: ayraç dışı ad, ayraç içindekiler, tam ad ("Martian Moons eXploration (MMX)" -> "Martian Moons eXploration", "MMX")
export function nameCandidates(s, max = 3) {
  const t = String(s || '').replace(/\?/g, '').replace(/\s+/g, ' ').trim();
  if (!t || /^(unknown|tbd|tba)\b/i.test(t) || /^\d+\s+(satellites?|payloads?)$/i.test(t)) return [];
  const inner = [...t.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()).filter((x) => !/rideshare|flight \d|launch \d/i.test(x));
  const outer = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const c of [outer, ...inner, t]) if (c && nameStem(c) && !out.some((o) => fold(o) === fold(c))) out.push(c);
  return out.slice(0, max);
}
// yük ailesi: en az 2 yüklü; adın kökü dizinde yoksa sondan sözcük atarak (en az 4 harf ve 3 yük kalacak biçimde) aranır
export function familyLookup(names, fam) {
  if (!fam) return null;
  for (const n of names) {
    const st = nameStem(n); if (!st) continue;
    const words = st.split(' ');
    for (let k = words.length; k >= 1; k--) {
      const key = words.slice(0, k).join(' '), f = fam[key];
      if (!f || f[6] < 2) continue;                                   // tek yüklü "aile" eşleşmesi yanıltıcı olabilir (ör. USSF-627 -> ilgisiz bir uydu)
      if (k < words.length && (key.length < 4 || f[6] < 3)) continue;
      return { kok: key, k: f[0], d: f[1], pr: f[2], s: f[3], sahip: f[4], ulke: f[5], n: f[6], y0: f[7], y1: f[8], ad: n };
    }
  }
  return null;
}

let famCache = null;
export function loadFamilies(url = 'data/payload_families.json') {
  if (!famCache) famCache = fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => j.f).catch((e) => { famCache = null; throw e; });
  return famCache;
}

// Wikidata: görev adıyla arama (EntitySearch), uzay aracı (Q40218) ya da uzay görevi/uçuşu sınıfından olanlar; tarih, COSPAR, kendi sitesi, Vikipedi
export function wikidataQuery(name) {
  return `SELECT ?i ?iLabel ?den ?dtr ?date ?site ?cospar ?en ?tr WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch"; mwapi:search ${JSON.stringify(name)}; mwapi:language "en"; mwapi:limit "8". ?i wikibase:apiOutputItem mwapi:item. ?num wikibase:apiOrdinal true. }
  FILTER EXISTS { ?i wdt:P31/wdt:P279* ?c . VALUES ?c { wd:Q40218 wd:Q2133344 wd:Q5916 wd:Q752783 } }
  OPTIONAL { ?i wdt:P619 ?date } OPTIONAL { ?i wdt:P856 ?site } OPTIONAL { ?i wdt:P247 ?cospar }
  OPTIONAL { ?en schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> } OPTIONAL { ?tr schema:about ?i ; schema:isPartOf <https://tr.wikipedia.org/> }
  OPTIONAL { ?i schema:description ?den FILTER(lang(?den) = "en") } OPTIONAL { ?i schema:description ?dtr FILTER(lang(?dtr) = "tr") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?num LIMIT 12`;
}
const DAY = 86400e3;
const title = (u) => (u ? decodeURIComponent(String(u).split('/wiki/')[1] || '').replace(/_/g, ' ') : null);
// SPARQL satırları -> öğeler (aynı öğenin birden çok sitesi tek kayıtta), sırası korunur
export function wikidataItems(bindings) {
  const by = new Map();
  for (const b of bindings || []) {
    const id = b.i && b.i.value; if (!id) continue;
    if (!by.has(id)) by.set(id, { id: id.split('/').pop(), ad: b.iLabel && b.iLabel.value, aciklama: { en: b.den && b.den.value, tr: b.dtr && b.dtr.value }, tarih: null, cospar: [], site: [], we: title(b.en && b.en.value), wt: title(b.tr && b.tr.value) });
    const it = by.get(id);
    if (b.date && !it.tarih) { const t = Date.parse(b.date.value); if (Number.isFinite(t)) it.tarih = t; }
    if (b.cospar && !it.cospar.includes(b.cospar.value)) it.cospar.push(b.cospar.value);
    if (b.site && /^https:\/\//.test(b.site.value) && !it.site.includes(b.site.value) && it.site.length < 2) it.site.push(b.site.value);
  }
  return [...by.values()];
}
// doğrulama: COSPAR fırlatmanınkiyle başlıyorsa kesin; fırlatma tarihi yakınsa (geçmişte ±3 gün, yaklaşanda ±60 gün) kabul;
// tarihi olmayan öğe yalnız adı aranan adla aynıysa (yanlış eşleşmeyi önlemek için: "Glonass-K1" araması başka bir Kosmos'u bulmasın)
export function pickItem(items, name, { ms = null, cospar = null, now = Date.now() } = {}) {
  const fn = fold(name);
  for (const it of items) {
    if (cospar && it.cospar.some((c) => c.startsWith(cospar))) return it;
    if (cospar && it.cospar.length && ms !== null && ms < now) continue;     // başka bir fırlatmanın nesnesi
    if (it.tarih !== null && ms !== null) { if (Math.abs(it.tarih - ms) <= (ms > now ? 60 : 3) * DAY) return it; continue; }
    const fl = fold(it.ad);
    if (fl && (fl === fn || (fn.length >= 6 && (fl.endsWith(' ' + fn) || fl.startsWith(fn + ' '))))) return it;
  }
  return null;
}
const WD = new Map();
// adlar sırayla denenir; ilk doğrulanan öğe (yoksa null). Sonuç (null dahil) oturum boyunca saklanır, hata saklanmaz.
export async function wikidataLookup(names, opt = {}, fetchFn = fetch) {
  const key = JSON.stringify([names, opt.ms ?? null, opt.cospar ?? null]);
  if (WD.has(key)) return WD.get(key);
  const p = (async () => {
    for (const n of names) {
      const u = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(wikidataQuery(n));
      const sig = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(20e3) } : {};
      const r = await fetchFn(u, { headers: { Accept: 'application/sparql-results+json' }, ...sig });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const it = pickItem(wikidataItems((await r.json()).results.bindings), n, opt);
      if (it) return it;
    }
    return null;
  })();
  WD.set(key, p);
  p.catch(() => WD.delete(key));
  return p;
}
