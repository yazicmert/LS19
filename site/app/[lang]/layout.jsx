import { notFound } from 'next/navigation';
import { LANGS, SITE_URL } from '@/lib/config';
import { isLang, t } from '@/lib/i18n';
import { fontVars } from '@/lib/fonts';
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
    icons: { icon: '/icon.svg' },
  };
}
export const viewport = { themeColor: '#1d3fd6' };

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang} className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
