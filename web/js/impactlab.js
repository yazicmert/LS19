// Laboratuvar › Asteroit → Dünya: katalogdan (filtre/ad) ya da elle tanımlanan bir cismin varsayımsal çarpması.
// Fizik: impacteffects.js (Collins, Melosh & Marcus 2005). Karşılaşma hızı: Sentry v∞ ya da Öpik (a, e, i) — v_çarpma = √(v∞² + v_kaçış²).
import { scenario, damageRadii, overpressure, thermal, MT, KT, PROJECTILES, TARGETS, THERMAL_THRESH, BLAST_DAMAGE } from './impacteffects.js';
import { AstPicker } from './targetpick.js';
import { fmt } from './format.js';
import { mk, sci, esc, energyText, lenText, timeText, pctText, kvTable, Steps, stepsHtml, numF, cardsHtml, bindCards, fields, autoPlot, PALETTE } from './labkit.js';

const VE = 29.78, VESC = 11.19;                                                         // Dünya yörünge hızı, kaçış hızı (km/s)
// Öpik karşılaşma hızı (Dünya dairesel yörüngede, yörüngeler kesişirse): U² = 3 − 1/a − 2√(a(1−e²)) cos i  (Dünya yörünge hızı biriminde)
export function opikVinf(a, e, iDeg) { const U2 = 3 - 1 / a - 2 * Math.sqrt(Math.max(0, a * (1 - e * e))) * Math.cos(iDeg * Math.PI / 180); return Math.sqrt(Math.max(0, U2)) * VE; }
export const vImpact = (vinf) => Math.sqrt(vinf * vinf + VESC * VESC);
// tayf türünden yoğunluk önerisi (yığın yoğunluğu; C türü gözenekli, S/V türü taşlı, M türü metal zengini olabilir)
function densityHint(spec) {
  const s = (spec || '').trim().toUpperCase()[0];
  if (!s) return null;
  if ('CBDPFGT'.includes(s)) return { k: 'gozenekli', why: `${spec} türü (karbonlu/ilkel): gözenekli kaya` };
  if ('SQVAKLRO'.includes(s)) return { k: 'kaya', why: `${spec} türü (taşlı): yoğun kaya` };
  if (s === 'M') return { k: 'demir', why: `${spec} türü (metalik olabilir): demir` };
  return { k: 'kaya', why: `${spec} türü: yoğun kaya varsayıldı` };
}
const kPa = (p) => (p >= 1000 ? `${fmt(p / 1000, p >= 1e5 ? 0 : 1)} kPa` : `${fmt(p)} Pa`);

