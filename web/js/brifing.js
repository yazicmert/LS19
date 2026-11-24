// Görev brifingi (Laboratuvar › Ay görevi'nin girişi): LS19 önce görevi tasarlatır, sonra görev rampadan ya da yörüngeden başlar.
// Akış: giriş kartı → 1 Nereye (iniş yeri) → 2 Ne zaman (tarih) → 3 Nasıl (profil) → 4 Neyle (roket, araç, güdüm) → 5 Brifing (tasarım ve özet).
// Brifing açıkken araç, uçuş göstergeleri ve deney paneli gizlidir; arkadaki 3B sahne adıma göre değişir (Dünya–Ay sistemi, seçilen iniş yeri, Dünya).
// Saf mantık brifingtext.js'te; tasarım, roket ve kalkış app.js'in kendi işlevleridir (host): fizik ve tasarım koduna dokunulmaz.
import * as THREE from 'three';
import * as E from './engine.js';
import { BRIEF_STEPS, SITE_NOTES, PROFILE_NOTES, PROFILE_ORDER, datePresets, profileStats, rocketFit, designEta, recommend, briefSummary, profilePath, profileSvg, reasons, statsOf, livePath, DEFAULT_BRIEF_DATE } from './brifingtext.js';
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
  profil: { mode: 'SYSTEM', dist: 820000, el: 1.15, az: -Math.PI / 2, orbit: true, tags: true, path: true },        // üstten; Dünya ortada, Ay sağda
  roket: { mode: 'EARTH', dist: 21000, sun: true, off: 0.45, spin: 0.03 },
  brifing: { mode: 'SYSTEM', dist: 820000, el: 1.05, az: -Math.PI / 2, orbit: true, tags: true, path: true },
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
    this.active = false; this.root.hidden = true; this.stopLive(); this.waitLive = false; this.hidePins(); this.markSeen(); this.viewOffset(this.h.world, true);
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
    const prevStep = this.step, prevBody = this.card.querySelector('.brief-body'), keepScroll = prevBody && prevStep === Math.max(0, Math.min(BRIEF_STEPS.length - 1, i)) ? prevBody.scrollTop : 0;
    this.step = Math.max(0, Math.min(BRIEF_STEPS.length - 1, i));
    this.root.classList.remove('is-intro');
    const S = BRIEF_STEPS[this.step];
    this.setScene(S.k);
    this.card.className = 'brief-card brief-step';
    const dots = BRIEF_STEPS.map((q, k) => `<li class="${k < this.step ? 'done' : k === this.step ? 'cur' : ''}"><span>${k + 1}</span><em>${esc(tr(q.t))}</em></li>`).join('');
    this.card.classList.toggle('full', !!this.full);
    this.card.innerHTML = `<button type="button" class="brief-grab" aria-expanded="${this.full ? 'true' : 'false'}" aria-label="Listeyi büyüt ya da sahneyi göster"><span></span></button><ol class="brief-dots" aria-label="Adımlar">${dots}</ol>
      <p class="brief-eye">${this.step + 1} / ${BRIEF_STEPS.length} · ${esc(tr(S.s))}</p>
      <h2 class="brief-h" tabindex="-1">${esc(tr(S.t))}</h2>
      <div class="brief-body"></div>
      <div class="brief-nav"><button type="button" class="ghost" data-act="back">${this.step === 0 ? 'Giriş' : 'Geri'}</button><button type="button" class="primary" data-act="next"></button></div>`;
    const body = this.card.querySelector('.brief-body'), next = this.card.querySelector('[data-act="next"]'), grab = this.card.querySelector('.brief-grab');
    grab.onclick = () => { this.full = !this.full; this.card.classList.toggle('full', this.full); grab.setAttribute('aria-expanded', String(this.full)); };      // telefon: tam ekran liste ↔ sahne
    this.card.querySelector('[data-act="back"]').onclick = () => (this.step === 0 ? this.intro(this.kind) : this.go(this.step - 1));
    next.textContent = this.step === 3 ? 'Görevi tasarla' : 'Devam';
    next.onclick = () => this.go(this.step + 1);
    if (S.k === 'profil' || S.k === 'roket') this.ensureLive();
    if (S.k === 'yer') this.stepSite(body);
    else if (S.k === 'tarih') this.stepDate(body);
    else if (S.k === 'profil') this.stepProfile(body);
    else if (S.k === 'roket') this.stepRocket(body, next);
    else this.stepBrief(body);
    if (keepScroll) body.scrollTop = keepScroll;
    if (prevStep !== this.step) this.focusTitle();                                   // aynı adım yeniden çizilince (canlı sonuç) odak yerinde kalır
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
    this.why(body, step);
  }
  // seçimin gerekçesi, sayılarla (brifingtext.js reasons)
  why(body, step) {
    const R = reasons(step, this.sel, { defs: this.h.defs(), stats: (k) => this.stats(k), cap: tliCapacity, lat: (k) => siteOf(k).latDeg }); if (!R.length) return;
    const fa = (x) => (x && typeof x === 'object' ? fmt(x.n, x.d) : tr(String(x)));
    const box = el('div', 'brief-why', `<b>Bu seçim</b><ul>${R.map((q) => `<li>${esc(tr(q.t, ...q.a.map(fa)))}</li>`).join('')}</ul>`);
    body.appendChild(box);
  }
  // seçenek listesi: items [{ v, t, s, meta, warn, disabled }]
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
  }

  stepSite(body) {
    const pick = (v) => { this.sel.site = v; this.go(this.step); };
    this.rec(body, 'yer', this.sel.site, pick);
    this.options(body, 'İniş yeri', Object.keys(LUNAR_SITES).filter((k) => SITE_NOTES[k]).map((k) => {
      const s = siteOf(k);
      return { v: k, t: `Apollo ${k.slice(1)} · ${SITE_NOTES[k].t}`, meta: `${fmt(Math.abs(s.latDeg), 1)}° ${ns(s.latDeg)} ${fmt(Math.abs(s.lonDeg), 1)}° ${ew(s.lonDeg)}`, s: SITE_NOTES[k].s };
    }), this.sel.site, pick);
    body.appendChild(el('p', 'brief-note', 'Ay burada her yer görünsün diye tam aydınlatılmış gösterilir. Ay\'daki işarete dokunarak da seçebilirsin. Görev gününde iniş yerinde Güneş alçakta olur.'));
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
    const pick = (v) => { this.sel.profile = v; this.go(this.step); };
    this.rec(body, 'profil', this.sel.profile, pick);
    const L = this.liveState;
    this.options(body, 'Yörünge profili', PROFILE_ORDER.map((k) => {
      const st = this.stats(k), N = PROFILE_NOTES[k], row = L && L.rows[k], real = row && row.path ? livePath(k, row.path) : null;
      const G = profileSvg(k, 132, 64, real);
      const svg = `<svg class="bo-svg${real ? ' real' : ''}" viewBox="0 0 132 64" aria-hidden="true"><circle cx="${G.E[0]}" cy="${G.E[1]}" r="3.2" class="e"/><circle cx="${G.M[0]}" cy="${G.M[1]}" r="2" class="m"/>${G.paths.map((q) => `<path d="${q.d}" class="${q.kind}"/>`).join('')}</svg>`;
      const state = !row || row.st === 'ok' || st ? '' : row.st === 'busy' ? 'hesaplanıyor…' : row.st === 'err' ? 'bu pencerede yakınsamadı: tasarım sonraki pencereyi dener' : 'sırada';
      const fuel = st && st.landNeed != null && row && row.st === 'ok' ? tr(' Yakıt: TLI {0}/{1} kg, iniş {2}/{3} kg (gereken/olan).', fmt(st.tliNeed, 0), fmt(st.tliHave, 0), fmt(st.landNeed, 0), fmt(st.landHave, 0)) : '';
      return { v: k, t: N.t, s: tr(N.s) + fuel, svg, meta: st ? `${fmt(st.days, 1)} gün · Δv ${fmt(st.dv, 0)} m/s` : tr(state), warn: row && row.st === 'err' };
    }), this.sel.profile, pick);
    body.appendChild(el('p', 'brief-note', 'LS19 her profili seçtiğin yer, tarih ve roketle gerçekten tasarlar (fırlatma penceresi, Ay\'a aktarma, iniş; roketin yakıtıyla): süre, Δv ve yakıt hesap bitince gelir, çizim gerçek yola döner. Halo profilleri 1–2 dakika sürer. Çizimler üstten, Ay\'la dönen çerçevede.'));
  }
  // ---------------------------------------------------------------- canlı tasarım (host.live → app.js briefDesign: önbellek ya da iş parçacığı)
  liveKey() { const s = this.sel; return [s.site, s.date, s.rocket].join('|'); }
  // profilin özeti: canlı tasarım; yoksa hazır tasarım (yalnız aynı yer, tarih ve genel kademe için geçerli)
  stats(k) {
    const row = this.liveState && this.liveState.rows[k];
    if (row && row.D) return statsOf(row.D);
    const s = this.sel, defs = this.h.defs();
    return defs && s.site === 'A11' && s.date === (defs.date || DEFAULT_BRIEF_DATE) && s.rocket === 'GENEL' ? profileStats(defs, k) : null;
  }
  ensureLive() {
    if (!this.h.live) return;
    const key = this.liveKey(); if (this.liveState && this.liveState.key === key) return;
    this.stopLive();
    const L = this.liveState = { key, rows: Object.fromEntries(PROFILE_ORDER.map((k) => [k, { st: 'wait' }])), stopped: false }, sel0 = { ...this.sel };
    const dead = () => L.stopped || this.liveState !== L;
    (async () => {
      for (;;) {
        const k = L.rows[this.sel.profile] && L.rows[this.sel.profile].st === 'wait' ? this.sel.profile : PROFILE_ORDER.find((q) => L.rows[q].st === 'wait');      // seçili profil önce
        if (!k || dead()) break;
        const row = L.rows[k]; row.st = 'busy'; this.liveUpdate(k);
        try {
          const r = await this.h.live({ ...sel0, profile: k }, k, (m) => { row.msg = m; }, dead);
          if (dead()) break;
          if (r) { row.st = 'ok'; row.D = r.D; row.path = r.path; } else { row.st = 'err'; }
        } catch (e) { if (dead()) break; row.st = 'err'; row.msg = String((e && e.message) || e); }
        this.liveUpdate(k);
      }
    })();
  }
  stopLive() { if (this.liveState) { this.liveState.stopped = true; this.liveState = null; if (this.h.liveStop) this.h.liveStop(); } }
  // bir profilin sonucu geldi: açık adım yeniden çizilir (kaydırma korunur); brifing seçili profili bekliyorsa tasarıma geçer
  liveUpdate(k) {
    if (!this.active) return;
    const st = BRIEF_STEPS[this.step] && BRIEF_STEPS[this.step].k;
    if (this.waitLive && k === this.sel.profile) { const row = this.liveState && this.liveState.rows[k]; if (row && row.st !== 'busy') { this.waitLive = false; this.startDesign(); } return; }
    if (st === 'profil' || (st === 'roket' && k === this.sel.profile)) this.go(this.step);
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
    const row = this.liveState && this.liveState.key === this.liveKey() && this.liveState.rows[this.sel.profile];
    if (row && row.st === 'busy') { this.waitLive = true; return; }                // seçili profil zaten hesaplanıyor: onu bekle (iki kez hesaplanmasın)
    this.startDesign();
  }
  startDesign() {
    const row = this.liveState && this.liveState.rows[this.sel.profile];
    if (!(row && row.st === 'ok')) this.stopLive();                               // hazır değilse arka plan hesabı durur (işlemci tasarıma kalsın)
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
    this.cam = { ...sc, k, az: sc.az ?? (prev && prev.mode === sc.mode ? prev.az : 0.6), el: sc.el ?? 0.3 };
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
      // yer ortada, hafif kuzeyden; Ay "stüdyo ışığıyla" aydınlatılır (görev tarihinde yer gecede olabilir: Ekim 2026'da yakın yüz hilal evresinde karanlık).
      // Işık yerin batısından ~35° yükseklikte: kabartma gölgeleri okunur. Yalnız bu adımlarda; world.update her karede gerçek Güneş'e döndürür
      const s = siteOf(this.sel.site || 'A11'), d = unit(s.icrf(x.t)), nz = [0, 0, 1], east = unit(E.cross(nz, d)), north = E.cross(d, east);
      const v = unit(E.add(d, E.scale(north, 0.25)));
      az = Math.atan2(v[1], v[0]); elv = Math.asin(Math.max(-1, Math.min(1, v[2])));
      if (W.moonU && W.moonU.sunDir) W.moonU.sunDir.value.set(...unit(E.add(E.add(E.scale(d, 0.75), E.scale(east, -0.62)), E.scale(north, 0.2))));
      // altı iniş yeri Ay'da işaretli; Nereye adımında işarete dokununca seçilir
      for (const k of Object.keys(SITE_NOTES)) {
        const on = k === (this.sel.site || 'A11'), q = siteOf(k), pick = c.k === 'yer' && !on ? () => { this.sel.site = k; this.go(this.step); } : null;
        if (!on && c.k !== 'yer') continue;
        this.placePin('s:' + k, E.add(rm, E.scale(q.icrf(x.t), 1.0006)), `Apollo ${k.slice(1)}`, rm, { on, pick, left: k === 'A12' }); show.add('s:' + k);      // Apollo 12 ve 14 yakın: 12'nin adı solda
      }
    } else if (c.sun) {                                                            // Dünya: Güneş tarafından, gece–gündüz sınırı kenarda; yavaşça döner
      const sv = unit(E.sunPos(x.t));
      az = Math.atan2(sv[1], sv[0]) + c.off + (c.spin || 0) * c.t; elv = Math.max(-0.6, Math.min(0.6, Math.asin(sv[2]))) + 0.18;
    } else c.az += (c.spin || 0) * dt;
    if (c.tags) { this.placePin('E', [0, 0, 0], 'Dünya'); this.placePin('M', rm, 'Ay'); show.add('E'); show.add('M'); }
    for (const k in this.pins) if (!show.has(k)) this.pins[k].hidden = true;
    this.drawPath(c.path ? this.sel.profile : null, x, rm);
    this.viewOffset(W);
    const cur = W.cam, k = 1 - Math.exp(-dt / 0.45), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (cur.mode !== c.mode) Object.assign(cur, { mode: c.mode, az, el: elv, dist: c.dist });
    else Object.assign(cur, { az: cur.az + wrap(az - cur.az) * k, el: cur.el + (elv - cur.el) * k, dist: Math.exp(Math.log(cur.dist) + (Math.log(c.dist) - Math.log(cur.dist)) * k) });
    cur.auto = false;
  }
  // görüntü kaydırma (THREE.PerspectiveCamera.setViewOffset): cisim kartın arkasında kalmasın. Masaüstünde sağa (kart solda), telefonda yukarı
  // (sayfa altta; tam ekran listede kaydırma yok). Girişte başlık solda/altta: Dünya sağa/yukarı. İşaretler aynı izdüşümle (project) yerinde kalır
  viewOffset(W, off = false) {
    const cam = W.camera, cv = W.canvas; if (!cam || !cv) return;
    const w = cv.clientWidth, h = cv.clientHeight, narrow = w <= 700, intro = this.root.classList.contains('is-intro');
    let ox = 0, oy = 0;
    if (!off) {
      if (narrow) oy = intro ? Math.round(h * 0.2) : this.full ? 0 : Math.round(h * 0.21);
      else ox = intro ? -Math.round(w * 0.16) : -Math.round(Math.min(260, ((this.card.offsetWidth || 432) + 14) / 2));
    }
    const k = [w, h, ox, oy].join(); if (k === this.vo) return; this.vo = k;
    if (!ox && !oy) cam.clearViewOffset(); else cam.setViewOffset(w, h, ox, oy, w, h);
    cam.updateProjectionMatrix();
  }
  hidePins() { for (const k in this.pins) this.pins[k].hidden = true; this.drawPath(null); }
  // şematik profil yolu 3B sahnede (Dünya–Ay dönen çerçevesi → ICRF; brifingtext.js profilePath). Kayan başlangıç noktası: grup Dünya'nın sahnedeki yerinde
  drawPath(key, x = null, rm = null) {
    const W = this.h.world;
    if (!key || !x) { if (this.path3d) { W.scene.remove(this.path3d.g); this.path3d.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.path3d = null; } return; }
    const row = this.liveState && this.liveState.rows[key], real = row && row.path ? livePath(key, row.path) : null, pk = key + (real ? '*' : '');
    if (!this.path3d || this.path3d.key !== pk || Math.abs(this.path3d.t - x.t) > 3600) {
      this.drawPath(null);
      const vm = E.moonVel(x.t), D = Math.hypot(...rm), xx = unit(rm), zz = unit(E.cross(rm, vm)), yy = E.cross(zz, xx);
      const g = new THREE.Group(), COL = { park: 0x8591a3, raise: 0x8591a3, moon: 0xd9dee8, transfer: 0x5ee7ff, halo: 0xf5b93a };
      for (const part of real || profilePath(key)) {
        const pos = new Float32Array(part.pts.length * 3);
        part.pts.forEach((q, i) => { for (let k = 0; k < 3; k++) pos[i * 3 + k] = (q[0] * xx[k] + q[1] * yy[k] + q[2] * zz[k]) * D; });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COL[part.kind] || 0xffffff, transparent: true, opacity: part.kind === 'transfer' || part.kind === 'halo' ? 0.95 : 0.6, depthWrite: false, toneMapped: false }));
        ln.frustumCulled = false; g.add(ln);
      }
      g.renderOrder = 3; W.scene.add(g); this.path3d = { key: pk, t: x.t, g };
    }
    const eye = W.eye; if (eye) this.path3d.g.position.set(-eye[0], -eye[1], -eye[2]);
  }
  // ekran işareti: p (km, Dünya merkezli); cen verilirse p bir yüzey noktasıdır ve cismin arka yüzündeyse gizlenir
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
