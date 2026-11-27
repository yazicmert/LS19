// fırlatma üsleri verisi (data/sites.json, scripts/usler.mjs ile GCAT'ten) ve sayfaların ortak yardımcıları
import DATA from '../data/sites.json';
import ROCKETS from '../data/rockets.json';
import { num } from './i18n.js';

export const SITES = DATA.sites, SITES_RETRIEVED = DATA.retrieved, SITES_UPDATED = DATA.updated, SITES_TOTAL = DATA.total;
export const siteBySlug = (slug) => SITES.find((s) => s.slug === slug) || null;
const RK = new Set(ROCKETS.vehicles.map((v) => v.slug));
export const rocketHref = (lang, slug) => (RK.has(slug) ? `/${lang}/rockets/${slug}` : null);
// ülke adı: tarayıcı/Node'un kendi listesinden (ISO 3166), dile göre
export function countryName(lang, cc) {
  if (!cc) return '';
  try { return new Intl.DisplayNames([lang === 'tr' ? 'tr' : 'en'], { type: 'region' }).of(cc) || cc; } catch { return cc; }
}
const HEM = { tr: ['K', 'G', 'D', 'B'], en: ['N', 'S', 'E', 'W'] };
export const fmtLat = (lang, lat) => `${num(lang, Math.abs(lat), 2)}° ${HEM[lang === 'tr' ? 'tr' : 'en'][lat >= 0 ? 0 : 1]}`;
export const fmtLon = (lang, lon) => `${num(lang, Math.abs(lon), 2)}° ${HEM[lang === 'tr' ? 'tr' : 'en'][lon >= 0 ? 2 : 3]}`;
// küre için ince liste (istemciye yalnız bu gider)
export const globeSites = (lang, L) => SITES.filter((s) => s.lat != null).map((s) => ({
  slug: s.slug, name: s.name, lat: s.lat, lon: s.lon, total: s.stats.total, totalLabel: L.launchesN(num(lang, s.stats.total, 0)),
  country: countryName(lang, s.cc), years: s.stats.first.slice(0, 4) === s.stats.last.slice(0, 4) ? s.stats.first.slice(0, 4) : `${s.stats.first.slice(0, 4)}–${s.stats.last.slice(0, 4)}`,
  href: `/${lang}/launches/sites/${s.slug}`,
}));
