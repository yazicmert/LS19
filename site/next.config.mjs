// lookstar19 (Next.js). Kök adres varsayılan dile (İngilizce) yönlenir; dil yolları /en ve /tr.
// Güvenlik başlıkları her yanıtta. İçerik güvenliği politikası (CSP): her şey aynı kaynaktan; dış bağlantılar yalnız gezinme (yayınlar,
// JPL, LS19). Next statik sayfalara satır içi betik koyduğu için script-src 'unsafe-inline' (nonce her sayfayı dinamik yapardı);
// meshopt çözücüsü WebAssembly olduğundan 'wasm-unsafe-eval'; GLB içindeki dokular blob: adresinden okunur. Geliştirme sunucusu eval ister.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = process.env.NODE_ENV !== 'production';
export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' blob: data:${dev ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');
export const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
const config = {
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },        // site/ kendi kökü (depoda ikinci bir package-lock var)
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { globalNotFound: true },                                   // app/global-not-found.jsx: eşleşmeyen adreslerde sitenin 404'ü
  async redirects() {
    return [
      { source: '/', destination: '/en', permanent: false },
      // katalog ve kütüphane tek listede birleşti: eski adresler (sorgu korunur) ana sayfaya
      { source: '/:lang(en|tr)/asteroids/all', destination: '/:lang/asteroids', permanent: true },
      { source: '/:lang(en|tr)/satellites/all', destination: '/:lang/satellites', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // modeller sabit adlı (anahtar.glb); değişirse en geç bir gün içinde yenisi gelir
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=2592000' }] },
    ];
  },
};
export default config;
