// Kullanım: node test/test_profiles.js PROFIL [YYYY-MM-DD]
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { designMission, PROFILES } from '../js/design.js';
import { Mission } from '../js/mission.js';
import { dvFromEvents } from '../js/dvbudget.js';
const key = process.argv[2] || 'NRHO', day = process.argv[3] || '2026-10-13';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const tOf = (ms) => { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; };
const ms = Date.parse(day + 'T00:00:00Z'), tStart = tOf(ms) - 86400;
let T0 = performance.now();
makeLive(SPK, PCK, eo, tStart);
const D = designMission(tOf(ms), (m) => console.log(`  [${((performance.now() - T0) / 1000).toFixed(1)}s] ${m}`), PROFILES[key].cfg);
console.log('tasarım', ((performance.now() - T0) / 1000).toFixed(1), 's; DV', JSON.stringify(Object.fromEntries(Object.entries(D.DV).map(([k, v]) => [k, +v.toFixed(1)]))));
fs.writeFileSync(`/tmp/claude-0/design_${key}.json`, JSON.stringify({ tStart, design: D }));
T0 = performance.now();
makeLive(SPK, PCK, eo, tStart);
const M = new Mission({ design: D }); M.P.tLimit = Infinity;
for (;;) { const r = M.gen.next(); if (r.done) break; if (M.done) break; }
for (const e of M.events) console.log(e.utc, (e.phase || '').padEnd(13), e.msg.slice(0, 110), (e.dv * 1000).toFixed(1));
console.log('görev', ((performance.now() - T0) / 1000).toFixed(1), 's', JSON.stringify(M.result), JSON.stringify(dvFromEvents(M.events)));
