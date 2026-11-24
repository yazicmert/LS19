// Asteroit saptırma brifingi (Laboratuvar › Asteroit saptırma'nın girişi): LS19 önce denemeyi adım adım kurdurur, sonra sonucu gerçek yörünge hesabıyla verir.
// Akış: giriş → 1 Hangi asteroit? → 2 Ne zaman? (yakın geçiş, senaryo) → 3 Nasıl? (yöntem) → 4 Neyle? (roket ve fırlatma penceresi; ya da itki zamanı) → 5 Brifing.
// Hesabın tamamı deneyin kendi motorundadır (DeflectUI → deflectwork.js): brifing onun arayüzünü sürer, panel aynı durumu gösterir; brifing kapanınca deney
// panelde sürer. Saf mantık brifsaptirmatext.js'te; kart, işaretler ve kamera ortak brifing kabuğunda (brifkabuk.js).
// Sahne (gökyüzü motoru): Güneş sistemi (hedefler işaretli) → Dünya yakını (yakın geçişin gerçek yolu, yer eşzamanlı kuşak, Ay'ın yörüngesi) → asteroidin yakın planı
// → fırlatma rampası → sonuç (nominal ve saptırılmış yol).
import * as THREE from 'three';
import * as E from './engine.js';
import { BriefShell, el, esc, unit } from './brifkabuk.js';
import { DF_STEPS, TARGETS, METHODS, METHOD_ORDER, methodDv, caFacts, recommendCa, recommendRocket, recommendDf, reasonsDf, dfTimeline, kineticBest, activeRocket } from './brifsaptirmatext.js';
import { kmText, caDist, sizeText, dateLong, leadText, needText, sig } from './labtext.js';
import { rocketOf } from './rockets.js';
import { fmt } from './format.js';
import { t as tr } from './i18n.js';

const SEEN = 'ls19.brifing.saptirma';
const GEO_R = 42164;                                                          // yer eşzamanlı yörünge yarıçapı (km)
// sahne: adım → kamera (kip, uzaklık km, yükseklik açısı, dönme hızı). wide: telefonda geniş görünüm (sola kayar)
const SCENES = {
  intro: { mode: 'SOLAR', dist: 6.2e8, el: 0.95, az: -1.0, spin: 0.02, wide: true, sys: true },
  hedef: { mode: 'SOLAR', dist: 5.4e8, el: 1.05, az: -1.0, wide: true, sys: true, targets: true },
  gecis: { mode: 'EARTH', dist: 160000, el: 0.4, flyby: true },
  yontem: { mode: 'FOCUS', dist: 2, el: 0.25, ast: true },
  arac: { mode: 'EARTH', dist: 15000, pad: true },
  brifing: { mode: 'EARTH', dist: 160000, el: 0.4, flyby: true, result: true },
};

export class DeflectBrief extends BriefShell {
  // host: { world, latest() → { t }, root, dui (DeflectUI), asts (AsteroidLayer), rockets() → roket kimlikleri, padOf(roket), onClose }
  constructor(host) {
    super(host, { id: 'saptirma', label: 'Saptırma brifingi', seen: SEEN, steps: DF_STEPS, scenes: SCENES, hide: [] });
    this.lines = null;
  }
  get dui() { return this.h.dui; }
  // roket adımı yalnız kinetik çarpıcıda rampayı gösterir; öteki yöntemlerde asteroidin yakın planı kalır
  setScene(k) { super.setScene(k === 'arac' && this.sel.method !== 'kinetic' ? 'yontem' : k); }
  get A() { return this.h.asts; }

  // ---------------------------------------------------------------- açılış ve kapanış
  onOpen() {
    const D = this.dui, T = D.target;
    this.sel = { des: T ? T.des : null, ca: D.caSel, hypo: D.hypo(), method: D.method(), rocket: null, lead: D.leadId };
    this.scan = T ? (D.scanned ? 'ok' : D.busy ? 'busy' : 'idle') : 'idle';
    this.det = T && T.i != null ? this.A.details(T.i, this.h.latest().t) : null;
    this.path = null; this.ic = null; this.res = null; this.err = null; this.msg = ''; this.q = '';
    D.hook = (type, d) => this.onEvent(type, d);
    if (this.scan === 'ok' && D.caSel >= 0) this.needPath();
  }
  // seçili geçişin yolu (iş parçacığı tek: sonraki istek öncekini iptal eder; yol yoksa yeniden istenir)
  needPath() { const D = this.dui; if (this.path && this.path.ca === D.caSel) return; if ((this.ic && this.ic.st === 'busy') || this.waiting) return; if (this.pathReq === D.caSel && D.mode === 'path') return; if (D.requestPath()) this.pathReq = D.caSel; }
  onClosing() { if (this.dui.hook) this.dui.hook = null; this.waiting = false; }

