// Görev brifingi (Laboratuvar › Ay görevi'nin girişi): LS19 önce görevi tasarlatır, sonra görev rampadan ya da yörüngeden başlar.
// Akış: giriş kartı → 1 Nereye (iniş yeri) → 2 Ne zaman (tarih) → 3 Nasıl (profil) → 4 Neyle (roket, araç, güdüm) → 5 Brifing (tasarım ve özet).
// Brifing açıkken araç, uçuş göstergeleri ve deney paneli gizlidir; arkadaki 3B sahne adıma göre değişir (Dünya–Ay sistemi, seçilen iniş yeri, Dünya).
// Saf mantık brifingtext.js'te; tasarım, roket ve kalkış app.js'in kendi işlevleridir (host): fizik ve tasarım koduna dokunulmaz.
import * as E from './engine.js';
import { BRIEF_STEPS, SITE_NOTES, PROFILE_NOTES, PROFILE_ORDER, datePresets, profileStats, rocketFit, designEta, recommend, briefSummary } from './brifingtext.js';
import { LUNAR_SITES, siteOf } from './moonsite.js';
import { ROCKETS, ROCKET_IDS, tliCapacity } from './rockets.js';
import { DV_NAMES } from './dvbudget.js';
import { fmt } from './format.js';
import { ns, ew, t as tr } from './i18n.js';

const SEEN = 'ls19.brifing';
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const utc = (t) => E.utcString(t).slice(0, 16).replace('T', ' ') + ' UTC';
const todayStr = () => new Date().toISOString().slice(0, 10);

// sahne: adım → kamera (kip, uzaklık, yükseklik açısı, dönme hızı rad/s)
// sun: Güneş tarafından bakış (gündüz yüzü, gece–gündüz sınırı kenarda), off: Güneş yönünden sapma (rad), orbit: Ay'ın yörüngesi görünür, tags: cisim adları
const SCENES = {
  intro: { mode: 'EARTH', dist: 15500, sun: true, off: 0.75, spin: 0.025 },
  yer: { mode: 'MOON', dist: 6200, site: true },
  tarih: { mode: 'MOON', dist: 9000, site: true },
  profil: { mode: 'SYSTEM', dist: 640000, el: 0.62, spin: 0.03, orbit: true, tags: true },
  roket: { mode: 'EARTH', dist: 21000, sun: true, off: 0.45, spin: 0.03 },
  brifing: { mode: 'SYSTEM', dist: 600000, el: 0.5, spin: 0.025, orbit: true, tags: true },
};
// brifingde gizlenen sahne çizgileri (araç izi, yörüngeler, eksenler, meridyenler, işaretler)
const HIDE = ['trailLineE', 'trailLineM', 'osc', 'stageOsc', 'haloPath', 'moonPath', 'siteMarker', 'embEarth', 'embMoon', 'embMarker', 'earthAxis', 'moonAxis', 'earthMer', 'moonMer'];

export class Briefing {
  // host: { world, ui, latest(), defs(), design(sel) → Promise<void> (tasarımı başlatır), launch(how), current() → seçimlerin şimdiki hâli, preload(roket), onClose() }
  constructor(host) {
    this.h = host; this.active = false; this.step = -1; this.sel = {}; this.waiting = false; this.result = null;
    this.root = el('section', 'brief'); this.root.id = 'brief'; this.root.hidden = true; this.root.setAttribute('aria-label', 'Görev brifingi');
    this.fade = el('div', 'brief-fade'); this.pins = {};
    this.card = el('div', 'brief-card');
    this.root.append(this.fade, this.card);
    (host.root || document.body).appendChild(this.root);
    this.onKey = (e) => {
      if (!this.active || e.key !== 'Escape') return;
      e.stopPropagation(); e.preventDefault();
      if (this.step > 0 && !this.waiting) this.go(this.step - 1); else if (this.step === 0) this.intro(this.kind);
    };
    window.addEventListener('keydown', this.onKey, true);
    this.cam = null;
  }
  static seen() { try { return localStorage.getItem(SEEN) === '1'; } catch (e) { return false; } }
  markSeen() { try { localStorage.setItem(SEEN, '1'); } catch (e) { /* özel pencere */ } }

