// LS19 kontrol paneli: aracın anlık durumunu canlı gösteren uçuş panosu (Ay Görevi paneli, "Kontrol" sekmesi).
// Hesap telemetry.js'te yapılır (saf, test/test_telemetry.js'te sınanır); burada yalnız biçimlendirme ve çizim vardır.
// Her satırın başlığında (fare ile üzerine gelince) tanım/formül yazar: değerlerin neye dayandığı görünür.
import * as T from './telemetry.js';
import { R_E } from './engine.js';

const D = 180 / Math.PI, AU = 149597870.7;
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const km = (x) => { if (x === Infinity) return '∞'; if (!Number.isFinite(x)) return '—'; if (Math.abs(x) < 5e-5) x = 0; const a = Math.abs(x); return a >= 10000 ? fmt(x, 0) + ' km' : a >= 100 ? fmt(x, 1) + ' km' : a >= 1 ? fmt(x, 2) + ' km' : fmt(x * 1000, a >= 0.1 ? 0 : 1) + ' m'; };
const spd = (x) => { if (!Number.isFinite(x)) return '—'; const a = Math.abs(x); return a >= 1 ? fmt(x, 3) + ' km/s' : fmt(x * 1000, a >= 0.1 ? 1 : 2) + ' m/s'; };
const ang = (rad, d = 2) => (Number.isFinite(rad) ? fmt(rad * D, d) + '°' : '—');
const dur = (s) => {
  if (!Number.isFinite(s)) return '—';
  const neg = s < 0, a = Math.abs(s); if (a < 100) return fmt(s, 1) + ' s';
  const d = Math.floor(a / 86400), h = Math.floor((a % 86400) / 3600), m = Math.floor((a % 3600) / 60), q = Math.floor(a % 60), z = (x) => String(x).padStart(2, '0');
  return (neg ? '−' : '') + (d ? `${d}g ` : '') + `${z(h)}:${z(m)}:${z(q)}`;
};
const latlon = (lat, lon) => `${fmt(Math.abs(lat * D), 2)}° ${lat >= 0 ? 'K' : 'G'} · ${fmt(Math.abs(lon * D), 2)}° ${lon >= 0 ? 'D' : 'B'}`;
const sg = (x, f) => (x > 0 ? '+' : x < 0 ? '−' : '') + f(Math.abs(x));
// büyük gösterge metni: son boşluktan sonrası birimdir, küçük yazılır (dar kartta sığsın)
const setBig = (el, text) => {
  const i = text.lastIndexOf(' ');
  if (i > 0 && /[a-zA-Z]/.test(text.slice(i + 1))) { const u = document.createElement('i'); u.textContent = ' ' + text.slice(i + 1); el.replaceChildren(text.slice(0, i), u); } else el.textContent = text;
};
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

