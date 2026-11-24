// Lagrange noktaları brifingi (Laboratuvar › Lagrange noktaları'nın girişi): LS19 deneyi adım adım kurdurur, sonucu tümlemeyle gösterir.
// Akış: giriş → 1 Hangi sistem? → 2 Hangi nokta? → 3 Ne kadar hata? → 4 Brifing. Hesap lagrange.js'te (CR3BP, saf); brifing kapanınca deney panelde
// aynı seçimlerle sürer (LagrangeUI.applyBrief). Saf mantık briflagrangetext.js'te; kart, işaretler ve kamera ortak kabukta (brifkabuk.js).
// Sahne (gökyüzü motoru, gerçek an): noktalar, deney yolu ve sistemin yörüngesi dönen çerçeveden gerçek konumlarına taşınır
//   Dünya–Ay: x Dünya→Ay, z Ay'ın yörünge normali (birim: o anki Dünya–Ay uzaklığı) · Güneş–Dünya: x Güneş→Dünya, z ekliptik kutbu (birim: Güneş uzaklığı).
import * as THREE from 'three';
import * as E from './engine.js';
import * as G from './lagrange.js';
import { BriefShell, el, esc, unit } from './brifkabuk.js';
import { LG_STEPS, LG_SYSTEMS, LG_ORDER, ERRORS_KM, DAYS, pointsOf, leaveDays, daysFor, recommendLg, reasonsLg } from './briflagrangetext.js';
import { fmt } from './format.js';
import { t as tr } from './i18n.js';

const SEEN = 'ls19.brifing.lagrange';
const ECL = [0, -0.3977771559, 0.9174820621];                                // ekliptik kutbu (ICRF)
const SCENES = {
  intro: { mode: 'SYSTEM', dist: 1.25e6, el: 1.0, az: -Math.PI / 2, spin: 0.03, wide: true, sys: true },
  sistem: { mode: 'SYSTEM', dist: 1.3e6, el: 1.2, az: -Math.PI / 2, wide: true, sys: true },
  nokta: { mode: 'FOCUS', dist: 2e5, point: true },
  deney: { mode: 'FOCUS', dist: 2e5, point: true, path: true },
  brifing: { mode: 'FOCUS', dist: 2e5, point: true, path: true },
};

export class LagrangeBrief extends BriefShell {
  // host: { world, latest() → { t }, root, lg (LagrangeUI), onFly(profil), onClose }
  constructor(host) {
    super(host, { id: 'lagrange', label: 'Lagrange brifingi', seen: SEEN, steps: LG_STEPS, scenes: SCENES, hide: [] });
    this.lines = null;
  }
  onOpen() {
    const s = this.h.lg.st;
    this.sel = { sys: LG_ORDER.includes(s.sys) ? s.sys : 'em', point: s.point || 'L1', errKm: 10, days: 60 };
    this.sel.days = daysFor(this.sel.sys, this.info(), this.nearKm(), this.sel.errKm);
    this.run = null;
  }
  onClosing() { this.run = null; }
  get sys() { return G.systemOf(this.sel.sys); }
  points() { return pointsOf(this.sys); }
  info(id = this.sel.point) { return this.points().find((p) => p.id === id); }
  nearKm() { const S = this.sys; return G.nearRadius(G.points(S.mu), S.mu) * S.L_km; }
  // deney (tümleme, ~10–40 ms): seçim değişince yeniden
  runNow() {
    const k = [this.sel.sys, this.sel.point, this.sel.errKm, this.sel.days].join('|');
    if (!this.run || this.run.key !== k) this.run = { key: k, r: G.runFrom(this.sys, this.sel.point, { dr: [this.sel.errKm, 0, 0], days: this.sel.days }) };
    return this.run.r;
  }
  ctx() { return { sys: this.sys, points: this.points(), point: this.info(), nearKm: this.nearKm(), run: this.run && this.run.r }; }

  introCard(kind) {
    const ret = kind === 'return';
    return {
      eye: 'LS19 · Yörünge mekaniği',
      h: ret ? 'Başka bir noktayı deneyelim mi?' : 'Uzayda durulabilecek beş yer.',
      lead: ret ? 'Son denemen panelde duruyor. İstersen başka bir sistem, nokta ya da hatayla baştan kur.'
        : 'İki cismin çekimi ve dönmenin etkisi beş noktada dengelenir. Bir nokta seç, oraya küçük bir hatayla bir araç bırak: kalır mı, kayar mı? LS19 önce kuramın ne dediğini sayılarla söyler, sonra yolu tümler.',
      acts: [{ act: 'start', t: ret ? 'Yeni deney kur' : 'Deneyi kur', cls: 'primary' }, { act: 'panel', t: ret ? 'Kaldığım yerden devam' : 'Paneli kendim kullanayım' }],
      fine: ret ? '' : 'Dairesel kısıtlı üç cisim problemi: cisimler dairesel yörüngede, araç onları etkilemeyecek kadar küçük.',
    };
  }
  onAct() { this.close(null); }

