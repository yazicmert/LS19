// Dünya park yörüngesinde enerji yükseltme (TLI öncesi apoje yükseltme yakışları) doğrulaması (Node 20+): cd web && node test/test_raise.js
//  1) yapılandırma normalizasyonu ve eski yapılandırmayla uyum
//  2) tasarım: zincir tutarlılığı (apoje programı, dairesel park yörüngesi, yakıt ve Δv muhasebesi, zaman sırası)
//  3) uçuş (N-cisim ve etki küresi çözücüleri): hedef apojeler, TLI öncesi perije, küçük MCC-1, başarılı iniş
//  4) bozulma dayanıklılığı: park ve yükseltme sırasında uygulanan hız bozulmaları (perije senkronlu ateşleme + apojeye göre süre)
//  5) halo profili (L1) ile birlikte
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { designMission, normalizeConfig, DEFAULT_CONFIG, PROFILES } from '../js/design.js';
import { Mission } from '../js/mission.js';
import { dvFromEvents } from '../js/dvbudget.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const tOf = (ms) => { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; };
const ms = Date.parse('2026-10-13T00:00:00Z'), tStart = tOf(ms) - 86400;
const cfgOf = (base, n, ha) => { const c = JSON.parse(JSON.stringify(base)); c.earth.raise = { n, ha }; return c; };
const design = (cfg) => { makeLive(SPK, PCK, eo, tStart); return designMission(tOf(ms), () => {}, cfg); };
const maxApo = (M) => Math.max(...M.events.filter((e) => /^RAISE-\d+_CUT$/.test(e.key)).map((e) => +/apoje (\d+)/.exec(e.msg)[1]));
// görevi uçur; bozulma: { t, dv, dir }; duvar saati sınırı aşılırsa timeout
function fly(D, { nbody = true, pert = null, wallMs = 30000 } = {}) {
  makeLive(SPK, PCK, eo, tStart);
  const M = new Mission({ design: D, nbody }); M.P.tLimit = Infinity;
  const T0 = performance.now(); let n = 0, done = false;
  for (;;) {
    if (pert && !done && M.P.s.t >= pert.t) { done = true; M.P.s.v = E.add(M.P.s.v, E.scale(E.unit(pert.dir || [0.3, -0.5, 0.8]), pert.dv / 1000)); }
    if (M.gen.next().done || M.done) break;
    if ((++n & 1023) === 0 && performance.now() - T0 > wallMs) { M.timeout = true; break; }
  }
  return M;
}

// ---------------------------------------------------------------- 1) yapılandırma
{
  const c = normalizeConfig({ earth: { raise: { n: 9, ha: 5 } } }), z = normalizeConfig({ earth: { raise: { n: 0, ha: 33333 } } });
  check('yapılandırma: yakış sayısı 0…4 ve apoje 1000…100000 km ile sınırlanır', c.earth.raise.n === 4 && c.earth.raise.ha === 1000, JSON.stringify(c.earth.raise));
  check('yapılandırma: yükseltme yokken apoje tek biçime iner (önbellek anahtarı)', z.earth.raise.n === 0 && z.earth.raise.ha === DEFAULT_CONFIG.earth.raise.ha);
  const old = { earth: { h: 185, inc: 28.6, revs: 1.5 }, moon: DEFAULT_CONFIG.moon };
  check('yapılandırma: yükseltme alanı olmayan eski tasarım yapılandırması varsayılanla aynı', JSON.stringify(normalizeConfig(old)) === JSON.stringify(normalizeConfig(DEFAULT_CONFIG)));
  check('profil: YUKSELTME profili tanımlı (3 yakış, 40.000 km)', PROFILES.YUKSELTME && normalizeConfig(PROFILES.YUKSELTME.cfg).earth.raise.n === 3);
}

