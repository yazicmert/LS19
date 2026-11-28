// fırlatma ayrıntısı: Launch Library 2 (2.3.0, mode=detailed) kaydının tamamı → sayfanın okuduğu sade nesne. Saf işlevler (Node testinde de
// koşar): görev, yörünge, müşteri ve fırlatıcı kurumlar, programlar, araç ve kademeler (iniş, yeniden kullanım), uzay aracı ve mürettebat,
// faydalı yük listesi, rampa (koordinat, saat dilimi), deneme sayıları, güncellemeler, geri sayım çizelgesi, bağlantılar.
// Kaynağın "Unknown", "TBD", "N/A", "Details TBD." gibi yer tutucuları değer sayılmaz; bağlantılardan yalnız http(s) olanlar geçer.
// Ek kaynaklar da burada eşlenir: GCAT (J. McDowell; data/rockets.json'daki fırlatma kaydı) ve fırlatmadan sonra CelesTrak GP nesneleri.
import { precisionOf, known, safeUrl, payloadState } from './launches.js';
import { mapGp } from './sat.js';

const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const nf = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : null);
const arr = (x) => (Array.isArray(x) ? x : []);
const bool = (x) => (x === true ? true : x === false ? false : null);

// ISO 8601 süre ("P47DT5H13M16S", "-PT38M", "PT1H2M3.5S") → saniye (işaretli); tanınmazsa null
export function isoDur(s) {
  const m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(s || '').trim());
  if (!m || (m[2] == null && m[3] == null && m[4] == null && m[5] == null)) return null;
  const v = (+m[2] || 0) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0);
  return m[1] ? -v : v;
}

// yörünge: ad ve kısaltma (kaynağın yer tutucuları atılır); Dünya dışı gök cismi yazılır
export function orbitOf(o) {
  if (!o) return null;
  const name = known(o.name), abbrev = known(o.abbrev), body = str(o.celestial_body && o.celestial_body.name);
  return name || abbrev ? { name, abbrev, body: body && !/^earth$/i.test(body) ? body : null } : null;
}

const countries = (c) => (Array.isArray(c) ? c : c ? [c] : []).map((x) => ({ code: str(x && x.alpha_2_code), name: str(x && x.name) })).filter((x) => x.code || x.name);
// kurum (müşteri, fırlatıcı, üretici, uzay aracı sahibi)
export function agencyOf(a) {
  if (!a || !str(a.name)) return null;
  return {
    name: str(a.name), abbrev: known(a.abbrev), type: known(a.type && a.type.name), countries: countries(a.country),
    founded: nf(a.founding_year), description: str(a.description), info: safeUrl(a.info_url), wiki: safeUrl(a.wiki_url),
    total: nf(a.total_launch_count), success: nf(a.successful_launches), failed: nf(a.failed_launches), pending: nf(a.pending_launches),
  };
}
function landingOf(l) {
  if (!l) return null;
  const loc = l.landing_location || {}, ty = l.type || {};
  const out = {
    attempt: bool(l.attempt), success: bool(l.success), type: known(ty.name), abbrev: known(ty.abbrev), location: known(loc.name), locAbbrev: known(loc.abbrev),
    downrange: nf(l.downrange_distance), description: str(l.description),
  };
  return out.attempt == null && !out.type && !out.location ? null : out;
}
function stageOf(s) {
  const L = s.launcher || {}, serial = !L.is_placeholder && known(L.serial_number) && !/^unknown\b/i.test(L.serial_number) ? str(L.serial_number) : null;
  return {
    type: known(s.type), serial, flight: nf(s.launcher_flight_number), reused: bool(s.reused), flights: nf(L.flights), landings: nf(L.successful_landings), landingsTried: nf(L.attempted_landings),
    first: str(L.first_launch_date), prevDate: str(s.previous_flight_date), prevName: str(s.previous_flight && s.previous_flight.name), turnaround: isoDur(s.turn_around_time),
    landing: landingOf(s.landing),
  };
}
function spacecraftOf(f) {
  const sc = f.spacecraft || {}, cfg = sc.spacecraft_config || {};
  const crew = arr(f.launch_crew).map((c) => ({
    name: str(c.astronaut && c.astronaut.name), role: known(c.role && c.role.role), priority: nf(c.role && c.role.priority) ?? 99,
    agency: str(c.astronaut && c.astronaut.agency && (c.astronaut.agency.abbrev || c.astronaut.agency.name)),
    nationality: countries(c.astronaut && c.astronaut.nationality).map((x) => x.code).filter(Boolean),
    flights: nf(c.astronaut && c.astronaut.flights_count), first: str(c.astronaut && c.astronaut.first_flight),
  })).filter((c) => c.name).sort((a, b) => a.priority - b.priority);
  return {
    name: str(sc.name), serial: !sc.is_placeholder ? known(sc.serial_number) : null, config: str(cfg.name), type: known(cfg.type && cfg.type.name),
    agency: str(cfg.agency && cfg.agency.name), destination: known(f.destination), humanRated: bool(cfg.human_rated), crewCapacity: nf(cfg.crew_capacity),
    flown: nf(cfg.spacecraft_flown), landing: landingOf(f.landing), crew,
  };
}
function payloadOf(p) {
  const x = p.payload || p;
  return {
    name: known(x.name), type: known(x.type && (x.type.name || x.type)), manufacturer: str(x.manufacturer && x.manufacturer.name), operator: str(x.operator && x.operator.name),
    mass: nf(x.mass), destination: known(p.destination), amount: nf(p.amount), description: known(x.description),
  };
}
function linksOf(list, kind) {
  return arr(list).map((v) => ({
    url: safeUrl(v && v.url), title: str(v && v.title), source: str(v && (v.publisher || v.source)), type: str(v && v.type && v.type.name),
    official: !!(v && v.type && v.type.id === 1), lang: str(v && v.language && v.language.code), start: kind === 'vid' ? str(v && v.start_time) : null,
    pr: nf(v && v.priority) || 0,
  })).filter((v) => v.url);
}
const dedupe = (xs) => { const seen = new Set(); return xs.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true))); };