  introCard(kind) {
    const ret = kind === 'return';
    return {
      eye: 'LS19 · Gezegen savunması',
      h: ret ? 'Yeni bir deneme kuralım mı?' : 'Dünya\'yı bir asteroitten koruyalım.',
      lead: ret ? 'Son denemen panelde duruyor. İstersen başka bir hedef, geçiş ya da yöntemle baştan kur.'
        : 'Bir asteroit seç, Dünya\'ya yaklaştığı anı seç, nasıl iteceğine ve hangi roketle gideceğine karar ver. LS19 her adımda önerisini sayılarla söyler; sonucu gerçek yörünge hesabıyla bulur.',
      acts: [{ act: 'start', t: ret ? 'Yeni deneme kur' : 'Denemeyi kur', cls: 'primary' }, { act: 'panel', t: ret ? 'Kaldığım yerden devam' : 'Paneli kendim kullanayım' }],
      fine: ret ? '' : 'Hesap gerçek: JPL yörünge çözümü, Güneş sistemi efemerisi (DE440), Dünya\'nın çekimi ve Yarkovsky etkisiyle.',
    };
  }
  onAct() { this.close(null); }

  // ---------------------------------------------------------------- hesap olayları (DeflectUI.emit)
  onEvent(type, d) {
    if (!this.active) return;
    const D = this.dui;
    if (type === 'catalog') { if (this.stepKey() === 'hedef' || this.step < 0) this.redraw(); return; }
    if (type === 'progress') { this.msg = d; const w = this.card.querySelector('.brief-wait span:last-child'); if (w) w.textContent = tr(d); return; }
    if (type === 'target') { this.det = d; if (this.stepKey() === 'hedef') this.redraw(); return; }
    if (type === 'scan') {
      this.scan = 'ok'; this.path = null; this.ic = null; this.res = null;
      const k = recommendCa(D.cas, D.scanEt0);
      if (k >= 0) { D.selectCa(k); this.sel.ca = k; this.sel.hypo = !caFacts(D.cas[k], D.scanEt0).impact; this.needPath(); } else this.sel.ca = -1;
      if (['hedef', 'gecis'].includes(this.stepKey())) this.redraw();
      return;
    }
    if (type === 'path') { this.pathReq = null; if (d.ca === D.caSel) this.path = { ca: d.ca, pts: d.path }; this.ensureIc(); return; }      // yol geldi: fırlatma penceresi arka planda (yöntem adımı gerçek roket sayılarıyla karşılaştırır)
    if (type === 'intercepts') {
      this.ic = { key: this.icKey(), bests: d.bests || {}, bE: d.bE, st: 'ok' };
      if (!this.sel.rocket || !this.ic.bests[this.sel.rocket]) this.sel.rocket = recommendRocket(this.ic.bests) || Object.keys(this.ic.bests).find((id) => this.ic.bests[id]) || null;
      if (['arac', 'yontem'].includes(this.stepKey())) this.redraw();
      return;
    }
    if (type === 'deflect') {
      this.waiting = false; this.res = { key: this.resKey(), r: d, v: D.verdict, unc: D.unc, p: D.lastP };
      if (this.stepKey() === 'brifing') this.redraw();
      return;
    }
    if (type === 'error') {
      if (this.scan === 'busy') this.scan = 'err';
      if (this.ic && this.ic.st === 'busy') this.ic.st = 'err';
      this.err = String(d || ''); this.waiting = false;
      this.redraw();
    }
  }
  // fırlatma penceresi (tüm roketler, tek örgü): yöntemden bağımsız; geçiş seçilince arka planda başlar
  ensureIc() {
    const D = this.dui, key = this.icKey();
    if (this.ic && (this.ic.key === key || this.ic.st === 'busy')) return;
    if (D.caSel < 0 || D.busy || this.waiting) return;
    this.ic = { key, st: 'busy' }; if (!D.intercepts(this.h.rockets(), this.sel.rocket || 'FH')) this.ic = null;
  }
  icKey() { const s = this.sel; return [s.des, s.ca, Math.round(this.dui.mass())].join('|'); }
  resKey() { const s = this.sel; return [s.des, s.ca, s.hypo, s.method, s.method === 'kinetic' ? s.rocket : s.lead].join('|'); }
  ctx() {
    const D = this.dui, T = D.target;
    const icOk = this.ic && this.ic.st === 'ok' && this.ic.key === this.icKey();
    return { det: this.det, cas: D.cas, nowEt: D.scanEt0, M: T ? D.mass() : 0, R: T ? parseFloat(document.querySelector('#dfD').value) * 500 : 0,
      kinPending: !icOk && !!this.ic && this.ic.st === 'busy', bests: icOk ? this.ic.bests : null, bE: this.ic && this.ic.bE, rocketName: (id) => rocketOf(id).name, date: (et) => dateLong(et) };
  }

