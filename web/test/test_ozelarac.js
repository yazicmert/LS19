// "Kendi aracımla" sınaması (Node): cd web && node test/test_ozelarac.js
//  1) rockets.js: kullanıcının roketi (OZEL) — doğrulama, kayıt, park kütlesi ve Ay'a yük kapasitesi
//  2) design.js: yapılandırma (ozel, lander) ve tasarım — gerçek SLS'in sayılarıyla tanımlanan roket SLS'le aynı tasarımı verir; yetersiz iniş aracı ve
//     zayıf roket açık hata verir; kullanıcının iniş aracı tanktan beslenir (dolu tank TLI'da taşınır)
//  3) aytext.js: bağlantı (ozel=…, inis=…) gidiş-dönüş
//  4) brifingtext.js: aracın kaba denetimi, yer sıralaması (yakıt payı, sonra ışık), hata özeti; arayüz sözleşmesi
import fs from 'fs';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import * as R from '../js/rockets.js';
import { designMission, normalizeConfig, PROFILES, validLander } from '../js/design.js';
import { ayLinkFromState, ayStateFromLink } from '../js/aytext.js';
import * as B from '../js/brifingtext.js';

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}`); if (!ok) fail++; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const SLS = R.ROCKETS.SLS1, slsSpec = { dry: SLS.stage.dry, tank: SLS.stage.tank, T: SLS.stage.T, isp: SLS.stage.isp, P: SLS.ref.P };

// ---------------------------------------------------------------- 1) roket
check('doğrulama: sınır dışı ya da eksik alan reddedilir; değerler yuvarlanır (önbellek anahtarı kararlı)',
  R.validCustom({ ...slsSpec, isp: 600 }) === null && R.validCustom({ dry: 1 }) === null && R.validCustom(null) === null && R.validCustom({ ...slsSpec, dry: 3800.4 }).dry === 3800);
R.setCustomRocket(null);
check('kayıt yokken OZEL roket sayılmaz (genel kademeye düşer)', !R.isRocket('OZEL') && R.rocketOf('OZEL').name === R.ROCKETS.GENEL.name);
R.setCustomRocket(slsSpec);
check('kayıt: "Kendi roketim", genel kademenin kalkış canlandırması, her rampadan; tanım geri okunur', R.isRocket('OZEL') && R.rocketOf('OZEL').name === 'Kendi roketim' && R.rocketOf('OZEL').ascent === R.ROCKETS.GENEL.ascent && JSON.stringify(R.customSpec()) === JSON.stringify(R.validCustom(slsSpec)));
check('park kütlesi ve Ay\'a yük kapasitesi SLS\'inkiyle aynı (aynı üst kademe ve yayımlanmış yük)', Math.abs(R.parkMass('OZEL') - R.parkMass('SLS1')) < 1e-6 && Math.abs(R.tliCapacity('OZEL') - R.tliCapacity('SLS1')) < 1e-6);

// ---------------------------------------------------------------- 2) tasarım
const nc = normalizeConfig({ rocket: 'OZEL', ozel: slsSpec, lander: { dry: 1300, tank: 4000, T: 16, isp: 320 } });
check('yapılandırma: roket OZEL ve tanımı, iniş aracı yazılır; geçersiz tanımla OZEL yazılmaz', nc.rocket === 'OZEL' && nc.ozel.P === 27000 && nc.lander.tank === 4000
  && !('rocket' in normalizeConfig({ rocket: 'OZEL', ozel: { dry: 1 } })) && !('lander' in normalizeConfig({ lander: { dry: 1300 } })) && validLander({ dry: 100, tank: 1, T: 1, isp: 300 }) === null);
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(read('data/earth_orient.json'));
const spkB = ab(new URL('../data/de440s.bsp', import.meta.url)), pckB = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const ms = Date.parse('2026-10-13T00:00:00Z'), tStart = (ms / 86400000 + 2440587.5 + 69.18 / 86400 - E.jdTdb(0)) * 86400;
const run = (cfg) => { E.setProvider(null); makeLive(spkB, pckB, eo, tStart); try { return designMission(E.tFromUtcMs(ms), () => {}, { ...PROFILES.APOLLO.cfg, ...cfg }); } catch (e) { return { err: e.message }; } };
const dS = run({ rocket: 'SLS1' }), dO = run({ rocket: 'OZEL', ozel: slsSpec });
check(`SLS'in sayılarıyla tanımlanan roket SLS'le aynı tasarım: TLI yakıtı ${dO.STAGES && dO.STAGES[0].prop} kg, gereken ${dO.TLI_NEED} kg`,
  !dO.err && dO.STAGES[0].prop === dS.STAGES[0].prop && dO.TLI_NEED === dS.TLI_NEED && dO.STAGES[0].rocket === 'OZEL' && Math.abs(dO.LAUNCH.t_launch - dS.LAUNCH.t_launch) < 60);       // fırlatma anı: kalkış süresi genel kademeninki (SLS'te yörüngeye giriş 496 s)
const dL = run({ rocket: 'OZEL', ozel: slsSpec, lander: { dry: 1300, tank: 4000, T: 16, isp: 320 } });
check(`kullanıcının iniş aracı: tank dolu (${dL.STAGES && dL.STAGES[1].prop} kg), gereken ${dL.LANDER_NEED} kg; dolu araç TLI'da taşınır (gereken TLI yakıtı artar)`,
  !dL.err && dL.STAGES[1].prop === 4000 && dL.LANDER_NEED < 4000 && dL.TLI_NEED > dO.TLI_NEED);
