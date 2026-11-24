// Canlı sayfadaki görev tasarımları (profil karşılaştırması) için iş parçacığı: tasarım ana iş parçacığını dakikalarca meşgul etmesin.
// Ölçüm (telefon taklidi, CPU ×4): karşılaştırma sırasında 90 sn'de 89 sn uzun görev, tek seferde 5,3 sn donma; sayfa canlıyken (yükleme katmanı yok).
// "Tasarla" ana iş parçacığında kalır (yükleme katmanı altında beklenir; bazı tarayıcılarda iş parçacıkları düşük öncelikle koşup yavaşlıyor: app.js).
// Kurulum fizik iş parçacığının (worker.js) tasarım yoluyla aynı: parçalı JPL çekirdekleri, Dünya yönelimi, aynı başlangıçtan canlı efemeris.
// Yeniden deneme yok (karşılaştırma "bu tarih" içindir: design.js, test_moonsite.js denetler).
import { makeLive } from './live.js';
import { EphStore } from './ephstore.js';
import * as EO from './earth.js';
import { designMission, missionPath } from './design.js';

const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });          // abortwork.js ile aynı
let env = null;
onmessage = async ({ data: { tFrom, tStart, cfg, win, path, pathFor } }) => {
  try {
    if (!env) {
      const [eph, eo] = await Promise.all([EphStore.open(new URL('../data/eph/v1/', import.meta.url).href),
        get('earth_orient.json').then((r) => r.json())]);
      EO.loadEarthOrientation(eo); env = { eph, eo };
    }
    await env.eph.ensure(...win);
    makeLive(env.eph.spk, env.eph.pck, env.eo, tStart);
    // pathFor: hazır (önbellekteki) tasarımın yalnız yolu; path: tasarımla birlikte gerçek yol (brifing çizimi, design.js missionPath)
    const design = pathFor || designMission(tFrom, (msg) => postMessage({ type: 'progress', msg }), cfg);
    let p = null; if ((path || pathFor) && design) { try { p = missionPath(design); } catch (e) { p = null; } }
    postMessage({ type: 'done', design: pathFor ? null : design, path: p });
  } catch (e) { postMessage({ type: 'error', msg: String((e && e.message) || e) }); }
};