  // ---------------------------------------------------------------- adımlar
  nextLabel(k) { return k === 'arac' ? 'Sonucu hesapla' : 'Devam'; }
  recommendFor(step) { return recommendDf(step, this.sel, this.ctx()); }
  reasonsFor(step) { return reasonsDf(step, this.sel, this.ctx()); }
  renderStep(k, body, next) {
    if (k === 'hedef') this.stepTarget(body, next);
    else if (k === 'gecis') this.stepPass(body, next);
    else if (k === 'yontem') this.stepMethod(body);
    else if (k === 'arac') this.stepVehicle(body, next);
    else this.stepBrief(body);
  }

  // 1: hedef — hızlı hedefler (Güneş sisteminde işaretli, dokununca seçilir) ve katalogda arama
  pickTarget(des) {
    const A = this.A, i = A.index && A.index.get(des); if (i == null) return;
    this.sel = { ...this.sel, des, ca: -1, rocket: null };
    this.scan = 'busy'; this.det = A.details(i, this.h.latest().t); this.path = null; this.ic = null; this.res = null; this.err = null; this.msg = '';
    this.dui.setTarget(i);
    this.redraw();
  }
  stepTarget(body, next) {
    const A = this.A, ready = A.n > 0 && A.index;
    this.rec(body, 'hedef', this.sel.des, (v) => this.pickTarget(v));
    const t = this.h.latest().t;
    const items = TARGETS.map((q) => {
      const i = ready ? A.index.get(q.des) : null, d = i != null ? A.details(i, t) : null;
      return { v: q.des, t: q.name, meta: d ? [d.D > 0 ? 'Ø ' + sizeText(d.D) : '', d.moid != null ? 'MOID ' + kmText(d.moid * 149597870.7) : ''].filter(Boolean).join(' · ') : '', s: q.why, disabled: i == null };
    });
    const cur = this.sel.des, T = this.dui.target;
    if (cur && T && !TARGETS.some((q) => q.des === cur)) items.unshift({ v: cur, t: T.name, meta: this.det && this.det.D > 0 ? 'Ø ' + sizeText(this.det.D) : '', s: 'Aramayla seçilen hedef.' });
    this.options(body, 'Hedef', items, cur, (v) => this.pickTarget(v));
    // katalogda arama (55.000 asteroit): ilk sonuçlar seçenek olarak
    const row = el('label', 'brief-date brief-search', `<span>${esc(tr('Başka bir asteroit'))}</span><input type="search" placeholder="${esc(tr('ad ya da numara: Eros, 433…'))}" value="${esc(this.q)}" autocomplete="off">`);
    const inp = row.querySelector('input'), res = el('div', 'brief-opts brief-found');
    const find = () => {
      this.q = inp.value; res.replaceChildren();
      if (!ready || !this.q.trim()) return;
      for (const i of A.search(this.q).slice(0, 5)) {
        const b = el('button', 'brief-opt'); b.type = 'button';
        b.innerHTML = `<span class="bo-t">${esc(A.label(i))}</span><span class="bo-m">${esc(sizeText(A.diam(i)))}</span>`;
        b.onclick = () => { this.q = ''; this.pickTarget(A.C.des[i]); };
        res.appendChild(b);
      }
      if (!res.children.length) res.appendChild(el('p', 'brief-note', esc(tr('Eşleşen asteroit yok'))));
    };
    let tm = null; inp.oninput = () => { clearTimeout(tm); tm = setTimeout(find, 150); };
    body.append(row, res); if (this.q) find();
    if (!ready) body.appendChild(el('p', 'brief-note', esc(tr((A.info && A.info.status) || 'Katalog yükleniyor…'))));
    if (this.scan === 'busy') body.appendChild(el('div', 'brief-wait', `<span class="brief-spin" aria-hidden="true"></span><span>${esc(tr(this.msg || 'Yakın geçişler taranıyor…'))}</span>`));
    else body.appendChild(el('p', 'brief-note', esc(tr('LS19 seçtiğin asteroidin 50 yıllık yolunu tam fizikle tümler (Güneş, gezegenler, Ay, Yarkovsky) ve Dünya\'ya 0,05 AB\'den yakın geçişlerini bulur.'))));
    next.disabled = !cur;
  }