const dX = run({ rocket: 'OZEL', ozel: slsSpec, lander: { dry: 1300, tank: 1500, T: 16, isp: 320 } });
check('yetersiz iniş aracı: gereken, tanktaki ve eksik yakıtla açık hata', /İniş aracının yakıtı bu göreve yetmez: \d+ kg gerekir, tankta 1500 kg \(eksik \d+ kg\)/.test(dX.err || ''));
const dW = run({ rocket: 'OZEL', ozel: { dry: 3000, tank: 20000, T: 100, isp: 450, P: 2000 } });
check('zayıf roket: "Kendi roketim bu aracı Ay\'a gönderemez" (gereken ve kalan yakıtla)', /Kendi roketim bu aracı Ay'a gönderemez/.test(dW.err || ''));

// ---------------------------------------------------------------- 3) bağlantı
{
  const cfg = normalizeConfig({ rocket: 'OZEL', ozel: slsSpec, lander: { dry: 1300, tank: 4000, T: 16, isp: 320 } });
  const o = ayLinkFromState({ date: '2026-12-12', cfg, profileKey: 'APOLLO', vehicle: 'one', landing: 'opt' }), L = ayStateFromLink(new URLSearchParams(o), { profiles: PROFILES });
  check(`bağlantı: roket ve iniş aracı tanımları gidip döner (${new URLSearchParams(o).toString().slice(0, 90)}…)`, o.roket === 'OZEL' && L.rocket === 'OZEL' && JSON.stringify(L.ozel) === JSON.stringify(cfg.ozel) && JSON.stringify(L.lander) === JSON.stringify(cfg.lander));
  check('bozuk tanım atılır: roket OZEL sayılmaz', !ayStateFromLink(new URLSearchParams('roket=OZEL&ozel=1,2&arac=one'), { profiles: PROFILES }).rocket);
}

// ---------------------------------------------------------------- 4) brifing
{
  const defs = JSON.parse(read('data/designs_default.json'));
  const f = B.vehicleFacts(slsSpec, B.DEFAULT_LANDER, defs);
  check(`aracın kaba denetimi: dolu araç ${f.wet} kg ≤ ${f.cap} kg; dolu tankla ${f.haveDv.toFixed(0)} m/s ≥ gereken ~${f.needDv.toFixed(0)} m/s; Ay'da itki/ağırlık ${f.twr.toFixed(2)}`,
    f.fits && f.dvOk && Math.abs(f.haveDv - 320 * 9.80665 * Math.log(5300 / 1300)) < 1e-6 && Math.abs(f.needDv - 2876) < 15 && f.twrOk);
  const g = B.vehicleFacts({ ...slsSpec, P: 2000 }, { dry: 1300, tank: 1500, T: 2, isp: 320 }, defs);
  check('yetmeyen araç: sığmaz, Δv yetmez, itki/ağırlık düşük', !g.fits && !g.dvOk && !g.twrOk);
  const row = (land, sun, tL) => ({ st: 'ok', D: { STAGES: [{ prop: 28940 }, { prop: 4000 }], TLI_NEED: 9280, LANDER_NEED: 4000 - land, sunElAtLanding: sun, t_L: tL } });
  const eq = { A11: row(2050, 21.8, 5), A15: row(2050, 12.3, 9), A17: row(2050, 15.1, 1), A12: { st: 'err', err: 'x' } };
  check('yer sıralaması: yakıt payları eşitse ışık (Güneş 10°\'ye en yakın) kazanır; hatalı yer sıraya girmez', B.rankSites(eq).join() === 'A15,A17,A11' && !B.marginsDiffer(eq));
  const df = { A11: row(2050, 21.8, 5), A15: row(300, 10, 9) };
  check('yakıt payı farklıysa önce pay', B.rankSites(df)[0] === 'A11' && B.marginsDiffer(df));
  check('hata özeti: iniş yakıtı eksik / roket yetmez / yakınsamadı', B.siteErr('İniş aracının yakıtı bu göreve yetmez: 1950 kg gerekir, tankta 1900 kg (eksik 50 kg)').a[0] === '50'
    && /çıkaramaz/.test(B.siteErr('Kendi roketim bu aracı Ay\'a gönderemez').t) && /yakınsamadı/.test(B.siteErr('').t));
}
const br = read('js/brifing.js'), app = read('js/app.js'), ui = read('js/ui.js');
check('brifing: girişte "Kendi aracımla"; araç → yer araması (altı yer, Apollo profili, tek kademe) → brifing; kullanıcı seçmediyse en iyi yer',
  /act: 'vehicle', t: 'Kendi aracımla'/.test(br) && /this\.steps = VEH_STEPS/.test(br) && /vehicle: 'one'/.test(br) && /this\.h\.live\(\{ \.\.\.this\.sel, site: k \}, 'APOLLO'/.test(br) && /!\(S\.picked && /.test(br));
check('yapılandırma yolu: panel (getConfig/setConfig), brifingin canlı tasarımı ve son tasarım tanımları taşır',
  /ozel: this\.rocket === CUSTOM_ID \? customSpec\(\) : undefined, lander: this\.lander \|\| undefined/.test(ui) && /if \(c && c\.ozel\) setCustomRocket\(c\.ozel\);/.test(ui)
  && /\.\.\.\(sel\.rocket === CUSTOM_ID \? \{ ozel: sel\.ozel \} : \{\}\), lander: sel\.lander \|\| undefined/.test(app) && /if \(sel\.rocket === CUSTOM_ID\) setCustomRocket\(sel\.ozel\);/.test(app));
check('tasarım worker\'ı kullanıcının roketini yapılandırmadan kurar', /if \(cfg\.rocket === CUSTOM_ID\) setCustomRocket\(cfg\.ozel\);/.test(read('js/design.js')));

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
