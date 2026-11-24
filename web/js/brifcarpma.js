// Çarpma riski brifingi (Laboratuvar › Çarpma riski'nin girişi): LS19 en yakın tehlikeyi seçer ve sayılarla anlatır.
// Akış: giriş → 1 Ne düşebilir? (uydular ya da asteroitler) → 2 Hangisi? → 3 Brifing. Hesap deneyin kendi motorunda (ImpactUI: yörünge bozunması
// ve JPL Sentry); brifing kapanınca panel aynı cismi gösterir. Saf mantık brifcarpmatext.js'te; kart, işaretler ve kamera ortak kabukta (brifkabuk.js).
// Sahne (gökyüzü motoru, gerçek an): uydular → Dünya ve seçilen cisim (yakından); asteroitler → Güneş sistemi, seçilen asteroit işaretli.
import { BriefShell, el, esc } from './brifkabuk.js';
import { CP_STEPS, CP_TYPES, CP_ORDER, recommendCp, reasonsCp, recommendSat, recommendAst, impactMt, mtText } from './brifcarpmatext.js';
import { fmtReentry, fmtOdds, fmtSpan, fmtDate, controlNote, ageYears, CONF_TR } from './impact.js';
import { fmt } from './format.js';
import { t as tr } from './i18n.js';

const SEEN = 'ls19.brifing.carpma';
const SCENES = {
  intro: { mode: 'EARTH', dist: 42000, el: 0.35, az: 0.6, spin: 0.03 },
  tur: { mode: 'EARTH', dist: 36000, el: 0.4, az: 0.6, spin: 0.02, type: true },
  cisim: { mode: 'EARTH', dist: 36000, el: 0.4, obj: true },
  brifing: { mode: 'EARTH', dist: 36000, el: 0.4, obj: true },
};

export class ImpactBrief extends BriefShell {
  // host: { world, latest() → { t }, root, iu (ImpactUI), asts, astui, satPos(id, t), follow(id), onClose }
  constructor(host) { super(host, { id: 'carpma', label: 'Çarpma riski brifingi', seen: SEEN, steps: CP_STEPS, scenes: SCENES, hide: [] }); }
  get iu() { return this.h.iu; }
  onOpen() {
    this.sel = { type: this.iu.mode === 'ast' ? 'ast' : 'sat', id: null };
    this.iu.hook = (type, d) => { if (!this.active) return; if (type === 'progress') { this.prog = d; const w = this.card.querySelector('.brief-wait span:last-child'); if (w) w.textContent = tr('Yörünge bozunması hesaplanıyor… %{0}', Math.round(100 * d)); } else if (type === 'sats') this.redraw(); };
  }
  onClosing() { if (this.iu.hook) this.iu.hook = null; }
  label(des) { const A = this.h.asts, i = A.index ? A.index.get(des) : null; return i != null ? A.label(i) : des; }
  ctx() { return { sats: this.iu.topSats(6), asts: this.iu.topAsts(6), label: (d) => this.label(d), now: Date.now() }; }

  introCard(kind) {
    const ret = kind === 'return';
    return {
      eye: 'LS19 · Gezegen savunması',
      h: ret ? 'Gökyüzünden ne düşüyor?' : 'Gökyüzünden ne düşebilir?',
      lead: ret ? 'Liste panelde duruyor. İstersen LS19 en yakın yeniden girişi ya da en olası çarpıcıyı yeniden seçsin.'
        : 'Eskiyen uydular ve roket gövdeleri atmosfere girer; bazı asteroitlerin de çok küçük bir çarpma olasılığı var. LS19 en yakın tehlikeyi seçer, ne zaman ve ne kadar olası olduğunu sayılarla söyler.',
      acts: [{ act: 'start', t: ret ? 'LS19 seçsin' : 'Başla', cls: 'primary' }, { act: 'panel', t: ret ? 'Kaldığım yerden devam' : 'Listeyi kendim tarayayım' }],
      fine: ret ? '' : 'Kaynaklar: CelesTrak GP kayıtları ve yörünge geçmişi, NRL MSIS 2.1 atmosferi, JPL Sentry.',
    };
  }
  onAct() { this.close(null); }

