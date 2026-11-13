// Laboratuvar arayüzü sınaması (Node): (1) labtext.js saf yardımcıları (biçim, itki zamanı, sonuç yargısı), (2) arayüz sözleşmesi:
// JS'nin başvurduğu her kimlik index.html'de var, iki çalışma alanı (Canlı Gökyüzü · Laboratuvar), deney kaydı ↔ ağaç ↔ sayfa tutarlı,
// Ay görevi Laboratuvar'ın içinde (görev motoru), Saptırma Canlı Gökyüzü'nden taşındı (gökyüzü motoru); görünüm → motor eşlemesi ve eski adresler (saf işlevler).
// Tarayıcı akışı (adımlar, boş durum, 3B, telefon): tools/lab_deneme.mjs
import fs from 'fs';
import * as L from '../js/labtext.js';
import { LAB_PAGES, EXPERIMENTS, LAB_HOME, engineFor, resolveView } from '../js/labui.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('index.html'), css = read('css/style.css'), cine = read('css/cinema.css'), app = read('js/app.js') + '\n' + read('js/canvasinput.js') + '\n' + read('js/windowscan.js') + '\n' + read('js/profilecompare.js'), uij = read('js/ui.js'), dui = read('js/deflectui.js'), lui = read('js/labui.js'), aui = read('js/astui.js'), iui = read('js/impactui.js'), icons = read('js/icons.js');

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
check(ws.join() === 'sky,lab', 'üst çubukta iki çalışma alanı: ' + ws.join(' · '));
check(/<body data-mode="lab" data-engine="mission" data-exp="ay">/.test(html) && /data-workspace="lab" class="on" aria-selected="true"/.test(html), 'varsayılan açılış Laboratuvar › Ay görevi (görev motoru); HTML ilk durumu JS ile aynı');
check(/<aside id="labPanel"[^>]*data-for="lab"/.test(html) && /id="skyControls"[^>]*data-for="sky lab@sky"/.test(html), 'Laboratuvar paneli her deneyde; zaman/kamera çubuğu Canlı Gökyüzü\'nde ve Laboratuvar gökyüzü motorundayken');
check(['hud', 'manual', 'controls'].every((id) => new RegExp(`id="${id}"[^>]*data-for="lab@mission"`).test(html)), 'uçuş göstergesi, elle kumanda ve görev çubuğu Laboratuvar\'da görev motoru çalışırken');
check(!/data-for="mission"|data-for="[^"]*\bmission\b(?!")/.test(html.replace(/lab@mission/g, '')) && !html.includes('id="panel"'), 'eski "mission" alanı ve ayrı görev paneli (#panel) kaldırıldı');
const lab = html.slice(html.indexOf('id="labPanel"'), html.indexOf('id="skyControls"'));
check(['gorev', 'kontrol', 'dv', 'grafik', 'yorunge', 'efemeris'].every((t) => lab.includes(`id="tab-${t}"`) && lab.includes(`data-tab="${t}"`)) && /id="lab-ay" class="labpage labtabs"/.test(lab), 'Ay görevi sekmeleri (6) Laboratuvar panelinde, #lab-ay sayfasında');
const ruleOk = (eng) => new RegExp(`body\\[data-mode="lab"\\]\\[data-engine="${eng}"\\] \\[data-for\\]:not\\(\\[data-for~="lab"\\]\\):not\\(\\[data-for~="lab@${eng}"\\]\\)`).test(css);
check(/body\[data-mode="sky"\] \[data-for\]:not\(\[data-for~="sky"\]\)/.test(css) && ruleOk('mission') && ruleOk('sky'), 'CSS: data-for gizleme kuralı görünüm + motor (lab@mission, lab@sky)');
check(!/#panel\b/.test(css) && !/#panel\b/.test(cine) && /#skyPanel, #labPanel \{ position: absolute/.test(css) && /#skyPanel\.open, #labPanel\.open/.test(css), 'CSS: #panel kuralları Laboratuvar paneline taşındı; aynı yerleşim ve telefon düzeni');
check(/\.labpage\.labtabs \{[^}]*overflow: hidden[^}]*flex-direction: column/.test(css), 'sekmeli deney sayfası: sekme çubuğu sabit, sayfalar kendi içinde kayar');
const skyview = fs.readFileSync(new URL('../js/skyview.js', import.meta.url), 'utf8');
check(/for \(const k of \[[^\]]*'stagetag'[^\]]*\]\) if \(this\.labels\[k\]\) this\.labels\[k\]\.style\.display = 'none'/.test(skyview), 'Canlı Gökyüzü\'ne geçince görev etiketleri gizlenir (Laboratuvar\'ın kademe etiketi dahil)');
const skyTabs = [...html.slice(html.indexOf('id="skyPanel"'), html.indexOf('id="labPanel"')).matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
check(skyTabs.join() === 'takip,uydular,asteroit,carpma,firlatma' && !html.includes('id="tab-saptirma"'), 'Saptırma Canlı Gökyüzü\'nden çıktı; sekmeler (fırlatma takvimi dahil): ' + skyTabs.join(', '));
const exps = [...html.matchAll(/class="exp"[^>]*data-exp="(\w+)"/g)].map((m) => m[1]), gos = [...html.matchAll(/data-go="(\w+)"/g)].map((m) => m[1]);
check(exps.every((e) => LAB_PAGES[e] && idSet.has('lab-' + e)), 'ağaçtaki her deney için sayfa (#lab-…) ve başlık var: ' + exps.join());
check(Object.keys(EXPERIMENTS).every((e) => exps.includes(e) && idSet.has('lab-' + e)) && exps.join() === 'ay,saptirma', 'deney kaydındaki her deney ağaçta ve sayfası var (Ay görevi, Asteroit saptırma)');
check(Object.values(EXPERIMENTS).every((x) => x.title && (x.engine === 'mission' || x.engine === 'sky') && typeof x.phoneOpen === 'boolean') && EXPERIMENTS.ay.engine === 'mission' && EXPERIMENTS.saptirma.engine === 'sky', 'deney kaydı: başlık, motor, telefon davranışı (Ay görevi → görev motoru, saptırma → gökyüzü)');
check(gos.join() === 'impact' && /openImpact/.test(lui) && !/openMission|data-go="mission"/.test(lui + html), 'tek kısayol dalı: Çarpma riski (Ay görevi artık kısayol değil, deney)');
check(engineFor('sky', null, 'mission') === 'sky' && engineFor('lab', 'ay', 'sky') === 'mission' && engineFor('lab', 'saptirma', 'mission') === 'sky' && engineFor('lab', LAB_HOME, 'mission') === 'mission' && engineFor('lab', LAB_HOME, 'sky') === 'sky' && engineFor('lab', 'yok', 'sky') === 'sky', 'görünüm → motor: deney motoru seçer, ana sayfa motoru değiştirmez');
// paylaşılabilir bağlantı ve deneme geçmişi
{
  const st = { des: '99942', start: '2026-11-13', years: 50, caDay: '2029-04-13', method: 'kinetic', m: 560, U: 6.1, beta: 3.6, F: 0.1, days: 300, applyDay: '2027-04-13', dir: 'best', hypo: true, D: 0.34, rho: 2600 };
  const o = L.linkFromState(st), back = L.stateFromLink(new URLSearchParams(new URLSearchParams(o).toString()));
  check(['des', 'start', 'years', 'caDay', 'method', 'm', 'U', 'beta', 'applyDay', 'dir', 'hypo', 'D', 'rho'].every((k) => back[k] === st[k]) && back.F == null && back.days == null, 'bağlantı gidiş-dönüş (kinetik: F ve süre yazılmaz)');
  const th = L.stateFromLink(new URLSearchParams(L.linkFromState({ ...st, method: 'thrust', hypo: false, D: 0 })));
  check(th.method === 'thrust' && th.F === 0.1 && th.days === 300 && th.m == null && th.hypo === false && th.D == null, 'sürekli itki bağlantısı; kütle düzenlenmemişse D/rho yok');
  const bad = L.stateFromLink({ hedef: ' 2024 YR4 ', yil: '999', yon: 'constructor', m: '-3', gecis: '2029-4-13', senaryo: 'x', yontem: 'zzz' });
  check(bad.des === '2024 YR4' && bad.years === 120 && bad.dir === null && bad.m === null && bad.caDay === null && bad.hypo === null && bad.method === 'kinetic', 'bozuk bağlantı alanları atılır ya da sınırlanır');
  check(L.stateFromLink({}) === null && L.LINK_KEYS.every((k) => /^[a-zA-Z]+$/.test(k)), 'hedefsiz bağlantı yok sayılır');
  const rr = { ...r, ca: { et, dist: 38011.5 }, leadDays: 730.5, dvMps: 0.0123 }, h = L.historyRow(rr, { method: 'kinetic', m: 560, U: 6.1, hypo: true }, { name: 'Apophis, "test"', des: '99942' }, 'hedef=99942');
  const csv = L.historyCsv([h]).split('\n');
  check(h.kind === 'bad' && h.shiftKm === 5000 && csv.length === 3 && csv[0].startsWith('tarih,hedef') && csv[1].includes('"Apophis, ""test"""') && csv[1].includes(',12.30,') && csv[1].includes(',5000.0,12000.0,carpacak_olsaydi,'), 'geçmiş satırı ve CSV (tırnaklama, nokta ondalık)', csv[1]);
}
check(/LINK_KEYS/.test(app) && /exp !== 'saptirma'/.test(app), 'app.js: saptırma parametreleri yalnız o deneyde adreste kalır');
// belirsizlik metni (uncert.js Monte Carlo → düz dil)
{
  const mcH = { pImpact0: 1, pImpact: 0.04, shiftQ: [9000, 14000, 21000] };
  const uH = L.uncertText(mcH, { hypo: true, sM: 0.4, sBeta: 0.25, sDv: Math.hypot(0.4, 0.25), method: 'kinetic', SB: null, dvReqMps: 0.002, M: 2.7e10, p: { beta: 3.6, U: 6.1 } });
  check(uH.kind === 'good' && uH.title === 'Belirsizlikle: %96,0 olasılıkla ıskalar' && /kütle \(1σ %49\) ve β \(1σ %28\)/.test(uH.detail[0]) && /%95 güvenle/.test(uH.detail[2]) && /kg'lık çarpıcı/.test(uH.detail[2]), 'çarpacak olsaydı: olasılık, kaynaklar ve %95 güven için gereken çarpıcı');
  const uR = L.uncertText({ pImpact0: 0.0005, pImpact: 0, shiftQ: [10, 20, 30] }, { hypo: false, sM: 0.3, sBeta: 0.25, sDv: 0.3, method: 'thrust', SB: [[400, 0], [0, 4]], dvReqMps: 1, M: 1, p: {} });
  check(uR.kind === 'good' && uR.title === 'Çarpma olasılığı: itkisiz %0,05 → itkili %0' && /yörünge belirsizliği \(1σ\) ≈ 20,0 km/.test(uR.detail[0]) && !/β/.test(uR.detail[1]), 'gerçek yörünge: itkisiz → itkili çarpma olasılığı, yörünge elipsi; sürekli itkide β yok');
  check(/kovaryansı yok/.test(L.uncertText({ pImpact0: 0, pImpact: 0, shiftQ: [1, 2, 3] }, { hypo: false, sM: 0.3, sBeta: 0.25, sDv: 0.3, method: 'kinetic', SB: null, p: {} }).detail[0]), 'kovaryans yoksa bunu söyler');
}
// önleme görevi: bağlantıda çarpma yönü ve özet satırları
{
  const st = { des: '99942', start: '2026-11-13', years: 50, caDay: '2029-04-13', method: 'kinetic', m: 3600, U: 12.6, beta: 3.6, applyDay: '2028-09-15', dir: 'vec', dirVec: [0.6, -0.8, 0], hypo: false };
  const o = L.linkFromState(st), back = L.stateFromLink(new URLSearchParams(new URLSearchParams(o).toString()));
  check(o.yv === '0.600000,-0.800000,0.000000' && back.dir === 'vec' && back.dirVec.every((x, k) => Math.abs(x - st.dirVec[k]) < 1e-9), 'bağlantı: önleme yönü (yv) gidiş-dönüş');
  check(L.stateFromLink({ hedef: '1', yon: 'vec' }).dir === null && L.stateFromLink({ hedef: '1', yon: 'vec', yv: '0,0,0' }).dir === null && L.stateFromLink({ hedef: '1', yon: 'vec', yv: '2,0,0' }).dirVec[0] === 1, 'yönsüz ya da sıfır vektörlü "vec" bağlantısı reddedilir; vektör birimlenir');
  const rows = L.interceptRows({ etL: L.etFromISO('2028-06-27'), etA: L.etFromISO('2028-09-15'), tofDays: 80, C3: 17.7, vinf: 4.21, m: 3629, U: 12.64, dvMps: 0.004129, shift: 149.5 }, 13773, 'Falcon Heavy');
  check(rows.length === 7 && rows[0][1] === '27 Haziran 2028 · Falcon Heavy' && /80 gün → çarpma 15 Eylül 2028/.test(rows[1][1]) && /\(%1\)$/.test(rows[6][1]) && /4,13 mm\/s/.test(rows[5][1]), 'önleme görevi özeti: tarih, roket, C3, kütle, hız, Δv, kayma oranı');
}
// çekim traktörü ve parçalanma
{
  const st = { des: '99942', start: '2026-11-13', years: 50, caDay: '2029-04-13', method: 'tractor', gm: 20000, gk: 2, days: 730, applyDay: '2027-01-01', dir: 'along', hypo: true };
  const o = L.linkFromState(st), back = L.stateFromLink(new URLSearchParams(new URLSearchParams(o).toString()));
  check(o.yontem === 'cek' && o.m === '20000' && o.k === '2' && back.method === 'tractor' && back.gm === 20000 && back.gk === 2 && back.days === 730 && back.m === null, 'bağlantı: çekim traktörü (araç kütlesi, uzaklık, süre)');
  check(L.stateFromLink({ hedef: '1', yontem: 'cek', k: '0.5' }).gk === null, 'yüzeyin altına (k < 1) inen traktör bağlantısı reddedilir');
  check(/Çekim traktörü · 20\.000 kg × 730 gün/.test(L.pushSummary({ method: 'tractor', gm: 20000, days: 730 }, '2 yıl önce')), 'itki özeti: çekim traktörü');
  const r = { dvReqMps: 0.002, b0: { bE: 13773 }, M: 4e10, FreqN: 1.2 }, nt = L.needText(r, { method: 'tractor', gk: 2, R: 170, days: 730 });
  const mReq = 1.2 * 340 * 340 / (6.6743e-11 * 4e10);
  check(nt.includes(L.sig(mReq, 3)) && /2,0 yarıçap uzaklıkta 730 gün/.test(nt), '"ne kadar gerekir": traktör için gereken araç kütlesi m = F·d²/(G·M) = ' + L.sig(mReq, 3) + ' kg');
  const dart = L.disruptionOf(579.4, 6.1449, 4.3e9, 0.151, 2400), big = L.disruptionOf(2.6e5, 6.1, 2.7e10, 0.34, 2600), huge = L.disruptionOf(2e6, 10, 2.7e10, 0.34, 2600);
  check(dart.kind === 'ok' && dart.ratio < 0.01 && big.kind === 'warn' && huge.kind === 'bad' && /parçalanır/.test(huge.text), 'parçalanma: DART eşiğin %1\'inden az, 260 t uyarı, 2.000 t parçalanır');
  check(Math.abs(L.disruptionOf(1, 1, 1, 1, 2000).Q - 5e5) < 1e-6, 'Q = ½·m·U²/M');
}
const own = (t) => (['gorev', 'kontrol', 'dv', 'grafik', 'yorunge', 'efemeris'].includes(t) ? 'mission' : ['takip', 'uydular', 'asteroit', 'carpma'].includes(t) ? 'sky' : null);
const rv = (o) => JSON.stringify(resolveView({ tabOwner: own, ...o }));
check(rv({ mode: 'mission' }) === '{"view":"lab","exp":"ay"}' && rv({ mode: 'sky' }) === '{"view":"sky","exp":null}' && rv({ mode: 'lab' }) === '{"view":"lab","exp":"home"}' && rv({ mode: 'lab', exp: 'saptirma' }) === '{"view":"lab","exp":"saptirma"}' && rv({ mode: 'lab', exp: 'xyz' }) === '{"view":"lab","exp":"home"}', 'adresler: ?mode=mission (eski) → Ay görevi; ?mode=lab[&exp=…]; bilinmeyen deney → ana sayfa');
check(rv({ tab: 'kontrol' }) === '{"view":"lab","exp":"ay","tab":"kontrol"}' && rv({ tab: 'carpma', mode: 'lab' }) === '{"view":"sky","exp":null,"tab":"carpma"}' && rv({ tab: 'saptirma' }) === '{"view":"lab","exp":"saptirma"}' && rv({}) === 'null', 'eski ?tab= bağlantıları kendi alanını açar; değer yoksa varsayılan açılış');
const steps = html.slice(html.indexOf('id="dfSteps"'), html.indexOf('</ol>', html.indexOf('id="dfSteps"')));
check((steps.match(/class="step[ "]/g) || []).length === 4 && (steps.match(/class="sh"/g) || []).length === 4 && (steps.match(/class="sn"/g) || []).length === 4 && (steps.match(/class="ss"/g) || []).length === 4, 'Saptırma: 4 adım (başlık, numara, özet, gövde)');
check(/data-step="1"[^>]*>\s*<button class="sh"[^>]*aria-expanded="true"/.test(steps) && (steps.match(/aria-expanded="false"[^>]*disabled/g) || []).length === 3, 'yalnız 1. adım açık, 2–4 başlangıçta kilitli ve erişilebilir (aria-expanded, disabled)');
check(/name="dfMethod"/.test(steps) && /name="dfScn"/.test(steps) && /<details class="adv">/.test(steps), 'yöntem ve senaryo seçimi görünür, ayrıntılar "Gelişmiş" altında katlı');
check(/role="radiogroup"/.test(steps) && /aria-live="polite"/.test(steps), 'erişilebilirlik: radyo grupları ve canlı durum bölgeleri');
check(!/\bnew Worker\b|deflectwork/.test(aui) && /new Worker\(new URL\('\.\/deflectwork\.js'/.test(dui), 'hesap iş parçacığı deflectui.js\'de; astui.js yalnız katalog ve bilgi kartı');
check(/k === 'm'\) \{ setWorkspace\(S\.VIEW === 'sky' \? 'lab' : 'sky'\)/.test(app) && /resolveView\(/.test(app) && /q\.get\('exp'\)/.test(app) && /engineFor\(S\.VIEW, exp, S\.MODE\)/.test(app), 'app.js: M kısayolu iki alan arasında geçer; adres çözümü ve motor seçimi labui.js\'teki saf işlevlerle');
check(/data-engine|dataset\.engine = MODE/.test(app) && /dataset\.exp = /.test(app) && /\$\('#btnPanel'\)\.onclick = \(\) => \$\('#labPanel'\)/.test(app) && !/\$\('#panel'\)/.test(app), 'app.js: body görünüm/motor/deney özniteliklerini taşır; görev çubuğundaki panel düğmesi Laboratuvar panelini açar');
check(/pg\.parentElement/.test(uij) && /:scope > \.tabs \.tab/.test(uij) && /isMissionTab/.test(uij), 'ui.js: sekmeler kendi gruplarında değişir (Laboratuvar panelinde Ay görevi sekmeleri, saptırma adımlarıyla karışmaz)');
check(/openLab, \{ hypo: true \}|openLab\(i, \{ hypo: true \}\)/.test(iui) && !/astui\.scan/.test(iui), 'Çarpma sekmesi sanal çarpıcıyı "çarpacak olsaydı" senaryosuyla Laboratuvar\'a gönderir');
check(/label: 'Laboratuvarda dene'/.test(app), 'asteroit kartı: "Laboratuvarda dene" eylemi');
const iconNames = new Set([...icons.matchAll(/^\s{2}(\w+): '/gm)].map((m) => m[1]));
const used = [...new Set([...html.matchAll(/data-icon="(\w+)"/g)].map((m) => m[1]))];
check(used.every((u) => iconNames.has(u)), `index.html'deki tüm simgeler tanımlı (${used.length}); yeni: flask, shield`);
check(/prefers-reduced-motion/.test(css) && /@keyframes stepIn/.test(css), 'adım geçişi animasyonu, azaltılmış hareket kuralıyla kapanır');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