  // ---------------------------------------------------------------- açılış ve kapanış
  open(kind = 'new') {
    this.kind = kind; this.active = true; this.root.hidden = false; this.waiting = false; this.result = null;
    document.body.classList.add('briefing');
    const W = this.h.world;
    this.saved = { cam: { ...W.cam }, vis: HIDE.map((k) => [k, W[k] && W[k].visible]) };
    this.sel = { ...this.h.current() };
    if (!PROFILE_ORDER.includes(this.sel.profile)) this.sel.profile = 'APOLLO';
    this.intro(kind);
  }
  close(how = null) {
    if (!this.active) return;
    this.active = false; this.root.hidden = true; this.hidePins(); this.markSeen();
    document.body.classList.remove('briefing');
    const W = this.h.world;
    if (W.vehicle) W.vehicle.visible = true;
    if (W.labelsEl) W.labelsEl.style.display = '';
    if (this.saved) for (const [k, v] of this.saved.vis) if (W[k] && v != null) W[k].visible = v;
    if (how === 'away') { if (this.saved) Object.assign(W.cam, this.saved.cam); }       // başka alana geçildi: kamera eski hâline
    else Object.assign(W.cam, { auto: true, key: '' });                    // otomatik kamera görevin anına göre yeniden seçer
    if (this.h.onClose) this.h.onClose(how);
  }

  // ---------------------------------------------------------------- giriş kartı
  intro(kind) {
    this.step = -1; this.setScene('intro'); this.root.classList.add('is-intro');
    const ret = kind === 'return';
    this.card.className = 'brief-card brief-intro';
    this.card.innerHTML = `<p class="brief-eye">LS19 · Görev kontrol</p>
      <h1 class="brief-h">${ret ? 'Yeni bir göreve hazır mısın?' : 'Ay\'a bir görev tasarlayalım.'}</h1>
      <p class="brief-lead">${ret ? 'Kaldığın görev seni bekliyor. İstersen yeni bir iniş yeri, tarih ve roketle baştan tasarla.'
    : 'Nereye ineceğini, ne zaman fırlatacağını, hangi yoldan ve hangi roketle gideceğini sen seç. LS19 her adımda önerisini ve gerekçesini söyler; gerçek fizikle görevi hesaplar, sonra rampadan fırlatırsın.'}</p>
      <div class="brief-acts">
        <button type="button" class="primary" data-act="start">${ret ? 'Yeni görev tasarla' : 'Tasarlamaya başla'}</button>
        <button type="button" class="ghost" data-act="${ret ? 'resume' : 'watch'}">${ret ? 'Kaldığım yerden devam' : 'Hazır görevi izle'}</button>
      </div>
      ${ret ? '' : '<p class="brief-fine">Hazır görev: 13 Ekim 2026, Apollo 11 yerine iniş, fragman olarak.</p>'}`;
    this.card.querySelector('[data-act="start"]').onclick = () => this.go(0);
    const b2 = this.card.querySelector('[data-act="resume"], [data-act="watch"]');
    b2.onclick = () => { const w = b2.dataset.act === 'watch'; this.close(w ? 'cine' : null); if (w) this.h.launch('cine'); };
    this.focusTitle();
  }

