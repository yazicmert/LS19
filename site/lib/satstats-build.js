// Uydu istatistiği verisinin üretimi (yalnız Node: scripts/uydu_istatistik.mjs ve web/test/test_site.js). Kaynak GCAT (J. McDowell, CC BY 4.0):
//   cat/satcat.tsv + cat/satcat100k.tsv (nesneler; Type "P…" = yük), cat/psatcat*.tsv (yük kataloğu: Class, Category), launch/launch.tsv
//   (fırlatma tarihi UTC, LV_Type), tables/orgs.tsv (ülke ve kurum adları).
// Kapsam: GCAT ana kataloglarında yük (P) türündeki her nesne (uydu, sonda, insanlı/kargo gemisi, küp uydu); roket gövdesi, parça ve enkaz yok.
// Yörüngeye ulaşamayanlar (ftocat) ve kendi katalog kaydı olmayanlar (auxcat) sayılmaz.
// Biçim: aynı gün, sınıf, görev, ülke, araç ve işletmeci bileşimindeki yükler tek satırda toplanır (n); sütunlu diziler, boyutlar kod listesi
// (sıklık sırasıyla), satırlar bu listelere sıra numarasıyla bağlanır; gün sayısı 1957-01-01'den, artış (delta) olarak yazılır.
import { gcatDate } from './sat.js';

const txt = (v) => { const s = v == null ? '' : String(v).trim(); return s && s !== '-' ? s : null; };
export const EPOCH_ISO = '1957-01-01';
const EPOCH = Date.parse(`${EPOCH_ISO}T00:00:00Z`);
export const dayOf = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH) / 864e5);

// GCAT sınıfı: A amatör/akademik, B ticari, C sivil devlet, D savunma; iki harf ortak kullanım (BD …). "?" ve "*" işaretleri atılır.
export const classOf = (s) => { const c = txt(s); return c ? c.replace(/[?*\s]/g, '') || '-' : '-'; };
// GCAT görev türü (Category): iki tane varsa ilki; "?" (kuşkulu) ve "*" (yörüngesi gizli tutulmuş) işaretleri atılır
export const primaryCat = (s) => { const c = txt(s); return c ? c.split('/')[0].replace(/[?*\s]+/g, '') || '-' : '-'; };
// işletmeci: GCAT Owner alanındaki ilk kurum kodu ("?" atılır)
export const firstOwner = (s) => { const c = txt(s); return c ? c.split('/')[0].replace(/[?*\s]+/g, '') || '-' : '-'; };

// GCAT devlet kodları çoğunlukla ISO 3166 ile aynı; tek harfliler uluslararası taşıt kodu (J Japonya, D Almanya …). Ad dile göre Intl'den.
// Tarihsel devletler ve uluslararası kuruluşlar ISO'da yok: adları aşağıda ya da GCAT kurum tablosundan.
const ISO_OF = { J: 'JP', F: 'FR', D: 'DE', I: 'IT', UK: 'GB', L: 'LU', E: 'ES', N: 'NO', S: 'SE', T: 'TH', P: 'PT', B: 'BE', UAE: 'AE', MYM: 'MM' };
const NOT_ISO = new Set(['SU']);                                         // ISO'da "SU" ayrılmış; Intl onu Rusya diye adlandırır
const NAMES = {
  SU: ['Soviet Union', 'Sovyetler Birliği'], 'I-EU': ['European Union', 'Avrupa Birliği'], BGN: ['Bulgaria (People’s Republic)', 'Bulgaristan Halk Cumhuriyeti'],
  CSSR: ['Czechoslovakia', 'Çekoslovakya'], CSFR: ['Czechoslovakia (CSFR)', 'Çekoslovakya (ÇSFC)'], HKUK: ['Hong Kong (British)', 'Hong Kong (İngiliz yönetimi)'],
  ESIB: ['Balearic Islands', 'Balear Adaları'], 'I-ESA': ['ESA', 'ESA'], 'I-ESRO': ['ESRO', 'ESRO'],
};
const region = (lang, iso) => { try { const n = new Intl.DisplayNames([lang], { type: 'region' }).of(iso); return n && n !== iso ? n : null; } catch { return null; } };
export function countryLabels(code, org) {
  if (NAMES[code]) return { en: NAMES[code][0], tr: NAMES[code][1] };
  const iso = ISO_OF[code] || (/^[A-Z]{2}$/.test(code) && !NOT_ISO.has(code) ? code : null);
  const en = iso && region('en', iso), tr = iso && region('tr', iso);
  if (en && tr) return { en, tr };
  const g = org ? txt(org.ShortEName) || txt(org.EName) || txt(org.Name) : null;
  return { en: g || code, tr: g || code };
}
export function orgLabels(code, org) {
  if (!org) return { n: code };
  const n = txt(org.ShortEName) && !/[()]/.test(org.ShortEName) && org.ShortEName.length <= 28 ? txt(org.ShortEName) : txt(org.ShortName) || code;
  const f = txt(org.EName) || txt(org.Name);
  return f && f !== n ? { n, f } : { n };
}