  // 2: yakın geçiş ve senaryo
  stepPass(body, next) {
    const D = this.dui;
    if (this.scan === 'busy' || this.scan === 'idle') { this.waitBox(body, 'LS19 yakın geçişleri tarıyor: asteroidin yolu 50 yıl boyunca tam fizikle tümleniyor.', this.msg || 'Yakın geçişler taranıyor…'); next.disabled = true; return; }
    if (this.scan === 'err') { this.failBox(body, tr('Tarama yapılamadı: {0}', this.err || ''), 'Başka bir hedef dene.'); return; }
    if (!D.cas.length) {
      body.appendChild(el('p', 'brief-lead', esc(tr('Bu asteroit önümüzdeki 50 yılda Dünya\'ya 0,05 AB\'den (19 Ay uzaklığı) yaklaşmıyor. Başka bir hedef seç.'))));
      next.disabled = true; return;
    }
    const pick = (k) => { D.selectCa(k); this.sel.ca = k; this.sel.hypo = !caFacts(D.cas[k], D.scanEt0).impact; this.path = null; this.ic = null; this.res = null; this.needPath(); this.redraw(); };
    this.needPath();
    this.rec(body, 'gecis', this.sel.ca, pick);
    this.options(body, 'Yakın geçiş', D.cas.map((c, k) => {
      const cd = caDist(c.dist), f = caFacts(c, D.scanEt0);
      return { v: k, t: dateLong(c.et), meta: cd.main, s: [cd.sub, f.vinf != null ? tr('{0} km/s', fmt(f.vinf, 1)) : '', f.years > 0 ? tr('{0} sonra', leadText(f.years * 365.25)) : '', f.impact ? tr('ÇARPAR') : ''].filter(Boolean).join(' · ') };
    }), this.sel.ca, pick);
    const adv = el('details', 'brief-adv', `<summary>${esc(tr('Senaryo'))}</summary>`); adv.open = true;
    this.seg(adv, 'Senaryo', this.sel.hypo ? 'hypo' : 'real', [['hypo', 'Çarpacak olsaydı'], ['real', 'Gerçek yörünge']], (v) => { this.sel.hypo = v === 'hypo'; this.res = null; this.redraw(); });
    body.appendChild(adv);
    next.disabled = this.sel.ca < 0;
  }

  // 3: yöntem (varsayılan araçlarla hız değişimi; araç ayrıntıları panelin Gelişmiş bölümünde)
  stepMethod(body) {
    this.ensureIc();
    const c = this.ctx(), K = kineticBest(c.bests), pick = (v) => { this.sel.method = v; this.dui.setMethod(v); this.res = null; this.redraw(); };          // fırlatma penceresi yöntemden bağımsız: korunur
    this.rec(body, 'yontem', this.sel.method, pick);
    const dvOf = (k) => (k === 'kinetic' ? (K ? tr('Δv ≈ {0} mm/s', sig(K.dv, 3)) : c.kinPending ? tr('hesaplanıyor…') : tr('Δv ≈ {0} mm/s', sig(methodDv(k, c.M, c.R), 3))) : tr('Δv ≈ {0} mm/s', sig(methodDv(k, c.M, c.R), 3)));
    this.options(body, 'Yöntem', METHOD_ORDER.map((k) => ({ v: k, t: METHODS[k].t, meta: c.M > 0 ? dvOf(k) : '', s: METHODS[k].s })), this.sel.method, pick);
    body.appendChild(el('p', 'brief-note', esc(tr(K ? 'Kinetik çarpıcı: bugün uçan roketlerin en iyi önleme çözümüyle. Sürekli itki 1 N, çekim traktörü 20 t; ikisi de bir yıl. Araç değerleri panelin Gelişmiş bölümünde değiştirilebilir.'
      : 'Hız değişimleri varsayılan araçlarla (DART benzeri çarpıcı; 1 N sürekli itki ve 20 t traktör, birer yıl). Araç değerleri panelin Gelişmiş bölümünde değiştirilebilir.'))));
  }