// satır: [başlık, değer(tel, bağlam) → metin | [metin, sınıf], açıklama]
const SECTIONS = [
  { id: 'inis', title: 'İniş', open: true, rows: [
    ['İrtifa (iniş yeri)', (t) => (t.land ? km(t.land.h) : '—')],
    ['Dikey · yatay hız', (t, c) => (t.land ? [`${sg(t.land.vz, spd)} · ${spd(t.land.vh)}`, c.touchCls] : '—'), 'yüzeye göre; temas sınırları: dikey ≤ 3 m/s, yatay ≤ 1,5 m/s (görev başarı ölçütü)'],
    ['Menzil (yer yüzü)', (t) => (t.land && t.land.groundRange != null ? km(t.land.groundRange) : '—'), 'iniş yeri ile aracın alt noktası arasındaki büyük daire yayı'],
    ['Menzil · yan sapma', (t) => (t.land && t.land.down != null ? `${km(t.land.down)} · ${km(t.land.cross)}` : '—'), 'iniş yerine göre yerel çerçeve: x yaklaşma yönü, y yan'],
    ['Yerçekimi', (t) => `${fmt(t.g * 1000, 3)} m/s²`, 'g = μ/r²'],
    ['Azami · net ivme', (t) => (t.land ? `${fmt(t.aMax * 1000, 2)} · ${fmt(t.land.aNet * 1000, 2)} m/s²` : '—'), 'azami = T/m; net = T/m − g (düşey, tam gaz)'],
    ['Askıda kalma gazı', (t, c) => (t.hoverThr != null ? [`%${fmt(100 * t.hoverThr, 0)}${t.land && t.land.hoverOk ? '' : ' (olanaksız)'}`, t.land && t.land.hoverOk === false ? 'bad' : null] : '—'), 'm·g/T; en düşük gazdan küçükse askıda kalınamaz'],
    ['Motor kesilirse çarpma', (t) => (t.tImpact != null ? dur(t.tImpact) : 'çarpmaz'), 'osküle konikte r = iniş yeri yarıçapı olana dek süre (Kepler)'],
    ['Durma yüksekliği', (t, c) => (t.land ? [`${km(t.land.stopH)} (pay ${km(t.land.stopMargin)})`, t.land.stopMargin < 0 ? 'bad' : null] : '—'), 'tam gazla dikey hızı sıfırlamak için gereken irtifa: v²/(2(a_azami − g)); pay = irtifa − durma yüksekliği'],
    ['Hız sıfırlama Δv ≥', (t, c) => (t.land ? `${fmt(t.land.vRel * 1000, 0)} m/s (kalan ${fmt(t.dvStage * 1000, 0)})` : '—'), 'yüzeye göre hızı sıfırlamak için en az |v| Δv gerekir (yerçekimi kaybı ayrıca eklenir)'],
    ['Güneş yüksekliği', (t) => (t.land && t.land.sunElev != null ? ang(t.land.sunElev, 1) : '—')],
  ], canvas: 'phase' },
  { id: 'motor', title: 'Motor ve yakıt', open: true, rows: [
    ['Kademe', (t) => (t.stage ? t.stage.name : '—')],
    ['Motor', (t) => (t.F > 0 ? [`açık · gaz %${fmt(100 * t.thr, 0)}`, 'on'] : 'kapalı')],
    ['İtki', (t) => `${fmt(t.F, 1)} kN`, 'F = gaz × azami itki'],
    ['Özgül itki', (t) => (t.stage ? `${fmt(t.stage.isp, 0)} s · egzoz hızı ${fmt(t.stage.c * 1000, 0)} m/s` : '—'), 'Isp; egzoz hızı c = Isp·g₀ (g₀ = 9,80665 m/s²)'],
    ['Kütle akışı', (t) => `${fmt(t.mdot, 2)} kg/s`, 'ṁ = F / (Isp·g₀) = F / c'],
    ['Kütle', (t) => `${fmt(t.m, 0)} kg`, 'aracın toplam kütlesi (sonraki kademeler dahil)'],
    ['Yakıt (kademe)', (t) => (t.propFrac != null ? `${fmt(t.prop, 0)} kg · %${fmt(100 * t.propFrac, 1)}` : '—')],
    ['İvme (özgül kuvvet)', (t) => `${fmt(t.aT * 1000, 2)} m/s² · ${fmt(t.gLoad, 2)} g`, 'a = F/m: yerçekimi dışı ivme (mürettebatın hissedeceği). Serbest düşüşte 0.'],
    ['İtki/ağırlık', (t) => (t.near.grav && t.twrMax != null ? `azami ${fmt(t.twrMax, 2)}${t.F > 0 ? ` · anlık ${fmt(t.twr, 2)}` : ''}` : '— (cisimden uzak)'), 'azami itki ÷ (kütle × μ/r²); baskın cismin o yarıçaptaki çekimine göre. Yalnız cisme yakınken anlamlı.'],
    ['Kalan yanma süresi', (t) => (t.tBurn != null ? `${dur(t.tBurn)} (şimdiki gazla)` : t.tBurnFull != null ? `${dur(t.tBurnFull)} (tam gazla)` : '—'), 'yakıt ÷ kütle akışı'],
    ['Kalan Δv (kademe)', (t) => `${fmt(t.dvStage * 1000, 1)} m/s`, 'Tsiolkovsky: Δv = Isp·g₀·ln(m₀/m₁); m₁ = m₀ − yakıt'],
    ['Kalan Δv (toplam)', (t) => `${fmt(t.dvTotal * 1000, 1)} m/s`, 'kademeler sırayla yanar, biten kademenin kuru kütlesi atılır'],
    ['Kullanılan Δv', (t) => `${fmt(t.dvUsed * 1000, 1)} m/s`, 'motorun toplayıp saydığı Σ Isp·g₀·ln(m/(m−dm))'],
    ['İtki yönü', (t) => (t.thrustDir ? `hıza ${ang(t.thrustDir.vsVel, 1)} · ufka ${ang(t.thrustDir.pitch, 1)}` : '—'), 'hıza göre 0° = ileri (prograde), 180° = geri (retrograde); ufuk açısı yerel yataya göre'],
  ] },
  { id: 'konum', title: 'Konum ve hız', open: true, rows: [
    ['Baskın cisim', (t) => t.body, 'Ay\'ın gösterim bölgesindeyse Ay, değilse Dünya; tüm büyüklükler o cisme göre, dönmeyen (ICRF eksenli) çerçevede'],
    [(t) => (t.isMoon ? 'İrtifa (ort. yarıçap)' : 'İrtifa (WGS-84)'), (t) => km(t.alt), 'Dünya: elipsoide dik jeodezik yükseklik. Ay: merkez uzaklığı − ortalama yarıçap (1737,4 km).'],
    ['İrtifa (iniş yeri)', (t, c) => (t.isMoon && t.altSite != null && t.alt < 300 ? km(t.altSite) : null), (c) => `merkez uzaklığı − iniş yeri yarıçapı (${fmt(c.rSite, 2)} km): görev motorunun temas ölçütü`],
    ['Merkeze uzaklık', (t) => km(t.r)],
    ['Enlem / boylam', (t) => latlon(t.lat, t.lon), 'Dünya: jeodezik enlem, ITRS boylamı. Ay: selenografik (ME eksenleri, doğu +).'],
    ['Hız (eylemsiz)', (t) => spd(t.v), 'merkez cisme göre, dönmeyen (ICRF eksenli) çerçevede'],
    ['Hız (yüzeye göre)', (t) => (t.near.surf ? spd(t.vRel) : '— (cisimden uzak)'), 'v − ω×r: cisimle birlikte dönen yüzeye göre. Uzakta ω×r sanal bir hızdır, gösterilmez.'],
    ['Dikey (radyal) hız', (t) => sg(t.vr, spd), 'v·r̂: yükselme +, alçalma −; dönen çerçevede de aynıdır'],
    ['Yatay hız', (t) => (t.near.surf ? `${spd(t.vRelH)} (yüzeye göre) · ${spd(t.vt)} (eylemsiz)` : spd(t.vt)), 'radyal olmayan bileşen'],
    ['Uçuş yolu açısı γ', (t) => (t.near.surf ? `${ang(t.gammaRel, 1)} (yüzeye göre) · ${ang(t.gamma, 1)} (eylemsiz)` : ang(t.gamma, 1)), 'γ = atan(v_radyal / v_yatay): hız vektörünün yerel ufuktan açısı'],
    ['Yön (azimut)', (t) => (t.near.surf && t.azRel != null ? `${ang(t.azRel, 1)} (kuzeyden saat yönünde)` : '—'), 'yüzeye göre yatay hızın kuzeyden doğuya doğru açısı'],
  ] },
  { id: 'yorunge', title: 'Yörünge (osküle)', open: true, rows: [
    ['Tür', (t) => (t.orbit.bound ? (t.orbit.e < 0.01 ? 'elips (≈ dairesel)' : 'elips') : 'hiperbol')],
    ['Yarı büyük eksen · e', (t) => `${Number.isFinite(t.orbit.a) ? fmt(t.orbit.a, 0) : '∞'} km · ${fmt(t.orbit.e, t.orbit.e < 0.1 ? 5 : 4)}`],
    ['Eğim', (t) => ang(t.orbit.inc), 'cos i = ĥ·ẑ; Dünya gerçek kutba, Ay ortalama dönme eksenine göre'],
    ['Ω · ω', (t) => `${t.orbit.raan != null ? ang(t.orbit.raan, 1) : '—'} · ${t.orbit.argp != null ? ang(t.orbit.argp, 1) : '—'}`, 'Ω: çıkış düğümü, tarihin gerçek ekinoksundan (yalnız Dünya); ω: düğümden periapsise açı'],
    ['Gerçek anomali ν', (t) => ang(t.orbit.nu, 1), 'periapsisten itibaren açı; dairesel yörüngede enlem argümanı'],
    ['Periapsis · apoapsis irtifa', (t) => `${km(t.orbit.altPeri)} · ${t.orbit.altApo != null ? km(t.orbit.altApo) : '∞'}`, 'rp = a(1−e), ra = a(1+e); irtifa = yarıçap − cisim yarıçapı'],
    ['Dönem', (t) => dur(t.orbit.period), 'T = 2π√(a³/μ)'],
    ['Periapsise · apoapsise kalan', (t) => (t.orbit.tPeri != null ? `${dur(t.orbit.tPeri)} · ${t.orbit.tApo != null ? dur(t.orbit.tApo) : '—'}` : '— (dairesel)'), 'Kepler denklemi: M = E − e·sinE (hiperbolde M = e·sinhF − F)'],
    ['Özgül enerji', (t) => `${fmt(t.orbit.energy, 4)} km²/s²${t.orbit.vInf != null ? ` · v∞ ${fmt(t.orbit.vInf, 3)} km/s` : ''}`, 'ε = v²/2 − μ/r; ε > 0 ise kaçış yörüngesi, v∞ = √(2ε)'],
    ['Dairesel · kaçış hızı', (t) => `${fmt(t.orbit.vCirc, 3)} · ${fmt(t.orbit.vEsc, 3)} km/s (v/v_k ${fmt(t.v / t.orbit.vEsc, 3)})`, 'bu yarıçapta v_c = √(μ/r), v_kaçış = √(2μ/r); v_k: kaçış hızı'],
    ['Koniğin geçerliliği', (t) => { const r = t.pertRatio.toExponential(1).replace('.', ','); return t.pertRatio < 1e-3 ? [`iyi (bozucu/merkezi ${r})`, 'good'] : t.pertRatio < 1e-2 ? [`yaklaşık (${r})`, 'warn'] : [`kaba: periapsis/apoapsis güvenilmez (${r})`, 'bad']; }, 'Üçüncü cisimlerin (Ay/Dünya, Güneş) bozucu ivmesi ÷ merkezi çekim. Küçükse konik gelecek hareketi iyi tarif eder; büyükse periapsis/apoapsis yaklaşıktır.'],
  ], canvas: 'orbit' },
  { id: 'ortam', title: 'Ortam ve haberleşme', open: false, rows: [
    ['Dünya\'ya uzaklık', (t) => `${km(t.dEarth)} (yüzeyden ${km(t.dEarth - R_E)})`, 'Dünya merkezine; parantez içinde yüzeyden'],
    ['Işık süresi', (t) => `${fmt(t.lightTime, 3)} s tek yön · ${fmt(2 * t.lightTime, 3)} s gidiş-dönüş`, 'd/c, c = 299.792,458 km/s'],
    ['Dünya ile görüş hattı', (t) => (t.earthVisible ? ['açık', 'good'] : ['Ay engelliyor', 'warn']), 'araç–Dünya merkezi doğrusunu Ay küresi kesiyor mu'],
    ['Dünya\'nın ufuk yüksekliği', (t) => (t.earthElev != null ? ang(t.earthElev, 1) : '—'), 'Ay çevresinde yerel ufka göre; negatifse ufkun altında'],
    ['Ay\'a uzaklık · hız', (t) => `${km(t.dMoon)} · ${sg(t.rangeRateMoon, spd)}`, 'eksi: Ay\'a yaklaşıyor; d(|r−r_ay|)/dt'],
    ['Güneş\'e uzaklık', (t) => `${fmt(t.dSun / AU, 4)} AB`],
    ['Güneş ışığı', (t) => (t.eclipseBy ? [`%${fmt(100 * t.sunFrac, 0)} (${t.eclipseBy} gölgesi)`, 'warn'] : ['%100 (tam ışık)', 'good']), 'Güneş diskinin Dünya ve Ay diskleriyle örtülmeyen oranı (iki disk kesişimi)'],
  ] },
];

