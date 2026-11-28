// eşleşmeyen her adres (dil olmayan yol, listede olmayan cisim): sitenin kendi 404'ü, durum kodu 404
import { fontVars } from '@/lib/fonts';
import NotFoundBody from '@/components/NotFoundBody';
import { THEME_SCRIPT, themeViewport, ICONS } from '@/lib/theme';
import './globals.css';

export const metadata = { title: 'Not found · lookstar19', robots: { index: false }, icons: ICONS };
export const viewport = themeViewport;

export default function GlobalNotFound() {
  // renk teması seçimi burada da ilk boyamadan önce uygulanır (lib/theme.js)
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body><NotFoundBody /></body>
    </html>
  );
}
