// sayfa meta verisi: kanonik adres, dil alternatifleri (hreflang; x-default İngilizce), Open Graph. path dil önekisiz: '' | '/asteroids' | ...
import { LANGS, DEFAULT_LANG } from './config.js';

const OG_LOCALE = { en: 'en_GB', tr: 'tr_TR' };
export const alternates = (lang, path = '') => ({
  canonical: `/${lang}${path}`,
  languages: { ...Object.fromEntries(LANGS.map((l) => [l, `/${l}${path}`])), 'x-default': `/${DEFAULT_LANG}${path}` },
});
export function pageMeta(lang, path, { title, description, absolute = false }) {
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: alternates(lang, path),
    openGraph: {
      type: 'website', siteName: 'lookstar19', url: `/${lang}${path}`, title: absolute ? title : `${title} · lookstar19`, description,
      locale: OG_LOCALE[lang], alternateLocale: LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
    },
  };
}
