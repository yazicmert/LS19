// İniş görüntü ölçütleri (docs/6dof.md §5): görevleri Node'da uçurur, PDI'dan temasa aracın yönelimini ölçer ve evre başına özetler.
//   node tools/inis_olcut.mjs                                                  6 profil × tek/iki kademe × 3 güdüm = 36 görev (birkaç dakika)
//   PROFS=APOLLO,NRHO VEHS=two MODES=opt node tools/inis_olcut.mjs            alt küme (profiller: APOLLO, APOLLO11, NRHO, L2, L1, YUKSELTME; araç: one, two; güdüm: zem, opt, free)
//   OVR='{"OPT_DESCENT.PRESETS.opt.CONE":[[180,110],[100,45],[60,45],[20,20],[0,20]],"CMD.FOH":false}' node tools/inis_olcut.mjs    parametre geçersiz kılma (A/B denemesi)
// Geçersiz kılma anahtarları: ROLES, CTL, TERM, OPT_DESCENT, CMD altındaki yollar (örn. CTL.TVC_MIN, CMD.HANDOVER, ROLES.lander.ctl.Kw).
// Satır başına (evre başına rms |ω| °/s, snap = |ω| > 8°/s olan 0,05 s'lik adım sayısı, err = azami itki ekseni hatası °, cmd = itki komutu yönünün bir adımdaki en büyük değişimi °):
//   kalan yakıt (kg) · SON (son iniş, < 120 m) · YAK (yaklaşma, < 3 km) · PDI (frenleme)
import fs from 'fs';
import * as E from '../web/js/engine.js';
import * as EO from '../web/js/earth.js';
import { makeLive } from '../web/js/live.js';
import * as MI from '../web/js/mission.js';
import { ROLES } from '../web/js/rigidbody.js';
import { CTL } from '../web/js/attctl.js';
import { initConic } from '../web/js/conic.js';

const { Mission, twoStageDesign, siteIcrf, TERM, OPT_DESCENT, CMD } = MI;
const NS = { ROLES, CTL, TERM, OPT_DESCENT, CMD }, DEG = 180 / Math.PI;
const rd = (f) => { const b = fs.readFileSync(new URL(`../web/data/${f}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
await initConic();
const SPK = rd('de440s.bsp'), PCK = rd('moon_pa_de440_200625.bpc'), eo = JSON.parse(fs.readFileSync(new URL('../web/data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(fs.readFileSync(new URL('../web/data/designs_default.json', import.meta.url)));
for (const [k, v] of Object.entries(JSON.parse(process.env.OVR || '{}'))) { const p = k.split('.'); let o = NS[p[0]]; for (let i = 1; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }

function run(prof, veh, mode) {
  const D = veh === 'two' ? twoStageDesign(ALL.profiles[prof].design) : ALL.profiles[prof].design;
  E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing: mode }); M.P.tLimit = Infinity;
  const ph = {}; let prevCmd = null, cmdMax = 0;
  M.P.onStep = (P, h, thr) => {
    if (!/PDI|YAKLASMA|SON_INIS/.test(P.phase)) return;
    const a = P.att, B = (ph[P.phase] = ph[P.phase] || { n: 0, w2: 0, wMax: 0, errMax: 0, snaps: 0 }), w = Math.hypot(...a.w) * DEG;
    B.n++; B.w2 += w * w; B.wMax = Math.max(B.wMax, w); B.errMax = Math.max(B.errMax, a.err * DEG); if (w > 8) B.snaps++;
    if (P.lastCmd && thr > 0) { const c = E.unit(P.lastCmd); if (prevCmd) cmdMax = Math.max(cmdMax, Math.acos(Math.max(-1, Math.min(1, E.dot(prevCmd, c)))) * DEG); prevCmd = c; } else prevCmd = null;
  };
  for (;;) { if (M.gen.next().done) break; }
  return { res: M.result, ph, cmdMax };
}

const profs = (process.env.PROFS || 'APOLLO,APOLLO11,NRHO,L2,L1,YUKSELTME').split(','), vehs = (process.env.VEHS || 'one,two').split(','), modes = (process.env.MODES || 'zem,opt,free').split(',');
const f = (B) => (B ? `wRMS ${Math.sqrt(B.w2 / B.n).toFixed(1)}°/s snap ${B.snaps} err ${B.errMax.toFixed(0)}°` : '-');
let bad = 0;
for (const p of profs) for (const v of vehs) for (const m of modes) {
  let S; try { S = run(p, v, m); } catch (e) { console.log(p, v, m, 'HATA', e.message.slice(0, 80)); bad++; continue; }
  const r = S.res; if (!r.ok) bad++;
  console.log(`${p.padEnd(9)} ${v} ${m.padEnd(4)} ${r.ok ? 'temas' : 'BAŞARISIZ'} dikey ${r.v_mps[2].toFixed(2)} yatay ${Math.hypot(r.v_mps[0], r.v_mps[1]).toFixed(2)} m/s, kalan yakıt ${r.prop.toFixed(0)} kg | SON ${f(S.ph.SON_INIS)} | YAK ${f(S.ph.YAKLASMA)} | PDI ${f(S.ph.PDI)} | cmd ${S.cmdMax.toFixed(1)}°`);
}
console.log('başarısız:', bad);
process.exit(bad ? 1 : 0);
