// yaklaşan fırlatmalar (LL2): her satır bir efemeris kaydı; en erken zaman (UTC), araç, görev, rampa, durum; resmî yayına yönlendirme
import Masthead from '@/components/Masthead';
import { pageMeta } from '@/lib/seo';
import Footer from '@/components/Footer';
import NextLaunch from '@/components/NextLaunch';
import { t, dateTime } from '@/lib/i18n';
import { getUpcoming, nextLaunch } from '@/lib/launches';
import { LS19_URL } from '@/lib/config';
import { ArrowOut, Play } from '@/components/Icon';

export const revalidate = 1800;
export async function generateMetadata({ params }) {
  const { lang } = await params, L = t(lang).launch;
  return pageMeta(lang, '/launches', { title: L.title, description: L.description });
}
export default async function Launches({ params }) {
  const { lang } = await params, L = t(lang).launch;
  const up = await getUpcoming(), nl = up.ok ? nextLaunch(up.launches) : null, rest = up.launches.filter((x) => x !== nl);
  return (
    <>
      <Masthead lang={lang} current="launches" altPath="/launches" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{L.title}</h1>
        <p className="page__lead">{L.lead}</p>
        <div className="lch">
          <section className="lch__next" aria-labelledby="lch-next"><NextLaunch lang={lang} launch={nl} ok={up.ok} headingId="lch-next" /></section>
          {up.ok && rest.length ? (
            <ol className="lch__list">
              {rest.map((l) => {
                const s = l.streams.find((x) => x.official) || l.streams[0];
                return (
                  <li key={l.id} className="lch__row">
                    <p className="lch__net mono">{dateTime(lang, l.net)}</p>
                    <div className="lch__body">
                      <h2 className="lch__name">{l.mission.name || l.name}</h2>
                      <p className="lch__meta">{[l.vehicle, l.provider].filter(Boolean).join(' · ')}</p>
                      <p className="lch__meta">{[l.pad.name, l.pad.location].filter(Boolean).join(', ')}{l.mission.orbit ? ` · ${l.mission.orbit}` : ''}</p>
                    </div>
                    <div className="lch__side">
                      <p className="lch__status">{l.status.name || l.status.abbrev}</p>
                      {s ? <a className="lnk" href={s.url} rel="noopener" target="_blank"><Play size={11} />{s.official ? L.watch : L.watchOther}</a> : <p className="lch__none">{L.noStream}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
        <p className="note">
          {L.dataNote}{' '}
          <a className="lnk" href={`${LS19_URL}/?mode=lab&exp=ay`} rel="noopener">{L.inLS19}<ArrowOut size={11} /></a>
        </p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
