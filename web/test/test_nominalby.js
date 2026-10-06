// Hazır nominal Δv'ler ve açılış yükü (Node 20+): cd web && node test/test_nominalby.js
//  Eskiden varsayılan açılış (optimal iniş + iki kademeli araç) her seferinde ~5 sn'lik nominal koşusunu ayrı bir worker'da yeniden çalıştırıyordu (46 MB efemeris + tüm görev + SOCP);
//  artık data/designs_default.json her profil için tüm güdüm/araç birleşimlerinin nominalini (nominalBy) hazır taşır; sonuç tarayıcıdaki işlevle (js/nominalrun.js) üretilir.
//  1) dosya yapısı: her profilde nominalBy 5 anahtar (zem+2, opt, opt+2, free, free+2), değerler nominal ile aynı şema, makul büyüklük
//  2) varsayılan açılış anahtarı (opt+2) tüm profillerde hazır → app.js nominal worker'ını çalıştırmaz
//  3) belirleyicilik: bir profilin iki birleşimi yeniden uçurulur, dosyadaki değerle bit düzeyinde aynı
//  4) kablolama: app.js önbellek/nominalBy, nominal.js ve make_designs.js aynı işlevi kullanır; gökyüzü katmanları açılışta kurulmaz, gökyüzü açılınca ya da boşta kurulur
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { twoStageDesign } from '../js/mission.js';
import { initConic } from '../js/conic.js';
import { flyNominal, nominalKey, NOMINAL_BY } from '../js/nominalrun.js';
import { PROFILES } from '../js/design.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const defs = JSON.parse(rd('../data/designs_default.json'));
const total = (n) => Object.entries(n).filter(([k, v]) => v != null && k !== 'LLOI').reduce((s, [, v]) => s + v, 0);          // LOI ve LLOI aynı olay

// ---------------------------------------------------------------- 1) dosya yapısı
{
  const WANT = ['zem+2', 'opt', 'opt+2', 'free', 'free+2'], bad = [];
  check('nominalrun: NOMINAL_BY anahtarları = zem+2, opt, opt+2, free, free+2 (zem tek kademe `nominal` alanında)', NOMINAL_BY.map(([l, t]) => nominalKey(l, t)).join() === WANT.join());
  check('altı profilin hepsi dosyada', Object.keys(defs.profiles).sort().join() === Object.keys(PROFILES).sort().join(), Object.keys(defs.profiles).join(','));
  for (const [k, v] of Object.entries(defs.profiles)) {
    if (Object.keys(v.nominalBy || {}).join() !== WANT.join()) { bad.push(`${k}: anahtarlar ${Object.keys(v.nominalBy || {})}`); continue; }
    const base = total(v.nominal), keys = Object.keys(v.nominal).sort().join();
    for (const w of WANT) {
      const d = v.nominalBy[w], t = total(d);
      if (Object.keys(d).sort().join() !== keys) bad.push(`${k}/${w}: şema farklı`);
      if (!Object.values(d).every((x) => x === null || Number.isFinite(x))) bad.push(`${k}/${w}: sayı değil`);
      if (!(Math.abs(t - base) / base < 0.05)) bad.push(`${k}/${w}: toplam Δv ${t.toFixed(1)} nominal ${base.toFixed(1)} (±%5 dışında)`);
    }
  }
  check('her profilde nominalBy 5 anahtar, nominal ile aynı şema, toplam Δv nominalin %5\'i içinde', bad.length === 0, bad.slice(0, 3).join('; '));
}

// ---------------------------------------------------------------- 2) varsayılan açılış hazır
{
  const app = rd('../js/app.js'), m = app.match(/let landingMode = '(\w+)', vehicleMode = '(\w+)'/), key = nominalKey(m[1], m[2] === 'two');
  const missing = Object.entries(defs.profiles).filter(([, v]) => !v.nominalBy[key]).map(([k]) => k);
  check(`varsayılan açılış anahtarı (${key}) tüm profillerde hazır: nominal worker çalışmaz`, missing.length === 0 && key === 'opt+2', missing.join(','));
}

