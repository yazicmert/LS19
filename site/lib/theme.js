// renk teması: sistem (varsayılan), açık, koyu. Seçim tarayıcıda saklanır (localStorage) ve <html data-theme> ile uygulanır;
// "sistem" seçiminde öznitelik yoktur, globals.css prefers-color-scheme'e göre çalışır. Betik ilk boyamadan önce <head>'de çalışır
// (sayfa önce yanlış temada görünüp sonra değişmez); depolama kapalıysa (gizli pencere, engellenmiş site verisi) sessizce sisteme düşer.
export const THEME_KEY = 'ls19-theme';
export const THEMES = ['system', 'light', 'dark'];
// tarayıcı çubuğu rengi künye bandının kobalt alanıyla aynı (globals.css --cobalt-field, iki temada)
export const THEME_COLOR = { light: '#1d3fd6', dark: '#1b39c6' };
export const themeViewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
  colorScheme: 'light dark',
};
// simgeler (public/): SVG favicon (koyu sekme çubuğunda alan derinleşir), SVG okumayan tarayıcılar için 32 px PNG, iOS ana ekranı için 180 px
export const ICONS = {
  icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-32.png', sizes: '32x32', type: 'image/png' }],
  apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
};
// tarayıcıda: saklanan seçimi oku ('system' | 'light' | 'dark') ve <html>'e uygula
export const readTheme = () => { try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } };
export function applyTheme(v) {
  const r = document.documentElement;
  if (v === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', v);
}
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
