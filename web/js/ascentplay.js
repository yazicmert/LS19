// Kalkış canlandırmasını oynatır (Ay görevi › Uçuş): fizik worker'ı duraklatılır, ana iş parçacığı t_launch − 10 s'den yörüngeye girişe kadar
// ascent.js'in kinematik yolunu kendi saatiyle oynatır; tam roket (scene.setAscent) kademeleri gerçek zaman çizelgesine (rockets.js ascent) göre bırakır.
// Bitince görev girişten (fizik başlangıcı) sürer. Görev fiziği ve Δv hesapları değişmez.
import { buildAscent, scaleEvents, fmtMet } from './ascent.js';
import { rocketOf } from './rockets.js';
import { LEGACY_SITE } from './pads.js';
import { atmosphere, massState } from './ascentsim.js';
import { qMul } from './attitude.js';
import { directShot, autoWarp, timeline, SHOT_NAMES, SITES, siteEye, sight } from './launchcam.js';
import { MU_E as MU, OMEGA_E as OMEGA } from './geo.js';
import { $ } from './uiutil.js';
import { fmt } from './format.js';

// (0,0,1) → d döndüren birim kuaterniyon [x, y, z, w]
function quatZto(d) {
  const c = d[2]; if (c < -0.999999) return [1, 0, 0, 0];
  const ax = [-d[1], d[0], 0], s = Math.sqrt((1 + c) * 2);
  return [ax[0] / s, ax[1] / s, ax[2] / s, s / 2];
}