  // 4: kinetik → roket ve fırlatma penceresi (tüm roketler tek hesapta); öteki yöntemler → itki zamanı
  stepVehicle(body, next) {
    const D = this.dui;
    if (this.sel.method !== 'kinetic') {
      D.prepareStep3();
      const leads = D.leads.filter((c) => c.ok);
      if (!leads.some((c) => c.id === this.sel.lead)) this.sel.lead = (leads.find((c) => c.id === D.leadId) || leads[0] || {}).id || null;
      const pick = (v) => { this.sel.lead = v; this.res = null; this.redraw(); };
      body.appendChild(el('p', 'brief-lead', esc(tr('İtki yakın geçişten ne kadar önce başlasın? Ne kadar erken başlarsa, aynı hız değişimi geçiş noktasını o kadar kaydırır.'))));
      this.options(body, 'İtki zamanı', leads.map((c) => ({ v: c.id, t: tr('{0} önce', tr(c.label)), meta: dateLong(c.et), s: '' })), this.sel.lead, pick);
      if (!leads.length) body.appendChild(el('p', 'brief-note', esc(tr('Yakın geçişe çok az kaldı: itki tarihini panelin Gelişmiş bölümünden seç.'))));
      next.disabled = !this.sel.lead;
      return;
    }
    const ids = this.h.rockets();
    this.ensureIc(); if (!this.ic) this.ic = { key: this.icKey(), st: 'err' };
    if (this.ic.st === 'busy') { this.waitBox(body, 'LS19 her roket için önleme yörüngelerini deniyor: her fırlatma günü ve uçuş süresi için Lambert yörüngesi, kalkış enerjisi ve çarpma hızı.', this.msg || 'Hesaplanıyor…'); next.disabled = true; return; }
    if (this.ic.st === 'err') { this.failBox(body, tr('Fırlatma penceresi hesaplanamadı: {0}', this.err || ''), 'Daha uzak bir yakın geçiş seç.'); return; }
    const B = this.ic.bests, pick = (v) => { this.sel.rocket = v; this.res = null; this.redraw(); };
    this.rec(body, 'arac', this.sel.rocket, pick);
    this.options(body, 'Roket', ids.map((id) => {
      const b = B[id], R = rocketOf(id);
      const old = activeRocket(id) ? '' : ' ' + tr('Tarihî: bugün uçmuyor.');
      return { v: id, t: R.name, meta: b ? tr('kayma {0} · %{1}', kmText(b.shift), fmt(100 * b.shift / this.ic.bE, b.shift < 0.1 * this.ic.bE ? 1 : 0)) : '', s: (b ? tr('Fırlatma {0}, {1} kg çarpıcı, {2} km/s.', dateLong(b.etL), fmt(b.m, 0), fmt(b.U, 1)) : tr('Bu geçişten önce ulaşan bir yörünge yok.')) + old, disabled: !b };
    }), this.sel.rocket, pick);
    body.appendChild(el('p', 'brief-note', esc(tr('Yüzde: geçiş noktasının kayması, yakalama yarıçapına oranla. %100 ve üstü: çarpacak olsaydı Dünya kurtulurdu.'))));
    next.disabled = !this.sel.rocket || !B[this.sel.rocket];
  }

