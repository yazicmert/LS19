// /api/surum — kaynak sürümleri (zaman kovası). Tarayıcı 10 dakikada bir sorar; kova değişince o katmanı yeniden yükler.
import { send, PERIODS, CHECK_S } from './_lib.js';
export function GET() {
  const now = Date.now(), kaynaklar = {};
  for (const [k, p] of Object.entries(PERIODS)) kaynaklar[k] = { surum: Math.floor(now / (p * 1000)), aralik_s: p, yas_s: Math.floor((now % (p * 1000)) / 1000) };
  return send({ mod: 'bulut', simdi: now, denetim_s: CHECK_S, kaynaklar }, { sMaxAge: 60, swr: 60 });
}
