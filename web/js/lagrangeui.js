// Laboratuvar › Lagrange noktaları: arayüz (dört adım ve dönen çerçeve çizimi). Hesap lagrange.js'te (saf, Node'da sınanır).
// Tümleme kısa sürer (Dünya–Ay L1, 60 gün: ~40 ms); halo üyesi yarım saniyeye dek sürebilir: hesaptan önce durum yazılır, çizim sonraki karede.
import * as G from './lagrange.js';
import { fmt } from './format.js';
import { $ } from './uiutil.js';
import { t, workerOpts } from './i18n.js';

const IDS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const COL = { grid: '#2b313c', text: '#9aa3b2', p1: '#f2c94c', p1e: '#2f6fbf', p2: '#c9ced6', bad: '#ff8a3d', good: '#34d399', path: '#60a5fa', halo: '#b48cff', forb: [148, 163, 184, 70] };
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const muText = (mu) => (mu >= 1e-3 ? fmt(mu, 5) : mu.toExponential(2).replace('.', ','));
const cText = (c, sys) => fmt(c, sys.id === 'se' ? 6 : 4);

export class LagrangeUI {
  // onFly(profil): Ay görevini o halo profiliyle açar (app.js); onLink(o): adres çubuğunu yazar
  constructor({ onFly = null, onLink = null } = {}) {
    this.onFly = onFly; this.onLink = onLink; this.shown = false;
    this.st = { sys: 'em', mu: 0.012150584, point: 'L1', drKm: 10, dvMps: 0, dir: 'x', days: 60, Cj: null, haloL: '2', haloAz: 13000, step: 1, view: null, proj: 'xz' };
    this.run = null; this.halo = null;
    const L = G.lgStateFromLink(new URLSearchParams(location.search));
    if (L) { Object.assign(this.st, L); this.fromLink = true; }
    const root = $('#lab-lagrange');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      const d = b.dataset;
      if (d.lgsys) this.setSys(d.lgsys);
      else if (d.lgview) { this.st.view = d.lgview; this.syncChips(); this.draw(); }
      else if (d.lggo) this.open(+d.lggo);
      else if (d.lgc) { this.st.Cj = +d.lgc; this.syncC(); this.draw(); this.link(); }
      else if (d.lgpt) { this.st.point = d.lgpt; this.run = null; this.st.view = null; this.syncChips(); this.renderRun(); this.draw(); this.link(); }
      else if (d.lgfam) { this.st.haloL = d.lgfam; this.syncChips(); this.computeHalo(); }
      else if (d.lgproj) { this.st.proj = d.lgproj; this.syncChips(); this.draw(); }
    });
    for (const li of root.querySelectorAll('[data-lgstep] > .sh')) li.addEventListener('click', () => this.open(+li.parentElement.dataset.lgstep));
    $('#lgMu').addEventListener('input', () => { this.st.mu = 10 ** +$('#lgMu').value; this.st.Cj = null; this.run = null; this.renderSys(); this.draw(); });
    $('#lgMu').addEventListener('change', () => this.link());
    $('#lgC').addEventListener('input', () => { const [a, b] = this.cRange(); this.st.Cj = a + (b - a) * +$('#lgC').value / 1000; this.syncC(); this.drawSoon(); });
    $('#lgC').addEventListener('change', () => this.link());
    $('#lgAz').addEventListener('input', () => { $('#lgAzVal').textContent = fmt(+$('#lgAz').value, 0) + ' km'; });
    $('#lgAz').addEventListener('change', () => { this.st.haloAz = +$('#lgAz').value; this.computeHalo(); });
    $('#lgRun').addEventListener('click', () => this.doRun());
    $('#lgFly').addEventListener('click', () => { if (this.halo && this.halo.preset && this.onFly) this.onFly(this.halo.preset); });
    $('#lgLink').addEventListener('click', () => this.copyLink());
    for (const [id, k] of [['lgDr', 'drKm'], ['lgDv', 'dvMps'], ['lgDays', 'days']]) $('#' + id).addEventListener('change', () => { const v = +$('#' + id).value; if (Number.isFinite(v) && v >= 0) this.st[k] = v; });
    $('#lgDir').addEventListener('change', () => { this.st.dir = $('#lgDir').value; });
    if (window.ResizeObserver) new ResizeObserver(() => { if (this.shown) { this.draw(); this.drawDist(); } }).observe($('#lgMap'));
  }
  get sys() { return G.systemOf(this.st.sys, this.st.mu); }
  // deney sayfası açılınca (app.js): ilk kez çizer; bağlantıyla gelindiyse deneyi de koşar
  show() {
    const first = !this.shown; this.shown = true;
    if (first) {
      this.worker(); this.fill(); this.renderSys();
      if (this.fromLink && this.st.point) { this.doRun(true); }
      if (this.fromLink && this.st.haloL) this.computeHalo(true);
    }
    this.draw(); this.drawDist(); this.link();
  }
  // ---------------------------------------------------------------- durum → arayüz
  fill() {
    const p = $('#lgPoint'); p.replaceChildren(...IDS.map((id) => { const b = mk('button', 'chip', id); b.type = 'button'; b.dataset.lgpt = id; return b; }));
    $('#lgDr').value = this.st.drKm; $('#lgDv').value = this.st.dvMps; $('#lgDays').value = this.st.days; $('#lgDir').value = this.st.dir;
    this.syncChips(); this.open(this.st.step || 1, true);
  }
  syncChips() {
    const on = (sel, key, v) => document.querySelectorAll(sel).forEach((b) => { const x = b.dataset[key] === v; b.classList.toggle('on', x); b.setAttribute('aria-pressed', x ? 'true' : 'false'); });
    on('[data-lgsys]', 'lgsys', this.st.sys); on('[data-lgpt]', 'lgpt', this.st.point); on('[data-lgfam]', 'lgfam', this.st.haloL); on('[data-lgproj]', 'lgproj', this.st.proj);
    on('[data-lgview]', 'lgview', this.viewMode());
    $('#lgMuRow').hidden = this.st.sys !== 'ozel';
    const fam = this.st.haloL, rng = G.HALO_AZ[fam === '1' ? 1 : 2];
    $('#lgAzRow').hidden = fam === 'nrho'; $('#lgAz').min = rng[0]; $('#lgAz').max = rng[1];
    $('#lgAz').value = Math.min(rng[1], Math.max(rng[0], this.st.haloAz)); $('#lgAzVal').textContent = fmt(+$('#lgAz').value, 0) + ' km';
  }
  open(n, quiet = false) {
    this.st.step = n;
    for (const li of document.querySelectorAll('#lgSteps > [data-lgstep]')) {
      const o = +li.dataset.lgstep === n; li.classList.toggle('open', o); li.querySelector('.sh').setAttribute('aria-expanded', o ? 'true' : 'false');
    }
    if (n === 4 && !this.halo && !this.haloBusy) this.computeHalo();
    if (!quiet) { this.syncChips(); this.draw(); this.drawDist(); }
  }
  setSys(id) {
    if (id === this.st.sys) return;
    this.st.sys = id; this.st.Cj = null; this.run = null; this.st.view = null;
    this.syncChips(); this.renderSys(); this.renderRun(); this.draw(); this.link();
  }
  cRange() {
    const P = this.P, c1 = P[0].C, c4 = P[3].C, d = Math.max(c1 - c4, 1e-9);
    return [c4 - 0.15 * d, c1 + 0.15 * d];
  }
  renderSys() {
    const S = this.sys; this.P = G.points(S.mu); this.I = this.P.map((p) => G.pointInfo(p, S));
    $('#lgMu').value = Math.log10(this.st.mu); $('#lgMuVal').textContent = 'μ = ' + muText(S.mu);
    const tb = $('#lgPts tbody'); tb.replaceChildren();
    for (const p of this.I) {
      const tr = mk('tr'), st = p.lin.stable ? t('kararlı: salınım {0}', G.fmtDays(Math.max(...p.oscDays))) : t('kararsız: e-katlanma {0}', G.fmtDays(p.efoldDays));
      tr.append(mk('td', null, p.id), mk('td', 'num', G.fmtKm(p.d2Km)), mk('td', 'num', cText(p.C, S)), mk('td', p.lin.stable ? 'good' : 'bad', st)); tb.appendChild(tr);
    }
    const note = S.id === 'em' ? 'Dünya–Ay: μ = 0,01215. L1 ve L2 Ay\'ın iki yanında, halo yörüngeleri ve Gateway (NRHO) burada.'
      : S.id === 'se' ? 'Güneş–Dünya: μ = 3,04·10⁻⁶. L1\'de SOHO, L2\'de James Webb Uzay Teleskobu durur; L4 çevresinde Dünya\'nın Truva asteroidi 2010 TK7 salınır.'
      : (S.mu < G.MU_ROUTH ? 'Varsayımsal sistem (Dünya–Ay ölçeğinde): μ Routh sınırının (0,0385) altında, L4/L5 kararlı.' : 'Varsayımsal sistem (Dünya–Ay ölçeğinde): μ Routh sınırının (0,0385) üstünde, L4/L5 de kararsız.');
    $('#lgSysNote').textContent = note;
    $('#lgSum1').textContent = `${S.id === 'ozel' ? t('Varsayımsal') : S.name} · μ = ${muText(S.mu)}`;
    const snap = $('#lgCSnap'); snap.replaceChildren(...['L1', 'L2', 'L3', 'L4'].map((id, k) => { const b = mk('button', 'chip', id === 'L4' ? 'C(L4, L5)' : `C(${id})`); b.type = 'button'; b.dataset.lgc = String(this.P[k].C); return b; }));
    if (!Number.isFinite(this.st.Cj)) this.st.Cj = 0.5 * (this.P[0].C + this.P[1].C);          // L1 açık, L2 kapalı: en öğretici ara
    this.syncC();
  }
  syncC() {
    const S = this.sys, [a, b] = this.cRange(), C = this.st.Cj;
    $('#lgC').value = String(Math.round(1000 * (C - a) / (b - a))); $('#lgCVal').textContent = 'C = ' + cText(C, S);
    const g = G.gates(C, this.P);
    const txt = !g.L1 ? 'Kapılar kapalı: araç başladığı cismin çevresinde hapsolur (öbür cisme geçemez, sistemden çıkamaz).'
      : !g.L2 ? 'L1 kapısı açık: araç iki cisim arasında gidip gelebilir ama sistemden çıkamaz.'
      : !g.L3 ? 'L1 ve L2 açık: araç küçük cismin ötesinden sistemden çıkabilir.'
      : !g.L4 ? 'L3 de açık: yalnız L4 ve L5 çevresindeki bölgeler yasak.'
      : 'Tüm bölgeler açık: bu enerjide hiçbir yer yasak değil. Ay\'a giden araçlar TLI\'dan sonra bu enerjidedir (Apollo: C ≈ 2).';
    $('#lgGate').textContent = txt;
    $('#lgSum2').textContent = `C = ${cText(C, S)} · ${!g.L1 ? t('kapılar kapalı') : !g.L2 ? t('L1 açık') : !g.L3 ? t('L1, L2 açık') : !g.L4 ? t('L3 de açık') : t('her yer açık')}`;
  }
  // ---------------------------------------------------------------- deney
  doRun(quiet = false) {
    const S = this.sys, u = G.DIRS[this.st.dir] || G.DIRS.x;
    for (const [id, k] of [['lgDr', 'drKm'], ['lgDv', 'dvMps'], ['lgDays', 'days']]) { const v = +$('#' + id).value; if (Number.isFinite(v) && v >= 0) this.st[k] = Math.min(k === 'days' ? 3650 : 1e6, v); }
    this.st.dir = $('#lgDir').value;
    if (!(this.st.drKm > 0) && !(this.st.dvMps > 0)) { this.run = null; this.renderRun(t('Konum ya da hız hatası verin: hatasız araç noktada sonsuza dek durur (kuramda).')); return; }
    this.run = G.runFrom(S, this.st.point, { dr: u.map((x) => x * this.st.drKm), dv: u.map((x) => x * this.st.dvMps), days: this.st.days || 60 });
    this.st.view = null; this.renderRun(); this.syncChips(); this.draw(); this.drawDist();
    if (!quiet) this.link();
  }
  renderRun(msg = '') {
    const box = $('#lgVerdict'), r = this.run;
    $('#lgDist').hidden = !r; $('#lgDistNote').hidden = !r;
    if (!r) { box.hidden = !msg; box.className = 'verdict info'; $('#lgVT').textContent = msg ? t('Deney yok') : ''; $('#lgVD').textContent = msg; $('#lgVTbl tbody').replaceChildren(); $('#lgSum3').textContent = t('Henüz denenmedi'); return; }
    const S = this.sys, v = G.verdict(r, S), I = this.I.find((p) => p.id === r.id);
    box.hidden = false; box.className = 'verdict ' + v.kind; $('#lgVT').textContent = v.title; $('#lgVD').textContent = v.detail;
    const rows = [];
    rows.push(['Başlangıç hatası', `${G.fmtKm(this.st.drKm)} · ${fmt(this.st.dvMps, 2)} m/s`]);
    if (I.lin.stable) rows.push(['Doğrusal kuram', t('kararlı: salınım {0}', G.fmtDays(Math.max(...I.oscDays)))]);
    else rows.push(['e-katlanma (doğrusal kuram)', G.fmtDays(I.efoldDays)]);
    // ölçülen oran yalnız saf üstel bölgede anlamlı: L3'te e-katlanma (Dünya–Ay 24 gün) salınım periyoduna (27 gün) yakın, büyüme salınımla karışır → gösterilmez
    if (r.growthMeas && r.growthLin > 0 && Math.abs(r.growthMeas / r.growthLin - 1) < 0.25) rows.push(['e-katlanma (tümlemeden ölçülen)', G.fmtDays(1 / r.growthMeas)]);
    if (r.tLeave != null) rows.push(['Noktadan ayrılış', G.fmtDays(r.tLeave)]);
    rows.push(['Noktaya en büyük uzaklık', G.fmtKm(r.maxKm)]);
    rows.push(['Jacobi sabitinin kayması', r.dC.toExponential(1).replace('.', ',') + ' (' + t('tümleme doğruluğu') + ')']);
    const tb = $('#lgVTbl tbody'); tb.replaceChildren();
    for (const [k, val] of rows) { const tr = mk('tr'); tr.append(mk('td', null, t(k)), mk('td', 'num', val)); tb.appendChild(tr); }
    $('#lgSum3').textContent = v.title;
  }
  // ---------------------------------------------------------------- halo
  // hesap iş parçacığında (lagrangework.js); kaydırıcı yanıttan önce yeniden oynarsa eski yanıt sıra numarasıyla atılır. Worker yoksa (eski tarayıcı) burada.
  computeHalo(quiet = false) {
    const fam = this.st.haloL || '2', spec = fam === 'nrho' ? { nrho: true } : { L: +fam, Az: this.st.haloAz }, id = (this.haloSeq = (this.haloSeq || 0) + 1);
    this.haloBusy = true; $('#lgHaloMsg').textContent = t('Halo yörüngesi hesaplanıyor…');
    const done = (h, err) => {
      if (id !== this.haloSeq) return;
      this.halo = err ? null : h; $('#lgHaloMsg').textContent = err ? t('Bu genlikte halo yörüngesi bulunamadı; başka bir genlik deneyin.') : '';
      this.haloBusy = false; this.renderHalo(); this.draw(); if (!quiet) this.link();
    };
    if (typeof Worker === 'undefined') { setTimeout(() => { try { done(G.haloOf(spec)); } catch (e) { done(null, e); } }, 20); return; }
    this.worker(); this.haloCb.set(id, done); this.haloWk.postMessage({ id, spec });
  }
  // iş parçacığı deney ilk açılınca kurulur (modülleri halo adımına gelmeden yüklensin: boş sayfada ilk yanıt ~0,23 sn, sonrakiler 0,15–0,2 sn)
  worker() {
    if (this.haloWk || typeof Worker === 'undefined') return;
    this.haloWk = new Worker(new URL('./lagrangework.js', import.meta.url), workerOpts());
    this.haloWk.onmessage = (e) => { const r = e.data, cb = this.haloCb && this.haloCb.get(r.id); if (cb) { this.haloCb.delete(r.id); cb(r.h, r.err); } };
    this.haloWk.onerror = () => { const cbs = this.haloCb; this.haloCb = new Map(); this.haloWk = null; for (const cb of cbs.values()) cb(null, 'worker'); };
    this.haloCb = new Map();
  }
  renderHalo() {
    const h = this.halo, tb = $('#lgHaloTbl tbody'); tb.replaceChildren();
    $('#lgFly').hidden = !(h && h.preset && this.onFly);
    if (!h) { $('#lgSum4').textContent = ''; return; }
    const rows = [['Periyot', t('{0} gün', fmt(h.periodDays, 2))], ['Düzleme dik genlik (Az)', G.fmtKm(h.Az)], ['Ay\'a en yakın', G.fmtKm(h.rpKm - 1737.4) + ' ' + t('(yüzeyden)')], ['Ay\'a en uzak', G.fmtKm(h.raKm)],
      ['Kararlılık indeksi ν', fmt(h.stability, h.stability < 10 ? 2 : 0)], ['Bir periyot sonra kapanma', h.closeKm * 1000 < 0.01 ? '< 1 cm' : fmt(h.closeKm * 1000, 2) + ' m']];
    if (h.preset) rows.push(['Ay görevinde', h.preset === 'NRHO' ? t('Artemis profili (NRHO 9:2)') : h.preset === 'L2' ? t('L2 halo profili') : t('L1 halo profili')]);
    for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', null, t(k)), mk('td', 'num', v)); tb.appendChild(tr); }
    $('#lgSum4').textContent = h.nrho ? `NRHO 9:2 · ${t('{0} gün', fmt(h.periodDays, 2))}` : `L${h.L} · Az ${G.fmtKm(h.Az)} · ${t('{0} gün', fmt(h.periodDays, 2))}`;
  }
  // ---------------------------------------------------------------- çizim
  viewMode() {
    if (this.st.view) return this.st.view;
    if (this.st.step === 4) return 'near';
    if (this.st.step === 3) return ['L1', 'L2'].includes(this.st.point) ? 'near' : 'all';
    return this.st.sys === 'se' ? 'near' : 'all';
  }
  prep(c) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '11px system-ui, sans-serif'; return { g, w, h, dpr };
  }
  // kaydırıcı sürüklenirken olaylar kareden sık gelebilir: kare başına en çok bir çizim
  // Bütün çizimler kare başında (rAF) yapılır: 2D tuval rAF dışında (iş parçacığı yanıtı, zamanlayıcı, tıklama görevi) çizilirse Chrome görevin sonunda
  // tuval karesini kapatırken arkadaki WebGL sahnesinin GPU işini bekler (SharedContextRateLimiter). Yazılım çiziminde (SwiftShader) bu bekleme
  // 40+ sn ölçüldü; gerçek GPU'da birkaç kare beklenir. Aynı karede birden çok istek tek çizime iner.
  drawSoon(dist = false) {
    if (dist) this.wantDist = true;
    if (this.rafDraw) return;
    this.rafDraw = requestAnimationFrame(() => { this.rafDraw = 0; this.drawNow(); if (this.wantDist) { this.wantDist = false; this.drawDistNow(); } });
  }
  draw() { this.drawSoon(); }
  drawDist() { this.drawSoon(true); }
  drawNow() {
    if (!this.shown || !this.P) return;
    const c = $('#lgMap'), P0 = this.prep(c); if (!P0) return;
    const { g, w, h } = P0, S = this.sys, mu = S.mu, step = this.st.step, haloMode = step === 4 && this.halo;
    const proj = haloMode ? this.st.proj : 'xy', ax = { xy: [0, 1], xz: [0, 2], yz: [1, 2] }[proj];
    // pencere (boyutsuz): tüm sistem ya da küçük cismin yakını (L1–L2 aralığının 1,6 katı)
    const g1 = 1 - mu - this.P[0].x, g2 = this.P[1].x - (1 - mu);
    let cx, cy, half;
    if (haloMode && !this.st.view) {                                            // halo: yörünge ve Ay birlikte, sığacak kadar yakın
      const q = [...this.halo.pts, [1 - mu, 0, 0]], lo = [0, 1].map((k) => Math.min(...q.map((v) => v[ax[k]]))), hi = [0, 1].map((k) => Math.max(...q.map((v) => v[ax[k]])));
      cx = 0.5 * (lo[0] + hi[0]); cy = 0.5 * (lo[1] + hi[1]); half = 0.6 * Math.max(hi[0] - lo[0], (hi[1] - lo[1]) * w / (h - 16), 0.02);
    } else if (this.viewMode() === 'near') { cx = proj === 'yz' ? 0 : 1 - mu + 0.5 * (g2 - g1); cy = 0; half = 1.6 * Math.max(g1, g2); }
    else { cx = proj === 'yz' ? 0 : 0; cy = 0; half = 1.25; }
    const s = Math.min(w, h - 16) / 2 / half, ox = w / 2, oy = h / 2 + 6;
    const X = (q) => ox + (q[ax[0]] - cx) * s, Y = (q) => oy - (q[ax[1]] - cy) * s;
    const view = { x0: cx - (w / 2) / s, x1: cx + (w / 2) / s, y0: cy - (h / 2 - 6) / s, y1: cy + (h / 2 + 6) / s };
    // yasak bölge (Enerji adımı): 2Ω < C
    if (step === 2 && proj === 'xy') {
      // yasak bölge maskesi ızgara çözünürlüğünde (3 CSS pikseli) küçük bir tuvale yazılır, drawImage ile büyütülür: her cihaz pikselini
      // dolaşmak yüksek yoğunluklu ekranda (DPR 2,6) ~7 kat daha pahalıydı (telefon taklidinde ~30 ms/çizim)
      const n = Math.ceil(w / 3), m = Math.ceil(h / 3), grid = G.forbiddenGrid(this.st.Cj, mu, view, n, m), [r0, g0, b0, a0] = COL.forb;
      const mc = this.maskCv || (this.maskCv = document.createElement('canvas')); if (mc.width !== n || mc.height !== m) { mc.width = n; mc.height = m; }
      const mg = mc.getContext('2d'), img = mg.createImageData(n, m);
      for (let i = 0; i < n * m; i++) if (grid[i]) { const k = i * 4; img.data[k] = r0; img.data[k + 1] = g0; img.data[k + 2] = b0; img.data[k + 3] = a0; }
      mg.putImageData(img, 0, 0);
      g.save(); g.imageSmoothingEnabled = false; g.drawImage(mc, 0, 0, w, h); g.restore();
    }
    // eksenler
    g.strokeStyle = COL.grid; g.beginPath(); g.moveTo(0, Y([0, 0, 0])); g.lineTo(w, Y([0, 0, 0])); g.stroke();
    // cisimler (gerçek ölçekte, en az 3 piksel)
    const body = (pos, R, col, name) => { const q = [pos, 0, 0]; const px = X(q), py = Y(q); if (px < -20 || px > w + 20) return; g.fillStyle = col; g.beginPath(); g.arc(px, py, Math.max(3, R / S.L_km * s), 0, 7); g.fill(); g.fillStyle = COL.text; g.fillText(t(name), px + 6, py + 14); };
    if (proj !== 'yz') { body(-mu, S.p1.R, S.id === 'se' ? COL.p1 : COL.p1e, S.p1.name); body(1 - mu, S.p2.R, S.id === 'se' ? COL.p1e : COL.p2, S.p2.name); }
    else body(0, S.p2.R, COL.p2, S.p2.name);
    // Lagrange noktaları
    for (const p of this.P) {
      const q = [p.x, p.y, 0], px = X(q), py = Y(q); if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;
      if (proj === 'yz') continue;                                              // önden bakışta noktalar Ay'ın üstüne düşer
      const sel = step === 3 && p.id === this.st.point;
      g.strokeStyle = g.fillStyle = p.lin.stable ? COL.good : COL.bad; g.lineWidth = sel ? 2 : 1.2;
      g.beginPath(); g.moveTo(px - 4, py - 4); g.lineTo(px + 4, py + 4); g.moveTo(px + 4, py - 4); g.lineTo(px - 4, py + 4); g.stroke();
      if (sel) { g.beginPath(); g.arc(px, py, 8, 0, 7); g.stroke(); }
      g.fillText(p.id, px + 6, py - 6); g.lineWidth = 1;
    }
    // deney yolu
    if (step === 3 && this.run) {
      g.strokeStyle = COL.path; g.lineWidth = 1.3; g.beginPath();
      this.run.pts.forEach((q, k) => { const px = X(q), py = Y(q); if (k) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); g.lineWidth = 1;
      const e = this.run.pts[this.run.pts.length - 1]; g.fillStyle = COL.path; g.beginPath(); g.arc(X(e), Y(e), 3, 0, 7); g.fill();
    }
    // halo
    if (haloMode) {
      g.strokeStyle = COL.halo; g.lineWidth = 1.5; g.beginPath();
      this.halo.pts.forEach((q, k) => { const px = X(q), py = Y(q); if (k) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.stroke(); g.lineWidth = 1;
    }
    g.fillStyle = COL.text;
    const scale = G.fmtKm(2 * half * S.L_km / Math.min(w, h - 16) * 80);
    g.fillText(t('Dönen çerçeve · {0}', haloMode ? { xy: t('üstten (x–y)'), xz: t('yandan (x–z)'), yz: t('önden (y–z)') }[proj] : t('üstten (x–y)')) + ` · 80 px ≈ ${scale}`, 6, 12);
  }
  drawDistNow() {
    const r = this.run; if (!this.shown || !r || this.st.step !== 3) return;
    const P0 = this.prep($('#lgDist')); if (!P0) return;
    const { g, w, h } = P0, pad = 34, T = r.tEnd || 1;
    const dmin = Math.max(1e-3, Math.min(...r.d)), dmax = Math.max(dmin * 10, ...r.d), l0 = Math.log10(dmin), l1 = Math.log10(dmax);
    const X = (tt) => pad + (w - pad - 8) * tt / T, Y = (d) => h - 16 - (h - 30) * (Math.log10(Math.max(d, dmin)) - l0) / (l1 - l0);
    g.strokeStyle = COL.grid; g.fillStyle = COL.text;
    for (let e = Math.ceil(l0); e <= Math.floor(l1); e++) { const y = Y(10 ** e); g.beginPath(); g.moveTo(pad, y); g.lineTo(w - 8, y); g.stroke(); g.fillText(10 ** e >= 1000 ? `${10 ** (e - 3)}k` : String(10 ** e), 2, y + 4); }
    g.fillText(t('km · gün →'), w - 70, h - 3);
    const near = r.nearKm; if (near < dmax) { g.setLineDash([2, 3]); g.strokeStyle = COL.bad; g.beginPath(); g.moveTo(pad, Y(near)); g.lineTo(w - 8, Y(near)); g.stroke(); g.setLineDash([]); }
    if (r.growthLin > 0) {                                                         // doğrusal kuramın eğimi: d0·e^(λt)
      g.setLineDash([5, 4]); g.strokeStyle = COL.text; g.beginPath(); g.moveTo(X(0), Y(r.d0Km));
      const tEndLin = Math.min(T, Math.log(dmax / r.d0Km) / r.growthLin); g.lineTo(X(tEndLin), Y(r.d0Km * Math.exp(r.growthLin * tEndLin))); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = COL.path; g.lineWidth = 1.5; g.beginPath(); r.t.forEach((tt, k) => { const x = X(tt), y = Y(r.d[k]); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1;
  }
  // ---------------------------------------------------------------- bağlantı
  linkState() {
    const s = this.st;
    return G.lgLinkFromState({ sys: s.sys, mu: s.mu, point: s.point, drKm: s.drKm, dvMps: s.dvMps, dir: s.dir, days: s.days, Cj: s.Cj, haloL: this.halo || s.step === 4 ? s.haloL : null, haloAz: s.haloAz });
  }
  link() { if (this.shown && this.onLink) this.onLink(this.linkState()); }
  async copyLink() {
    const u = new URL(location.pathname, location.origin); u.searchParams.set('mode', 'lab'); u.searchParams.set('exp', 'lagrange');
    for (const [k, v] of Object.entries(this.linkState())) u.searchParams.set(k, v);
    const msg = $('#lgLinkMsg');
    try { await navigator.clipboard.writeText(u.href); msg.textContent = t('Bağlantı kopyalandı.'); }
    catch (e) { msg.textContent = ''; window.prompt(t('Bağlantıyı kopyalayın:'), u.href); }
    setTimeout(() => { if (msg.textContent === t('Bağlantı kopyalandı.')) msg.textContent = ''; }, 4000);
  }
}
