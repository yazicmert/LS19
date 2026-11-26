// yaklaşan fırlatmalar: The Space Devs, Launch Library 2 (LS19 web/js/launchdata.js ile aynı uç). Ücretsiz katman IP başına saatte 15 istek:
// sayfalar 30 dakikada bir yenilenir (ISR). Yayınlar yalnız bağlantı: resmî (tür 1) önce, sonra önceliğe göre.
export const LL2_UPCOMING = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=25&mode=detailed&hide_recent_previous=true';
export const REVALIDATE = 1800;
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const known = (x) => { const v = str(x); return v && !/^(unknown|tbd|n\/a)$/i.test(v) ? v : null; };          // kaynak bilinmeyeni yazıyla verir: gösterilmez
const https = (u) => { const v = str(u); return v && /^https:\/\//.test(v) ? v : null; };

export function mapLaunch(r) {
  const mi = r.mission || {}, pad = r.pad || {}, loc = pad.location || {}, cfg = (r.rocket && r.rocket.configuration) || {}, lsp = r.launch_service_provider || {}, st = r.status || {};
  const streams = (Array.isArray(r.vid_urls) ? r.vid_urls : []).filter((v) => v && https(v.url))
    .map((v, i) => ({ url: https(v.url), title: str(v.title), official: !!(v.type && v.type.id === 1), pr: Number(v.priority) || 0, i }))
    .sort((a, b) => b.official - a.official || b.pr - a.pr || a.i - b.i).slice(0, 3).map(({ url, title, official }) => ({ url, title, official }));
  return {
    id: str(r.id), name: str(r.name), net: str(r.net), precision: str(r.net_precision && r.net_precision.name),
    status: { abbrev: str(st.abbrev), name: str(st.name) }, live: r.webcast_live === true,
    vehicle: str(cfg.full_name) || str(cfg.name), provider: str(lsp.name),
    mission: { name: str(mi.name), type: known(mi.type), orbit: known(mi.orbit && mi.orbit.name), description: str(mi.description) },
    pad: { name: str(pad.name), location: str(loc.name) },
    streams,
  };
}
// { ok, launches, fetched } — hata olursa ok: false (sayfa veri uydurmaz, kaynağın sınırını söyler)
export async function getUpcoming() {
  try {
    const r = await fetch(LL2_UPCOMING, { headers: { 'User-Agent': 'lookstar19/0.1 (non-commercial space library)' }, next: { revalidate: REVALIDATE } });
    if (!r.ok) return { ok: false, launches: [], status: r.status };
    const j = await r.json();
    const launches = (Array.isArray(j.results) ? j.results : []).map(mapLaunch).filter((l) => l.net && l.name);
    return { ok: true, launches, fetched: new Date().toISOString() };
  } catch (e) { return { ok: false, launches: [], status: String(e && e.message || e).slice(0, 80) }; }
}
// sıradaki: zamanı geçmemiş ilk fırlatma (başarıyla kalkmış olanlar listede kalabilir)
export const nextLaunch = (list, now = Date.now()) => list.find((l) => Date.parse(l.net) > now - 60_000 && !['Success', 'Failure'].includes(l.status.abbrev)) || null;
