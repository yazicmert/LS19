// Kalkış canlandırmasını oynatır (Ay görevi › Uçuş): fizik worker'ı duraklatılır, ana iş parçacığı t_launch − 10 s'den yörüngeye girişe kadar
// ascent.js'in kinematik yolunu kendi saatiyle oynatır; tam roket (scene.setAscent) kademeleri gerçek zaman çizelgesine (rockets.js ascent) göre bırakır.
// Bitince görev girişten (fizik başlangıcı) sürer. Görev fiziği ve Δv hesapları değişmez.
import { buildAscent, scaleEvents, fmtMet } from './ascent.js';
import { rocketOf } from './rockets.js';
import { LEGACY_SITE } from './pads.js';
import { atmosphere } from './ascentsim.js';
const MU = 398600.4418, OMEGA = 7.2921159e-5;
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];

const $ = (s) => document.querySelector(s);
// (0,0,1) → d döndüren birim kuaterniyon [x, y, z, w]
function quatZto(d) {
  const c = d[2]; if (c < -0.999999) return [1, 0, 0, 0];
  const ax = [-d[1], d[0], 0], s = Math.sqrt((1 + c) * 2);
  return [ax[0] / s, ax[1] / s, ax[2] / s, s / 2];
}

export class AscentPlayer {
  constructor({ world, E, send, getDesign, getIns, getState, onEnd }) {
    this.world = world; this.E = E; this.send = send; this.getDesign = getDesign; this.getIns = getIns; this.getState = getState; this.onEnd = onEnd;
    this.active = false; this.warp = 10; this.bar = $('#ascBar'); this.txt = $('#ascTxt'); this.credit = $('#ascCredit');
    this.bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-asc]'); if (!b) return;
      const v = b.dataset.asc; if (v === 'end') this.stop(); else { this.warp = +v; this.syncBar(); }
    });
  }
  syncBar() { this.bar.querySelectorAll('[data-asc]').forEach((b) => b.classList.toggle('on', b.dataset.asc === String(this.warp))); }
  async start() {
    const D = this.getDesign(), ins = this.getIns(), base = this.getState();
    if (this.active || !D || !ins || !base) return false;
    const L = D.LAUNCH, rk = rocketOf(D.STAGES && D.STAGES[0] ? D.STAGES[0].rocket : null), A = rk.ascent;
    if (!A) return false;
    const site = { lat: L.lat ?? LEGACY_SITE.lat, lon: L.lon ?? LEGACY_SITE.lon };
    this.path = buildAscent({ site, tLaunch: L.t_launch, ins, icrfToItrf: this.E.earthIcrfToItrf, rE: this.E.R_E, veh: A.veh, tInsReal: A.tIns, inc: D.inc });
    this.events = scaleEvents(A.events, A.tIns, this.path.T); this.A = A; this.rk = rk; this.base = base;
    this.t = L.t_launch - 10; this.lastMsg = '';
    this.send({ cmd: 'pause', on: true });
    const cam = this.world.cam; this.camPrev = { mode: cam.mode, auto: cam.auto, dist: cam.dist, el: cam.el, az: cam.az };
    Object.assign(cam, { auto: false, mode: 'VEHICLE', dist: rk.ascent.lv === 'saturnv' || rk.ascent.lv === 'sls' ? 0.32 : 0.22, el: 0.15, az: -2.3 });
    // kalkıştaki alev: birinci kademenin yakıtı (Saturn V S-IC, Falcon: gazyağı; SLS, Vulcan: katı iticiler baskın)
    // rampa: SLS'te NASA Mobile Launcher, diğerlerinde beton platform; çevresi Sentinel-2 görüntüsü
    await this.world.setAscent({ lv: A.lv, prop: { saturnv: 'kerolox', f9: 'kerolox', fh: 'kerolox', generic: 'kerolox', sls: 'solid', vulcan: 'solid' }[A.lv] || 'kerolox', pad: A.lv === 'sls' ? 'ml' : 'concrete', site });
    this.debris = []; this.done = new Set(); this.prevCut = 0; this.hiddenNow = [];
    this.active = true; this.bar.hidden = false; this.syncBar();                     // model yüklendikten sonra oynamaya başla
    return true;
  }
  // çizim konumu: sahnede Dünya küre (R_E), rampa ise WGS-84 elipsoidinde — alçakta küre yüzeyine yaslanır (20 km'de söner); telemetri gerçek konumu kullanır
  drawR(r) { const u = Math.hypot(...r), h = u - this.path.R0, lift = (this.E.R_E - this.path.R0) * Math.max(0, 1 - h / 20); return r.map((c) => c * (1 + lift / u)); }
  // ayrılan kademe: ayrılma anındaki durumdan balistik (ters kare çekim + dönen havada sürüklenme, β ≈ 2000 kg/m²), geriye 4 m/s ayrılma itişi, yavaş takla
  propagate(d, dt) {
    for (let left = dt; left > 1e-6;) {
      const h_ = Math.min(0.5, left), r = d.r, v = d.v, R = Math.hypot(...r), alt = R - this.path.R0;
      if (alt < 0) { d.gone = true; return; }
      const va = [v[0] + OMEGA * r[1], v[1] - OMEGA * r[0], v[2]], sp = Math.hypot(...va), rho = atmosphere(alt).rho, D = 0.5 * rho * (sp * 1000) ** 2 / 2000 / 1000;
      const g = MU / (R * R * R);
      for (let k = 0; k < 3; k++) { v[k] += h_ * (-g * r[k] - (sp > 0 ? D * va[k] / sp : 0)); r[k] += h_ * v[k]; }
      left -= h_;
    }
  }
  // kare: canlandırma durumu (scene.update'e giden x)
  tick(dt) {
    const P = this.path, dts = dt * this.warp; this.t += dts;
    if (this.t >= P.tIns) { this.stop(); return null; }
    const s = P.at(this.t), met = this.t - P.tLaunch, real = met * this.A.tIns / P.T, q = quatZto(s.dir);
    let cut = 0; const hidden = new Set(); let last = null;
    for (const e of this.events) if (met >= e.tScaled) {
      if (e.cut != null) cut = Math.max(cut, e.cut); if (e.part) hidden.add(e.part); last = e;
      if (!this.done.has(e)) {                                                       // yeni ayrılma: parça kendi balistik yoluna
        this.done.add(e);
        const back = s.dir.map((c) => -0.004 * c);
        this.debris.push({ id: this.debris.length + 1, lo: this.prevCut, hi: e.cut ?? 0, part: e.part || null, hidden: [...hidden].filter((p) => p !== e.part),
          r: s.r.slice(), v: s.v.map((c, k) => c + back[k]), q0: q, age: 0, spin: 0.15 + 0.1 * Math.random() });
        if (e.cut != null) this.prevCut = e.cut;
      }
    }
    for (const d of this.debris) { this.propagate(d, dts); d.age += dts; }
    this.debris = this.debris.filter((d) => !d.gone && d.age < 900);
    const thr = met >= 0 ? 1 : 0, up = s.up, h = s.h;
    // rampa çerçevesi (Dünya ile döner) ve Güneş'in araca göre yüksekliği
    const pu = P.padAt(this.t), east = (() => { const e = [-pu[1], pu[0], 0], n = Math.hypot(...e); return e.map((c) => c / n); })(), north = [pu[1] * east[2] - pu[2] * east[1], pu[2] * east[0] - pu[0] * east[2], pu[0] * east[1] - pu[1] * east[0]];
    const sun = this.E.sunPos(this.t), sd = [sun[0] - s.r[0], sun[1] - s.r[1], sun[2] - s.r[2]], sn = Math.hypot(...sd), sunUp = (sd[0] * up[0] + sd[1] * up[1] + sd[2] * up[2]) / sn;
    const half = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
    const st = s.stage != null && s.stage >= 0 ? s.stage : 0, thrNow = met >= 0 && (s.stage == null || s.stage >= 0) ? 1 : 0;   // kademe arası süzülmede motor sönük
    this.world.ascentFrame({ cut, hidden, thr: thrNow, h, pAmb: atmosphere(h).p, sunUp, prop: (this.A.props || [])[st],
      pad: { pos: pu.map((c) => c * this.E.R_E), east, north, up: pu },
      debris: this.debris.map((d) => ({ id: d.id, lo: d.lo, hi: d.hi, part: d.part, hidden: d.hidden, r: this.drawR(d.r), q: qmul(d.q0, half(d.spin * d.age * 0.02)) })) });
    const msg = met < 0 ? `${this.rk.name} rampada · T−${Math.ceil(-met)} s` : `${this.rk.name} · gerçek zaman ${fmtMet(real)}${last ? ` · ${last.name} (${fmtMet(last.t)})` : ''}`;
    const mq = P.sim && P.sim.maxQ, nearQ = mq && Math.abs(real - mq.t) < 6 ? ` · MAX-Q ${(mq.q / 1000).toFixed(0)} kPa` : '';
    const full = msg + ` · irtifa ${h.toFixed(h < 10 ? 1 : 0)} km` + (s.q != null && met > 0 && h < 100 ? ` · q ${(s.q / 1000).toFixed(1)} kPa` : '') + nearQ;
    if (full !== this.lastMsg) { this.txt.textContent = full; this.lastMsg = full; }
    const cr = this.world.asc && h < 40 ? this.world.asc.credit : ''; if (this.credit && this.credit.textContent !== cr) this.credit.textContent = cr;
    const x = { ...this.base, t: this.t, r: s.r, v: s.v, q, k: 0, thr: 0, phase: 'KALKIS', debris: [], local: null, att: null };
    this.hud = x; return { ...x, r: this.drawR(s.r) };
  }
  async stop() {
    if (!this.active) return;
    this.active = false; this.bar.hidden = true;
    await this.world.setAscent(null);
    Object.assign(this.world.cam, this.camPrev || {});
    this.onEnd && this.onEnd();
  }
}
