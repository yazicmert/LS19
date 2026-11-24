// Görev brifingi (Laboratuvar › Ay görevi'nin girişi): LS19 önce görevi tasarlatır, sonra görev rampadan ya da yörüngeden başlar.
// Akış: giriş kartı → 1 Nereye (iniş yeri) → 2 Ne zaman (tarih) → 3 Nasıl (profil) → 4 Neyle (roket, araç, güdüm) → 5 Brifing (tasarım ve özet).
// Brifing açıkken araç, uçuş göstergeleri ve deney paneli gizlidir; arkadaki 3B sahne adıma göre değişir (Dünya–Ay sistemi, seçilen iniş yeri, Dünya).
// Saf mantık brifingtext.js'te; tasarım, roket ve kalkış app.js'in kendi işlevleridir (host): fizik ve tasarım koduna dokunulmaz.
// Kart, adımlar, öneri/gerekçe kutuları, işaretler, kamera ve görüntü kaydırma Laboratuvar'ın ortak brifing kabuğundadır (brifkabuk.js).
import * as THREE from 'three';
import * as E from './engine.js';
import { BriefShell, el, esc, unit } from './brifkabuk.js';
import { VEH_STEPS, VEH_SITES, DEFAULT_LANDER, vehicleFacts, rankSites, siteScore, siteErr, marginsDiffer, BRIEF_STEPS, SITE_NOTES, PROFILE_NOTES, PROFILE_ORDER, datePresets, profileStats, rocketFit, designEta, recommend, briefSummary, profilePath, profileSvg, reasons, statsOf, livePath, briefTimeline, tPlus, DEFAULT_BRIEF_DATE } from './brifingtext.js';
import { LUNAR_SITES, siteOf } from './moonsite.js';
import { ROCKETS, ROCKET_IDS, tliCapacity, rocketOf, CUSTOM_ID, CUSTOM_LIMITS, validCustom, setCustomRocket } from './rockets.js';
import { validLander, LANDER_LIMITS } from './design.js';
import { DV_NAMES } from './dvbudget.js';
import { fmt } from './format.js';
import { ns, ew, t as tr, UNIT } from './i18n.js';

const SEEN = 'ls19.brifing';
const utc = (t) => E.utcString(t).slice(0, 16).replace('T', ' ') + ' UTC';
const todayStr = () => new Date().toISOString().slice(0, 10);

// sahne: adım → kamera (kip, uzaklık, yükseklik açısı, dönme hızı rad/s)
// sun: Güneş tarafından bakış (gündüz yüzü, gece–gündüz sınırı kenarda), off: Güneş yönünden sapma (rad), orbit: Ay'ın yörüngesi görünür, tags: cisim adları
const SCENES = {
  intro: { mode: 'EARTH', dist: 15500, sun: true, off: 0.75, spin: 0.025 },
  yer: { mode: 'MOON', dist: 6200, site: true },
  tarih: { mode: 'MOON', dist: 9000, site: true },
  profil: { mode: 'SYSTEM', dist: 820000, el: 1.15, az: -Math.PI / 2, orbit: true, tags: true, path: true },        // üstten; Dünya ortada, Ay sağda
  roket: { mode: 'EARTH', dist: 15000, pad: true },                                   // seçilen roketin fırlatma rampası ortada
  brifing: { mode: 'SYSTEM', dist: 820000, el: 1.05, az: -Math.PI / 2, orbit: true, tags: true, path: true },
  arac: { mode: 'EARTH', dist: 15000, pad: true },                                     // "Kendi aracımla": rampa (kendi roketin genel kademe gibi her rampadan)
  ara: { mode: 'MOON', dist: 7200, site: true },                                      // altı yer işaretli, sonuçlarıyla
};
// "Kendi aracımla" giriş alanları (etiket, birim, alan): roketin üst kademesi ve iniş aracı
const ROCKET_FIELDS = [['dry', 'Kuru kütle', 'kg'], ['tank', 'Yakıt kapasitesi', 'kg'], ['T', 'İtki (vakum)', 'kN'], ['isp', 'Isp (vakum)', 's'], ['P', 'Ay\'a yük kapasitesi (TLI)', 'kg']];
const LANDER_FIELDS = [['dry', 'Kuru kütle', 'kg'], ['tank', 'Yakıt kapasitesi', 'kg'], ['T', 'İtki', 'kN'], ['isp', 'Isp', 's']];
// başlangıç değerleri: gerçek roketlerin üst kademesi ve türetilmiş Ay'a yük kapasitesi (rockets.js tliCapacity)
const ROCKET_STARTS = ROCKET_IDS.filter((id) => tliCapacity(id) > 0).map((id) => { const r = ROCKETS[id], st = r.stage; return { id, t: r.name, spec: { dry: st.dry, tank: st.tank, T: st.T, isp: st.isp, P: Math.round(tliCapacity(id)) } }; });
// brifingde gizlenen sahne çizgileri (araç izi, yörüngeler, eksenler, meridyenler, işaretler)
const HIDE = ['trailLineE', 'trailLineM', 'osc', 'stageOsc', 'haloPath', 'moonPath', 'siteMarker', 'embEarth', 'embMoon', 'embMarker', 'earthAxis', 'moonAxis', 'earthMer', 'moonMer'];

