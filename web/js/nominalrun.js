// Nominal koşu: seçilen tasarımın bozulmasız otopilot uçuşu (Δv panelinin "Nominal" sütunu). Tarayıcıdaki arka plan iş parçacığı (nominal.js) ve hazır tasarım
// dosyasını üreten betik (test/make_designs.js) AYNI işlevi kullanır: önceden hesaplanan değer ile çalışma anında hesaplanan değer birbirinden sapamaz.
// Çağıran, koşudan önce taze efemeris kurar (makeLive) ve iniş güdümü 'opt'/'free' ise konik çözücüyü yükler (initConic).
import * as E from './engine.js';
import { Mission } from './mission.js';
import { dvFromEvents } from './dvbudget.js';
import { conicReady } from './conic.js';

// landing: 'zem' | 'opt' | 'free' (konik çözücü yüklü değilse 'zem'e düşer)
export function flyNominal(design, landing = 'zem') {
  // canlı görevle aynı "Ay çevresi" yarıçapı (worker.js setupDate): halo profillerinde 1,25 × halo apolünü; Mission.prograde bu sınırı kullanır
  E.setMoonZone(design.profile === 'HALO' ? 1.25 * design.HALO.stats.raKm : E.SOI_M);
  const M = new Mission({ design, landing: conicReady() ? landing : 'zem' }); M.P.tLimit = Infinity;
  for (;;) { const r = M.gen.next(); if (r.done) break; }
  const td = M.events.find((x) => x.key === 'INDI');
  return { dv: dvFromEvents(M.events), ok: !!(M.result && M.result.ok), tTouch: td ? td.t : null };
}

// Δv panelinin nominal anahtarı: güdüm + ('+2' iki kademeli araçsa); tek kademe + 'zem' anahtarı `nominal` alanındadır (diğer 5'i nominalBy'da)
export const nominalKey = (landing, two) => landing + (two ? '+2' : '');
export const NOMINAL_BY = [['zem', true], ['opt', false], ['opt', true], ['free', false], ['free', true]];

// ---------------------------------------------------------------- dağılımlı koşu (Laboratuvar › Ay görevi › Monte Carlo; aymc.js, mcwork.js)
// Aynı tasarım, tohumlu hatalarla: TLI kesme hatası (1σ, m/s; mission.js tliDisp) ve iniş seyrüseferi (landnav.js: IMU, radar, TRN; PDI'da yer izleme hatası).
// Algılayıcı arızası senaryoları (NAV_FAULTS) landnav.js'in arıza modelidir. Dönüş: temas sonucu ve Δv; tohum aynıysa sonuç bit düzeyinde aynıdır.
export const NAV_FAULTS = {
  none: null,
  alt: { faults: [{ sensor: 'alt', drop: true, below: 3000 }] },              // altimetre 3 km altında susar (IM-2 benzeri: lazer altimetre bozuldu)
  trn: { trn: false },                                                          // arazi göreli seyrüsefer yok (Apollo: kamera ve harita eşleme yoktu)
  vel: { faults: [{ sensor: 'vel', drop: true, below: 2000 }] },              // hız ölçer 2 km altında susar
};
export function flyDispersed(design, landing = 'zem', { seed = 1, tliSigma = 1, nav = true, fault = 'none' } = {}) {
  E.setMoonZone(design.profile === 'HALO' ? 1.25 * design.HALO.stats.raKm : E.SOI_M);
  const navOpt = nav ? { seed: (seed * 7919) >>> 0, ...(NAV_FAULTS[fault] || {}) } : false;
  const M = new Mission({ design, landing: conicReady() ? landing : 'zem', tliDisp: tliSigma > 0 ? { sigma: tliSigma, seed } : null, nav: navOpt }); M.P.tLimit = Infinity;
  for (;;) { const r = M.gen.next(); if (r.done) break; }
  const R = M.result || {}, dv = dvFromEvents(M.events);
  const mcc = ['MCC-1', 'MCC-2', 'MCC-3', 'MCC-4'].reduce((s, k) => s + (dv[k] || 0), 0);
  return { seed, landing: conicReady() ? landing : 'zem', ok: !!R.ok, reentry: !!R.reentry, landed: !!R.t, grade: R.grade || (R.reentry ? 'reentry' : 'none'),
    miss: R.posErr_m ? Math.hypot(R.posErr_m[0], R.posErr_m[1]) : null, pos: R.posErr_m || null, vz: R.v_mps ? R.v_mps[2] : null, vh: R.v_mps ? Math.hypot(R.v_mps[0], R.v_mps[1]) : null,
    prop: R.prop ?? null, mcc, tli: dv.TLI || null, dvTotal: Object.entries(dv).filter(([k, v]) => v != null && k !== 'LLOI').reduce((s, [, v]) => s + v, 0), why: R.why || [] };
}
