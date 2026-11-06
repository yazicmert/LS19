// /api/launches — fırlatma kataloğu: yaklaşan 30 ve son 20 fırlatma (küçük biçim: web/js/launchdata.js; yerel karşılığı sunucu.py).
// Kaynak The Space Devs Launch Library 2 (ücretsiz, anahtarsız; IP başına saatte 15 istek): CDN yanıtı 30 dk paylaşımlı tutar, kova başına
// bölge başına 2 istek gider. LL2'nin yaklaşan listesi alınamazsa (ör. paylaşılan bulut IP'si sınıra takıldı) RocketLaunch.Live'ın ücretsiz
// akışına (sonraki 5 fırlatma) düşer; tarayıcı bu durumda LL2'yi kendisi de dener (CORS açık).
import { send, fail, getJson, PERIODS } from './_lib.js';
import { LL2_UPCOMING, LL2_PREVIOUS, RLL_NEXT, buildCatalog } from '../web/js/launchdata.js';

export async function GET() {
  const [up, prev] = await Promise.allSettled([getJson(LL2_UPCOMING, { tries: 1, timeoutMs: 20000 }), getJson(LL2_PREVIOUS, { tries: 1, timeoutMs: 20000 })]);
  if (up.status === 'fulfilled' && Array.isArray(up.value.results)) {
    const cat = buildCatalog('ll2', up.value.results, prev.status === 'fulfilled' ? prev.value.results : []);
    return send(cat, { sMaxAge: PERIODS.launch, swr: 2 * PERIODS.launch, headers: { 'X-LS19-Kaynak': encodeURIComponent(cat.kaynak) } });
  }
  try {
    const r = await getJson(RLL_NEXT, { tries: 2, timeoutMs: 20000 });
    if (!Array.isArray(r.result) || !r.result.length) throw new Error('boş yanıt');
    const cat = buildCatalog('rll', r.result, []);
    // yedek kaynak: LL2 kısa sürede yeniden denensin
    return send(cat, { sMaxAge: 600, swr: 600, headers: { 'X-LS19-Kaynak': encodeURIComponent(cat.kaynak) } });
  } catch (e) {
    const why = up.status === 'rejected' ? String(up.reason && up.reason.message || up.reason) : 'beklenmeyen yanıt';
    return fail('Fırlatma verisi alınamadı (LL2: ' + why.slice(0, 80) + ' · RocketLaunch.Live: ' + String(e.message || e).slice(0, 80) + ')');
  }
}
