import { notFound } from 'next/navigation';
import { LANGS, SITE_URL } from '@/lib/config';
import { isLang, t } from '@/lib/i18n';
import { fontVars } from '@/lib/fonts';
import { THEME_SCRIPT, themeViewport, ICONS } from '@/lib/theme';
import '../globals.css';

// dynamicParams düzende kapatılmaz: alt sayfalara geçer ve istekle üretilen katalog sayfalarını (/sb/[des]) engeller.
// Geçersiz dil aşağıda notFound() ile 404'e gider.
export function generateStaticParams() { return LANGS.map((lang) => ({ lang })); }
export async function generateMetadata({ params }) {
  const { lang } = await params, L = t(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: L.home.title, template: '%s · lookstar19' },
    description: L.home.description,
    icons: ICONS,
  };
}
// tarayıcı çubuğu iki temada kobalt alan; color-scheme iki tema (globals.css ile aynı)
export const viewport = themeViewport;

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  // data-theme ilk boyamadan önce satır içi betikle yazılır (lib/theme.js); sunucu HTML'inde olmadığı için suppressHydrationWarning
  return (
    <html lang={lang} className={fontVars} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>{children}</body>
    </html>
  );
}