// ---------------------------------------------------------------- 3) belirleyicilik: yeniden uçur, dosyadaki değerle aynı
{
  const ab = (f) => { const b = fs.readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const SPK = ab('../data/de440s.bsp'), PCK = ab('../data/moon_pa_de440_200625.bpc'), eo = JSON.parse(rd('../data/earth_orient.json'));
  EO.loadEarthOrientation(eo); await initConic();
  const prof = defs.profiles.APOLLO;
  const fly = (design, landing) => { makeLive(SPK, PCK, eo, defs.tStart); return flyNominal(design, landing); };
  const t0 = performance.now();
  const a = fly(twoStageDesign(prof.design), 'opt'), b = fly(prof.design, 'free');
  check('APOLLO opt+2 ve free yeniden uçurulunca dosyadaki nominalBy ile bit düzeyinde aynı', JSON.stringify(a.dv) === JSON.stringify(prof.nominalBy['opt+2']) && JSON.stringify(b.dv) === JSON.stringify(prof.nominalBy.free) && a.ok && b.ok,
    `${((performance.now() - t0) / 1000).toFixed(1)} s, toplam Δv ${total(a.dv).toFixed(1)} / ${total(b.dv).toFixed(1)} m/s`);
  const z = fly(prof.design, 'zem');
  check('APOLLO zem (tek kademe) yeniden uçurulunca dosyadaki nominal ile aynı', JSON.stringify(z.dv) === JSON.stringify(prof.nominal));
}

// ---------------------------------------------------------------- 4) kablolama (kaynak denetimi)
{
  const app = rd('../js/app.js'), nom = rd('../js/nominal.js'), mk = rd('../test/make_designs.js');
  check('app.js: cachedDesign hazır tasarımla nominalBy\'ı taşır ve oturum önbelleğine koyar (sonradan hesaplananlar saklanır)', /nominalBy: \{ \.\.\.\(v\.nominalBy \|\| \{\}\) \}/.test(app) && /designCache\.set\(cacheKey\(ms, cfg\), e\); return e;/.test(app));
  check('app.js: Δv nominal anahtarı güdüm + (\'+2\' iki kademe) ve nominalBy\'dan okunur', /const nominalKey = \(\) => \(optimalOk \? landingMode : 'zem'\) \+ \(vehicleMode === 'two' \? '\+2' : ''\)/.test(app) && /ce\.nominalBy\[key\]/.test(app));
  check('nominal.js ve make_designs.js aynı koşu işlevini kullanır (flyNominal)', /flyNominal/.test(nom) && /flyNominal/.test(mk) && /NOMINAL_BY/.test(mk) && !/new Mission\(/.test(nom));
  const boot = app.slice(app.indexOf('async function boot()'), app.indexOf('let skyInit = false;')), init = app.slice(app.indexOf('function initSky()'), app.indexOf('function idleInitSky()'));
  check('gökyüzü katmanları (SatLayer, AsteroidLayer, Updater, Tracker, SkyUI…) açılışta kurulmaz', !/new (SatLayer|AsteroidLayer|Updater|Tracker|SkyUI|AstUI|ImpactUI)\(/.test(boot) && /new SatLayer\(/.test(init) && /new AsteroidLayer\(/.test(init) && /updater\.start\(\)/.test(init));
  check('gökyüzü çalışma alanı açılınca (setWorkspace) ve görev hazır + boşta (requestIdleCallback) kurulur; ?prefetch=1 hemen', /if \(m === 'sky'\) \{\s*initSky\(\);/.test(app) && /applyUrlParams\(\); idleInitSky\(\);/.test(app) && /requestIdleCallback\(initSky, \{ timeout: 8000 \}\)/.test(app) && /get\('prefetch'\) === '1'/.test(app));
  check('initSky tek seferlik (skyInit) ve efemeris çekirdekleri hazırken', /if \(skyInit \|\| !K\) return; skyInit = true;/.test(app));
  const tr = rd('../js/tracker.js');
  check('tracker: geçiş taraması zaman dilimli (findPassesIter, ≤ 8 ms dilim, jeton ile iptal), etiket metni yalnız değişince yazılır', /findPassesIter/.test(tr) && /performance\.now\(\) - t0 < 8/.test(tr) && /tok !== this\.passTok/.test(tr) && /it\.nm !== nm/.test(tr));
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
