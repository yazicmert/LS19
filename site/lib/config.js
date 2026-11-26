// lookstar19 sabitleri
export const LANGS = ['en', 'tr'];
export const DEFAULT_LANG = 'en';
export const ISSUE = 1;                                                             // sirküler sayısı: sitenin yayın sürümü
export const SITE_URL = 'https://lookstar19.org';
// LS19 simülasyonunun yayın adresi (Vercel'deki LS19 projesi). Ortam değişkeniyle değiştirilebilir.
export const LS19_URL = (process.env.NEXT_PUBLIC_LS19_URL || 'https://ls19web.vercel.app').replace(/\/$/, '');
export const REPO_URL = 'https://github.com/yazicmert/LS19';
