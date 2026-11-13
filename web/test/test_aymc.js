// Ay görevi Monte Carlo (Laboratuvar › Ay görevi › Sonuç): istatistik yardımcıları (mcstats.js) ve dağılımlı koşu (nominalrun.js › flyDispersed).
//   1) yüzdelik, Wilson güven aralığı, özet ve düz dil
//   2) flyDispersed: aynı tohum bit düzeyinde aynı uçuş; farklı tohumlar farklı TLI hatası → farklı rota düzeltmesi; temas makul
//   3) arayüz sözleşmesi: Monte Carlo işi worker'da (mcwork.js), aymc.js görev worker'ına komut göndermez
import fs from 'fs';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { twoStageDesign } from '../js/mission.js';
import { initConic } from '../js/conic.js';
import { flyDispersed, NAV_FAULTS } from '../js/nominalrun.js';
import { quantile, wilson, summarize, mcText } from '../js/mcstats.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url));

// ---------------------------------------------------------------- 1) istatistik
check(quantile([3, 1, 2], 0.5) === 2 && quantile([0, 10], 0.25) === 2.5 && quantile([], 0.5) === null && quantile([NaN, 4], 0.9) === 4, 'yüzdelik (doğrusal ara değer, sayı olmayanlar atılır)');
{
  const [lo, hi] = wilson(20, 20), [a, b] = wilson(0, 0), [c, d] = wilson(45, 50);
  check(Math.abs(lo - 0.8389) < 1e-3 && hi === 1 && a === 0 && b === 1 && c < 0.9 && d > 0.9 && d < 1, `Wilson: 20/20 → alt sınır %${(100 * lo).toFixed(1)} (küçük örneklemde %100 denmez)`);
}
{
  const runs = [{ seed: 1, ok: true, grade: 'ok', prop: 300, mcc: 2, miss: 1, vz: -1.4, vh: 0.1, dvTotal: 5000, why: [] }, { seed: 2, ok: true, grade: 'ok', prop: 290, mcc: 5, miss: 3, vz: -1.5, vh: 0.2, dvTotal: 5010, why: [] },
    { seed: 3, ok: false, grade: 'fail', prop: 280, mcc: 9, miss: 500, vz: -1.6, vh: 1.7, dvTotal: 5020, why: ['hız zarfı aşıldı'] }, { seed: 4, ok: false, reentry: true, grade: 'reentry', prop: null, mcc: 1, miss: null, vz: null, vh: null, dvTotal: 3200, why: [] }];
  const s = summarize(runs), t = mcText(s, { tliSigma: 1, nav: true, faultLabel: 'TRN yok' });
  check(s.n === 4 && s.ok === 2 && s.rate === 0.5 && s.grades.fail === 1 && s.grades.reentry === 1 && s.propMin === 280 && s.prop[1] === 290 && s.fails.length === 2 && s.fails[1].why[0] === 'atmosfere girdi', 'özet: oran, sınıflar, yakıt, başarısızlık nedenleri');
  check(t.kind === 'bad' && /^2\/4 iniş başarılı \(%50; %95 güven aralığı %\d+–\d+\)$/.test(t.title) && t.rows.some(([k, v]) => k === 'Kalan yakıt' && /en az 280 kg/.test(v)) && t.rows.some(([k, v]) => k === 'Hata modeli' && /TRN yok/.test(v)), 'düz dil: başlık, satırlar, hata modeli');
  const good = mcText(summarize(Array.from({ length: 50 }, (_, k) => ({ ...runs[0], seed: k }))));
  check(good.kind === 'good' && /^50\/50/.test(good.title), '50/50 başarı: yeşil (güven aralığının alt sınırı ≥ %90)');
}

// ---------------------------------------------------------------- 2) dağılımlı koşu
{
  const ab = (f) => { const b = rd(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const defs = JSON.parse(rd('data/designs_default.json')), SPK = ab('data/de440s.bsp'), PCK = ab('data/moon_pa_de440_200625.bpc'), eo = JSON.parse(rd('data/earth_orient.json'));
  EO.loadEarthOrientation(eo); await initConic();
  const design = twoStageDesign(defs.profiles.APOLLO.design);
  const fly = (seed, o = {}) => { makeLive(SPK, PCK, eo, defs.tStart); return flyDispersed(design, 'opt', { seed, tliSigma: 1, nav: true, ...o }); };
  const t0 = performance.now(), a = fly(1), b = fly(2), a2 = fly(1);
  console.log(`  3 uçuş ${((performance.now() - t0) / 1000).toFixed(1)} s · tohum 1: MCC ${a.mcc.toFixed(2)} m/s, yakıt ${a.prop.toFixed(1)} kg, ıska ${a.miss.toFixed(1)} m · tohum 2: MCC ${b.mcc.toFixed(2)} m/s`);
  check(JSON.stringify(a) === JSON.stringify(a2), 'aynı tohum → bit düzeyinde aynı uçuş (yeniden üretilebilir)');
  check(a.mcc !== b.mcc && a.tli !== b.tli, 'farklı tohum → farklı TLI kesme hatası ve rota düzeltmesi');
  check(a.ok && b.ok && a.landed && a.miss < 50 && a.vz < 0 && a.vz > -3.05 && a.prop > 200 && a.prop < 400 && a.dvTotal > 4000, 'nominal hata modeliyle iniş başarılı, iniş yerine yakın, yakıt makul');
  const z = fly(1, { tliSigma: 0, nav: false });
  check(z.ok && z.mcc < a.mcc && z.miss < 1, 'hatasız koşu (TLI σ = 0, kusursuz seyrüsefer) nominal uçuşa eşit: en az düzeltme, iniş yerinde');
  check(Object.keys(NAV_FAULTS).join() === 'none,alt,trn,vel' && NAV_FAULTS.trn.trn === false, 'arıza senaryoları landnav.js seçenekleriyle');
}

// ---------------------------------------------------------------- 3) arayüz sözleşmesi
{
  const html = rd('index.html').toString(), aymc = rd('js/aymc.js').toString(), app = rd('js/app.js').toString(), work = rd('js/mcwork.js').toString();
  const ids = [...aymc.matchAll(/\$\('#(\w+)'\)/g)].map((m) => m[1]), missing = ids.filter((id) => !html.includes(`id="${id}"`));
  check(ids.length >= 6 && missing.length === 0, `aymc.js'nin başvurduğu kimlikler index.html'de (${ids.length})` + (missing.length ? ': eksik ' + missing.join(',') : ''));
  check(/new Worker\(new URL\('\.\/mcwork\.js'/.test(aymc) && !/send\(\{ cmd/.test(aymc) && /flyDispersed/.test(work), 'Monte Carlo ayrı iş parçacıklarında; aymc.js görev worker\'ına komut göndermez');
  check(/new AyMC\(/.test(app) && /tStart: lastTStart/.test(app), 'app.js görevi (tarih, tasarım, güdüm) Monte Carlo\'ya verir');
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
