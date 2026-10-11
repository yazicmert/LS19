// Saptırma laboratuvarı (Laboratuvar › Asteroit saptırma): 1 Hedef → 2 Yakın geçiş → 3 İtki → 4 Sonuç.
// Hesap deflectwork.js iş parçacığında (DeflectEngine); bu dosya yalnız arayüz, grafikler ve 3B yollar. Metin/karar mantığı: labtext.js (Node'da sınanır).
import * as THREE from 'three';
import * as E from './engine.js';
import { AU, R_E, massOf } from './deflect.js';
import { CLASS_TR } from './asteroids.js';
import { fmt } from './format.js';
import { sig, kmText, distText, caDist, sizeText, dateLong, etToISO, etFromISO, RHO, QUICK_TARGETS, leadChoices, defaultLead, leadText, verdictOf, needText,
  targetSummary, caSummary, pushSummary, DIRS, dartNote } from './labtext.js';

const $ = (s) => document.querySelector(s);
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => window.matchMedia && matchMedia('(max-width: 760px)').matches;
const STEP_LOCK = ['Önce bir hedef seçin', 'Önce bir yakın geçiş seçin', 'Önce itkiyi hesaplayın'];

export class DeflectUI {
  constructor({ world, asts, getT, setCam, ui }) {
    Object.assign(this, { world, asts, getT, setCam, ui });
    this.target = null; this.cas = []; this.caSel = -1; this.result = null; this.lastP = null; this.seq = 0; this.pickSeq = 0; this.w = null; this.busy = false; this.mode = '';
    this.scanned = false; this.scanId = 0; this.scanEt0 = 0; this.leads = []; this.leadId = null; this.leadsFor = ''; this.massEdited = false; this.stale = false; this.paths = null;
    this.steps = [...document.querySelectorAll('#dfSteps .step')];
    this.bind();
    $('#dfDart').textContent = dartNote();
    this.buildQuick(); this.renderLeads(); this.refresh(); this.setStep(1);
    // 3B yollar (Dünya merkezli)
    const line = (c, op) => { const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(260 * 3), 3)),
      new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op, toneMapped: false })); l.frustumCulled = false; l.visible = false; world.scene.add(l); return l; };
    this.pathN = line(0xd8dde6, 0.8); this.pathD = line(0xff8a3d, 0.95);
    this.lblN = mk('div', 'lbl lbl-df', 'nominal'); this.lblD = mk('div', 'lbl lbl-df2', 'saptırılmış');
    for (const l of [this.lblN, this.lblD]) { l.style.display = 'none'; $('#labels').appendChild(l); }
  }

  // ---------------------------------------------------------------- bağlamalar
  bind() {
    let tmr = null;
    $('#dfSearch').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.search(e.target.value), 150); });
    this.steps.forEach((li, k) => li.querySelector('.sh').addEventListener('click', () => { if (this.enabled(k + 1)) this.setStep(k + 1); }));
    $('#dfScan').addEventListener('click', () => this.scan());
    $('#dfLonger').addEventListener('click', () => { $('#dfYears').value = 120; this.scan(); });
    $('#dfOther').addEventListener('click', () => { this.setStep(1); $('#dfSearch').focus(); });
    $('#dfNext2').addEventListener('click', () => { if (this.caSel < 0) return; this.prepareStep3(); this.setStep(3); });
    document.querySelectorAll('input[name=dfMethod]').forEach((r) => r.addEventListener('change', () => { this.syncMethod(); this.inputsChanged(); }));
    document.querySelectorAll('input[name=dfScn]').forEach((r) => r.addEventListener('change', () => { this.syncScenario(); this.inputsChanged(); }));
    for (const id of ['#dfMass', '#dfU', '#dfBeta', '#dfF', '#dfDays']) $(id).addEventListener('input', () => this.inputsChanged());
    $('#dfDir').addEventListener('change', () => this.inputsChanged());
    $('#dfApply').addEventListener('input', () => { this.leadId = null; this.renderLeads(); this.inputsChanged(); });
    for (const id of ['#dfD', '#dfRho']) $(id).addEventListener('input', () => { this.massEdited = true; this.renderMass(); this.inputsChanged(); });
    $('#dfRun').addEventListener('click', () => this.compute());
    $('#dfRerun').addEventListener('click', () => this.compute());
    $('#dfAgain').addEventListener('click', () => this.setStep(3));
    $('#df3d').addEventListener('click', () => this.show3d());
    // grafikler görünür olunca (adım açılınca, "ayrıntılar" açılınca, panel yeniden boyutlanınca) çizilir
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (this.result) this.drawCharts(); }); ro.observe($('#dfBplane')); ro.observe($('#dfSweep')); }
    this.syncMethod(); this.syncScenario();
  }
  buildQuick() {
    const box = $('#dfQuick'); box.replaceChildren();
    for (const q of QUICK_TARGETS) {
      const b = mk('button', 'chip', q.name); b.type = 'button'; b.dataset.des = q.des; b.title = q.why;
      b.addEventListener('click', () => { const i = this.asts.index && this.asts.index.get(q.des); if (i != null) this.setTarget(i); });
      box.appendChild(b);
    }
    this.onCatalog();
  }
  // katalog yüklendikçe ya da değiştikçe (AstUI çağırır): hızlı seçimleri ve durum satırını güncelle
  onCatalog() {
    const A = this.asts, idx = A.index;
    document.querySelectorAll('#dfQuick .chip').forEach((b) => { const ok = !!(idx && idx.has(b.dataset.des)); b.disabled = !ok; });
    const st = $('#dfCatalog'); st.textContent = A.n > 0 ? '' : (A.info && A.info.status) || 'Katalog yükleniyor…';
  }

  // ---------------------------------------------------------------- 1 · hedef
  search(q) {
    const A = this.asts, ul = $('#dfResults'); ul.replaceChildren();
    if (!q) return;
    for (const i of A.search(q)) {
      const c = A.C.cls[i], li = mk('li', null, `${A.label(i)} · ${(CLASS_TR[c] || c || '').split(' (')[0]}${A.C.pha[i] ? ' · potansiyel tehlikeli' : ''}`);
      li.addEventListener('click', () => { ul.replaceChildren(); $('#dfSearch').value = ''; this.setTarget(i); });
      ul.appendChild(li);
    }
    if (!ul.children.length) ul.appendChild(mk('li', 'dim', A.n ? 'Eşleşen asteroit yok' : 'Katalog yükleniyor…'));
  }
  // opts.hypo: senaryoyu önceden seç (Çarpma sekmesinden gelen sanal çarpıcılar "çarpacak olsaydı" ile başlar)
  async setTarget(i, opts = {}) {
    const A = this.asts, my = ++this.pickSeq;
    this.kill(); A.select(i);
    this.target = { i, name: A.label(i), des: A.C.des[i], Dkm: A.diam(i) };
    this.cas = []; this.caSel = -1; this.result = null; this.lastP = null; this.scanned = false; this.stale = false; this.leadsFor = ''; this.hide3d(); this.clearResult();
    if (opts.hypo != null) this.setScenario(!!opts.hypo);
    this.renderTarget(null); this.renderCas(); this.setStep(2); this.refresh();
    $('#dfScanStatus').textContent = 'Hedef bilgileri alınıyor…';
    const t = this.getT(), today = etToISO(t + (E.jdTdb(0) - 2451545) * 86400, false);
    if (!$('#dfStart').value) $('#dfStart').value = today;
    const det = await A.fetchDetail(i); if (my !== this.pickSeq) return;
    const d = A.details(i, t);
    let el = A.elementsOf(i), src = 'katalog öğeleri (12 hane)';
    if (det && det.orbit && det.orbit.elements) {
      const e = {}; for (const x of det.orbit.elements) e[x.name] = +x.value;
      if (Number.isFinite(e.a) && Number.isFinite(e.ma)) { el = { a: e.a, e: e.e, i: e.i, om: e.om, w: e.w, ma: e.ma, epoch: +det.orbit.epoch }; src = `JPL çözümü ${det.orbit.orbit_id || ''} (tam duyarlık)`; }
    }
    Object.assign(this.target, { el, src, ca: (det && det.ca_data) || [], Dkm: d.D, GM: d.GM || (A.C.gm[i] > 0 ? A.C.gm[i] : 0) });
    $('#dfD').value = +d.D.toPrecision(4); this.massEdited = false; $('#dfRho').value = d.rho || RHO(d.spec);
    this.renderTarget(d); this.renderMass(); this.refresh();
    this.scan();
  }
  renderTarget(d) {
    const tg = $('#dfTarget'), T = this.target; tg.replaceChildren(); if (!T) return;
    tg.appendChild(mk('b', null, T.name));
    if (!d) { tg.appendChild(mk('div', 'k', 'Ayrıntılar alınıyor…')); return; }
    tg.appendChild(mk('div', null, [d.cls, d.D > 0 ? 'Ø ' + sizeText(d.D) : '', `H ${fmt(d.H, 1)}`].filter(Boolean).join(' · ')));
    if (d.moid != null) tg.appendChild(mk('div', null, `Dünya yörüngesine en çok ${distText(d.moid * AU)} yaklaşır (MOID)${d.sentry ? ` · Sentry çarpma olasılığı ${sig(d.sentry.ip, 2)}` : ''}`));
    if (d.moid > 0.05) tg.appendChild(mk('div', 'hint', 'Yörüngesi Dünya\'ya 0,05 AB\'den fazla yaklaşmıyor: yakın geçiş bulunamayabilir. Apophis gibi daha yakın bir hedef de deneyebilirsiniz.'));
    tg.appendChild(mk('div', 'k', 'Başlangıç durumu: ' + T.src));
  }
  mass() {
    const D = parseFloat($('#dfD').value), rho = parseFloat($('#dfRho').value);
    return massOf({ D, rho, GM: this.target && this.target.GM && !this.massEdited ? this.target.GM : 0 });
  }
  renderMass() { if (this.target) $('#dfM').textContent = `Kütle ≈ ${sig(this.mass(), 3)} kg${this.target.GM && !this.massEdited ? ' (ölçülmüş GM)' : ''}`; }

  // ---------------------------------------------------------------- 2 · yakın geçiş
  worker() {
    if (this.w) return this.w;
    this.w = new Worker(new URL('./deflectwork.js', import.meta.url), { type: 'module' });
    this.w.onmessage = (e) => this.onMsg(e.data);
    this.w.onerror = (e) => { this.busy = false; const m = 'Hesap iş parçacığı hatası: ' + (e.message || ''); if (this.mode === 'scan') { $('#dfScanStatus').textContent = m; this.refresh(); } else this.setMsg(m, true); };
    return this.w;
  }
  kill() { if (this.w && this.busy) { this.w.terminate(); this.w = null; } this.busy = false; }
  scan() {
    const T = this.target; if (!T || !T.el) return;
    const start = $('#dfStart').value, years = Math.max(1, Math.min(120, +$('#dfYears').value || 50));
    if (!/^\d{4}-\d\d-\d\d$/.test(start)) { $('#dfScanStatus').textContent = 'Başlangıç tarihi geçersiz.'; return; }
    this.kill(); this.busy = true; this.mode = 'scan'; this.scanId++; this.scanned = false; this.caSel = -1; this.cas = []; this.result = null; this.leadsFor = ''; this.clearResult(); this.hide3d();
    this.renderCas(); this.refresh();
    const id = ++this.seq;
    $('#dfScanStatus').textContent = 'Yakın geçişler taranıyor…';
    this.worker().postMessage({ cmd: 'target', id, el: T.el, etStart: etFromISO(start), years, name: T.name });
  }
  onMsg(d) {
    if (d.id !== this.seq) return;
    if (d.type === 'progress') { if (this.mode === 'scan') $('#dfScanStatus').textContent = d.msg; else $('#dfRunning').textContent = d.msg; return; }
    this.busy = false;
    if (d.type === 'error') {
      if (this.mode === 'scan') $('#dfScanStatus').textContent = 'Hata: ' + d.msg;
      else { this.setMsg('Hata: ' + d.msg, true); this.setStep(3); }
      this.refresh(); return;
    }
    if (d.type === 'target') {
      this.cas = d.cas; this.lastP = null; this.scanned = true; this.scanEt0 = d.et0; this.scanEt1 = d.et1; this.scanMs = d.ms;
      if (d.cas.length) this.caSel = d.cas.reduce((b, c, k) => (c.dist < d.cas[b].dist ? k : b), 0);
      this.renderCas(); this.refresh();
    } else if (d.type === 'deflect') { this.result = d.r; this.renderResult(); this.refresh(); }
  }
  renderCas() {
    const ul = $('#dfCas'), st = $('#dfScanStatus'), empty = $('#dfCasEmpty'); ul.replaceChildren();
    const jpl = this.target ? this.target.ca || [] : [];
    const closest = this.cas.length ? this.cas.reduce((b, c, k) => (c.dist < this.cas[b].dist ? k : b), 0) : -1;
    this.cas.forEach((c, k) => {
      const li = mk('li'), b = mk('button', 'cacard'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', k === this.caSel ? 'true' : 'false');
      const date = etToISO(c.et), [yy, mo, dd] = date.slice(0, 10).split('-'), key = `${yy}-${MON[+mo - 1]}-${dd}`, j = jpl.find((x) => x.cd && x.cd.slice(0, 11) === key), cd = caDist(c.dist);
      const sub = [cd.sub, c.bp ? `v∞ ${fmt(c.bp.vinf, 1)} km/s` : '', j ? `JPL ile uyumlu (${kmText(+j.dist * AU)})` : ''].filter(Boolean).join(' · ');
      const head = mk('span', 'cd', dateLong(c.et)); if (k === closest && this.cas.length > 1) head.appendChild(mk('span', 'badge', 'en yakın'));
      b.append(head, mk('span', 'cm', cd.main), mk('span', 'cs', sub));
      b.addEventListener('click', () => { if (this.caSel === k) return; this.caSel = k; this.result = null; this.leadsFor = ''; this.clearResult(); this.hide3d(); this.renderCas(); this.refresh(); });
      li.appendChild(b); ul.appendChild(li);
    });
    if (this.scanned) {
      st.textContent = `${dateLong(this.scanEt0)} – ${dateLong(this.scanEt1)} arası: ${this.cas.length ? this.cas.length + ' yakın geçiş (0,05 AB\'den yakın)' : 'yakın geçiş yok'} · ${fmt(this.scanMs / 1000, 1)} s`;
    }
    empty.hidden = !(this.scanned && !this.cas.length);
    if (!empty.hidden) {
      const yrs = Math.max(1, Math.min(120, +$('#dfYears').value || 50));
      $('#dfEmptyTxt').textContent = yrs < 120 ? 'Bu hedef taranan aralıkta Dünya\'ya yaklaşmıyor. Taramayı uzatabilir ya da başka bir hedef seçebilirsiniz.' : 'Bu hedef 120 yıl boyunca Dünya\'ya yaklaşmıyor. Başka bir hedef seçin.';
      $('#dfLonger').hidden = yrs >= 120;
    }
    $('#dfNext2').disabled = this.caSel < 0;
  }

  // ---------------------------------------------------------------- 3 · itki
  method() { const r = document.querySelector('input[name=dfMethod]:checked'); return r ? r.value : 'kinetic'; }
  hypo() { const r = document.querySelector('input[name=dfScn]:checked'); return !!r && r.value === 'hypo'; }
  setScenario(h) { const r = document.querySelector(`input[name=dfScn][value=${h ? 'hypo' : 'real'}]`); if (r) { r.checked = true; this.syncScenario(); } }
  syncMethod() {
    const k = this.method() === 'kinetic';
    $('#dfKin').hidden = !k; $('#dfThr').hidden = k;
    document.querySelectorAll('input[name=dfMethod]').forEach((r) => r.closest('.mcard').classList.toggle('on', r.checked));
  }
  syncScenario() { document.querySelectorAll('input[name=dfScn]').forEach((r) => r.closest('.mcard').classList.toggle('on', r.checked)); }
  // yakın geçiş seçilince itki zamanı seçeneklerini ve varsayılanı kur (kullanıcı seçimini aynı geçişte korur)
  prepareStep3() {
    const ca = this.cas[this.caSel]; if (!ca) return;
    const key = this.scanId + ':' + this.caSel; if (this.leadsFor === key) return;
    this.leadsFor = key; this.leads = leadChoices(ca.et, this.scanEt0);
    const d = defaultLead(this.leads); this.leadId = d ? d.id : null;
    $('#dfApply').min = etToISO(this.scanEt0, false); $('#dfApply').max = etToISO(ca.et - 86400, false);
    $('#dfApply').value = d ? etToISO(d.et, false) : etToISO(Math.max(this.scanEt0, ca.et - 30 * 86400), false);
    this.renderLeads(); this.inputsChanged();
  }
  renderLeads() {
    const box = $('#dfLeads'); box.replaceChildren();
    for (const c of this.leads) {
      if (!c.ok) continue;
      const b = mk('button', 'chip' + (this.leadId === c.id ? ' on' : ''), c.label + ' önce'); b.type = 'button'; b.setAttribute('aria-pressed', this.leadId === c.id ? 'true' : 'false');
      b.addEventListener('click', () => { this.leadId = c.id; $('#dfApply').value = etToISO(c.et, false); this.renderLeads(); this.inputsChanged(); });
      box.appendChild(b);
    }
    if (!box.children.length && this.leads.length) box.appendChild(mk('span', 'k', 'Yakın geçişe çok az kaldı: itki tarihini "Gelişmiş" bölümünden seçin.'));
    this.applyReadout();
  }
  applyReadout() {
    const ca = this.cas[this.caSel], el = $('#dfApplyTxt'), v = $('#dfApply').value; el.className = 'k small';
    if (!ca || !/^\d{4}-\d\d-\d\d$/.test(v)) { el.textContent = ''; return; }
    const et = etFromISO(v), days = (ca.et - et) / 86400;
    if (days < 1 / 24) { el.textContent = 'İtki tarihi yakın geçişten önce olmalı.'; el.classList.add('err'); }
    else if (et < this.scanEt0) { el.textContent = `İtki tarihi tarama başlangıcından (${dateLong(this.scanEt0)}) önce olamaz.`; el.classList.add('err'); }
    else el.textContent = `İtki: ${dateLong(et)} · yakın geçişten ${leadText(days)} önce`;
  }
  readParams() {
    const v = $('#dfApply').value, method = this.method();
    return { method, M: this.mass(), etApply: /^\d{4}-\d\d-\d\d$/.test(v) ? etFromISO(v) : NaN, dir: $('#dfDir').value, hypo: this.hypo(),
      m: +$('#dfMass').value, U: +$('#dfU').value, beta: +$('#dfBeta').value, F: +$('#dfF').value, days: +$('#dfDays').value };
  }
  // alanlar değişince: özetleri yenile, hesaplanmış sonuç varsa "eski" işaretle
  inputsChanged() {
    this.applyReadout(); this.setMsg('');
    if (this.result && !this.busy) { this.stale = true; $('#dfStale').hidden = false; }
    this.refresh();
  }
  setMsg(t, err = false) { const el = $('#dfStatus'); el.textContent = t; el.classList.toggle('err', !!err); }
  validate(p, ca) {
    if (!(p.M > 0)) return 'Gelişmiş bölümünde hedefin çapını ve yoğunluğunu girin.';
    if (!Number.isFinite(p.etApply)) return 'İtki tarihini seçin.';
    if (p.etApply < this.scanEt0) return `İtki tarihi tarama başlangıcından (${dateLong(this.scanEt0)}) önce olamaz.`;
    if (!(p.etApply < ca.et - 3600)) return 'İtki, yakın geçişten önce olmalı.';
    if (p.method === 'kinetic' && !(p.m > 0 && p.U > 0 && p.beta >= 1)) return 'Araç kütlesi ve çarpma hızı pozitif, β ≥ 1 olmalı.';
    if (p.method === 'thrust' && !(p.F > 0 && p.days > 0)) return 'Kuvvet ve süre pozitif olmalı.';
    if (p.method === 'thrust' && p.etApply + p.days * 86400 >= ca.et - 3600) return 'İtki süresi yakın geçişe kadar bitmeli: süreyi kısaltın ya da daha erken başlatın.';
    return '';
  }
  compute() {
    const ca = this.cas[this.caSel]; if (!this.target || !ca) { this.setStep(2); return; }
    const q = this.readParams(), bad = this.validate(q, ca);
    if (bad) { this.setMsg(bad, true); this.setStep(3); return; }
    const p = { ca: this.caSel, ...q };
    this.kill(); this.busy = true; this.mode = 'deflect'; this.lastP = p; this.stale = false; this.setMsg('');
    $('#dfStale').hidden = true; $('#dfResult').hidden = true; $('#dfRunning').hidden = false; $('#dfRunning').textContent = 'Hesaplanıyor…'; $('#df3d').disabled = true;
    this.hide3d(); this.setStep(4); this.refresh();
    const id = ++this.seq;
    this.worker().postMessage({ cmd: 'deflect', id, p });
  }

  // ---------------------------------------------------------------- 4 · sonuç
  clearResult() {
    $('#dfResult').hidden = true; $('#dfRunning').hidden = true; $('#dfStale').hidden = true; $('#dfOut').replaceChildren(); this.clearCharts();
  }
  renderResult() {
    const r = this.result, p = this.lastP, v = verdictOf(r, p);
    $('#dfRunning').hidden = true; $('#dfResult').hidden = false; $('#dfStale').hidden = true; $('#df3d').disabled = false;
    const box = $('#dfVerdict'); box.className = 'verdict ' + v.kind; this.verdict = v;
    $('#dfVT').textContent = v.title; $('#dfVD').textContent = v.detail;
    const g = $('#dfGauge'); g.hidden = !v.hypo;
    if (v.hypo) {
      const max = Math.max(1.25, v.ratio * 1.08);
      g.style.setProperty('--fill', String(Math.min(1, v.ratio / max))); g.style.setProperty('--mark', String(1 / max));
      $('#dfGaugeTxt').textContent = `Kayma ${kmText(v.dB)} · gereken (yakalama yarıçapı) ${kmText(v.bE)}`;
    }
    $('#dfNeed').textContent = needText(r, p);
    this.renderTable();
    this.drawCharts();
  }
  renderTable() {
    const r = this.result, p = this.lastP, out = $('#dfOut'); out.replaceChildren();
    const dB = Math.hypot(r.dXi, r.dZeta), bE = r.b0.bE;
    const tb = mk('table', 'tbl'), row = (k, v, cls) => { const tr = mk('tr'); if (cls) tr.className = cls; tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); };
    row('Yakın geçiş', `${etToISO(r.ca.et)} · ${distText(r.ca.dist)}`);
    row('İtki anı / önceden uyarı', `${etToISO(r.ca.et - r.leadDays * 86400, false)} · ${fmt(r.leadDays, 0)} gün (${fmt(r.leadDays / 365.25, 2)} yıl)`);
    row('Asteroit kütlesi', `${sig(r.M, 3)} kg`);
    if (p.method === 'kinetic') row('Çarpıcı', `${fmt(p.m, 0)} kg · ${fmt(p.U, 2)} km/s · β ${fmt(p.beta, 2)} · momentum ${sig(p.m * p.U * 1000, 3)} kg·m/s`);
    else row('Sürekli kuvvet', `${sig(r.Fn, 3)} N × ${fmt(p.days, 0)} gün · toplam itme ${sig(r.Fn * p.days * 86400, 3)} N·s`);
    row('Hız değişimi Δv', `${sig(r.dvMps * 1000, 3)} mm/s (${DIRS[p.dir]})`);
    row('Yarı büyük eksen / periyot', `${r.orbit.da >= 0 ? '+' : ''}${sig(r.orbit.da, 3)} km / ${r.orbit.dP >= 0 ? '+' : ''}${sig(r.orbit.dP, 3)} s`);
    row('B-düzleminde kayma |ΔB|', `${kmText(dB)} = ${sig(dB / R_E, 3)} R⊕`, 'hl');
    row('  Δζ (zamanlama) / Δξ', `${fmt(r.dZeta, 1)} / ${fmt(r.dXi, 1)} km`);
    if (p.method === 'kinetic') row('  doğrusal tahmin (STM)', `${fmt(Math.hypot(r.lin.dXi, r.lin.dZeta), 1)} km`);
    if (r.dtCa != null) row('Geçiş anındaki kayma', `${fmt(r.dtCa, 1)} s`);
    row('Yakalama yarıçapı bE', `${kmText(bE)} (v∞ ${fmt(r.b0.vinf, 2)} km/s, çekim odaklaması dahil)`);
    row('En yakın geçiş', `${distText(r.b0.rp)} → ${r.after ? distText(r.after.rp) : '—'}${r.after && r.after.impact ? ' — ÇARPMA' : ''}`);
    out.appendChild(tb);
  }
  clearCharts() { for (const id of ['#dfBplane', '#dfSweep']) { const c = $(id); c.getContext('2d').clearRect(0, 0, c.width, c.height); } }
  drawCharts() { this.drawBplane(); this.drawSweep(); }
  prep(c) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;                                                // gizli (kapalı adım ya da katlanmış ayrıntı): görünür olunca ResizeObserver yeniden çizer
    c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '11px system-ui, sans-serif'; return { g, w, h };
  }
  drawBplane() {
    const r = this.result, p = this.lastP; if (!r) return;
    const P0 = this.prep($('#dfBplane')); if (!P0) return;
    const { g, w, h } = P0;
    const n0 = p.hypo ? [0, 0] : [r.b0.xi, r.b0.zeta], n1 = [n0[0] + r.dXi, n0[1] + r.dZeta], bE = r.b0.bE;
    const ext = Math.max(bE * 1.4, Math.abs(n0[0]), Math.abs(n0[1]), Math.abs(n1[0]), Math.abs(n1[1])) * 1.15;
    const cx = w / 2, cy = h / 2 + 6, s = Math.min(w, h - 24) / 2 / ext;
    const P = (q) => [cx + q[0] * s, cy - q[1] * s];
    g.strokeStyle = '#2b313c'; g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 16); g.lineTo(cx, h); g.stroke();
    g.fillStyle = '#9aa3b2'; g.fillText('ξ', w - 12, cy - 4); g.fillText('ζ', cx + 5, 26);
    g.fillText(`Dünya'ya göre geçiş noktası (ölçek ±${kmText(ext)})`, 6, 12);
    g.setLineDash([4, 4]); g.strokeStyle = '#e66767'; g.beginPath(); g.arc(cx, cy, bE * s, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#2f6fbf'; g.beginPath(); g.arc(cx, cy, Math.max(2, R_E * s), 0, 7); g.fill();
    const a = P(n0), b = P(n1);
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.lineWidth = 1;
    g.fillStyle = '#d8dde6'; g.beginPath(); g.arc(a[0], a[1], 4, 0, 7); g.fill();
    g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(b[0], b[1], 4, 0, 7); g.fill();
    g.fillStyle = '#e66767'; { const tx = 'yakalama yarıçapı', tw = g.measureText(tx).width; g.fillText(tx, Math.min(cx + bE * s * 0.72, w - tw - 4), Math.max(28, cy - bE * s * 0.72)); }
    const dB = Math.hypot(r.dXi, r.dZeta);
    if (dB * s < 14) {                                       // kayma ölçekte görünmüyor: yakın plan kutusu
      const bw = 120, bx = w - bw - 6, by = h - bw - 6, m = [(n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2], e2 = Math.max(dB, 1e-6) * 0.9, s2 = bw / 2 / e2;
      g.fillStyle = 'rgba(12,15,21,0.92)'; g.strokeStyle = '#3a4150'; g.fillRect(bx, by, bw, bw); g.strokeRect(bx, by, bw, bw);
      const Q = (q) => [bx + bw / 2 + (q[0] - m[0]) * s2, by + bw / 2 - (q[1] - m[1]) * s2], a2 = Q(n0), b2 = Q(n1);
      g.strokeStyle = '#ff8a3d'; g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.stroke();
      g.fillStyle = '#d8dde6'; g.beginPath(); g.arc(a2[0], a2[1], 3.5, 0, 7); g.fill();
      g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(b2[0], b2[1], 3.5, 0, 7); g.fill();
      g.fillStyle = '#9aa3b2'; g.fillText(`yakın plan: ${kmText(dB)}`, bx + 4, by + 12);
      g.fillStyle = '#d8dde6'; g.fillText(p.hypo ? 'çarpma noktası (varsayım)' : 'nominal', 6, h - 8);
      g.fillStyle = '#ff8a3d'; g.fillText('saptırılmış', 6, h - 22);
    } else {
      g.fillStyle = '#d8dde6'; g.fillText(p.hypo ? 'çarpma noktası (varsayım)' : 'nominal', a[0] + 7, a[1] + 14);
      g.fillStyle = '#ff8a3d'; g.fillText('saptırılmış', b[0] + 7, b[1] - 6);
    }
  }
  drawSweep() {
    const r = this.result; if (!r || !r.sweep.length) return;
    const P0 = this.prep($('#dfSweep')); if (!P0) return;
    const { g, w, h } = P0;
    const L = 44, R = 8, T = 24, B = 26, xs = r.sweep.map((q) => q.lead), ys = r.sweep.map((q) => q.shift).filter((v) => v > 0);
    const x0 = Math.log10(Math.min(...xs)), x1 = Math.log10(Math.max(...xs));
    const y0 = Math.floor(Math.log10(Math.min(...ys, r.b0.bE / 3))), y1 = Math.ceil(Math.log10(Math.max(...ys, r.b0.bE * 3)));
    const X = (v) => L + (Math.log10(v) - x0) / (x1 - x0 || 1) * (w - L - R), Y = (v) => T + (1 - (Math.log10(Math.max(v, 1e-9)) - y0) / (y1 - y0 || 1)) * (h - T - B);
    g.fillStyle = '#9aa3b2'; g.fillText(`Aynı Δv (${sig(r.dvMps * 1000, 3)} mm/s) ile kayma — itki anına göre`, 6, 12);
    g.strokeStyle = '#262b34';
    for (let e = y0; e <= y1; e++) { const y = Y(10 ** e); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(e >= 3 ? `${10 ** (e - 3)} bin km`.replace('1 bin', '1000').replace('10 bin', '10⁴').replace('100 bin', '10⁵') : `${10 ** e} km`, 2, y + 4); }
    for (const d of [1, 10, 100, 1000, 10000]) if (Math.log10(d) >= x0 - 0.01 && Math.log10(d) <= x1 + 0.01) { const x = X(d); g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke(); g.fillText(d >= 1000 ? `${fmt(d / 365.25, 1)} yıl` : `${d} gün`, Math.min(x - 12, w - 50), h - 8); }
    g.setLineDash([4, 4]); g.strokeStyle = '#e66767'; g.beginPath(); g.moveTo(L, Y(r.b0.bE)); g.lineTo(w - R, Y(r.b0.bE)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#e66767'; g.fillText('bE', w - R - 16, Y(r.b0.bE) - 4);
    g.strokeStyle = '#ffb36b'; g.lineWidth = 1.6; g.beginPath();
    r.sweep.forEach((q, k) => { const x = X(q.lead), y = Y(q.shift); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1;
    const dB = Math.hypot(r.dXi, r.dZeta); g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(X(r.leadDays), Y(dB), 4, 0, 7); g.fill();
    g.fillStyle = '#9aa3b2'; g.fillText('önceden uyarı süresi →', L + 6, h - B - 4);
  }

  // ---------------------------------------------------------------- adımlar
  enabled(n) { return n === 1 || (n === 2 && !!this.target) || (n === 3 && this.caSel >= 0) || (n === 4 && (!!this.result || (this.busy && this.mode === 'deflect'))); }
  setStep(n) {
    if (n === 3) this.prepareStep3();
    this.steps.forEach((li, k) => { const on = k + 1 === n; li.classList.toggle('open', on); li.querySelector('.sh').setAttribute('aria-expanded', on ? 'true' : 'false'); });
    const li = this.steps[n - 1];
    requestAnimationFrame(() => { if (li.offsetParent) li.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' }); if (n === 4 && this.result) this.drawCharts(); });
  }
  // durum → görünüm: adım numarası/işareti, kilit, tek satırlık özet
  refresh() {
    const T = this.target, ca = this.caSel >= 0 ? this.cas[this.caSel] : null, q = this.readParams(), v = this.result ? this.verdict : null;
    let lead = 'tarih seçin';
    if (ca && Number.isFinite(q.etApply)) { const d = (ca.et - q.etApply) / 86400; lead = d > 0 ? leadText(d) + ' önce' : 'tarih geçersiz'; }
    const done = [!!T, !!ca, !!this.result && !this.stale, false];
    const sums = [
      targetSummary(T && { name: T.name, Dkm: T.Dkm }),
      ca ? caSummary(ca) : T ? (this.scanned ? 'Yakın geçiş bulunamadı' : 'Taranıyor…') : STEP_LOCK[0],
      ca ? pushSummary(q, lead) : STEP_LOCK[1],
      this.result ? (this.stale ? 'Ayarlar değişti: yeniden hesaplayın' : v.title) : (this.busy && this.mode === 'deflect' ? 'Hesaplanıyor…' : STEP_LOCK[2]),
    ];
    this.steps.forEach((li, k) => {
      const ok = this.enabled(k + 1), btn = li.querySelector('.sh');
      li.classList.toggle('done', done[k]); li.classList.toggle('locked', !ok); btn.disabled = !ok;
      li.querySelector('.ss').textContent = sums[k];
      const sn = li.querySelector('.sn'); sn.textContent = done[k] ? '✓' : String(k + 1);
      li.classList.toggle('good', k === 3 && !!v && v.kind === 'good' && !this.stale); li.classList.toggle('bad', k === 3 && !!v && v.kind === 'bad' && !this.stale);
    });
  }

  // ---------------------------------------------------------------- 3B yollar
  show3d() {
    const r = this.result; if (!r) return;
    this.paths = { N: r.pathN, D: r.pathD };
    const cdist = r.after ? Math.min(r.ca.dist, r.after.dist) : r.ca.dist;
    this.setCam('EARTH'); Object.assign(this.world.cam, { dist: Math.max(4 * cdist, 50000), el: 0.5 });
    if (narrow()) $('#labPanel').classList.remove('open');                  // telefonda panel 3B görünümü kapatmasın
  }
  hide3d() { this.paths = null; }
  update(eye) {
    const P = this.paths, vis = !!eye && !!P && this.world.cam.mode !== 'SOLAR' && this.world.cam.mode !== 'OBS';
    this.pathN.visible = this.pathD.visible = vis;
    if (!vis) { this.lblN.style.display = this.lblD.style.display = 'none'; return; }
    for (const [l, arr, lbl] of [[this.pathN, P.N, this.lblN], [this.pathD, P.D, this.lblD]]) {
      const a = l.geometry.attributes.position.array, n = arr.length / 3;
      let best = 0, bd = Infinity;
      for (let k = 0; k < n; k++) {
        a[3 * k] = arr[3 * k] - eye[0]; a[3 * k + 1] = arr[3 * k + 1] - eye[1]; a[3 * k + 2] = arr[3 * k + 2] - eye[2];
        const dd = Math.hypot(arr[3 * k], arr[3 * k + 1], arr[3 * k + 2]); if (dd < bd) { bd = dd; best = k; }
      }
      l.geometry.setDrawRange(0, n); l.geometry.attributes.position.needsUpdate = true;
      const v = new THREE.Vector3(arr[3 * best] - eye[0], arr[3 * best + 1] - eye[1], arr[3 * best + 2] - eye[2]).project(this.world.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) lbl.style.display = 'none';
      else { lbl.style.display = 'block'; lbl.style.transform = `translate(${((v.x + 1) / 2) * this.world.canvas.clientWidth}px, ${((1 - v.y) / 2) * this.world.canvas.clientHeight - (lbl === this.lblN ? 10 : -22)}px) translate(-50%, -100%)`; }
    }
  }
}