// sat: satcat + satcat100k satırları; psat: JCAT → yük satırı; launches: Launch_Tag → fırlatma; orgs: kod → kurum (en güncel satır)
export function buildStats({ sat, psat, launches, orgs, updated = null, retrieved = null }) {
  const groups = new Map(), counts = { cls: new Map(), mis: new Map(), cc: new Map(), lv: new Map(), op: new Map() };
  let total = 0, undated = 0, noPayloadRow = 0, noLaunch = 0, maxIso = null;
  for (const o of sat) {
    if (!/^P/.test(String(o.Type || '').trim())) continue;
    const L = launches.get(txt(o.Launch_Tag)) || null, ps = psat.get(String(o.JCAT || '').trim()) || null;
    if (!L) noLaunch++;
    if (!ps) noPayloadRow++;
    const dt = gcatDate(L ? L.Launch_Date : null) || gcatDate(o.LDate);
    if (!dt) { undated++; continue; }
    const rec = { d: dayOf(dt.iso), cls: classOf(ps && ps.Class), mis: primaryCat(ps && ps.Category), cc: txt(o.State) || '-', lv: (L && txt(L.LV_Type)) || '-', op: firstOwner(o.Owner) };
    if (!maxIso || dt.iso > maxIso) maxIso = dt.iso;
    const key = `${rec.d}|${rec.cls}|${rec.mis}|${rec.cc}|${rec.lv}|${rec.op}`, g = groups.get(key);
    if (g) g.n++; else groups.set(key, { ...rec, n: 1 });
    for (const k of Object.keys(counts)) counts[k].set(rec[k], (counts[k].get(rec[k]) || 0) + 1);
    total++;
  }
  // boyut listeleri: en sık önce (küçük sıra numaraları, kısa dosya); eşitlikte kod sırası
  const order = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);
  const keys = Object.fromEntries(Object.keys(counts).map((k) => [k, order(counts[k])]));
  const index = Object.fromEntries(Object.entries(keys).map(([k, list]) => [k, new Map(list.map((c, i) => [c, i]))]));
  const dims = {
    cls: keys.cls.map((k) => ({ k })), mis: keys.mis.map((k) => ({ k })), lv: keys.lv.map((k) => ({ k })),
    cc: keys.cc.map((k) => ({ k, ...countryLabels(k, orgs.get(k)) })),
    op: keys.op.map((k) => { const g = orgs.get(k), st = g ? txt(g.StateCode) : null; return { k, ...orgLabels(k, g), ...(st ? { s: st } : {}) }; }),
  };
  const list = [...groups.values()].sort((a, b) => a.d - b.d || index.cls.get(a.cls) - index.cls.get(b.cls) || index.mis.get(a.mis) - index.mis.get(b.mis)
    || index.cc.get(a.cc) - index.cc.get(b.cc) || index.lv.get(a.lv) - index.lv.get(b.lv) || index.op.get(a.op) - index.op.get(b.op));
  const rows = { d: [], cls: [], mis: [], cc: [], lv: [], op: [], n: [] };
  let prev = 0;
  for (const g of list) {
    rows.d.push(g.d - prev); prev = g.d;
    for (const k of ['cls', 'mis', 'cc', 'lv', 'op']) rows[k].push(index[k].get(g[k]));
    rows.n.push(g.n);
  }
  // "bugün" verinin tarihi: GCAT güncelleme tarihi (yoksa en son yük); yıl içi ve son hafta/ay sayıları buna göre
  const up = gcatDate(updated), asOf = up ? up.iso : maxIso;
  return {
    data: { retrieved, source: 'GCAT, J. McDowell, planet4589.org (CC BY 4.0)', updated, asOf, epoch: EPOCH_ISO, total, undated, dims, rows },
    info: { noPayloadRow, noLaunch, groups: list.length },
  };
}

// doğrulama: toplamlar, sıra numaraları, tarihler, etiketler; önceki dosyaya göre sert düşüşte durur. Hata listesi döner (boşsa geçerli).
export function checkStats(data, prev = null, { min = 25000 } = {}) {
  const err = [], R = data.rows, len = R.n.length, D = data.dims;
  if (!['d', 'cls', 'mis', 'cc', 'lv', 'op'].every((k) => Array.isArray(R[k]) && R[k].length === len)) err.push('satır dizilerinin boyu tutmuyor');
  const sum = R.n.reduce((a, b) => a + b, 0);
  if (sum !== data.total) err.push(`toplam tutmuyor: satırlar ${sum}, toplam ${data.total}`);
  if (data.total < min) err.push(`beklenenden az yük: ${data.total}`);
  for (const k of ['cls', 'mis', 'cc', 'lv', 'op']) {
    if (new Set(D[k].map((x) => x.k)).size !== D[k].length) err.push(`${k}: kod tekrarı`);
    if (R[k].some((i) => !Number.isInteger(i) || i < 0 || i >= D[k].length)) err.push(`${k}: geçersiz sıra numarası`);
  }
  if (R.n.some((n) => !Number.isInteger(n) || n < 1)) err.push('geçersiz sayı (n)');
  if (R.d.some((x, i) => !Number.isInteger(x) || (i > 0 && x < 0))) err.push('günler sıralı değil');
  const last = R.d.reduce((a, b) => a + b, 0), asOf = data.asOf ? dayOf(data.asOf) : null;
  if (R.d[0] < 0 || asOf == null || last > asOf + 1) err.push(`tarih aralığı geçersiz (son gün ${last}, veri tarihi ${data.asOf})`);
  if (data.undated > Math.max(10, data.total * 0.001)) err.push(`tarihi okunamayan ${data.undated} yük`);
  if (D.cc.some((c) => !c.en || !c.tr)) err.push('ülke adı eksik');
  if (D.op.some((o) => !o.n)) err.push('işletmeci adı eksik');
  if (prev && prev.total && data.total < prev.total * 0.99) err.push(`yük sayısı sert düştü: ${prev.total} → ${data.total}`);
  return err;
}
