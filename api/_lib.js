// LS19 bulut (Vercel) veri vekili — ortak yardımcılar. Yerel karşılığı: web/sunucu.py (aynı uç noktalar, aynı biçim).
// Güncelleme düzeni: tarayıcı /api/surum'u 10 dakikada bir sorar. Buluttaki sürüm, kaynağın izinli yenileme aralığına
// göre zaman kovasıdır (CelesTrak 2 sa, JPL SBDB/Sentry 24 sa). Veri isteği ?v=<kova> taşır; Vercel CDN yanıtı o kova
// boyunca paylaşımlı önbellekte tutar, yani kaynağa kova başına (bölge başına) tek istek gider.
import { gzipSync } from 'node:zlib';

export const PERIODS = { gp: 7200, neo: 86400, mb: 86400, sentry: 86400 };
export const CHECK_S = 600;
const UA = { 'User-Agent': 'LS19/1.1 (Look Star 19 egitim simulasyonu)' };

export function send(body, { status = 200, sMaxAge = 0, swr = 0, headers = {} } = {}) {
  const buf = Buffer.from(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body));
  const cc = sMaxAge > 0 ? `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}` : 'no-store';
  return new Response(gzipSync(buf, { level: 6 }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Encoding': 'gzip', 'Cache-Control': cc, 'CDN-Cache-Control': cc, Vary: 'Accept-Encoding', ...headers } });
}
export const fail = (msg, status = 503) => send({ hata: msg }, { status, sMaxAge: 60, swr: 0 });

export async function getText(url, { tries = 3, timeoutMs = 50000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      if ([429, 502, 503, 504].includes(r.status) && i < tries - 1) { await new Promise((z) => setTimeout(z, 2000 + 3000 * i)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { last = e; if (i === tries - 1) throw e; }
  }
  throw last;
}
export const getJson = async (url, o) => JSON.parse(await getText(url, o));

const num = (x, sig = 12) => { if (x === null || x === undefined || x === '') return null; const v = Number(x); return Number.isFinite(v) ? Number(v.toPrecision(sig)) : null; };
export const SB_FIELDS = 'pdes,name,class,pha,H,diameter,albedo,epoch,a,e,i,om,w,ma,moid,rot_per,spec_B,spec_T,condition_code,data_arc,GM';
export const SBQ = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api?';
// sbdb_query yanıtlarını sütunlu, küçük JSON'a çevir (sunucu.py compact_sbdb ile aynı)
export function compactSbdb(parts) {
  const K = ['des', 'name', 'cls', 'pha', 'H', 'D', 'alb', 'ep', 'a', 'e', 'i', 'om', 'w', 'ma', 'moid', 'rot', 'spec', 'cc', 'arc', 'gm'], cols = {};
  for (const k of K) cols[k] = [];
  for (const j of parts) {
    const f = Object.fromEntries(j.fields.map((n, k) => [n, k]));
    for (const r of j.data || []) {
      const g = (n) => r[f[n]];
      if (g('a') == null || g('e') == null || Number(g('e')) >= 1) continue;
      cols.des.push(g('pdes')); cols.name.push(g('name') || ''); cols.cls.push(g('class')); cols.pha.push(g('pha') === 'Y' ? 1 : 0);
      cols.H.push(num(g('H'), 5)); cols.D.push(num(g('diameter'), 5)); cols.alb.push(num(g('albedo'), 3));
      cols.ep.push(num(g('epoch'), 10)); cols.a.push(num(g('a'))); cols.e.push(num(g('e'))); cols.i.push(num(g('i')));
      cols.om.push(num(g('om'))); cols.w.push(num(g('w'))); cols.ma.push(num(g('ma'))); cols.moid.push(num(g('moid'), 6));
      cols.rot.push(num(g('rot_per'), 6)); cols.spec.push(g('spec_B') || g('spec_T') || ''); cols.cc.push(g('condition_code') || '');
      cols.arc.push(num(g('data_arc'), 7)); cols.gm.push(num(g('GM'), 6));
    }
  }
  return cols;
}
export function compactSentry(j) {
  return (j.data || []).map((s) => ({ des: s.des, ip: num(s.ip, 4), ps: num(s.ps_max, 3), ts: s.ts_max, range: s.range, n: s.n_imp,
    D: num(s.diameter, 3), vinf: num(s.v_inf, 4), last_obs: s.last_obs }));
}
