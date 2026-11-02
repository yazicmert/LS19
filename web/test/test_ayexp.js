// Laboratuvar › Ay görevi deneyi sınaması (Node): (1) aytext.js saf yardımcıları (adım özetleri, sonuç yargısı), (2) arayüz sözleşmesi:
// dört adım ve Uçuş aletleri index.html'de, eski sekme kimlikleri korunur (?tab=gorev|kontrol|dv|grafik|yorunge|efemeris, K kısayolu),
// araç/güdüm seçimi panelde ve görev çubuğunda aynı data-vehicle / data-landing düğmeleriyle, ayui.js fizik worker'ına komut göndermez.
// Tarayıcı akışı (adımlar, iniş sonucu): tools/lab_deneme.mjs
import fs from 'fs';
import * as A from '../js/aytext.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('index.html'), app = read('js/app.js'), ayui = read('js/ayui.js'), uij = read('js/ui.js'), mission = read('js/mission.js');

// ---------------------------------------------------------------- 1. saf yardımcılar
console.log('aytext.js');
check(A.AY_STEPS.map((s) => s.id).join() === 'gorev,arac,ucus,dv' && A.AY_STEPS.map((s) => s.n).join() === '1,2,3,4', 'dört adım: Görev → Araç ve güdüm → Uçuş → Sonuç (Sonuç kimliği eski "dv")');
check(A.dateShort('2026-10-13') === '13 Eki 2026' && A.dateShort('1969-07-16T13:32') === '16 Tem 1969' && A.dateShort('') === '', 'kısa tarih');
check(A.profileShort('Artemis: NRHO 9:2 bekleme (1 tur) + LLO') === 'Artemis' && A.profileShort('Apollo, hızlı (LLO 110 km, 2 tur)') === 'Apollo' && A.profileShort('L2 halo bekleme + LLO') === 'L2 halo bekleme + LLO' && A.profileShort('') === 'Özel', 'kısa profil adı');
check(A.sumGorev({ profileName: 'Apollo 11 gibi (LLO 110 km, 13 tur)', dateISO: '1969-07-16' }) === 'Apollo 11 gibi · 16 Tem 1969' && A.sumGorev({ designing: true }) === 'Tasarlanıyor…', '1. adım özeti');
check(A.sumArac({ vehicle: 'two', landing: 'opt' }) === 'İki kademe · Optimal' && A.sumArac({ vehicle: 'one', landing: 'free', optimalOk: false }) === 'Tek kademe · ZEM/ZEV', '2. adım özeti (çözücü yoksa ZEM/ZEV)');
check(A.sumUcus({ ready: false }) === 'Görev kuruluyor' && A.sumUcus({ ready: true, met: -50 }) === 'Hazır: Başlat' && A.sumUcus({ ready: true, running: true, met: 90061 }) === 'T+1g 01:01' && A.sumUcus({ ready: true, running: false, met: 3725 }) === 'Duraklatıldı · T+01:02:05' && A.sumUcus({ ready: true, done: true }) === 'Uçuş bitti' && A.sumUcus({ ready: true, running: false, met: 600, started: false }) === 'Hazır: Başlat', '3. adım özeti');
const res = { ok: true, prop: 412.4, posErr_m: [3, 4], v_mps: [0.3, 0.4, -1.2], manual: false };
check(A.sumSonuc({ done: false }) === 'İnişte belli olur' && /^İniş ✓ · 412 kg yakıt$/.test(A.sumSonuc({ done: true, result: res })) && A.sumSonuc({ done: true, result: { ok: false, prop: 0, posErr_m: [0, 0], v_mps: [0, 0, -9] } }) === 'Sert temas' && A.sumSonuc({ done: true, result: { ok: false, reentry: true } }) === 'Atmosfere girdi', '4. adım özeti');
let v = A.verdict(null);
check(v.kind === 'info' && v.rows.length === 0 && /temasla/.test(v.detail), 'sonuç yokken: bilgi kartı (görev sürüyor)');
v = A.verdict(res, { dvUsed: 6680.2, dvNominal: 6677.0, profileName: 'Artemis: NRHO 9:2 bekleme (1 tur) + LLO', vehicle: 'two', landing: 'opt' });
const row = (k) => (v.rows.find((r) => r[0] === k) || [])[1];
check(v.kind === 'good' && v.title === 'İniş başarılı' && row('İniş yerine uzaklık') === '5,0 m' && row('Dikey hız') === '1,20 m/s' && row('Yatay hız') === '0,50 m/s' && row('Kalan yakıt') === '412 kg', 'başarılı iniş: uzaklık, hızlar (sınır içinde: not yok), kalan yakıt');
check(row('Kullanılan Δv') === '6.680,2 m/s' && row('Nominale göre') === '+3,2 m/s' && /Artemis, İki kademe, Optimal/.test(v.detail), 'Δv ve nominale fark; yargı metni kurulumu söyler');
check(A.verdict(res, { dvUsed: 100, dvNominal: 100 }).rows.find((r) => r[0] === 'Nominale göre')[1] === 'aynı' && !A.verdict(res, {}).rows.some((r) => r[0] === 'Nominale göre'), 'nominal yoksa fark satırı yok; eşitse "aynı"');
v = A.verdict({ ok: false, prop: 0, posErr_m: [1200, 0], v_mps: [2, 0, -8], manual: true });
check(v.kind === 'bad' && v.title === 'Sert temas' && /sınır 3,0/.test(v.rows[1][1]) && /sınır 1,22/.test(v.rows[2][1]) && v.rows[0][1] === '1,20 km' && /Elle/.test(v.detail), 'sert temas: aşılan sınırlar işaretli, elle inişe öneri');
check(A.verdict({ ok: false, reentry: true }).kind === 'bad' && /atmosfer/i.test(A.verdict({ ok: false, reentry: true }).detail), 'atmosfere giriş: görev sona erdi');
check(new RegExp(`Math\\.abs\\(vz\\) < ${A.SAFE_VZ.toFixed(1)} && vh < ${A.SAFE_VH}`).test(mission), `güvenli temas sınırları mission.js touchdown() ile aynı (dikey < ${A.SAFE_VZ}, yatay < ${A.SAFE_VH} m/s)`);

