// data/designs_default.json üretir: varsayılan tarih için tüm hazır profillerin tasarımı + nominal Δv (bozulmasız otopilot koşusu).
// Tarayıcıdakiyle birebir aynı yol: aynı efemeris başlangıcı (seçilen günden 1 gün önce), aynı tasarım kodu, aynı koşu işlevi (js/nominalrun.js).
//   nominal   : tek kademe + ZEM güdümü (eski Δv sütunu)
//   nominalBy : öteki güdüm/araç birleşimleri (zem+2, opt, opt+2, free, free+2); varsayılan açılış (opt + iki kademe) ~5 s'lik nominal koşusunu artık çalıştırmaz
// Kullanım: node test/make_designs.js [YYYY-MM-DD] [--nominal-by]
//   --nominal-by : dosyadaki tasarım ve nominal değerlerine dokunmadan yalnız nominalBy alanını yeniden hesaplar
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { designMission, PROFILES } from '../js/design.js';
import { twoStageDesign } from '../js/mission.js';
import { initConic } from '../js/conic.js';
import { flyNominal, nominalKey, NOMINAL_BY } from '../js/nominalrun.js';

const args = process.argv.slice(2), day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-10-13', onlyBy = args.includes('--nominal-by');
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
const FILE = new URL('../data/designs_default.json', import.meta.url);
EO.loadEarthOrientation(eo);
await initConic();
const tOf = (ms) => { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; };
const startMs = Date.parse(day + 'T00:00:00Z'), tStart = tOf(startMs) - 86400;
const out = onlyBy ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { date: day, startMs, tStart, profiles: {} };
if (onlyBy && out.startMs !== startMs) throw new Error(`dosyadaki tarih ${out.date} ≠ ${day}`);
const dvTotal = (n) => Object.values(n).filter((v) => v != null).reduce((a, b) => a + b, 0) - (n.LLOI ?? 0);   // LOI ve LLOI aynı olay
for (const [key, P] of Object.entries(PROFILES)) {
  let T0 = performance.now();
  if (!onlyBy) {
    makeLive(SPK, PCK, eo, tStart);
    const design = JSON.parse(JSON.stringify(designMission(tOf(startMs), () => {}, P.cfg)));         // tarayıcıya JSON olarak gider: koşular da JSON'dan geçmiş tasarımla yapılır
    const tD = (performance.now() - T0) / 1000; T0 = performance.now();
    makeLive(SPK, PCK, eo, tStart);                                   // nominal.js ile aynı: taze efemeris
    const r = flyNominal(design, 'zem');
    console.log(`${key.padEnd(9)} tasarım ${tD.toFixed(1)} s, koşu ${((performance.now() - T0) / 1000).toFixed(1)} s, ${r.ok ? 'TEMAS' : 'BAŞARISIZ'}, toplam Δv ${dvTotal(r.dv).toFixed(1)} m/s`);
    out.profiles[key] = { design, nominal: r.dv };
  }
  const prof = out.profiles[key]; T0 = performance.now(); prof.nominalBy = {};
  for (const [landing, two] of NOMINAL_BY) {
    makeLive(SPK, PCK, eo, tStart);
    const r = flyNominal(two ? twoStageDesign(prof.design) : prof.design, landing);
    prof.nominalBy[nominalKey(landing, two)] = r.dv;
    console.log(`  ${key.padEnd(9)} ${nominalKey(landing, two).padEnd(8)} ${r.ok ? 'TEMAS' : 'BAŞARISIZ'}, toplam Δv ${dvTotal(r.dv).toFixed(1)} m/s`);
  }
  console.log(`  ${key.padEnd(9)} nominalBy ${((performance.now() - T0) / 1000).toFixed(1)} s`);
}
fs.writeFileSync(FILE, JSON.stringify(out));
console.log('yazıldı:', (JSON.stringify(out).length / 1024).toFixed(0), 'KB');
