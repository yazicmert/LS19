import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import { designMission } from '../js/design.js';
import { Mission } from '../js/mission.js';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
const spkB = ab(new URL('../data/de440s.bsp', import.meta.url)), pckB = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const dates = (process.argv[2] || '2026-10-13T00:00:00Z').split(',');
for (const ds of dates) {
  const T0 = performance.now();
  // efemerisin başlangıç anı: seçilen tarih
  E.setProvider(null);
  const ms = Date.parse(ds);
  const jdU = ms / 86400000 + 2440587.5, tStart = (jdU + 69.18 / 86400 - E.jdTdb(0)) * 86400;
  const { L } = makeLive(spkB, pckB, eo, tStart);
  const tFrom = E.tFromUtcMs(ms);
  const D = designMission(tFrom, (m) => console.log('   ', m));
  const T1 = performance.now();
  const M = new Mission({ design: D }); M.P.tLimit = Infinity;
  for (;;) { const r = M.gen.next(); if (r.done) break; }
  const ev = M.events.filter((e) => /MCC|LOI tamam|TEMAS|ÇARPMA/.test(e.msg)).map((e) => e.utc.slice(0, 19) + ' ' + e.msg.slice(0, 80));
  console.log(ds, 'tasarım', ((T1 - T0) / 1000).toFixed(1), 's, uçuş', ((performance.now() - T1) / 1000).toFixed(1), 's'); ev.forEach((x) => console.log('   ', x));
  console.log('    toplam Δv', (M.P.dvUsed * 1000).toFixed(1), 'm/s, Güneş yüksekliği', D.sunElAtLanding.toFixed(1), '°, efemeris adımı', L.steps);
}
