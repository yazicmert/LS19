// Arka plan iş parçacığı: seçilen tarihin görevini otopilotla, bozulmasız, baştan sona bir kez uçurur.
// Sonuç Δv panelindeki "Nominal" sütunudur (canlı görevle aynı efemeris başlangıcı ve aynı tasarım).
// Varsayılan tarihin tüm profilleri için bu sonuçlar data/designs_default.json'da hazırdır (test/make_designs.js); burası yalnız başka tarihlerde çalışır.
import { makeLive, etOf } from './live.js';
import { EphStore } from './ephstore.js';
import { initConic } from './conic.js';
import { flyNominal } from './nominalrun.js';
import { ephSpanDays } from './moonsite.js';

const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
onmessage = async (e) => {
  const { id, tStart, design, landing = 'zem' } = e.data;
  try {
    const [eph, eo] = await Promise.all([EphStore.open(new URL('../data/eph/v1/', import.meta.url).href), get('earth_orient.json').then((r) => r.json())]);
    await eph.ensure(etOf(tStart) - 86400, etOf(tStart) + ephSpanDays(design) * 86400);           // yalnız görevin yılının JPL kayıtları
    makeLive(eph.spk, eph.pck, eo, tStart);
    if (landing !== 'zem') { try { await initConic(); } catch (err) { /* ZEM'e düşer */ } }
    postMessage({ id, ...flyNominal(design, landing) });
  } catch (err) {
    postMessage({ id, error: String(err.message || err) });
  }
};
