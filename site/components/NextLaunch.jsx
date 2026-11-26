// sıradaki fırlatma: kobalt alanda efemeris bloğu; büyük geri sayım, araç, görev, rampa, en erken zaman (UTC); resmî yayına yönlendirme
import Link from 'next/link';
import { t, dateTime } from '@/lib/i18n';
import Countdown from './Countdown';
import { ArrowRight, Play } from './Icon';

export default function NextLaunch({ lang, launch, ok, headingId }) {
  const L = t(lang).launch;
  const official = launch && launch.streams.find((s) => s.official), stream = official || (launch && launch.streams[0]);
  return (
    <div className="nl">
      <h2 className="nl__h" id={headingId}>{L.next}{launch && launch.live ? <span className="nl__live">{L.live}</span> : null}</h2>
      {!ok ? <p className="nl__msg">{L.unavailable}</p> : !launch ? <p className="nl__msg">{L.noFuture}</p> : (
        <>
          <Countdown net={launch.net} label={L.countdownLabel} dayUnit={lang === 'tr' ? 'g' : 'd'} />
          <p className="nl__name">{launch.mission.name || launch.name}</p>
          <dl className="nl__el">
            <div><dt>{L.vehicle}</dt><dd>{launch.vehicle}</dd></div>
            <div><dt>{L.provider}</dt><dd>{launch.provider}</dd></div>
            <div><dt>{L.pad}</dt><dd>{[launch.pad.name, launch.pad.location].filter(Boolean).join(', ')}</dd></div>
            {launch.mission.orbit ? <div><dt>{L.orbit}</dt><dd>{launch.mission.orbit}</dd></div> : null}
            <div><dt>{L.net}</dt><dd className="mono">{dateTime(lang, launch.net)}</dd></div>
          </dl>
          {stream ? (
            <a className="btn btn--paper" href={stream.url} rel="noopener" target="_blank"><Play />{official ? L.watch : L.watchOther}</a>
          ) : <p className="nl__msg nl__msg--quiet">{L.noStream}</p>}
        </>
      )}
      <Link className="lnk lnk--paper" href={`/${lang}/launches`}>{L.all}<ArrowRight /></Link>
    </div>
  );
}
