// /api/sentry — JPL Sentry çarpma riski izleme listesi (özet)
import { send, fail, getJson, compactSentry, PERIODS } from './_lib.js';
export async function GET() {
  try {
    const data = compactSentry(await getJson('https://ssd-api.jpl.nasa.gov/sentry.api'));
    return send({ kaynak: 'JPL Sentry', t: Date.now(), n: data.length, data }, { sMaxAge: PERIODS.sentry, swr: 7 * PERIODS.sentry });
  } catch (e) { return fail('Sentry verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