  // 5: hesap (DeflectUI.compute) ve özet
  stepBrief(body) {
    if (this.res && this.res.key === this.resKey()) { this.renderSummary(body); return; }
    if (this.err && !this.waiting && this.lastRun === this.resKey()) { this.failBox(body, tr('Hesaplanamadı: {0}', this.err), 'Başka bir geçiş ya da yöntem dene.'); return; }
    const D = this.dui;
    this.waitBox(body, 'LS19 saptırmayı hesaplıyor: itki anında asteroidin hızı değişir, yol yakın geçişe kadar yeniden tümlenir ve geçiş noktasının kayması ölçülür.', this.msg || 'Hesaplanıyor…');
    this.card.querySelector('.brief-nav').hidden = true;
    if (this.waiting) return;
    this.waiting = true; this.err = null; this.lastRun = this.resKey(); this.msg = '';
    D.setScenario(this.sel.hypo);
    if (this.sel.method === 'kinetic') { const b = this.ic && this.ic.bests[this.sel.rocket]; D.setMethod('kinetic'); if (b) D.useIntercept(b, this.sel.rocket); }
    else { D.setMethod(this.sel.method); D.pickLead(this.sel.lead); }
    D.compute();
  }
  renderSummary(body) {
    const { r, v, unc, p } = this.res, D = this.dui, T = D.target, ca = D.cas[this.sel.ca], kin = this.sel.method === 'kinetic';
    const b = kin && this.ic ? this.ic.bests[this.sel.rocket] : null;
    const dB = Math.hypot(r.dXi, r.dZeta), bE = r.b0.bE;
    const rows = [['Hedef', T.name], ['Yakın geçiş', `${dateLong(ca.et)} · ${kmText(ca.dist)}`], ['Senaryo', this.sel.hypo ? 'Çarpacak olsaydı' : 'Gerçek yörünge'],
      ['Yöntem', METHODS[this.sel.method].t], ...(kin ? [['Roket', rocketOf(this.sel.rocket).name], ['Çarpıcı', tr('{0} kg · {1} km/s', fmt(p.m, 0), fmt(p.U, 1))]] : [['İtki', tr('{0} önce', leadText(r.leadDays))]]),
      ['Hız değişimi', tr('{0} mm/s', sig(r.dvMps * 1000, 3))], ['Kayma', tr('{0} (gereken {1})', kmText(dB), kmText(bE))]];
    const tl = dfTimeline({ etL: b ? b.etL : null, etA: ca.et - r.leadDays * 86400, etEnd: !kin && p.days ? ca.et - r.leadDays * 86400 + p.days * 86400 : null, caEt: ca.et, kinetic: kin });
    body.innerHTML = `<div class="brief-verdict ${esc(v.kind)}" role="status"><b>${esc(tr(v.title))}</b><p>${esc(tr(v.detail))}</p></div>
      <dl class="brief-sum">${rows.map(([k, x]) => `<div><dt>${esc(tr(k))}</dt><dd>${esc(tr(x))}</dd></div>`).join('')}</dl>
      <ol class="brief-tl" aria-label="${esc(tr('Görev çizelgesi'))}">${tl.map((q, k) => `<li><span>${k ? esc(tr('{0} sonra', leadText(q.dt / 86400))) : 'T0'}</span><b>${esc(tr(q.k))}</b><em>${esc(dateLong(q.t))}</em></li>`).join('')}</ol>
      ${unc ? `<details class="brief-adv"><summary>${esc(tr(unc.title))}</summary><p class="brief-note">${unc.detail.map((q) => esc(tr(q))).join(' ')}</p></details>` : ''}
      <p class="brief-note">${esc(tr(needText(r, p)))}</p>`;
    this.goButtons([{ go: '3d', t: '3B\'de yolu izle' }, { go: 'panel', t: 'Ayrıntılar panelde' }], 'Seçimleri değiştir', (how) => {
      this.close(how);
      if (how === '3d') D.show3d(); else document.querySelector('#labPanel').classList.add('open');
    });
  }

