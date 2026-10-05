// LS19 sinematik bindirmeler (DOM): letterbox, bölüm kartları, veri şeridi, zaman çizelgesi, geçiş (kararma/parlama), kapanış özeti.
// Hareket yalnız transform / opacity / clip-path ile ve css/cinema.css'teki geçişlerle yapılır; JS yalnız sınıf ve metin değiştirir.
import { applyIcons } from './icons.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class CineUI {
  constructor(parent) {
    this.parent = parent; this.timers = new Set(); this.cache = {}; this.numbers = [];
    const root = this.root = el('div', 'cine', '');
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Sinematik gösterim');
    root.innerHTML = `
      <div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div class="cine-cards" aria-live="polite"></div>
      <div class="cine-strip">
        <div class="cs-cell"><span class="cs-k">Görev süresi</span><span class="cs-v" data-f="met">T+0g 00:00:00</span></div>
        <div class="cs-cell cs-phase"><span class="cs-k" data-f="chap">Bölüm</span><span class="cs-v" data-f="phase">—</span></div>
        <div class="cs-cell"><span class="cs-k" data-f="k1">İrtifa</span><span class="cs-v" data-f="v1">—</span></div>
        <div class="cs-cell"><span class="cs-k" data-f="k2">Hız</span><span class="cs-v" data-f="v2">—</span></div>
        <div class="cs-cell cs-warp"><span class="cs-k">Zaman</span><span class="cs-v" data-f="warp">×1</span></div>
      </div>
      <div class="cine-timeline" aria-hidden="true"><i class="ct-track"></i><i class="ct-prog" data-f="prog"></i><span class="ct-ticks" data-f="ticks"></span></div>
      <div class="cine-hint" data-f="hint"><kbd>Esc</kbd> çık · <kbd>Boşluk</kbd> duraklat · <kbd>→</kbd> sonraki çekim</div>
      <button class="cine-exit" type="button" aria-label="Sinematik gösterimden çık"><i data-icon="x"></i><span>Çık</span></button>
      <div class="cine-flash"></div>
      <div class="cine-fade"></div>`;
    parent.appendChild(root); applyIcons(root);
    this.f = {}; root.querySelectorAll('[data-f]').forEach((n) => { this.f[n.dataset.f] = n; });
    this.cards = root.querySelector('.cine-cards'); this.flashEl = root.querySelector('.cine-flash'); this.fadeEl = root.querySelector('.cine-fade'); this.exitBtn = root.querySelector('.cine-exit');
  }

  after(ms, fn) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); return id; }
  clearTimers() { for (const id of this.timers) clearTimeout(id); this.timers.clear(); }

  // giriş: HUD kapanır, letterbox kayar. İki aşama (kare arası) ki geçiş başlangıç durumundan çalışsın
  enter() {
    document.body.classList.add('cine-on'); this.root.classList.add('live');
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('on')));
    this.showHint(true);
  }
  leave(instant = false) {
    this.clearTimers();
    this.root.classList.remove('on'); document.body.classList.remove('cine-on');
    this.cards.textContent = ''; this.numbers = [];
    this.fade(0, 0); this.cache = {};
    if (instant) this.root.classList.remove('live'); else this.after(700, () => this.root.classList.remove('live'));
  }

  // bölüm kartı: {idx, total, title, sub, kind: 'chapter' | 'open' | 'close', hold (s)}; yeni kart eskisini söndürür
  card(c) {
    for (const old of this.cards.querySelectorAll('.cine-card:not(.out)')) this.dismiss(old);
    const k = c.kind || 'chapter', d = el('div', `cine-card ${k}`);
    const idx = c.idx != null ? `<span class="cc-idx">${String(c.idx).padStart(2, '0')}<i>/</i>${String(c.total).padStart(2, '0')}</span>` : '';
    d.innerHTML = `${idx}<h2 class="cc-h">${c.title}</h2><span class="cc-rule"></span>${c.sub ? `<p class="cc-s">${c.sub}</p>` : ''}${c.extra || ''}`;
    this.cards.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));
    if (c.hold) this.after(c.hold * 1000, () => this.dismiss(d));
    return d;
  }
  dismiss(d) { if (!d || d.classList.contains('out')) return; d.classList.add('out'); d.classList.remove('in'); this.after(600, () => d.remove()); }

  // veri şeridi: değer değişmedikçe DOM'a dokunulmaz
  strip(v) { for (const k in v) { if (this.cache[k] !== v[k] && this.f[k]) { this.cache[k] = v[k]; this.f[k].textContent = v[k]; } } }
  progress(p) { const q = Math.round(Math.max(0, Math.min(1, p)) * 1000) / 1000; if (this.cache._p !== q) { this.cache._p = q; this.f.prog.style.transform = `scaleX(${q})`; } }
  ticks(list) { this.f.ticks.innerHTML = list.map((p) => `<i style="left:${(p * 100).toFixed(2)}%"></i>`).join(''); }
  showHint(on) { this.f.hint.classList.toggle('show', on); if (on) this.after(5200, () => this.f.hint.classList.remove('show')); }

  // kararma geçişi: to 0..1 (1 = siyah), ms
  fade(to, ms = 350) { this.fadeEl.style.transitionDuration = `${ms}ms`; this.fadeEl.style.opacity = String(to); }
  // ayrılma parlaması
  flash() { this.flashEl.classList.remove('go'); void this.flashEl.offsetWidth; this.flashEl.classList.add('go'); }
  set paused(on) { this.root.classList.toggle('paused', !!on); }

  // kapanış özeti: sayılar number-flow ile 0'dan değerlerine yuvarlanır (yalnız bir kez gösterilen kart: gösteri aşaması)
  async summary(rows) {
    let NF = null; try { NF = (await import('number-flow')).default; } catch (e) { NF = null; }
    const box = el('div', 'cc-stats');
    const nodes = rows.map((r) => {
      const row = el('div', 'cc-stat'), val = el('span', 'cc-sv'), unit = el('span', 'cc-su', r.unit || '');
      row.appendChild(el('span', 'cc-sk', r.label)); const wrap = el('span', 'cc-sval'); wrap.appendChild(val); wrap.appendChild(unit); row.appendChild(wrap); box.appendChild(row);
      if (NF && !r.text) { const n = document.createElement('number-flow'); n.format = r.format || { maximumFractionDigits: 1 }; n.locales = 'tr-TR'; n.animated = true; n.update(0); val.appendChild(n); return { n, v: r.value }; }
      val.textContent = r.text != null ? r.text : String(r.value); return null;
    });
    return { box, run: () => { for (const o of nodes) if (o) o.n.update(o.v); } };
  }
}
