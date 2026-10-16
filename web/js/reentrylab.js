// Laboratuvar › Uydu yeniden girişi: katalogdan (filtre/ad) ya da elle tanımlanan yörüngenin sürüklenmeyle bozunması (Güneş etkinliği senaryoları),
// yeniden giriş penceresi, enlem bandı olasılığı ve 120 km'den balistik giriş yükleri (reentry.js; hesap iş parçacığında).
import { RE, MU, bcFromBstar } from './reentry.js';
import { perApo } from './conjunction.js';
import { SatPicker } from './targetpick.js';
import { fmt } from './format.js';
import { mk, sci, timeText, kvTable, Steps, stepsHtml, numF, cardsHtml, bindCards, fields, labWork, labWorkCancel, autoPlot, PALETTE } from './labkit.js';

const dateTxt = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '—');
const lifeTxt = (d) => (!Number.isFinite(d) ? '> 100 yıl' : d < 2 ? `${fmt(d * 24, 1)} saat` : d < 120 ? `${fmt(d, 1)} gün` : `${fmt(d / 365.25, d < 3650 ? 2 : 1)} yıl`);
const SCN = [['düşük', PALETTE[0]], ['orta', PALETTE[1]], ['yüksek', PALETTE[4]]];

export default class ReentryLab {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx; this.sat = null; this.res = null;
    root.innerHTML = `<p class="labsub">Alçak yörüngedeki bir cisim atmosfer sürüklenmesiyle yavaş yavaş alçalır. Ne zaman ve nereye düşer, girişte ne kadar ısınır? Güneş etkinliği belirsizliği ömrü birkaç kat değiştirir.</p>`
      + stepsHtml([
        { t: 'Nesne', s: 'Katalogdan seçin ya da elle tanımlayın', b: cardsHtml('rnSrc', [['kat', 'Katalogdan', 'Alçak yörünge süzgeci açık: ad, NORAD, grup, yükseklik'], ['el', 'Elle tanımla', 'Perije, apoje ve eğimi girin']])
          + `<div data-f="pick"></div><div data-f="man" hidden><div class="frow3">${numF('Perije', 'hp', 400, 'km', 'min="121"')}${numF('Apoje', 'ha', 420, 'km', 'min="121"')}${numF('Eğim', 'inc', 51.6, '°', 'min="0" max="180"')}</div></div>
          <div data-f="info" class="dinfo"></div><div class="stepnav"><button type="button" class="primary" data-f="next1" disabled>Fiziksel modele geç →</button></div>` },
        { t: 'Fiziksel model', s: '', b: `<div class="fttl">Balistik katsayı BC = m / (C<sub>D</sub> A)</div>` + cardsHtml('rnBc', [['fiz', 'Kütle ve alan', 'BC fiziksel değerlerden'], ['bstar', "GP'nin B*'ından", 'Yörünge uydurmasından türetilen sürüklenme']])
          + `<div class="frow3" data-f="fiz">${numF('Kütle', 'm', 500, 'kg', 'min="0.01"')}${numF('Ortalama kesit alanı', 'A', 4, 'm²', 'min="0.0001"', 'Rastgele yönelimde ortalama izdüşüm alanı')}${numF('Sürüklenme katsayısı', 'Cd', 2.2, '', 'min="0.5" max="4"', 'Serbest moleküler akışta tipik 2,0–2,4')}</div>
          <div class="k small" data-f="bcTxt"></div>
          <div class="fttl">Atmosfer</div>` + cardsHtml('rnAtm', [['gunes', 'Güneş etkinliğine duyarlı', 'Jacchia tabanlı model; üç F10.7 senaryosu'], ['vallado', 'Durağan', 'Vallado (2013) üstel modeli; tek tahmin']])
          + `<div class="frow3" data-f="sol">${numF('F10.7 düşük', 'f1', 70, 'sfu', 'min="60" max="400"', 'Güneş en azı')}${numF('F10.7 orta', 'f2', 140, 'sfu', 'min="60" max="400"')}${numF('F10.7 yüksek', 'f3', 220, 'sfu', 'min="60" max="400"', 'Güneş en çoğu')}${numF('Ap', 'Ap', 15, '', 'min="0" max="400"', 'Jeomanyetik etkinlik; fırtınada 100+')}</div>
          <details class="adv"><summary>Atmosfere giriş</summary><div class="frow3">${numF('Burun yarıçapı', 'rn', 1, 'm', 'min="0.01"', 'Durma noktası ısı akısı q ∝ √(ρ / rn) v³')}${numF('120 km\'de uçuş yolu açısı', 'gam', -0.1, '°', 'min="-30" max="-0.01"', 'Bozunan yörünge çok sığ girer (−0,05° … −0,5°)')}</div></details>
          <div class="stepnav"><button type="button" class="primary" data-f="run">Hesapla</button><button type="button" class="sm" data-f="cancel" hidden>Durdur</button><span class="k small" data-f="status" role="status" aria-live="polite"></span></div>` },
        { t: 'Sonuç', s: 'Önce hesaplayın', b: `<div class="stale" data-f="stale" hidden>Girdiler değişti: sonuç eski. <button type="button" class="sm" data-f="rerun">Yeniden hesapla</button></div><div data-f="out"></div>` },
      ]);
    this.F = fields(root);
    this.steps = new Steps(root.querySelector('.steps'));
    this.src = bindCards(root, 'rnSrc', (v) => this.setSrc(v));
    this.bcMode = bindCards(root, 'rnBc', () => this.sync());
    this.atm = bindCards(root, 'rnAtm', () => this.sync());
    this.picker = new SatPicker(this.F.f('pick'), { getSats: () => this.ctx().sats, onPick: (p) => this.setSat(p), preset: { otype: 'leo', haMax: 1200, sort: 'hp' }, placeholder: 'Ad ya da NORAD numarası (ör. ISS, Starlink, 25544)' });
    this.F.f('man').addEventListener('input', () => this.setManual());
    this.F.f('next1').addEventListener('click', () => this.steps.open(2));
    this.F.f('run').addEventListener('click', () => this.run());
    this.F.f('rerun').addEventListener('click', () => this.run());
    this.F.f('cancel').addEventListener('click', () => labWorkCancel('giris'));
    root.querySelectorAll('.steps > li')[1].addEventListener('input', () => this.sync(true));
    this.sync();
  }
  onShow() { if (this.src.get() === 'kat') this.picker.render(); }
  setSrc(v) {
    this.F.f('pick').hidden = v !== 'kat'; this.F.f('man').hidden = v !== 'el';
    if (v === 'el') { this.bcMode.set('fiz'); this.setManual(); } else { this.sat = null; this.F.f('info').textContent = ''; this.F.f('next1').disabled = true; this.steps.set(1, { done: false, summary: 'Katalogdan seçin' }); }
  }
  setManual() {
    const n = this.F.n, hp = Math.min(n('hp'), n('ha')), ha = Math.max(n('hp'), n('ha'));
    const ok = hp > 120 && Number.isFinite(ha) && n('inc') >= 0 && n('inc') <= 180;
    this.sat = ok ? { name: 'Elle tanımlı yörünge', hp, ha, inc: n('inc'), a: RE + (hp + ha) / 2, e: (ha - hp) / (2 * RE + hp + ha), bstar: null, manual: true } : null;
    this.info(); this.sync();
  }
  setSat(p) {
    const gp = this.ctx().sats && this.ctx().sats.gpRecord ? this.ctx().sats.gpRecord(p.id) : p.omm, q = perApo(p.omm), bstar = +(gp || p.omm).BSTAR;
    this.sat = { name: p.name, id: p.id, hp: q.hp, ha: q.ha, inc: q.inc, a: q.a, e: +p.omm.ECCENTRICITY, bstar: Number.isFinite(bstar) ? bstar : null, age: p.ageDays, group: p.group };
    this.bcMode.set(this.sat.bstar > 0 ? 'bstar' : 'fiz');
    this.info(); this.sync();
  }
  info() {
    const s = this.sat, box = this.F.f('info'); box.textContent = '';
    this.F.f('next1').disabled = !s; this.steps.set(1, { done: !!s, summary: s ? `${s.name} · ${fmt(s.hp)}×${fmt(s.ha)} km · ${fmt(s.inc, 1)}°` : 'Geçerli yörünge girin (perije > 120 km)' });
    this.steps.set(2, { enabled: !!s });
    if (!s) return;
    box.appendChild(mk('div', 'dname', s.name));
    box.appendChild(kvTable([['Yükseklik (perije × apoje)', `${fmt(s.hp)} × ${fmt(s.ha)} km`], ['Yarı büyük eksen / dışmerkezlik', `${fmt(s.a, 1)} km / ${fmt(s.e, 5)}`], ['Eğim', `${fmt(s.inc, 2)}°`],
      ['Periyot', `${fmt(2 * Math.PI * Math.sqrt(s.a ** 3 / MU) / 60, 2)} dk`], s.bstar != null ? ['B* (GP)', `${sci(s.bstar, 3)} 1/Rₑ`, s.bstar <= 0 ? 'warn' : null, 'SGP4 sürüklenme terimi; uydurma sonucudur, manevra ve hatayı da emer'] : null,
      s.age != null ? ['GP veri yaşı', `${fmt(s.age, 1)} gün`] : null]));
    if (s.hp > 1000) box.appendChild(mk('div', 'hint', 'Perije 1.000 km üstünde: sürüklenme çok zayıf, ömür yüzyıllarla ölçülür (hesap 100 yılla sınırlıdır).'));
  }
  bc() {
    const n = this.F.n;
    if (this.bcMode.get() === 'bstar' && this.sat && this.sat.bstar > 0) return { BC: bcFromBstar(this.sat.bstar), how: `B* = ${sci(this.sat.bstar, 3)} → BC = 0,157 / (2 B*)` };
    const BC = n('m') / (n('Cd') * n('A'));
    return { BC, how: `${fmt(n('m'))} kg / (${fmt(n('Cd'), 2)} × ${fmt(n('A'), 2)} m²)` };
  }
  sync(edited = false) {
    const fiz = this.bcMode.get() === 'fiz', sol = this.atm.get() === 'gunes';
    this.F.f('fiz').hidden = !fiz; this.F.f('sol').hidden = !sol;
    if (!fiz && !(this.sat && this.sat.bstar > 0)) this.F.f('bcTxt').textContent = 'Bu kayıtta pozitif B* yok: kütle ve alan girin.';
    const { BC, how } = this.bc(), ok = this.sat && BC > 0 && Number.isFinite(BC);
    if (fiz || (this.sat && this.sat.bstar > 0)) this.F.f('bcTxt').textContent = ok ? `BC = ${fmt(BC, BC < 10 ? 2 : 0)} kg/m² (${how}). Küçük BC: hafif ve geniş, hızlı düşer.` : 'Geçerli kütle, alan ve Cd girin.';
    this.F.f('run').disabled = !ok;
    if (this.sat) this.steps.set(2, { summary: ok ? `BC ${fmt(BC, BC < 10 ? 2 : 0)} kg/m² · ${sol ? 'F10.7 ' + [this.F.n('f1'), this.F.n('f2'), this.F.n('f3')].map((x) => fmt(x)).join('/') : 'durağan atmosfer'}` : 'BC girin' });
    if (edited && this.res) this.F.f('stale').hidden = false;
  }
  async run() {
    const s = this.sat; if (!s) return;
    const { BC } = this.bc(), n = this.F.n, model = this.atm.get(), st = this.F.f('status');
    const msg = { kind: 'reentry', a0: s.a, e0: s.e, BC, model, F107s: [n('f1'), n('f2'), n('f3')], Ap: n('Ap') || 15, inc: s.inc, rn: n('rn') || 1, gamma0: Math.min(-0.01, n('gam') || -0.1), maxYears: 100 };
    this.F.f('run').disabled = true; this.F.f('cancel').hidden = false; st.textContent = 'Yörünge bozunması tümleniyor…';
    try {
      const r = await labWork('giris', msg, (f) => { st.textContent = `Tümleniyor… %${fmt(100 * f)}`; });
      this.res = { ...r, BC, model, s, t0: this.ctx().clock.nowMs(), F107s: msg.F107s, mass: this.bcMode.get() === 'fiz' ? n('m') : null }; st.textContent = '';
      this.F.f('stale').hidden = true; this.render();
      this.steps.set(2, { done: true }); this.steps.set(3, { enabled: true, done: true }); this.steps.open(3);
    } catch (err) { st.textContent = err.message === 'iptal' ? 'Durduruldu.' : 'Hesap başarısız: ' + err.message; }
    this.F.f('cancel').hidden = true; this.F.f('run').disabled = false;
  }
  render() {
    const { runs, entry: en, band, BC, model, s, t0, mass } = this.res, box = this.F.f('out'); box.textContent = '';
    const mid = runs[Math.floor(runs.length / 2)], lives = runs.map((r) => r.lifeDays), fin = lives.filter(Number.isFinite);
    const day = 86400000, lo = Math.min(...lives), hi = Math.max(...lives);
    let title, d;
    if (!fin.length) { title = 'Yörünge ömrü 100 yıldan uzun'; d = 'Bu yükseklikte sürüklenme çok zayıf; cisim yüzyıllarca yörüngede kalır (25 yıl kuralını aşar: görev sonu yörünge indirme gerekir).'; }
    else {
      title = `Yörünge ömrü ≈ ${lifeTxt(mid.lifeDays)}`;
      d = runs.length > 1 ? `Güneş etkinliğine göre ${lifeTxt(lo)} – ${lifeTxt(hi)}: yeniden giriş ${dateTxt(t0 + lo * day)} ile ${Number.isFinite(hi) ? dateTxt(t0 + hi * day) : '100 yıl sonrası'} arasında (orta senaryo ${dateTxt(t0 + mid.lifeDays * day)}).`
        : `Tahmini yeniden giriş ${dateTxt(t0 + mid.lifeDays * day)} (durağan atmosfer; Güneş etkinliği ömrü birkaç kat değiştirebilir).`;
    }
    const vd = mk('div', 'verdict ' + (fin.length && mid.lifeDays < 365 ? 'bad' : 'info')); vd.append(mk('div', 'vt', title), mk('div', 'vd', d)); box.appendChild(vd);
    this.steps.set(3, { summary: title.replace('Yörünge ömrü ', 'Ömür ') });
    const rows = [{ head: 'Yörünge ve sürüklenme' }, ['Başlangıç yüksekliği', `${fmt(s.hp)} × ${fmt(s.ha)} km`], ['Balistik katsayı', `${fmt(BC, BC < 10 ? 2 : 0)} kg/m²`],
      ['Şu anki alçalma hızı', `${fmt(-mid.decayNowKmDay * 1000, mid.decayNowKmDay > -0.01 ? 2 : 0)} m/gün`, null, 'Yörünge ortalamalı da/dt (orta senaryo)'], { head: 'Ömür ve yeniden giriş tarihi' }];
    runs.forEach((r, k) => rows.push([r.F107 == null ? 'Durağan atmosfer' : `F10.7 = ${fmt(r.F107)} (${SCN[k] ? SCN[k][0] : ''})`, `${lifeTxt(r.lifeDays)} · ${Number.isFinite(r.lifeDays) ? dateTxt(t0 + r.lifeDays * day) : '—'}`]));
    rows.push({ head: '120 km\'den atmosfere giriş (balistik)' },
      ['Giriş hızı / açısı', `${fmt(en.track[0] ? en.track[0][2] : NaN, 3)} km/s / ${fmt(this.F.n('gam'), 2)}°`],
      ['En büyük yavaşlama', `${fmt(en.peakG, 1)} g (${fmt(en.peakGh, 1)} km)`, null, 'D/m = ρ v² / (2 BC)'],
      ['En büyük durma noktası ısı akısı', `${fmt(en.peakQ / 1e4, 1)} W/cm² (${fmt(en.peakQh, 1)} km)`, null, 'Sutton–Graves: q = 1,7415·10⁻⁴ √(ρ / rn) v³'],
      ['Toplam ısı yükü', `${fmt(en.heatLoad / 1e4 / 1000, 2)} kJ/cm²`],
      ['78 km\'ye (geleneksel parçalanma) varış', en.tBreak != null ? `${timeText(en.tBreak)} · ${fmt(en.sBreak)} km menzil · ${fmt(en.vBreak, 2)} km/s` : '—'],
      ['Yere ulaşma (bütün kalsaydı)', `${timeText(en.tGround)} · ${fmt(en.sGround)} km menzil · ${fmt(en.vGround * 1000)} m/s`, null, 'Parçalar uç hıza (onlarca–yüzlerce m/s) yavaşlar; menzil ayak izi uzunluğunu gösterir']);
    const iEff = Math.min(s.inc, 180 - s.inc), top = band.slice().sort((a, b) => b.p - a.p)[0];
    rows.push({ head: 'Düşme bölgesi' }, ['Enlem bandı', `±${fmt(iEff, 1)}° (yörünge eğimi)`], ['En olası enlemler', `${fmt(Math.abs(top.lo))}°–${fmt(Math.abs(top.hi))}° (K ve G), her biri %${fmt(100 * top.p, 1)}`, null, 'Dairesel yörüngede yer izi eğime yakın enlemlerde daha uzun kalır: p(φ) ∝ cosφ / √(sin²i − sin²φ)']);
    if (mass) rows.push(['Yere ulaşabilecek kütle (kaba)', `${fmt(0.1 * mass)} – ${fmt(0.4 * mass)} kg`, null, 'ESA deneyimi: tipik %10–40 (titanyum/çelik tanklar, optik); kalanı erir ve buharlaşır']);
    box.appendChild(kvTable(rows));
    this.charts(box);
    box.appendChild(mk('p', 'note', `Model: ${model === 'gunes' ? '180 km üstünde Güneş etkinliğine duyarlı (Jacchia tabanlı, Avustralya IPS yöntemi), 150 km altında Vallado durağan atmosferi' : 'Vallado (2013) durağan üstel atmosferi'}; yörünge ortalamalı Gauss denklemleri, sabit BC, dönmeyen atmosfer. Gelecekteki Güneş etkinliği bilinmediği için gerçek tahminler bile ±%10–20 belirsizlikle verilir (son günlerde birkaç saat). Giriş: tek cisim, kaldırma yok; gerçek parçalanma tasarıma bağlıdır.`));
  }
  charts(box) {
    const { runs, entry: en, band } = this.res, add = (label, opts) => { const c = mk('canvas', 'chart'); c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); box.appendChild(c); autoPlot(c, () => opts); };
    const yrs = Math.max(...runs.map((r) => r.curve[r.curve.length - 1][0])) > 730, sc = yrs ? 365.25 : 1;
    const ser = []; runs.forEach((r, k) => { const col = runs.length > 1 ? SCN[k][1] : PALETTE[1], lab = r.F107 == null ? 'durağan' : `F10.7 ${fmt(r.F107)}`; ser.push({ x: r.curve.map((p) => p[0] / sc), y: r.curve.map((p) => p[2]), color: col, dash: [4, 3] }, { x: r.curve.map((p) => p[0] / sc), y: r.curve.map((p) => p[1]), color: col, label: lab }); });
    add('Yörünge bozunması', { title: 'Yörünge bozunması (düz: perije, kesikli: apoje)', series: ser, hlines: [{ y: 120, label: 'yeniden giriş 120 km', color: '#e66767' }], xlabel: yrs ? 'Zaman (yıl)' : 'Zaman (gün)', ylabel: 'Yükseklik (km)', ymin: 100 });
    const bx = [], by = []; band.forEach((b) => { bx.push(b.lo, b.hi); by.push(100 * b.p, 100 * b.p); });
    add('Enlem dağılımı', { title: 'Yeniden giriş enlemi olasılığı (%, 5° dilim)', series: [{ x: bx, y: by, color: PALETTE[3] }], xlabel: 'Enlem (°)', ylabel: '%', ymin: 0, xmin: -90, xmax: 90 });
    const tr = en.track;
    add('Giriş: yükseklik – hız', { title: 'Giriş profili', series: [{ x: tr.map((p) => p[2]), y: tr.map((p) => p[1]), color: PALETTE[0] }], hlines: [{ y: 78, label: 'parçalanma ~78 km', color: '#f5b93a' }], xlabel: 'Hız (km/s)', ylabel: 'Yükseklik (km)', ymin: 0 });
    add('Giriş yükleri', { title: 'Yavaşlama (g) ve ısı akısı (W/cm²)', ylog: true, series: [{ x: tr.map((p) => p[1]), y: tr.map((p) => p[3]), color: PALETTE[4], label: 'yavaşlama (g)' }, { x: tr.map((p) => p[1]), y: tr.map((p) => p[4]), color: PALETTE[5], label: 'ısı akısı (W/cm²)' }], xlabel: 'Yükseklik (km)', ymin: 0.01, xmin: 0, xmax: 120 });
  }
}