const NOTES = [
  'Baskın cisim: araç Ay\'ın gösterim bölgesindeyse (varsayılan 66.100 km) Ay, değilse Dünya; tüm büyüklükler o cisme göre.',
  'Dünya\'da irtifa WGS-84 elipsoidine göre jeodeziktir; Ay\'da ortalama yarıçapa (1737,4 km) ve iniş yeri yüzeyine (1735,47 km) göre ayrı verilir.',
  'Yüzeye göre hız, cismin gerçek dönme vektörüyle v − ω×r olarak bulunur (Dünya: IERS dönme hızı × gerçek kutup; Ay: yönelim matrisinin türevi).',
  'Yörünge elemanları osküle koniktir: yalnız merkez cismin çekimi; J2, üçüncü cisimler ve itki dışarıda. "Koniğin geçerliliği" bunun ne kadar yaklaşık olduğunu gösterir.',
  'Δv Tsiolkovsky denklemiyledir ve motorun saydığı Δv ile aynı büyüklüktür. Δv payı = kademenin kalan Δv\'si − o kademenin yapacağı planlı manevraların kalanı; bozulmasız uçuşta sabit kalır, plan dışı harcama onu azaltır.',
  'Çarpma süresi ve durma yüksekliği motor kesilirse / tam gazla düşeydeki en iyi durum içindir; ikincisi yatay hızı hesaba katmaz.',
  'Model: nokta kütle, atmosfer yok (Dünya\'da yalnız yörünge), yönelim dinamiği yok; itki yönü otopilotun komut ettiği yöndür.',
];