// ---------------------------------------------------------------- 2. arayüz sözleşmesi
console.log('arayüz sözleşmesi');
const ay = html.slice(html.indexOf('id="lab-ay"'), html.indexOf('id="lab-saptirma"'));
const navs = [...ay.matchAll(/<nav class="tabs([^"]*)"[^>]*>([\s\S]*?)<\/nav>/g)];
check(navs.length === 2 && /ays/.test(navs[0][1]) && /subtabs/.test(navs[1][1]), 'iki sekme çubuğu: adımlar ve Uçuş aletleri');
const stepTabs = [...navs[0][2].matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]), toolTabs = [...navs[1][2].matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
check(stepTabs.join() === A.AY_STEPS.map((s) => s.id).join() && A.AY_STEPS.every((s) => ay.includes(`id="aySum-${s.id}"`) && ay.includes(`id="tab-${s.id}"`)), 'adım düğmeleri, özet alanları ve sayfaları kayıtla aynı');
check(toolTabs.join() === A.AY_TOOLS.join() && A.AY_TOOLS.every((t) => new RegExp(`<div id="tab-ucus"[\\s\\S]*id="tab-${t}"[\\s\\S]*<div id="tab-dv"`).test(ay)), 'Uçuş aletleri (Çizelge, Kontrol, Grafik, Yörünge, Efemeris) Uçuş adımının içinde');
check(['gorev', 'kontrol', 'dv', 'grafik', 'yorunge', 'efemeris'].every((t) => ay.includes(`id="tab-${t}"`)), 'eski sekme kimlikleri korunur (adres ?tab=…, K kısayolu, kare başına güncellenen sekmeler)');
check(['plan', 'log', 'cfgProfile', 'dateInput', 'btnDesign', 'designInfo', 'dvtable', 'cmptable', 'btnCompare', 'chartAlt', 'orbtable', 'ephtable', 'forcetable'].every((id) => ay.includes(`id="${id}"`)), 'ui.js\'in kullandığı görev öğeleri yerinde');
check(/<div id="tab-gorev"[\s\S]*id="cfgProfile"[\s\S]*<details id="cfgBox" class="cfg">[\s\S]*id="dateInput"/.test(ay) && !/<details id="cfgBox"[^>]*open/.test(ay), '1. adım: profil ve tarih önde, yörünge ayrıntıları "gelişmiş" altında katlı');
const vehBtns = (src) => [...src.matchAll(/data-vehicle="(\w+)"/g)].map((m) => m[1]).sort().join(), landBtns = (src) => [...src.matchAll(/data-landing="(\w+)"/g)].map((m) => m[1]).sort().join();
const dock = html.slice(html.indexOf('id="controls"'), html.indexOf('</footer>', html.indexOf('id="controls"')));
check(vehBtns(ay) === 'one,two' && landBtns(ay) === 'free,opt,zem' && vehBtns(dock) === vehBtns(ay) && landBtns(dock) === landBtns(ay), '2. adım: araç ve güdüm düğmeleri panelde, görev çubuğundakilerle aynı değerler');
check(/document\.querySelectorAll\('\[data-vehicle\]'\)\.forEach\(\(b\) => b\.addEventListener/.test(app) && /document\.querySelectorAll\('\[data-landing\]'\)\.forEach\(\(b\) => b\.addEventListener/.test(app) && /querySelectorAll\('\[data-landing\]'\)\.forEach\(\(b\) => \{\s*const needs/.test(app), 'app.js tüm data-vehicle/data-landing düğmelerini dinler ve eşler (panel ↔ menü tutarlı)');
check(/id="ayVerdict" class="verdict info"[^>]*aria-live="polite"/.test(ay) && /data-goto="gorev"/.test(ay) && /data-goto="arac"/.test(ay) && /data-goto="ucus"/.test(ay) && /id="ayRestart"/.test(ay), '4. adım: sonuç kartı (canlı bölge), "başka profil", "güdümü değiştir", "baştan uçur"');
check(!/\bsend\(|postMessage|new Worker/.test(ayui.replace(/\/\/.*$/gm, '')) && /restart\(\)/.test(ayui) && /restart: \(\) => send\(\{ cmd: 'restart' \}\)/.test(app), 'ayui.js fizik worker\'ına doğrudan komut göndermez (baştan uçur: app.js\'in mevcut restart komutu)');
check(/_leaf\(/.test(uij) && /p\.parentElement\.closest\('\.tabpage'\)/.test(uij) && /this\.onTab/.test(uij), 'ui.js: iç içe sekme (alt sekme açılınca adımı da açılır); görünen yaprak sekme ui.tab');
check(/if \(now - lastAy > 500\) ayRefresh\(\)/.test(app), 'adım özetleri kare başına değil, saniyede 2 kez güncellenir');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
