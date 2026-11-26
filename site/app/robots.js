// /robots.txt: her şey taranabilir; Vercel'in önizleme adreslerinde (VERCEL_ENV ≠ production) tarama kapalı
import { SITE_URL } from '@/lib/config';

export default function robots() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' }, sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}
