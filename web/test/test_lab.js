// Laboratuvar arayüzü sınaması (Node): (1) labtext.js saf yardımcıları (biçim, itki zamanı, sonuç yargısı), (2) arayüz sözleşmesi:
// JS'nin başvurduğu her kimlik index.html'de var, üst düzey iki alan (Canlı Gökyüzü · Laboratuvar; Ay görevi Laboratuvar'ın altında), ağaç yapısı ve
// tembel yüklenen deney modülleri (iniş, çarpma, yakın geçiş, yeniden giriş) tutarlı, Saptırma Canlı Gökyüzü'nden taşındı.
// Tarayıcı akışı (adımlar, boş durum, 3B, telefon): tools/lab_deneme.mjs
import fs from 'fs';
import * as L from '../js/labtext.js';
import { LAB_PAGES } from '../js/labui.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('index.html'), css = read('css/style.css'), app = read('js/app.js'), dui = read('js/deflectui.js'), lui = read('js/labui.js'), aui = read('js/astui.js'), iui = read('js/impactui.js'), icons = read('js/icons.js');
const kit = read('js/labkit.js'), work = read('js/labwork.js'), tpk = read('js/targetpick.js'), gpApi = fs.readFileSync(new URL('../../api/gp.js', import.meta.url), 'utf8'), srv = read('sunucu.py');
const EXP_MOD = { inis: 'landlab', carpma: 'impactlab', yakin: 'conjlab', giris: 'reentrylab' };

// ---------------------------------------------------------------- 1. saf yardımcılar
console.log('labtext.js');
const et = L.etFromISO('2029-04-13'), start = L.etFromISO('2026-10-11');
check(L.etToISO(et, false) === '2029-04-13' && L.etToISO(et) === '2029-04-13 00:00', 'tarih ↔ TDB gidiş-dönüş');
check(L.dateLong(et) === '13 Nisan 2029', 'uzun tarih: ' + L.dateLong(et));
check(L.kmText(38012.4) === '38.012 km' && L.kmText(2.3e6) === '2,30 milyon km' && L.kmText(0.5) === '0,5 km', 'km biçimi');
check(L.caDist(38012).main === '38.012 km' && /Ay uzaklığının 0,099 katı/.test(L.caDist(38012).sub) && /AB/.test(L.caDist(5e6).sub), 'yakın geçiş mesafesi: ana değer + Ay uzaklığı karşılaştırması');
check(L.sizeText(0.34) === '340 m' && L.sizeText(5.8) === '5,8 km' && L.sizeText(0) === '', 'boyut: metre/kilometre');
const ch = L.leadChoices(et, start), d = L.defaultLead(ch);
check(ch.map((c) => c.ok).join() === 'false,false,true,true,true' && d && d.id === '2y', 'Apophis 2029 (tarama 2026-10-11): 5 ve 10 yıl önce geçersiz, varsayılan 2 yıl');
check(L.defaultLead(L.leadChoices(L.etFromISO('2060-01-01'), start)).id === '5y', 'uzak geçişte varsayılan 5 yıl (10 yıl değil)');
check(L.defaultLead(L.leadChoices(L.etFromISO('2026-11-01'), start)) === null, 'geçişe 3 aydan az varsa çip yok (tarih Gelişmiş\'ten)');
check(L.leadText(730.5) === '2 yıl' && L.leadText(365.25) === '1 yıl' && L.leadText(91.3) === '3 ay' && L.leadText(20) === '20 gün', 'süre metni');
const r = { dXi: 3000, dZeta: 4000, b0: { bE: 12000, rp: 38012, impact: false, vinf: 5.8 }, after: { rp: 40000, impact: false }, dvReqMps: 0.002, M: 2.7e10, FreqN: 3.5 };
let v = L.verdictOf(r, { hypo: true });
check(v.kind === 'bad' && Math.abs(v.ratio - 5000 / 12000) < 1e-12 && /yetmez/.test(v.title) && /%42/.test(v.detail), 'çarpacak olsaydı: kayma < bE → "yetmez", %42 sağlandı');
v = L.verdictOf({ ...r, dXi: 9000, dZeta: 9000 }, { hypo: true });
check(v.kind === 'good' && /kurtulur/.test(v.title) && v.ratio > 1, 'çarpacak olsaydı: kayma ≥ bE → "Dünya kurtulur"');
check(L.verdictOf(r, { hypo: false }).kind === 'info', 'gerçek yörünge, ıskalıyor → bilgi');
check(L.verdictOf({ ...r, b0: { ...r.b0, impact: true } }, { hypo: false }).kind === 'good', 'nominal çarpma, saptırılmış ıskalama → "Çarpma önlendi"');
check(L.verdictOf({ ...r, after: { rp: 3000, impact: true } }, { hypo: false }).kind === 'bad', 'ıskalarken saptırma çarpmaya yol açarsa → kötü');
check(L.verdictOf({ ...r, after: null }, { hypo: false }).kind === 'info', 'saptırılmış geçiş bulunamazsa çökmez');
check(/2\.459 kg/.test(L.needText(r, { method: 'kinetic', beta: 3.6, U: 6.1, m: 580 })) && /3,50 N × 365 gün/.test(L.needText(r, { method: 'thrust', days: 365 })), '"ne kadar gerekir": kinetik kg, sürekli N × gün');
check(L.pushSummary({ method: 'kinetic', m: 580, U: 6.1 }, '2 yıl önce') === 'Kinetik · 580 kg × 6,1 km/s · 2 yıl önce', 'itki özeti');
check(L.QUICK_TARGETS.length >= 4 && L.QUICK_TARGETS.every((q) => q.des && q.name && q.why), 'hızlı hedefler');
check(/DART/.test(L.dartNote()) && /2,99 mm\/s/.test(L.dartNote()), 'DART doğrulama notu');