  // ---------------------------------------------------------------- 3B sahne
  aim(c, x, show) {
    const W = this.h.world, A = this.A, t = x.t, D = this.dui;
    let a = null;
    if (c.sys) {                                                                   // Güneş sistemi: Dünya ve hedefler işaretli; Hangi asteroit? adımında dokununca seçilir
      this.placePin('E', [0, 0, 0], 'Dünya'); show.add('E');
      if (c.targets && A.n > 0 && A.index) for (const q of TARGETS) {
        const i = A.index.get(q.des); if (i == null) continue;
        const on = q.des === this.sel.des, p = A.geoPos(i, t); if (!p) continue;
        this.placePin('t:' + q.des, p, q.name, null, { on, pick: on ? null : () => this.pickTarget(q.des) }); show.add('t:' + q.des);
      }
      if (c.spin) a = { az: c.az + c.spin * c.t, el: c.el };
    } else if (c.ast && T0(D)) {                                                   // asteroidin yakın planı: Güneş'in aydınlattığı yandan (AstUI.follow ile aynı bakış)
      const i = D.target.i, R = Math.max(0.05, (A.diam(i) || 0.3) / 2);
      if (!c.focus || c.focus.i !== i) { c.focus = { kind: 'ast', fn: (tt) => A.selPos(tt), R, i }; c.dist = Math.max(8 * R, 3); }
      const [r] = A.helio(i, t), n = Math.hypot(...r), d = r.map((q) => -q / n);
      const B1 = [0, 0.9174820621, 0.3977771559], B2 = [0, -0.3977771559, 0.9174820621];
      a = { az: Math.atan2(d[1] * B1[1] + d[2] * B1[2], d[0]) + 0.7, el: Math.max(-1.2, Math.min(1.2, Math.asin(d[1] * B2[1] + d[2] * B2[2]) + 0.25)) };
    } else if (c.pad && this.h.padOf && this.sel.rocket) {                          // rampa (Ay brifingiyle aynı bakış): Dünya üzerinde ortada, stüdyo ışığı
      const P = this.h.padOf(this.sel.rocket), la = P.lat * Math.PI / 180, lo = P.lon * Math.PI / 180;
      const d = unit(E.mtv(E.earthIcrfToItrf(t), [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]));
      const east = unit(E.cross([0, 0, 1], d)), north = E.cross(d, east), v = unit(E.add(d, E.scale(north, -0.12)));
      a = { az: Math.atan2(v[1], v[0]), el: Math.asin(Math.max(-1, Math.min(1, v[2]))) };
      if (W.earthU && W.earthU.sunDir) W.earthU.sunDir.value.set(...unit(E.add(E.add(E.scale(d, 0.8), E.scale(east, 0.5)), E.scale(north, 0.3))));
      this.placePin('pad', E.scale(d, E.R_E * 1.001), P.name, [0, 0, 0]); show.add('pad');
    } else if (c.flyby) {                                                          // Dünya yakını: yakın geçişin yolu, yer eşzamanlı kuşak, Ay'ın yörüngesi
      const ca = D.cas[this.sel.ca], res = c.result && this.res && this.res.key === this.resKey() ? this.res.r : null;
      const P = res ? res.pathN : this.path && this.path.ca === this.sel.ca ? this.path.pts : null;
      if (ca) c.dist = Math.min(1.1e6, Math.max(9e4, 3.2 * (res && res.after ? Math.min(ca.dist, res.after.dist) : ca.dist)));
      if (P && P.length >= 6) {
        let best = 0, bd = Infinity; for (let k = 0; k < P.length; k += 3) { const q = Math.hypot(P[k], P[k + 1], P[k + 2]); if (q < bd) { bd = q; best = k; } }
        const k2 = Math.min(P.length - 3, best + 3), r0 = [P[best], P[best + 1], P[best + 2]], v0 = E.sub([P[k2], P[k2 + 1], P[k2 + 2]], r0), n = unit(E.cross(r0, v0));
        const up = n[2] < 0 ? E.scale(n, -1) : n, look = unit(E.add(up, E.scale(unit(r0), 0.35)));        // yolun düzlemine yukarıdan, en yakın nokta öne gelecek biçimde
        a = { az: Math.atan2(look[1], look[0]), el: Math.max(-1.25, Math.min(1.25, Math.asin(look[2]))) };
        if (!res) { this.placePin('ca', r0, `${T0(D) ? D.target.name.replace(/^\d+\s+/, '') : ''} · ${kmText(bd)}`, null, { on: true }); show.add('ca'); }
      }
      if (res) {                                                                   // sonuç: nominal ve saptırılmış yolların en yakın noktaları
        const cp = (arr) => { let best = 0, bd = Infinity; for (let k = 0; k < arr.length; k += 3) { const q = Math.hypot(arr[k], arr[k + 1], arr[k + 2]); if (q < bd) { bd = q; best = k; } } return { p: [arr[best], arr[best + 1], arr[best + 2]], d: bd }; };
        const n = cp(res.pathN), dd = cp(res.pathD), gap = Math.hypot(...E.sub(n.p, dd.p));
        if (gap < 0.04 * c.dist) {                                                 // kayma bu ölçekte görünmez: tek işaret (iki ad üst üste binmesin)
          this.placePin('d', dd.p, `${tr('Saptırılmış')} · ${kmText(dd.d)} · ${tr('kayma {0}', kmText(Math.hypot(res.dXi, res.dZeta)))}`, null, { on: true }); show.add('d');
        } else {
          this.placePin('n', n.p, `${tr('Nominal')} · ${kmText(n.d)}`, null, { left: true }); show.add('n');
          this.placePin('d', dd.p, `${tr('Saptırılmış')} · ${kmText(dd.d)}`, null, { on: true }); show.add('d');
        }
        if (!D.paths) D.paths = { N: res.pathN, D: res.pathD };                  // DeflectUI.update çizer (gökyüzü motoru, Dünya kipinde)
      }
      const rm = E.moonPos(t); this.placePin('M', rm, 'Ay'); show.add('M');
      if ((c.dist || 0) < 3.5e5) { this.placePin('geo', [GEO_R, 0, 0], 'Yer eşzamanlı kuşak'); show.add('geo'); }
    }
    this.flyLines(c, x, !!(c.flyby && !(c.result && this.res && this.res.key === this.resKey())));
    return a;
  }
  keepVisible() { return false; }
  // Dünya yakını çizgileri: yer eşzamanlı kuşak (ekvator düzleminde), Ay'ın yörüngesi (bir ay), yakın geçişin nominal yolu (sonuçta DeflectUI'nin yolları)
  flyLines(c, x, showPath) {
    const W = this.h.world, on = !!c.flyby;
    if (!on) { if (this.lines) this.lines.g.visible = false; if (!c.result && this.dui.paths && this.dui.hook) this.dui.paths = null; return; }
    if (!this.lines) {
      const g = new THREE.Group(), mk = (n, col, op) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false })); l.frustumCulled = false; g.add(l); return l; };
      const geo = mk(181, 0x8591a3, 0.55), moon = mk(181, 0xd9dee8, 0.35), path = mk(161, 0x5ee7ff, 0.95);
      const a = geo.geometry.attributes.position.array; for (let k = 0; k <= 180; k++) { const q = 2 * Math.PI * k / 180; a[3 * k] = GEO_R * Math.cos(q); a[3 * k + 1] = GEO_R * Math.sin(q); a[3 * k + 2] = 0; }
      geo.geometry.attributes.position.needsUpdate = true;
      g.renderOrder = 3; W.scene.add(g); this.lines = { g, geo, moon, path, mt: null, pk: null };
    }
    const L = this.lines; L.g.visible = true;
    if (L.mt == null || Math.abs(L.mt - x.t) > 86400) {                             // Ay'ın yörüngesi: şimdiki andan bir ay
      const a = L.moon.geometry.attributes.position.array; for (let k = 0; k <= 180; k++) { const p = E.moonPos(x.t + 27.32 * 86400 * k / 180); a[3 * k] = p[0]; a[3 * k + 1] = p[1]; a[3 * k + 2] = p[2]; }
      L.moon.geometry.attributes.position.needsUpdate = true; L.mt = x.t;
    }
    const P = showPath && this.path && this.path.ca === this.sel.ca ? this.path.pts : null;
    L.path.visible = !!P;
    if (P && L.pk !== P) { const a = L.path.geometry.attributes.position.array, n = Math.min(161, P.length / 3); for (let k = 0; k < n * 3; k++) a[k] = P[k]; L.path.geometry.setDrawRange(0, n); L.path.geometry.attributes.position.needsUpdate = true; L.pk = P; }
    const eye = W.eye; if (eye) L.g.position.set(-eye[0], -eye[1], -eye[2]);
  }
  clearScene() { if (this.lines) this.lines.g.visible = false; }
  portraitScale(c, asp) { return c.mode === 'SOLAR' ? Math.min(2.2, 0.95 / asp) : 1.6; }
}
const T0 = (D) => !!(D.target && D.target.i != null);
