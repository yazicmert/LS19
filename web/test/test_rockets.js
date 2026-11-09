// Ay görevinde roket seçimi (Node): cd web && node test/test_rockets.js
// (1) rockets.js verisi ve türetmeler: park yörüngesi kütlesi, TLI kapasitesi, Apollo 17 denetimi; (2) tasarım: yapılandırma anahtarı, kademe kaydı,
// yakıt yetmezse anlaşılır hata; (3) tam uçuş: her gerçek roketle (Apollo profili) Ay'a güvenli iniş; (4) arayüz/sahne sözleşmesi.
import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import * as R from '../js/rockets.js';
import { incPenalty, padIndex, siteOf, LEGACY_SITE } from '../js/pads.js';
import { designMission, normalizeConfig, PROFILES } from '../js/design.js';
import { Mission, twoStageDesign } from '../js/mission.js';
import { sceneSrc } from './scenesrc.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

console.log('rockets.js');
const vc = Math.sqrt(R.MU_E / 6578.137);
check(Math.abs(R.DV_REF.TLI - 3.1331) < 1e-3 && Math.abs(R.DV_REF.GTO - 2.4546) < 1e-3, `Δv (200 km dairesel): TLI (C3 = −2) ${R.DV_REF.TLI.toFixed(4)} km/s, GTO ${R.DV_REF.GTO.toFixed(4)} km/s`);
check(Math.abs(Math.sqrt(2 * R.MU_E / 6578.137 - 2) - vc - R.DV_REF.TLI) < 1e-12, 'TLI Δv = √(2μ/r + C3) − √(μ/r)');
for (const id of R.ROCKET_IDS) {
  const r = R.ROCKETS[id], s = r.stage;
  const sane = s.dry > 1000 && s.T > 50 && s.isp > 300 && s.isp < 470 && r.name && r.pad && (r.sized || (s.tank > s.dry && r.ref && r.ref.P > 0 && R.DV_REF[r.ref.kind]));
  check(sane, `${id}: ${r.name} — ${s.name}, ${s.T} kN, Isp ${s.isp} s, kuru ${s.dry} kg${s.tank ? ', tank ' + s.tank + ' kg' : ''}`);
}
// park kütlesi ↔ başarım: yayımlanan TLI yüküyle kademe tam tükenir
for (const id of ['SATURN_V', 'VULCAN']) {
  const r = R.ROCKETS[id], s = r.stage, M = R.parkMass(id), prop = M - s.dry - r.ref.P;
  const dv = s.isp * R.G0 * Math.log((s.dry + r.ref.P + prop) / (s.dry + r.ref.P)) / 1000;
  check(Math.abs(dv - R.DV_REF.TLI) < 1e-9 && Math.abs(R.tliCapacity(id) - r.ref.P) < 1, `${id}: yayımlanan TLI yükü (${r.ref.P} kg) park kütlesinden geri elde edilir`);
}
const ap17 = R.parkMass('SATURN_V') - R.ROCKETS.SATURN_V.stage.dry - R.ROCKETS.SATURN_V.ref.P;
check(ap17 > 65000 && ap17 < 80000, `Apollo 17 denetimi: S-IVB park yörüngesinde ${(ap17 / 1000).toFixed(1)} t yakıtla (gerçek ~70 t)`);
check(Math.abs(R.tliCapacity('SLS1') / 27000 - 1) < 0.1, `SLS Block 1 türetilmiş TLI kapasitesi ${(R.tliCapacity('SLS1') / 1000).toFixed(1)} t ~ yayımlanan 27 t (±%10; ICPS tankı sınırlar)`);
const f9 = R.tliCapacity('F9');
check(f9 > 3000 && f9 < 5000, `Falcon 9 (GTO 5,5 t'dan) türetilmiş TLI kapasitesi ${(f9 / 1000).toFixed(2)} t`);
check(R.parkPropellant('SLS1', 3600) === R.ROCKETS.SLS1.stage.tank && R.parkPropellant('F9', 3600) < R.ROCKETS.F9.stage.tank, 'park yakıtı = min(tank, M − kuru − yük): SLS tank sınırında, Falcon 9 başarım sınırında');
check(R.parkPropellant('F9', 3000) - R.parkPropellant('F9', 3600) === 600, 'hafif yük 1:1 yakıt olarak kalır');
check(R.parkPropellant('GENEL', 3600) === null && R.parkMass('GENEL') === null, 'genel kademe: yakıt göreve göre boyutlanır (önceki davranış)');

