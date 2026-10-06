// Nominal koşu: seçilen tasarımın bozulmasız otopilot uçuşu (Δv panelinin "Nominal" sütunu). Tarayıcıdaki arka plan iş parçacığı (nominal.js) ve hazır tasarım
// dosyasını üreten betik (test/make_designs.js) AYNI işlevi kullanır: önceden hesaplanan değer ile çalışma anında hesaplanan değer birbirinden sapamaz.
// Çağıran, koşudan önce taze efemeris kurar (makeLive) ve iniş güdümü 'opt'/'free' ise konik çözücüyü yükler (initConic).
import { Mission } from './mission.js';
import { dvFromEvents } from './dvbudget.js';
import { conicReady } from './conic.js';

// landing: 'zem' | 'opt' | 'free' (konik çözücü yüklü değilse 'zem'e düşer)
export function flyNominal(design, landing = 'zem') {
  const M = new Mission({ design, landing: conicReady() ? landing : 'zem' }); M.P.tLimit = Infinity;
  for (;;) { const r = M.gen.next(); if (r.done) break; }
  const td = M.events.find((x) => x.key === 'INDI');
  return { dv: dvFromEvents(M.events), ok: !!(M.result && M.result.ok), tTouch: td ? td.t : null };
}

// Δv panelinin nominal anahtarı: güdüm + ('+2' iki kademeli araçsa); tek kademe + 'zem' anahtarı `nominal` alanındadır (diğer 5'i nominalBy'da)
export const nominalKey = (landing, two) => landing + (two ? '+2' : '');
export const NOMINAL_BY = [['zem', true], ['opt', false], ['opt', true], ['free', false], ['free', true]];
