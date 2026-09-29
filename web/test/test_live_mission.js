import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import { Mission } from '../js/mission.js';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
const T0 = performance.now();
const { L } = makeLive(ab(new URL('../data/de440s.bsp', import.meta.url)), ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)), eo, 1083172.266 - 86400);
const M = new Mission(); M.P.tLimit = Infinity;
for (;;) { const r = M.gen.next(); if (r.done) break; }
for (const e of M.events) console.log(e.utc, e.phase.padEnd(13), e.msg.slice(0, 100), (e.dv * 1000).toFixed(1));
console.log('süre', ((performance.now() - T0) / 1000).toFixed(2), 's, efemeris adımı', L.steps);
