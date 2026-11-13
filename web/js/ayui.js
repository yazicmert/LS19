// Laboratuvar › Ay görevi deneyi: dört adımın arayüz yapıştırıcısı (Görev → Araç ve güdüm → Uçuş → Sonuç).
// Sekmelerin kendisi ui.js'tedir (setTab, iç içe adımlar); metin ve yargılar aytext.js'te (saf). Bu modül yalnız durumu okur ve yazar:
// fizik worker'ına komut göndermez (Baştan uçur, app.js'in verdiği restart geri çağrısıyla yapılır).
import { AY_STEPS, sumGorev, sumArac, sumUcus, sumSonuc, verdict, dateShort, ayHistoryRow, ayHistoryCsv } from './aytext.js';
import { fmt } from './format.js';
import { dvKeys, dvFromEvents } from './dvbudget.js';
import { $ } from './uiutil.js';
import { t } from './i18n.js';

const setText = (el, t) => { if (el && el._t !== t) { el._t = t; el.textContent = t; } };
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const HIST_KEY = 'ls19.ayHist', HIST_MAX = 30;
const loadHist = () => { try { const a = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); return Array.isArray(a) ? a.filter((h) => h && typeof h.link === 'string' && h.title) : []; } catch (e) { return []; } };
const saveHist = (a) => { try { localStorage.setItem(HIST_KEY, JSON.stringify(a)); } catch (e) { /* özel pencere ya da kota: geçmiş yalnız bu oturumda kalır */ } };
const distText = (m) => (m == null ? '—' : m < 1000 ? fmt(m, 1) + ' m' : fmt(m / 1000, 2) + ' km');

