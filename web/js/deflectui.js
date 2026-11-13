// Saptırma laboratuvarı (Laboratuvar › Asteroit saptırma): 1 Hedef → 2 Yakın geçiş → 3 İtki → 4 Sonuç.
// Hesap deflectwork.js iş parçacığında (DeflectEngine); bu dosya yalnız arayüz, grafikler ve 3B yollar. Metin/karar mantığı: labtext.js (Node'da sınanır).
import * as THREE from 'three';
import * as E from './engine.js';
import { AU, R_E, massOf, ngFromSbdb, tractorForce } from './deflect.js';
import { CLASS_TR } from './asteroids.js';
import { fmt } from './format.js';
import { $, mk } from './uiutil.js';
import { sig, kmText, distText, caDist, sizeText, dateLong, etToISO, etFromISO, RHO, QUICK_TARGETS, leadChoices, defaultLead, leadText, verdictOf, needText,
  targetSummary, caSummary, pushSummary, DIRS, dartNote, ngText, LINK_KEYS, linkFromState, stateFromLink, historyRow, historyCsv, uncertText, interceptRows, disruptionOf } from './labtext.js';
import { workerOpts } from './i18n.js';
import { covFromSbdb, massSigma, diamSigma, dvSigma, monteCarlo, ellipse, BETA_SIG } from './uncert.js';
import { ROCKET_IDS, rocketOf, tliCapacity } from './rockets.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => window.matchMedia && matchMedia('(max-width: 760px)').matches;
const STEP_LOCK = ['Önce bir hedef seçin', 'Önce bir yakın geçiş seçin', 'Önce itkiyi hesaplayın'];
const HIST_KEY = 'ls19.dfHist', HIST_MAX = 30;
const howCell = (h) => { const td = mk('td', null, h.how); if (h.hypo) td.append(' · ', mk('span', 'k', 'çarpacak olsaydı')); return td; };
const loadHist = () => { try { const a = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); return Array.isArray(a) ? a.filter((h) => h && h.link && Number.isFinite(h.caEt)) : []; } catch (e) { return []; } };
const saveHist = (a) => { try { localStorage.setItem(HIST_KEY, JSON.stringify(a)); } catch (e) { /* özel pencere ya da kota: geçmiş yalnız bu oturumda kalır */ } };

