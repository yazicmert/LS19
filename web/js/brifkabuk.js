// Brifing kabuğu: Laboratuvar deneylerinin ortak girişi. LS19 önce deneyi adım adım kurdurur (her adımda önerisi ve sayılarla gerekçesi), sonra deney başlar.
// Kabuk deneyden bağımsızdır: kart (giriş, adımlar, gezinme, telefonda büyüyen sayfa), öneri ve gerekçe kutuları, seçenek listeleri, sahnedeki işaretler,
// kameranın adıma göre yumuşak geçişi, görüntü kaydırma (cisim kartın arkasında kalmasın) ve Esc ile geri. Deneyin kendisi alt sınıftadır:
//   brifing.js (Ay görevi) · brifsaptirma.js (Asteroit saptırma) …
// Alt sınıfın doldurduğu yerler:
//   introCard(kind) → { eye, h, lead, acts: [{ act, t, cls }], fine }   giriş kartı; onAct(act) düğmesi
//   renderStep(k, body, next)                                           adımın gövdesi (next: "Devam" düğmesi; kapatılabilir, etiketi değişebilir)
//   nextLabel(k) · recommendFor(k) → { v, why } · reasonsFor(k) → [{ t, a }]
//   aim(c, x, show, dt) → { az, el } | null                             sahne: kameranın bakışı ve işaretler (show: bu karede görünen işaretler)
//   frameExtra(c, x) · onOpen(kind) · onClosing(how)
import * as E from './engine.js';
import { fmt } from './format.js';
import { t as tr } from './i18n.js';

export const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
// gerekçe argümanı: { n, d } sayı (yerel biçim) ya da metin (çevrilir)
const fa = (x) => (x && typeof x === 'object' ? fmt(x.n, x.d) : tr(String(x)));

export class BriefShell {
  // host: { world, latest(), root, onClose(how) }
  // o: { id, domId, label, seen (localStorage anahtarı), steps [{ k, t, s }], scenes { k: { mode, dist, el, az, spin … } }, hide [world anahtarları], hideVehicle }
  constructor(host, o) {
    this.h = host; this.o = o; this.id = o.id; this.steps = o.steps;
    this.active = false; this.step = -1; this.sel = {}; this.waiting = false; this.cam = null; this.pins = {};
    this.root = el('section', 'brief'); this.root.id = o.domId || 'brief-' + o.id; this.root.hidden = true; this.root.setAttribute('aria-label', o.label);
    this.fade = el('div', 'brief-fade');
    this.card = el('div', 'brief-card');
    this.root.append(this.fade, this.card);
    (host.root || document.body).appendChild(this.root);
    this.onKey = (e) => {
      if (!this.active || e.key !== 'Escape') return;
      e.stopPropagation(); e.preventDefault();
      if (this.step > 0 && !this.waiting) this.go(this.step - 1); else if (this.step === 0) this.intro(this.kind);
    };
    window.addEventListener('keydown', this.onKey, true);
  }
  seen() { try { return localStorage.getItem(this.o.seen) === '1'; } catch (e) { return false; } }
  markSeen() { try { localStorage.setItem(this.o.seen, '1'); } catch (e) { /* özel pencere */ } }

  // ---------------------------------------------------------------- açılış ve kapanış
  open(kind = 'new') {
    this.kind = kind; this.active = true; this.root.hidden = false; this.waiting = false;
    document.body.classList.add('briefing'); document.body.dataset.brief = this.id;
    const W = this.h.world;
    this.saved = { cam: { ...W.cam }, vis: (this.o.hide || []).map((k) => [k, W[k] && W[k].visible]) };
    this.onOpen(kind);
    this.intro(kind);
  }
  close(how = null) {
    if (!this.active) return;
    this.active = false; this.root.hidden = true; this.onClosing(how); this.hidePins(); this.markSeen(); this.viewOffset(this.h.world, true);
    document.body.classList.remove('briefing'); delete document.body.dataset.brief;
    const W = this.h.world;
    if (this.o.hideVehicle && W.vehicle) W.vehicle.visible = true;
    if (W.labelsEl) W.labelsEl.style.display = '';
    if (this.saved) for (const [k, v] of this.saved.vis) if (W[k] && v != null) W[k].visible = v;
    if (how === 'away') { if (this.saved) Object.assign(W.cam, this.saved.cam); }       // başka alana geçildi: kamera eski hâline
    else Object.assign(W.cam, { auto: true, key: '' });                    // otomatik kamera deneyin anına göre yeniden seçer
    if (this.h.onClose) this.h.onClose(how, this.id);
  }
  onOpen() {}
  onClosing() {}

