// Laboratuvar › Uydu ↔ uydu / çöp: birincil cisim + belirli ikincil cisim ya da filtreli aday listesi taraması (SGP4, iş parçacığında),
// en yakın yaklaşma (TCA), RTN kaçırma, karşılaşma düzlemi, çarpışma olasılığı (Foster; en kötü durum Alfano) ve çarpışırsa NASA parçalanma modeli.
import * as C from './conjunction.js';
import * as B from './breakup.js';
import { SatPicker } from './targetpick.js';
import { fmt } from './format.js';
import { mk, sci, lenText, kvTable, Steps, stepsHtml, numF, cardsHtml, bindCards, fields, labWork, labWorkCancel, autoPlot, PALETTE } from './labkit.js';

const utc = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const isRB = (name) => /R\/B|ROCKET|CZ-|SL-|DELTA|ATLAS|FALCON|ARIANE|PSLV|H-2A/i.test(name || '');
const isDeb = (p) => p.src === 'cop' || /DEB/.test(p.name || '');
// kaba kütle / sert cisim yarıçapı varsayımları (kullanıcı değiştirebilir)
function guess(p) {
  const n = (p.name || '').toUpperCase();
  if (/^ISS \(|ZARYA/.test(n)) return { m: 420000, R: 55, type: 'uydu' };
  if (/TIANGONG|CSS \(|TIANHE/.test(n)) return { m: 100000, R: 30, type: 'uydu' };
  if (isDeb(p)) return { m: 1, R: 0.5, type: isRB(n) ? 'roket' : 'uydu' };
  if (isRB(n)) return { m: 2000, R: 5, type: 'roket' };
  if (/STARLINK/.test(n)) return { m: 800, R: 5, type: 'uydu' };
  if (/ONEWEB/.test(n)) return { m: 150, R: 2, type: 'uydu' };
  if (p.period > 1300) return { m: 3000, R: 8, type: 'uydu' };
  if (p.period > 600) return { m: 1500, R: 5, type: 'uydu' };
  return { m: 500, R: 3, type: 'uydu' };
}

export default class ConjLab {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx; this.A = null; this.Bsel = null; this.found = null; this.ev = null;
    root.innerHTML = `<p class="labsub">İki uzay cisminin yakın geçişini inceleyin ya da bir uyduyu süzgeçle seçilen adaylara (örn. bir çöp bulutu) karşı tarayın. Yörüngeler CelesTrak GP verisinden SGP4 ile hesaplanır.</p>`
      + stepsHtml([
        { t: 'Birincil cisim', s: 'Ad ya da süzgeçle seçin', b: `<div data-f="pickA"></div><div data-f="infoA" class="dinfo"></div>` },
        { t: 'İkincil cisim ya da tarama', s: 'Önce birincil cismi seçin', b: cardsHtml('cjMode', [['tek', 'Belirli bir cisim', 'İki cismin pencere içindeki tüm yakın yaklaşmaları'], ['tara', 'Süzgeçli tarama', 'Süzgeçten geçen tüm adaylar taranır (ör. bir çöp bulutu, Starlink)']])
          + `<div data-f="pickB"></div>
          <div class="frow3">${numF('Pencere', 'hours', 24, 'saat', 'min="1" max="72"', 'Başlangıç: gökyüzü saatinin şu anı')}${numF('Eşik', 'gate', 10, 'km', 'min="0.1" max="200"', 'Taramada bu mesafeden yakın geçişler listelenir')}${numF('Kaba adım', 'dt', 30, 's', 'min="5" max="120"', 'Mesafe örnekleme adımı; en küçükler altın oran aramasıyla inceltilir')}</div>
          <div class="stepnav"><button type="button" class="primary" data-f="find" disabled>Yakın geçişleri bul</button><button type="button" class="sm" data-f="cancel" hidden>Durdur</button><span class="k small" data-f="status" role="status" aria-live="polite"></span></div>
          <div data-f="foundInfo" class="k small"></div><ul class="cas" data-f="events" role="radiogroup" aria-label="Yakın geçişler"></ul>
          <div class="stepnav"><button type="button" class="primary" data-f="next2" disabled>Bu geçişi değerlendir →</button></div>` },
        { t: 'Varsayımlar', s: 'Önce bir geçiş seçin', b: `<p class="stepsub">GP verisi kovaryans taşımaz: konum belirsizlikleri (1σ, RTN) varsayımdır. Varsayılanlar veri yaşıyla büyür (radyal 0,1 + 0,05·gün, iz boyu 0,5 + 1·gün, çapraz 0,1 + 0,05·gün km).</p>
          <div class="fttl" data-f="nA">Birincil</div><div class="frow3">${numF('σ radyal', 'sRa', 0.2, 'km', 'min="0.001"')}${numF('σ iz boyu', 'sTa', 1, 'km', 'min="0.001"')}${numF('σ çapraz', 'sNa', 0.2, 'km', 'min="0.001"')}${numF('Sert cisim yarıçapı', 'Ra', 5, 'm', 'min="0.01"')}${numF('Kütle', 'ma', 500, 'kg', 'min="0.001"')}<label>Tür<span><select data-f="ta"><option value="uydu">Uydu</option><option value="roket">Roket gövdesi</option></select></span></label></div>
          <div class="fttl" data-f="nB">İkincil</div><div class="frow3">${numF('σ radyal', 'sRb', 0.2, 'km', 'min="0.001"')}${numF('σ iz boyu', 'sTb', 1, 'km', 'min="0.001"')}${numF('σ çapraz', 'sNb', 0.2, 'km', 'min="0.001"')}${numF('Sert cisim yarıçapı', 'Rb', 1, 'm', 'min="0.01"')}${numF('Kütle', 'mb', 1, 'kg', 'min="0.001"')}<label>Tür<span><select data-f="tb"><option value="uydu">Uydu</option><option value="roket">Roket gövdesi</option></select></span></label></div>
          <div class="stepnav"><button type="button" class="primary" data-f="eval">Değerlendir</button></div>` },
        { t: 'Sonuç', s: 'Önce değerlendirin', b: `<div class="stale" data-f="stale" hidden>Varsayımlar değişti: sonuç eski. <button type="button" class="sm" data-f="reeval">Yeniden değerlendir</button></div><div data-f="out"></div>` },
      ]);
    this.F = fields(root);
    this.steps = new Steps(root.querySelector('.steps'));
    const getSats = () => this.ctx().sats;
    this.pickA = new SatPicker(this.F.f('pickA'), { getSats, onPick: (p) => this.setA(p), placeholder: 'Birincil: ad ya da NORAD (ör. ISS, 25544)' });
    this.pickB = new SatPicker(this.F.f('pickB'), { getSats, onPick: (p) => this.setB(p), placeholder: 'İkincil: ad ya da NORAD' });
    this.mode = bindCards(root, 'cjMode', () => this.syncMode());
    this.F.f('pickB').addEventListener('input', () => this.syncMode());
    this.F.f('pickB').addEventListener('click', () => setTimeout(() => this.syncMode()));
    this.F.f('find').addEventListener('click', () => this.find());
    this.F.f('cancel').addEventListener('click', () => labWorkCancel('yakin'));
    this.F.f('next2').addEventListener('click', () => this.steps.open(3));
    this.F.f('eval').addEventListener('click', () => this.evaluate());
    this.F.f('reeval').addEventListener('click', () => this.evaluate());
    this.F.f('events').addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (b) this.selectEvent(+b.dataset.ev); });
    root.querySelectorAll('.steps > li')[2].addEventListener('input', () => { if (this.res) this.F.f('stale').hidden = false; });
    this.syncMode();
  }
  onShow() { this.pickA.render(); this.pickB.render(); }
  setA(p) {
    this.A = p; const info = this.F.f('infoA'); info.textContent = '';
    info.appendChild(mk('div', 'dname', p.name));
    info.appendChild(kvTable([['NORAD / grup', `${p.id} · ${p.group}`], ['Yükseklik (perije × apoje)', `${fmt(p.hp)} × ${fmt(p.ha)} km`], ['Eğim / dışmerkezlik', `${fmt(p.inc, 2)}° / ${fmt(p.e, 5)}`],
      ['Periyot', `${fmt(p.period, 1)} dk`], ['GP veri yaşı', `${fmt(p.ageDays, 1)} gün`, p.ageDays > 7 ? 'warn' : null, 'SGP4 doğruluğu çağdan uzaklaştıkça bozulur (iz boyu ~1–3 km/gün)']]));
    this.steps.set(1, { done: true, summary: `${p.name} · ${fmt(p.hp)}×${fmt(p.ha)} km` }); this.steps.set(2, { enabled: true, summary: 'İkincil cisim ya da tarama' });
    // tarama için birincilin yükseklik bandına yakın adaylar öntanımlı
    this.syncMode(); this.steps.open(2);
  }
  setB(p) { this.Bsel = p; this.syncMode(); }
  syncMode() {
    const tara = this.mode.get() === 'tara';
    this.F.f('gate').closest('label').hidden = !tara;
    const rows = this.pickB.filtered();
    const ok = this.A && (tara ? rows && rows.length > 0 : !!this.Bsel);
    this.F.f('find').disabled = !ok;
    this.F.f('find').textContent = tara ? (rows ? `${fmt(rows.length)} adayı tara` : 'Adaylar yükleniyor…') : 'Yakın geçişleri bul';
  }
  async find() {
    const tara = this.mode.get() === 'tara', hours = Math.min(72, Math.max(1, this.F.n('hours') || 24)), dt = Math.min(120, Math.max(5, this.F.n('dt') || 30));
    const t0Ms = Math.round(this.ctx().clock.nowMs() / 1000) * 1000, st = this.F.f('status');
    this.F.f('find').disabled = true; this.F.f('cancel').hidden = false; st.textContent = 'SGP4 ile hesaplanıyor…'; this.F.f('events').textContent = ''; this.F.f('foundInfo').textContent = '';
    try {
      let r;
      if (tara) {
        const cands = this.pickB.filtered().map((x) => x.o);
        r = await labWork('yakin', { kind: 'conj-screen', primary: this.A.omm, cands, t0Ms, hours, gate: this.F.n('gate') || 10, dt }, (f) => { st.textContent = `Taranıyor… %${fmt(100 * f)}`; });
        this.F.f('foundInfo').textContent = `${fmt(r.total)} adaydan ${fmt(r.screened)}'i yükseklik bandıyla örtüşüyor (apoje/perije süzgeci); ${r.coorbital.length ? `${r.coorbital.length} eş yörüngeli/kenetli cisim ayıklandı (${r.coorbital.slice(0, 4).join(', ')}${r.coorbital.length > 4 ? '…' : ''}); ` : ''}${fmt(this.F.n('gate'))} km içinde ${fmt(r.nEvents)} yaklaşma${r.nEvents > r.events.length ? ` (en yakın ${r.events.length}'ı)` : ''}.`;
      } else {
        r = await labWork('yakin', { kind: 'conj-pair', a: this.A.omm, b: this.Bsel.omm, t0Ms, hours, dt: Math.min(dt, 20) });
        if (r.coorbital) this.F.f('foundInfo').textContent = 'İki cisim pencere boyunca 100 km içinde: kenetli ya da eş yörüngeli (oluşum uçuşu). Yakın geçiş analizi anlamlı değil.';
        else this.F.f('foundInfo').textContent = `${hours} saatte ${r.n} yerel en yakın yaklaşma; en yakın ${r.events.length}'ı listelendi.`;
        r.events.forEach((x) => { x.name = this.Bsel.name; x.norad = this.Bsel.id; x.omm = this.Bsel.omm; });
      }
      this.found = { ...r, t0Ms, tara }; st.textContent = '';
      this.list();
    } catch (err) { st.textContent = err.message === 'iptal' ? 'Durduruldu.' : 'Hesap başarısız: ' + err.message; }
    this.F.f('cancel').hidden = true; this.syncMode();
  }
  list() {
    const ul = this.F.f('events'), { events, t0Ms } = this.found; ul.textContent = '';
    if (!events.length) { ul.appendChild(mk('li', 'labempty', this.found.tara ? 'Bu pencerede eşik içinde yakın geçiş yok. Eşiği ya da pencereyi büyütün, süzgeci genişletin.' : 'Yakın yaklaşma bulunamadı.')); return; }
    events.forEach((x, i) => {
      const vRel = x.a && x.b ? Math.hypot(x.a.v[0] - x.b.v[0], x.a.v[1] - x.b.v[1], x.a.v[2] - x.b.v[2]) : NaN;
      const li = mk('li'), b = mk('button', 'cacard'); b.type = 'button'; b.dataset.ev = i; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
      b.append(mk('span', 'cd', utc(t0Ms + x.t * 1000)), mk('span', 'cm', lenText(x.miss * 1000)), mk('span', 'cs', `${x.name} · göreli hız ${fmt(vRel, 2)} km/s`));
      li.appendChild(b); ul.appendChild(li);
    });
    this.selectEvent(0);
  }
  selectEvent(i) {
    const x = this.found.events[i]; if (!x) return;
    this.ev = x; this.evIdx = i;
    this.F.f('events').querySelectorAll('[data-ev]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.ev === i)));
    this.F.f('next2').disabled = false;
    this.steps.set(2, { done: true, summary: `${x.name} · ${lenText(x.miss * 1000)} · ${utc(this.found.t0Ms + x.t * 1000).slice(5, 16)}` });
    this.steps.set(3, { enabled: true, summary: 'Belirsizlik, boyut ve kütle' });
    // varsayılan varsayımlar: veri yaşı (TCA'da) ve cisim türüne göre
    const tca = this.found.t0Ms + x.t * 1000, ageOf = (o) => Math.abs(tca - Date.parse(o.EPOCH + 'Z')) / 86400000;
    const pb = { name: x.name, src: this.pickB.src, period: x.omm ? 1440 / +x.omm.MEAN_MOTION : 100 };
    const set = (sfx, o, g) => { const a = ageOf(o); this.F.set('sR' + sfx, +(0.1 + 0.05 * a).toFixed(3)); this.F.set('sT' + sfx, +(0.5 + 1 * a).toFixed(2)); this.F.set('sN' + sfx, +(0.1 + 0.05 * a).toFixed(3)); this.F.set('R' + sfx, g.R); this.F.set('m' + sfx, g.m); this.F.f('t' + sfx).value = g.type; };
    set('a', this.A.omm, guess(this.A)); set('b', x.omm, guess(pb));
    this.F.f('nA').textContent = `Birincil: ${this.A.name}`; this.F.f('nB').textContent = `İkincil: ${x.name}`;
  }
  evaluate() {
    const x = this.ev, n = this.F.n; if (!x || !x.a || !x.b) return;
    const enc = C.encounter(x.a, x.b), Fa = enc.frameA, Fb = C.rtnFrame(x.b.r, x.b.v);
    const Ca = C.covFromRtn(Fa, n('sRa'), n('sTa'), n('sNa')), Cb = C.covFromRtn(Fb, n('sRb'), n('sTb'), n('sNb'));
    const Csum = Ca.map((row, i) => row.map((c, j) => c + Cb[i][j])), C2 = C.projectCov(Csum, enc.plane), R = (n('Ra') + n('Rb')) / 1000;
    const pc = C.pcFoster(enc.miss, C2, R), pmax = C.pcMax(enc.miss, C2, R);
    const det = C2[0][0] * C2[1][1] - C2[0][1] ** 2, dM = Math.sqrt(enc.miss * enc.miss * C2[1][1] / det);
    const coll = B.collision(n('ma'), n('mb'), enc.vRel);
    this.res = { x, enc, C2, R, pc, pmax, dM, coll, ma: n('ma'), mb: n('mb'), type: n('ma') >= n('mb') ? this.F.f('ta').value : this.F.f('tb').value, tca: this.found.t0Ms + x.t * 1000 };
    this.F.f('stale').hidden = true;
    this.render();
    this.steps.set(3, { done: true, summary: `R = ${fmt(R * 1000, 1)} m · σ iz boyu ${fmt(n('sTa'), 1)} / ${fmt(n('sTb'), 1)} km` });
    this.steps.set(4, { enabled: true, done: true }); this.steps.open(4);
  }
  render() {
    const { x, enc, C2, R, pc, pmax, dM, coll, tca } = this.res, box = this.F.f('out'); box.textContent = '';
    const cls = C.pcClass(pc), kind = cls === 'kirmizi' ? 'bad' : cls === 'sari' ? 'info' : 'good';
    const pcTxt = (p) => (p < 1e-30 ? '< 10⁻³⁰' : sci(p, 2));
    const vd = mk('div', 'verdict ' + kind);
    vd.append(mk('div', 'vt', `Pc = ${pcTxt(pc)}`), mk('div', 'vd', `${cls === 'kirmizi' ? 'Yüksek risk (≥ 10⁻⁴): kaçınma manevrası değerlendirilir.' : cls === 'sari' ? 'İzlenmeli (10⁻⁵ – 10⁻⁴): yeni ölçümlerle yeniden hesaplanır.' : 'Düşük risk (< 10⁻⁵).'} TCA ${utc(tca)}, kaçırma ${lenText(enc.miss * 1000)}, göreli hız ${fmt(enc.vRel, 2)} km/s. En kötü durum (kovaryans ölçeği bilinmiyor): ${pcTxt(pmax.pc)}.`));
    box.appendChild(vd);
    this.steps.set(4, { summary: `Pc ${pcTxt(pc)} · ${lenText(enc.miss * 1000)}`, kind: kind === 'bad' ? 'bad' : kind === 'good' ? 'good' : null });
    const sx = Math.sqrt(C2[0][0]), sz = Math.sqrt(C2[1][1]), rho = C2[0][1] / (sx * sz);
    box.appendChild(kvTable([
      { head: 'Geometri (TCA)' },
      ['En yakın yaklaşma anı (TCA)', utc(tca)], ['Kaçırma mesafesi', lenText(enc.miss * 1000), null, '|r₂ − r₁| (TCA\'da yerel en küçük)'],
      ['RTN bileşenleri (R / T / N)', enc.rtn.map((c) => `${fmt(c, 3)}`).join(' / ') + ' km', null, 'Birincil cismin radyal, iz boyu ve yörünge normali eksenlerinde ikincilin konumu'],
      ['Göreli hız', `${fmt(enc.vRel, 3)} km/s`], ['Yaklaşma açısı (hız vektörleri)', `${fmt(enc.approachAngle, 1)}°`, null, '180°: kafa kafaya, 0°: aynı yönde'],
      { head: 'Çarpışma olasılığı' },
      ['Birleşik sert cisim yarıçapı', `${fmt(R * 1000, 2)} m`], ['Karşılaşma düzleminde σx / σz / ρ', `${fmt(sx, 3)} / ${fmt(sz, 3)} km / ${fmt(rho, 3)}`, null, 'İki cismin kovaryans toplamının göreli hıza dik düzleme izdüşümü'],
      ['Mahalanobis uzaklığı', `${fmt(dM, 2)} σ`], ['Pc (Foster 1992)', pcTxt(pc), cls === 'kirmizi' ? 'bad' : cls === 'sari' ? 'warn' : null, '2B Gauss yoğunluğunun sert cisim diski üzerindeki tümlevi'],
      ['Pc en kötü durum (Alfano 2005)', `${pcTxt(pmax.pc)} (kovaryans × ${fmt(pmax.scale, 2)})`, null, 'Kovaryans büyüklüğü bilinmezken şekli korunarak ölçeklenir; Pc\'nin üst sınırı'],
      ['Seyrelme bölgesi', pmax.scale < 1 ? 'Evet: belirsizlik büyük, Pc küçük görünür (daha iyi ölçüm Pc\'yi artırabilir)' : 'Hayır: belirsizlik küçüldükçe Pc düşer', pmax.scale < 1 ? 'warn' : null],
      { head: 'Çarpışsaydı: NASA standart parçalanma modeli' },
      ['Hedef / çarpan kütlesi', `${fmt(coll.mT)} / ${fmt(coll.mP, coll.mP < 10 ? 2 : 0)} kg`], ['Özgül enerji (EMR)', `${fmt(coll.emr, coll.emr < 10 ? 2 : 0)} J/g`, coll.catastrophic ? 'bad' : null, 'EMR = ½ m_p v² / m_t; ≥ 40 J/g felaket'],
      ['Tür', coll.catastrophic ? 'Felaket: iki cisim de tümüyle parçalanır' : 'Felaket değil: çarpılan cisimde krater/kopma'],
      ['Parça sayısı ≥ 1 m / ≥ 10 cm / ≥ 1 cm', `${fmt(coll.N1m)} / ${fmt(coll.N10cm)} / ${sci(coll.N1cm, 2)}`, null, 'N(Lc) = 0,1 M^0,75 Lc^−1,71'], ['En büyük parça boyu', lenText(coll.Lmax)],
    ]));
    if (this.A.src === 'aktif') { const nav = mk('div', 'stepnav'), b = mk('button', 'sm', "3B'de TCA'ya git"); b.type = 'button'; b.addEventListener('click', () => this.goto3d()); nav.appendChild(b); box.appendChild(nav); }
    this.charts(box);
    box.appendChild(mk('p', 'note', 'Varsayımlar: kısa karşılaşma (TCA çevresinde doğrusal göreli hareket, sabit kovaryans), konum hataları bağımsız ve Gauss. SGP4/GP konumu birkaç km hatalı olabilir: operatörler kovaryanslı özel efemeris (CDM) kullanır. Parçalanma modeli büyük çarpışmalarda ≥ 10 cm parçaları ~2 kat az tahmin eder (Iridium–Cosmos: model ~1.200, kataloglanan ~2.300).'));
  }
  charts(box) {
    const { x, enc, C2, R, coll, ma, mb, type } = this.res, add = (label, opts, sq) => { const c = mk('canvas', 'chart' + (sq ? ' sq' : '')); c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); box.appendChild(c); autoPlot(c, () => opts); return c; };
    // karşılaşma düzlemi: kovaryans elipsleri (1σ, 3σ), sert cisim dairesi, kaçırma
    const ell = (k) => { const a = C2[0][0], b = C2[0][1], d = C2[1][1], tr = (a + d) / 2, dd = Math.sqrt(((a - d) / 2) ** 2 + b * b), l1 = tr + dd, l2 = Math.max(0, tr - dd), th = 0.5 * Math.atan2(2 * b, a - d), xs = [], ys = [];
      for (let i = 0; i <= 120; i++) { const u = (i / 120) * 2 * Math.PI, p = k * Math.sqrt(l1) * Math.cos(u), q = k * Math.sqrt(l2) * Math.sin(u); xs.push(enc.miss + p * Math.cos(th) - q * Math.sin(th)); ys.push(p * Math.sin(th) + q * Math.cos(th)); } return { xs, ys }; };
    const e1 = ell(1), e3 = ell(3), lim = Math.max(enc.miss, ...e3.xs.map(Math.abs), ...e3.ys.map(Math.abs)) * 1.1, circ = { x: [], y: [] };
    for (let i = 0; i <= 64; i++) { const u = (i / 64) * 2 * Math.PI; circ.x.push(R * Math.cos(u)); circ.y.push(R * Math.sin(u)); }
    add('Karşılaşma düzlemi', { title: 'Karşılaşma düzlemi (km)', series: [{ x: e3.xs, y: e3.ys, color: PALETTE[0], dash: [4, 4], label: '3σ' }, { x: e1.xs, y: e1.ys, color: PALETTE[0], label: '1σ' }, { x: circ.x, y: circ.y, color: '#e66767', width: 2 }, { x: [0], y: [0], dots: true, r: 3, color: '#e66767', label: 'birincil' }, { x: [enc.miss], y: [0], dots: true, r: 3, color: '#fff', label: 'ikincil (ortalama)' }],
      xmin: -lim, xmax: lim, ymin: -lim, ymax: lim, xlabel: 'kaçırma yönü (km)', ylabel: 'dik yön (km)' }, true);
    if (x.curve && x.curve.length) add('TCA çevresinde uzaklık', { title: 'TCA çevresinde uzaklık', series: [{ x: x.curve.map((p) => p[0]), y: x.curve.map((p) => p[1]), color: PALETTE[1] }], xlabel: 'TCA\'ya göre zaman (s)', ylabel: 'km', ymin: 0 });
    // Pc – kovaryans ölçeği (seyrelme eğrisi)
    const ks = [], ps = [];
    for (let i = 0; i <= 60; i++) { const k = 10 ** (-2 + (i * 4) / 60); ks.push(k); ps.push(Math.max(1e-30, C.pcFoster(enc.miss, C2.map((r) => r.map((c) => c * k * k)), R, 24, 36))); }
    add('Pc – kovaryans ölçeği', { title: 'Pc – belirsizlik ölçeği (seyrelme)', xlog: true, ylog: true, series: [{ x: ks, y: ps, color: PALETTE[3] }], vlines: [{ x: 1, label: 'varsayım' }, { x: this.res.pmax.scale, label: 'en kötü', color: '#e66767' }], hlines: [{ y: 1e-4, label: '10⁻⁴', color: '#e66767' }], xlabel: 'Kovaryans ölçeği k (σ × k)', ylabel: 'Pc', ymin: Math.max(1e-30, Math.min(...ps)) });
    // parça bulutu: N(Lc) ve Gabbard çizelgesi
    const Ls = [], Ns = []; for (let i = 0; i <= 40; i++) { const L = 10 ** (-2 + (i * Math.log10(coll.Lmax / 0.01)) / 40); Ls.push(L); Ns.push(coll.N(L)); }
    add('Parça sayısı – boyut', { title: 'Birikimli parça sayısı N(≥ Lc)', xlog: true, ylog: true, series: [{ x: Ls.map((l) => l * 100), y: Ns, color: PALETTE[4] }], vlines: [{ x: 10, label: 'kataloglanabilir (~10 cm)' }], xlabel: 'Karakteristik boy Lc (cm)', ylabel: 'N' });
    const nS = Math.min(1500, Math.max(50, Math.round(coll.N10cm))), frags = B.sampleFragments({ n: nS, LcMin: 0.1, LcMax: Math.max(0.11, coll.Lmax), type, kind: 'carpisma', seed: 19 });
    const mT = ma + mb, vcm = [0, 1, 2].map((k) => (ma * x.a.v[k] + mb * x.b.v[k]) / mT);
    const g = B.gabbard(frags, x.a.r, vcm).filter((q) => !q.escape && q.hp > -6378), P = g.map((q) => q.P);
    // eksenler parçaların %96'sını kapsar: birkaç km/s ayrılma hızı alan uç parçalar (çok yüksek apoje) bulutu ezmesin
    const qt = (arr, f) => { const a = arr.slice().sort((p, q) => p - q); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; };
    const pMax = qt(P, 0.96), haMax = qt(g.map((q) => q.ha), 0.96), out = g.filter((q) => q.P > pMax || q.ha > haMax).length;
    add('Gabbard çizelgesi', { title: `Gabbard çizelgesi (${fmt(nS)} örnek parça ≥ 10 cm)`, series: [{ x: P, y: g.map((q) => q.ha), dots: true, r: 1.4, color: PALETTE[1], label: 'apoje' }, { x: P, y: g.map((q) => q.hp), dots: true, r: 1.4, color: PALETTE[0], label: 'perije' }],
      hlines: [{ y: 120, label: 'yeniden giriş ~120 km', color: '#e66767' }], xmin: qt(P, 0.0) * 0.98, xmax: pMax * 1.01, ymin: Math.min(0, qt(g.map((q) => q.hp), 0.02)), ymax: haMax * 1.05, xlabel: `Periyot (dk)${out ? ` · ${out} parça eksen dışında` : ''}`, ylabel: 'Yükseklik (km)' });
    const reent = g.filter((q) => q.hp < 120).length;
    box.appendChild(mk('p', 'note', `Örnek parçaların ${fmt(100 * reent / Math.max(1, g.length))}%'inin perijesi 120 km altında (hemen yeniden girer); ${fmt(100 * (1 - g.length / frags.length))}%'i kaçış ya da yüzey altı yörüngede. Ayrılma hızları log-normal (ortalama 0,9χ + 2,9, χ = log₁₀ A/M), yönler eşyönlü; parçalar çarpışma anındaki kütle merkezi hızından ayrılır.`));
  }
  // 3B: gökyüzü saatini TCA'dan 90 s önceye al ve birincili izle
  goto3d() {
    const c = this.ctx(); c.clock.jump(this.res.tca - 90e3); c.clock.setRate(1); if (c.skyui) c.skyui.syncClock();
    c.followSat(this.A.id, 80);
  }
}