export class ControlPanel {
  constructor(root) { this.root = root; this.trail = []; this.lastT = -Infinity; this.alertSig = ''; this.rows = []; this.sections = {}; this.build(); }

  build() {
    const r = this.root; r.replaceChildren(); r.classList.add('kp');
    // başlık: evre, rozetler, sonraki olay, sonuç
    const head = mk('div', 'kp-head'); this.el = { head };
    this.el.phase = mk('div', 'kp-phase', 'Bekleniyor…'); this.el.badges = mk('div', 'kp-badges'); this.el.next = mk('div', 'kp-next'); this.el.result = mk('div', 'kp-result'); this.el.result.hidden = true;
    head.append(this.el.phase, this.el.badges, this.el.next, this.el.result); r.appendChild(head);
    this.el.alerts = mk('ul', 'kp-alerts'); this.el.alerts.setAttribute('role', 'status'); r.appendChild(this.el.alerts);
    // ana göstergeler
    const grid = mk('div', 'kp-grid'); this.cards = {};
    for (const [id, title] of [['alt', 'İrtifa'], ['spd', 'Hız'], ['vz', 'Dikey hız'], ['fuel', 'Yakıt']]) {
      const c = mk('div', 'kp-card'); const k = mk('span', 'k', title), v = mk('span', 'kp-big', '—'), s = mk('span', 'kp-sub', ''), b = mk('div', 'track'), f = mk('div', 'fill');
      b.appendChild(f); c.append(k, v, s); if (id === 'fuel') c.appendChild(b); grid.appendChild(c); this.cards[id] = { v, s, f, c, k };
    }
    r.appendChild(grid);
    const thr = mk('div', 'kp-thr'); this.thrLabel = mk('span', 'k', 'Gaz'), this.thrVal = mk('span', 'v', '—'); const tb = mk('div', 'track'); this.thrFill = mk('div', 'fill thr'); tb.appendChild(this.thrFill);
    thr.append(this.thrLabel, this.thrVal, tb); r.appendChild(thr);
    // Δv bütçesi tablosu
    const bs = mk('details', 'kp-sec'); bs.open = true; bs.appendChild(mk('summary', null, 'Δv bütçesi (m/s)'));
    this.budget = mk('table', 'tbl kp-budget'); this.budget.innerHTML = '<thead><tr><th>Kademe</th><th class="num">Kalan</th><th class="num">Gerekli</th><th class="num">Pay</th></tr></thead><tbody></tbody>';
    this.budgetNote = mk('div', 'note kp-note'); bs.append(this.budget, this.budgetNote); r.appendChild(bs); this.sections.budget = bs;
    // bölümler
    for (const S of SECTIONS) {
      const d = mk('details', 'kp-sec'); d.open = !!S.open; d.appendChild(mk('summary', null, S.title));
      const tb = mk('table', 'tbl kp-tbl'), body = mk('tbody'); tb.appendChild(body);
      const rows = [];
      for (const [label, fn, tip] of S.rows) {
        const tr = mk('tr'), a = mk('td', 'kp-k', typeof label === 'string' ? label : ''), b = mk('td', 'num kp-v', '—'); if (typeof tip === 'string') tr.title = tip; tr.append(a, b); body.appendChild(tr);
        rows.push({ tr, a, b, fn, label, tip, last: '', cls: '', lastLabel: typeof label === 'string' ? label : '' });
      }
      if (S.canvas) { const cv = mk('canvas', 'kp-canvas'); cv.id = 'kp-' + S.canvas; if (S.id === 'inis') d.appendChild(cv); this[S.canvas + 'Cv'] = cv; }   // iniş: grafik tablonun üstünde
      if (S.id === 'inis') d.appendChild(mk('div', 'note kp-note', 'Faz düzlemi: yatay eksen dikey hız, düşey eksen √irtifa. Tam gazla durdurabilme sınırı (v² = 2(a−g)h) bu eksenlerde doğrudur; sınırın solundaki bölgede dikey hız artık sıfırlanamaz. Yeşil kutu: temas sınırı (son 10 m, ≤ 3 m/s).'));
      d.appendChild(tb);
      if (S.canvas && S.id !== 'inis') d.appendChild(this[S.canvas + 'Cv']);
      if (S.id === 'yorunge') d.appendChild(mk('div', 'note kp-note', 'Yörünge düzlemi, açısal momentum yönünden bakışla; periapsis sağda. Mavi elips, turuncu hiperbol, mor Ay merkezli.'));
      r.appendChild(d); this.sections[S.id] = d; this.rows.push(...rows.map((x) => ({ ...x, sec: S.id })));
    }
    const notes = mk('details', 'kp-sec'); notes.appendChild(mk('summary', null, 'Fizik notları'));
    const ul = mk('ul', 'kp-notes'); for (const n of NOTES) ul.appendChild(mk('li', null, n)); notes.appendChild(ul); r.appendChild(notes);
    for (const cv of [this.orbitCv, this.phaseCv]) if (cv) new ResizeObserver(() => { if (this.tel) this.draw(); }).observe(cv);
  }