export class Briefing extends BriefShell {
  // host: { world, ui, latest(), defs(), design(sel) → Promise<void> (tasarımı başlatır), launch(how), current() → seçimlerin şimdiki hâli, preload(roket), live(…), padOf(roket), onClose() }
  constructor(host) {
    super(host, { id: 'ay', domId: 'brief', label: 'Görev brifingi', seen: SEEN, steps: BRIEF_STEPS, scenes: SCENES, hide: HIDE, hideVehicle: true });
    this.result = null;
  }
  static seen() { try { return localStorage.getItem(SEEN) === '1'; } catch (e) { return false; } }

  // ---------------------------------------------------------------- açılış ve kapanış
  onOpen() {
    this.result = null;
    this.sel = { ...this.h.current() };
    if (!PROFILE_ORDER.includes(this.sel.profile)) this.sel.profile = 'APOLLO';
  }
  onClosing() { this.stopLive(); this.stopSearch(); this.waitLive = false; }

  // ---------------------------------------------------------------- giriş kartı
  introCard(kind) {
    const ret = kind === 'return';
    return {
      eye: 'LS19 · Görev kontrol',
      h: ret ? 'Yeni bir göreve hazır mısın?' : 'Ay\'a bir görev tasarlayalım.',
      lead: ret ? 'Kaldığın görev seni bekliyor. İstersen yeni bir iniş yeri, tarih ve roketle baştan tasarla.'
        : 'Nereye ineceğini, ne zaman fırlatacağını, hangi yoldan ve hangi roketle gideceğini sen seç. LS19 her adımda önerisini ve gerekçesini söyler; gerçek fizikle görevi hesaplar, sonra rampadan fırlatırsın.',
      acts: [{ act: 'start', t: ret ? 'Yeni görev tasarla' : 'Tasarlamaya başla', cls: 'primary' }, { act: 'vehicle', t: 'Kendi aracımla' }, { act: ret ? 'resume' : 'watch', t: ret ? 'Kaldığım yerden devam' : 'Hazır görevi izle' }],
      fine: ret ? '' : 'Hazır görev: 13 Ekim 2026, Apollo 11 yerine iniş, fragman olarak.',
    };
  }
  onAct(act) {
    if (act === 'vehicle') { this.startVehicle(); return; }
    const w = act === 'watch'; this.close(w ? 'cine' : null); if (w) this.h.launch('cine');
  }
  intro(kind) { this.steps = BRIEF_STEPS; this.flow = 'design'; this.stopSearch(); super.intro(kind); }       // giriş: adım adım tasarım yolu (varsayılan)

