// yaklaşan fırlatmalar: The Space Devs, Launch Library 2 (LS19 web/js/launchdata.js ile aynı uç). Ücretsiz katman IP başına saatte 15 istek:
// sayfalar 30 dakikada bir yenilenir (ISR). Yayınlar yalnız bağlantı: resmî (tür 1) önce, sonra önceliğe göre.
export const LL2_UPCOMING = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=25&mode=detailed&hide_recent_previous=true';
export const REVALIDATE = 1800;
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const known = (x) => { const v = str(x); return v && !/^(unknown|tbd|n\/a)$/i.test(v) ? v : null; };          // kaynak bilinmeyeni yazıyla verir: gösterilmez
// LL2'nin tarih kesinliği (net_precision.name): saniye/dakika → kesin; saat; gün (sabah/öğleden sonra dahil); hafta; ay; çeyrek; yarıyıl; yıl.
// Kesin olmayan tarihte NET (en erken) tarihi aralığın sonuna yakın verilir (ay kesinliğinde ayın son günü): saniyeli geri sayım yanıltır.
export function precisionOf(name) {
  const n = String(name || '').trim();
  if (!n || /^(second|minute)$/i.test(n)) return { kind: 'exact' };          // kesinlik yazılmamışsa kaynak saati kesin verir
  if (/^hour$/i.test(n)) return { kind: 'hour' };
  if (/^(day|morning|afternoon|morning\/afternoon|am|pm)/i.test(n)) return { kind: 'day' };
  if (/^week$/i.test(n)) return { kind: 'week' };
  if (/^month$/i.test(n)) return { kind: 'month' };
  let m = /^quarter\s*(\d)$/i.exec(n); if (m) return { kind: 'quarter', part: +m[1] };
  m = /^half\s*(\d)$/i.exec(n); if (m) return { kind: 'half', part: +m[1] };
  if (/year/i.test(n)) return { kind: 'year' };
  return { kind: 'day' };                                                    // tanınmayan: güne yuvarla (saat gösterme)
}
export const countable = (p) => !p || p.kind === 'exact' || p.kind === 'hour';            // kesinliği bilinmeyen kayıt kesin sayılır
const https = (u) => { const v = str(u); return v && /^https:\/\//.test(v) ? v : null; };

export function mapLaunch(r) {
  const mi = r.mission || {}, pad = r.pad || {}, loc = pad.location || {}, cfg = (r.rocket && r.rocket.configuration) || {}, lsp = r.launch_service_provider || {}, st = r.status || {};
  const streams = (Array.isArray(r.vid_urls) ? r.vid_urls : []).filter((v) => v && https(v.url))
    .map((v, i) => ({ url: https(v.url), title: str(v.title), official: !!(v.type && v.type.id === 1), pr: Number(v.priority) || 0, i }))
    .sort((a, b) => b.official - a.official || b.pr - a.pr || a.i - b.i).slice(0, 3).map(({ url, title, official }) => ({ url, title, official }));
  return {
    id: str(r.id), name: str(r.name), net: str(r.net), precision: precisionOf(r.net_precision && r.net_precision.name), updated: str(r.last_updated),
    status: { abbrev: str(st.abbrev), name: str(st.name) }, live: r.webcast_live === true,
    vehicle: str(cfg.full_name) || str(cfg.name), provider: str(lsp.name),
    mission: { name: str(mi.name), type: known(mi.type), orbit: known(mi.orbit && mi.orbit.name), description: str(mi.description) },
    pad: { name: str(pad.name), location: str(loc.name) },
    streams,
  };
}
// { ok, launches, fetched }. Derlemede kaynak yanıt vermezse ok: false (sayfa veri uydurmaz, kaynağın sınırını söyler; derleme sürer).
// Yayındayken (ISR yenilemesi) hata fırlatılır: Next yeni sayfayı kaydetmez, son başarılı sayfa sunulmaya devam eder; böylece geçici bir
// 429 ya da zaman aşımı, 30 dakika boyunca "veri alınamıyor" yazan bir sayfa bırakmaz.
export const TIMEOUT_MS = 10_000;
// geliştirme sunucusunda da (next dev) hata sayfası yerine not gösterilir
const graceful = () => process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV !== 'production';
export async function getUpcoming({ fetchImpl = fetch, atBuild = graceful() } = {}) {
  let fail;
  try {
    const r = await fetchImpl(LL2_UPCOMING, {
      headers: { 'User-Agent': 'lookstar19/0.1 (non-commercial space library)', Accept: 'application/json' },
      next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.results)) {
        const launches = j.results.map(mapLaunch).filter((l) => l.net && l.name && Number.isFinite(Date.parse(l.net)));
        return { ok: true, launches, fetched: new Date().toISOString() };
      }
      fail = 'unexpected response shape';
    } else fail = `HTTP ${r.status}`;
  } catch (e) { fail = String((e && e.message) || e).slice(0, 80); }
  if (!atBuild) throw new Error(`Launch Library 2: ${fail}`);
  console.warn(`lookstar19: Launch Library 2 alınamadı (${fail}); sayfa "veri yok" notuyla derleniyor`);
  return { ok: false, launches: [], status: fail };
}
// sıradaki: zamanı geçmemiş, sonuçlanmamış ve saati bilinen (saniye/dakika/saat kesinliğinde) ilk fırlatma: geri sayım yalnız ona.
// Tarihi yalnız ay ya da çeyrek olarak bilinenler listede kalır ama "sıradaki" sayılmaz.
export const nextLaunch = (list, now = Date.now()) => list.find((l) => Date.parse(l.net) > now - 60_000 && !['Success', 'Failure'].includes(l.status.abbrev) && countable(l.precision)) || null;
