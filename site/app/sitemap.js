// /sitemap.xml: her sayfa her dilde, hreflang alternatifleriyle (x-default İngilizce)
import { LANGS, SITE_URL } from '@/lib/config';
import { OBJECTS, RETRIEVED } from '@/lib/asteroids';
import { alternates } from '@/lib/seo';
import { SATS } from '@/lib/satellites';
import { ROCKETS } from '@/lib/rockets';
import { SITES } from '@/lib/sites';

export default function sitemap() {
  const paths = [['', 'daily', 1], ['/asteroids', 'monthly', 0.8], ['/launches', 'hourly', 0.7], ['/sources', 'monthly', 0.4], ...OBJECTS.map((o) => [`/asteroids/${o.id}`, 'monthly', 0.6]), ['/asteroids/all', 'weekly', 0.7], ['/satellites', 'weekly', 0.8], ...SATS.map((s) => [`/satellites/${s.id}`, 'weekly', 0.6]), ['/rockets', 'weekly', 0.7], ...ROCKETS.map((v) => [`/rockets/${v.slug}`, 'weekly', 0.5]), ['/launches/sites', 'weekly', 0.7], ...SITES.map((x) => [`/launches/sites/${x.slug}`, 'weekly', 0.5])];
  paths.push(['/satellites/all', 'daily', 0.7]);                            // tüm uydular kataloğu (uydu sayfaları istekle üretilir, haritada yok)
  paths.push(['/satellites/stats', 'weekly', 0.6]);                          // uydu istatistiği (GCAT, haftalık)
  const abs = (p) => `${SITE_URL}${p}`;
  return paths.flatMap(([p, changeFrequency, priority]) => LANGS.map((lang) => ({
    url: abs(`/${lang}${p}`), lastModified: RETRIEVED, changeFrequency, priority,
    alternates: { languages: Object.fromEntries(Object.entries(alternates(lang, p).languages).map(([k, v]) => [k, abs(v)])) },
  })));
}