  // ---------------------------------------------------------------- adımlar
  go(i) {
    this.step = Math.max(0, Math.min(BRIEF_STEPS.length - 1, i));
    this.root.classList.remove('is-intro');
    const S = BRIEF_STEPS[this.step];
    this.setScene(S.k);
    this.card.className = 'brief-card brief-step';
    const dots = BRIEF_STEPS.map((q, k) => `<li class="${k < this.step ? 'done' : k === this.step ? 'cur' : ''}"><span>${k + 1}</span><em>${esc(tr(q.t))}</em></li>`).join('');
    this.card.innerHTML = `<ol class="brief-dots" aria-label="Adımlar">${dots}</ol>
      <p class="brief-eye">${this.step + 1} / ${BRIEF_STEPS.length} · ${esc(tr(S.s))}</p>
      <h2 class="brief-h" tabindex="-1">${esc(tr(S.t))}</h2>
      <div class="brief-body"></div>
      <div class="brief-nav"><button type="button" class="ghost" data-act="back">${this.step === 0 ? 'Giriş' : 'Geri'}</button><button type="button" class="primary" data-act="next"></button></div>`;
    const body = this.card.querySelector('.brief-body'), next = this.card.querySelector('[data-act="next"]');
    this.card.querySelector('[data-act="back"]').onclick = () => (this.step === 0 ? this.intro(this.kind) : this.go(this.step - 1));
    next.textContent = this.step === 3 ? 'Görevi tasarla' : 'Devam';
    next.onclick = () => this.go(this.step + 1);
    if (S.k === 'yer') this.stepSite(body);
    else if (S.k === 'tarih') this.stepDate(body);
    else if (S.k === 'profil') this.stepProfile(body);
    else if (S.k === 'roket') this.stepRocket(body, next);
    else this.stepBrief(body);
    this.focusTitle();
  }
  focusTitle() { const h = this.card.querySelector('.brief-h'); if (h && h.focus) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }

  // LS19 önerisi: gerekçe ve "LS19 seçsin" düğmesi (seçili değilse)
  rec(body, step, cur, apply) {
    const r = recommend(step, this.sel, todayStr()); if (!r) return;
    const box = el('div', 'brief-rec');
    const same = r.v === cur;
    box.innerHTML = `<b>LS19 önerisi</b><p>${esc(tr(r.why))}</p>${same ? '<span class="brief-ok">Seçili</span>' : '<button type="button" class="chip">LS19 seçsin</button>'}`;
    const b = box.querySelector('button'); if (b) b.onclick = () => apply(r.v);
    body.appendChild(box);
  }
  // seçenek listesi: items [{ v, t, s, meta, warn, disabled }]
  options(body, name, items, cur, onPick) {
    const list = el('div', 'brief-opts'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', name);
    for (const it of items) {
      const b = el('button', 'brief-opt' + (it.v === cur ? ' on' : '') + (it.warn ? ' warn' : ''));
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(it.v === cur)); b.disabled = !!it.disabled;
      b.innerHTML = `<span class="bo-t">${esc(tr(it.t))}</span>${it.meta ? `<span class="bo-m">${esc(it.meta)}</span>` : ''}<span class="bo-s">${esc(tr(it.s || ''))}</span>`;
      b.onclick = () => onPick(it.v);
      list.appendChild(b);
    }
    body.appendChild(list);
  }

