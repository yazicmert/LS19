// Tıklanan cismin bilgi kartı (ui.js'ten ayrıldı; UI'ya karıştırılır): gezegen, uydu, asteroit ve Ay uydusu için konumlanan kart, düzenli yenileme, eylem düğmeleri.
import { SAT_GROUPS } from './satlayer.js';
import { fmtReentry, controlNote } from './impact.js';
import { fmt } from './format.js';
import { srcOf } from './satcatalog.js';
import { $ } from './uiutil.js';
import { ns, ew, LOC, UNIT } from './i18n.js';

export class PickCard {
  // ------------------------------------------------------------------ tıklanan cisim bilgisi (gezegen / uydu)
  showPick(obj, mx, my, t) {
    this.pick = obj; this.lastPick = 0;
    const el = $('#pick'), app = $('#app'), W = app.clientWidth;
    el.hidden = false; this.pickAnchor = [mx, my];
    el.style.left = Math.min(W - 308, Math.max(8, mx + 14)) + 'px';
    $('#pick').replaceChildren();
    this.renderPick(t, true);
  }
  // kart ekrana sığsın: alt çubuğa (≈88 px) binmesin, uzunsa kendi içinde kaydırılsın; içerik değişince (tazeleme) yeniden hizalanır
  placePick() {
    const el = $('#pick'), app = $('#app'), H = app.clientHeight, A = this.pickAnchor || [0, 80], bottom = 88, top0 = 8;
    el.style.maxHeight = Math.max(160, H - top0 - bottom) + 'px';
    const h = el.offsetHeight;
    el.style.top = Math.max(top0, Math.min(A[1] - 20, H - bottom - h)) + 'px';
  }
  hidePick() { this.pick = null; $('#pick').hidden = true; }
  renderPick(t, full = false) {
    const P = this.pick; if (!P) return;
    const root = $('#pick');
    let el = root.querySelector('.pbody'); if (!el) { el = document.createElement('div'); el.className = 'pbody'; root.prepend(el); }
    const d = P.refresh(t); el.replaceChildren();
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const head = mk('div', 'ph'), ttl = mk('div');
    const x = mk('button', 'px', '×'); x.title = 'Kapat (Esc)'; x.addEventListener('click', () => this.hidePick());
    if (!d) { ttl.append(mk('div', 'pt', 'Veri yok'), mk('div', 'ps', 'Bu an için durum hesaplanamadı')); head.append(ttl, x); el.appendChild(head); return; }
    const rows = [];
    const km = (v) => (Math.abs(v) >= 10000 ? fmt(v, 0) : fmt(v, 1)) + ' km';
    if (P.card) {
      const c = P.card(d); ttl.append(mk('div', 'pt', c.title), mk('div', 'ps', c.sub)); rows.push(...c.rows);
    } else if (P.kind === 'sat') {
      ttl.append(mk('div', 'pt', d.name), mk('div', 'ps', `NORAD ${d.norad} · COSPAR ${d.cospar}${d.launchYear ? ` · fırlatma ${d.launchYear}` : ''}`));
      rows.push(['Grup', d.group], ['Yörünge türü', d.orbitType]);
      if (d.alt != null) rows.push(['İrtifa', km(d.alt)], ['Hız', fmt(d.speed, 3) + ' km/s'],
        ['Yer izi', `${fmt(Math.abs(d.lat), 2)}° ${ns(d.lat)}, ${fmt(Math.abs(d.lon), 2)}° ${ew(d.lon)}`],
        ['Aydınlanma', d.sunlit ? 'Güneş ışığında' : "Dünya'nın gölgesinde"]);
      rows.push(['Periyot', d.periodMin > 180 ? fmt(d.periodMin / 60, 2) + ' ' + UNIT.h : fmt(d.periodMin, 1) + ' ' + UNIT.min], ['Eğim', fmt(d.inc, 2) + '°'],
        ['Perije / apoje', `${fmt(d.perigee, 0)} / ${fmt(d.apogee, 0)} km`], ['Dış merkezlik', fmt(d.ecc, 5)],
        ['Öğelerin yaşı', `${fmt(d.epochAgeDays, 1)} gün`], ['Yörünge verisi', d.source || 'CelesTrak GP']);
      rows.push(['Tahmini yeniden giriş', fmtReentry(d.decay)]);
      rows.push(['Kontrol durumu', controlNote(d.decay && d.decay.age, d.group === SAT_GROUPS[0].name)]);
      rows.push(['3B model', d.model ? `${d.model.note || d.model.title} · ${srcOf(d.model)} (~${fmt(d.model.size, d.model.size < 10 ? 1 : 0)} m)` : d.family ? `${d.family.title} · temsili aile modeli (${d.family.note})` : 'nokta']);
      if (d.obsEl != null) rows.push([`${d.obsName}'dan`, d.obsEl > 0 ? `gökte ${fmt(d.obsEl, 1)}° · az ${fmt(d.obsAz, 0)}° · ${fmt(d.obsRange, 0)} km` : 'ufkun altında']);
      if (d.nextPass) { const p = d.nextPass, tt = new Date(p.rise.ms);
        rows.push(['Sonraki geçiş', `${tt.toLocaleString(LOC, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · en yüksek ${fmt(p.max.el, 0)}°${p.visible ? ' · görünür' : ''}`]); }
    } else if (P.kind === 'msat') {
      ttl.append(mk('div', 'pt', d.name), mk('div', 'ps', 'Ay yörüngesinde · JPL Horizons'));
      rows.push(["İrtifa (Ay'a göre)", km(d.alt)], ['Hız', fmt(d.speed, 3) + ' km/s'],
        ['Periyot (anlık)', Number.isFinite(d.periodMin) ? (d.periodMin > 180 ? fmt(d.periodMin / 60, 2) + ' ' + UNIT.h : fmt(d.periodMin, 1) + ' ' + UNIT.min) : '—']);
      if (d.model) rows.push(['3B model', `${d.model.title} · ${srcOf(d.model)}`]);
    } else if (P.kind === 'planet') {
      ttl.append(mk('div', 'pt', d.name), mk('div', 'ps', 'Canlı efemeris (DE440 başlangıçlı N-cisim)'));
      rows.push(['Yarıçap', fmt(d.R, 0) + ' km'], ["Güneş'e uzaklık", fmt(d.dSun, 4) + ' AB'],
        ["Dünya'ya uzaklık", `${fmt(d.dEarth, 4)} AB (ışık ${fmt(d.lightMin, 1)} dk)`], ['Yörünge hızı', fmt(d.v, 2) + ' km/s'],
        ['Yörünge periyodu', d.periodDays > 1000 ? fmt(d.periodDays / 365.25, 2) + ' yıl' : fmt(d.periodDays, 1) + ' gün'],
        ['Yarı büyük eksen / e', `${fmt(d.a, 4)} AB / ${fmt(d.e, 4)}`]);
    }
    head.append(ttl, x); el.appendChild(head);
    const tb = mk('table');
    for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); }
    el.appendChild(tb);
    if (full && P.actions && P.actions.length) {                // düğmeler bir kez kurulur (tazelemede tıklama kaybolmasın)
      const pa = mk('div', 'pa');
      for (const a of P.actions) { const b = mk('button', null, a.label); b.addEventListener('click', () => { a.fn(); }); pa.appendChild(b); }
      root.appendChild(pa);
    }
    this.placePick();
  }
}
