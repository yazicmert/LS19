// katalogdaki herhangi bir asteroit (JPL SBDB'deki 1,59 milyon): ilk istekte JPL'den alınıp üretilir, bir gün önbellekte kalır (ISR).
// Şekil modeli olan 33 cisimden biriyse onun zengin sayfasına yönlenir. Bulunamazsa ya da asteroit değilse 404.
import { notFound, redirect } from 'next/navigation';
import AsteroidRecord from '@/components/AsteroidRecord';
import EVENTS from '@/data/events.json';
import { pageMeta } from '@/lib/seo';
import { t, num, clsName } from '@/lib/i18n';
import { OBJECTS, CAD } from '@/lib/asteroids';
import { liveAsteroid, slugToDes, desToSlug } from '@/lib/sbdb-live';

export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

async function load(slug) {
  const des = slugToDes(slug), hit = OBJECTS.find((o) => o.des === des);
  if (hit) return { redirectTo: hit.id };
  try { return { o: await liveAsteroid(des) }; } catch (e) { return { error: String(e.message || e) }; }
}
export async function generateMetadata({ params }) {
  const { lang, des } = await params, r = await load(des);
  if (!r.o) return { title: t(lang).cat.title };
  const o = r.o;
  return pageMeta(lang, `/sb/${desToSlug(o.des)}`, { title: o.name, description: `${o.fullname}: ${clsName(lang, o.orbitClass)}; a = ${num(lang, o.elements.a, 4)} au, e = ${num(lang, o.elements.e, 4)}, i = ${num(lang, o.elements.i, 2)}°. JPL SBDB.` });
}
export default async function CatalogAsteroid({ params }) {
  const { lang, des } = await params, r = await load(des);
  if (r.redirectTo) redirect(`/${lang}/asteroids/${r.redirectTo}`);
  if (r.error) throw new Error(r.error);                                      // geçici JPL hatası: önbellekteki son sayfa sunulur
  if (!r.o) notFound();
  const today = new Date().toISOString().slice(0, 10), C = t(lang).cat;
  return <AsteroidRecord lang={lang} o={r.o} retrieved={today} cad={CAD} events={EVENTS} altPath={`/sb/${desToSlug(r.o.des)}`} back={{ href: `/${lang}/asteroids/all`, label: C.back }} />;
}