  // ---------------------------------------------------------------- adımlar
  nextLabel(k) { return k === 'deney' ? 'Sonucu gör' : 'Devam'; }
  recommendFor(step) { return recommendLg(step, this.sel, this.ctx()); }
  reasonsFor(step) { if (step === 'deney') this.runNow(); return reasonsLg(step, this.sel, this.ctx()); }
  renderStep(k, body) {
    if (k === 'sistem') this.stepSystem(body);
    else if (k === 'nokta') this.stepPoint(body);
    else if (k === 'deney') this.stepRun(body);
    else this.stepBrief(body);
  }
  pickSystem(v) { if (v === this.sel.sys) return; this.sel.sys = v; this.sel.point = v === 'se' ? 'L2' : 'L1'; this.sel.days = daysFor(v, this.info(), this.nearKm(), this.sel.errKm); this.run = null; this.redraw(); }
  pickPoint(v) { this.sel.point = v; this.sel.days = daysFor(this.sel.sys, this.info(), this.nearKm(), this.sel.errKm); this.run = null; this.redraw(); }
  stepSystem(body) {
    this.rec(body, 'sistem', this.sel.sys, (v) => this.pickSystem(v));
    this.options(body, 'Sistem', LG_ORDER.map((id) => { const S = G.systemOf(id); return { v: id, t: LG_SYSTEMS[id].t, meta: 'μ = ' + (S.mu >= 1e-3 ? fmt(S.mu, 5) : S.mu.toExponential(2).replace('.', ',')), s: LG_SYSTEMS[id].s }; }), this.sel.sys, (v) => this.pickSystem(v));
    body.appendChild(el('p', 'brief-note', esc(tr('Sahne dönen çerçevede: iki cisim yerinde durur, noktalar onlarla birlikte döner. Varsayımsal sistem (kütle oranı serbest) panelde.'))));
  }
  stepPoint(body) {
    const P = this.points();
    this.rec(body, 'nokta', this.sel.point, (v) => this.pickPoint(v));
    this.options(body, 'Nokta', P.map((I) => ({ v: I.id, t: I.id, meta: I.efoldDays != null ? tr('kararsız · e-katlanma {0}', G.fmtDays(I.efoldDays)) : tr('kararlı · salınım {0}', G.fmtDays(Math.max(...I.oscDays))),
      s: tr('Küçük cisme {0}.', G.fmtKm(I.d2Km)), warn: false })), this.sel.point, (v) => this.pickPoint(v));
    body.appendChild(el('p', 'brief-note', esc(tr('e-katlanma: küçük bir hatanın 2,7 katına çıktığı süre. Sahnedeki noktalara dokunarak da seçebilirsin.'))));
  }
  stepRun(body) {
    const I = this.info(), near = this.nearKm(), opts = DAYS[this.sel.sys];
    const pick = (v) => { const [e, d] = String(v).split('|').map(Number); this.sel.errKm = e; this.sel.days = d; this.run = null; this.redraw(); };
    this.rec(body, 'deney', this.sel.errKm + '|' + this.sel.days, pick);
    this.options(body, 'Konum hatası', ERRORS_KM.map((e) => { const lv = leaveDays(I, near, e); return { v: e + '|' + this.sel.days, t: tr('{0} konum hatası', G.fmtKm(e)), meta: lv != null ? tr('kuram: {0} sonra ayrılır', G.fmtDays(lv)) : tr('kararlı: kalır'), s: '' }; }), this.sel.errKm + '|' + this.sel.days, pick);
    const adv = el('details', 'brief-adv', `<summary>${esc(tr('İzleme süresi'))}</summary>`); adv.open = true;
    this.seg(adv, 'İzleme süresi', String(this.sel.days), opts.map((d) => [String(d), tr('{0} gün', d)]), (v) => pick(this.sel.errKm + '|' + v));
    body.appendChild(adv);
    const r = this.runNow(), v = G.verdict(r, this.sys);
    body.appendChild(el('div', 'brief-verdict ' + v.kind, `<b>${esc(tr(v.title))}</b><p>${esc(tr(v.detail))}</p>`));
  }
  stepBrief(body) {
    const r = this.runNow(), S = this.sys, I = this.info(), v = G.verdict(r, S), em = this.sel.sys === 'em';
    const rows = [['Sistem', LG_SYSTEMS[this.sel.sys].t], ['Nokta', `${I.id} · ${tr(I.efoldDays != null ? 'kararsız' : 'kararlı')}`], ['Başlangıç hatası', G.fmtKm(this.sel.errKm)], ['İzleme', tr('{0} gün', this.sel.days)],
      [I.efoldDays != null ? 'e-katlanma (kuram)' : 'Salınım (kuram)', G.fmtDays(I.efoldDays != null ? I.efoldDays : Math.max(...I.oscDays))], ['Noktadan ayrılış', r.tLeave != null ? G.fmtDays(r.tLeave) : '—'],
      ['En büyük uzaklık', G.fmtKm(r.maxKm)], ['Tümleme doğruluğu (ΔC)', r.dC.toExponential(1).replace('.', ',')]];
    if (r.growthMeas && r.growthLin > 0 && Math.abs(r.growthMeas / r.growthLin - 1) < 0.25) rows.splice(5, 0, ['e-katlanma (tümlemeden)', G.fmtDays(1 / r.growthMeas)]);
    const lesson = I.efoldDays != null
      ? (em && ['L1', 'L2'].includes(I.id) ? 'Kararsız noktada durmak için araç düzenli küçük düzeltmeler yapar ya da noktanın çevresindeki halo yörüngesine yerleşir: Gateway\'in NRHO\'su böyle bir yörünge.' : 'Kararsız noktada durmak için araç düzenli küçük yörünge düzeltmeleri yapar; JWST ve SOHO böyle durur.')
      : 'Kararlı noktada araç kendiliğinden kalır: Coriolis etkisi onu noktanın çevresinde döndürür. Truva asteroitleri milyarlarca yıldır böyle durur.';
    body.innerHTML = `<div class="brief-verdict ${esc(v.kind)}" role="status"><b>${esc(tr(v.title))}</b><p>${esc(tr(v.detail))}</p></div>
      <dl class="brief-sum">${rows.map(([k, x]) => `<div><dt>${esc(tr(k))}</dt><dd>${esc(tr(x))}</dd></div>`).join('')}</dl>
      <p class="brief-note">${esc(tr(lesson))}</p>`;
    const acts = [{ go: 'panel', t: 'Panelde incele' }];
    if (em && ['L1', 'L2'].includes(I.id)) acts.push({ go: 'halo', t: 'Halo yörüngelerine geç' });
    if (em && this.h.onFly) acts.push({ go: 'fly', t: 'Ay görevinde NRHO ile uç' });
    this.goButtons(acts, 'Seçimleri değiştir', (how) => {
      const sel = { ...this.sel };
      this.close(how === 'fly' ? 'away' : how);
      if (how === 'fly') { this.h.onFly('NRHO'); return; }
      this.h.lg.applyBrief(sel);
      if (how === 'halo') this.h.lg.open(4);
      document.querySelector('#labPanel').classList.add('open');
    });
  }