  reset() { this.trail = []; this.lastT = -Infinity; }

  // s: çalışan görev durumu (worker); c: { stages, design, events, nominal, siteIcrf, rSite, tLaunch, phaseName, next }
  update(s, c) {
    let tel;
    try { tel = T.computeTelemetry(s, { stages: c.stages, siteIcrf: c.siteIcrf, rSite: c.rSite, tLaunch: c.tLaunch }); } catch (err) { this.el.phase.textContent = 'Telemetri hesaplanamadı'; console.error(err); return; }
    this.tel = tel; this.s = s;
    const budget = T.dvBudget(c.design, c.nominal, c.events, s, c.stages), al = T.alerts(tel, budget.rows, { stages: c.stages, rSite: c.rSite });
    // başlık
    this.el.phase.textContent = c.phaseName(s.phase);
    const badge = (txt, cls) => `<span class="kp-badge ${cls || ''}">${txt}</span>`;
    const L = tel.land, risk = T.touchRisk(tel);
    this.el.badges.innerHTML = badge(tel.F > 0 ? 'MOTOR AÇIK' : 'MOTOR KAPALI', tel.F > 0 ? 'on' : '') + badge(s.auto ? 'OTOPİLOT' : 'ELLE', s.auto ? '' : 'warn') + badge(s.nbody ? 'N-CİSİM' : 'ETKİ KÜRESİ') + (s.paused ? badge('DURAKLATILDI', 'warn') : badge('×' + fmt(s.warp, s.warp < 10 ? 1 : 0)));
    this.el.next.textContent = s.done ? '' : c.next ? `Sıradaki: ${c.next.name} · T−${dur(Math.max(0, c.next.dt))}` : '';
    const R = s.done ? s.result : null;
    this.el.result.hidden = !R;
    if (R) {
      this.el.result.className = 'kp-result ' + (R.ok ? 'good' : 'bad');
      this.el.result.textContent = R.reentry ? 'Dünya atmosferine girdi — görev sona erdi' : `${R.ok ? 'TEMAS' : 'ÇARPMA'}${R.manual ? ' (elle)' : ''}: dikey ${fmt(Math.abs(R.v_mps[2]), 2)} m/s, yatay ${fmt(Math.hypot(R.v_mps[0], R.v_mps[1]), 2)} m/s, konum hatası ${fmt(Math.hypot(...R.posErr_m), 1)} m, kalan yakıt ${fmt(R.prop, 0)} kg`;
    }
    // uyarılar
    const sig = al.map((a) => a.level + a.text).join('|');
    if (sig !== this.alertSig) {
      this.alertSig = sig; this.el.alerts.replaceChildren();
      for (const a of al) this.el.alerts.appendChild(mk('li', 'kp-al ' + a.level, a.text));
      this.el.alerts.hidden = !al.length;
    }
    // ana göstergeler
    const C = this.cards, onSite = tel.isMoon && tel.altSite != null && tel.alt < 300, altV = onSite ? tel.altSite : tel.alt;
    setBig(C.alt.v, km(altV)); C.alt.s.textContent = tel.isMoon ? (onSite ? 'iniş yeri yüzeyine göre' : 'Ay ortalama yarıçapına göre') : 'WGS-84 elipsoidine göre';
    const surf = tel.isMoon && tel.altSite != null && tel.altSite < 50;           // HUD gibi: yüzeye göre hız yalnız iniş yerinin yakınında birincil
    setBig(C.spd.v, spd(surf ? tel.vRel : tel.v)); C.spd.s.textContent = surf ? 'yüzeye göre' : `${tel.body} merkezine göre, eylemsiz`;
    setBig(C.vz.v, (tel.vr < 0 ? '↓ ' : tel.vr > 0 ? '↑ ' : '') + spd(Math.abs(tel.vr))); C.vz.s.textContent = `yatay ${spd(surf ? tel.vRelH : tel.vt)}`;
    C.vz.c.classList.toggle('bad', risk);
    C.fuel.v.textContent = tel.propFrac != null ? `%${fmt(100 * tel.propFrac, 1)}` : '—'; C.fuel.s.textContent = tel.stage ? `${tel.stage.name}: ${fmt(tel.prop, 0)} kg` : '';
    C.fuel.f.style.width = Math.max(0, Math.min(100, 100 * (tel.propFrac || 0))) + '%'; C.fuel.f.classList.toggle('low', tel.propFrac != null && tel.propFrac < 0.1);
    this.thrVal.textContent = tel.F > 0 ? `${fmt(100 * tel.thr, 0)}% · ${fmt(tel.F, 1)} kN` : 'kapalı'; this.thrFill.style.width = 100 * (tel.F > 0 ? tel.thr : 0) + '%';
    // Δv bütçesi
    const tb = this.budget.tBodies[0]; tb.replaceChildren();
    for (const q of budget.rows) {
      const tr = mk('tr'), td = (txt, cls) => mk('td', cls, txt), unp = q.unplanned;
      const cls = q.margin < 0 ? 'bad' : q.base > 0 && unp > Math.max(5, 0.5 * q.base) ? 'warn' : 'good';
      tr.append(td(c.stages[q.stage] ? c.stages[q.stage].name : 'Kademe ' + q.stage), td(fmt(q.avail, 1), 'num'), td(q.req > 0 ? fmt(q.req, 1) : '—', 'num'), td(q.req > 0 ? sg(q.margin, (x) => fmt(x, 1)) : '(serbest)', 'num ' + (q.req > 0 ? cls : '')));
      tr.title = `Plan dışı harcama: ${fmt(unp, 1)} m/s · tasarım payı ${fmt(q.base, 1)} m/s`; tb.appendChild(tr);
    }
    this.budgetNote.textContent = (c.nominal && Object.keys(c.nominal).length ? 'Gerekli: bozulmasız (nominal) uçuşun kalan manevraları.' : 'Gerekli: tasarım tahmini (nominal uçuş hesaplanıyor).') + ' Pay = kalan − gerekli; plan dışı harcama payı azaltır.';
    // satırlar
    const showLand = !!L && (T.LANDING_PHASES.has(s.phase) || L.h < 30);
    const ctx2 = { rSite: c.rSite, touchCls: risk ? 'warn' : null };
    for (const row of this.rows) {
      const q = row.fn(tel, ctx2), txt = Array.isArray(q) ? q[0] : q, cls = Array.isArray(q) ? q[1] || '' : '';
      if (txt == null) { if (!row.tr.hidden) row.tr.hidden = true; continue; }
      if (row.tr.hidden) row.tr.hidden = false;
      if (typeof row.label === 'function') { const l = row.label(tel); if (l !== row.lastLabel) { row.a.textContent = l; row.lastLabel = l; } }
      if (typeof row.tip === 'function' && !row.tr.title) row.tr.title = row.tip(ctx2);
      if (txt !== row.last) { row.b.textContent = txt; row.last = txt; }
      if (cls !== row.cls) { row.b.className = 'num kp-v' + (cls ? ' ' + cls : ''); row.cls = cls; }
    }
    this.sections.inis.hidden = !showLand;
    // faz düzlemi izi: yalnız iniş yakınında, zaman geriye giderse (olaya atlama) sıfırla
    if (tel.t < this.lastT - 1e-6) this.trail = [];
    this.lastT = tel.t;
    if (L && L.h < 3) { const tl = this.trail[this.trail.length - 1]; if (!tl || tel.t - tl.t > 0.5) { this.trail.push({ t: tel.t, v: L.vz * 1000, h: L.h * 1000 }); if (this.trail.length > 800) this.trail.shift(); } } else if (!L || L.h > 3.2) this.trail = [];
    this.draw();
  }