export class AscentPlayer {
  constructor({ world, E, send, getDesign, getIns, getState, onEnd }) {
    this.world = world; this.E = E; this.send = send; this.getDesign = getDesign; this.getIns = getIns; this.getState = getState; this.onEnd = onEnd;
    this.active = false; this.warp = 10; this.camUser = 'auto'; this.bar = $('#ascBar'); this.txt = $('#ascTxt'); this.credit = $('#ascCredit'); this.tele = $('#ascTele');
    this.bar.addEventListener('click', (e) => {
      const c = e.target.closest('[data-ascam]'); if (c) { this.camUser = c.dataset.ascam; this.syncBar(); return; }
      if (e.target.closest('[data-ascui]')) { this.cine = !this.cine; this.applyCine(); return; }
      const b = e.target.closest('[data-asc]'); if (!b) return;
      const v = b.dataset.asc; if (v === 'end') this.stop(); else { this.warp = +v; this.userWarp = true; this.syncBar(); }
    });
    // telemetri bandı: panellerle görünümde kontrol çubuğunun üstünde (çubuk atıfla iki satıra sarınca bant da yükselir); sinematik görünümde ekranın
    // altında — sol alttaki atıf bandın altına taşarsa bant atıfın üstüne çıkar (üst üste binmez)
    this.placeTele = () => {
      if (!this.tele || this.bar.hidden) return;
      if (document.body.classList.contains('launch-cine')) {
        const cr = this.credit && this.credit.textContent ? this.credit.getBoundingClientRect() : null, tw = this.tele.offsetWidth || 640;
        const clash = cr && cr.width > 0 && cr.right + 12 > (window.innerWidth - tw) / 2;
        this.tele.style.bottom = `${clash ? Math.round(window.innerHeight - cr.top + 10) : 30}px`; return;
      }
      const b = parseFloat(getComputedStyle(this.bar).bottom) || 92; this.tele.style.bottom = `${Math.round(b + this.bar.offsetHeight + 8)}px`;
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.placeTele()).observe(this.bar);
    // sinematik görünüm: kontroller fare/dokunma/tuşla belirir, ~2,8 s sonra söner (üstüne gelince ya da odaktayken açık kalır)
    this.poke = (ms = 2800) => {
      if (!this.active) return;
      document.body.classList.add('asc-ui-on'); clearTimeout(this.pokeT);
      this.pokeT = setTimeout(() => document.body.classList.remove('asc-ui-on'), ms);
    };
    this.onPoke = () => this.poke();
    this.onResize = () => this.placeTele();
  }
  // sinematik kalkış (varsayılan): görev panelleri, üst gezinme ve alt denetimler gizlenir; ekranda sahne, yayın bandı ve olay alt yazıları kalır
  applyCine() {
    const on = this.active && this.cine;
    document.body.classList.toggle('launch-cine', on);
    const b = this.bar.querySelector('[data-ascui]'); if (b) { b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on)); }
    this.placeTele();
  }
  // yayın alt yazısı: olay adı bandın üstünde birkaç saniye görünür (Max-Q, ayrılmalar; açılışta roket ve rampa)
  flash(text, ms = 4200) {
    const f = this.teleEl && this.teleEl.flash; if (!f) return;
    f.textContent = text; f.classList.add('on'); clearTimeout(this.flashT);
    this.flashT = setTimeout(() => f.classList.remove('on'), ms);
  }
  syncBar() {
    this.bar.querySelectorAll('[data-asc]').forEach((b) => b.classList.toggle('on', b.dataset.asc === String(this.warp)));
    this.bar.querySelectorAll('[data-ascam]').forEach((b) => b.classList.toggle('on', b.dataset.ascam === this.camUser));
  }
  // yayın tarzı telemetri bandı: aşama, yere göre hız (km/sa), irtifa, T+ saati ve olay zaman çizgisi (Max-Q, ayrılmalar, yörünge)
  buildTele() {
    const T = this.tele; if (!T) return;
    const tl = this.tl = timeline(this.A.events, this.path.sim && this.path.sim.maxQ, this.A.tIns), tEnd = this.A.tIns, t0 = -10;
    const x = (t) => ((t - t0) / (tEnd - t0) * 100).toFixed(2) + '%';            // uçlara yakın etiketler bandın içine doğru hizalanır (at-l, at-r)
    T.innerHTML = `<div class="at-row"><span class="at-st" id="atSt"></span><span class="at-k">HIZ</span><b id="atV">0</b><span class="at-u">km/sa</span><span class="at-k">İRTİFA</span><b id="atH">0</b><span class="at-u">km</span>`
      + `<b id="atT" class="at-t">T−00:10</b><span class="at-cam"><span id="atCam"></span><small id="atCamNote"></small></span></div><div class="at-flash" id="atFlash"></div>`
      + `<div class="at-line"><i id="atFill"></i>${tl.map((e, i) => { const px = parseFloat(x(e.t)), edge = px > 80 ? ' at-r' : px < 20 ? ' at-l' : ''; return `<span class="at-ev at-${e.kind}${edge}" style="left:${x(e.t)}" data-i="${i}"><em>${e.name}</em></span>`; }).join('')}<span class="at-ev at-zero" style="left:${x(0)}"></span></div>`;
    this.teleEl = { st: T.querySelector('#atSt'), v: T.querySelector('#atV'), h: T.querySelector('#atH'), t: T.querySelector('#atT'), fill: T.querySelector('#atFill'), ev: [...T.querySelectorAll('[data-i]')], cam: T.querySelector('#atCam'), note: T.querySelector('#atCamNote'), flash: T.querySelector('#atFlash') };
    this.teleX = x; this.teleLast = 0; T.hidden = false; this.placeTele();
  }
  // T± görev saatidir (sol üst gösterge ve görev çizelgesiyle aynı); olay noktaları ve dolgu roketin uçuş zamanında (tasarım roketin giriş süresini kullandığından ikisi aynı)
  updTele(real, met, h, vRel, stageName, shot) {
    const E = this.teleEl; if (!E) return;
    const now = performance.now(); if (now - this.teleLast < 90) return; this.teleLast = now;            // ~11 Hz (yayın göstergesi gibi; her karede DOM yazılmaz)
    const k = Math.max(0, Math.floor(Math.abs(met))), sgn = met < 0 ? '−' : '+';                     // sol üst göstergeyle aynı yuvarlama (format.js fmtDur)
    E.t.textContent = `T${sgn}${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`;
    E.v.textContent = fmt(vRel * 3600, 0); E.h.textContent = fmt(h, h < 10 ? 1 : 0);
    E.st.textContent = stageName; E.fill.style.width = this.teleX(Math.max(-10, real)); E.cam.textContent = SHOT_NAMES[shot.shot] || ''; E.note.textContent = shot.note || '';
    this.tl.forEach((e, i) => E.ev[i].classList.toggle('done', real >= e.t));
  }
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
    // kamera: yerden izleme → takip (scene.js LAUNCH); takipte roketin arkasında, biraz yanda ve üstte
    Object.assign(cam, { auto: false, mode: 'LAUNCH', dist: rk.ascent.lv === 'saturnv' || rk.ascent.lv === 'sls' || rk.ascent.lv === 'fh' ? 0.34 : 0.24, el: 0.12, az: Math.PI + 0.45 });
    // uçuş yönü (rampada yatay, doğu/kuzey bileşenleriyle): yer kamerası buna dik durur; rampa Dünya ile döndükçe aynı bileşenlerle yeniden kurulur
    { const d0 = this.path.padAt(L.t_launch), d1 = ins.r.map((c) => c / Math.hypot(...ins.r)), k = d0[0] * d1[0] + d0[1] * d1[1] + d0[2] * d1[2], hz = d1.map((c, i) => c - k * d0[i]);
      const e = [-d0[1], d0[0], 0], en = Math.hypot(...e), ea = e.map((c) => c / en), na = [d0[1] * ea[2] - d0[2] * ea[1], d0[2] * ea[0] - d0[0] * ea[2], d0[0] * ea[1] - d0[1] * ea[0]];
      const ke = hz[0] * ea[0] + hz[1] * ea[1] + hz[2] * ea[2], kn = hz[0] * na[0] + hz[1] * na[1] + hz[2] * na[2], kk = Math.hypot(ke, kn) || 1; this.drEN = [ke / kk, kn / kk]; }
    // kalkış gerçek hızda (×1) izlenir; T+20 s'den sonra ×10, kademe ayrılmaları ×2 (kullanıcı hız seçtiyse dokunulmaz) — launchcam.autoWarp
    this.warp = 1; this.userWarp = false; this.camUser = 'auto';
    // kalkıştaki alev: birinci kademenin yakıtı (Saturn V S-IC, Falcon: gazyağı; SLS, Vulcan: katı iticiler baskın)
    // rampa: SLS'te NASA Mobile Launcher, diğerlerinde beton platform; çevresi Sentinel-2 görüntüsü
    await this.world.setAscent({ lv: A.lv, prop: { saturnv: 'kerolox', f9: 'kerolox', fh: 'kerolox', generic: 'kerolox', sls: 'solid', vulcan: 'solid' }[A.lv] || 'kerolox', pad: A.lv === 'sls' ? 'ml' : 'concrete', site });
    this.debris = []; this.done = new Set(); this.prevCut = 0; this.hiddenNow = [];
    this.active = true; this.bar.hidden = false; this.syncBar(); this.buildTele();      // model yüklendikten sonra oynamaya başla
    this.cine = true; this.lastEv = null; this.qShown = false; this.applyCine(); this.poke(4500);
    for (const ev of ['pointermove', 'pointerdown', 'keydown']) window.addEventListener(ev, this.onPoke, { passive: true });
    window.addEventListener('resize', this.onResize);
    this.flash(`${rk.name} · ${L.site || rk.pad || ''}`.replace(/ · $/, ''), 5000);
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
    const P = this.path, k0 = this.A.tIns / P.T;                                        // canlandırma süresi → gerçek uçuş süresi
    const dts = dt * this.warp; this.t += dts;
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
    const up = s.up, h = s.h;
    // rampa çerçevesi (Dünya ile döner) ve Güneş'in araca göre yüksekliği
    const pu = P.padAt(this.t), east = (() => { const e = [-pu[1], pu[0], 0], n = Math.hypot(...e); return e.map((c) => c / n); })(), north = [pu[1] * east[2] - pu[2] * east[1], pu[2] * east[0] - pu[0] * east[2], pu[0] * east[1] - pu[1] * east[0]];
    const sun = this.E.sunPos(this.t), sd = [sun[0] - s.r[0], sun[1] - s.r[1], sun[2] - s.r[2]], sn = Math.hypot(...sd), sunUp = (sd[0] * up[0] + sd[1] * up[1] + sd[2] * up[2]) / sn;
    const half = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
    const st = s.stage != null && s.stage >= 0 ? s.stage : 0, thrNow = met >= 0 && (s.stage == null || s.stage >= 0) ? 1 : 0;   // kademe arası süzülmede motor sönük
    // yayın kurgusu (launchcam.js): çekim seçimi ve otomatik hız
    // gerçek kameralar: yer izleme montajı ve takip uçağı rampa çerçevesinde sabit; roketi yalnız ufkun üstündeyken görürler (launchcam.js)
    const dr = east.map((c, i) => c * this.drEN[0] + north[i] * this.drEN[1]), padP = { pos: pu.map((c) => c * this.E.R_E), up: pu, dr }, rv = this.drawR(s.r);
    const see = { track: sight(siteEye(padP, SITES.track), rv, this.E.R_E), air: sight(siteEye(padP, SITES.air), rv, this.E.R_E) };
    const shot = directShot({ met: real, events: this.A.events, maxQ: P.sim && P.sim.maxQ, user: this.camUser, see });
    if (!this.userWarp) { const w = autoWarp(real, shot.slow); if (w !== this.warp) { this.warp = w; this.syncBar(); } }
    const vRel = s.vRel ? Math.hypot(...s.vRel) : 0;
    const nSep = (this.A.events || []).filter((e) => e.cut != null && real >= e.t).length;                // kademe süzülmesinde de doğru kademe
    this.updTele(real, met, h, vRel, met < 0 ? 'GERİ SAYIM' : `${nSep + 1}. KADEME`, shot);
    this.world.ascentFrame({ cut, hidden, thr: thrNow, h, pAmb: atmosphere(h).p, sunUp, prop: (this.A.props || [])[st], shot, met: real, dtFlight: dts * k0, q: s.q || 0,
      sunDir: sd.map((c) => c / sn), upV: up,
      pad: { pos: padP.pos, east, north, up: pu, dr },
      debris: this.debris.map((d) => ({ id: d.id, lo: d.lo, hi: d.hi, part: d.part, hidden: d.hidden, r: this.drawR(d.r), q: qMul(d.q0, half(d.spin * d.age * 0.02)) })) });
    // canlandırma gerçek zamanlıdır (tasarım roketin kendi giriş süresini kullanır: design.js ascentTime); eski bir tasarımda süre farklıysa gerçek uçuş zamanı da yazılır
    const scaled = Math.abs(k0 - 1) > 0.005, msg = met < 0 ? `${this.rk.name} rampada · T−${Math.floor(-met)} s`
      : scaled ? `${this.rk.name} · gerçek uçuşta ${fmtMet(real)}${last ? ` · ${last.name} (${fmtMet(last.t)})` : ''}` : `${this.rk.name}${last ? ` · ${last.name} (${fmtMet(last.t)})` : ''}`;
    const mq = P.sim && P.sim.maxQ, nearQ = mq && Math.abs(real - mq.t) < 6 ? ` · MAX-Q ${(mq.q / 1000).toFixed(0)} kPa` : '';
    if (last && last !== this.lastEv) { this.lastEv = last; this.flash(last.name); }                            // yeni olay: yayın alt yazısı
    else if (mq && !this.qShown && real >= mq.t && real < mq.t + 20) { this.qShown = true; this.flash(`MAX-Q · ${(mq.q / 1000).toFixed(0)} kPa`); }
    const full = msg + ` · irtifa ${h.toFixed(h < 10 ? 1 : 0)} km` + (s.q != null && met > 0 && h < 100 ? ` · q ${(s.q / 1000).toFixed(1)} kPa` : '') + nearQ;
    if (full !== this.lastMsg) { this.txt.textContent = full; this.lastMsg = full; }
    const cr = this.world.asc && h < 40 ? this.world.asc.credit : ''; if (this.credit && this.credit.textContent !== cr) { this.credit.textContent = cr; this.placeTele(); }
    const x = { ...this.base, t: this.t, r: s.r, v: s.v, q, k: 0, thr: 0, phase: 'KALKIS', debris: [], local: null, att: null };
    // gösterge (ui.js hud): kalkışta roketin kendi değerleri — yere göre hız (bantla aynı), yaklaşık kütle (kalkış kütlesi × model oranı), yanan kademenin
    // kalan yakıtı, itki; görev aracının (yörüngede başlayan fizik) kütlesi ve yakıtı değil
    const veh = this.A.veh, ms = veh ? massState(veh, real) : null;
    // yakıt satırı: yanan kademe (kalan yakıt oranı); kademe arası süzülmede ateşlenecek kademe (dolu), son yanma bittiyse son kademe
    const lastT1 = veh ? veh.stages[veh.stages.length - 1].t1 : 0, burning = met < 0 || (ms && ms.si >= 0), after = !burning && real >= lastT1;
    const asc = { spd: vRel, m: ms && veh.m0 && met >= 0 ? veh.m0 * 1000 * ms.frac : veh && veh.m0 ? veh.m0 * 1000 : null, thr: thrNow,
      stage: burning ? 'Yanan kademe' : after ? 'Son kademe' : 'Sıradaki kademe', left: met < 0 ? 1 : burning ? ms.left : after ? null : 1 };
    this.hud = { ...x, altKm: h, asc }; return { ...x, r: this.drawR(s.r) };
  }
  async stop() {
    if (!this.active) return;
    this.active = false; this.bar.hidden = true; if (this.tele) this.tele.hidden = true; this.teleEl = null;
    for (const ev of ['pointermove', 'pointerdown', 'keydown']) window.removeEventListener(ev, this.onPoke);
    window.removeEventListener('resize', this.onResize); clearTimeout(this.pokeT); clearTimeout(this.flashT);
    document.body.classList.remove('launch-cine', 'asc-ui-on');
    await this.world.setAscent(null);
    Object.assign(this.world.cam, this.camPrev || {});
    this.onEnd && this.onEnd();
  }
}