export default class ImpactLab {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx; this.ast = null; this.res = null;
    root.innerHTML = `<p class="labsub">Bir asteroit Dünya'ya çarpsaydı ne olurdu? Atmosferde parçalanma ya da hava patlaması, krater, ısı, şok dalgası, deprem ve ejekta — Collins, Melosh & Marcus (2005) Dünya Çarpma Etkileri modeliyle.</p>`
      + stepsHtml([
        { t: 'Çarpan', s: 'Katalogdan seçin ya da elle tanımlayın', b: cardsHtml('imSrc', [['kat', 'Katalogdan', 'JPL SBDB: sınıf, PHA, Sentry, çap ve MOID süzgeçleri ya da adla'], ['el', 'Elle tanımla', 'Çap, yoğunluk ve hızı kendiniz girin']])
          + `<div data-f="pick"></div><div data-f="astInfo" class="dinfo"></div><div class="stepnav"><button type="button" class="primary" data-f="next1" disabled>Çarpma koşullarına geç →</button></div>` },
        { t: 'Çarpma koşulları', s: '', b: `<div class="fttl">Cisim</div><div class="frow3 two">${numF('Çap', 'L0', 50, 'm', 'min="0.1"')}${numF('Yoğunluk', 'rho', 3000, 'kg/m³', 'min="100" max="20000"')}</div>
          <div class="chips" data-f="ptypes">${Object.entries(PROJECTILES).map(([k, p]) => `<button type="button" class="chip" data-pt="${k}" title="${p.rho} kg/m³">${p.ad}</button>`).join('')}</div><div class="k small" data-f="rhoHint"></div>
          <div class="fttl">Giriş</div><div class="frow3 two">${numF('Hız (atmosfer üstü)', 'v', 20, 'km/s', 'min="11.2" max="72"', 'Dünya çekimiyle hızlanmış giriş hızı: √(v∞² + 11,19²); fiziksel aralık 11,2–72 km/s')}${numF('Giriş açısı', 'theta', 45, '°', 'min="1" max="90"', 'Yataydan; en olası değer 45° (olasılık ∝ sin 2θ)')}</div>
          <div class="chips" data-f="vsrc"></div>
          <div class="fttl">Hedef ve gözlemci</div><div class="frow3 two"><label>Hedef zemin<span><select data-f="target">${Object.entries(TARGETS).map(([k, t]) => `<option value="${k}">${t.ad}</option>`).join('')}</select></span></label>
          ${numF('Su derinliği', 'depth', 3700, 'm', 'min="1"', 'Okyanus ortalaması ~3,7 km')}${numF('Gözlemcinin uzaklığı', 'rKm', 50, 'km', 'min="0.1" max="20000"', 'Çarpma/patlama noktasının yerdeki izdüşümüne uzaklık')}</div>
          <div class="stepnav"><button type="button" class="primary" data-f="run">Hesapla</button></div>` },
        { t: 'Sonuç', s: 'Önce hesaplayın', b: `<div class="stale" data-f="stale" hidden>Girdiler değişti: sonuç eski. <button type="button" class="sm" data-f="rerun">Yeniden hesapla</button></div><div data-f="out"></div>` },
      ]);
    this.F = fields(root);
    this.steps = new Steps(root.querySelector('.steps'));
    this.src = bindCards(root, 'imSrc', (v) => this.setSrc(v));
    this.picker = new AstPicker(this.F.f('pick'), { getAsts: () => this.ctx().asts, onPick: (a) => this.setAst(a), preset: {} });
    this.F.f('ptypes').addEventListener('click', (e) => { const b = e.target.closest('[data-pt]'); if (b) { this.F.set('rho', PROJECTILES[b.dataset.pt].rho); this.syncInputs(); } });
    this.F.f('vsrc').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { this.F.set('v', b.dataset.v); this.syncInputs(); } });
    this.F.f('next1').addEventListener('click', () => this.steps.open(2));
    this.F.f('run').addEventListener('click', () => this.run());
    this.F.f('rerun').addEventListener('click', () => this.run());
    this.F.f('target').addEventListener('change', () => this.syncInputs());
    root.querySelector('.steps').addEventListener('input', (e) => { if (e.target.closest('[data-f="pick"]')) return; if (e.target.matches('input[data-f]')) this.syncInputs(); });
    this.syncInputs();
  }
  onShow() { if (this.src.get() === 'kat') this.picker.render(); }
  setSrc(v) {
    this.F.f('pick').hidden = v !== 'kat'; this.F.f('astInfo').hidden = v !== 'kat';
    if (v === 'el') { this.ast = null; this.F.f('next1').disabled = false; this.steps.set(1, { done: true, summary: 'Elle tanımlı cisim' }); this.steps.set(2, { enabled: true }); this.F.f('vsrc').innerHTML = ''; this.F.f('rhoHint').textContent = ''; this.steps.open(2); }
    else { this.F.f('next1').disabled = !this.ast; this.steps.set(1, { done: !!this.ast, summary: this.ast ? this.ast.name : 'Katalogdan seçin' }); if (this.ast) this.setAst(this.ast); }
  }
  setAst(a) {
    this.ast = a;
    const vOp = opikVinf(a.a, a.e, a.inc), vS = a.sentry && +a.sentry.v_inf > 0 ? +a.sentry.v_inf : null, q = a.a * (1 - a.e);
    const info = this.F.f('astInfo'); info.textContent = '';
    info.appendChild(mk('div', 'dname', a.name));
    info.appendChild(kvTable([
      ['Sınıf', a.clsTr + (a.pha ? ' · PHA' : '')], ['Çap', `${a.Dmeas ? '' : '≈ '}${lenText(a.D)}${a.Dmeas ? ' (ölçülmüş)' : ` (H = ${fmt(a.H, 2)} ve albedo ${fmt(a.alb > 0 ? a.alb : 0.14, 2)} varsayımıyla)`}`],
      ['Tayf türü', a.spec || '—'], ['Yörünge a / e / i', `${fmt(a.a, 3)} AB / ${fmt(a.e, 3)} / ${fmt(a.inc, 2)}°`], ['Günberi q', `${fmt(q, 3)} AB`],
      ['MOID', a.moid != null ? `${fmt(a.moid, 5)} AB = ${fmt(a.moid * 149597870.7 / 384400, 2)} Ay uzaklığı` : '—', null, 'Dünya yörüngesine en küçük uzaklık: çarpma için gerekli (yeterli değil) koşul ~0'],
      ['Öpik karşılaşma hızı v∞', `${fmt(vOp, 2)} km/s`, null, 'U² = 3 − 1/a − 2√(a(1−e²)) cos i (Dünya yörünge hızı biriminde); yörüngeler kesişiyor varsayımıyla'],
      a.sentry ? ['Sentry', `P = ${sci(+a.sentry.ip, 2)} · Palermo ${a.sentry.ps_cum} · Torino ${a.sentry.ts_max} · ${a.sentry.range}${vS ? ` · v∞ ${fmt(vS, 2)} km/s` : ''}`, 'warn', 'JPL Sentry: olası çarpma yılları ve toplam olasılık'] : null,
    ]));
    // çap, yoğunluk ve hız önerileri
    this.F.set('L0', +a.D.toPrecision(3));
    const dh = densityHint(a.spec), ptype = dh ? dh.k : 'kaya';
    this.F.set('rho', PROJECTILES[ptype].rho);
    this.F.f('rhoHint').textContent = dh ? `Öneri: ${dh.why} (${PROJECTILES[ptype].rho} kg/m³)` : 'Tayf türü bilinmiyor: yoğun kaya (3000 kg/m³) varsayıldı';
    const chips = [];
    if (vS) chips.push([vImpact(vS), `Sentry: ${fmt(vImpact(vS), 1)} km/s`, 'JPL Sentry v∞ + Dünya çekimi']);
    chips.push([vImpact(vOp), `Öpik: ${fmt(vImpact(vOp), 1)} km/s`, 'a, e, i\'den karşılaşma hızı + Dünya çekimi']);
    this.F.f('vsrc').innerHTML = chips.map(([v, t, tip]) => `<button type="button" class="chip" data-v="${v.toFixed(2)}" title="${esc(tip)}">${t}</button>`).join('');
    this.F.set('v', chips[0][0].toFixed(2));
    this.F.f('next1').disabled = false;
    this.steps.set(1, { done: true, summary: `${a.name} · ${a.Dmeas ? '' : '≈ '}${lenText(a.D)}` }); this.steps.set(2, { enabled: true });
    this.syncInputs();
  }
  params() { const n = this.F.n; return { L0: n('L0'), rhoI: n('rho'), v0: n('v') * 1000, thetaDeg: n('theta'), target: this.F.f('target').value, depth: n('depth'), rKm: n('rKm') }; }
  syncInputs() {
    const p = this.params(), isWater = p.target === 'su';
    this.F.f('depth').closest('label').hidden = !isWater;
    this.root.querySelectorAll('[data-pt]').forEach((b) => b.classList.toggle('on', PROJECTILES[b.dataset.pt].rho === p.rhoI));
    this.root.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.v - p.v0 / 1000) < 0.006));
    const err = !(p.L0 > 0) ? 'Çap girin.' : !(p.rhoI >= 100) ? 'Yoğunluk girin.' : !(p.v0 >= 11e3 && p.v0 <= 73e3) ? 'Hız 11,2–72 km/s aralığında olmalı (Dünya çekimiyle en az kaçış hızı).' : !(p.thetaDeg > 0 && p.thetaDeg <= 90) ? 'Açı 1–90° olmalı.' : !(p.rKm > 0) ? 'Gözlemci uzaklığı girin.' : isWater && !(p.depth > 0) ? 'Su derinliği girin.' : '';
    this.F.f('run').disabled = !!err; this.F.f('run').title = err;
    const m = Math.PI / 6 * p.rhoI * p.L0 ** 3, E = 0.5 * m * p.v0 ** 2;
    this.steps.set(2, { summary: err || `${lenText(p.L0)} · ${fmt(p.v0 / 1000, 1)} km/s · ${fmt(p.thetaDeg)}° · ${sci(E / MT, 2)} Mt` });
    if (this.res) this.F.f('stale').hidden = false;
  }
  run() {
    const p = this.params(), s = scenario(p);
    this.res = { p, s }; this.F.f('stale').hidden = true;
    this.render();
    this.steps.set(2, { done: true }); this.steps.set(3, { enabled: true, done: true }); this.steps.open(3);
  }
  render() {
    const { p, s } = this.res, e = s.entry, cr = s.crater, box = this.F.f('out'); box.textContent = '';
    const rad = damageRadii(s, p), rOf = (txt) => { const x = rad.find((d) => d.txt === txt); return x && x.r; };
    let kind, title;
    if (e.regime === 'hava') { kind = 'info'; title = `Hava patlaması · ${fmt(e.zb / 1000, 1)} km yükseklikte`; }
    else if (e.regime === 'carpma') { kind = 'bad'; title = `Parçalanarak çarpma · ${lenText(cr.Dfr)} krater`; }
    else { kind = 'bad'; title = `Bütün hâlde çarpma · ${lenText(cr.Dfr)} krater`; }
    const wood = rOf(BLAST_DAMAGE[8][1]), glass = rOf(BLAST_DAMAGE[11][1]);
    this.steps.set(3, { summary: `${title.split(' · ')[0]} · ${sci(e.E0Mt, 2)} Mt`, kind: kind === 'bad' ? 'bad' : null });
    const vd = mk('div', 'verdict ' + kind); vd.append(mk('div', 'vt', title),
      mk('div', 'vd', `Kinetik enerji ${energyText(e.E0)} (Hiroşima ≈ 0,015 Mt). Bu büyüklükte bir çarpma Dünya'da ortalama ${s.recurrence < 1 ? 'yılda birkaç kez' : `~${sci(s.recurrence, 2)} yılda bir`} olur.`
        + (wood ? ` Ahşap binalar ${lenText(wood)}, cam pencereler ${glass ? lenText(glass) : '—'} yarıçapına kadar etkilenir.` : '')));
    box.appendChild(vd);
    // ---- tablolar
    const rows = [
      { head: 'Çarpan' },
      ['Çap / yoğunluk', `${lenText(p.L0)} / ${fmt(p.rhoI)} kg/m³`], ['Kütle', `${sci(e.mass, 3)} kg`], ['Giriş hızı ve açısı', `${fmt(p.v0 / 1000, 2)} km/s, ${fmt(p.thetaDeg)}°`],
      ['Kinetik enerji', energyText(e.E0), null, 'E = ½ m v²'], ['Ortalama yineleme süresi', s.recurrence < 1 ? '< 1 yıl' : `${sci(s.recurrence, 2)} yıl`, null, 'Bland & Artemieva (2006) akı bağıntısı'],
      { head: 'Atmosfere giriş' },
      ['Cisim dayanımı Yi', `${sci(e.Yi, 3)} Pa`, null, 'Yi = 10^(2,107 + 0,0624 √ρ) (Eq. 10)'], ['Parçalanma parametresi If', sci(e.If, 3), null, 'If ≥ 1 ise cisim parçalanmadan yere ulaşır (Eq. 12)'],
    ];
    if (e.breakup) {
      rows.push(['Parçalanma yüksekliği z*', `${fmt(e.zStar / 1000, 1)} km`, null, 'Dinamik basınç dayanımı aştığında (Eq. 11)'], ['Parçalanmada hız v*', `${fmt(e.vStar / 1000, 2)} km/s`]);
      if (e.regime === 'hava') rows.push(['Hava patlaması yüksekliği', `${fmt(e.zb / 1000, 2)} km`, 'hl', 'Gözleme bulutu çapı 7 L₀ olduğunda (Eq. 18)'], ['Patlamada hız', `${fmt(e.vb / 1000, 2)} km/s`]);
      else rows.push(['Yere çarpma hızı', `${fmt(e.vI / 1000, 2)} km/s`], ['Yerdeki parça bulutu çapı', lenText(e.Lsurf)]);
    } else rows.push(['Yere çarpma hızı', `${fmt(e.vI / 1000, 2)} km/s`, null, e.terminal ? 'Uç (limit) hıza yavaşladı' : 'Sürüklenmeyle yavaşlama (Eq. 8)']);
    rows.push(['Atmosferde bırakılan enerji', `${sci(e.Eatm / MT, 3)} Mt (${pctText(e.Eatm / e.E0)})`], ['Yüzeye ulaşan enerji', `${sci(e.Esurf / MT, 3)} Mt (${pctText(e.Esurf / e.E0)})`]);
    if (cr) {
      rows.push({ head: 'Krater' },
        ['Geçici krater çapı / derinliği', `${lenText(cr.Dtc)} / ${lenText(cr.dtc)}`, null, 'Pi-ölçekleme (Schmidt & Housen 1987)'], ['Son krater çapı / derinliği', `${lenText(cr.Dfr)} / ${lenText(cr.dfr)}`, 'hl'],
        ['Krater türü', (cr.complex ? 'Karmaşık (merkez tepeli; D > 3,2 km)' : 'Basit (çanak)') + (cr.field ? ' · parça bulutu geniş: krater alanı (en büyük parçanınki)' : '')], ['Kenar yüksekliği', lenText(cr.rim)], ['Breş merceği kalınlığı', cr.breccia ? lenText(cr.breccia) : '—'],
        ['Ergiyik hacmi', cr.Vmelt > 0 ? `${sci(cr.Vmelt, 3)} km³ (${pctText(cr.meltFrac)} geçici krater hacminin)` : 'ihmal edilebilir (v < 12 km/s)']);
      if (cr.water) rows.push(['Deniz tabanına çarpma hızı', `${fmt(cr.water.vSea / 1000, 2)} km/s`], ['Su "krateri" çapı', lenText(cr.water.Dwater)]);
    }
    rows.push({ head: `Gözlemci konumunda (${fmt(p.rKm, p.rKm < 10 ? 1 : 0)} km)` });
    const th = s.thermal;
    if (th && !th.below) {
      const sc = (th.EMt) ** (1 / 6), burns = THERMAL_THRESH.filter(([, j]) => th.phi >= j * sc).map(([t]) => t);
      rows.push(['Ateş topu yarıçapı / görünen kesir', `${lenText(th.Rf)} / ${pctText(th.visible)}`], ['Işınım enerjisi', `${sci(th.phi, 3)} J/m²`, burns.length ? 'bad' : null, 'φ = f η E / (2π r²), η = 3·10⁻³'],
        ['Işınım süresi / akı', `${timeText(th.tau)} / ${fmt(th.solar, th.solar < 10 ? 1 : 0)} × Güneş`], ['Isı etkisi', burns.length ? burns[0] : 'Belirgin yanık yok']);
    } else rows.push(['Isı', th && th.below ? 'Ateş topu ufkun altında' : e.regime === 'hava' ? 'Hava patlaması: belirgin ateş topu ısısı modellenmez' : 'Ateş topu yok (çarpma hızı < 15 km/s)']);
    if (s.seismic) rows.push(['Deprem büyüklüğü (Richter)', fmt(s.seismic.M, 1), null, 'M = 0,67 log₁₀E − 5,87 (Eq. 40)'], ['Etkin büyüklük / Mercalli', `${fmt(s.seismic.Meff, 1)} / ${s.seismic.mmi}`, s.seismic.Meff >= 5 ? 'warn' : null], ['Sismik dalga varışı', timeText(s.seismic.arrival)]);
    if (s.ejecta) rows.push(s.ejecta.inside ? ['Ejekta', 'Gözlemci krater içinde'] : ['Ejekta kalınlığı / ortalama parça', `${lenText(s.ejecta.thickness)} / ${lenText(s.ejecta.dFrag)}`], ...(s.ejecta.inside ? [] : [['Ejekta varışı', timeText(s.ejecta.arrival)]]));
    const b = s.blast;
    rows.push(['Hava şoku aşırı basıncı', kPa(b.p), b.p >= 6900 ? 'bad' : null], ['En yüksek rüzgâr', `${fmt(b.wind, b.wind < 10 ? 1 : 0)} m/s`, null, 'Eq. 57'], ['Ses düzeyi', `${fmt(b.db)} dB`], ['Şok dalgası varışı', timeText(b.arrival)],
      ['Hasar', b.effects.length ? b.effects.slice(0, 3).join(' · ') : 'Yapısal hasar beklenmez']);
    if (s.tsunami) rows.push(['Tsunami genliği', `${lenText(s.tsunami.lower)} – ${lenText(s.tsunami.upper)}`, 'warn'], ['Tsunami varışı', timeText(s.tsunami.arrival)]);
    rows.push({ head: 'Küresel' }, ['Dünya momentumuna oran', sci(s.global.linMomRatio, 2)], ['Gün uzunluğu değişimi (en çok)', `${sci(s.global.dayChangeS, 2)} s`]);
    box.appendChild(kvTable(rows));
    // ---- hasar yarıçapları
    const dl = rad.filter((d) => d.r);
    if (dl.length) {
      const det = mk('details', 'adv'), sm = mk('summary', null, `Hasar yarıçapları (${dl.length} eşik)`), t = mk('table', 'tbl kv2 radii');
      for (const d of dl.sort((x, y) => x.r - y.r)) { const tr = mk('tr'); tr.append(mk('td', null, `${d.kind}: ${d.txt}`), mk('td', 'num', lenText(d.r))); t.appendChild(tr); }
      det.append(sm, t, mk('p', 'note', 'Hava şoku: Glasstone & Dolan (1977) aşırı basınç ve rüzgâr eşikleri; ısı: 1 Mt için yanık eşikleri E^(1/6) ile ölçeklenir; sismik: etkin büyüklüğün uzaklıkla azalması (Collins vd. 2005 Eq. 41).'));
      box.appendChild(det);
    }
    if (this.ast && !this.ast.Dmeas && this.ast.H != null) box.appendChild(this.albedoTable(p));
    this.charts(box, p, s);
    box.appendChild(mk('p', 'note', 'Model: üstel atmosfer (ölçek yüksekliği 8 km), gözleme (pancake) parçalanması, pi-ölçekli krater, Glasstone & Dolan hasar eşikleri. Sonuçlar büyüklük sırası doğruluğundadır (Collins vd. 2005); atmosfer yoğunluk profili, cismin iç yapısı ve parçalanma ayrıntısı belirsizlikleri büyüktür. Asteroidin gerçekten çarpacağı anlamına gelmez: varsayımsal senaryodur.'));
  }
  // H'den çap belirsizliği: albedo 0,05–0,25 aralığı
  albedoTable(p) {
    const H = this.ast.H, wrap = mk('div'); wrap.appendChild(mk('div', 'fttl', 'Çap belirsizliği (yalnız H biliniyor)'));
    const t = mk('table', 'tbl cmp'), hd = mk('tr'); ['Albedo', 'Çap', 'Enerji', 'Sonuç'].forEach((x, i) => hd.appendChild(mk('th', i ? 'num' : null, x))); t.appendChild(hd);
    for (const alb of [0.05, 0.14, 0.25]) {
      const D = 1329e3 / Math.sqrt(alb) * 10 ** (-H / 5), s = scenario({ ...p, L0: D }), e = s.entry, tr = mk('tr');
      tr.append(mk('td', null, fmt(alb, 2)), mk('td', 'num', lenText(D)), mk('td', 'num', `${sci(e.E0Mt, 2)} Mt`), mk('td', 'num', e.regime === 'hava' ? `hava patlaması ${fmt(e.zb / 1000, 1)} km` : `krater ${lenText(s.crater.Dfr)}`));
      t.appendChild(tr);
    }
    wrap.appendChild(t); wrap.appendChild(mk('p', 'note', 'D = 1329 km / √albedo · 10^(−H/5). Karanlık (karbonlu) yüzeyler aynı parlaklıkta daha büyük cisim demektir.'));
    return wrap;
  }
  charts(box, p, s) {
    const e = s.entry, add = (label, opts) => { const c = mk('canvas', 'chart'); c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); box.appendChild(c); autoPlot(c, () => opts); };
    const pr = e.profile;
    add('Giriş profili: hız – yükseklik', { title: 'Giriş profili', series: [{ x: pr.map((q) => q[1] / 1000), y: pr.map((q) => q[0] / 1000), color: PALETTE[0] }], hlines: e.breakup ? [{ y: e.zStar / 1000, label: 'parçalanma', color: PALETTE[1] }, ...(e.regime === 'hava' ? [{ y: e.zb / 1000, label: 'hava patlaması', color: '#e66767' }] : [])] : [], xlabel: 'Hız (km/s)', ylabel: 'Yükseklik (km)', ymin: 0 });
    // enerji bırakma eğrisi: dE/dz (kt/km)
    const dep = { x: [], y: [] };
    for (let i = 1; i < pr.length; i++) { const dz = (pr[i - 1][0] - pr[i][0]) / 1000; if (dz <= 0) continue; const dE = 0.5 * e.mass * (pr[i - 1][1] ** 2 - pr[i][1] ** 2) / KT; dep.x.push(Math.max(1e-9, dE / dz)); dep.y.push(0.5 * (pr[i - 1][0] + pr[i][0]) / 1000); }
    if (dep.x.some((x) => x > 1e-6)) add('Enerji bırakma eğrisi', { title: 'Enerji bırakma (kt/km)', xlog: true, series: [{ x: dep.x, y: dep.y, color: PALETTE[1] }], xlabel: 'dE/dz (kt TNT / km)', ylabel: 'Yükseklik (km)', ymin: 0 });
    // aşırı basınç – uzaklık
    const zb = e.regime === 'hava' ? e.zb : 0, rs = [], ps = [];
    for (let k = 0; k <= 120; k++) { const r = 10 ** (2 + k * 4.3 / 120); rs.push(r / 1000); ps.push(overpressure(e.EblastKt, zb, r)); }
    add('Aşırı basınç – uzaklık', { title: 'Hava şoku aşırı basıncı', xlog: true, ylog: true, series: [{ x: rs, y: ps, color: PALETTE[4] }],
      hlines: [{ y: 42600, label: 'yığma binalar çöker', color: '#e66767' }, { y: 26800, label: 'ahşap binalar çöker', color: '#f5b93a' }, { y: 6900, label: 'camlar kırılır', color: '#93c5fd' }],
      vlines: [{ x: p.rKm, label: 'gözlemci' }], xlabel: 'Uzaklık (km)', ylabel: 'Pa', ymin: 100 });
    if (s.crater && s.crater.vImpact >= 15e3) {
      const xs = [], ys = [];
      for (let k = 0; k <= 100; k++) { const r = 10 ** (3 + k * 3.5 / 100), t = thermal(e, s.crater, r); if (t && t.phi > 0) { xs.push(r / 1000); ys.push(t.phi); } }
      const sc = (s.crater.Eimp / MT) ** (1 / 6);
      if (xs.length > 2) add('Isı akısı – uzaklık', { title: 'Ateş topu ışınım enerjisi', xlog: true, ylog: true, series: [{ x: xs, y: ys, color: PALETTE[5] }], hlines: THERMAL_THRESH.map(([t, j], i) => ({ y: j * sc, label: t.toLowerCase(), color: ['#e66767', '#f5b93a', '#93c5fd'][i] })), vlines: [{ x: p.rKm, label: 'gözlemci' }], xlabel: 'Uzaklık (km)', ylabel: 'J/m²' });
    }
  }
}
