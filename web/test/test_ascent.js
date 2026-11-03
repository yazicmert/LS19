// Kalkış canlandırması (Node): cd web && node test/test_ascent.js
// ascent.js'in kinematik yolu gerçek bir tasarımın yörüngeye giriş durumuyla: rampada başlar (WGS-84 yüzeyi, Dünya ile döner), girişte konum ve hızla birleşir,
// irtifa tekdüze artar ve tipik çıkışa yakındır; kademe ayrılmaları gerçek zamanlardan ölçeklenir; arayüz sözleşmesi.
import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import { Mission } from '../js/mission.js';
import { buildAscent, scaleEvents } from '../js/ascent.js';
import { ROCKETS, ROCKET_IDS } from '../js/rockets.js';
import { LEGACY_SITE } from '../js/pads.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const DEF = JSON.parse(read('data/design_default.json')), D = DEF.design;
makeLive(ab(new URL('../data/de440s.bsp', import.meta.url)), ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)), JSON.parse(read('data/earth_orient.json')), DEF.tStart);
const M = new Mission({ design: D }), ins = { t: M.P.s.t, r: M.P.s.r.slice(), v: M.P.s.v.slice() };
const site = { lat: D.LAUNCH.lat ?? LEGACY_SITE.lat, lon: D.LAUNCH.lon ?? LEGACY_SITE.lon };
const P = buildAscent({ site, tLaunch: D.LAUNCH.t_launch, ins, icrfToItrf: E.earthIcrfToItrf, rE: E.R_E });
const norm = (a) => Math.hypot(...a), sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// jeodezik irtifa (WGS-84) — telemetrinin kullandığı
const geodH = (rIcrf, t) => {
  const M3 = E.earthIcrfToItrf(t), x = [0, 1, 2].map((i) => M3[i][0] * rIcrf[0] + M3[i][1] * rIcrf[1] + M3[i][2] * rIcrf[2]);
  const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f), p = Math.hypot(x[0], x[1]); let la = Math.atan2(x[2], p * (1 - e2)), h = 0;
  for (let k = 0; k < 8; k++) { const N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2); h = p / Math.cos(la) - N; la = Math.atan2(x[2], p * (1 - e2 * N / (N + h))); }
  return h;
};
check(Math.abs(P.T - (ins.t - D.LAUNCH.t_launch)) < 1e-6 && P.T > 500 && P.T < 700, `canlandırma süresi = giriş − fırlatma = ${P.T.toFixed(0)} s (tasarımın çıkış süresi)`);
const s0 = P.at(D.LAUNCH.t_launch - 10), s00 = P.at(D.LAUNCH.t_launch);
check(Math.abs(geodH(s0.r, D.LAUNCH.t_launch - 10)) < 0.01 && Math.abs(geodH(s00.r, D.LAUNCH.t_launch)) < 0.01, `rampada jeodezik irtifa ${(geodH(s0.r, D.LAUNCH.t_launch - 10) * 1000).toFixed(1)} m (WGS-84 yüzeyi)`);
const vRot = norm(s0.v);
check(Math.abs(vRot - 0.4651 * Math.cos(28.627 * Math.PI / 180)) < 0.003, `rampa Dünya ile döner: eylemsiz hız ${(vRot * 1000).toFixed(0)} m/s (ω·R·cos φ)`);
const s1 = P.at(ins.t - 1e-3);
check(norm(sub(s1.r, ins.r)) < 0.05, `girişte konum birleşir (fark ${(norm(sub(s1.r, ins.r)) * 1000).toFixed(1)} m)`);
const vr = dot(s1.v, ins.r) / norm(ins.r), dv = norm(sub(s1.v, ins.v));
check(Math.abs(vr) < 0.02 && Math.abs(norm(s1.v) - norm(ins.v)) / norm(ins.v) < 0.01 && dv < 0.15, `girişte hız: dikey ${(vr * 1000).toFixed(1)} m/s, büyüklük farkı %${(Math.abs(norm(s1.v) - norm(ins.v)) / norm(ins.v) * 100).toFixed(2)}, vektör farkı ${(dv * 1000).toFixed(0)} m/s`);
let mono = true, prev = -1; for (let k = 0; k <= 200; k++) { const h = P.at(D.LAUNCH.t_launch + P.T * k / 200).h; if (h < prev - 1e-9) mono = false; prev = h; }
const hMeco = P.at(D.LAUNCH.t_launch + 0.3 * P.T).h, h10 = P.at(D.LAUNCH.t_launch + 0.1 * P.T).h;
check(mono && hMeco > 40 && hMeco < 100 && h10 < 30, `irtifa tekdüze artar; τ=0,1'de ${h10.toFixed(0)} km, birinci kademe ayrılmasında (τ≈0,3) ${hMeco.toFixed(0)} km (tipik ~70 km)`);
const up = P.at(D.LAUNCH.t_launch + 2);
check(dot(up.dir, up.up) > 0.98, 'kalkışta itki yönü yerel düşeye yakın (dikey yükseliş)');
for (const id of ROCKET_IDS) {
  const A = ROCKETS[id].ascent, ev = scaleEvents(A.events, A.tIns, P.T);
  check(A && A.lv && A.tIns > 400 && ev.every((e, i) => e.tScaled > 0 && e.tScaled <= P.T + 1e-9 && (!i || e.t >= A.events[i - 1].t) && (e.cut != null || e.part)) && (A.approx || A.src),
    `${id}: kalkış modeli "${A.lv}", ${A.events.length} olay (gerçek giriş T+${Math.floor(A.tIns / 60)}:${String(A.tIns % 60).padStart(2, '0')} → ${P.T.toFixed(0)} s'ye ölçekli)${A.approx ? ', yaklaşık' : ''}`);
}
const html = read('index.html'), app = read('js/app.js'), scene = read('js/scene.js'), rm = read('js/rocketmodels.js');
check(/id="btnAscent"/.test(html) && /id="ascBar"/.test(html) && /data-asc="end"/.test(html), 'Uçuş adımında "Kalkışı izle"; oynatma çubuğu (hız, yörüngeye atla)');
check(/ascent\.tick\(dt\)/.test(app) && /cmd: 'seek', t: ui\.t0/.test(app) && /insState/.test(app), 'oynatma ana iş parçacığında; bitince görev girişten sürer');
check(/setAscent\(/.test(scene) && /clippingPlanes/.test(scene) && /localClippingEnabled/.test(scene), 'sahne: tam roket, kademe ayrılması kesme düzlemiyle');
check(['booster', 'fairing', 'las'].every((k) => new RegExp(`part = '${k}'`).test(rm)) && /key === 'generic'/.test(rm.slice(rm.indexOf('export function makeLaunchVehicle'))), 'ayrılabilir parçalar etiketli (iticiler, kaporta, LAS); genel roketin de modeli var');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