export function mapLaunchDetail(r) {
  if (!r || !str(r.id)) return null;
  const mi = r.mission || {}, rk = r.rocket || {}, cfg = rk.configuration || {}, pad = r.pad || {}, loc = pad.location || {}, st = r.status || {};
  const vid = dedupe([...linksOf(r.vid_urls, 'vid'), ...linksOf(mi.vid_urls, 'vid')]).sort((a, b) => b.official - a.official || b.pr - a.pr);
  const info = dedupe([...linksOf(r.info_urls, 'info'), ...linksOf(mi.info_urls, 'info')]).sort((a, b) => b.official - a.official || b.pr - a.pr);
  const prob = nf(r.probability);
  const vehicleName = str(cfg.full_name) || str(cfg.name);
  return {
    id: str(r.id), name: str(r.name), designator: /^\d{4}-\d{3}$/.test(String(r.launch_designator || '')) ? r.launch_designator : null,
    net: str(r.net), precision: precisionOf(r.net_precision && r.net_precision.name), windowStart: str(r.window_start), windowEnd: str(r.window_end),
    updated: str(r.last_updated), live: r.webcast_live === true,
    status: { abbrev: str(st.abbrev), name: str(st.name), description: str(st.description), failreason: str(r.failreason) },
    probability: prob != null && prob >= 0 && prob <= 100 ? prob : null, weather: known(r.weather_concerns),
    payload: payloadState(mi.name),
    mission: {
      name: payloadState(mi.name) === 'unknown' ? null : str(mi.name), type: known(mi.type), description: known(mi.description), orbit: orbitOf(mi.orbit),
      agencies: arr(mi.agencies).map(agencyOf).filter(Boolean),
    },
    programs: arr(r.program).filter((p) => p && str(p.name)).map((p) => ({
      name: str(p.name), type: known(p.type && p.type.name), description: str(p.description), start: str(p.start_date), end: str(p.end_date),
      agencies: arr(p.agencies).map((a) => str(a && a.name)).filter(Boolean), info: safeUrl(p.info_url), wiki: safeUrl(p.wiki_url),
    })),
    provider: agencyOf(r.launch_service_provider),
    vehicle: {
      name: vehicleName, short: str(cfg.name), variant: known(cfg.variant), families: arr(cfg.families).map((f) => str(f && f.name)).filter(Boolean),
      manufacturer: agencyOf(cfg.manufacturer), reusable: bool(cfg.reusable), maiden: str(cfg.maiden_flight), description: str(cfg.description),
      length: nf(cfg.length), diameter: nf(cfg.diameter), launchMass: nf(cfg.launch_mass), leo: nf(cfg.leo_capacity), gto: nf(cfg.gto_capacity), sso: nf(cfg.sso_capacity), thrust: nf(cfg.to_thrust),
      total: nf(cfg.total_launch_count), success: nf(cfg.successful_launches), failed: nf(cfg.failed_launches), pending: nf(cfg.pending_launches), streak: nf(cfg.consecutive_successful_launches),
      landingsTried: nf(cfg.attempted_landings), landings: nf(cfg.successful_landings), info: safeUrl(cfg.info_url), wiki: safeUrl(cfg.wiki_url),
    },
    stages: arr(rk.launcher_stage).map(stageOf),
    spacecraft: arr(rk.spacecraft_stage).map(spacecraftOf).filter((s) => s.name || s.config),
    payloads: arr(rk.payloads).map(payloadOf).filter((p) => p.name),
    pad: {
      name: str(pad.name), location: str(loc.name), country: countries(pad.country || loc.country)[0] || null,
      lat: nf(pad.latitude), lon: nf(pad.longitude), tz: str(loc.timezone_name), map: safeUrl(pad.map_url), wiki: safeUrl(pad.wiki_url), info: safeUrl(pad.info_url),
      total: nf(pad.total_launch_count), locTotal: nf(loc.total_launch_count), locLandings: nf(loc.total_landing_count),
    },
    counts: {
      orbital: nf(r.orbital_launch_attempt_count), orbitalYear: nf(r.orbital_launch_attempt_count_year), location: nf(r.location_launch_attempt_count), locationYear: nf(r.location_launch_attempt_count_year),
      pad: nf(r.pad_launch_attempt_count), padYear: nf(r.pad_launch_attempt_count_year), agency: nf(r.agency_launch_attempt_count), agencyYear: nf(r.agency_launch_attempt_count_year),
      padTurnaround: isoDur(r.pad_turnaround),
    },
    updates: arr(r.updates).map((u) => ({ comment: str(u.comment), by: str(u.created_by), on: str(u.created_on), url: safeUrl(u.info_url) }))
      .filter((u) => u.comment && u.on && Number.isFinite(Date.parse(u.on))).sort((a, b) => Date.parse(b.on) - Date.parse(a.on)),
    timeline: arr(r.timeline).map((e) => ({ t: isoDur(e.relative_time), label: str(e.type && e.type.abbrev), description: str(e.type && e.type.description) }))
      .filter((e) => e.t != null && e.label).sort((a, b) => a.t - b.t),
    links: { vid, info, flightclub: safeUrl(r.flightclub_url), infographic: safeUrl(r.infographic) },
  };
}

