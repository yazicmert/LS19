// yaklaşan fırlatmalar: The Space Devs, Launch Library 2 (LS19 web/js/launchdata.js ile aynı uç). Ücretsiz katman IP başına saatte 15 istek:
// sayfalar 30 dakikada bir yenilenir (ISR). Yayınlar yalnız bağlantı: resmî (tür 1) önce, sonra önceliğe göre.
export const LL2_UPCOMING = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=25&mode=detailed&hide_recent_previous=true';
export const REVALIDATE = 1800;
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
// kaynak bilinmeyeni yazıyla verir ("Unknown", "TBD", "N/A", görev açıklamasında "Details TBD."): gösterilmez
const PLACEHOLDER = /^(unknown|tbd|tba|tbc|n\/a|none|details tbd\.?|unknown payload)$/i;
export const known = (x) => { const v = str(x); return v && !PLACEHOLDER.test(v) ? v : null; };
// bağlantı süzgeci (ayrıntı sayfası): yalnız http(s) ve geçerli bir ana makine; javascript:, data:, göreli, "//" ile başlayan ya da
// kullanıcı adı/parola taşıyan adresler atılır
export function safeUrl(u) {
  const v = str(u);
  if (!v || !/^https?:\/\//i.test(v)) return null;
  try { const x = new URL(v); return (x.protocol === 'https:' || x.protocol === 'http:') && x.hostname && !x.username && !x.password ? x.href : null; } catch { return null; }
}
// faydalı yük durumu: LL2 yük açıklanmadığında görev adını "Unknown Payload" (ya da TBD) yazar → 'unknown' (ad gösterilmez, açıkça
// "açıklanmadı" yazılır). "SatNet LEO Group TBD?" gibi adın bir kısmı belirsizse 'partial': ad gösterilir, belirsiz olduğu yazılır.
export function payloadState(name) {
  const v = str(name);
  if (!v || PLACEHOLDER.test(v) || /^(unknown|tbd|tba)\b.*payload/i.test(v)) return 'unknown';
  if (/\b(tbd|tba|tbc)\b|\?/i.test(v)) return 'partial';
  return 'known';
}
// LL2 fırlatma kimliği (UUID): ayrıntı sayfası adresi; başka biçimdeki adres kaynağa hiç sorulmaz
export const isLaunchId = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(s || ''));
export const LL2_LAUNCH = (id) => `https://ll.thespacedevs.com/2.3.0/launches/${id}/?mode=detailed`;
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

