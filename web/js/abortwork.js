// Görev iptali iş parçacığı (Laboratuvar › Ay görevi › Uçuş): o anki durumdan Dünya'ya dönüş için en küçük Δv (abort.js). Canlı uçuşa dokunmaz:
// görev worker'ının durumunun bir kopyasıyla, aynı başlangıçtan kurulan canlı efemerisle (makeLive) hesaplar.
import { makeLive, etOf } from './live.js';
import { EphStore } from './ephstore.js';
import { solveReturn, solveReturnWindow, ABORT } from './abort.js';

const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
let env = null;
onmessage = async (e) => {
  const { id, tStart, t, r, v } = e.data;
  try {
    if (!env) {
      const [eph, eo] = await Promise.all([EphStore.open(new URL('../data/eph/v1/', import.meta.url).href), get('earth_orient.json').then((x) => x.json())]);
      env = { eph, eo };
    }
    await env.eph.ensure(etOf(tStart) - 86400, etOf(t) + ABORT.TMAX + 3 * 86400);
    makeLive(env.eph.spk, env.eph.pck, env.eo, tStart);
    postMessage({ id, type: 'progress', f: 0.05, msg: 'Şimdi yakılırsa…' });
    const now = solveReturn(t, r, v);
    postMessage({ id, type: 'progress', f: 0.2, msg: 'En iyi yakış anı aranıyor…' });
    const win = solveReturnWindow(t, r, v, { onProgress: (f) => postMessage({ id, type: 'progress', f: 0.2 + 0.8 * f, msg: 'En iyi yakış anı aranıyor…' }) });
    const strip = (x) => (x ? { ok: x.ok, dvMag: x.dvMag, hp: x.hp, tEntry: x.tEntry, free: !!x.free, tBurn: x.tBurn ?? t, period: x.period } : null);
    postMessage({ id, type: 'done', now: strip(now), win: strip(win) });
  } catch (err) {
    postMessage({ id, type: 'error', error: String(err.message || err) });
  }
};