// ---------------------------------------------------------------- 2. arayüz sözleşmesi
console.log('arayüz sözleşmesi');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]), idSet = new Set(ids);
check(ids.length === idSet.size, `index.html'de yinelenen kimlik yok (${ids.length})`);
const refs = (src) => [...new Set([...src.matchAll(/'#([A-Za-z][A-Za-z0-9_-]*)(?=[' .\[:>,])/g)].map((m) => m[1]))].filter((id) => !/^[0-9a-f]{6}$/i.test(id));          // altı hanelik onaltılık: tuval rengi, kimlik değil
for (const [name, src] of [['deflectui.js', dui], ['labui.js', lui], ['astui.js', aui]]) {
  const miss = refs(src).filter((id) => !idSet.has(id));
  check(miss.length === 0, `${name}: başvurulan tüm kimlikler index.html'de var (${refs(src).length})${miss.length ? ' — eksik: ' + miss.join(', ') : ''}`);
}
const ws = [...html.matchAll(/data-workspace="(\w+)"/g)].map((m) => m[1]);
check(ws.join() === 'sky,lab', 'üst çubukta iki üst düzey alan: ' + ws.join(' · '));
check(/class="mbcrumb" data-for="mission"/.test(html) && /view === 'mission' \? 'lab' : view/.test(app), 'Ay görevi Laboratuvar\'ın alt alanı: üst çubukta Laboratuvar etkin + "› Ay görevi" kırıntısı');
check(/<aside id="labPanel"[^>]*data-for="lab"/.test(html) && /id="skyControls"[^>]*data-for="sky lab"/.test(html), 'Laboratuvar paneli yalnız lab\'da; zaman/kamera çubuğu sky ve lab\'da');
check(/body\[data-mode="lab"\] \[data-for\]:not\(\[data-for~="lab"\]\)/.test(css) && /body\[data-mode="sky"\] \[data-for\]:not\(\[data-for~="sky"\]\)/.test(css) && /body\[data-mode="mission"\] \[data-for\]:not\(\[data-for~="mission"\]\)/.test(css), 'CSS: üç çalışma alanı için data-for gizleme kuralı (boşlukla ayrılmış liste)');
check(/#panel, #skyPanel, #labPanel \{ position: absolute/.test(css) && /#skyPanel\.open, #labPanel\.open/.test(css), 'CSS: lab paneli aynı yerleşim ve telefon düzeniyle');
const skyTabs = [...html.slice(html.indexOf('id="skyPanel"'), html.indexOf('id="labPanel"')).matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
check(skyTabs.join() === 'takip,uydular,asteroit,carpma' && !html.includes('id="tab-saptirma"'), 'Saptırma Canlı Gökyüzü\'nden çıktı; sekmeler: ' + skyTabs.join(', '));
const exps = [...html.matchAll(/data-exp="(\w+)"/g)].map((m) => m[1]), gos = [...html.matchAll(/data-go="(\w+)"/g)].map((m) => m[1]);
check(exps.every((e) => LAB_PAGES[e] && idSet.has('lab-' + e)), 'ağaçtaki her deney için sayfa (#lab-…) ve başlık var: ' + exps.join());
check(gos.join() === 'mission' && /openMission/.test(lui) && !/openImpact/.test(lui), 'ağaçta Ay görevi dalı Ay görevi alanını açar');
check(['inis', 'carpma', 'yakin', 'giris', 'saptirma'].every((e) => exps.includes(e)), 'ağaç: iniş tezgâhı, asteroit → Dünya, uydu ↔ uydu/çöp, yeniden giriş, saptırma');
for (const [e, f] of Object.entries(EXP_MOD)) {
  const src = read(`js/${f}.js`);
  check(lui.includes(`${e}: () => import('./${f}.js')`) && /export default class \w+ \{\s*constructor\(root/.test(src) && /stepsHtml\(/.test(src) && /new Steps\(/.test(src), `${e}: ${f}.js tembel yüklenir (dinamik import), adım akordeonlu varsayılan sınıf`);
}
check(!new RegExp(Object.values(EXP_MOD).join('|')).test(html), 'deney modülleri modulepreload listesinde değil (ilk açılışı şişirmez)');
check(/new Worker\(new URL\('\.\/labwork\.js'/.test(kit) && ['land', 'conj-pair', 'conj-screen', 'reentry'].every((k) => work.includes(`'${k}'`)), 'uzun hesaplar iş parçacığında (labwork.js): iniş, yakın geçiş (çift/tarama), yeniden giriş');
check(/class SatPicker/.test(tpk) && /class AstPicker/.test(tpk) && /MAX_ROWS = 40/.test(tpk) && ['hpMin', 'haMax', 'iMin', 'iMax', 'otype', 'dMin', 'dMax', 'moidMax'].every((k) => tpk.includes(`data-pk="${k}"`)), 'hedef seçici: tüm katalog listelenmez (en çok 40 satır); ad/numara + yükseklik, eğim, yörünge türü, çap, MOID süzgeçleri');
const deb = [...tpk.matchAll(/key: '([\w-]+-debris)'/g)].map((m) => m[1]);
check(deb.length === 4 && deb.every((g) => gpApi.includes(`'${g}'`) && srv.includes(`'${g}'`)), 'çöp bulutu grupları vekilde izinli (api/gp.js ve sunucu.py): ' + deb.join(', '));
const steps = html.slice(html.indexOf('id="dfSteps"'), html.indexOf('</ol>', html.indexOf('id="dfSteps"')));
check((steps.match(/class="step[ "]/g) || []).length === 4 && (steps.match(/class="sh"/g) || []).length === 4 && (steps.match(/class="sn"/g) || []).length === 4 && (steps.match(/class="ss"/g) || []).length === 4, 'Saptırma: 4 adım (başlık, numara, özet, gövde)');
check(/data-step="1"[^>]*>\s*<button class="sh"[^>]*aria-expanded="true"/.test(steps) && (steps.match(/aria-expanded="false"[^>]*disabled/g) || []).length === 3, 'yalnız 1. adım açık, 2–4 başlangıçta kilitli ve erişilebilir (aria-expanded, disabled)');
check(/name="dfMethod"/.test(steps) && /name="dfScn"/.test(steps) && /<details class="adv">/.test(steps), 'yöntem ve senaryo seçimi görünür, ayrıntılar "Gelişmiş" altında katlı');
check(/role="radiogroup"/.test(steps) && /aria-live="polite"/.test(steps), 'erişilebilirlik: radyo grupları ve canlı durum bölgeleri');
check(!/\bnew Worker\b|deflectwork/.test(aui) && /new Worker\(new URL\('\.\/deflectwork\.js'/.test(dui), 'hesap iş parçacığı deflectui.js\'de; astui.js yalnız katalog ve bilgi kartı');
check(/k === 'm'\) \{ setWorkspace\(VIEW === 'sky' \? 'lab' : 'sky'\)/.test(app) && /m === 'lab'/.test(app) && /q\.get\('exp'\)/.test(app), 'app.js: M kısayolu Canlı Gökyüzü ↔ Laboratuvar; ?mode=lab&exp=…');
check(/if \(m !== 'lab'\) m = 'sky'/.test(app) && /\['cam', 'seek', 'warp', 'play', 'cine', 'profile', 'date'\]/.test(app), 'açılış: görev adres parametreleri yoksa Canlı Gökyüzü (ya da son seçilen Laboratuvar)');
check(/openLab, \{ hypo: true \}|openLab\(i, \{ hypo: true \}\)/.test(iui) && !/astui\.scan/.test(iui), 'Çarpma sekmesi sanal çarpıcıyı "çarpacak olsaydı" senaryosuyla Laboratuvar\'a gönderir');
check(/label: 'Laboratuvarda dene'/.test(app), 'asteroit kartı: "Laboratuvarda dene" eylemi');
const iconNames = new Set([...icons.matchAll(/^\s{2}(\w+): '/gm)].map((m) => m[1]));
const used = [...new Set([...html.matchAll(/data-icon="(\w+)"/g)].map((m) => m[1]))];
check(used.every((u) => iconNames.has(u)), `index.html'deki tüm simgeler tanımlı (${used.length}); yeni: lander, meteor, collide, flame`);
check(/prefers-reduced-motion/.test(css) && /@keyframes stepIn/.test(css), 'adım geçişi animasyonu, azaltılmış hareket kuralıyla kapanır');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