export class AyUI {
  // ui: UI (ui.js); restart(): görevi baştan başlatır (app.js)
  // link(): şu anki görevin bağlantısı { qs, url } ya da null; open(qs): bağlantıdaki görevi kurar ve tasarlar; site(): görüntülenen iniş yerinin adı
  // urlOf(qs): geçmiş satırının tam adresi (CSV)
  constructor({ ui, restart, link = () => null, open = null, site = () => '', urlOf = (qs) => qs }) {
    this.ui = ui; this.sig = ''; this.vsig = ''; this.hadResult = false; this.link = link; this.open = open; this.site = site; this.urlOf = urlOf;
    this.hist = loadHist(); this.renderHist();
    $('#ayLink').addEventListener('click', () => this.copyLink());
    $('#ayHistCsv').addEventListener('click', () => this.downloadCsv());
    $('#ayHistClear').addEventListener('click', () => { this.hist = []; saveHist(this.hist); this.renderHist(); });
    const root = $('#lab-ay');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]'); if (b && root.contains(b)) { ui.setTab(b.dataset.goto); this.focusStep(b.dataset.goto); }
    });
    $('#ayRestart').addEventListener('click', () => { restart(); ui.setTab('plan'); });
    const prev = ui.onTab;
    ui.onTab = (leaf, asked) => { if (prev) prev(leaf, asked); if (leaf === 'dv') this.markSeen(); };
  }
  focusStep(id) { const b = document.querySelector(`#lab-ay > .tabs .tab[data-tab="${id}"]`); if (b) b.focus({ preventScroll: true }); }
  markSeen() { const b = document.querySelector('#lab-ay > .tabs .tab[data-tab="dv"]'); if (b) b.classList.remove('new'); }
  // nominal ve gerçekleşen Δv toplamı: Δv tablosuyla aynı tanım (yalnız ikisi de bilinen manevralar), m/s
  dvTotals() {
    const ui = this.ui, N = ui.nominal; if (!N || !ui.design) return { used: null, nom: null };
    const act = dvFromEvents(ui.events); let used = 0, nom = 0, n = 0;
    for (const k of dvKeys(ui.design)) if (act[k] != null && N[k] != null) { used += act[k]; nom += N[k]; n++; }
    return n ? { used, nom } : { used: null, nom: null };
  }
  // st: { profileName, dateISO, designing, ready, running, done, met, result, vehicle, landing, optimalOk }
  update(st) {
    const sums = { gorev: sumGorev(st), arac: sumArac(st), ucus: sumUcus(st), dv: sumSonuc(st) };
    const sig = JSON.stringify(sums) + (st.ready ? 1 : 0) + (st.optimalOk ? 1 : 0);
    if (sig !== this.sig) {
      this.sig = sig;
      for (const s of AY_STEPS) {
        setText($('#aySum-' + s.id), sums[s.id]);
        const b = document.querySelector(`#lab-ay > .tabs .tab[data-tab="${s.id}"]`);
        if (b) b.title = `${s.n}. ${t(s.title)}: ${t(sums[s.id])}`;
        if (b) b.classList.toggle('done', s.id === 'dv' ? !!(st.done && st.result) : s.id === 'ucus' ? !!st.done : !!st.ready);
      }
      $('#ayOptNote').hidden = st.optimalOk !== false;
    }
    const has = !!(st.done && st.result), fresh = has && !this.hadResult;
    if (has && !this.hadResult && this.ui.tab !== 'dv') { const b = document.querySelector('#lab-ay > .tabs .tab[data-tab="dv"]'); if (b) b.classList.add('new'); }
    if (!has) this.markSeen();
    this.hadResult = has;
    const tot = has ? this.dvTotals() : { used: null, nom: null };
    const v = verdict(has ? st.result : null, { dvUsed: tot.used, dvNominal: tot.nom, profileName: st.profileName, vehicle: st.vehicle, landing: st.optimalOk ? st.landing : 'zem', rocket: st.rocket });
    if (fresh) this.remember(st, v, tot.used);
    const vsig = JSON.stringify(v);
    if (vsig === this.vsig) return; this.vsig = vsig;
    $('#ayVerdict').className = 'verdict ' + v.kind;
    setText($('#ayVT'), v.title); setText($('#ayVD'), v.detail);
    const tb = $('#ayVTbl tbody'); tb.replaceChildren();
    for (const [k, val] of v.rows) { const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'); a.textContent = k; b.textContent = val; b.className = 'num'; tr.append(a, b); tb.appendChild(tr); }
    $('#ayVTbl').hidden = !v.rows.length;
  }
  // ---------------------------------------------------------------- bağlantı ve "Denemelerim"
  async copyLink() {
    const L = this.link(), msg = $('#ayLinkMsg'); if (!L) { msg.textContent = t('Görev hazır olunca bağlantı kopyalanabilir.'); return; }
    try { await navigator.clipboard.writeText(L.url); msg.textContent = t('Bağlantı kopyalandı.'); }
    catch (e) { msg.textContent = ''; window.prompt(t('Bağlantıyı kopyalayın:'), L.url); }
    setTimeout(() => { if (msg.textContent === t('Bağlantı kopyalandı.')) msg.textContent = ''; }, 4000);
  }
  // biten uçuş: geçmişe (aynı bağlantı ve aynı sonuç bir kez; en yenisi üstte)
  remember(st, v, dvUsed) {
    const L = this.link(); if (!L) return;
    const r = st.result, setup = [sumArac(st), r.manual ? t('elle iniş') : ''].filter(Boolean).join(' · ');
    const row = ayHistoryRow(r, v, { date: new URLSearchParams(L.qs).get('date') || st.dateISO, launchISO: st.dateISO, setup: `${sumGorev({ ...st, designing: false }).split(' · ')[0]} · ${setup}`, site: this.site(), dvUsed, link: L.qs });
    const same = (h) => h.link === row.link && h.title === row.title && h.prop === row.prop && h.miss === row.miss;
    this.hist = [row, ...this.hist.filter((h) => !same(h))].slice(0, HIST_MAX); saveHist(this.hist); this.renderHist();
  }
  renderHist() {
    const box = $('#ayHist'), tb = $('#ayHistTbl tbody'); tb.replaceChildren();
    box.hidden = !this.hist.length; $('#ayHistN').textContent = this.hist.length ? `(${this.hist.length})` : '';
    this.hist.forEach((h, k) => {
      const tr = mk('tr', 'hrow ' + h.kind); tr.tabIndex = 0; tr.title = t('Bu görevi yeniden kur');
      tr.append(mk('td', null, `${dateShort(h.launch || h.date)} · ${h.site}`), mk('td', null, h.setup), mk('td', 'num', h.prop == null ? '—' : fmt(h.prop, 0) + ' kg'),
        mk('td', 'num', distText(h.miss)), mk('td', 'res', t(h.title)));
      const go = () => { if (this.open) this.open(this.hist[k].link); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } });
      tb.appendChild(tr);
    });
  }
  downloadCsv() {
    if (!this.hist.length) return;
    const rows = this.hist.map((h) => ({ ...h, link: this.urlOf(h.link) }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ayHistoryCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ls19_ay_denemeleri.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