  // ---------------------------------------------------------------- çizim
  canvas(cv) {
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return null;
    const dpr = window.devicePixelRatio || 1; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement), col = (n) => cs.getPropertyValue(n).trim();
    return { g, W, H, col };
  }
  draw() { const tel = this.tel; if (!tel) return; if (!this.sections.yorunge.hidden && this.sections.yorunge.open) this.drawOrbit(tel); if (!this.sections.inis.hidden && this.sections.inis.open) this.drawPhase(tel); }

  drawOrbit(tel) {
    const cx = this.canvas(this.orbitCv); if (!cx) return;
    const { g, W, H, col } = cx, o = tel.orbit, e = o.e, p = o.p, R = tel.R;
    // yörünge noktaları (periapsis +x, hareket saat yönünün tersine; ĥ yönünden bakış)
    const pts = [], rClip = e < 1 ? Infinity : Math.max(3 * o.rp, 1.6 * tel.r, 3 * R);
    const nuMax = e < 1 ? Math.PI : Math.min(Math.acos(-1 / e) - 0.02, Math.acos(Math.max(-1, Math.min(1, (p / rClip - 1) / e))));
    for (let i = -180; i <= 180; i++) { const nu = (i / 180) * nuMax, r = p / (1 + e * Math.cos(nu)); if (r > 0 && r <= rClip * 1.001) pts.push([r * Math.cos(nu), r * Math.sin(nu)]); }
    const veh = [tel.r * Math.cos(o.nu), tel.r * Math.sin(o.nu)];
    let x0 = Math.min(veh[0], -R), x1 = Math.max(veh[0], R), y0 = Math.min(veh[1], -R), y1 = Math.max(veh[1], R);
    for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const m = 16, sc = Math.min((W - 2 * m) / (x1 - x0 || 1), (H - 2 * m) / (y1 - y0 || 1)), ox = W / 2 - ((x0 + x1) / 2) * sc, oy = H / 2 + ((y0 + y1) / 2) * sc;
    const X = (x) => ox + x * sc, Y = (y) => oy - y * sc;
    // cisim
    g.fillStyle = tel.isMoon ? 'rgba(150,155,165,.45)' : 'rgba(59,130,246,.35)'; g.strokeStyle = col('--line-2'); g.lineWidth = 1;
    g.beginPath(); g.arc(X(0), Y(0), Math.max(2, R * sc), 0, 7); g.fill(); g.stroke();
    // yörünge
    g.strokeStyle = tel.isMoon ? '#c084fc' : e < 1 ? col('--series-1') : '#f08a3c'; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])))); if (e < 1) g.closePath(); g.stroke();
    // periapsis / apoapsis
    g.font = '11px system-ui, sans-serif'; g.fillStyle = col('--text-secondary');
    const mark = (x, y, label, dx, dy, al) => { g.beginPath(); g.arc(X(x), Y(y), 3, 0, 7); g.fill(); g.textAlign = al; g.fillText(label, X(x) + dx, Y(y) + dy); };
    mark(o.rp, 0, 'Pe ' + km(o.altPeri), -4, -8, 'right'); if (e < 1) mark(-o.ra, 0, 'Ap ' + km(o.altApo), 4, 16, 'left');
    // araç ve hız yönü
    const vx = -Math.sin(o.nu), vy = e + Math.cos(o.nu), vn = Math.hypot(vx, vy) || 1;
    g.strokeStyle = '#ffe0a3'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(veh[0]), Y(veh[1])); g.lineTo(X(veh[0]) + (vx / vn) * 18, Y(veh[1]) - (vy / vn) * 18); g.stroke();
    g.fillStyle = col('--surface-1'); g.beginPath(); g.arc(X(veh[0]), Y(veh[1]), 6, 0, 7); g.fill(); g.fillStyle = '#ffe0a3'; g.beginPath(); g.arc(X(veh[0]), Y(veh[1]), 4, 0, 7); g.fill();
  }

  // iniş faz düzlemi: x = dikey hız (m/s), y = √irtifa; tam gazla durdurma sınırı v² = 2(a−g)h bu eksenlerde doğrudur
  drawPhase(tel) {
    const L = tel.land, cx = this.canvas(this.phaseCv); if (!cx || !L) return;
    const { g, W, H, col } = cx, ml = 46, mr = 10, mt = 14, mb = 26, x0 = -70, x1 = 10, hMax = 3000;
    const px = (v) => ml + ((v - x0) / (x1 - x0)) * (W - ml - mr), py = (h) => mt + (1 - Math.sqrt(Math.max(0, Math.min(h, hMax)) / hMax)) * (H - mt - mb);
    g.font = '11px system-ui, sans-serif'; g.fillStyle = col('--text-secondary'); g.strokeStyle = col('--grid'); g.lineWidth = 1; g.textAlign = 'right';
    for (const h of [0, 10, 100, 500, 1000, 3000]) { const y = Math.round(py(h)) + 0.5; g.beginPath(); g.moveTo(ml, y); g.lineTo(W - mr, y); g.stroke(); g.fillText(h >= 1000 ? fmt(h / 1000, 0) + ' km' : fmt(h, 0) + ' m', ml - 5, y + 4); }
    g.textAlign = 'center';
    for (const v of [-60, -40, -20, 0]) { const x = Math.round(px(v)) + 0.5; g.beginPath(); g.moveTo(x, mt); g.lineTo(x, H - mb); g.stroke(); g.fillText(String(v), x, H - mb + 14); }
    g.fillText('dikey hız (m/s)', (ml + W - mr) / 2, H - 4);
    // erişilemez bölge: tam gazla durdurulamayan dikey hızlar (sınırın solu)
    const aNet = L.aNet * 1000;                                            // m/s²
    g.fillStyle = 'rgba(248,113,113,.16)'; g.strokeStyle = '#f87171'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px(x0), py(0));
    const edge = []; for (let i = 0; i <= 200; i++) { const h = (hMax * i * i) / 40000; edge.push([aNet > 0 ? -Math.sqrt(2 * aNet * h) : 0, h]); }
    g.lineTo(px(0), py(0)); for (const [v, h] of edge) g.lineTo(px(Math.max(v, x0)), py(h)); g.lineTo(px(x0), py(hMax)); g.closePath(); g.fill();
    g.beginPath(); let pen = false; for (const [v, h] of edge) { if (v < x0) { pen = false; continue; } if (pen) g.lineTo(px(v), py(h)); else { g.moveTo(px(v), py(h)); pen = true; } } g.stroke();
    // temas sınırı: son 10 m'de |v| ≤ 3 m/s
    g.strokeStyle = '#34d399'; g.setLineDash([4, 3]); g.strokeRect(px(-T.LIMITS.vz), py(10), px(0) - px(-T.LIMITS.vz), py(0) - py(10)); g.setLineDash([]);
    // iz ve şimdiki nokta
    if (this.trail.length > 1) { g.strokeStyle = col('--series-1'); g.lineWidth = 2; g.beginPath(); this.trail.forEach((q, i) => (i ? g.lineTo(px(q.v), py(q.h)) : g.moveTo(px(q.v), py(q.h)))); g.stroke(); }
    if (L.h * 1000 <= hMax) {
      const ok = L.stopMargin >= 0, X = Math.max(px(L.vz * 1000), ml + 5), Y = py(L.h * 1000); g.fillStyle = col('--surface-1'); g.beginPath(); g.arc(X, Y, 6, 0, 7); g.fill();
      g.fillStyle = ok ? '#ffe0a3' : '#f87171'; g.beginPath(); g.arc(X, Y, 4, 0, 7); g.fill();
    } else { g.textAlign = 'left'; g.fillStyle = col('--text-muted'); g.fillText('irtifa 3 km altına inince çizilir', ml + 8, mt + 16); }
  }
}