  // ---------------------------------------------------------------- giriş kartı: sol-ortada büyük başlık, sahne arkada
  intro(kind) {
    this.step = -1; this.setScene('intro'); this.root.classList.add('is-intro');
    const I = this.introCard(kind);
    this.card.className = 'brief-card brief-intro';
    this.card.innerHTML = `<p class="brief-eye">${esc(tr(I.eye))}</p>
      <h1 class="brief-h">${esc(tr(I.h))}</h1>
      <p class="brief-lead">${esc(tr(I.lead))}</p>
      <div class="brief-acts">${I.acts.map((a) => `<button type="button" class="${a.cls || 'ghost'}" data-act="${a.act}">${esc(tr(a.t))}</button>`).join('')}</div>
      ${I.fine ? `<p class="brief-fine">${esc(tr(I.fine))}</p>` : ''}`;
    this.card.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => (b.dataset.act === 'start' ? this.go(0) : this.onAct(b.dataset.act))));
    this.focusTitle();
  }
  onAct() {}

  // ---------------------------------------------------------------- adımlar
  go(i) {
    const N = this.steps.length, to = Math.max(0, Math.min(N - 1, i));
    const prevStep = this.step, prevBody = this.card.querySelector('.brief-body'), keepScroll = prevBody && prevStep === to ? prevBody.scrollTop : 0;
    this.step = to;
    this.root.classList.remove('is-intro');
    const S = this.steps[this.step];
    this.setScene(S.k);
    this.card.className = 'brief-card brief-step';
    const dots = this.steps.map((q, k) => `<li class="${k < this.step ? 'done' : k === this.step ? 'cur' : ''}"><span>${k + 1}</span><em>${esc(tr(q.t))}</em></li>`).join('');
    this.card.classList.toggle('full', !!this.full);
    this.card.innerHTML = `<button type="button" class="brief-grab" aria-expanded="${this.full ? 'true' : 'false'}" aria-label="Listeyi büyüt ya da sahneyi göster"><span></span></button><ol class="brief-dots" aria-label="Adımlar">${dots}</ol>
      <p class="brief-eye">${this.step + 1} / ${N} · ${esc(tr(S.s))}</p>
      <h2 class="brief-h" tabindex="-1">${esc(tr(S.t))}</h2>
      <div class="brief-body"></div>
      <div class="brief-nav"><button type="button" class="ghost" data-act="back">${this.step === 0 ? 'Giriş' : 'Geri'}</button><button type="button" class="primary" data-act="next"></button></div>`;
    const body = this.card.querySelector('.brief-body'), next = this.card.querySelector('[data-act="next"]'), grab = this.card.querySelector('.brief-grab');
    grab.onclick = () => { this.full = !this.full; this.card.classList.toggle('full', this.full); grab.setAttribute('aria-expanded', String(this.full)); };      // telefon: tam ekran liste ↔ sahne
    this.card.querySelector('[data-act="back"]').onclick = () => (this.step === 0 ? this.intro(this.kind) : this.go(this.step - 1));
    next.textContent = tr(this.nextLabel(S.k));
    next.onclick = () => this.go(this.step + 1);
    this.renderStep(S.k, body, next);
    if (keepScroll) body.scrollTop = keepScroll;
    if (prevStep !== this.step) this.focusTitle();                                   // aynı adım yeniden çizilince (canlı sonuç) odak yerinde kalır
  }
  nextLabel() { return 'Devam'; }
  stepKey() { const S = this.steps[this.step]; return S ? S.k : null; }
  redraw() { if (this.active && this.step >= 0) this.go(this.step); }
  focusTitle() { const h = this.card.querySelector('.brief-h'); if (h && h.focus) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  // brifingin sonundaki başlatma düğmeleri: kaydırılan alanın dışında (telefonda da hep görünür). acts [{ go, t, cls }]; onGo(go) seçileni başlatır
  goButtons(acts, backLabel, onGo) {
    const nav = this.card.querySelector('.brief-nav'), [first, ...rest] = acts;
    const go = el('div', 'brief-go', `<button type="button" class="${first.cls || 'primary'}" data-go="${first.go}">${esc(tr(first.t))}</button>`
      + (rest.length ? `<div>${rest.map((a) => `<button type="button" class="${a.cls || 'ghost'}" data-go="${a.go}">${esc(tr(a.t))}</button>`).join('')}</div>` : ''));
    this.card.insertBefore(go, nav);
    nav.hidden = false; nav.querySelector('[data-act="next"]').hidden = true;
    if (backLabel) nav.querySelector('[data-act="back"]').textContent = tr(backLabel);
    go.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => onGo(b.dataset.go)));
    return go;
  }
  // bekleme göstergesi (hesap sürerken gövde ve gezinme)
  waitBox(body, lead, note) {
    body.innerHTML = `<p class="brief-lead">${esc(tr(lead))}</p><div class="brief-wait" role="status"><span class="brief-spin" aria-hidden="true"></span><span>${esc(tr(note))}</span></div>`;
  }
  failBox(body, msg, hint) {
    body.innerHTML = `<p class="brief-err" role="alert">${esc(msg)}</p>${hint ? `<p class="brief-note">${esc(tr(hint))}</p>` : ''}`;
    const nav = this.card.querySelector('.brief-nav'); nav.hidden = false; nav.querySelector('[data-act="next"]').hidden = true;
  }

  // LS19 önerisi: gerekçe ve "LS19 seçsin" düğmesi (seçili değilse); ardından seçimin sayılarla gerekçesi
  rec(body, step, cur, apply) {
    const r = this.recommendFor(step);
    if (r) {
      const box = el('div', 'brief-rec');
      box.innerHTML = `<b>LS19 önerisi</b><p>${esc(tr(r.why))}</p>${r.v === cur ? '<span class="brief-ok">Seçili</span>' : r.v == null ? '' : '<button type="button" class="chip">LS19 seçsin</button>'}`;
      const b = box.querySelector('button'); if (b) b.onclick = () => apply(r.v);
      body.appendChild(box);
    }
    this.why(body, step);
  }
  recommendFor() { return null; }
  reasonsFor() { return []; }
  why(body, step) {
    const R = this.reasonsFor(step); if (!R || !R.length) return;
    body.appendChild(el('div', 'brief-why', `<b>Bu seçim</b><ul>${R.map((q) => `<li>${esc(tr(q.t, ...(q.a || []).map(fa)))}</li>`).join('')}</ul>`));
  }
  // seçenek listesi: items [{ v, t, s, meta, warn, disabled, svg }]
  options(body, name, items, cur, onPick) {
    const list = el('div', 'brief-opts'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', name);
    for (const it of items) {
      const b = el('button', 'brief-opt' + (it.v === cur ? ' on' : '') + (it.warn ? ' warn' : ''));
      b.type = 'button'; b.dataset.v = it.v; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(it.v === cur)); b.disabled = !!it.disabled;
      b.innerHTML = `<span class="bo-t">${esc(tr(it.t))}</span>${it.meta ? `<span class="bo-m">${esc(it.meta)}</span>` : ''}${it.svg || ''}<span class="bo-s">${esc(tr(it.s || ''))}</span>`;
      if (it.svg) b.classList.add('has-svg');
      b.onclick = () => onPick(it.v);
      list.appendChild(b);
    }
    body.appendChild(list);
    return list;
  }
  // iki-üç seçenekli düğme grubu (gelişmiş ayarlar): items [[v, t]]
  seg(parent, name, cur, items, onPick) {
    const g = el('div', 'brief-seg'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', name);
    for (const [v, t] of items) { const b = el('button', cur === v ? 'on' : '', esc(tr(t))); b.type = 'button'; b.setAttribute('aria-pressed', String(cur === v)); b.onclick = () => onPick(v); g.appendChild(b); }
    parent.appendChild(el('p', 'brief-lab', esc(tr(name)))); parent.appendChild(g);
  }

  // ---------------------------------------------------------------- 3B sahne
  setScene(k) {
    const sc = this.o.scenes[k] || this.o.scenes.intro, prev = this.cam;
    this.cam = { ...sc, k, az: sc.az ?? (prev && prev.mode === sc.mode ? prev.az : 0.6), el: sc.el ?? 0.3 };
    if (prev && prev.mode !== sc.mode) { this.fade.classList.add('on'); clearTimeout(this.fadeT); this.fadeT = setTimeout(() => this.fade.classList.remove('on'), 260); }
  }
  // app.js her karede (world.update'ten sonra): kamera, gizlenenler, işaretler
  frame(dt) {
    if (!this.active || !this.cam) return;
    const W = this.h.world, x = this.h.latest(); if (!x) return;
    if (this.o.hideVehicle) { if (W.vehicle) W.vehicle.visible = false; if (W.vehMarker) W.vehMarker.visible = false; }
    const c = this.cam;
    for (const k of this.o.hide || []) if (W[k]) W[k].visible = this.keepVisible(k, c);            // three: yalnız tam false gizler
    if (W.labelsEl) W.labelsEl.style.display = 'none';
    const show = new Set();
    c.t = (c.t || 0) + dt;
    const a = this.aim(c, x, show, dt);
    let az = c.az, elv = c.el;
    if (a) { az = a.az; elv = a.el; } else c.az += (c.spin || 0) * dt;
    for (const k in this.pins) if (!show.has(k)) this.pins[k].hidden = true;
    this.frameExtra(c, x);
    this.viewOffset(W);
    // dikey ekran (telefon): yatay görüş dar, cisim ve sistem sığsın diye uzaklaşılır
    const asp = W.camera ? W.camera.aspect : 1.6, dist = c.dist * (asp < 1 ? this.portraitScale(c, asp) : 1);
    const cur = W.cam, k = 1 - Math.exp(-dt / 0.45), wrap = (q) => Math.atan2(Math.sin(q), Math.cos(q));
    if (cur.mode !== c.mode || (c.focus && cur.focus !== c.focus)) Object.assign(cur, { mode: c.mode, az, el: elv, dist }, c.focus ? { focus: c.focus } : {});
    else Object.assign(cur, { az: cur.az + wrap(az - cur.az) * k, el: cur.el + (elv - cur.el) * k, dist: Math.exp(Math.log(cur.dist) + (Math.log(dist) - Math.log(cur.dist)) * k) });
    cur.auto = false;
  }
  keepVisible() { return false; }
  aim() { return null; }
  frameExtra() {}
  portraitScale(c, asp) { return c.mode === 'SYSTEM' || c.mode === 'SOLAR' ? Math.min(2.2, 0.95 / asp) : 1.75; }
  // görüntü kaydırma (THREE.PerspectiveCamera.setViewOffset): cisim kartın arkasında kalmasın. Masaüstünde sağa (kart solda), telefonda yukarı
  // (sayfa altta; tam ekran listede kaydırma yok). Girişte başlık solda/altta: sahne sağa/yukarı. İşaretler aynı izdüşümle (project) yerinde kalır
  viewOffset(W, off = false) {
    const cam = W.camera, cv = W.canvas; if (!cam || !cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, narrow = w <= 700, intro = this.root.classList.contains('is-intro');
    let ox = 0, oy = 0;
    if (!off) {
      const sys = this.cam && (this.cam.mode === 'SYSTEM' || this.cam.wide), site = this.cam && this.cam.site;
      if (narrow) { oy = intro ? Math.round(h * 0.2) : this.full ? 0 : Math.round(h * (site ? 0.27 : 0.21)); if (sys && !intro) ox = Math.round(w * 0.28); }      // telefonda Dünya–Ay: Dünya solda, Ay sağda sığar
      else ox = intro ? -Math.round(w * 0.16) : -Math.round(Math.min(260, ((this.card.offsetWidth || 432) + 14) / 2));
    }
    const k = [w, h, ox, oy].join(); if (k === this.vo) return; this.vo = k;
    if (!ox && !oy) cam.clearViewOffset(); else cam.setViewOffset(w, h, ox, oy, w, h);
    cam.updateProjectionMatrix();
  }
  hidePins() { for (const k in this.pins) this.pins[k].hidden = true; this.clearScene(); }
  clearScene() {}
  // ekran işareti: p (km, Dünya merkezli); cen verilirse p bir yüzey noktasıdır ve cismin arka yüzündeyse gizlenir.
  // o: { on (seçili), pick (dokununca seçer: düğme), left (ad solda: komşu işaretler çakışmasın) }
  placePin(key, p, label, cen = null, o = {}) {
    const W = this.h.world, eye = W.eye, cam = W.camera;
    let n = this.pins[key];
    if (!n) { n = this.pins[key] = el(o.pick !== undefined ? 'button' : 'div', 'brief-pin' + (cen ? '' : ' body'), '<i></i><b></b>'); if (n.tagName === 'BUTTON') n.type = 'button'; this.root.insertBefore(n, this.card); }
    n.classList.toggle('on', !!o.on); n.classList.toggle('pick', !!o.pick); n.classList.toggle('left', !!o.left); n.onclick = o.pick || null; if (n.tagName === 'BUTTON') { n.disabled = !o.pick; n.setAttribute('aria-pressed', String(!!o.on)); }
    if (!eye || !cam) { n.hidden = true; return; }
    const v = cam.position.clone().set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]).project(cam);
    let facing = true;
    if (cen) { const toEye = unit([eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]]), up = unit(E.sub(p, cen)); facing = toEye[0] * up[0] + toEye[1] * up[1] + toEye[2] * up[2] > 0.05; }
    if (!facing || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { n.hidden = true; return; }
    const r = W.canvas.getBoundingClientRect();
    n.hidden = false; n.style.transform = `translate(${((v.x + 1) / 2 * r.width).toFixed(1)}px, ${((1 - v.y) / 2 * r.height).toFixed(1)}px)`;
    const b = n.querySelector('b'), tl = tr(label); if (b.textContent !== tl) b.textContent = tl;
  }
}
