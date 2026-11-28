// fırlatma ayrıntısı: başlık (görev ya da "yük açıklanmadı"), görev / pencere / durum element blokları ve kobalt fırlatma bloğu (geri
// sayım, yayınlar); sonra kurumlar, hedef yörünge, çıkarımlar (yük açıklanmadıysa), araç ve kademeler, uzay aracı ve mürettebat, yük
// listesi, rampa, programlar, GCAT'te aracın önceki uçuşları, fırlatmadan sonra yörüngedeki nesneler, güncellemeler, geri sayım
// çizelgesi, bağlantılar ve kaynak satırları. Her blok kaynağını yazar; kaynağın vermediği değer gösterilmez, çıkarım "çıkarım" diye işaretlenir.
import Link from 'next/link';
import ElementBlock from './ElementBlock';
import Countdown from './Countdown';
import { ArrowOut, ArrowRight, Play } from './Icon';
import { t, num, date, dateTime, netLabel, ll2tr } from '@/lib/i18n';
import { countable } from '@/lib/launches';
import { minInclination } from '@/lib/launch-detail';

const pad2 = (n) => String(n).padStart(2, '0');
// süre: "47 g 5 sa", "38 dk"
function dur(lang, sec) {
  if (sec == null || !Number.isFinite(sec)) return null;
  const U = lang === 'tr' ? { d: 'g', h: 'sa', m: 'dk', s: 'sn' } : { d: 'd', h: 'h', m: 'min', s: 's' };
  const s = Math.round(Math.abs(sec)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} ${U.d}${h ? ` ${h} ${U.h}` : ''}`;
  if (h) return `${h} ${U.h}${m ? ` ${m} ${U.m}` : ''}`;
  return m ? `${m} ${U.m}` : `${s % 60} ${U.s}`;
}
// geri sayım çizelgesi: T−00:38:00, T+00:02:30 (gün varsa önde)
export function tOffset(sec) {
  const s = Math.round(Math.abs(sec)), d = Math.floor(s / 86400), r = s % 86400;
  return `T${sec < 0 ? '−' : '+'}${d ? `${d}d ` : ''}${pad2(Math.floor(r / 3600))}:${pad2(Math.floor((r % 3600) / 60))}:${pad2(r % 60)}`;
}
function localTime(lang, iso, tz) {
  if (!tz || !iso) return null;
  try {
    return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz, timeZoneName: 'short' }).format(new Date(iso));
  } catch { return null; }
}
const coord = (lang, lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) ? `${num(lang, Math.abs(lat), 4)}° ${lat >= 0 ? 'N' : 'S'}, ${num(lang, Math.abs(lon), 4)}° ${lon >= 0 ? 'E' : 'W'}` : null);
const int = (lang, x) => (x == null ? null : num(lang, x, 0));
const Ext = ({ href, children, className = 'lnk' }) => <a className={className} href={href} rel="noopener noreferrer" target="_blank">{children}<ArrowOut size={11} /></a>;
const Src = ({ children }) => <p className="el__note lcd__src">{children}</p>;
function Sec({ id, title, children, className = '' }) {
  return (
    <section className={`rec__sec ${className}`} aria-labelledby={id}>
      <div className="sec__head"><h2 id={id} className="sec__title">{title}</h2></div>
      {children}
    </section>
  );
}

export default function LaunchDetail({ lang, d, rocket, gcat, objects, gcatUpdated, flown }) {
  const T = t(lang), L = T.launch, F = L.f, tr = lang === 'tr', en = tr ? 'en' : undefined;
  const m = d.mission, v = d.vehicle, p = d.pad, c = d.counts;
  const unknown = d.payload === 'unknown';
  const title = m.name || L.unknownTitle(v.short || v.name);
  const typeName = m.type ? ll2tr(lang, 'type', m.type) : null;
  const orbitName = m.orbit ? ll2tr(lang, 'orbit', m.orbit.abbrev, m.orbit.name) || m.orbit.abbrev : null;
  const orbitText = m.orbit ? `${orbitName}${m.orbit.abbrev && orbitName !== m.orbit.abbrev ? ` (${m.orbit.abbrev})` : ''}${m.orbit.body ? ` · ${m.orbit.body}` : ''}` : null;
  const statusText = ll2tr(lang, 'status', d.status.abbrev, d.status.name) || d.status.abbrev;
  const live = Date.parse(d.net) > Date.now() - 60_000 && !['Success', 'Failure', 'Partial Failure'].includes(d.status.abbrev);
  const winLen = d.windowStart && d.windowEnd ? (Date.parse(d.windowEnd) - Date.parse(d.windowStart)) / 1000 : null;
  const exact = countable(d.precision);
  const customers = m.agencies.map((a) => a.abbrev && a.name.length > 28 ? `${a.name} (${a.abbrev})` : a.name);
  const stream = d.links.vid.find((x) => x.official) || d.links.vid[0];
  const minInc = minInclination(p.lat);

  // kurumlar: müşteri(ler), fırlatıcı, araç üreticisi (fırlatıcıdan farklıysa), uzay aracı işletmecisi
  const ags = [...m.agencies.map((a) => [L.role.customer, a])];
  if (d.provider) ags.push([L.role.provider, d.provider]);
  if (v.manufacturer && (!d.provider || v.manufacturer.name !== d.provider.name)) ags.push([L.role.maker, v.manufacturer]);

  const missionRows = [
    ['', F.name, m.name || L.unknownPayload, null, 'text'],
    ['', F.type, typeName, null, 'text'],
    ['', F.orbit, orbitText || (unknown ? L.notAnnounced : null), null, 'text'],
    ['', F.customers, customers.length ? customers.join('; ') : null, null, 'text'],
    d.programs.length ? ['', F.programs, d.programs.map((x) => x.name).join('; '), null, 'text'] : null,
    d.designator ? ['COSPAR', F.designator, d.designator, null] : null,
  ];
  const windowRows = [
    ['NET', F.net, netLabel(lang, d.net, d.precision), null],
    ['', F.precision, L.prec[d.precision.kind] || L.prec.day, null, 'text'],
    exact && d.windowStart ? ['', F.open, dateTime(lang, d.windowStart), null] : null,
    exact && d.windowEnd ? ['', F.close, dateTime(lang, d.windowEnd), null] : null,
    exact && winLen != null && winLen >= 0 ? ['', F.length, winLen === 0 ? F.instant : dur(lang, winLen), null] : null,
    exact ? ['', F.local, localTime(lang, d.net, p.tz), null, null, p.tz] : null,
    d.probability != null ? ['', F.prob, `${int(lang, d.probability)} %`, null] : null,
    d.weather ? ['', F.weather, d.weather, null, 'text'] : null,
  ];
  const statusRows = [
    ['', F.status, statusText, null, 'text'],
    d.status.description ? ['', F.statusDesc, d.status.description, null, 'text'] : null,
    d.status.failreason ? ['', F.fail, d.status.failreason, null, 'text'] : null,
    d.updated ? ['', F.updated, dateTime(lang, d.updated), null] : null,
  ];
  const orbitRows = [
    ['', F.orbitName, orbitText || L.notAnnounced, null, 'text'],
    m.orbit && m.orbit.abbrev && L.orbitTypical[m.orbit.abbrev] ? ['', F.typical, L.orbitTypical[m.orbit.abbrev], null, 'text'] : null,
    minInc != null ? ['i', F.minInc, num(lang, minInc, 1), '°', null, L.infer.flag] : null,
  ];
  const vehRows = [
    ['', F.vName, v.name, null, 'text'],
    v.families.length ? ['', F.family, v.families.join(', '), null, 'text'] : null,
    v.variant ? ['', F.variant, v.variant, null, 'text'] : null,
    v.manufacturer ? ['', F.maker, v.manufacturer.name, null, 'text'] : null,
    v.reusable != null ? ['', F.reusable, v.reusable ? F.yes : F.no, null, 'text'] : null,
    v.maiden ? ['', F.maiden, date(lang, v.maiden), null] : null,
    v.length ? ['L', F.length, num(lang, v.length, 1), 'm'] : null,
    v.diameter ? ['D', F.diameter, num(lang, v.diameter, 2), 'm'] : null,
    v.launchMass ? ['m', F.mass, num(lang, v.launchMass, 0), 't'] : null,
    v.leo ? ['', F.leo, num(lang, v.leo, 0), 'kg'] : null,
    v.sso ? ['', F.sso, num(lang, v.sso, 0), 'kg'] : null,
    v.gto ? ['', F.gto, num(lang, v.gto, 0), 'kg'] : null,
    v.thrust ? ['F', F.thrust, num(lang, v.thrust, 0), 'kN'] : null,
  ];
  const recRows = [
    v.total != null ? ['', F.total, int(lang, v.total), null] : null,
    v.success != null ? ['', F.success, int(lang, v.success), null] : null,
    v.failed != null ? ['', F.failed, int(lang, v.failed), null] : null,
    v.streak != null ? ['', F.streak, int(lang, v.streak), null] : null,
    v.pending != null ? ['', F.pending, int(lang, v.pending), null] : null,
    v.landingsTried ? ['', F.landings, `${int(lang, v.landings)} / ${int(lang, v.landingsTried)}`, null] : null,
  ];
  const padRows = [
    ['', F.padName, p.name, null, 'text'],
    ['', F.site, p.location, null, 'text'],
    p.country ? ['', F.country, p.country.name, null, 'text'] : null,
    coord(lang, p.lat, p.lon) ? ['φ λ', F.coords, coord(lang, p.lat, p.lon), null] : null,
    p.tz ? ['', F.tz, p.tz, null] : null,
    p.total != null ? ['', F.padTotal, int(lang, p.total), null] : null,
    p.locTotal != null ? ['', F.siteTotal, int(lang, p.locTotal), null] : null,
    c.padTurnaround ? ['', F.padTurn, dur(lang, c.padTurnaround), null] : null,
  ];
  const nthRows = [
    c.orbital ? ['#', F.nOrbital, L.nth(int(lang, c.orbital), c.orbitalYear && int(lang, c.orbitalYear)), null] : null,
    c.agency ? ['#', F.nAgency, L.nth(int(lang, c.agency), c.agencyYear && int(lang, c.agencyYear)), null] : null,
    c.location ? ['#', F.nSite, L.nth(int(lang, c.location), c.locationYear && int(lang, c.locationYear)), null] : null,
    c.pad ? ['#', F.nPad, L.nth(int(lang, c.pad), c.padYear && int(lang, c.padYear)), null] : null,
  ];
  const landingText = (l) => {
    if (!l) return '—';
    if (l.attempt === false) return L.landingNone;
    const kind = l.abbrev ? ll2tr(lang, 'landing', l.abbrev, l.type) : l.type;
    return [kind, l.locAbbrev && l.location ? `${l.location} (${l.locAbbrev})` : l.location, l.downrange ? L.downrange(num(lang, l.downrange, l.downrange < 10 ? 1 : 0)) : null].filter(Boolean).join(' · ');
  };
  const SC = L.stageCols, firstUpd = d.updates.length ? d.updates[d.updates.length - 1] : null;
  const vehShort = v.short || v.name, padName = p.name || p.location;
  const infer = unknown ? [
    d.provider && vehShort && padName ? [L.infer.provider(d.provider.name, vehShort, padName), 'Launch Library 2', false] : null,
    [orbitText ? L.infer.orbit(orbitText) : L.infer.noOrbit, 'Launch Library 2', false],
    d.programs.length ? [L.infer.program(d.programs.map((x) => x.name).join(', ')), 'Launch Library 2', false] : null,
    (v.leo || (rocket && rocket.spec.leo)) ? [L.infer.mass(vehShort, num(lang, v.leo || rocket.spec.leo, 0), v.sso ? num(lang, v.sso, 0) : null), v.leo ? 'Launch Library 2' : 'GCAT', true] : null,
    minInc != null && padName ? [L.infer.inc(padName, num(lang, minInc, 1)), 'Launch Library 2', true] : null,
    firstUpd ? [L.infer.first(date(lang, firstUpd.on), firstUpd.comment), 'Launch Library 2', false, true] : null,
    gcat.recent.length ? [L.infer.recent(gcat.vehicle), 'GCAT', true] : null,
  ].filter(Boolean) : [];

  return (
    <main id="main" className="wrap rec lcd">
      <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/launches`}>{L.all}</Link></nav>
      <header className="rec__head">
        <h1 className="rec__title lcd__title">{title}</h1>
        <p className="rec__des">
          <span className={d.status.abbrev === 'Failure' ? 'flag flag--ink' : 'flag'}>{statusText}</span>
          {unknown ? <span className="flag flag--ink">{L.unknownPayload}</span> : null}
          {typeName ? <span>{typeName}</span> : null}
          {m.orbit && m.orbit.abbrev ? <span className="flag">{m.orbit.abbrev}</span> : null}
          <span>{[v.name, d.provider && d.provider.name].filter(Boolean).join(' · ')}</span>
          <span className="mono">{netLabel(lang, d.net, d.precision)}</span>
        </p>
      </header>
      {flown ? <p className="lcd__notice" role="note">{L.flown}</p> : null}
      {unknown ? <p className="lcd__notice" role="note">{L.unknownNote(vehShort, d.provider && d.provider.name)}</p> : null}
      {d.payload === 'partial' ? <p className="lcd__notice" role="note">{L.partialNote}</p> : null}

      <div className="rec__grid">
        <div className="rec__data">
          <ElementBlock caption={L.sec.mission} rows={missionRows} />
          {m.description ? <p className="lcd__desc" lang={en}>{m.description}</p> : null}
          <ElementBlock caption={L.sec.window} rows={windowRows} />
          <ElementBlock caption={L.sec.status} rows={statusRows} />
          <Src>{L.src.line} Launch Library 2</Src>
        </div>
        <div className="rec__model">
          <div className="nl lcd__block">
            <h2 className="nl__h">{statusText}{d.live ? <span className="nl__live">{L.live}</span> : null}</h2>
            {live && exact ? <Countdown net={d.net} label={L.countdownLabel} dayUnit={tr ? 'g' : 'd'} hourUnit={tr ? 'sa' : 'h'} res={d.precision.kind === 'hour' ? 'hour' : 'sec'} /> : null}
            <p className="nl__name">{title}</p>
            <dl className="nl__el">
              <div><dt>{L.vehicle}</dt><dd>{rocket ? <Link className="nl__rk" href={`/${lang}/rockets/${rocket.slug}`}>{v.name}</Link> : v.name}</dd></div>
              {d.provider ? <div><dt>{L.provider}</dt><dd>{d.provider.name}</dd></div> : null}
              <div><dt>{L.pad}</dt><dd>{[p.name, p.location].filter(Boolean).join(', ')}</dd></div>
              <div><dt>{L.net}</dt><dd className="mono">{netLabel(lang, d.net, d.precision)}</dd></div>
            </dl>
            {stream ? <a className="btn btn--paper" href={stream.url} rel="noopener noreferrer" target="_blank"><Play />{stream.official ? L.watch : L.watchOther}</a> : <p className="nl__msg nl__msg--quiet">{L.noStream}</p>}
          </div>
        </div>
      </div>

      <Sec id="lcd-ag" title={L.sec.agencies}>
        {!m.agencies.length ? <p className="ca__lead">{unknown ? L.noCustomerUnknown : L.noCustomer}</p> : null}
        <ul className="ms">
          {ags.map(([role, a]) => (
            <li key={`${role}-${a.name}`} className="ms__item">
              <h3 className="ms__name">{a.name}</h3>
              <p className="ms__tags">
                <span className="flag flag--ink">{role}</span>
                {a.type ? <span className="flag">{ll2tr(lang, 'agency', a.type)}</span> : null}
                {a.countries.map((x) => <span key={x.code || x.name} className="flag" title={x.name || undefined}>{x.code || x.name}</span>)}
              </p>
              <dl className="ms__facts">
                {a.abbrev ? <div><dt>{F.abbrev}</dt><dd className="mono">{a.abbrev}</dd></div> : null}
                {a.founded ? <div><dt>{L.agencyFacts.founded}</dt><dd className="mono">{a.founded}</dd></div> : null}
                {a.total ? <div><dt>{L.agencyFacts.launches}</dt><dd className="mono">{int(lang, a.total)}</dd></div> : null}
                {a.total ? <div><dt>{L.agencyFacts.success}</dt><dd className="mono">{int(lang, a.success)}</dd></div> : null}
                {a.failed ? <div><dt>{L.agencyFacts.failed}</dt><dd className="mono">{int(lang, a.failed)}</dd></div> : null}
                {a.pending ? <div><dt>{L.agencyFacts.pending}</dt><dd className="mono">{int(lang, a.pending)}</dd></div> : null}
              </dl>
              {a.description ? <details className="lcd__more"><summary>{L.descLabel}</summary><p lang={en}>{a.description}</p></details> : null}
              {a.info || a.wiki ? <p className="lcd__alinks">{a.info ? <Ext href={a.info}>{L.links.site(a.abbrev || a.name)}</Ext> : null}{a.wiki ? <Ext href={a.wiki}>Wikipedia</Ext> : null}</p> : null}
            </li>
          ))}
        </ul>
        <Src>{L.src.line} Launch Library 2</Src>
      </Sec>

      <Sec id="lcd-orb" title={L.sec.orbit}>
        <div className="lcd__cols">
          <div>
            <ElementBlock rows={orbitRows} />
            <Src>{L.src.line} Launch Library 2{minInc != null ? ` · ${F.minInc}: ${L.infer.flag}` : ''}</Src>
          </div>
          {infer.length ? (
            <div className="lcd__infer">
              <p className="el__cap">{L.sec.infer}</p>
              <p className="lcd__inferlead">{L.infer.lead}</p>
              <ul>
                {infer.map(([text, src, inferred, quoted]) => (
                  <li key={text}>{inferred ? <span className="flag flag--sm lcd__iflag">{L.infer.flag}</span> : null}<span lang={quoted ? en : undefined}>{text}</span> <span className="lcd__isrc">{src}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {d.designator ? (
          <div className="lcd__sub">
            <h3 className="lcd__h3">{L.sec.objects}</h3>
            {!objects ? <p className="ca__lead">{L.objUnavailable}</p> : !objects.objects.length ? <p className="ca__lead">{L.objNone}</p> : (
              <>
                <p className="ca__lead">{L.objLead(objects.objects.length)}</p>
                <div className="tbl" role="region" aria-label={L.sec.objects} tabIndex={0}>
                  <table>
                    <thead><tr><th scope="col">{L.objCols.name}</th><th scope="col" className="r">{L.objCols.norad}</th><th scope="col">{L.objCols.cospar}</th><th scope="col" className="r">{L.objCols.alt}</th><th scope="col" className="r">{L.objCols.i}</th><th scope="col" className="r">{L.objCols.period}</th></tr></thead>
                    <tbody>
                      {objects.objects.map((o) => (
                        <tr key={o.norad}>
                          <th scope="row" className="txt">{o.name}{o.sso ? <span className="flag flag--sm">SSO</span> : null}</th>
                          <td className="r">{o.norad}</td><td>{o.cospar}</td>
                          <td className="r">{num(lang, o.perigee, 0)} × {num(lang, o.apogee, 0)}</td><td className="r">{num(lang, o.i, 2)}</td><td className="r">{num(lang, o.period, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {objects && objects.copied ? <Src>{L.src.gp(dateTime(lang, objects.copied))}</Src> : null}
          </div>
        ) : null}
      </Sec>

      <Sec id="lcd-veh" title={L.sec.vehicle}>
        <div className="lcd__cols">
          <div><ElementBlock rows={vehRows} /></div>
          <div><ElementBlock caption={T.rk.record} rows={recRows} />{rocket ? <p className="lcd__alinks"><Link className="lnk" href={`/${lang}/rockets/${rocket.slug}`}>{L.links.rocket(rocket.name)}<ArrowRight size={12} /></Link></p> : null}</div>
        </div>
        {v.description ? <details className="lcd__more"><summary>{L.descLabel}</summary><p lang={en}>{v.description}</p></details> : null}
        {d.stages.length ? (
          <div className="lcd__sub">
            <h3 className="lcd__h3">{L.sec.stages}</h3>
            <div className="tbl" role="region" aria-label={L.sec.stages} tabIndex={0}>
              <table>
                <thead><tr><th scope="col">{SC.type}</th><th scope="col">{SC.serial}</th><th scope="col">{SC.flight}</th><th scope="col">{SC.prev}</th><th scope="col">{SC.turn}</th><th scope="col">{SC.landing}</th></tr></thead>
                <tbody>
                  {d.stages.map((s, k) => (
                    <tr key={k}>
                      <td className="txt">{s.type ? ll2tr(lang, 'stage', s.type) : '—'}</td>
                      <th scope="row">{s.serial || <span className="lcd__muted">{L.stageUnknown}</span>}</th>
                      <td>{s.flight ? (s.flight === 1 ? L.firstFlight : L.flightN(s.flight)) : '—'}</td>
                      <td className="txt">{s.prevDate ? <>{date(lang, s.prevDate)}{s.prevName ? <span className="lcd__muted"> · {s.prevName}</span> : null}</> : '—'}</td>
                      <td>{dur(lang, s.turnaround) || '—'}</td>
                      <td className="txt">{landingText(s.landing)}{s.landing && s.landing.attempt ? <span className="flag flag--sm">{L.landingRes[String(s.landing.success)]}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.stages.some((s) => s.landing && s.landing.description) ? <ul className="lcd__notes" lang={en}>{d.stages.filter((s) => s.landing && s.landing.description).map((s, k) => <li key={k}>{s.landing.description}</li>)}</ul> : null}
          </div>
        ) : null}
        {d.spacecraft.length ? (
          <div className="lcd__sub">
            <h3 className="lcd__h3">{L.sec.craft}</h3>
            {d.spacecraft.map((s, k) => (
              <div key={k} className="lcd__craft">
                <ElementBlock rows={[
                  ['', F.scName, s.name, null, 'text'],
                  s.serial ? ['', F.serial, s.serial, null] : null,
                  s.config ? ['', F.scConfig, s.config, null, 'text'] : null,
                  s.type ? ['', F.scKind, s.type, null, 'text'] : null,
                  s.agency ? ['', F.scAgency, s.agency, null, 'text'] : null,
                  s.destination ? ['', F.dest, s.destination, null, 'text'] : null,
                  s.humanRated != null ? ['', F.humanRated, s.humanRated ? F.yes : F.no, null, 'text'] : null,
                  s.crewCapacity ? ['', F.crewCap, int(lang, s.crewCapacity), null] : null,
                  s.landing ? ['', F.landing, landingText(s.landing), null, 'text'] : null,
                ]} />
                {s.crew.length ? (
                  <div className="tbl" role="region" aria-label={L.crewOf(s.crew.length)} tabIndex={0}>
                    <table>
                      <caption className="lcd__cap">{L.crewOf(s.crew.length)}</caption>
                      <thead><tr><th scope="col">{L.crewCols.name}</th><th scope="col">{L.crewCols.role}</th><th scope="col">{L.crewCols.agency}</th><th scope="col">{L.crewCols.nat}</th></tr></thead>
                      <tbody>{s.crew.map((x) => <tr key={x.name}><th scope="row" className="txt">{x.name}</th><td className="txt">{x.role ? ll2tr(lang, 'role', x.role) : '—'}</td><td>{x.agency || '—'}</td><td>{x.nationality.join(', ') || '—'}</td></tr>)}</tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {d.payloads.length ? (
          <div className="lcd__sub">
            <h3 className="lcd__h3">{L.sec.payloads}</h3>
            <div className="tbl" role="region" aria-label={L.sec.payloads} tabIndex={0}>
              <table>
                <thead><tr><th scope="col">{L.payCols.name}</th><th scope="col">{L.payCols.type}</th><th scope="col">{L.payCols.operator}</th><th scope="col">{L.payCols.maker}</th><th scope="col" className="r">{L.payCols.mass}</th><th scope="col">{L.payCols.dest}</th></tr></thead>
                <tbody>{d.payloads.map((x, k) => <tr key={k}><th scope="row" className="txt">{x.name}{x.amount > 1 ? ` × ${x.amount}` : ''}</th><td className="txt">{x.type || '—'}</td><td className="txt">{x.operator || '—'}</td><td className="txt">{x.manufacturer || '—'}</td><td className="r">{x.mass != null ? num(lang, x.mass, 0) : '—'}</td><td className="txt">{x.destination || '—'}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : null}
        <Src>{L.src.line} Launch Library 2</Src>
      </Sec>

      {gcat.record || gcat.recent.length ? (
        <Sec id="lcd-gcat" title={gcat.record ? L.sec.gcatRec : L.sec.gcat}>
          <p className="ca__lead">{gcat.record ? L.gcatRecLead : L.gcatLead(gcat.vehicle, gcat.recent.length)}</p>
          <div className="tbl" role="region" aria-label={L.sec.gcat} tabIndex={0}>
            <table>
              <thead><tr><th scope="col">{L.gcatCols.date}</th><th scope="col">{L.gcatCols.flight}</th><th scope="col">{L.gcatCols.mission}</th><th scope="col">{L.gcatCols.site}</th><th scope="col">{L.gcatCols.outcome}</th></tr></thead>
              <tbody>
                {(gcat.record ? [gcat.record] : gcat.recent).map((l) => (
                  <tr key={l.tag}>
                    <td>{l.date}{l.time ? ` ${l.time}` : ''}</td><td>{l.flight || '—'}</td><th scope="row" className="txt">{l.mission || '—'}</th>
                    <td className="txt">{[l.site, l.pad].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="txt">{l.outcome === 'S' ? L.out.S : <span className={l.outcome === 'F' ? 'flag flag--ink' : 'flag'}>{L.out[l.outcome] || l.outcome}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Src>{L.src.gcat(gcatUpdated)}</Src>
        </Sec>
      ) : null}

      <Sec id="lcd-pad" title={L.sec.pad}>
        <div className="lcd__cols">
          <div><ElementBlock rows={padRows} /></div>
          <div>{nthRows.some(Boolean) ? <ElementBlock rows={nthRows} /> : null}
            {p.map || p.wiki || p.info ? <p className="lcd__alinks">{p.map ? <Ext href={p.map}>{L.links.map}</Ext> : null}{p.wiki ? <Ext href={p.wiki}>{L.links.wiki(p.name || p.location)}</Ext> : null}{p.info ? <Ext href={p.info}>{L.links.site(p.name)}</Ext> : null}</p> : null}
          </div>
        </div>
        <Src>{L.src.line} Launch Library 2</Src>
      </Sec>

      {d.programs.length ? (
        <Sec id="lcd-prog" title={L.sec.programs}>
          <ul className="ms">
            {d.programs.map((g) => (
              <li key={g.name} className="ms__item">
                <h3 className="ms__name">{g.name}</h3>
                <p className="ms__tags">{g.type ? <span className="flag">{ll2tr(lang, 'type', g.type)}</span> : null}{g.start ? <span className="flag">{g.start.slice(0, 4)}{g.end ? `–${g.end.slice(0, 4)}` : '–'}</span> : null}</p>
                {g.agencies.length ? <p className="ms__desc">{g.agencies.join(', ')}</p> : null}
                {g.description ? <details className="lcd__more"><summary>{L.descLabel}</summary><p lang={en}>{g.description}</p></details> : null}
                {g.info || g.wiki ? <p className="lcd__alinks">{g.info ? <Ext href={g.info}>{L.links.site(g.name)}</Ext> : null}{g.wiki ? <Ext href={g.wiki}>Wikipedia</Ext> : null}</p> : null}
              </li>
            ))}
          </ul>
          <Src>{L.src.line} Launch Library 2</Src>
        </Sec>
      ) : null}

      {d.updates.length ? (
        <Sec id="lcd-upd" title={L.sec.updates}>
          <p className="ca__lead">{L.updLead}</p>
          <ol className="tl lcd__tl">
            {d.updates.map((u, k) => (
              <li key={k} className="tl__ev tl__ev--data">
                <span className="tl__date mono">{date(lang, u.on)}</span>
                <span className="tl__mark" aria-hidden="true" />
                <span className="tl__body">
                  <span className="tl__text" lang={en}>{u.comment}</span>
                  <span className="tl__src">{u.by ? L.updBy(u.by) : ''}{u.url ? <> · <Ext href={u.url} className="lcd__srcl">{L.updSrc}</Ext></> : null}</span>
                </span>
              </li>
            ))}
          </ol>
        </Sec>
      ) : null}

      {d.timeline.length ? (
        <Sec id="lcd-tl" title={L.sec.timeline}>
          <p className="ca__lead">{L.tlLead}</p>
          <div className="tbl" role="region" aria-label={L.sec.timeline} tabIndex={0}>
            <table>
              <thead><tr><th scope="col">{L.tlCols.t}</th><th scope="col">{L.tlCols.event}</th><th scope="col">{L.tlCols.desc}</th></tr></thead>
              <tbody>{d.timeline.map((e, k) => <tr key={k}><td>{tOffset(e.t)}</td><th scope="row" className="txt" lang={en}>{e.label}</th><td className="txt lcd__wrap" lang={en}>{e.description || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </Sec>
      ) : null}

      <Sec id="lcd-links" title={L.sec.links}>
        {!d.links.vid.length && !d.links.info.length && !d.links.flightclub ? <p className="ca__lead">{L.noLinks}</p> : null}
        <div className="lcd__linkcols">
          {d.links.vid.length ? <div><p className="el__cap">{L.links.watch}</p><ul className="lcd__links">{d.links.vid.map((x) => <li key={x.url}><Ext href={x.url}>{x.title || x.source || x.url}</Ext>{x.official ? <span className="flag flag--sm">{L.links.official}</span> : null}{x.source ? <span className="lcd__muted"> · {x.source}</span> : null}{x.start ? <span className="lcd__muted mono"> · {dateTime(lang, x.start)}</span> : null}</li>)}</ul></div> : null}
          {d.links.info.length ? <div><p className="el__cap">{L.links.info}</p><ul className="lcd__links">{d.links.info.map((x) => <li key={x.url}><Ext href={x.url}>{x.title || x.source || x.url}</Ext>{x.official ? <span className="flag flag--sm">{L.links.official}</span> : null}{x.source ? <span className="lcd__muted"> · {x.source}</span> : null}</li>)}</ul></div> : null}
          <div><p className="el__cap">{L.links.more}</p><ul className="lcd__links">
            {d.links.flightclub ? <li><Ext href={d.links.flightclub}>{L.links.flightclub}</Ext></li> : null}
            {d.links.infographic ? <li><Ext href={d.links.infographic}>{L.links.infographic}</Ext></li> : null}
            {v.info ? <li><Ext href={v.info}>{L.links.site(v.short || v.name)}</Ext></li> : null}
            {v.wiki ? <li><Ext href={v.wiki}>{L.links.wiki(v.short || v.name)}</Ext></li> : null}
            {rocket ? <li><Link className="lnk" href={`/${lang}/rockets/${rocket.slug}`}>{L.links.rocket(rocket.name)}<ArrowRight size={12} /></Link></li> : null}
          </ul></div>
        </div>
      </Sec>

      <section className="rec__src" aria-labelledby="lcd-src">
        <h2 id="lcd-src" className="rec__srch">{T.ast.sources}</h2>
        <ul>
          <li>{L.src.ll2(d.updated ? dateTime(lang, d.updated) : '—')} <a href="https://thespacedevs.com/llapi" rel="noopener noreferrer" target="_blank">The Space Devs<ArrowOut size={11} /></a></li>
          {gcat.record || gcat.recent.length ? <li>{L.src.gcat(gcatUpdated)} <a href="https://planet4589.org/space/gcat/" rel="noopener noreferrer" target="_blank">GCAT<ArrowOut size={11} /></a></li> : null}
          {objects && objects.copied ? <li>{L.src.gp(dateTime(lang, objects.copied))} <a href="https://celestrak.org/NORAD/elements/" rel="noopener noreferrer" target="_blank">CelesTrak<ArrowOut size={11} /></a></li> : null}
        </ul>
      </section>
    </main>
  );
}
