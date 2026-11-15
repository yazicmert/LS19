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
check(v.kind === 'bad' && v.title === 'Sert temas' && /sınır 2,13/.test(v.rows[1][1]) && /sınır 1,22/.test(v.rows[2][1]) && v.rows[0][1] === '1,20 km' && /Elle/.test(v.detail), 'sert temas: aşılan sınırlar işaretli, elle inişe öneri');
check(A.verdict({ ok: false, reentry: true }).kind === 'bad' && /atmosfer/i.test(A.verdict({ ok: false, reentry: true }).detail), 'atmosfere giriş: görev sona erdi');
{
  const TD = await import('../js/touchdown.js'), T = await import('../js/telemetry.js');
  check(A.SAFE_VZ === TD.TOUCH.VZ0 && A.SAFE_VH === TD.TOUCH.VH && T.LIMITS.vz === TD.TOUCH.VZ0 && T.LIMITS.vh === TD.TOUCH.VH && /velEnvelope\(vz, vh\)/.test(mission) && /tipOver\(/.test(mission),
    `güvenli temas zarfı mission.js touchdown(), telemetri ve anlatımda aynı (dikey ≤ ${A.SAFE_VZ.toFixed(2)}, yatay ≤ ${A.SAFE_VH.toFixed(2)} m/s; TN D-6850)`);
  const vt = A.verdict({ ok: false, prop: 50, posErr_m: [2, 0], v_mps: [0.8, 0, -1.4], tilt_deg: 4, rate_dps: 2, tip: { stable: false, margin: 0.6 }, env: { vel: true }, grade: 'fail' });
  check(vt.kind === 'bad' && vt.title === 'Araç devrildi' && vt.rows.some((r) => r[0] === 'Devrilme payı' && r[1] === 'yok: araç devrildi'), 'hız zarf içinde ama devrilme: "Araç devrildi" kartı');
}

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

// ---------------------------------------------------------------- 3. paylaşılabilir bağlantı ve "Denemelerim"
console.log('bağlantı');
{
  const { LINK_KEYS } = await import('../js/labtext.js');
  const { PROFILES, normalizeConfig } = await import('../js/design.js');
  const { validSite } = await import('../js/moonsite.js');
  const opt = { profiles: PROFILES, validSite }, qs = (o) => new URLSearchParams(o);
  check(A.AY_LINK_KEYS.every((k) => !LINK_KEYS.includes(k)) && new Set(A.AY_LINK_KEYS).size === A.AY_LINK_KEYS.length, 'Ay görevi anahtarları saptırmanınkilerle çakışmaz');
  // hazır profil + iniş yeri + roket + rampa + araç + güdüm → bağlantı → aynı durum
  const cfg = normalizeConfig({ ...PROFILES.APOLLO11.cfg, moonSite: 'A15', rocket: 'SATURN_V', site: { id: 87, name: 'Kennedy LC-39A', lat: 28.60823, lon: -80.60428, az: [35, 120] } });
  let o = A.ayLinkFromState({ date: '2026-10-13', cfg, profileKey: 'APOLLO11', vehicle: 'one', landing: 'zem' });
  check(JSON.stringify(o) === JSON.stringify({ date: '2026-10-13', profile: 'APOLLO11', yer: 'A15', roket: 'SATURN_V', rampa: '87', arac: 'one', gudum: 'zem' }), 'bağlantı: tarih, profil, iniş yeri, roket, rampa, araç, güdüm');
  let L = A.ayStateFromLink(qs(o), opt);
  check(L.full && L.date === '2026-10-13' && L.profile === 'APOLLO11' && L.moonSite === 'A15' && L.rocket === 'SATURN_V' && L.pad === 87 && L.vehicle === 'one' && L.landing === 'zem' && !L.custom, 'geri okuma aynı durumu verir');
  // varsayılanlar yazılmaz (açan tarafta da varsayılandır); araç ve güdüm her zaman yazılır
  o = A.ayLinkFromState({ date: '2026-10-13', cfg: normalizeConfig(PROFILES.APOLLO.cfg), profileKey: 'APOLLO', vehicle: 'two', landing: 'opt' });
  check(JSON.stringify(o) === JSON.stringify({ date: '2026-10-13', profile: 'APOLLO', arac: 'two', gudum: 'opt' }), 'varsayılan iniş yeri, genel roket ve varsayılan rampa yazılmaz');
  // özel yörünge: alanlarıyla; halo alanları yalnız halo beklemede, apoje yalnız yükseltme varsa
  const cc = normalizeConfig({ earth: { h: 200, inc: 30, revs: 2.5, raise: { n: 2, ha: 40000 } }, moon: { type: 'HALO', llo: { h: 90, revs: 3 }, halo: { preset: 'L1N10', revs: 2 } }, moonSite: 'A14' });
  o = A.ayLinkFromState({ date: '2027-01-05', cfg: cc, profileKey: 'CUSTOM', vehicle: 'two', landing: 'free' });
  L = A.ayStateFromLink(qs(o), opt);
  check(!o.profile && o.park === '200' && o.ykn === '2' && o.yap === '40000' && o.halo === 'L1N10' && JSON.stringify(normalizeConfig({ ...L.custom, moonSite: L.moonSite })) === JSON.stringify(cc), 'özel yörünge alanlarıyla yazılır ve aynı yapılandırmaya döner');
  const cl = normalizeConfig({ ...PROFILES.APOLLO.cfg, earth: { ...PROFILES.APOLLO.cfg.earth, inc: 31 } });
  o = A.ayLinkFromState({ date: '2027-01-05', cfg: cl, profileKey: 'CUSTOM', vehicle: 'two', landing: 'opt' });
  check(!('halo' in o) && !('htur' in o) && !('yap' in o) && o.bekle === 'LLO', 'LLO beklemede halo alanları, yükseltme yokken apoje yazılmaz');
  // bozuk ya da tanınmayan değerler atılır; eski ?profile= bağlantısı yalnız profil (full değil)
  L = A.ayStateFromLink(qs({ date: '2026-13-45', profile: 'YOK', yer: 'A13', roket: 'X', rampa: '-3', arac: 'üç', gudum: 'opt', park: 'abc', bekle: 'GEO' }), opt);
  check(L.full && !L.date && !L.profile && !L.moonSite && !L.rocket && !L.pad && !L.vehicle && L.landing === 'opt' && !L.custom, 'bozuk değerler atılır');
  L = A.ayStateFromLink(qs({ profile: 'nrho', date: '2026-10-13' }), opt);
  check(!L.full && L.profile === 'NRHO' && L.date === '2026-10-13', 'eski ?profile=&date= bağlantısı çalışır (küçük harf de)');
  check(A.ayStateFromLink(qs({ mode: 'lab', exp: 'ay', tab: 'dv' }), opt) === null && A.ayStateFromLink(qs({ hedef: '99942' }), opt) === null, 'Ay görevi anahtarı yoksa bağlantı durumu yok');
  // geçmiş satırı ve CSV
  const hv = A.verdict(res, {}), hr = A.ayHistoryRow(res, hv, { date: '2026-10-13', setup: 'Apollo · İki kademe · Optimal', site: 'Apollo 15 · Hadley–Apennine', dvUsed: 6680.24, link: 'date=2026-10-13&arac=two' });
  check(hr.kind === 'good' && hr.prop === 412 && hr.miss === 5 && hr.vz === 1.2 && hr.vh === 0.5 && hr.dv === 6680.2, 'geçmiş satırı: sonuç, yakıt, uzaklık, hızlar, Δv');
  const rr = A.ayHistoryRow({ ok: false, reentry: true }, A.verdict({ ok: false, reentry: true }), { date: '2026-10-13', link: '' });
  check(rr.kind === 'bad' && rr.prop == null && rr.miss == null, 'atmosfere giriş: temas ölçüleri boş');
  const csv = A.ayHistoryCsv([{ ...hr, link: 'https://x/?a=1,2' }]).split('\n');
  check(csv[0].split(',').length === 11 && csv[1].includes('"https://x/?a=1,2"') && /^[\x00-\x7f]+$/.test(csv[0]), 'CSV: 11 sütun, ASCII başlık, virgüllü alan tırnaklı');
  check(/ayStateFromLink\(q, \{ profiles: PROFILES, validSite \}\)[\s\S]*await applyAyLink\(L\);\s*startDesign\(/.test(app) && /writeAyUrl\(u\);/.test(app) && /if \(d\.type === 'ready'\) syncAyUrl\(\)/.test(app), 'app.js: açılışta bağlantı tasarımdan önce uygulanır; adres görev hazır olunca yazılır, deneyden çıkınca silinir');
  check(/id="ayLink"/.test(ay) && /id="ayHist"[\s\S]*id="ayHistTbl"[\s\S]*id="ayHistCsv"[\s\S]*id="ayHistClear"/.test(ay), 'Sonuç adımı: Bağlantıyı kopyala ve Denemelerim');
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