// ---------------------------------------------------------------- 2) tasarım
const D0 = design(DEFAULT_CONFIG);                                             // yükseltmesiz karşılaştırma tabanı
const cfg3 = cfgOf(DEFAULT_CONFIG, 3, 40000), D3 = design(cfg3), R = D3.RAISE;
{
  const b = R.burns, st = D3.STAGES[0], mdot = st.T / (st.isp * E.G0), apo = b.map((x) => x.apo);
  check('tasarım: 3 yakış, apojeler artan ve sonuncusu istenen apoje', b.length === 3 && apo[0] < apo[1] && apo[1] < apo[2] && Math.abs(apo[2] - 40000) < 1, 'apoje ' + apo.map((x) => x.toFixed(0)).join(' → ') + ' km');
  check('tasarım: park yörüngesi dairesel (e < 1e-3) ve ~185 km', Math.abs(R.leo.apo - R.leo.peri) < 5 && R.leo.alt > 175 && R.leo.alt < 200, `${R.leo.peri.toFixed(1)} × ${R.leo.apo.toFixed(1)} km`);
  check('tasarım: zaman sırası giriş < yakış-1 < yakış-2 < yakış-3 < TLI', D3.INS.t < b[0].t && b[0].t < b[1].t && b[1].t < b[2].t && b[2].t < D3.TLI.t_ign, `giriş→TLI ${((D3.TLI.t_ign - D3.INS.t) / 3600).toFixed(1)} sa`);
  const sumTau = b.reduce((q, x) => q + x.dur, 0);
  check('tasarım: ek yakıt = ṁ·Στ ve kademe yakıtı bunu içerir', Math.abs(R.propExtra - mdot * sumTau) < 1e-6 && st.prop > R.propExtra, `ek ${R.propExtra.toFixed(1)} kg, kademe ${st.prop.toFixed(1)} kg`);
  check('tasarım: Δv\'ler azalan (apoje yükseldikçe perije hızı artar) ve toplamı DV.RAISE', b[0].dv > b[1].dv && b[1].dv > b[2].dv && Math.abs(b.reduce((q, x) => q + x.dv, 0) - D3.DV.RAISE) < 1e-6, b.map((x) => x.dv.toFixed(0)).join(' + ') + ' = ' + D3.DV.RAISE.toFixed(0) + ' m/s');
  check('tasarım: yükseltmeli toplam tasarım Δv\'si doğrudan TLI\'dan en çok ~20 m/s farklı', Math.abs((D3.DV.RAISE + D3.DV.TLI) - D0.DV.TLI) < 20, `yükseltme ${D3.DV.RAISE.toFixed(0)} + TLI ${D3.DV.TLI.toFixed(0)} / doğrudan TLI ${D0.DV.TLI.toFixed(0)} m/s`);
  check('tasarım: yükseltmesiz tasarımda RAISE/INS yok', !D0.RAISE && !D0.INS && D0.DV.RAISE === undefined);
}

