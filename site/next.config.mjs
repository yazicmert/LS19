// lookstar19 (Next.js). Kök adres varsayılan dile (İngilizce) yönlenir; dil yolları /en ve /tr.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const config = {
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },        // site/ kendi kökü (depoda ikinci bir package-lock var)
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() { return [{ source: '/', destination: '/en', permanent: false }]; },
  async headers() {
    return [{ source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }] }];
  },
};
export default config;
