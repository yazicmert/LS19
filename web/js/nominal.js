// Arka plan iş parçacığı: seçilen tarihin görevini otopilotla, bozulmasız, baştan sona bir kez uçurur.
// Sonuç Δv panelindeki "Nominal" sütunudur (canlı görevle aynı efemeris başlangıcı ve aynı tasarım).
// Varsayılan tarihin tüm profilleri için bu sonuçlar data/designs_default.json'da hazırdır (test/make_designs.js); burası yalnız başka tarihlerde çalışır.
import { makeLive } from './live.js';
import { initConic } from './conic.js';
import { flyNominal } from './nominalrun.js';

const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
onmessage = async (e) => {
  const { id, tStart, design, landing = 'zem' } = e.data;
  try {
    const [spk, pck, eo] = await Promise.all([get('de440s.bsp').then((r) => r.arrayBuffer()),
      get('moon_pa_de440_200625.bpc').then((r) => r.arrayBuffer()), get('earth_orient.json').then((r) => r.json())]);
    makeLive(spk, pck, eo, tStart);
    if (landing !== 'zem') { try { await initConic(); } catch (err) { /* ZEM'e düşer */ } }
    postMessage({ id, ...flyNominal(design, landing) });
  } catch (err) {
    postMessage({ id, error: String(err.message || err) });
  }
};