// ---------------------------------------------------------------- 3) uçuş (her iki çözücü)
let base = null;
for (const nbody of [true, false]) {
  const M = fly(D3, { nbody }), r = M.result, dv = dvFromEvents(M.events), name = nbody ? 'N-cisim' : 'etki küresi';
  const raiseEv = M.events.filter((e) => /^RAISE-\d+_CUT$/.test(e.key));
  check(`uçuş (${name}): 3 yakışın hepsi yapıldı, hedef apojeye ±0,1% ulaşıldı`, raiseEv.length === 3 && raiseEv.every((e, i) => Math.abs(+/apoje (\d+)/.exec(e.msg)[1] + E.R_E - R.burns[i].raEnd) < 0.001 * R.burns[i].raEnd), raiseEv.map((e) => /apoje (\d+)/.exec(e.msg)[1]).join(' → ') + ' km');
  check(`uçuş (${name}): MCC-1 < 10 m/s, MCC-2 < 1 m/s (zincir tasarımla tutarlı)`, dv['MCC-1'] < 10 && dv['MCC-2'] < 1, `MCC-1 ${dv['MCC-1'].toFixed(2)}, MCC-2 ${dv['MCC-2'].toFixed(2)} m/s`);
  check(`uçuş (${name}): iniş başarılı, dikey hız ≈ −1,07 m/s`, !M.timeout && r && r.ok && Math.abs(r.v_mps[2] + 1.07) < 0.15, r ? `vz ${r.v_mps[2].toFixed(2)} m/s, ${r.utc}` : 'bitmedi');
  check(`uçuş (${name}): olay Δv'si (RAISE) tasarımla uyumlu`, Math.abs(dv.RAISE - D3.DV.RAISE) < 1, `uçuş ${dv.RAISE.toFixed(2)} / tasarım ${D3.DV.RAISE.toFixed(2)} m/s`);
  const ign = M.events.find((e) => e.key === 'TLI');
  check(`uçuş (${name}): TLI, tasarım anında (perije senkronu nominalde tasarımla aynı)`, Math.abs(ign.t - D3.TLI.t_ign) < 0.5, `fark ${(ign.t - D3.TLI.t_ign).toFixed(3)} s`);
  if (nbody) base = { M, dv };
  else check('uçuş: iki çözücü aynı toplam Δv\'yi verir', Math.abs(M.P.dvUsed - base.M.P.dvUsed) * 1000 < 0.1, `fark ${(Math.abs(M.P.dvUsed - base.M.P.dvUsed) * 1000).toFixed(4)} m/s`);
}
{
  const M0 = fly(D0), tot0 = M0.P.dvUsed * 1000, tot3 = base.M.P.dvUsed * 1000;
  check('uçuş: yükseltmeli görevin toplam Δv\'si doğrudan TLI\'lıdan en çok ~20 m/s farklı', Math.abs(tot3 - tot0) < 20, `yükseltmeli ${tot3.toFixed(1)}, doğrudan ${tot0.toFixed(1)} m/s`);
}

// ---------------------------------------------------------------- 4) bozulma dayanıklılığı
{
  const b = R.burns, cases = [['park (girişten 30 dk sonra)', D3.INS.t + 1800, 2], ['yakış-1 sonrası', b[0].t + b[0].dur + 600, 2], ['yakış-2 sonrası', b[1].t + b[1].dur + 600, 2], ['yakış-3 sonrası', b[2].t + b[2].dur + 600, 2], ['yakış-2 sonrası (10 m/s)', b[1].t + b[1].dur + 600, 10]];
  for (const [name, t, dv] of cases) {
    const M = fly(D3, { pert: { t, dv } }), r = M.result, d = dvFromEvents(M.events);
    check(`bozulma ${dv} m/s, ${name}: iniş yine başarılı`, !M.timeout && r && r.ok, M.timeout ? 'zaman aşımı' : r ? `vz ${r.v_mps[2].toFixed(2)}, MCC-1 ${(d['MCC-1'] ?? NaN).toFixed(1)}, MCC-2 ${(d['MCC-2'] ?? NaN).toFixed(2)}, toplam ${(M.P.dvUsed * 1000).toFixed(0)} m/s` : 'sonuç yok');
  }
}

// ---------------------------------------------------------------- 5) halo profili ile
{
  const cfg = cfgOf(PROFILES.L1.cfg, 1, 15000), T0 = performance.now(), D = design(cfg), M = fly(D, { wallMs: 60000 }), r = M.result, d = dvFromEvents(M.events);
  check('halo (L1) + 1 yükseltme yakışı: tasarım ve uçuş, iniş başarılı', !M.timeout && r && r.ok && D.RAISE && D.profile === 'HALO', `tasarım+uçuş ${((performance.now() - T0) / 1000).toFixed(0)} s, MCC-1 ${d['MCC-1'].toFixed(2)} m/s, vz ${r ? r.v_mps[2].toFixed(2) : '-'}`);
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
