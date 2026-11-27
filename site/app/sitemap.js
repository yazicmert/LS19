// /sitemap.xml: her sayfa her dilde, hreflang alternatifleriyle (x-default İngilizce)
import { LANGS, SITE_URL } from '@/lib/config';
import { OBJECTS, RETRIEVED } from '@/lib/asteroids';
import { alternates } from '@/lib/seo';
import { SATS } from '@/lib/satellites';
import { ROCKETS } from '@/lib/rockets';

export default function sitemap() {
  const paths = [['', 'daily', 1], ['/asteroids', 'monthly', 0.8], ['/launches', 'hourly', 0.7], ['/sources', 'monthly', 0.4], ...OBJECTS.map((o) => [`/asteroids/${o.id}`, 'monthly', 0.6]), ['/satellites', 'weekly', 0.8], ...SATS.map((s) => [`/satellites/${s.id}`, 'weekly', 0.6]), ['/rockets', 'weekly', 0.7], ...ROCKETS.map((v) => [`/rockets/${v.slug}`, 'weekly', 0.5])];
  const abs = (p) => `${SITE_URL}${p}`;
  return paths.flatMap(([p, changeFrequency, priority]) => LANGS.map((lang) => ({
    url: abs(`/${lang}${p}`), lastModified: RETRIEVED, changeFrequency, priority,
    alternates: { languages: Object.fromEntries(Object.entries(alternates(lang, p).languages).map(([k, v]) => [k, abs(v)])) },
  })));
}
