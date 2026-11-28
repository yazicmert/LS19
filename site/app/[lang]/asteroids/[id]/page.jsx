// cisim kaydı: başlık (ad, gösterim, sınıf, bayraklar); yörünge ve fiziksel element blokları; gerçek şekil modeli (3B); LS19'da aç; kaynak satırları
import { pageMeta } from '@/lib/seo';
import { notFound } from 'next/navigation';
import AsteroidRecord from '@/components/AsteroidRecord';
import MISSIONS from '@/data/missions.json';
import { LANGS } from '@/lib/config';
import { t, num, clsName } from '@/lib/i18n';
import { OBJECTS, RETRIEVED, CAD, byId } from '@/lib/asteroids';

export const dynamicParams = false;
export function generateStaticParams() { return LANGS.flatMap((lang) => OBJECTS.map((o) => ({ lang, id: o.id }))); }
export async function generateMetadata({ params }) {
  const { lang, id } = await params, o = byId(id); if (!o) return {};
  const A = t(lang).ast;
  return pageMeta(lang, `/asteroids/${id}`, {
    title: o.name,
    description: `${o.fullname}: ${clsName(lang, o.orbitClass)}; a = ${num(lang, o.elements.a, 4)} au, e = ${num(lang, o.elements.e, 4)}, i = ${num(lang, o.elements.i, 2)}°. ${A.methodLong[o.model.method]}.`,
  });
}

export default async function Asteroid({ params }) {
  const { lang, id } = await params, o = byId(id); if (!o) notFound();
  return <AsteroidRecord lang={lang} o={o} retrieved={RETRIEVED} cad={CAD} missions={MISSIONS} altPath={`/asteroids/${o.id}`} back={{ href: `/${lang}/asteroids?m3d=1`, label: t(lang).ast.back }} />;
}
