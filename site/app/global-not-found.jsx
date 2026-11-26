// eşleşmeyen her adres (dil olmayan yol, listede olmayan cisim): sitenin kendi 404'ü, durum kodu 404
import { fontVars } from '@/lib/fonts';
import NotFoundBody from '@/components/NotFoundBody';
import './globals.css';

export const metadata = { title: 'Not found · lookstar19', robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontVars}>
      <body><NotFoundBody /></body>
    </html>
  );
}
