// uydu verisi (scripts/uydular.mjs üretir): CelesTrak GP + GCAT + LS19 model kataloğu
import data from '../data/satellites.json';

export const SAT_RETRIEVED = data.retrieved;
export const SATS = data.objects;
export const GP_INFO = data.gp;
export const GCAT_INFO = data.gcat;
export const satById = (id) => SATS.find((s) => s.id === id) || null;
// ana sayfada öne çıkanlar: istasyon, gözlemevleri, yer eşzamanlı hava uydusu, kutupsal hava uydusu, okyanus altimetresi
export const FEATURED_SATS = ['25544', '20580', '25867', '41866', '43013', '54754'];
export const satName = (s, lang) => s.title[lang] || s.title.en;
// dizin tablosu ve süzgeçleri için ince kayıt
export const satRecord = (s) => ({
  id: s.id, norad: s.norad, cospar: s.cospar, name: s.name, title: s.title,
  elements: { i: s.elements.i }, derived: { regime: s.derived.regime, sso: s.derived.sso, perigee: s.derived.perigee, apogee: s.derived.apogee, period: s.derived.period },
  gcat: s.gcat ? { ownerShort: s.gcat.ownerShort, owner: s.gcat.owner, mass: s.gcat.mass, launch: { date: s.gcat.launch.date } } : null,
});