  stepSite(body) {
    const pick = (v) => { this.sel.site = v; this.go(this.step); };
    this.rec(body, 'yer', this.sel.site, pick);
    this.options(body, 'İniş yeri', Object.keys(LUNAR_SITES).filter((k) => SITE_NOTES[k]).map((k) => {
      const s = siteOf(k);
      return { v: k, t: `Apollo ${k.slice(1)} · ${SITE_NOTES[k].t}`, meta: `${fmt(Math.abs(s.latDeg), 1)}° ${ns(s.latDeg)} ${fmt(Math.abs(s.lonDeg), 1)}° ${ew(s.lonDeg)}`, s: SITE_NOTES[k].s };
    }), this.sel.site, pick);
  }
  stepDate(body) {
    const today = todayStr(), pick = (v) => { this.sel.date = v; this.go(this.step); };
    this.rec(body, 'tarih', this.sel.date, pick);
    const pre = datePresets(today);
    this.options(body, 'Fırlatma tarihi', pre.map((p) => ({ v: p.d, t: p.t, meta: p.d, s: p.s })), this.sel.date, pick);
    const row = el('label', 'brief-date', `<span>Başka bir gün</span><input type="date" min="1850-01-01" max="2149-12-01" value="${esc(this.sel.date || today)}">`);
    row.querySelector('input').onchange = (e) => { if (e.target.value) pick(e.target.value); };
    body.appendChild(row);
    body.appendChild(el('p', 'brief-note', 'LS19 seçtiğin günden sonraki ilk uygun pencereyi bulur: iniş yerinde Güneş alçakta (5°–20°) olmalı, uzun gölgeler araziyi gösterir. Pencere sonraki aya kayarsa brifingde gerçek tarih yazar.'));
  }
  stepProfile(body) {
    const pick = (v) => { this.sel.profile = v; this.go(this.step); }, defs = this.h.defs();
    this.rec(body, 'profil', this.sel.profile, pick);
    this.options(body, 'Yörünge profili', PROFILE_ORDER.map((k) => {
      const st = profileStats(defs, k), N = PROFILE_NOTES[k];
      return { v: k, t: N.t, s: N.s, meta: st ? `${fmt(st.days, 1)} gün · Δv ${fmt(st.dv, 0)} m/s` : '' };
    }), this.sel.profile, pick);
    body.appendChild(el('p', 'brief-note', 'Süre ve Δv: 13 Ekim 2026 penceresinde Apollo 11 yerine tasarlanmış görevler (fırlatmadan inişe). Başka yer ve tarihte biraz değişir.'));
  }
  stepRocket(body, next) {
    const pick = (v) => { this.sel.rocket = v; this.go(this.step); };
    if (this.h.preload) this.h.preload(this.sel.rocket);                                  // seçilen roket ve rampası arkada hazırlanır: "Rampadan fırlat" beklemesiz
    const st = profileStats(this.h.defs(), this.sel.profile), lander = st ? st.lander : null;
    this.rec(body, 'roket', this.sel.rocket, pick);
    this.options(body, 'Roket', ROCKET_IDS.map((id) => {
      const R = ROCKETS[id], f = rocketFit(tliCapacity(id), lander);
      return { v: id, t: R.name, meta: `${R.year} · ${R.pad}`, s: f.sized ? 'Yakıtı göreve göre boyutlanan temsilî kademe (hazır tasarımlar bununla).' : f.ok ? tr('Ay yoluna {0} kg taşır: araç ({1} kg) sığar.', fmt(tliCapacity(id), 0), fmt(lander, 0)) : tr('Ay yoluna en çok {0} kg: bu profilin aracı ({1} kg) için yetmez.', fmt(tliCapacity(id), 0), fmt(lander, 0)), warn: !f.ok, disabled: !f.ok };
    }), this.sel.rocket, pick);
    const adv = el('details', 'brief-adv', '<summary>Araç ve iniş güdümü</summary>');
    const mk = (name, key, items) => { const g = el('div', 'brief-seg'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', name);
      for (const [v, t] of items) { const b = el('button', this.sel[key] === v ? 'on' : '', esc(tr(t))); b.type = 'button'; b.setAttribute('aria-pressed', String(this.sel[key] === v)); b.onclick = () => { this.sel[key] = v; adv.open = true; this.go(this.step); }; g.appendChild(b); }
      adv.appendChild(el('p', 'brief-lab', esc(tr(name)))); adv.appendChild(g); };
    mk('Araç', 'vehicle', [['two', 'İki kademe'], ['one', 'Tek kademe']]);
    mk('İniş güdümü', 'landing', [['opt', 'Optimal (dengeli)'], ['free', 'Optimal (serbest)'], ['zem', 'ZEM/ZEV (Apollo)']]);
    if (this.advOpen) adv.open = true; adv.ontoggle = () => { this.advOpen = adv.open; };
    body.appendChild(adv);
    const eta = designEta(this.sel);
    body.appendChild(el('p', 'brief-note', tr('Tasarım süresi: {0}. LS19 fırlatmayı, Ay\'a aktarmayı ve inişi gerçek efemerisle hesaplar.', tr(eta.t))));
    const R = ROCKETS[this.sel.rocket]; if (R && !rocketFit(tliCapacity(this.sel.rocket), lander).ok) next.disabled = true;
  }

  // 5: tasarım (host.design) ve özet
  stepBrief(body) {
    if (this.result && this.result.key === this.key()) { this.renderSummary(body); return; }
    this.waiting = true; this.result = null;
    body.innerHTML = `<p class="brief-lead">LS19 görevini hesaplıyor: fırlatma penceresi, park yörüngesi, Ay'a aktarma, Ay yörüngesi ve iniş.</p>
      <div class="brief-wait" role="status"><span class="brief-spin" aria-hidden="true"></span><span>${esc(tr('Tasarım süresi: {0}.', tr(designEta(this.sel).t)))}</span></div>`;
    this.card.querySelector('.brief-nav').hidden = true;
    this.h.design({ ...this.sel }).catch((e) => this.onFail(String((e && e.message) || e)));
  }
  key() { const s = this.sel; return [s.site, s.date, s.profile, s.rocket, s.vehicle, s.landing].join('|'); }
  // app.js: görev hazır (tasarım worker'a kuruldu)
  onReady(D) {
    if (!this.active || !this.waiting) return;
    this.waiting = false; this.result = { key: this.key(), D };
    if (BRIEF_STEPS[this.step] && BRIEF_STEPS[this.step].k === 'brifing') this.go(this.step);
  }
  onFail(msg) {
    if (!this.active || !this.waiting) return;
    this.waiting = false;
    const body = this.card.querySelector('.brief-body'); if (!body) return;
    body.innerHTML = `<p class="brief-err" role="alert">${esc(tr('Bu seçimlerle görev tasarlanamadı: {0}', msg))}</p><p class="brief-note">Başka bir tarih, profil ya da daha güçlü bir roket dene.</p>`;
    const nav = this.card.querySelector('.brief-nav'); nav.hidden = false; nav.querySelector('[data-act="next"]').hidden = true;
  }
  renderSummary(body) {
    const D = this.result.D, sm = briefSummary(D, utc), s = siteOf(this.sel.site), R = ROCKETS[this.sel.rocket];
    const rows = [['İniş yeri', `Apollo ${this.sel.site.slice(1)} · ${SITE_NOTES[this.sel.site].t}`], ['Fırlatma', sm.launch], ['İniş', sm.landing || '—'],
      ['Süre', sm.days != null ? tr('{0} gün', fmt(sm.days, 1)) : '—'], ['Profil', PROFILE_NOTES[this.sel.profile].t], ['Roket', R ? R.name : '—'],
      ['İnişte Güneş', sm.sunEl != null ? `${fmt(sm.sunEl, 1)}°` : '—']];
    const dv = sm.dv.map(([k, v]) => `<tr><td>${esc(tr(DV_NAMES[k] || k))}</td><td>${fmt(v, 0)} m/s</td></tr>`).join('');
    body.innerHTML = `<p class="brief-lead">${esc(tr('Görev hazır. {0} yerine iniş, {1} gün sürecek.', s.name, fmt(sm.days, 1)))}</p>
      <dl class="brief-sum">${rows.map(([k, v]) => `<div><dt>${esc(tr(k))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <details class="brief-adv"><summary>${esc(tr('Δv bütçesi: toplam {0} m/s', fmt(sm.total, 0)))}</summary><table class="brief-dv">${dv}</table></details>`;
    // başlatma düğmeleri kaydırılan alanın dışında (telefonda da hep görünür)
    const nav = this.card.querySelector('.brief-nav'), go = el('div', 'brief-go', `<button type="button" class="primary" data-go="pad">Rampadan fırlat</button>
      <div><button type="button" class="ghost" data-go="orbit">Yörüngeden başla</button><button type="button" class="ghost" data-go="cine">Fragman olarak izle</button></div>`);
    this.card.insertBefore(go, nav);
    nav.hidden = false; nav.querySelector('[data-act="next"]').hidden = true;
    nav.querySelector('[data-act="back"]').textContent = 'Seçimleri değiştir';
    go.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const how = b.dataset.go; this.close(how); this.h.launch(how); }));
  }

  // ---------------------------------------------------------------- 3B sahne
  setScene(k) {
    const sc = SCENES[k] || SCENES.intro, prev = this.cam;
    this.cam = { ...sc, k, az: prev && prev.mode === sc.mode ? prev.az : 0.6, el: sc.el ?? 0.3 };
    if (prev && prev.mode !== sc.mode) { this.fade.classList.add('on'); clearTimeout(this.fadeT); this.fadeT = setTimeout(() => this.fade.classList.remove('on'), 260); }
  }
  // app.js her karede (world.update'ten sonra): kamera, gizlenenler, işaretler
  frame(dt) {
    if (!this.active || !this.cam) return;
    const W = this.h.world, x = this.h.latest(); if (!x) return;
    if (W.vehicle) W.vehicle.visible = false;
    if (W.vehMarker) W.vehMarker.visible = false;
    const c = this.cam;
    for (const k of HIDE) if (W[k]) W[k].visible = !!c.orbit && k === 'embMoon';            // three: yalnız tam false gizler
    if (W.labelsEl) W.labelsEl.style.display = 'none';
    const rm = E.moonPos(x.t), show = new Set();
    let az = c.az, elv = c.el;
    c.t = (c.t || 0) + dt;
    if (c.site) {                                                                  // iniş yerine bakış: yer ile Güneş yönü arasından (yer görünür, yüz aydınlık kalsın)
      const s = siteOf(this.sel.site || 'A11'), d = unit(s.icrf(x.t)), sun = unit(E.sub(E.sunPos(x.t), rm));
      const v = unit([d[0] + 0.55 * sun[0], d[1] + 0.55 * sun[1], d[2] + 0.55 * sun[2]]);
      az = Math.atan2(v[1], v[0]); elv = Math.asin(Math.max(-1, Math.min(1, v[2])));
      this.placePin('site', E.add(rm, E.scale(s.icrf(x.t), 1.0006)), `Apollo ${(this.sel.site || 'A11').slice(1)}`, rm); show.add('site');
    } else if (c.sun) {                                                            // Dünya: Güneş tarafından, gece–gündüz sınırı kenarda; yavaşça döner
      const sv = unit(E.sunPos(x.t));
      az = Math.atan2(sv[1], sv[0]) + c.off + (c.spin || 0) * c.t; elv = Math.max(-0.6, Math.min(0.6, Math.asin(sv[2]))) + 0.18;
    } else c.az += (c.spin || 0) * dt;
    if (c.tags) { this.placePin('E', [0, 0, 0], 'Dünya'); this.placePin('M', rm, 'Ay'); show.add('E'); show.add('M'); }
    for (const k in this.pins) if (!show.has(k)) this.pins[k].hidden = true;
    const cur = W.cam, k = 1 - Math.exp(-dt / 0.45), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (cur.mode !== c.mode) Object.assign(cur, { mode: c.mode, az, el: elv, dist: c.dist });
    else Object.assign(cur, { az: cur.az + wrap(az - cur.az) * k, el: cur.el + (elv - cur.el) * k, dist: Math.exp(Math.log(cur.dist) + (Math.log(c.dist) - Math.log(cur.dist)) * k) });
    cur.auto = false;
  }
  hidePins() { for (const k in this.pins) this.pins[k].hidden = true; }
  // ekran işareti: p (km, Dünya merkezli); cen verilirse p bir yüzey noktasıdır ve cismin arka yüzündeyse gizlenir
  placePin(key, p, label, cen = null) {
    const W = this.h.world, eye = W.eye, cam = W.camera;
    let n = this.pins[key]; if (!n) { n = this.pins[key] = el('div', 'brief-pin' + (cen ? '' : ' body'), '<i></i><b></b>'); this.root.insertBefore(n, this.card); }
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
