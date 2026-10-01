// Asteroit arayüzü: katalog sekmesi, bilgi kartı satırları ve saptırma laboratuvarı (deflectwork.js iş parçacığıyla).
import * as THREE from 'three';
import * as E from './engine.js';
import { AST_GROUPS } from './asteroids.js';
import { AU, R_E, massOf, etFromJd, jdFromEt, kineticDv } from './deflect.js';

const $ = (s) => document.querySelector(s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const sig = (x, n = 3) => { if (!Number.isFinite(x)) return '—'; if (x === 0) return '0'; const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return fmt(x, Math.min(d, 9)); };
const LD = 384399;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const km = (v) => (Math.abs(v) >= 1e6 ? `${sig(v / 1e6, 4)} milyon km` : `${fmt(v, Math.abs(v) >= 100 ? 0 : 1)} km`);
const dist = (v) => (v > 0.02 * AU ? `${sig(v / AU, 4)} AB` : `${km(v)} (${sig(v / LD, 3)} AM)`);
const etFromDate = (s) => etFromJd(Date.parse(s + 'T00:00:00Z') / 86400000 + 2440587.5) + 69.184;
const dateOfEt = (et, withTime = true) => { const ms = (jdFromEt(et) - 2440587.5) * 86400000 - 69184; const s = new Date(ms).toISOString(); return withTime ? s.slice(0, 16).replace('T', ' ') : s.slice(0, 10); };
const DIRS = { along: 'yörünge boyunca (ileri)', anti: 'yörünge boyunca (geri)', best: 'en etkili yön (STM)', radial: "radyal (Güneş'ten dışa)", normal: 'yörünge normali' };
const RHO = (spec) => (/^[CBFGD]/.test(spec || '') ? 1400 : /^[SQVAKLR]/.test(spec || '') ? 2600 : /^[MXE]/.test(spec || '') ? 3500 : 2000);

export class AstUI {
  constructor({ world, asts, getT, focusOn, setCam, ui }) {
    Object.assign(this, { world, asts, getT, focusOn, setCam, ui });
    this.target = null; this.cas = []; this.caSel = -1; this.result = null; this.seq = 0; this.w = null;
    // katalog sekmesi
    $('#chkAst').addEventListener('change', (e) => { asts.enabled = e.target.checked; });
    let tmr = null;
    $('#astSearch').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.search(e.target.value, '#astResults', (i) => { asts.select(i); $('#astSearch').value = asts.label(i); }), 150); });
    $('#dfSearch').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.search(e.target.value, '#dfResults', (i) => { $('#dfSearch').value = asts.label(i); this.setTarget(i); }), 150); });
    for (const s of ['#astSearch', '#dfSearch']) $(s).addEventListener('keydown', (e) => e.stopPropagation());
    document.querySelectorAll('#tab-saptirma input, #tab-saptirma select').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
    asts.onChange = () => { this.renderCatalog(); if (this.ui.pick && this.ui.pick.kind === 'ast') this.ui.renderPick(this.getT()); };
    // laboratuvar
    $('#dfMethod').addEventListener('change', () => { const k = $('#dfMethod').value === 'kinetic'; $('#dfKin').hidden = !k; $('#dfThr').hidden = k; });
    for (const id of ['#dfD', '#dfRho']) $(id).addEventListener('input', () => { this.massEdited = true; this.renderMass(); });
    $('#dfScan').addEventListener('click', () => this.scan());
    $('#dfRun').addEventListener('click', () => this.compute());
    $('#df3d').addEventListener('click', () => this.show3d());
    $('#dfDart').textContent = this.dartText();
    this.renderCatalog();
    // 3B yollar (Dünya merkezli)
    const line = (c, op) => { const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(260 * 3), 3)),
      new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op, toneMapped: false })); l.frustumCulled = false; l.visible = false; world.scene.add(l); return l; };
    this.pathN = line(0xd8dde6, 0.8); this.pathD = line(0xff8a3d, 0.95);
    this.lblN = mk('div', 'lbl lbl-df', 'nominal'); this.lblD = mk('div', 'lbl lbl-df2', 'saptırılmış');
    for (const l of [this.lblN, this.lblD]) { l.style.display = 'none'; $('#labels').appendChild(l); }
  }

  // ---------------------------------------------------------------- katalog
  renderCatalog() {
    const A = this.asts, st = $('#astStatus'); st.replaceChildren();
    const line = (t) => st.appendChild(mk('div', null, t));
    if (A.n > 0) {
      line(`${fmt(A.n, 0)} asteroit · kaynak: JPL SBDB${A.sentry.size ? ` · Sentry risk listesi ${fmt(A.sentry.size, 0)}` : ''}`);
      for (const k of ['neo', 'mb']) if (A.sets[k]) line(`${A.sets[k].aciklama}: ${fmt(A.sets[k].n, 0)} (alındı ${new Date(A.sets[k].t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })})`);
      if (A.info.status !== 'hazır') line(A.info.status);
      if (A.nearCount != null) line(`Şu an Dünya'nın 0,05 AB (≈19 Ay uzaklığı) içinde: ${fmt(A.nearCount, 0)} asteroit. Güneş sistemi kamerası dışındaki görünümlerde yalnız bunlar çizilir.`);
      const b = mk('button', 'sm', 'Tümünü Güneş sistemi görünümünde göster');
      b.addEventListener('click', () => { this.setCam('SOLAR'); Object.assign(this.world.cam, { dist: 8.5e8, el: 1.05 }); });
      const row = mk('div', 'daterow'); row.appendChild(b); st.appendChild(row);
    } else line(A.info.status);
    const ul = $('#astGroups'); ul.replaceChildren();
    if (A.counts) AST_GROUPS.forEach((g, i) => {
      const li = mk('li'), cb = mk('input'); cb.type = 'checkbox'; cb.checked = !!A.mask[i]; cb.addEventListener('change', () => A.setMask(i, cb.checked));
      const sw = mk('span', 'sw'); sw.style.background = '#' + g.color.toString(16).padStart(6, '0');
      li.append(cb, sw, mk('span', null, g.name), mk('span', 'v', fmt(A.counts[i], 0))); ul.appendChild(li);
    });
    const sel = $('#astSel'); sel.replaceChildren();
    if (A.sel >= 0) {
      const b = mk('b', null, A.label(A.sel)); sel.appendChild(b);
      const bt = mk('div', 'daterow');
      const f = mk('button', 'sm', 'Kamerayla izle'); f.addEventListener('click', () => this.follow(A.sel));
      const d = mk('button', 'sm', 'Saptırma analizi'); d.addEventListener('click', () => this.openLab(A.sel));
      const x = mk('button', 'sm', 'Seçimi kaldır'); x.addEventListener('click', () => { A.select(-1); $('#astSearch').value = ''; });
      bt.append(f, d, x); sel.appendChild(bt);
    }
  }
  renderUpdater(U) { for (const id of ['#updStatus', '#updStatus2']) { const el = $(id); if (!el) continue; el.replaceChildren(...U.text().map((t) => mk('div', null, t))); } }
  search(q, ulSel, onPick) {
    const A = this.asts, ul = $(ulSel); ul.replaceChildren();
    if (!q) return;
    for (const i of A.search(q)) {
      const li = mk('li', null, `${A.label(i)} · ${A.C.cls[i]}${A.C.pha[i] ? ' · PHA' : ''}`);
      li.addEventListener('click', () => { onPick(i); ul.replaceChildren(); });
      ul.appendChild(li);
    }
  }
  follow(i) {
    const A = this.asts; A.select(i);
    const R = A.diam(i) / 2;
    this.focusOn({ kind: 'ast', fn: (t) => A.selPos(t), R }, Math.max(8 * R, 30));
    // Güneş'in aydınlattığı yandan bak (ekliptik tabanlı odak çerçevesi)
    const [r] = A.helio(i, this.getT()), n = Math.hypot(...r), d = r.map((x) => -x / n);
    const B1 = [0, 0.9174820621, 0.3977771559], B2 = [0, -0.3977771559, 0.9174820621];
    const az = Math.atan2(d[1] * B1[1] + d[2] * B1[2], d[0]), el = Math.asin(d[1] * B2[1] + d[2] * B2[2]);
    Object.assign(this.world.cam, { az: az + 0.7, el: Math.max(-1.2, Math.min(1.2, el + 0.25)) });
  }

  // ---------------------------------------------------------------- bilgi kartı
  card(d) {
    const rows = [];
    rows.push(['Grup', d.group], ['Sınıf', d.cls]);
    rows.push(['Mutlak parlaklık H', fmt(d.H, 2)], ['Çap', `${sig(d.D, 3)} km ${d.Dmeas ? '(ölçülmüş)' : '(H ve albedodan tahmini)'}`]);
    if (d.alb) rows.push(['Albedo', fmt(d.alb, 3)]);
    if (d.rot) rows.push(['Dönme periyodu', `${sig(d.rot, 4)} sa`]);
    if (d.spec) rows.push(['Tayf türü', d.spec]);
    rows.push(['a / e / i', `${fmt(d.a, 4)} AB / ${fmt(d.e, 4)} / ${fmt(d.inc, 2)}°`], ['Günberi / günöte', `${fmt(d.q, 4)} / ${fmt(d.Q, 4)} AB`],
      ['Yörünge periyodu', d.P > 2 ? `${fmt(d.P, 2)} yıl` : `${fmt(d.P * 365.25, 1)} gün`],
      ['Dünya MOID', d.moid != null ? `${fmt(d.moid, 5)} AB (${sig(d.moid * AU / LD, 3)} AM)` : '—'],
      ["Güneş'e uzaklık", `${fmt(d.dSun, 4)} AB`], ["Dünya'ya uzaklık", dist(d.dEarth)], ['Güneş merkezli hız', `${fmt(d.v, 2)} km/s`]);
    if (d.nextCa) rows.push(['Sonraki yakın geçiş (JPL)', `${d.nextCa.cd} · ${dist(d.nextCa.dist)}`]);
    if (d.sentry) rows.push(['Sentry çarpma olasılığı', `${sig(d.sentry.ip, 2)} (${d.sentry.range}, Palermo ${fmt(d.sentry.ps, 2)})`]);
    if (d.discovery) rows.push(['Keşif', d.discovery]);
    rows.push(['Yörünge belirsizliği (U)', `${d.cc || '—'} (0 en iyi, 9 en kötü)`], ['Gözlem yayı', d.arc ? `${fmt(d.arc, 0)} gün` : '—'],
      ['Öğelerin yaşı', `${fmt(d.epochAgeDays, 0)} gün (JPL SBDB)`]);
    if (d.shape) rows.push(['3B şekil modeli', `gerçek şekil (${d.shape.kaynak})${d.shape.damit ? ' · dönme ekseni ve fazı modelden' : ' · NASA PDS Küçük Cisimler Düğümü'} · hacim eşdeğeri yarıçap ${fmt(d.shape.req_km, d.shape.req_km < 1 ? 3 : 1)} km`]);
    if (d.detailLoading) rows.push(['Ayrıntılar', 'JPL SBDB’den alınıyor…']);
    if (d.detailErr) rows.push(['Ayrıntılar', 'alınamadı (' + String(d.detailErr).replace(/<[^>]*>/g, '').slice(0, 60) + ')']);
    const fn = (d.fullname || '').trim();
    return { title: d.name, sub: `${fn && fn !== d.name ? fn : 'JPL Small-Body Database'}${d.pha ? ' · potansiyel tehlikeli' : ''}`, rows };
  }

  // ---------------------------------------------------------------- saptırma laboratuvarı
  openLab(i) { this.ui.setTab('saptirma'); $('#dfSearch').value = this.asts.label(i); this.setTarget(i); }
  async setTarget(i) {
    const A = this.asts;
    this.target = { i, name: A.label(i), des: A.C.des[i] }; this.cas = []; this.caSel = -1; this.result = null; this.hide3d();
    const t = this.getT(), today = dateOfEt(t + (E.jdTdb(0) - 2451545) * 86400, false);
    if (!$('#dfStart').value) $('#dfStart').value = today;
    if (!$('#dfApply').value) $('#dfApply').value = today;
    const det = await A.fetchDetail(i), d = A.details(i, t);
    let el = A.elementsOf(i), src = 'katalog öğeleri (12 hane)';
    if (det && det.orbit && det.orbit.elements) {
      const e = {}; for (const x of det.orbit.elements) e[x.name] = +x.value;
      if (Number.isFinite(e.a) && Number.isFinite(e.ma)) { el = { a: e.a, e: e.e, i: e.i, om: e.om, w: e.w, ma: e.ma, epoch: +det.orbit.epoch }; src = `JPL çözümü ${det.orbit.orbit_id || ''} (tam duyarlık)`; }
    }
    this.target.el = el; this.target.src = src; this.target.ca = (det && det.ca_data) || [];
    $('#dfD').value = +d.D.toPrecision(4); this.massEdited = false;
    $('#dfRho').value = d.rho || RHO(d.spec);
    this.target.GM = d.GM || (A.C.gm[i] > 0 ? A.C.gm[i] : 0);
    const tg = $('#dfTarget'); tg.replaceChildren(mk('b', null, this.target.name),
      mk('div', null, `${d.cls} · H ${fmt(d.H, 2)} · MOID ${fmt(d.moid, 5)} AB${d.sentry ? ` · Sentry olasılığı ${sig(d.sentry.ip, 2)}` : ''}`),
      mk('div', 'k', 'Başlangıç durumu: ' + src));
    this.renderMass(); this.renderCas(); $('#dfOut').replaceChildren(); this.clearCharts();
    this.scan();
  }
  mass() {
    const D = parseFloat($('#dfD').value), rho = parseFloat($('#dfRho').value);
    return massOf({ D, rho, GM: this.target && this.target.GM && !this.massEdited ? this.target.GM : 0 });
  }
  renderMass() {
    if (!this.target) return;
    const M = this.mass();
    $('#dfM').textContent = `Kütle ≈ ${sig(M, 3)} kg${this.target.GM && !this.massEdited ? ' (ölçülmüş GM)' : ''}`;
  }
  worker() {
    if (this.w) return this.w;
    this.w = new Worker(new URL('./deflectwork.js', import.meta.url), { type: 'module' });
    this.w.onmessage = (e) => this.onMsg(e.data);
    this.w.onerror = (e) => { $('#dfStatus').textContent = 'Hesap iş parçacığı hatası: ' + (e.message || ''); };
    return this.w;
  }
  kill() { if (this.w && this.busy) { this.w.terminate(); this.w = null; } }
  scan() {
    if (!this.target) return;
    const start = $('#dfStart').value, years = Math.max(1, Math.min(120, +$('#dfYears').value || 50));
    if (!/^\d{4}-\d\d-\d\d$/.test(start)) return;
    this.kill(); this.busy = true; this.mode = 'scan'; this.caSel = -1; this.cas = []; this.renderCas();
    const id = ++this.seq;
    $('#dfScanStatus').textContent = 'Yakın geçişler taranıyor…';
    this.worker().postMessage({ cmd: 'target', id, el: this.target.el, etStart: etFromDate(start), years, name: this.target.name });
  }
  compute() {
    if (!this.target || this.caSel < 0) { $('#dfStatus').textContent = 'Önce bir yakın geçiş seçin.'; return; }
    const method = $('#dfMethod').value, M = this.mass();
    const p = { ca: this.caSel, method, M, etApply: etFromDate($('#dfApply').value), dir: $('#dfDir').value, hypo: $('#dfHypo').checked,
      m: +$('#dfMass').value, U: +$('#dfU').value, beta: +$('#dfBeta').value, F: +$('#dfF').value, days: +$('#dfDays').value };
    if (!(M > 0)) { $('#dfStatus').textContent = 'Çap ve yoğunluk girin.'; return; }
    this.kill(); this.busy = true; this.mode = 'deflect'; this.lastP = p;
    const id = ++this.seq;
    $('#dfStatus').textContent = 'Hesaplanıyor…'; $('#df3d').disabled = true;
    this.worker().postMessage({ cmd: 'deflect', id, p });
  }
  onMsg(d) {
    if (d.id !== this.seq) return;
    if (d.type === 'progress') { $(this.mode === 'scan' ? '#dfScanStatus' : '#dfStatus').textContent = d.msg; return; }
    this.busy = false;
    if (d.type === 'error') { $('#dfStatus').textContent = 'Hata: ' + d.msg; $('#dfScanStatus').textContent = ''; return; }
    if (d.type === 'target') {
      this.cas = d.cas; this.lastP = null;
      $('#dfScanStatus').textContent = `${dateOfEt(d.et0, false)} – ${dateOfEt(d.et1, false)}: ${d.cas.length} yakın geçiş (< 0,05 AB) · ${fmt(d.ms / 1000, 1)} s`;
      if (d.cas.length) this.caSel = d.cas.reduce((b, c, k) => (c.dist < d.cas[b].dist ? k : b), 0);
      this.renderCas();
      if (!d.cas.length) $('#dfStatus').textContent = 'Bu aralıkta 0,05 AB içinde yakın geçiş yok; tarama süresini artırın ya da başka hedef seçin.';
      else $('#dfStatus').textContent = '';
    } else if (d.type === 'deflect') { this.result = d.r; this.renderResult(); $('#df3d').disabled = false; $('#dfStatus').textContent = ''; }
  }
  renderCas() {
    const tb = $('#dfCas tbody'); tb.replaceChildren();
    const jpl = this.target ? this.target.ca : [];
    this.cas.forEach((c, k) => {
      const tr = mk('tr'); tr.className = k === this.caSel ? 'on' : '';
      const rb = mk('input'); rb.type = 'radio'; rb.name = 'dfca'; rb.checked = k === this.caSel;
      const pick = () => { this.caSel = k; this.renderCas(); };
      rb.addEventListener('change', pick); tr.addEventListener('click', pick);
      const date = dateOfEt(c.et);
      // JPL CAD ile karşılaştırma (aynı gün)
      const [yy, mo, dd] = date.slice(0, 10).split('-'), key = `${yy}-${MON[+mo - 1]}-${dd}`;
      const j = jpl.find((x) => x.cd && x.cd.slice(0, 11) === key);
      const dcell = mk('td', 'num', dist(c.dist));
      if (j) dcell.title = `JPL CAD: ${j.cd} · ${km(+j.dist * AU)}`;
      const td0 = mk('td'); td0.appendChild(rb);
      tr.append(td0, mk('td', null, date + (j ? ' ✓' : '')), dcell, mk('td', 'num', c.bp ? fmt(c.bp.vinf, 2) + ' km/s' : '—'));
      tb.appendChild(tr);
    });
  }
  renderResult() {
    const r = this.result, p = this.lastP, out = $('#dfOut'); out.replaceChildren();
    const hypo = p.hypo, dB = Math.hypot(r.dXi, r.dZeta), bE = r.b0.bE;
    const tb = mk('table', 'tbl'), row = (k, v, cls) => { const tr = mk('tr'); if (cls) tr.className = cls; tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); };
    row('Yakın geçiş', `${dateOfEt(r.ca.et)} · ${dist(r.ca.dist)}`);
    row('İtki anı / önceden uyarı', `${dateOfEt(r.ca.et - r.leadDays * 86400, false)} · ${fmt(r.leadDays, 0)} gün (${fmt(r.leadDays / 365.25, 2)} yıl)`);
    row('Asteroit kütlesi', `${sig(r.M, 3)} kg`);
    if (p.method === 'kinetic') row('Çarpıcı', `${fmt(p.m, 0)} kg · ${fmt(p.U, 2)} km/s · β ${fmt(p.beta, 2)} · momentum ${sig(p.m * p.U * 1000, 3)} kg·m/s`);
    else row('Sürekli kuvvet', `${sig(r.Fn, 3)} N × ${fmt(p.days, 0)} gün · toplam itme ${sig(r.Fn * p.days * 86400, 3)} N·s`);
    row('Hız değişimi Δv', `${sig(r.dvMps * 1000, 3)} mm/s (${DIRS[p.dir]})`);
    row('Yarı büyük eksen / periyot', `${r.orbit.da >= 0 ? '+' : ''}${sig(r.orbit.da, 3)} km / ${r.orbit.dP >= 0 ? '+' : ''}${sig(r.orbit.dP, 3)} s`);
    row('B-düzleminde kayma |ΔB|', `${km(dB)} = ${sig(dB / R_E, 3)} R⊕`, 'hl');
    row('  Δζ (zamanlama) / Δξ', `${fmt(r.dZeta, 1)} / ${fmt(r.dXi, 1)} km`);
    if (p.method === 'kinetic') row('  doğrusal tahmin (STM)', `${fmt(Math.hypot(r.lin.dXi, r.lin.dZeta), 1)} km`);
    if (r.dtCa != null) row('Geçiş anındaki kayma', `${fmt(r.dtCa, 1)} s`);
    row('Yakalama yarıçapı bE', `${km(bE)} (v∞ ${fmt(r.b0.vinf, 2)} km/s, çekim odaklaması dahil)`);
    let verdict;
    if (hypo) {
      verdict = dB >= bE ? `Kurtarır: çarpma rotasındaki cisim Dünya'yı ${km(dB - bE)} farkla ıskalar` : `Yetmez: çarpma noktası yalnız ${km(dB)} kayar (Dünya'yı ıskalatmak için ${km(bE)} gerekir)`;
    } else {
      const after = r.after ? r.after.dist : null;
      verdict = `En yakın geçiş: ${dist(r.b0.rp)} → ${after != null ? dist(r.after.rp) : '—'}` + (r.after && r.after.impact ? ' — ÇARPMA' : '');
    }
    row('Sonuç', verdict, dB >= bE || !hypo ? 'good' : 'bad');
    const req = r.dvReqMps;
    row('Bir yakalama yarıçapı kaydırmak için', p.method === 'kinetic'
      ? `Δv ${sig(req * 1000, 3)} mm/s ≈ ${sig(req * r.M / (p.beta * p.U * 1000), 3)} kg çarpıcı (aynı hız ve β)`
      : `Δv ${sig(req * 1000, 3)} mm/s ≈ ${sig(r.FreqN, 3)} N × ${fmt(p.days, 0)} gün`, 'hl');
    out.appendChild(tb);
    this.drawBplane(); this.drawSweep();
  }
  clearCharts() { for (const id of ['#dfBplane', '#dfSweep']) { const c = $(id); c.getContext('2d').clearRect(0, 0, c.width, c.height); } }
  prep(c) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '11px system-ui, sans-serif'; return { g, w, h };
  }
  drawBplane() {
    const r = this.result, p = this.lastP; if (!r) return;
    const { g, w, h } = this.prep($('#dfBplane'));
    const n0 = p.hypo ? [0, 0] : [r.b0.xi, r.b0.zeta], n1 = [n0[0] + r.dXi, n0[1] + r.dZeta], bE = r.b0.bE;
    const ext = Math.max(bE * 1.4, Math.abs(n0[0]), Math.abs(n0[1]), Math.abs(n1[0]), Math.abs(n1[1])) * 1.15;
    const cx = w / 2, cy = h / 2 + 6, s = Math.min(w, h - 24) / 2 / ext;
    const P = (q) => [cx + q[0] * s, cy - q[1] * s];
    g.strokeStyle = '#2b313c'; g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 16); g.lineTo(cx, h); g.stroke();
    g.fillStyle = '#9aa3b2'; g.fillText('ξ', w - 12, cy - 4); g.fillText('ζ', cx + 5, 26);
    g.fillText(`B-düzlemi (Dünya merkezli, ölçek ±${km(ext)})`, 6, 12);
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
      g.fillStyle = '#9aa3b2'; g.fillText(`yakın plan: ${km(dB)}`, bx + 4, by + 12);
      g.fillStyle = '#d8dde6'; g.fillText(p.hypo ? 'çarpma noktası (varsayım)' : 'nominal', 6, h - 8);
      g.fillStyle = '#ff8a3d'; g.fillText('saptırılmış', 6, h - 22);
    } else {
      g.fillStyle = '#d8dde6'; g.fillText(p.hypo ? 'çarpma noktası (varsayım)' : 'nominal', a[0] + 7, a[1] + 14);
      g.fillStyle = '#ff8a3d'; g.fillText('saptırılmış', b[0] + 7, b[1] - 6);
    }
  }
  drawSweep() {
    const r = this.result; if (!r || !r.sweep.length) return;
    const { g, w, h } = this.prep($('#dfSweep'));
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
  dartText() {
    const M = 4.3e9, dv = kineticDv(579.4, 6.1449, 3.61, M), a = 1206, P = 11.921 * 3600, v = 2 * Math.PI * a / P;
    return `Doğrulama — DART/Dimorphos (2022): 579 kg, 6,14 km/s, β = 3,61, M = 4,3×10⁹ kg → başa baş Δv = ${fmt(dv * 1000, 2)} mm/s. `
      + `Ölçülen yörünge boyu bileşen 2,70 mm/s, ikili yörünge periyodunda ${fmt(3 * P * 2.7e-3 / v / 60, 1)} dk kısalma verir (gözlenen 33,0 ± 1,0 dk). `
      + 'Apophis 2029 yakın geçişi bu motorla JPL CAD değerinden ~2 km farkla bulunur.';
  }
  // ---------------------------------------------------------------- 3B yollar
  show3d() {
    const r = this.result; if (!r) return;
    this.paths = { N: r.pathN, D: r.pathD };
    const cdist = r.after ? Math.min(r.ca.dist, r.after.dist) : r.ca.dist;
    this.setCam('EARTH'); Object.assign(this.world.cam, { dist: Math.max(4 * cdist, 50000), el: 0.5 });
    this.ui.setTab('saptirma');
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