  // ---------------------------------------------------------------- 3B sahne: dönen çerçeve → gerçek konum (Dünya merkezli km)
  frameOf(t) {
    if (this.sel.sys === 'se') {
      const s = E.sunPos(t), D = Math.hypot(...s), xx = unit(E.scale(s, -1)), zz = ECL, yy = E.cross(zz, xx), mu = this.sys.mu;
      return { geo: (q) => E.scale(E.add(E.add(E.scale(xx, q[0] - (1 - mu)), E.scale(yy, q[1])), E.scale(zz, q[2])), D), D, zz, yy, xx };
    }
    const rm = E.moonPos(t), vm = E.moonVel(t), D = Math.hypot(...rm), xx = unit(rm), zz = unit(E.cross(rm, vm)), yy = E.cross(zz, xx), mu = this.sys.mu;
    return { geo: (q) => E.scale(E.add(E.add(E.scale(xx, q[0] + mu), E.scale(yy, q[1])), E.scale(zz, q[2])), D), D, zz, yy, xx };
  }
  aim(c, x, show) {
    const t = x.t, F = this.frameOf(t), se = this.sel.sys === 'se', P = G.points(this.sys.mu);
    let a = null;
    if (c.sys) {                                                                   // bütün sistem: Dünya–Ay dönen çerçevede (üstten), Güneş–Dünya Güneş merkezli
      if (se) { c.mode = 'SOLAR'; c.dist = 4.3e8; a = { az: c.az + (c.spin || 0) * c.t, el: c.el }; }
      else { c.mode = 'SYSTEM'; c.dist = c.k === 'intro' ? 1.25e6 : 1.3e6; if (c.spin) a = { az: c.az + c.spin * c.t, el: c.el }; }
    } else if (c.point) {                                                          // seçilen noktanın yakını, yörünge düzlemine eğik bakış
      const p = P.find((q) => q.id === this.sel.point), key = this.sel.sys + this.sel.point;
      const far = ['L3', 'L4', 'L5'].includes(p.id), r = c.path && this.run ? this.run.r : null, mu = this.sys.mu;
      // L1/L2: odak nokta ile küçük cismin ortası (ikisi birlikte kadrajda); L3–L5: noktanın kendisi
      const fx = far ? p.x : 0.5 * (p.x + 1 - mu), fy = far ? p.y : 0;
      if (!c.focus || c.focus.key !== key) c.focus = { kind: 'lg', key, fn: (tt) => this.frameOf(tt).geo([fx, fy, 0]) };
      c.dist = se ? (far ? 2.6e8 : 4.5e6) : (far ? 5.5e5 : 1.6e5);
      if (r && r.maxKm > 0) c.dist = Math.min(se ? (far ? 3e8 : 1.2e7) : 9e5, Math.max(c.dist, 2.2 * r.maxKm));      // yol sığsın; araç sistemden uzaklaştıysa ayrılış anı kadrajda kalsın
      const look = unit(E.add(F.zz, E.scale(F.yy, -0.45)));
      a = { az: Math.atan2(look[1], look[0]), el: Math.max(-1.35, Math.min(1.35, Math.asin(look[2]))) };
    }
    // cisimler ve noktalar (Hangi nokta? adımında dokununca seçilir)
    if (se) { this.placePin('S', E.sunPos(t), 'Güneş'); show.add('S'); }
    this.placePin('E', [0, 0, 0], 'Dünya'); show.add('E');
    if (!se) { this.placePin('M', E.moonPos(t), 'Ay'); show.add('M'); }
    for (const p of P) {
      const on = p.id === this.sel.point, pick = c.k === 'nokta' && !on ? () => this.pickPoint(p.id) : null;
      if (c.k === 'intro') continue;
      this.placePin('p:' + p.id, F.geo([p.x, p.y, 0]), p.id, null, { on: on && !c.sys, pick, left: p.id === 'L1' }); show.add('p:' + p.id);
    }
    this.drawLines(c, x, F);
    return a;
  }
  // çizgiler: küçük cismin yörüngesi (dönen çerçevede birim çember) ve deney yolu; her kare göze göre (kayan başlangıç noktası)
  drawLines(c, x, F) {
    const W = this.h.world, eye = W.eye; if (!eye) return;
    if (!this.lines) {
      const g = new THREE.Group(), mk = (n, col, op) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false })); l.frustumCulled = false; g.add(l); return l; };
      this.lines = { g, orbit: mk(181, 0x8591a3, 0.45), path: mk(1600, 0x60a5fa, 0.95) }; g.renderOrder = 3; W.scene.add(g);
    }
    const L = this.lines, mu = this.sys.mu, put = (line, pts) => {
      const a = line.geometry.attributes.position.array, n = Math.min(pts.length, a.length / 3);
      for (let k = 0; k < n; k++) { const p = F.geo(pts[k]); a[3 * k] = p[0] - eye[0]; a[3 * k + 1] = p[1] - eye[1]; a[3 * k + 2] = p[2] - eye[2]; }
      line.geometry.setDrawRange(0, n); line.geometry.attributes.position.needsUpdate = true;
    };
    L.g.visible = true;
    if (!this.ring || this.ring.mu !== mu) this.ring = { mu, pts: Array.from({ length: 181 }, (_, k) => { const q = 2 * Math.PI * k / 180; return [-mu + Math.cos(q), Math.sin(q), 0]; }) };
    put(L.orbit, this.ring.pts);
    const r = c.path && this.run ? this.run.r : null;
    L.path.visible = !!r; if (r) put(L.path, r.pts);
  }
  clearScene() { if (this.lines) this.lines.g.visible = false; }
  portraitScale(c, asp) { return c.mode === 'SYSTEM' || c.mode === 'SOLAR' ? Math.min(2.2, 0.95 / asp) : 1.5; }
}