  // ---------------------------------------------------------------- adımlar
  recommendFor(step) { return recommendCp(step, this.sel, this.ctx()); }
  reasonsFor(step) { return reasonsCp(step, this.sel, this.ctx()); }
  renderStep(k, body, next) {
    if (k === 'tur') this.stepType(body);
    else if (k === 'cisim') this.stepObject(body, next);
    else this.stepBrief(body);
  }
  pickType(v) {
    if (v === this.sel.type) return;
    this.sel = { type: v, id: null };
    this.iu.mode = v; this.iu.render();                                              // panel de aynı listeyi gösterir (uydu bozunma hesabı burada başlar)
    this.redraw();
  }
  stepType(body) {
    const c = this.ctx();
    this.rec(body, 'tur', this.sel.type, (v) => this.pickType(v));
    this.options(body, 'Tür', CP_ORDER.map((k) => ({ v: k, t: CP_TYPES[k].t, s: CP_TYPES[k].s,
      meta: k === 'sat' ? (c.sats ? tr('{0} cisim 1 yılda', fmt(c.sats.n1, 0)) : tr('hesaplanıyor…')) : (c.asts ? tr('{0} asteroit', fmt(c.asts.all.length, 0)) : '') })), this.sel.type, (v) => this.pickType(v));
  }
  stepObject(body, next) {
    const c = this.ctx(), ast = this.sel.type === 'ast';
    if (!ast && !c.sats) { this.waitBox(body, 'LS19 her cismin yörünge bozunmasını hesaplıyor: atmosfer yoğunluğu, sürüklenme ve son ~14 aydaki manevralar.', this.prog != null ? tr('Yörünge bozunması hesaplanıyor… %{0}', Math.round(100 * this.prog)) : 'Uydu verisi yükleniyor…'); next.disabled = true; return; }
    if (ast && !c.asts) { body.appendChild(el('p', 'brief-lead', esc(tr('Sentry verisi henüz yüklenmedi.')))); next.disabled = true; return; }
    if (this.sel.id == null) this.sel.id = ast ? recommendAst(c.asts.list) : recommendSat(c.sats.list);
    const pick = (v) => { this.sel.id = v; this.redraw(); };
    this.rec(body, 'cisim', this.sel.id, pick);
    const now = Date.now();
    this.options(body, ast ? 'Asteroit' : 'Cisim', ast
      ? c.asts.list.map((d) => ({ v: d.des, t: this.label(d.des), meta: fmtOdds(d.ip), s: [d.y0 === d.y1 ? String(d.y0) : `${d.y0}–${d.y1}`, d.D ? (d.D >= 1 ? `Ø ${fmt(d.D, 1)} km` : `Ø ${Math.round(d.D * 1000)} m`) : '', tr('Palermo {0}', fmt(d.ps, 1))].filter(Boolean).join(' · ') }))
      : c.sats.list.map((x) => ({ v: x.id, t: x.o.OBJECT_NAME, meta: fmtDate(x.r.reentryMs), s: [tr('perije {0} km', Math.round(x.r.perigeeKm)), tr('{0} sonra', fmtSpan((x.r.reentryMs - now) / 864e5)), tr('güven: {0}', CONF_TR[x.r.conf] || CONF_TR.low)].join(' · ') })), this.sel.id, pick);
    next.disabled = this.sel.id == null;
  }
  stepBrief(body) {
    const c = this.ctx(), ast = this.sel.type === 'ast', now = Date.now();
    let rows, v, acts;
    if (ast) {
      const d = c.asts && c.asts.list.find((q) => q.des === this.sel.id); if (!d) { this.go(1); return; }
      const mt = impactMt(d.D, +d.vinf);
      v = { kind: 'info', title: tr('{0}: çarpma olasılığı {1}', this.label(d.des), fmtOdds(d.ip)), detail: tr('Kesin değil: yörünge belirsizliği içindeki olası yolların bir kısmı Dünya\'ya çarpıyor. Gözlem arttıkça bu olasılık çoğu kez sıfıra iner.') };
      rows = [['Olası çarpma yılı', d.y0 === d.y1 ? String(d.y0) : `${d.y0} – ${d.y1}`], ['Olasılık', fmtOdds(d.ip)], ['Palermo / Torino', `${fmt(d.ps, 2)} / ${d.ts ?? '—'}`],
        ['Çap', d.D ? (d.D >= 1 ? `${fmt(d.D, 2)} km` : `${Math.round(d.D * 1000)} m`) : '—'], ['v∞', `${fmt(+d.vinf, 1)} km/s`], ['Çarpsaydı', mt != null ? tr('≈ {0} TNT', mtText(mt)) : '—']];
      acts = [{ go: 'lab', t: 'Saptırma deneyinde dene' }, { go: 'follow', t: 'Haritada izle' }, { go: 'panel', t: 'Panelde ayrıntılar' }];
    } else {
      const x = c.sats && c.sats.list.find((q) => q.id === this.sel.id); if (!x) { this.go(1); return; }
      const r = x.r, rem = (r.reentryMs - now) / 864e5;
      v = { kind: 'info', title: tr('{0}: {1} atmosfere girer', x.o.OBJECT_NAME, rem < 730 ? fmtDate(r.reentryMs) : String(new Date(r.reentryMs).getUTCFullYear())), detail: tr('{0} sonra (güven: {1}). Tahmin manevrasız senaryodur; çoğu parça yanar.', fmtSpan(rem), CONF_TR[r.conf] || CONF_TR.low) };
      rows = [['NORAD', String(x.id)], ['Yörünge', `${Math.round(r.perigeeKm)} × ${Math.round(r.apogeeKm)} km`], ['Tahmini yeniden giriş', fmtReentry(r, now)], ['Kontrol durumu', controlNote(ageYears(x.o, now))]];
      acts = [{ go: 'follow', t: 'Kamerayla izle' }, { go: 'panel', t: 'Panelde ayrıntılar' }];
    }
    body.innerHTML = `<div class="brief-verdict ${esc(v.kind)}" role="status"><b>${esc(v.title)}</b><p>${esc(v.detail)}</p></div>
      <dl class="brief-sum">${rows.map(([k, x]) => `<div><dt>${esc(tr(k))}</dt><dd>${esc(tr(x))}</dd></div>`).join('')}</dl>`;
    this.goButtons(acts, 'Seçimleri değiştir', (how) => this.launch(how, c));
  }
  launch(how, c) {
    const ast = this.sel.type === 'ast', A = this.h.asts, id = this.sel.id;
    if (ast) {
      const i = A.index ? A.index.get(id) : null, d = c.asts.list.find((q) => q.des === id);
      this.close(how === 'lab' ? 'away' : how);
      if (how === 'lab' && i != null) this.h.astui.openLab(i, { hypo: true });                 // sanal çarpıcı: "çarpacak olsaydı" senaryosuyla
      else if (how === 'follow' && i != null) this.h.astui.follow(i);
      else { this.iu.mode = 'ast'; this.iu.render(); if (d) this.iu.pickAst(d); document.querySelector('#labPanel').classList.add('open'); }
      return;
    }
    const x = c.sats.list.find((q) => q.id === id);
    this.close(how);
    if (how === 'follow') this.h.follow(id);
    else { this.iu.mode = 'sat'; this.iu.render(); if (x) this.iu.pickSat(x); document.querySelector('#labPanel').classList.add('open'); }
  }