// --- ek kaynaklar ---
// GCAT fırlatma kaydı (data/rockets.json, haftalık): fırlatıldıysa uluslararası tanıtıcıyla (COSPAR "2026-266") kaydın kendisi;
// her durumda aynı aracın son uçuşları (bu fırlatmanın yükü değil, bağlam olarak gösterilir)
export function gcatByTag(vehicles, tag) {
  if (!tag) return null;
  for (const v of vehicles) { const l = v.launches.find((x) => x.tag === tag); if (l) return { vehicle: v.name, slug: v.slug, ...l }; }
  return null;
}
export const recentFlights = (v, n = 6, exceptTag = null) => (v ? v.launches.filter((l) => l.tag !== exceptTag).slice(-n).reverse() : []);

// CelesTrak GP (etkin uydular): uluslararası tanıtıcısı "2026-266" ile başlayan nesneler ("2026-266A", "2026-266AB") — yörünge elementlerinden
// yerberi, yeröte, eğiklik, dönem (lib/sat.js mapGp, türetilmiş değerler)
export function launchObjects(gp, designator) {
  if (!Array.isArray(gp) || !/^\d{4}-\d{3}$/.test(String(designator || ''))) return [];
  const pre = designator;
  return gp.filter((g) => g && typeof g.OBJECT_ID === 'string' && g.OBJECT_ID.startsWith(pre) && /^[A-Z]{1,3}$/.test(g.OBJECT_ID.slice(pre.length)) && nf(g.MEAN_MOTION) > 0)
    .map((g) => { const m = mapGp(g); return { name: m.name, cospar: m.cospar, norad: m.norad, epoch: m.epoch, i: m.elements.i, e: m.elements.e, ...m.derived }; })
    .sort((a, b) => a.cospar.length - b.cospar.length || a.cospar.localeCompare(b.cospar));
}

// doğrudan fırlatmada (yörünge düzlemi değiştirmeden) ulaşılabilen en küçük eğiklik ≈ rampanın enlemi (mutlak değer)
export const minInclination = (lat) => (Number.isFinite(lat) ? Math.abs(lat) : null);
