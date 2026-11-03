// Kalkış canlandırmasını oynatır (Ay görevi › Uçuş): fizik worker'ı duraklatılır, ana iş parçacığı t_launch − 10 s'den yörüngeye girişe kadar
// ascent.js'in kinematik yolunu kendi saatiyle oynatır; tam roket (scene.setAscent) kademeleri gerçek zaman çizelgesine (rockets.js ascent) göre bırakır.
// Bitince görev girişten (fizik başlangıcı) sürer. Görev fiziği ve Δv hesapları değişmez.
import { buildAscent, scaleEvents, fmtMet } from './ascent.js';
import { rocketOf } from './rockets.js';
import { LEGACY_SITE } from './pads.js';

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
    this.active = false; this.warp = 10; this.bar = $('#ascBar'); this.txt = $('#ascTxt');
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
    await this.world.setAscent({ lv: A.lv, prop: { saturnv: 'kerolox', f9: 'kerolox', fh: 'kerolox', generic: 'kerolox', sls: 'solid', vulcan: 'solid' }[A.lv] || 'kerolox' });
    this.active = true; this.bar.hidden = false; this.syncBar();                     // model yüklendikten sonra oynamaya başla
    return true;
  }
  // kare: canlandırma durumu (scene.update'e giden x)
  tick(dt) {
    const P = this.path; this.t += dt * this.warp;
    if (this.t >= P.tIns) { this.stop(); return null; }
    const s = P.at(this.t), met = this.t - P.tLaunch, real = met * this.A.tIns / P.T;
    let cut = 0; const hidden = new Set(); let last = null;
    for (const e of this.events) if (met >= e.tScaled) { if (e.cut != null) cut = Math.max(cut, e.cut); if (e.part) hidden.add(e.part); last = e; }
    const thr = met >= 0 ? 1 : 0;
    this.world.ascentFrame(cut, hidden, thr);
    const msg = met < 0 ? `${this.rk.name} rampada · T−${Math.ceil(-met)} s` : `${this.rk.name} · gerçek zaman ${fmtMet(real)}${last ? ` · ${last.name} (${fmtMet(last.t)})` : ''}`;
    const mq = P.sim && P.sim.maxQ, nearQ = mq && Math.abs(real - mq.t) < 6 ? ` · MAX-Q ${(mq.q / 1000).toFixed(0)} kPa` : '';
    const full = msg + ` · irtifa ${s.h.toFixed(s.h < 10 ? 1 : 0)} km` + (s.q != null && met > 0 && s.h < 100 ? ` · q ${(s.q / 1000).toFixed(1)} kPa` : '') + nearQ;
    if (full !== this.lastMsg) { this.txt.textContent = full; this.lastMsg = full; }
    const x = { ...this.base, t: this.t, r: s.r, v: s.v, q: quatZto(s.dir), k: 0, thr: 0, phase: 'KALKIS', debris: [], local: null, att: null };
    // sahnede Dünya küre (R_E) olarak çizilir, rampa ise WGS-84 elipsoidinde: çizim konumu alçakta küre yüzeyine yaslanır (20 km'de söner); telemetri gerçek konumu kullanır
    const lift = (this.E.R_E - this.path.R0) * Math.max(0, 1 - s.h / 20), u = Math.hypot(...s.r);
    this.hud = x; return { ...x, r: s.r.map((c) => c * (1 + lift / u)) };
  }
  async stop() {
    if (!this.active) return;
    this.active = false; this.bar.hidden = true;
    await this.world.setAscent(null);
    Object.assign(this.world.cam, this.camPrev || {});
    this.onEnd && this.onEnd();
  }
}
