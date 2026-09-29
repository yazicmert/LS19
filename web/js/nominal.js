// Arka plan iş parçacığı: seçilen tarihin görevini otopilotla, bozulmasız, baştan sona bir kez uçurur.
// Sonuç Δv panelindeki "Nominal" sütunudur (canlı görevle aynı efemeris başlangıcı ve aynı tasarım).
import { makeLive } from './live.js';
import { Mission } from './mission.js';
import { dvFromEvents } from './dvbudget.js';

const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
onmessage = async (e) => {
  const { id, tStart, design } = e.data;
  try {
    const [spk, pck, eo] = await Promise.all([get('de440s.bsp').then((r) => r.arrayBuffer()),
      get('moon_pa_de440_200625.bpc').then((r) => r.arrayBuffer()), get('earth_orient.json').then((r) => r.json())]);
    makeLive(spk, pck, eo, tStart);
    const M = new Mission({ design }); M.P.tLimit = Infinity;
    for (;;) { const r = M.gen.next(); if (r.done) break; }
    const td = M.events.find((x) => x.key === 'INDI');
    postMessage({ id, dv: dvFromEvents(M.events), ok: !!(M.result && M.result.ok), tTouch: td ? td.t : null });
  } catch (err) {
    postMessage({ id, error: String(err.message || err) });
  }
};
