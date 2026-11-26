import { Archivo, Fragment_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { LANGS, SITE_URL } from '@/lib/config';
import { isLang, t } from '@/lib/i18n';
import '../globals.css';

const sans = Archivo({ subsets: ['latin', 'latin-ext'], axes: ['wdth'], variable: '--f-sans', display: 'swap' });
const mono = Fragment_Mono({ subsets: ['latin', 'latin-ext'], weight: '400', variable: '--f-mono', display: 'swap' });

export const dynamicParams = false;
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
    <html lang={lang} className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
