// Roket bilgi kartları (Node): cd web && node test/test_rocketinfo.js
// Her gerçek roketin kartı var; her bilginin kaynak numarası geçerli; kaynaklar https; görev tarihleri geçerli ve sıralı; 3B model mevcut;
// kart rakamları simülasyonun verisiyle (rockets.js) çelişmez; görüntüleyici tembel yüklenir (ilk açılışı şişirmez).
import fs from 'fs';
import { ROCKET_INFO } from '../js/rocketinfo.js';
import { ROCKETS, ROCKET_IDS } from '../js/rockets.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const real = ROCKET_IDS.filter((id) => !ROCKETS[id].sized);
check(real.every((id) => ROCKET_INFO[id]) && !ROCKET_INFO.GENEL, `bilgi kartı: ${real.join(', ')} (genel kademenin kartı yok)`);
const rm = read('js/rocketmodels.js');
for (const id of real) {
  const I = ROCKET_INFO[id], n = I.sources.length, refs = [];
  const add = (src, where) => refs.push([src, where]);
  I.specs.forEach(([k, , s]) => add(s, 'özellik ' + k)); I.stages.forEach((s) => add(s.src, 'kademe ' + s.name)); I.history.forEach(([, s], i) => add(s, 'tarihçe ' + (i + 1)));
  I.missions.forEach((m) => add(m.src, 'görev ' + m.name)); add(I.model.src, 'model');
  const bad = refs.filter(([s]) => !Array.isArray(s) || !s.length || s.some((k) => !Number.isInteger(k) || k < 1 || k > n));
  check(!bad.length, `${id}: ${refs.length} bilginin hepsinde geçerli kaynak numarası (1–${n})${bad.length ? ' — eksik: ' + bad.map((b) => b[1]).join(', ') : ''}`);
  const used = new Set(refs.flatMap(([s]) => s));
  check(I.sources.every((x, i) => /^https:\/\/[^\s]+$/.test(x.u) && x.t && used.has(i + 1)), `${id}: ${n} kaynak, hepsi https ve en az bir bilgiye bağlı`);
  const ds = I.missions.map((m) => m.date).filter((d) => d !== 'planlanıyor');
  check(ds.every((d) => /^\d{4}-\d\d-\d\d$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')) && d <= '2026-11-03') && ds.every((d, i) => !i || ds[i - 1] <= d) && I.missions.every((m) => m.date !== 'planlanıyor' || /Planlanıyor/.test(m.result)),
    `${id}: ${I.missions.length} görev; tarihler geçerli, sıralı, 3 Kasım 2026'dan sonra değil (gelecek olanlar "planlanıyor")`);
  check(I.stages.every((s) => s.engines && s.prop) && I.specs.length >= 6 && I.history.length >= 2, `${id}: kademeler (motor + yakıt), ≥ 6 teknik özellik, tarihçe`);
  const M = I.model;
  check(M.kind === 'glb' ? fs.existsSync(new URL('../' + M.file, import.meta.url)) && fs.statSync(new URL('../' + M.file, import.meta.url)).size < 1.5e6
    : new RegExp(`key === '${M.key}'`).test(rm.slice(rm.indexOf('export function makeLaunchVehicle'))), `${id}: 3B model ${M.kind === 'glb' ? M.file + ' (resmî NASA, < 1,5 MB)' : 'ölçüden çizim "' + M.key + '"'}`);
}
// kart ↔ simülasyon tutarlılığı
const sv = ROCKET_INFO.SATURN_V.specs.find(([k]) => /TLI/.test(k))[1];
check(/46,8 t/.test(sv) && Math.abs(ROCKETS.SATURN_V.ref.P - 46768) < 1, 'Saturn V: kartın TLI yükü (46,8 t, NASA PDS) simülasyonun başarım verisiyle aynı');
check(/27 t/.test(ROCKET_INFO.SLS1.specs.find(([k]) => /TLI/.test(k))[1]) && ROCKETS.SLS1.ref.P === 27000, 'SLS: > 27 t TLI kartta ve simülasyonda');
check(/6,2 t/.test(ROCKET_INFO.VULCAN.specs.find(([k]) => /TLI/.test(k))[1]) && ROCKETS.VULCAN.ref.P === 6200, 'Vulcan VC2: 6,2 t TLI kartta ve simülasyonda');
check(/5,5 t/.test(ROCKET_INFO.F9.specs.find(([k]) => /GTO/.test(k))[1]) && ROCKETS.F9.ref.P === 5500, 'Falcon 9: GTO 5,5 t (kurtarmalı) kartta ve simülasyonda');
check(/RL10B-2/.test(ROCKET_INFO.SLS1.stages.at(-1).engines) && ROCKETS.SLS1.stage.engine === 'RL10B-2' && /RL10C/.test(ROCKET_INFO.VULCAN.stages.at(-1).engines) && ROCKETS.VULCAN.stage.engines === 2, 'üst kademe motorları kartta ve simülasyonda aynı');

console.log('arayüz');
const html = read('index.html'), ui = read('js/ui.js'), app = read('js/app.js'), sheet = read('js/rocketsheet.js');
check(/id="rocketSheet"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html) && /class="rs-close"/.test(html) && /<canvas aria-label=/.test(html), 'bilgi kartı: erişilebilir iletişim kutusu (rol, modal, kapat düğmesi, tuval etiketi)');
check(/dataset\.rocketInfo/.test(ui) && /onRocketInfo/.test(ui) && /rocketSheet\.open\(id\)/.test(app), 'her roket kartında ⓘ düğmesi bilgi kartını açar');
check(/await import\('\.\/rocketviewer\.js'\)/.test(sheet) && !/rocketviewer/.test(html) && /viewer\.dispose\(\)/.test(sheet), '3B görüntüleyici tembel yüklenir (ön yükleme listesinde yok) ve kapanınca serbest bırakılır');
check(/Escape/.test(sheet) && /this\.back\.focus\(\)/.test(sheet) && /Bu roketle uçur/.test(sheet), 'Esc ile kapanır, odak geri döner; "Bu roketle uçur" görevi o roketle kurar');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
