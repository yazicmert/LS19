// Monte Carlo iş parçacığı (Laboratuvar › Ay görevi): aynı görevi tohumlu hatalarla art arda uçurur (nominalrun.js › flyDispersed).
// Her koşu ayrı mesajla döner; arayüz (aymc.js) birkaç iş parçacığına tohumları paylaştırır ve sonuçları toplar.
import { makeLive, etOf } from './live.js';
import { EphStore } from './ephstore.js';
import { initConic } from './conic.js';
import { flyDispersed } from './nominalrun.js';
import { ephSpanDays } from './moonsite.js';

const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
let env = null;
onmessage = async (e) => {
  // landings: karşılaştırma kipinde aynı tohumlar her güdümle uçurulur (eşleştirilmiş örneklem: farklar tohum gürültüsünden arınır)
  const { id, tStart, design, landing = 'zem', landings = [landing], seeds = [], tliSigma = 1, nav = true, fault = 'none' } = e.data;
  try {
    if (!env || env.tStart !== tStart) {
      const [eph, eo] = await Promise.all([EphStore.open(new URL('../data/eph/v1/', import.meta.url).href), get('earth_orient.json').then((r) => r.json())]);
      await eph.ensure(etOf(tStart) - 86400, etOf(tStart) + ephSpanDays(design) * 86400);
      env = { tStart, eph, eo };
    }
    if (landings.some((l) => l !== 'zem')) { try { await initConic(); } catch (err) { /* konik çözücü yoksa ZEM'e düşer (flyDispersed) */ } }
    for (const seed of seeds) for (const l of landings) {
      makeLive(env.eph.spk, env.eph.pck, env.eo, tStart);                    // her koşu taze efemeris önbelleğiyle (nominal koşuyla aynı başlangıç)
      postMessage({ id, type: 'run', run: flyDispersed(design, l, { seed, tliSigma, nav, fault }) });
    }
    postMessage({ id, type: 'done' });
  } catch (err) {
    postMessage({ id, type: 'error', error: String(err.message || err) });
  }
};
