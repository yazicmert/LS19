// Uydular sekmesi (ui.js'ten ayrıldı; UI'ya karıştırılır): uydu katmanına bağlanma, grup listesi, arama, Ay uyduları ve seçili uydunun ayrıntı tablosu.
import * as E from './engine.js';
import { SAT_GROUPS } from './satlayer.js';
import { fmt } from './format.js';
import { $ } from './uiutil.js';

export class SatPanel {
  // ------------------------------------------------------------------ uydular
  bindSats(L) {
    this.sats = L;
    $('#chkSats').addEventListener('change', (e) => { L.enabled = e.target.checked; });
    $('#chkMoonSats').addEventListener('change', (e) => { L.moonEnabled = e.target.checked; });
    let tmr = null;
    $('#satSearch').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.satSearch(e.target.value), 150); });
    $('#satSearch').addEventListener('keydown', (e) => e.stopPropagation());
    L.onChange = () => this.renderSats();
    this.renderSats();
  }
  renderSats() {
    const L = this.sats; if (!L) return;
    const st = $('#satStatus'); st.replaceChildren();
    const line = (txt) => { const d = document.createElement('div'); d.textContent = txt; st.appendChild(d); };
    if (L.n > 0) {
      const ep = new Date(L.epochMs).toISOString().slice(0, 16).replace('T', ' ');
      const yas = L.src && L.src.yas >= 60 ? L.src.yas : 0;
      line(`${fmt(L.n, 0)} aktif uydu · kaynak: ${L.src ? L.src.kaynak : '—'}${!yas ? '' : yas < 48 * 3600 ? ` (${fmt(yas / 3600, 1)} sa önce)` : ` (${fmt(yas / 86400, 0)} gün önce)`}`);
      line(`Yörünge öğeleri çağı: ~${ep} UTC`);
    } else line(L.info.status);
    const ul = $('#satGroups'); ul.replaceChildren();
    if (L.counts) SAT_GROUPS.forEach((g, i) => {
      const li = document.createElement('li');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!L.mask[i]; cb.addEventListener('change', () => L.setMask(i, cb.checked));
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = '#' + g.color.toString(16).padStart(6, '0');
      const nm = document.createElement('span'); nm.textContent = g.name;
      const c = document.createElement('span'); c.className = 'v'; c.textContent = fmt(L.counts[i], 0);
      li.append(cb, sw, nm, c); ul.appendChild(li);
    });
    this.renderMoonSats();
  }
  satSearch(q) {
    const L = this.sats, ul = $('#satResults'); ul.replaceChildren();
    for (const i of L.search(q)) {
      const li = document.createElement('li'); li.textContent = `${L.names[i]} (${L.ids[i]})`;
      li.addEventListener('click', () => { L.select(i); ul.replaceChildren(); $('#satSearch').value = L.names[i]; });
      ul.appendChild(li);
    }
    if (!q) L.select(-1);
  }
  renderMoonSats(t = null) {
    const L = this.sats, tb = $('#moonSatTable tbody'); tb.replaceChildren();
    for (const m of L.moonSats) {
      const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'); b.className = 'num';
      a.textContent = m.name;
      const r = m.cur || (t != null && m.rows ? L.moonState(m, t) : null);
      b.textContent = r ? `irtifa ${fmt(Math.hypot(...r) - E.R_M, 0)} km` : m.status;
      tr.append(a, b); tb.appendChild(tr);
    }
  }
  satTab(t) {
    const L = this.sats; if (!L) return;
    const inf = L.selInfo(t), el = $('#satSel'); el.replaceChildren();
    if (inf) {
      const add = (txt, b) => { const d = document.createElement(b ? 'b' : 'div'); d.textContent = txt; el.appendChild(d); };
      add(`${inf.name} (NORAD ${inf.id})`, true);
      add(`İrtifa ${fmt(inf.alt, 0)} km · hız ${fmt(inf.v, 2)} km/s`);
      add(`Periyot ${fmt(inf.periodMin, 1)} dk · eğim ${fmt(inf.inc, 1)}° · dış merkezlik ${fmt(inf.ecc, 4)}`);
    }
    if (!L.validAt(t) && L.n > 0) { const d = document.createElement('div'); d.textContent = 'Simülasyon tarihi yörünge öğelerinin çağından 30 günden uzak: Dünya uyduları gizlendi.'; el.appendChild(d); }
    this.renderMoonSats(t);
  }
}