  // ---------------------------------------------------------------- 3B sahne
  aim(c, x, show) {
    const t = x.t, A = this.h.asts, ast = this.sel.type === 'ast';
    let a = null;
    if (c.type || c.obj) {
      if (ast) {                                                                   // asteroitler: Güneş sistemi, seçilen asteroit işaretli
        c.mode = 'SOLAR'; c.dist = 4.6e8; c.el = 1.05; c.wide = true;
        this.placePin('E', [0, 0, 0], 'Dünya'); show.add('E');
        const i = this.sel.id && A.index ? A.index.get(this.sel.id) : null, p = i != null ? A.geoPos(i, t) : null;
        if (c.obj && p) { if (A.sel !== i) A.select(i); this.placePin('a', p, this.label(this.sel.id), null, { on: true }); show.add('a'); }
      } else {                                                                     // uydular: Dünya; seçilen cisim yakından (arkada Dünya)
        c.mode = 'EARTH'; c.wide = false;
        const p = c.obj && this.sel.id != null ? this.h.satPos(this.sel.id, t) : null;
        if (p) {
          const n = Math.hypot(...p), u = p.map((q) => q / n);
          c.dist = Math.max(16000, 2.6 * n);
          a = { az: Math.atan2(u[1], u[0]) + 0.35, el: Math.max(-1.2, Math.min(1.2, Math.asin(u[2]) + 0.2)) };
          const L = this.ctx().sats, o = L && L.list.find((q) => q.id === this.sel.id);
          this.placePin('s', p, o ? o.o.OBJECT_NAME : String(this.sel.id), null, { on: true }); show.add('s');
        } else { c.dist = 36000; a = { az: c.az + 0.02 * c.t, el: c.el }; }
      }
    }
    if (c.spin && !a && c.mode === 'EARTH') a = { az: c.az + c.spin * c.t, el: c.el };
    return a;
  }
  portraitScale(c, asp) { return c.mode === 'SOLAR' ? Math.min(2.2, 0.95 / asp) : 1.6; }
}