  // ---------------------------------------------------------------- adımlar
  nextLabel(k) { return k === 'roket' || k === 'ara' ? 'Görevi tasarla' : k === 'arac' ? 'Yolu ve yeri hesapla' : 'Devam'; }
  renderStep(k, body, next) {
    if (k === 'arac') { this.stepVehicleSpec(body, next); return; }
    if (k === 'ara') { this.stepSearch(body, next); return; }
    if (k === 'profil' || k === 'roket') this.ensureLive();
    if (k === 'yer') this.stepSite(body);
    else if (k === 'tarih') this.stepDate(body);
    else if (k === 'profil') this.stepProfile(body);
    else if (k === 'roket') this.stepRocket(body, next);
    else this.stepBrief(body);
  }
  // LS19 önerisi ve seçimin sayılarla gerekçesi (brifingtext.js recommend, reasons)
  recommendFor(step) {
    if (step === 'ara') {
      const R = this.search && this.search.rows, best = R && rankSites(R)[0]; if (!best) return null;
      const D = R[best].D, name = `Apollo ${best.slice(1)} · ${SITE_NOTES[best].t}`, sun = { n: D.sunElAtLanding ?? 0, d: 1 };
      return marginsDiffer(R) ? { v: best, why: '{0}: bu araçla en geniş yakıt payı ({1}); inişte Güneş {2}°.', a: [name, tr('{0} kg', fmt(D.STAGES[1].prop - D.LANDER_NEED, 0)), sun] }
        : { v: best, why: '{0}. Yakıt her yerde aynı ölçüde yetiyor: Ay yörüngesinin düzlemi iniş yerine göre seçilir, Ay yörüngesine giriş her yerde aynıdır. Fark ışıkta: burada inişte Güneş {1}°, alçak Güneş\'in uzun gölgeleri araziyi en iyi gösterir.', a: [name, sun] };
    }
    if (step === 'arac') return null;
    return recommend(step, this.sel, todayStr());
  }
  reasonsFor(step) { if (step === 'arac' || step === 'ara') return this.vehReasons(step); return reasons(step, this.sel, { defs: this.h.defs(), stats: (k) => this.stats(k), cap: tliCapacity, lat: (k) => siteOf(k).latDeg }); }

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
      const state = !row || row.st === 'ok' || st ? '' : row.st === 'busy' ? 'hesaplanıyor…' : row.st === 'err' ? 'yakınsamadı' : 'sırada';
      const fuel = st && st.landNeed != null && row && row.st === 'ok' ? tr(' Yakıt: TLI {0}/{1} kg, iniş {2}/{3} kg (gereken/olan).', fmt(st.tliNeed, 0), fmt(st.tliHave, 0), fmt(st.landNeed, 0), fmt(st.landHave, 0)) : '';
      const errNote = row && row.st === 'err' && !st ? ' ' + tr('Bu pencerede yakınsamadı: Görevi tasarla bir sonraki pencereyi dener.') : '';
      return { v: k, t: N.t, s: tr(N.s) + fuel + errNote, svg, meta: st ? `${fmt(st.days, 1)} gün · Δv ${fmt(st.dv, 0)} m/s` : tr(state), warn: row && row.st === 'err' };
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
    const key = this.liveKey();
    if (this.liveState && this.liveState.key === key) { if (!this.liveState.running) this.runLive(this.liveState); return; }      // aynı seçim: durmuş döngü (adım değişti) yeniden
    this.stopLive();
    const L = this.liveState = { key, rows: Object.fromEntries(PROFILE_ORDER.map((k) => [k, { st: 'wait' }])), stopped: false, sel0: { ...this.sel } };
    this.runLive(L);
  }
  runLive(L) {
    const dead = () => L.stopped || this.liveState !== L, sel0 = L.sel0;
    L.running = true;
    (async () => {
      for (;;) {
        // seçili profil önce; ötekiler yalnız profil adımındayken (roket ve brifing adımlarında yalnız seçili gerekir: işlemci boşuna meşgul olmasın)
        const onProfile = this.stepKey() === 'profil';
        const k = L.rows[this.sel.profile] && L.rows[this.sel.profile].st === 'wait' ? this.sel.profile : onProfile ? PROFILE_ORDER.find((q) => L.rows[q].st === 'wait') : null;
        if (!k || dead()) break;
        const row = L.rows[k]; row.st = 'busy'; this.liveUpdate(k);
        try {
          const r = await this.h.live({ ...sel0, profile: k }, k, (m) => { row.msg = m; }, dead);
          if (dead()) break;
          if (r) { row.st = 'ok'; row.D = r.D; row.path = r.path; } else { row.st = 'err'; }
        } catch (e) { if (dead()) break; row.st = 'err'; row.msg = String((e && e.message) || e); }
        this.liveUpdate(k);
      }
      L.running = false;
    })();
  }
  stopLive() { if (this.liveState) { this.liveState.stopped = true; this.liveState = null; if (this.h.liveStop) this.h.liveStop(); } }
  // bir profilin sonucu geldi: açık adım yeniden çizilir (kaydırma korunur); brifing seçili profili bekliyorsa tasarıma geçer
  liveUpdate(k) {
    if (!this.active) return;
    const st = this.stepKey();
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
    const mk = (name, key, items) => this.seg(adv, name, this.sel[key], items, (v) => { this.sel[key] = v; adv.open = true; this.go(this.step); });
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
    this.waitBox(body, 'LS19 görevini hesaplıyor: fırlatma penceresi, park yörüngesi, Ay\'a aktarma, Ay yörüngesi ve iniş.', tr('Tasarım süresi: {0}.', tr(designEta(this.sel).t)));
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
    if (this.stepKey() === 'brifing') this.go(this.step);
  }
  onFail(msg) {
    if (!this.active || !this.waiting) return;
    this.waiting = false;
    const body = this.card.querySelector('.brief-body'); if (!body) return;
    this.failBox(body, tr('Bu seçimlerle görev tasarlanamadı: {0}', msg), 'Başka bir tarih, profil ya da daha güçlü bir roket dene.');
  }
  renderSummary(body) {
    const D = this.result.D, sm = briefSummary(D, utc), s = siteOf(this.sel.site), R = rocketOf(this.sel.rocket);
    const rows = [['İniş yeri', `Apollo ${this.sel.site.slice(1)} · ${SITE_NOTES[this.sel.site].t}`], ['Fırlatma', sm.launch], ['İniş', sm.landing || '—'],
      ['Süre', sm.days != null ? tr('{0} gün', fmt(sm.days, 1)) : '—'], ['Profil', PROFILE_NOTES[this.sel.profile].t], ['Roket', R ? R.name : '—'],
      ['İnişte Güneş', sm.sunEl != null ? `${fmt(sm.sunEl, 1)}°` : '—']];
    if (this.flow === 'vehicle' && D.LANDER_NEED != null && D.STAGES[1]) rows.push(['İniş yakıtı', tr('{0} / {1} kg (gereken / tank)', fmt(D.LANDER_NEED, 0), fmt(D.STAGES[1].prop, 0))], ['TLI yakıtı', tr('{0} / {1} kg', fmt(D.TLI_NEED, 0), fmt(D.STAGES[0].prop, 0))]);
    const dv = sm.dv.map(([k, v]) => `<tr><td>${esc(tr(DV_NAMES[k] || k))}</td><td>${fmt(v, 0)} m/s</td></tr>`).join('');
    body.innerHTML = `<p class="brief-lead">${esc(tr('Görev hazır. {0} yerine iniş, {1} gün sürecek.', s.name, fmt(sm.days, 1)))}</p>
      <dl class="brief-sum">${rows.map(([k, v]) => `<div><dt>${esc(tr(k))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <ol class="brief-tl" aria-label="${esc(tr('Görev çizelgesi'))}">${briefTimeline(D).map((r) => { const p = tPlus(r.dt); return `<li><span>T+${p.d}${UNIT.d} ${String(p.h).padStart(2, '0')}${UNIT.h} ${String(p.m).padStart(2, '0')}${UNIT.min}</span><b>${esc(tr(r.k))}</b><em>${esc(utc(r.t))}</em></li>`; }).join('')}</ol>
      <details class="brief-adv"><summary>${esc(tr('Δv bütçesi: toplam {0} m/s', fmt(sm.total, 0)))}</summary><table class="brief-dv">${dv}</table></details>`;
    // başlatma düğmeleri (data-go="pad" · "orbit" · "cine") kaydırılan alanın dışında (telefonda da hep görünür)
    this.goButtons([{ go: 'pad', t: 'Rampadan fırlat' }, { go: 'orbit', t: 'Yörüngeden başla' }, { go: 'cine', t: 'Fragman olarak izle' }], 'Seçimleri değiştir',
      (how) => { this.close(how); this.h.launch(how); });
  }

  // ---------------------------------------------------------------- "Kendi aracımla": roket ve iniş aracı sayılarla, LS19 yolu ve yeri hesaplar
  startVehicle() {
    this.flow = 'vehicle'; this.steps = VEH_STEPS;
    const cur = this.h.current();
    this.veh = { ozel: validCustom(cur.ozel) || { ...ROCKET_STARTS.find((r) => r.id === 'SLS1').spec }, lander: validLander(cur.lander) || { ...DEFAULT_LANDER }, start: 'SLS1' };
    Object.assign(this.sel, { profile: 'APOLLO', vehicle: 'one', date: todayStr(), rocket: CUSTOM_ID });
    setCustomRocket(this.veh.ozel);                                                            // rampa işareti ve kalkış ön yüklemesi kendi roketinle          // tek kademe: girilen itki ve Isp inişte de geçerli (iki kademe modunda iniş kademesi sabit)
    this.search = null; this.go(0);
  }
  vehOk() { return !!(validCustom(this.veh.ozel) && validLander(this.veh.lander)); }
  stepVehicleSpec(body, next) {
    const V = this.veh, f = this.vehOk() ? vehicleFacts(V.ozel, V.lander, this.h.defs()) : null;
    body.appendChild(el('p', 'brief-lead', esc(tr('Roketinin Ay\'a giden üst kademesini ve iniş aracını sayılarla ver. LS19 altı iniş yeri için yolu bu araçla gerçekten hesaplar; yakıt payına ve inişteki ışığa göre en uygun yeri önerir.'))));
    this.why(body, 'arac');                                                                // LS19'un anında denetimi formun üstünde (sayılar değişince yenilenir)
    // başlangıç değerleri: gerçek bir roketten (alanlar onunla dolar, sonra değiştirilebilir)
    const pre = el('label', 'brief-date', `<span>${esc(tr('Başlangıç değerleri'))}</span><select>${ROCKET_STARTS.map((r) => `<option value="${r.id}"${r.id === V.start ? ' selected' : ''}>${esc(r.t)}</option>`).join('')}</select>`);
    pre.querySelector('select').onchange = (e) => { const r = ROCKET_STARTS.find((q) => q.id === e.target.value); if (r) { V.start = r.id; V.ozel = { ...r.spec }; this.stopSearch(); setCustomRocket(V.ozel); this.go(this.step); } };
    body.appendChild(pre);
    const form = (title, obj, fields, lim) => {
      const box = el('fieldset', 'brief-form'); box.appendChild(el('legend', null, esc(tr(title))));
      for (const [k, lab, unit] of fields) {
        const [a, b] = lim[k], row = el('label', 'brief-field', `<span>${esc(tr(lab))}</span><input type="number" inputmode="decimal" min="${a}" max="${b}" step="any" value="${obj[k]}"><em>${unit}</em>`);
        const inp = row.querySelector('input');
        inp.onchange = () => { const v = +inp.value; inp.classList.toggle('bad', !(v >= a && v <= b)); if (v >= a && v <= b) { obj[k] = v; this.stopSearch(); if (obj === V.ozel) setCustomRocket(V.ozel); this.go(this.step); } };
        box.appendChild(row);
      }
      body.appendChild(box);
    };
    form('Roketin üst kademesi', V.ozel, ROCKET_FIELDS, CUSTOM_LIMITS);
    form('İniş aracı', V.lander, LANDER_FIELDS, LANDER_LIMITS);
    body.appendChild(el('p', 'brief-note', esc(tr('Ay\'a yük kapasitesi: roketin yayımlanmış TLI (C3 ≈ −2 km²/s²) yükü; üst kademenin park yörüngesindeki yakıtı bundan türetilir. Araç tek kademe uçar: girdiğin itki ve Isp inişte de kullanılır. Tank doludur.'))));
    next.disabled = !f;
    if (f && (!f.fits || !f.dvOk)) next.textContent = tr('Yine de hesapla');
  }
  vehReasons(step) {
    if (step === 'arac') {
      if (!this.vehOk()) return [];
      const f = vehicleFacts(this.veh.ozel, this.veh.lander, this.h.defs()), out = [];
      out.push(f.fits ? { t: 'Dolu iniş aracı {0} kg; roket Ay\'a {1} kg taşır: sığar.', a: [{ n: f.wet, d: 0 }, { n: f.cap, d: 0 }] } : { t: 'Dolu iniş aracı {0} kg; roket Ay\'a en çok {1} kg taşır: yetmeyebilir.', a: [{ n: f.wet, d: 0 }, { n: f.cap, d: 0 }] });
      if (f.needDv) out.push(f.dvOk ? { t: 'İniş aracı dolu tankla {0} m/s verir; Apollo profilinde Ay yörüngesi ve iniş için ~{1} m/s gerekir.', a: [{ n: f.haveDv, d: 0 }, { n: f.needDv, d: 0 }] } : { t: 'İniş aracı dolu tankla {0} m/s verir; Apollo profilinde ~{1} m/s gerekir: yakıt yetmeyebilir.', a: [{ n: f.haveDv, d: 0 }, { n: f.needDv, d: 0 }] });
      out.push(f.twrOk ? { t: 'Ay\'da itki/ağırlık {0} (dolu tankla): iniş için yeterli.', a: [{ n: f.twr, d: 1 }] } : { t: 'Ay\'da itki/ağırlık {0} (dolu tankla): düşük, iniş güdümü zorlanır.', a: [{ n: f.twr, d: 1 }] });
      return out;
    }
    const k = this.sel.site, row = this.search && this.search.rows[k]; if (!row || row.st !== 'ok') return [];
    const D = row.D;
    return [{ t: 'İniş yakıtı: gereken {0} kg, tankta {1} kg.', a: [{ n: D.LANDER_NEED, d: 0 }, { n: D.STAGES[1].prop, d: 0 }] }, { t: 'TLI yakıtı: gereken {0} kg, kademede {1} kg.', a: [{ n: D.TLI_NEED, d: 0 }, { n: D.STAGES[0].prop, d: 0 }] },
      ...(D.sunElAtLanding != null ? [{ t: 'İnişte Güneş {0}° yükseklikte.', a: [{ n: D.sunElAtLanding, d: 1 }] }] : [])];
  }
  // 2: altı iniş yeri bu araçla (Apollo profili, bugünden sonraki ilk pencere) sırayla tasarlanır; sonuç geldikçe kart ve Ay'daki işaretler yenilenir
  stepSearch(body, next) {
    this.ensureSearch();
    const S = this.search, rank = rankSites(S.rows), done = VEH_SITES.every((k) => S.rows[k].st === 'ok' || S.rows[k].st === 'err');
    if (rank.length && !(S.picked && S.rows[this.sel.site] && S.rows[this.sel.site].st === 'ok')) this.sel.site = rank[0];      // kullanıcı seçmediyse en iyisi (sonuç geldikçe)
    const pick = (v) => { S.picked = true; this.sel.site = v; this.go(this.step); };
    if (rank.length) this.rec(body, 'ara', this.sel.site, pick);
    else body.appendChild(el('p', 'brief-lead', esc(tr(done ? 'Bu araçla altı yerden hiçbirine görev kurulamadı. Aracını değiştir: neden her satırda yazıyor.' : 'LS19 her iniş yeri için yolu bu araçla hesaplıyor: fırlatma penceresi, Ay\'a aktarma, Ay yörüngesi ve iniş.'))));
    this.options(body, 'İniş yeri', VEH_SITES.map((k) => {
      const r = S.rows[k], st = r.st, s = siteOf(k);
      const meta = st === 'ok' ? this.marginText(k) : st === 'busy' ? tr('hesaplanıyor…') : st === 'wait' ? tr('sırada') : tr(siteErr(r.err).t, ...siteErr(r.err).a);
      return { v: k, t: `Apollo ${k.slice(1)} · ${SITE_NOTES[k].t}`, meta, s: `${fmt(Math.abs(s.latDeg), 1)}° ${ns(s.latDeg)} ${fmt(Math.abs(s.lonDeg), 1)}° ${ew(s.lonDeg)}`, disabled: st !== 'ok', warn: st === 'err' };
    }), this.sel.site, pick);
    body.appendChild(el('p', 'brief-note', esc(tr('Profil: Apollo, hızlı (en az Δv). Tarih: bugünden sonraki ilk uygun pencere. Sıra: önce yakıt payı, sonra inişte Güneş\'in 10°\'ye yakınlığı (uzun gölgeler), sonra erken iniş. Bir yer için hesap 10–30 sn sürer.'))));
    next.disabled = !(S.rows[this.sel.site] && S.rows[this.sel.site].st === 'ok');
  }
  marginText(k) {
    const r = this.search && this.search.rows[k]; if (!r || r.st !== 'ok') return '';
    const D = r.D, land = D.STAGES[1].prop - D.LANDER_NEED;
    return tr('pay {0} kg · Güneş {1}°', fmt(land, 0), fmt(D.sunElAtLanding ?? 0, 0));
  }
  pinNote(k) { const r = this.search.rows[k]; return r.st === 'ok' ? tr('Güneş {0}°', fmt(r.D.sunElAtLanding ?? 0, 0)) : r.st === 'err' ? tr('olmaz') : '…'; }      // Ay'daki işaret: kısa (komşu adlar çakışmasın)
  ensureSearch() {
    const key = JSON.stringify([this.veh.ozel, this.veh.lander, this.sel.date]);
    if (this.search && this.search.key === key) { if (!this.search.running) this.runSearch(this.search); return; }
    this.stopSearch();
    setCustomRocket(this.veh.ozel);
    Object.assign(this.sel, { rocket: CUSTOM_ID, ozel: { ...this.veh.ozel }, lander: { ...this.veh.lander } });
    const S = this.search = { key, rows: Object.fromEntries(VEH_SITES.map((k) => [k, { st: 'wait' }])), stopped: false };
    this.runSearch(S);
  }
  runSearch(S) {
    const dead = () => S.stopped || this.search !== S;
    S.running = true;
    (async () => {
      for (const k of VEH_SITES) {
        const row = S.rows[k]; if (row.st !== 'wait') continue;
        if (dead()) break;
        row.st = 'busy'; this.searchUpdate();
        try {
          const r = await this.h.live({ ...this.sel, site: k }, 'APOLLO', () => {}, dead);
          if (dead()) break;
          if (r) { row.st = 'ok'; row.D = r.D; row.score = siteScore(row); } else { row.st = 'err'; row.err = ''; }
        } catch (e) { if (dead()) break; row.st = 'err'; row.err = String((e && e.message) || e); }
        this.searchUpdate();
      }
      S.running = false;
    })();
  }
  stopSearch() { if (this.search) { this.search.stopped = true; this.search = null; if (this.h.liveStop) this.h.liveStop(); } }
  searchUpdate() { if (this.active && this.stepKey() === 'ara') this.go(this.step); }

  // ---------------------------------------------------------------- 3B sahne (kabuk her karede çağırır)
  keepVisible(k, c) { return !!c.orbit && k === 'embMoon'; }                      // Dünya–Ay adımlarında Ay'ın yörüngesi görünür
  aim(c, x, show) {
    const W = this.h.world, rm = E.moonPos(x.t);
    let a = null;
    if (c.site) {                                                                  // iniş yerine bakış: yer ile Güneş yönü arasından (yer görünür, yüz aydınlık kalsın)
      // yer ortada, hafif kuzeyden; Ay "stüdyo ışığıyla" aydınlatılır (görev tarihinde yer gecede olabilir: Ekim 2026'da yakın yüz hilal evresinde karanlık).
      // Işık yerin batısından ~35° yükseklikte: kabartma gölgeleri okunur. Yalnız bu adımlarda; world.update her karede gerçek Güneş'e döndürür
      const s = siteOf(this.sel.site || 'A11'), d = unit(s.icrf(x.t)), nz = [0, 0, 1], east = unit(E.cross(nz, d)), north = E.cross(d, east);
      const v = unit(E.add(d, E.scale(north, 0.25)));
      a = { az: Math.atan2(v[1], v[0]), el: Math.asin(Math.max(-1, Math.min(1, v[2]))) };
      if (W.moonU && W.moonU.sunDir) W.moonU.sunDir.value.set(...unit(E.add(E.add(E.scale(d, 0.75), E.scale(east, -0.62)), E.scale(north, 0.2))));
      // altı iniş yeri Ay'da işaretli; Nereye adımında işarete dokununca seçilir
      for (const k of Object.keys(SITE_NOTES)) {
        const all = c.k === 'yer' || c.k === 'ara', ok = c.k !== 'ara' || (this.search && this.search.rows[k].st === 'ok');
        const on = k === (this.sel.site || 'A11'), q = siteOf(k), pick = all && !on && ok ? () => { if (this.search && c.k === 'ara') this.search.picked = true; this.sel.site = k; this.go(this.step); } : null;
        if (!on && !all) continue;
        const lbl = c.k === 'ara' && this.search ? `Apollo ${k.slice(1)} · ${this.pinNote(k)}` : `Apollo ${k.slice(1)}`;
        this.placePin('s:' + k, E.add(rm, E.scale(q.icrf(x.t), 1.0006)), lbl, rm, { on, pick, left: k === 'A12' || k === 'A15' }); show.add('s:' + k);      // komşu yerler (12 ↔ 14, 15 ↔ 17): batıdakinin adı solda
      }
    } else if (c.pad && this.h.padOf) {                                           // rampa: Dünya üzerinde ortada, hafif güneyden; Dünya görünüm için aydınlatılır (rampa gecede olabilir)
      const P = this.h.padOf(this.sel.rocket), la = P.lat * Math.PI / 180, lo = P.lon * Math.PI / 180;
      const d = unit(E.mtv(E.earthIcrfToItrf(x.t), [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]));
      const east = unit(E.cross([0, 0, 1], d)), north = E.cross(d, east), v = unit(E.add(d, E.scale(north, -0.12)));
      a = { az: Math.atan2(v[1], v[0]), el: Math.asin(Math.max(-1, Math.min(1, v[2]))) };
      if (W.earthU && W.earthU.sunDir) W.earthU.sunDir.value.set(...unit(E.add(E.add(E.scale(d, 0.8), E.scale(east, 0.5)), E.scale(north, 0.3))));
      this.placePin('pad', E.scale(d, E.R_E * 1.001), P.name, [0, 0, 0]); show.add('pad');
    } else if (c.sun) {                                                            // Dünya: Güneş tarafından, gece–gündüz sınırı kenarda; yavaşça döner
      const sv = unit(E.sunPos(x.t));
      a = { az: Math.atan2(sv[1], sv[0]) + c.off + (c.spin || 0) * c.t, el: Math.max(-0.6, Math.min(0.6, Math.asin(sv[2]))) + 0.18 };
    }
    if (c.tags) { this.placePin('E', [0, 0, 0], 'Dünya'); this.placePin('M', rm, 'Ay'); show.add('E'); show.add('M'); }
    this.rm = rm;
    return a;
  }
  frameExtra(c, x) { this.drawPath(c.path ? this.sel.profile : null, x, this.rm); }
  clearScene() { this.drawPath(null); }
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
}
