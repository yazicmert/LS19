// tek fırlatmanın ayrıntısı: yaklaşan fırlatmalar derlemede üretilir (liste isteğinin önbelleğinden, fırlatma başına istek yok); başkası
// (fırlatılmış ya da listeden düşmüş) ilk istekte kaynağın tek kayıt ucundan üretilir. Sayfalar 30 dakikada bir yenilenir (ISR).
// Kaynak geçici olarak yanıt vermezse yenilemede hata fırlatılır: önbellekteki son sayfa sunulur.
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import LaunchDetail from '@/components/LaunchDetail';
import { pageMeta } from '@/lib/seo';
import { LANGS } from '@/lib/config';
import { t, netLabel } from '@/lib/i18n';
import { getUpcoming, getLaunch } from '@/lib/launches';
import { mapLaunchDetail, gcatByTag, recentFlights } from '@/lib/launch-detail';
import { objectsForLaunch } from '@/lib/launch-objects';
import { ROCKETS, RK_UPDATED, rocketForLL2 } from '@/lib/rockets';

export const revalidate = 1800;
export const dynamicParams = true;
export async function generateStaticParams() {
  const up = await getUpcoming();
  return up.ok ? LANGS.flatMap((lang) => up.launches.map((l) => ({ lang, id: l.id }))) : [];
}

async function load(id) {
  const r = await getLaunch(id);
  if (r.notFound) return { notFound: true };
  if (r.error) return { error: r.error };
  const d = mapLaunchDetail(r.raw);
  return d ? { d, flown: r.from === 'single' && Date.parse(d.net) < Date.now() } : { notFound: true };   // listede yok ve zamanı geçmiş: fırlatıldı
}
const titleOf = (L, d) => d.mission.name || L.unknownTitle(d.vehicle.short || d.vehicle.name);

export async function generateMetadata({ params }) {
  const { lang, id } = await params, L = t(lang).launch, r = await load(id);
  if (!r.d) return { title: L.title };
  const d = r.d, orbit = d.mission.orbit ? d.mission.orbit.abbrev || d.mission.orbit.name : null;
  return pageMeta(lang, `/launches/${d.id}`, {
    title: titleOf(L, d),
    description: [d.payload === 'unknown' ? L.unknownPayload : d.mission.type, d.vehicle.name, d.provider && d.provider.name, orbit, d.pad.location, netLabel(lang, d.net, d.precision)].filter(Boolean).join(' · '),
  });
}

export default async function Launch({ params }) {
  const { lang, id } = await params, r = await load(id);
  if (r.notFound) notFound();
  if (r.error) throw new Error(r.error);
  const d = r.d, rocket = rocketForLL2(d.vehicle.name) || rocketForLL2(d.vehicle.short);
  const record = gcatByTag(ROCKETS, d.designator);
  const gcat = { vehicle: rocket ? rocket.name : d.vehicle.name, record, recent: record ? [] : recentFlights(rocket, 6) };
  const objects = d.designator ? await objectsForLaunch(d.designator) : null;
  return (
    <>
      <Masthead lang={lang} current="launches" altPath={`/launches/${d.id}`} />
      <LaunchDetail lang={lang} d={d} rocket={rocket} gcat={gcat} objects={objects} gcatUpdated={RK_UPDATED} flown={r.flown} />
      <Footer lang={lang} />
    </>
  );
}
