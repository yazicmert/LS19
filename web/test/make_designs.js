// data/designs_default.json üretir: varsayılan tarih için tüm hazır profillerin tasarımı + nominal Δv (bozulmasız otopilot koşusu).
// Tarayıcıdakiyle birebir aynı yol: aynı efemeris başlangıcı (seçilen günden 1 gün önce), aynı tasarım kodu.
// Kullanım: node test/make_designs.js [YYYY-MM-DD]
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { designMission, PROFILES } from '../js/design.js';
import { Mission } from '../js/mission.js';
import { dvFromEvents } from '../js/dvbudget.js';

const day = process.argv[2] || '2026-10-13';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
EO.loadEarthOrientation(eo);
const tOf = (ms) => { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; };
const startMs = Date.parse(day + 'T00:00:00Z'), tStart = tOf(startMs) - 86400;
const out = { date: day, startMs, tStart, profiles: {} };
for (const [key, P] of Object.entries(PROFILES)) {
  let T0 = performance.now();
  makeLive(SPK, PCK, eo, tStart);
  const design = designMission(tOf(startMs), () => {}, P.cfg);
  const tD = (performance.now() - T0) / 1000; T0 = performance.now();
  makeLive(SPK, PCK, eo, tStart);                                   // nominal.js ile aynı: taze efemeris
  const M = new Mission({ design }); M.P.tLimit = Infinity;
  for (;;) { const r = M.gen.next(); if (r.done || M.done) break; }
  const nominal = dvFromEvents(M.events);
  const tot = Object.values(nominal).filter((v) => v != null).reduce((a, b) => a + b, 0) - (nominal.LLOI ?? 0);   // LOI ve LLOI aynı olay
  console.log(`${key.padEnd(9)} tasarım ${tD.toFixed(1)} s, koşu ${((performance.now() - T0) / 1000).toFixed(1)} s, ${M.result && M.result.ok ? 'TEMAS' : 'BAŞARISIZ'} ${M.result ? M.result.utc : ''}, toplam Δv ${tot.toFixed(1)} m/s`);
  out.profiles[key] = { design, nominal };
}
fs.writeFileSync(new URL('../data/designs_default.json', import.meta.url), JSON.stringify(out));
console.log('yazıldı:', (JSON.stringify(out).length / 1024).toFixed(0), 'KB');
