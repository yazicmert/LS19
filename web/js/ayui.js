// Laboratuvar › Ay görevi deneyi: dört adımın arayüz yapıştırıcısı (Görev → Araç ve güdüm → Uçuş → Sonuç).
// Sekmelerin kendisi ui.js'tedir (setTab, iç içe adımlar); metin ve yargılar aytext.js'te (saf). Bu modül yalnız durumu okur ve yazar:
// fizik worker'ına komut göndermez (Baştan uçur, app.js'in verdiği restart geri çağrısıyla yapılır).
import { AY_STEPS, sumGorev, sumArac, sumUcus, sumSonuc, verdict } from './aytext.js';
import { dvKeys, dvFromEvents } from './dvbudget.js';
import { $ } from './uiutil.js';

const setText = (el, t) => { if (el && el._t !== t) { el._t = t; el.textContent = t; } };

export class AyUI {
  // ui: UI (ui.js); restart(): görevi baştan başlatır (app.js)
  constructor({ ui, restart }) {
    this.ui = ui; this.sig = ''; this.vsig = ''; this.hadResult = false;
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
        if (b) b.title = `${s.n}. ${s.title}: ${sums[s.id]}`;
        if (b) b.classList.toggle('done', s.id === 'dv' ? !!(st.done && st.result) : s.id === 'ucus' ? !!st.done : !!st.ready);
      }
      $('#ayOptNote').hidden = st.optimalOk !== false;
    }
    const has = !!(st.done && st.result);
    if (has && !this.hadResult && this.ui.tab !== 'dv') { const b = document.querySelector('#lab-ay > .tabs .tab[data-tab="dv"]'); if (b) b.classList.add('new'); }
    if (!has) this.markSeen();
    this.hadResult = has;
    const tot = has ? this.dvTotals() : { used: null, nom: null };
    const v = verdict(has ? st.result : null, { dvUsed: tot.used, dvNominal: tot.nom, profileName: st.profileName, vehicle: st.vehicle, landing: st.optimalOk ? st.landing : 'zem', rocket: st.rocket });
    const vsig = JSON.stringify(v);
    if (vsig === this.vsig) return; this.vsig = vsig;
    $('#ayVerdict').className = 'verdict ' + v.kind;
    setText($('#ayVT'), v.title); setText($('#ayVD'), v.detail);
    const tb = $('#ayVTbl tbody'); tb.replaceChildren();
    for (const [k, val] of v.rows) { const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'); a.textContent = k; b.textContent = val; b.className = 'num'; tr.append(a, b); tb.appendChild(tr); }
    $('#ayVTbl').hidden = !v.rows.length;
  }
}