export class DeflectUI {
  constructor({ world, asts, getT, setCam, ui }) {
    Object.assign(this, { world, asts, getT, setCam, ui });
    this.target = null; this.cas = []; this.caSel = -1; this.result = null; this.lastP = null; this.seq = 0; this.pickSeq = 0; this.w = null; this.busy = false; this.mode = '';
    this.scanned = false; this.scanId = 0; this.scanEt0 = 0; this.leads = []; this.leadId = null; this.leadsFor = ''; this.massEdited = false; this.stale = false; this.paths = null;
    this.steps = [...document.querySelectorAll('#dfSteps .step')];
    // paylaşılan bağlantı (?mode=lab&exp=saptirma&hedef=…): katalog hazır olunca hedef seçilir, tarama bitince geçiş ve itki kurulup hesaplanır
    const q = new URLSearchParams(location.search);
    this.link = q.get('exp') === 'saptirma' || q.get('tab') === 'saptirma' ? stateFromLink(q) : null; this.linkRun = null;
    this.hist = loadHist();
    this.bind();
    this.renderHist();
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
    for (const id of ['#dfMass', '#dfU', '#dfBeta', '#dfF', '#dfDays', '#dfGtM', '#dfGtK', '#dfGtDays']) $(id).addEventListener('input', () => this.inputsChanged());
    $('#dfDir').addEventListener('change', () => this.inputsChanged());
    $('#dfApply').addEventListener('input', () => { this.leadId = null; this.renderLeads(); this.inputsChanged(); });
    for (const id of ['#dfD', '#dfRho']) $(id).addEventListener('input', () => { this.massEdited = true; this.renderMass(); this.inputsChanged(); });
    $('#dfRun').addEventListener('click', () => this.compute());
    $('#dfRerun').addEventListener('click', () => this.compute());
    $('#dfAgain').addEventListener('click', () => this.setStep(3));
    $('#df3d').addEventListener('click', () => this.show3d());
    $('#dfLink').addEventListener('click', () => this.copyLink());
    // önleme görevi: roketler (başarımı yayımlanmış olanlar), fırlatma penceresi, en iyi çözümü uygula
    const rs = $('#dfRocket'); for (const id of ROCKET_IDS) if (tliCapacity(id) > 0) { const o = document.createElement('option'); o.value = id; o.textContent = rocketOf(id).name; rs.appendChild(o); }
    rs.value = 'FH';
    $('#dfIcRun').addEventListener('click', () => this.porkchop());
    $('#dfIcUse').addEventListener('click', () => this.useIntercept());
    rs.addEventListener('change', () => this.resetIc());
    $('#dfHistCsv').addEventListener('click', () => this.downloadCsv());
    $('#dfHistClear').addEventListener('click', () => { this.hist = []; saveHist(this.hist); this.renderHist(); });
    // grafikler görünür olunca (adım açılınca, "ayrıntılar" açılınca, panel yeniden boyutlanınca) çizilir
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (this.result) this.drawCharts(); if (this.pc) this.drawPork(); }); ro.observe($('#dfBplane')); ro.observe($('#dfSweep')); ro.observe($('#dfPork')); }
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
    if (this.link && idx && A.n > 0) { const L = this.link; this.link = null; this.applyLink(L); }
  }
  // bağlantıdaki ya da geçmişteki bir denemeyi kur: hedefi seç, aynı aralığı tara, aynı geçişi ve itkiyi seçip hesapla
  applyLink(L) {
    const i = this.asts.index && this.asts.index.get(L.des);
    if (i == null) { this.setStep(1); $('#dfCatalog').textContent = `Bağlantıdaki hedef (${L.des}) katalogda bulunamadı.`; return; }
    this.setTarget(i, { link: L });
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
    this.cas = []; this.caSel = -1; this.result = null; this.lastP = null; this.scanned = false; this.stale = false; this.leadsFor = ''; this.hide3d(); this.clearResult(); this.resetIc();
    if (opts.hypo != null) this.setScenario(!!opts.hypo);
    const L = opts.link || null; this.linkRun = L;
    if (L) { if (L.start) $('#dfStart').value = L.start; if (L.years) $('#dfYears').value = L.years; }
    else this.writeUrl(null);
    this.renderTarget(null); this.renderCas(); this.setStep(2); this.refresh();
    $('#dfScanStatus').textContent = 'Hedef bilgileri alınıyor…';
    const t = this.getT(), today = etToISO(t + (E.jdTdb(0) - 2451545) * 86400, false);
    if (!$('#dfStart').value) $('#dfStart').value = today;
    const des = A.C.des[i], det = await A.fetchDetail(i); if (my !== this.pickSeq) return;
    i = A.index.get(des) ?? -1; if (i < 0) { $('#dfScanStatus').textContent = 'Hedef katalogda yok'; return; }        // beklerken katalog yeniden kurulmuş olabilir (dizinler kayar)
    this.target.i = i;
    const d = A.details(i, t);
    let el = A.elementsOf(i), src = 'katalog öğeleri (12 hane)', ng = null, cov = null;
    if (det && det.orbit && det.orbit.elements) {
      const e = {}; for (const x of det.orbit.elements) e[x.name] = +x.value;
      if (Number.isFinite(e.a) && Number.isFinite(e.ma)) {
        el = { a: e.a, e: e.e, i: e.i, om: e.om, w: e.w, ma: e.ma, epoch: +det.orbit.epoch }; src = `JPL çözümü ${det.orbit.orbit_id || ''} (tam duyarlık)`;
        ng = ngFromSbdb(det.orbit.model_pars);                            // aynı çözümün kütleçekimsel olmayan parametreleri (öğelerle birlikte kestirilmiştir)
        cov = covFromSbdb(det.orbit);                                     // yörünge kovaryansı (cov=mat; yoksa null: yalnız itkinin belirsizliği)
      }
    }
    const msrc = { GM: d.GM || 0, GMsig: d.GMsig || 0, D: d.D, Dsig: d.Dsig || 0, Dmeasured: !!d.Dmeas, alb: d.alb, albSig: d.albSig || 0, rhoMeasured: !!d.rhoMeas };
    Object.assign(this.target, { el, src, ng, cov, msrc, ca: (det && det.ca_data) || [], Dkm: d.D, GM: d.GM || (A.C.gm[i] > 0 ? A.C.gm[i] : 0) });
    $('#dfD').value = +d.D.toPrecision(4); this.massEdited = false; $('#dfRho').value = d.rho || RHO(d.spec);
    if (L && L.D && L.rho) { $('#dfD').value = L.D; $('#dfRho').value = L.rho; this.massEdited = true; }
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
    if (T.cov) { const n = mk('div', 'k', 'Yörünge kovaryansı: JPL'); n.title = 'Yörüngenin gözlemlerden gelen belirsizliği: sonuçta çarpma olasılığı ve geçiş noktasının belirsizlik elipsi buna dayanır.'; tg.appendChild(n); }
    if (T.ng) { const n = mk('div', 'k', ngText(T.ng)); n.title = 'Isıl ışımanın (Yarkovsky etkisi) yörünge boyunca küçük ama sürekli itkisi: JPL bunu gözlemlerden kestirir. Yüzyıllık taşımalarda yakın geçişi binlerce km kaydırabilir; motor bunu hesaba katar.'; tg.appendChild(n); }
  }
  mass() {
    const D = parseFloat($('#dfD').value), rho = parseFloat($('#dfRho').value);
    return massOf({ D, rho, GM: this.target && this.target.GM && !this.massEdited ? this.target.GM : 0 });
  }
  renderMass() { if (this.target) $('#dfM').textContent = `Kütle ≈ ${sig(this.mass(), 3)} kg${this.target.GM && !this.massEdited ? ' (ölçülmüş GM)' : ''}`; }

  // ---------------------------------------------------------------- 2 · yakın geçiş
  worker() {
    if (this.w) return this.w;
    this.w = new Worker(new URL('./deflectwork.js', import.meta.url), workerOpts());
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
    this.worker().postMessage({ cmd: 'target', id, el: T.el, ng: T.ng || null, cov: T.cov || null, etStart: etFromISO(start), years, name: T.name });
  }
  onMsg(d) {
    if (d.id !== this.seq) return;
    if (d.type === 'progress') { if (this.mode === 'scan') $('#dfScanStatus').textContent = d.msg; else if (this.mode === 'porkchop') $('#dfIcMsg').textContent = d.msg; else $('#dfRunning').textContent = d.msg; return; }
    if (this.mode === 'porkchop') {
      this.pcBusy = false; $('#dfIcRun').disabled = false;
      if (d.type === 'error') { $('#dfIcMsg').textContent = 'Hata: ' + d.msg; return; }
      if (d.type === 'porkchop') this.renderPork(d.r);
      return;
    }
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
      if (this.linkRun) this.continueLink();
    } else if (d.type === 'deflect') { this.result = d.r; this.renderResult(); this.refresh(); this.remember(); }
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
      b.addEventListener('click', () => { if (this.caSel === k) return; this.caSel = k; this.result = null; this.leadsFor = ''; this.clearResult(); this.hide3d(); this.resetIc(); this.renderCas(); this.refresh(); });
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

  // bağlantı: tarama bitti → aynı günün geçişi, itki ayarları, hesap
  continueLink() {
    const L = this.linkRun; this.linkRun = null;
    if (L.caDay) {
      const k = this.cas.findIndex((c) => etToISO(c.et, false) === L.caDay);
      if (k < 0) { $('#dfScanStatus').textContent = `Bağlantıdaki yakın geçiş (${L.caDay}) bu taramada yok: bir geçiş seçin.`; return; }
      this.caSel = k; this.renderCas();
    }
    if (this.caSel < 0) return;
    this.prepareStep3();
    const r = document.querySelector(`input[name=dfMethod][value=${['thrust', 'tractor'].includes(L.method) ? L.method : 'kinetic'}]`); if (r) { r.checked = true; this.syncMethod(); }
    if (L.method === 'tractor') { if (L.gm) $('#dfGtM').value = L.gm; if (L.gk) $('#dfGtK').value = L.gk; if (L.days) $('#dfGtDays').value = L.days; }
    for (const [k, id] of [['m', '#dfMass'], ['U', '#dfU'], ['beta', '#dfBeta'], ['F', '#dfF'], ['days', '#dfDays']]) if (L[k] != null && !(L.method === 'tractor' && k === 'days')) $(id).value = L[k];
    if (L.dir === 'vec' && L.dirVec) this.setIcDir(L.dirVec);
    else if (L.dir) $('#dfDir').value = L.dir;
    if (L.hypo != null) this.setScenario(L.hypo);
    if (L.applyDay) { $('#dfApply').value = L.applyDay; this.leadId = (this.leads.find((c) => c.ok && etToISO(c.et, false) === L.applyDay) || {}).id || null; this.renderLeads(); }
    this.inputsChanged(); this.setStep(3);
    if (L.applyDay) this.compute();
  }
  // şu anki ayarların bağlantı durumu (hesaplanmış bir geçiş ve hedef varsa)
  linkState() {
    const T = this.target, ca = this.cas[this.caSel]; if (!T || !ca) return null;
    const q = this.readParams();
    return { des: T.des, start: $('#dfStart').value, years: Math.max(1, Math.min(120, +$('#dfYears').value || 50)), caDay: etToISO(ca.et, false), method: q.method,
      m: q.m, U: q.U, beta: q.beta, F: q.F, days: q.days, gm: q.gm, gk: q.gk, applyDay: $('#dfApply').value, dir: q.dir, dirVec: q.dirVec, hypo: q.hypo,
      ...(this.massEdited ? { D: +$('#dfD').value, rho: +$('#dfRho').value } : {}) };
  }
  // adres çubuğu: saptırma açıkken son hesaplanan denemenin parametreleri (yeni hedef seçilince silinir)
  writeUrl(o) {
    if (!window.history || !history.replaceState) return;
    const u = new URL(location.href); for (const k of LINK_KEYS) u.searchParams.delete(k);
    if (o && document.body.dataset.exp === 'saptirma') for (const [k, v] of Object.entries(o)) u.searchParams.set(k, v);
    if (u.href !== location.href) history.replaceState(history.state, '', u);
  }
  linkUrl(qs) { const u = new URL(location.pathname, location.origin); u.searchParams.set('mode', 'lab'); u.searchParams.set('exp', 'saptirma'); for (const [k, v] of new URLSearchParams(qs)) u.searchParams.set(k, v); return u.href; }
  async copyLink() {
    const h = this.hist[0], msg = $('#dfLinkMsg'); if (!this.result || !h) return;
    const url = this.linkUrl(h.link);
    try { await navigator.clipboard.writeText(url); msg.textContent = 'Bağlantı kopyalandı.'; }
    catch (e) { msg.textContent = ''; window.prompt('Bağlantıyı kopyalayın:', url); }
    setTimeout(() => { if (msg.textContent === 'Bağlantı kopyalandı.') msg.textContent = ''; }, 4000);
  }
  // ---------------------------------------------------------------- deneme geçmişi
  remember() {
    const st = this.runLink; this.runLink = null; if (!st || !this.result) return;
    const o = linkFromState(st), qs = String(new URLSearchParams(o));
    const row = historyRow(this.result, this.lastP, this.target, qs);
    this.hist = [row, ...this.hist.filter((h) => h.link !== qs)].slice(0, HIST_MAX); saveHist(this.hist);
    this.writeUrl(o); this.renderHist();
  }
  renderHist() {
    const box = $('#dfHist'), tb = $('#dfHistTbl tbody'); tb.replaceChildren();
    box.hidden = !this.hist.length; $('#dfHistN').textContent = this.hist.length ? `(${this.hist.length})` : '';
    this.hist.forEach((h, k) => {
      const tr = mk('tr', 'hrow ' + h.kind); tr.tabIndex = 0; tr.title = 'Bu denemeyi yeniden kur';
      tr.append(mk('td', null, `${h.name} · ${dateLong(h.caEt)}`), howCell(h), mk('td', 'num', leadText(h.leadDays)),
        mk('td', 'num', `${kmText(h.shiftKm)} / ${kmText(h.bEKm)}`), mk('td', 'res', h.title));
      const go = () => { const L = stateFromLink(new URLSearchParams(this.hist[k].link)); if (L) this.applyLink(L); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } });
      tb.appendChild(tr);
    });
  }
  downloadCsv() {
    if (!this.hist.length) return;
    const rows = this.hist.map((h) => ({ ...h, link: this.linkUrl(h.link) }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([historyCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ls19_saptirma_denemeleri.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- önleme görevi (fırlatma penceresi)
  resetIc() {
    this.pc = null; this.pcBusy = false; $('#dfIcRun').disabled = false; $('#dfIcOut').hidden = true; $('#dfIcMsg').textContent = '';
    if ($('#dfDir').value === 'vec') $('#dfDir').value = 'along';
    this.icDir = null; $('#dfDir').querySelector('option[value=vec]').disabled = true;
  }
  setIcDir(u) { this.icDir = u; const o = $('#dfDir').querySelector('option[value=vec]'); o.disabled = false; $('#dfDir').value = 'vec'; }
  porkchop() {
    const ca = this.cas[this.caSel]; if (!this.target || !ca || this.busy) return;
    const M = this.mass(), beta = +$('#dfBeta').value;
    if (!(M > 0 && beta >= 1)) { $('#dfIcMsg').textContent = 'Gelişmiş bölümünde kütle ve β geçerli olmalı.'; return; }
    this.mode = 'porkchop'; this.pcBusy = true; $('#dfIcRun').disabled = true; $('#dfIcMsg').textContent = 'Hesaplanıyor…';
    const id = ++this.seq;
    this.worker().postMessage({ cmd: 'porkchop', id, p: { ca: this.caSel, rocket: $('#dfRocket').value, beta, M } });
  }
  renderPork(r) {
    this.pc = r; const b = r.best;
    $('#dfIcOut').hidden = false;
    if (!b) { $('#dfIcMsg').textContent = 'Bu roketle bu geçişten önce ulaşılabilen bir önleme yörüngesi bulunamadı.'; $('#dfIcBest').replaceChildren(); $('#dfIcUse').disabled = true; this.drawPork(); return; }
    $('#dfIcMsg').textContent = `${fmt(r.nL * r.nT, 0)} yörünge denendi. En büyük kayma ${kmText(b.shift)}: yakalama yarıçapının %${fmt(100 * b.shift / r.bE, b.shift < 0.1 * r.bE ? 1 : 0)}.`; $('#dfIcUse').disabled = false;
    const tb = mk('table', 'tbl');
    for (const [k, v] of interceptRows(b, r.bE, rocketOf($('#dfRocket').value).name)) { const tr = mk('tr'); tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); }
    $('#dfIcBest').replaceChildren(tb);
    this.drawPork();
  }
  drawPork() {
    const r = this.pc; if (!r) return;
    const P0 = this.prep($('#dfPork')); if (!P0) return;
    const { g, w, h } = P0, L = 40, R = 6, T = 24, B = 22, cw = (w - L - R) / r.nL, ch = (h - T - B) / r.nT, DAY = 86400;
    g.fillStyle = '#0d1118'; g.fillRect(L, T, w - L - R, h - T - B);
    // renk: kayma, örgünün kendi aralığında (en büyüğün 1/1000'i → en büyük) logaritmik; koyu mor → turuncu → sarı. Yakalama yarıçapını aşan hücreler (kurtarır) beyaz çerçeveli
    let mx = 0; for (const v of r.shift) if (v > mx) mx = v;
    const lo = Math.log10(mx / 1000), stops = [[0, [60, 40, 110]], [0.55, [230, 90, 60]], [1, [255, 236, 150]]];
    const col = (v) => {
      const t = Math.max(0, Math.min(1, (Math.log10(v) - lo) / 3)); let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], f = (t - t0) / (t1 - t0); return `rgb(${c0.map((x, i) => Math.round(x + (c1[i] - x) * f)).join(',')})`;
    };
    for (let i = 0; i < r.nL; i++) for (let j = 0; j < r.nT; j++) {
      const v = r.shift[i * r.nT + j]; if (!Number.isFinite(v)) continue;
      const x = L + i * cw, y = h - B - (j + 1) * ch;
      g.fillStyle = col(v); g.fillRect(x, y, Math.ceil(cw), Math.ceil(ch));
      if (v >= r.bE) { g.strokeStyle = '#ffffff'; g.strokeRect(x + 0.5, y + 0.5, Math.max(1, cw - 1), Math.max(1, ch - 1)); }
    }
    g.strokeStyle = '#3a4150'; g.strokeRect(L, T, w - L - R, h - T - B);
    g.fillStyle = '#9aa3b2'; g.fillText('uçuş süresi (gün) ↑ · fırlatma günü →', 6, 12);
    for (let j = 0; j < r.nT; j += Math.max(1, Math.round(r.nT / 5))) g.fillText(fmt((r.j0 + j) * r.h / DAY, 0), 4, h - B - j * ch - 2);
    for (let i = 0; i < r.nL; i += Math.max(1, Math.round(r.nL / 4))) g.fillText(etToISO(r.L0 + i * r.h, false).slice(0, 7), Math.min(L + i * cw, w - 48), h - 7);
    if (r.best) { const b = r.best; g.strokeStyle = '#5ee7ff'; g.lineWidth = 2; g.beginPath(); g.arc(L + (b.i + 0.5) * cw, h - B - (b.j + 0.5) * ch, 6, 0, 7); g.stroke(); g.lineWidth = 1; }
  }
  useIntercept() {
    const b = this.pc && this.pc.best; if (!b) return;
    const r = document.querySelector('input[name=dfMethod][value=kinetic]'); if (r) { r.checked = true; this.syncMethod(); }
    $('#dfMass').value = Math.floor(b.m); $('#dfU').value = +b.U.toFixed(2);
    $('#dfApply').value = etToISO(b.etA, false); this.leadId = null; this.renderLeads();
    this.setIcDir(b.uDir); this.inputsChanged();
    $('#dfIcMsg').textContent = 'Çözüm uygulandı: kütle, çarpma hızı, çarpma günü ve yönü önleme yörüngesinden. Şimdi Hesapla.';
  }

  // ---------------------------------------------------------------- 3 · itki
  method() { const r = document.querySelector('input[name=dfMethod]:checked'); return r ? r.value : 'kinetic'; }
  hypo() { const r = document.querySelector('input[name=dfScn]:checked'); return !!r && r.value === 'hypo'; }
  setScenario(h) { const r = document.querySelector(`input[name=dfScn][value=${h ? 'hypo' : 'real'}]`); if (r) { r.checked = true; this.syncScenario(); } }
  syncMethod() {
    const m = this.method(), k = m === 'kinetic';
    $('#dfKin').hidden = !k; $('#dfThr').hidden = m !== 'thrust'; $('#dfGt').hidden = m !== 'tractor'; $('#dfIc').hidden = !k;
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
    const dir = $('#dfDir').value;
    if (method === 'tractor') {                                              // çekim traktörü: kuvvet fizikten (F = G·M·m/d², d = k·R)
      const M = this.mass(), R = parseFloat($('#dfD').value) * 500, gm = +$('#dfGtM').value, gk = +$('#dfGtK').value, days = +$('#dfGtDays').value;
      return { method, M, etApply: /^\d{4}-\d\d-\d\d$/.test(v) ? etFromISO(v) : NaN, dir, hypo: this.hypo(), gm, gk, R, days, F: tractorForce(M, gm, gk * R), m: +$('#dfMass').value, U: +$('#dfU').value, beta: +$('#dfBeta').value };
    }
    return { method, M: this.mass(), etApply: /^\d{4}-\d\d-\d\d$/.test(v) ? etFromISO(v) : NaN, dir, ...(dir === 'vec' && this.icDir ? { dirVec: this.icDir } : {}), hypo: this.hypo(),
      m: +$('#dfMass').value, U: +$('#dfU').value, beta: +$('#dfBeta').value, F: +$('#dfF').value, days: +$('#dfDays').value };
  }
  // alanlar değişince: özetleri yenile, hesaplanmış sonuç varsa "eski" işaretle
  inputsChanged() {
    this.applyReadout(); this.setMsg('');
    if (this.method() === 'tractor') { const q = this.readParams(); $('#dfGtF').textContent = q.F > 0 ? `Çekim kuvveti F = G·M·m/d² ≈ ${sig(q.F, 3)} N (${fmt(q.gk * q.R, 0)} m uzaklıkta); asteroide verdiği ivme G·m/d² kütlesinden bağımsızdır.` : ''; }
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
    if (p.method === 'tractor' && !(p.gm > 0 && p.days > 0 && p.R > 0)) return 'Araç kütlesi, süre ve asteroidin çapı pozitif olmalı.';
    if (p.method === 'tractor' && !(p.gk >= 1.2)) return 'Araç yüzeyin üstünde durmalı: uzaklık en az 1,2 yarıçap.';
    if (p.dir === 'vec' && !p.dirVec) return 'Önleme yönü yok: önce fırlatma penceresini hesaplayın ya da başka bir yön seçin.';
    if (p.method !== 'kinetic' && p.etApply + p.days * 86400 >= ca.et - 3600) return 'İtki süresi yakın geçişe kadar bitmeli: süreyi kısaltın ya da daha erken başlatın.';
    return '';
  }
  compute() {
    const ca = this.cas[this.caSel]; if (!this.target || !ca) { this.setStep(2); return; }
    const q = this.readParams(), bad = this.validate(q, ca);
    if (bad) { this.setMsg(bad, true); this.setStep(3); return; }
    const p = { ca: this.caSel, ...q };
    this.runLink = this.linkState();                                        // geçmişe ve adrese, hesaplanan ayarlar yazılır (beklerken değişenler değil)
    this.kill(); this.busy = true; this.mode = 'deflect'; this.lastP = p; this.stale = false; this.setMsg('');
    if (this.pcBusy) { this.pcBusy = false; $('#dfIcRun').disabled = false; $('#dfIcMsg').textContent = ''; }    // süren pencere hesabı bu istekle iptal olur
    $('#dfStale').hidden = true; $('#dfResult').hidden = true; $('#dfRunning').hidden = false; $('#dfRunning').textContent = 'Hesaplanıyor…'; $('#df3d').disabled = true;
    this.hide3d(); this.setStep(4); this.refresh();
    const id = ++this.seq;
    this.worker().postMessage({ cmd: 'deflect', id, p });
  }

  // ---------------------------------------------------------------- 4 · sonuç
  clearResult() {
    this.mc = null;
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
    const dq = p.method === 'kinetic' ? disruptionOf(p.m, p.U, r.M, parseFloat($('#dfD').value), parseFloat($('#dfRho').value)) : null, dbx = $('#dfDisrupt');
    dbx.hidden = !dq || dq.kind === 'ok'; if (dq) { dbx.className = 'unc ' + (dq.kind === 'bad' ? 'bad' : 'warn'); $('#dfDT').textContent = dq.kind === 'bad' ? 'Asteroit parçalanır' : 'Parçalanma riski'; $('#dfDD').textContent = dq.text; }
    this.renderUnc();
    this.renderTable();
    this.drawCharts();
  }
  // belirsizlik: kütle ve β (log-normal) + yörünge kovaryansı (B-düzlemi) → tohumlu Monte Carlo (uncert.js)
  renderUnc() {
    const r = this.result, p = this.lastP, T = this.target;
    const msrc = this.massEdited ? { D: +$('#dfD').value, Dmeasured: true } : (T.msrc || {});
    const sM = massSigma(msrc), sBeta = BETA_SIG, sDv = dvSigma(p.method, sM, sBeta, diamSigma(msrc)), SB = p.hypo ? null : r.SB || null;
    const mc = monteCarlo({ n0: p.hypo ? [0, 0] : [r.b0.xi, r.b0.zeta], shift: [r.dXi, r.dZeta], bE: r.b0.bE, sDv, SB, N: 4000, seed: 19 });
    this.mc = { ...mc, sDv, SB };
    const u = uncertText(mc, { hypo: p.hypo, sM, sBeta, sDv, method: p.method, SB, dvReqMps: r.dvReqMps, M: r.M, p });
    const box = $('#dfUnc'); box.hidden = false; box.className = 'unc ' + u.kind;
    $('#dfUT').textContent = u.title; $('#dfUD').replaceChildren(...u.detail.flatMap((t, k) => (k ? [' ', mk('span', null, t)] : [mk('span', null, t)])));
  }
  renderTable() {
    const r = this.result, p = this.lastP, out = $('#dfOut'); out.replaceChildren();
    const dB = Math.hypot(r.dXi, r.dZeta), bE = r.b0.bE;
    const tb = mk('table', 'tbl'), row = (k, v, cls) => { const tr = mk('tr'); if (cls) tr.className = cls; tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); };
    row('Yakın geçiş', `${etToISO(r.ca.et)} · ${distText(r.ca.dist)}`);
    row('İtki anı / önceden uyarı', `${etToISO(r.ca.et - r.leadDays * 86400, false)} · ${fmt(r.leadDays, 0)} gün (${fmt(r.leadDays / 365.25, 2)} yıl)`);
    row('Asteroit kütlesi', `${sig(r.M, 3)} kg`);
    if (p.method === 'kinetic') row('Çarpıcı', `${fmt(p.m, 0)} kg · ${fmt(p.U, 2)} km/s · β ${fmt(p.beta, 2)} · momentum ${sig(p.m * p.U * 1000, 3)} kg·m/s`);
    else if (p.method === 'tractor') row('Çekim traktörü', `${fmt(p.gm, 0)} kg · ${fmt(p.gk, 1)} yarıçap (${fmt(p.gk * p.R, 0)} m) · F ${sig(r.Fn, 3)} N × ${fmt(p.days, 0)} gün`);
    else row('Sürekli kuvvet', `${sig(r.Fn, 3)} N × ${fmt(p.days, 0)} gün · toplam itme ${sig(r.Fn * p.days * 86400, 3)} N·s`);
    if (p.method === 'kinetic') { const q = disruptionOf(p.m, p.U, r.M, parseFloat($('#dfD').value), parseFloat($('#dfRho').value)); row('Parçalanma (Q / Q*_D)', `${sig(q.Q, 2)} / ${sig(q.Qs, 2)} J/kg (%${fmt(100 * q.ratio, q.ratio < 0.1 ? 1 : 0)})`, q.kind === 'ok' ? '' : 'hl'); }
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
    const kh = this.mc ? this.mc.kQ[2] : 1, n2 = [n0[0] + kh * r.dXi, n0[1] + kh * r.dZeta];
    const ext = Math.max(bE * 1.4, Math.abs(n0[0]), Math.abs(n0[1]), Math.abs(n1[0]), Math.abs(n1[1]), Math.abs(n2[0]), Math.abs(n2[1])) * 1.15;
    const cx = w / 2, cy = h / 2 + 6, s = Math.min(w, h - 24) / 2 / ext;
    const P = (q) => [cx + q[0] * s, cy - q[1] * s];
    g.strokeStyle = '#2b313c'; g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 16); g.lineTo(cx, h); g.stroke();
    g.fillStyle = '#9aa3b2'; g.fillText('ξ', w - 12, cy - 4); g.fillText('ζ', cx + 5, 26);
    g.fillText(`Dünya'ya göre geçiş noktası (ölçek ±${kmText(ext)})`, 6, 12);
    g.setLineDash([4, 4]); g.strokeStyle = '#e66767'; g.beginPath(); g.arc(cx, cy, bE * s, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#2f6fbf'; g.beginPath(); g.arc(cx, cy, Math.max(2, R_E * s), 0, 7); g.fill();
    const a = P(n0), b = P(n1), mc = this.mc;
    if (mc && mc.SB && !p.hypo) {                                           // yörünge belirsizliği: 1σ ve 3σ elipsleri, nominal ve saptırılmış noktada
      const e = ellipse(mc.SB);
      for (const [c, q] of [[a, '#d8dde6'], [b, '#ff8a3d']]) for (const k of [1, 3]) {
        g.strokeStyle = q; g.globalAlpha = k === 1 ? 0.7 : 0.35; g.beginPath(); g.ellipse(c[0], c[1], Math.max(1, k * e.s1 * s), Math.max(1, k * e.s2 * s), -e.ang, 0, 2 * Math.PI); g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (mc) {                                                                // itkinin belirsizliği: %5–95 kayma aralığı
      const lo = P([n0[0] + mc.kQ[0] * r.dXi, n0[1] + mc.kQ[0] * r.dZeta]), hi = P([n0[0] + mc.kQ[2] * r.dXi, n0[1] + mc.kQ[2] * r.dZeta]);
      g.strokeStyle = 'rgba(255, 138, 61, .45)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(lo[0], lo[1]); g.lineTo(hi[0], hi[1]); g.stroke(); g.lineCap = 'butt';
    }
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
