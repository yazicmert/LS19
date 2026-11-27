// JPL'den canlı veri (sunucuda): 1,59 milyonluk katalog için tek cisim kaydı ve liste sorguları. Yanıtlar Next veri önbelleğinde bir gün
// tutulur (aynı cisim ve aynı sorgu günde bir kez JPL'e gider). Eşleme ve doğrulama statik veriyle aynı işlevlerle (lib/jpl.js).
import { mapSbdb, mapCad, mapSentry, CAD_MAX_AU, CAD_RANGE } from './jpl.js';

const API = 'https://ssd-api.jpl.nasa.gov', DAY = 86400;
const UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
async function getJson(url, { revalidate = DAY, timeout = 15_000 } = {}) {
  const r = await fetch(url, { headers: UA, next: { revalidate }, signal: AbortSignal.timeout(timeout) });
  if (r.status >= 500) throw new Error(`JPL ${r.status}`);
  return r.json();
}
// adres: birincil gösterim, boşluk yerine alt çizgi ("2004_MN4", "99942", "3524_P-L")
export const desToSlug = (des) => String(des).trim().replace(/ /g, '_');
export const slugToDes = (slug) => decodeURIComponent(String(slug)).replace(/_/g, ' ').trim();
export const validDes = (des) => /^[0-9A-Za-z][0-9A-Za-z /-]{0,30}$/.test(des);

// tek cisim: SBDB (yörünge, belirsizlik, fiziksel, keşif), CAD (yakın geçişler), Sentry (NEO ise). Bulunamazsa ya da asteroit değilse null
export async function liveAsteroid(des) {
  if (!validDes(des)) return null;
  const d = await getJson(`${API}/sbdb.api?sstr=${encodeURIComponent(des)}&phys-par=1&full-prec=1&discovery=1&alt-des=1`);
  if (!d || !d.object || !d.orbit || !/^a/.test(d.object.kind || '')) return null;
  const s = mapSbdb(d);
  const [cad, sen] = await Promise.all([
    getJson(`${API}/cad.api?des=${encodeURIComponent(s.des)}&date-min=${CAD_RANGE[0]}&date-max=${CAD_RANGE[1]}&dist-max=${CAD_MAX_AU}&body=Earth`).catch(() => null),
    s.neo ? getJson(`${API}/sentry.api?des=${encodeURIComponent(s.des)}`).then(mapSentry).catch(() => null) : null,
  ]);
  return { id: desToSlug(s.des), sstr: s.des, ...s, approaches: cad ? mapCad(cad) : [], cadOk: !!cad, sentry: sen, model: null, spkid: d.object.spkid || null };
}

// katalog sorgusu: yalnız izin verilen süzgeçler ve sıralamalar (sorguya kullanıcı metni girmez)
export const CLASSES = ['MBA', 'IMB', 'OMB', 'APO', 'ATE', 'AMO', 'IEO', 'MCA', 'TJN', 'CEN', 'TNO', 'PAA', 'HYA', 'AST'];
export const SORTS = { H: 'H', D: 'diameter', a: 'a', e: 'e', i: 'i', moid: 'moid', first: 'first_obs', num: 'spkid' };
export const PAGE = 50;
const FIELDS = 'spkid,full_name,pdes,name,prefix,neo,pha,class,H,diameter,a,e,i,moid,first_obs';
const num = (v) => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);
export function listQuery({ group = '', cls = '', h = '', d = false, sort = 'num', dir = 'asc', page = 0 }) {
  const p = new URLSearchParams({ fields: FIELDS, 'sb-kind': 'a', limit: String(PAGE), 'limit-from': String(Math.max(0, Math.min(+page || 0, 40000)) * PAGE) });
  if (group === 'neo' || group === 'pha') p.set('sb-group', group);
  if (CLASSES.includes(cls)) p.set('sb-class', cls);
  const cd = [];
  if (h !== '' && Number.isFinite(+h) && +h > 0 && +h < 40) cd.push(`H|LE|${+h}`);
  if (d) cd.push('diameter|DF');
  const field = SORTS[sort] || 'spkid';
  if (field !== 'spkid') cd.push(`${field}|DF`);                         // sıralanan alanı boş olanlar listenin başına düşmesin
  if (cd.length) p.set('sb-cdata', JSON.stringify({ AND: cd }));
  p.set('sort', `${dir === 'desc' ? '-' : ''}${field}`);
  return `${API}/sbdb_query.api?${p}`;
}
export async function liveList(opts) {
  const j = await getJson(listQuery(opts), { timeout: 25_000 });
  if (!j || !Array.isArray(j.fields)) throw new Error((j && j.message) || 'JPL yanıtı beklenmeyen biçimde');
  const ix = Object.fromEntries(j.fields.map((k, i) => [k, i]));
  const rows = (j.data || []).map((r) => ({
    spk: r[ix.spkid], des: String(r[ix.pdes]).trim(), name: r[ix.name] || null, full: String(r[ix.full_name]).trim(), number: r[ix.prefix] ? null : (/^\d+$/.test(String(r[ix.pdes]).trim()) ? +r[ix.pdes] : null),
    neo: r[ix.neo] === 'Y', pha: r[ix.pha] === 'Y', cls: r[ix.class], H: num(r[ix.H]), D: num(r[ix.diameter]), a: num(r[ix.a]), e: num(r[ix.e]), i: num(r[ix.i]), moid: num(r[ix.moid]), first: r[ix.first_obs] || null,
  }));
  return { count: j.count ?? rows.length, rows };
}
// ön ekle arama: "apo" → apo* (ad, numara ya da gösterim); tek eşleşmede nesne, çoğunda liste
export async function liveFind(q) {
  let s = String(q || '').trim();
  // geçici gösterim ("2024 yr4") JPL'de büyük harfle: yıl + harfler; adlar büyük/küçük harf duyarsız
  if (/^\d{4}\s*[a-z]{1,2}\d*$/i.test(s)) s = s.toUpperCase().replace(/^(\d{4})\s*/, '$1 ');
  if (!s || s.length > 30 || !/^[0-9A-Za-z][0-9A-Za-z '()-]*$/.test(s)) return [];
  const ask = (x) => getJson(`${API}/sbdb.api?sstr=${encodeURIComponent(x)}`, { timeout: 10_000 }).catch(() => null);
  const rows = (j) => (j && j.object ? [{ des: j.object.des, full: String(j.object.fullname).trim(), kind: j.object.kind }].filter((x) => /^a/.test(x.kind || 'a'))
    : j && Array.isArray(j.list) ? j.list.slice(0, 30).map((x) => ({ des: String(x.pdes).trim(), full: String(x.name).trim() })) : []);
  // yalnız sayı yazıldıysa önce o numaralı cisim (433 → Eros), sonra bununla başlayanlar
  const [exact, pre] = await Promise.all([/^\d+$/.test(s) ? ask(s) : null, ask(s.endsWith('*') ? s : `${s}*`)]);
  const out = [...rows(exact), ...rows(pre)], seen = new Set();
  return out.filter((r) => !seen.has(r.des) && seen.add(r.des)).slice(0, 30);
}
// katalogdaki asteroit sayısı (derlemede ve günde bir); JPL yanıt vermezse son bilinen değer
export const KNOWN_COUNT = 1589842;
export async function catalogCount() {
  try { const j = await getJson(`${API}/sbdb_query.api?fields=spkid&sb-kind=a&limit=1`, { timeout: 12_000 }); return Number.isFinite(+j.count) ? +j.count : KNOWN_COUNT; } catch { return KNOWN_COUNT; }
}