console.log('tasarım');
check(!('rocket' in normalizeConfig({ rocket: 'GENEL' })) && !('rocket' in normalizeConfig({ rocket: 'YOK' })) && normalizeConfig({ rocket: 'F9' }).rocket === 'F9', 'yapılandırma: genel kademe yazılmaz (hazır tasarımların önbellek anahtarı aynı), geçersiz kimlik atılır');
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
const spkB = ab(new URL('../data/de440s.bsp', import.meta.url)), pckB = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const ms = Date.parse('2026-10-13T00:00:00Z'), tStart = (ms / 86400000 + 2440587.5 + 69.18 / 86400 - E.jdTdb(0)) * 86400;
const design = (rocket, prof = 'APOLLO', site) => { E.setProvider(null); makeLive(spkB, pckB, eo, tStart); return designMission(E.tFromUtcMs(ms), () => {}, { ...PROFILES[prof].cfg, rocket, ...(site !== undefined ? { site } : {}) }); };
// her roket açıkça kendi gerçek rampasından (pads.js ROCKET_PADS): Saturn V LC-39A, SLS LC-39B, Falcon 9 SLC-40, Vulcan SLC-41
const PADS = padIndex(JSON.parse(read('data/pads.json'))), SITE = { SATURN_V: siteOf(PADS.get(87)), SLS1: LEGACY_SITE, F9: siteOf(PADS.get(80)), VULCAN: siteOf(PADS.get(29)) };
const res = {};
for (const id of ['SATURN_V', 'SLS1', 'F9', 'VULCAN']) {
  const D = design(id, 'APOLLO', SITE[id]), s0 = D.STAGES[0], st = R.ROCKETS[id].stage;
  const pay = D.STAGES.slice(1).reduce((q, x) => q + x.dry + x.prop, 0), avail = R.parkPropellant(id, pay, incPenalty(D.inc));     // park eğimi cezasıyla (pads.js)
  check(s0.rocket === id && s0.T === st.T && s0.isp === st.isp && s0.dry === st.dry && Math.abs(s0.prop - avail) <= 10 && D.LAUNCH.siteId === SITE[id].id, `${id}: ${D.LAUNCH.site.replace(/ \(.*$/, '')} rampasından; TLI kademesi ${s0.name}, park yakıtı ${s0.prop} kg (roketin başarımından)`);
  const M = new Mission({ design: twoStageDesign(D) }); M.P.tLimit = Infinity;
  for (;;) { const r = M.gen.next(); if (r.done) break; }
  const mcc = M.events.find((e) => /^MCC-1/.test(e.msg)), dvm = mcc ? +/Δv=([\d.]+)/.exec(mcc.msg)[1] : NaN;
  res[id] = { ok: M.result && M.result.ok, mcc: dvm, sep: M.events.some((e) => e.msg === `${s0.name} ayrıldı`) };
  check(res[id].ok && res[id].sep && dvm < 15, `${id}: Ay'a güvenli iniş; "${s0.name} ayrıldı"; MCC-1 ${dvm} m/s (kesme hatası Δv cinsinden)`);
}
// yakıt yetmeyen birleşim: Falcon 9 + NRHO (iniş aracı 4,2 t; türetilmiş kapasite ~3,8 t)
let err = null; try { design('F9', 'NRHO', SITE.F9); } catch (e) { err = e.message; }
check(err && /Falcon 9 Block 5 bu aracı Ay'a gönderemez: TLI için \d+ kg yakıt gerekir/.test(err), `yetmeyen yakıt anlaşılır hatayla durur: "${(err || '').slice(0, 90)}…"`);

console.log('arayüz ve sahne');
const html = read('index.html'), ui = read('js/ui.js'), app = read('js/app.js'), scene = sceneSrc(), rm = read('js/rocketmodels.js');
const arac = html.slice(html.indexOf('id="tab-arac"'), html.indexOf('id="tab-ucus"'));
check(/id="rocketCards"/.test(arac) && /id="rocketInfo"/.test(arac), 'roket kartları 2. adımda (Araç ve güdüm)');
check(/rocket: this\.rocket/.test(ui) && /'rocket' in c/.test(ui) && /rocket: undefined/.test(ui), 'ui: yapılandırma roketi taşır; profil seçimi roketi değiştirmez; profil eşleşmesi roketten bağımsız');
check(/ui\.onRocket = /.test(app) && /startDesign\(/.test(app.slice(app.indexOf('ui.onRocket = '))) && /gönderemez/.test(app) && /rocketOk/.test(app), 'app: roket değişince yeniden tasarım; yakıt yetmezse önceki rokete dönülür');
check(/rocketOf\(D && D\.STAGES/.test(scene) && /setStageModel\(rk\.model\)/.test(scene) && /makeUpperStage/.test(scene) && /flameSx/.test(scene), 'sahne: tasarımdaki roketin üst kademesi (model, alev, çok motor)');
for (const id of R.ROCKET_IDS) { const r = R.ROCKETS[id]; check(r.model === 'sivb' || new RegExp(`key === '${r.model}'`).test(rm), `${id}: 3B model "${r.model}"`); }
check(R.ROCKET_IDS.every((id) => R.ROCKETS[id].stageNote) && R.ROCKETS.GENEL.model !== R.ROCKETS.SATURN_V.model && /3\. kademesi/.test(R.ROCKETS.SATURN_V.stageNote), 'araç görünümü: her roketin kademe etiketi var; genel kademe S-IVB modelini kullanmaz (Saturn V ile karışmaz)');
check(/'stagetag'/.test(scene) && /stageNote/.test(scene), 'sahne: yakın planda TLI kademesi etiketi');
for (const id of ['SLS1', 'F9', 'VULCAN']) { const d = R.ROCKETS[id].stage.dims; check(d && d.D > 3 && d.L > 10 && d.bell.exitD > 1 && d.bell.len < d.L / 2, `${id}: çizim ölçüleri (çap ${d.D} m, boy ${d.L} m, çan ${d.bell.exitD} m)`); }
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