const agencyName = (a) => str(a && (a.abbrev && a.name && a.name.length > 28 ? a.abbrev : a.name));
export function mapLaunch(r) {
  const mi = r.mission || {}, pad = r.pad || {}, loc = pad.location || {}, cfg = (r.rocket && r.rocket.configuration) || {}, lsp = r.launch_service_provider || {}, st = r.status || {};
  const streams = (Array.isArray(r.vid_urls) ? r.vid_urls : []).filter((v) => v && https(v.url))
    .map((v, i) => ({ url: https(v.url), title: str(v.title), official: !!(v.type && v.type.id === 1), pr: Number(v.priority) || 0, i }))
    .sort((a, b) => b.official - a.official || b.pr - a.pr || a.i - b.i).slice(0, 3).map(({ url, title, official }) => ({ url, title, official }));
  const payload = payloadState(mi.name), orbit = mi.orbit || {};
  const core = ((r.rocket && r.rocket.launcher_stage) || []).find((x) => x && x.launcher) || null, L = core ? core.launcher : {};
  const land = core && core.landing, landType = land && land.type, landLoc = land && land.landing_location;
  const sc = ((r.rocket && r.rocket.spacecraft_stage) || [])[0], cnt = (lsp.country && (Array.isArray(lsp.country) ? lsp.country[0] : lsp.country)) || {};
  return {
    id: str(r.id), name: str(r.name), net: str(r.net), precision: precisionOf(r.net_precision && r.net_precision.name), updated: str(r.last_updated),
    status: { abbrev: str(st.abbrev), name: str(st.name) }, live: r.webcast_live === true,
    vehicle: str(cfg.full_name) || str(cfg.name), provider: str(lsp.name), providerCountry: str(cnt.alpha_2_code),
    payload,
    mission: {
      name: payload === 'unknown' ? null : str(mi.name), type: known(mi.type), orbit: known(orbit.name), orbitAbbrev: known(orbit.abbrev), description: known(mi.description),
      customers: (Array.isArray(mi.agencies) ? mi.agencies : []).map(agencyName).filter(Boolean),
    },
    programs: (Array.isArray(r.program) ? r.program : []).map((p) => str(p && p.name)).filter(Boolean),
    booster: core ? {
      serial: !L.is_placeholder && known(L.serial_number) && !/^unknown\b/i.test(L.serial_number) ? str(L.serial_number) : null, flight: Number.isFinite(core.launcher_flight_number) ? core.launcher_flight_number : null,
      landing: land && land.attempt === true ? (known(landType && landType.abbrev) || 'yes') : land && land.attempt === false ? 'none' : null, landingAt: known(landLoc && (landLoc.abbrev || landLoc.name)),
    } : null,
    spacecraft: sc ? str((sc.spacecraft && sc.spacecraft.name) || null) : null, crew: sc && Array.isArray(sc.launch_crew) ? sc.launch_crew.length : 0,
    pad: { name: str(pad.name), location: str(loc.name), lat: Number.isFinite(+pad.latitude) && pad.latitude !== null ? +pad.latitude : null, lon: Number.isFinite(+pad.longitude) && pad.longitude !== null ? +pad.longitude : null },
    streams,
  };
}
// liste satırı (istemciye giden ince kayıt): açıklama ve akış başlıkları gitmez
export const listRow = (l, rocket = null) => {
  const { description, ...mission } = l.mission;
  return { ...l, rocket, mission, streams: l.streams.map(({ url, official }) => ({ url, official })) };
};
// { ok, launches, fetched }. Derlemede kaynak yanıt vermezse ok: false (sayfa veri uydurmaz, kaynağın sınırını söyler; derleme sürer).
// Yayındayken (ISR yenilemesi) hata fırlatılır: Next yeni sayfayı kaydetmez, son başarılı sayfa sunulmaya devam eder; böylece geçici bir
// 429 ya da zaman aşımı, 30 dakika boyunca "veri alınamıyor" yazan bir sayfa bırakmaz.
export const TIMEOUT_MS = 10_000;
// geliştirme sunucusunda da (next dev) hata sayfası yerine not gösterilir
const graceful = () => process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV !== 'production';
const UA = { 'User-Agent': 'lookstar19/0.1 (non-commercial space library)', Accept: 'application/json' };
// liste uç noktası mode=detailed ile her fırlatmanın ayrıntısını (görev, kurumlar, kademeler, iniş, mürettebat, güncellemeler, çizelge,
// bağlantılar) zaten verir: ayrıntı sayfaları aynı isteği (aynı adres ve seçenekler → Next veri önbelleği) kullanır, fırlatma başına istek yok.
// raw: kaynağın kayıtları (yalnız sunucuda; ayrıntı sayfası lib/launch-detail.js ile eşler)
export async function getUpcoming({ fetchImpl = fetch, atBuild = graceful() } = {}) {
  let fail;
  try {
    const r = await fetchImpl(LL2_UPCOMING, { headers: UA, next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.results)) {
        const raw = [], launches = [];
        for (const x of j.results) { const l = x && mapLaunch(x); if (l && l.id && l.net && l.name && Number.isFinite(Date.parse(l.net))) { raw.push(x); launches.push(l); } }
        return { ok: true, launches, raw, fetched: new Date().toISOString() };
      }
      fail = 'unexpected response shape';
    } else fail = `HTTP ${r.status}`;
  } catch (e) { fail = String((e && e.message) || e).slice(0, 80); }
  if (!atBuild) throw new Error(`Launch Library 2: ${fail}`);
  console.warn(`lookstar19: Launch Library 2 alınamadı (${fail}); sayfa "veri yok" notuyla derleniyor`);
  return { ok: false, launches: [], raw: [], status: fail };
}
// tek fırlatma (ayrıntı sayfası): önce yaklaşan listesinde (ek istek yok); listede değilse (fırlatıldı ya da listeden düştü) ve kimlik
// UUID biçimindeyse kaynağın tek kayıt ucu, 30 dakikalık önbellekle. { raw } | { notFound: true } | { error }. Hata yayında fırlatılmaz:
// sayfa karar verir (yenilemede hata fırlatıp eski sayfayı tutar).
export async function getLaunch(id, { fetchImpl = fetch, atBuild = graceful() } = {}) {
  if (!isLaunchId(id)) return { notFound: true };
  let up;
  try { up = await getUpcoming({ fetchImpl, atBuild }); } catch (e) { return { error: String(e.message || e) }; }
  const hit = up.raw.find((x) => x.id === id);
  if (hit) return { raw: hit, from: 'list' };
  try {
    const r = await fetchImpl(LL2_LAUNCH(id), { headers: UA, next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status === 404) return { notFound: true };
    if (!r.ok) return { error: `Launch Library 2: HTTP ${r.status}` };
    const j = await r.json();
    return j && j.id === id && mapLaunch(j).net ? { raw: j, from: 'single' } : { notFound: true };
  } catch (e) { return { error: `Launch Library 2: ${String((e && e.message) || e).slice(0, 80)}` }; }
}
// sıradaki: zamanı geçmemiş, sonuçlanmamış ve saati bilinen (saniye/dakika/saat kesinliğinde) ilk fırlatma: geri sayım yalnız ona.
// Tarihi yalnız ay ya da çeyrek olarak bilinenler listede kalır ama "sıradaki" sayılmaz.
export const nextLaunch = (list, now = Date.now()) => list.find((l) => Date.parse(l.net) > now - 60_000 && !['Success', 'Failure'].includes(l.status.abbrev) && countable(l.precision)) || null;
