// LS19 sinematik bindirmeler (DOM): letterbox, bölüm kartları, veri şeridi, zaman çizelgesi, geçiş (kararma/parlama), kapanış özeti.
// Hareket yalnız transform / opacity / clip-path ile ve css/cinema.css'teki geçişlerle yapılır; JS yalnız sınıf ve metin değiştirir.
import { applyIcons, setBtn } from './icons.js';
import { LOC } from './i18n.js';
import { esc, ACCENTS, INKS, FONTS, WEIGHTS, TRACKS, SHADES } from './producer.js';

// görev amblemi (üretilmiş SVG; herhangi bir kurumun işareti değildir): halka içinde Dünya yayı, Ay ve ikisini bağlayan gidiş yolu
export const EMBLEM = `<svg class="cine-emblem" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="0.6" opacity=".55"/>
<path d="M14 92a46 46 0 0 1 60-58" fill="none" stroke="currentColor" stroke-width="0.8" opacity=".5" stroke-dasharray="2 3"/><circle cx="34" cy="80" r="17" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19 74c8 5 21 6 31 1M21 88c8 3 18 3 26-1" fill="none" stroke="currentColor" stroke-width="0.8" opacity=".6"/>
<circle cx="88" cy="36" r="7" fill="currentColor"/><path d="M48 70C62 58 62 40 81 37" fill="none" stroke="var(--cine-accent)" stroke-width="1.8" stroke-linecap="round"/><circle cx="48" cy="70" r="2.2" fill="var(--cine-accent)"/>
<path d="M98 78l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" fill="currentColor" opacity=".8"/></svg>`;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class CineUI {
  constructor(parent) {
    this.parent = parent; this.timers = new Set(); this.cache = {}; this.numbers = [];
    const root = this.root = el('div', 'cine', '');
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Sinematik gösterim');
    root.innerHTML = `
      <div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div class="cine-scrim"></div>
      <div class="cine-tags" data-f="tags" aria-hidden="true"></div>
      <div class="cine-cards" aria-live="polite"></div>
      <div class="cine-bug" aria-hidden="true">${EMBLEM}<span class="cb-t"><b data-f="bugT">LS19</b><span data-f="bugSub">Ay görevi</span></span><i class="cb-q" data-f="q"></i></div>
      <div class="cine-cue" data-f="cue" aria-live="polite"></div>
      <small class="cine-credit" data-f="credit"></small>
      <div class="cine-strip">
        <div class="cs-cell"><span class="cs-k">Görev süresi</span><span class="cs-v" data-f="met">T+0g 00:00:00</span></div>
        <div class="cs-cell cs-phase"><span class="cs-k" data-f="chap">Bölüm</span><span class="cs-v" data-f="phase">—</span></div>
        <div class="cs-cell"><span class="cs-k" data-f="k1">İrtifa</span><span class="cs-v" data-f="v1">—</span></div>
        <div class="cs-cell"><span class="cs-k" data-f="k2">Hız</span><span class="cs-v" data-f="v2">—</span></div>
        <div class="cs-cell cs-warp"><span class="cs-k">Zaman</span><span class="cs-v" data-f="warp">Gerçek zaman</span></div>
      </div>
      <div class="cine-timeline" aria-hidden="true"><i class="ct-track"></i><i class="ct-prog" data-f="prog"></i><span class="ct-ticks" data-f="ticks"></span></div>
      <div class="cine-hint" data-f="hint"><kbd>Esc</kbd> çık · <kbd>Boşluk</kbd> duraklat · <kbd>→</kbd> sonraki çekim · <kbd>M</kbd> ses aç/kapat</div>
      <button class="cine-mute" type="button" aria-pressed="false" aria-label="Sesi kapat"><i data-icon="volume"></i><span>Ses</span></button>
      <button class="cine-exit" type="button" aria-label="Sinematik gösterimden çık"><i data-icon="x"></i><span>Çık</span></button>
      <button class="cine-edit" type="button" title="Yapımcı masası: bölümler, kamera, metinler, görünüm ve ses (Y)"><i data-icon="sliders"></i><span>Kurguyu düzenle</span></button>
      <div class="cine-flash"></div>
      <div class="cine-fade"></div>
      <div class="cine-pv" data-f="pv" hidden role="group" aria-label="Önizleme"><b>Önizleme</b><span class="pv-name" data-f="pvName"></span><span class="pv-shots" data-f="pvShots"></span>
        <label class="pv-tau">Çekimde konum <input type="range" min="0" max="1" step="0.01" data-f="pvTau"></label><button type="button" class="pv-back" data-f="pvBack"><i data-icon="back"></i><span>Masaya dön</span></button></div>
      <div class="cine-slate" data-f="slate" aria-live="polite"><b data-f="slateT"></b><span data-f="slateS"></span></div>`;
    parent.appendChild(root); applyIcons(root);
    this.f = {}; root.querySelectorAll('[data-f]').forEach((n) => { this.f[n.dataset.f] = n; });
    this.cards = root.querySelector('.cine-cards'); this.flashEl = root.querySelector('.cine-flash'); this.fadeEl = root.querySelector('.cine-fade'); this.exitBtn = root.querySelector('.cine-exit'); this.muteBtn = root.querySelector('.cine-mute'); this.editBtn = root.querySelector('.cine-edit');
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
    this.cards.textContent = ''; this.numbers = []; this.tags([]); this.credit(''); clearTimeout(this.cueT); if (this.f.cue) this.f.cue.classList.remove('in');
    this.fade(0, 0); this.slate(null); this.cache = {};
    if (instant) this.root.classList.remove('live'); else this.after(700, () => this.root.classList.remove('live'));
  }

  // bölüm kartı: {idx, total, title, sub, kind: 'chapter' | 'open' | 'close', hold (s)}; yeni kart eskisini söndürür
  card(c) {
    for (const old of this.cards.querySelectorAll('.cine-card:not(.out)')) this.dismiss(old);
    const k = c.kind || 'chapter', d = el('div', `cine-card ${k}${c.pos ? ' pos-' + c.pos : ''}`);     // pos: yapımcının bölüm kartı konumu (tl, tr, br, bc, c; varsayılan sol alt)
    const idx = c.idx != null ? `<span class="cc-idx">${String(c.idx).padStart(2, '0')}<i>/</i>${String(c.total).padStart(2, '0')}</span>` : '';
    // metinler kaçışlanır (yapımcının yazdıkları da buradan geçer); user/userSub/userOver: yapımcının metni, sayfa çevirmeni dokunmaz (translate="no")
    const no = (on) => (on ? ' translate="no"' : '');
    d.innerHTML = `${k === 'title' ? EMBLEM : ''}${idx}${c.over ? `<span class="cc-over"${no(c.userOver)}>${esc(c.over)}</span>` : ''}<h2 class="cc-h"${no(c.user)}>${esc(c.title)}</h2><span class="cc-rule"></span>${c.sub ? `<p class="cc-s"${no(c.userSub)}>${esc(c.sub)}</p>` : ''}${c.extra || ''}`;
    this.cards.appendChild(d);
    this.root.classList.toggle('closing', k === 'close');                          // kapanış kartı kadrajın sahibi: köşe işareti çekilir (uzun kart üstüne binmesin)
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));
    if (c.hold) this.after(c.hold * 1000, () => this.dismiss(d));
    return d;
  }
  dismiss(d) { if (!d || d.classList.contains('out')) return; d.classList.add('out'); d.classList.remove('in'); this.after(600, () => d.remove()); }

  // veri şeridi: değer değişmedikçe DOM'a dokunulmaz
  strip(v) { for (const k in v) { if (this.cache[k] !== v[k] && this.f[k]) { this.cache[k] = v[k]; this.f[k].textContent = v[k]; } } }
  progress(p) {
    const q = Math.round(Math.max(0, Math.min(1, p)) * 1000) / 1000; if (this.cache._p !== q) { this.cache._p = q; this.f.prog.style.transform = `scaleX(${q})`; }
    const L = this.tickList || []; let cur = -1; for (let i = 0; i < L.length; i++) if (L[i].p <= q + 1e-6) cur = i;
    if (cur !== this.cache._tk) { this.cache._tk = cur; [...this.f.ticks.children].forEach((n, i) => { n.classList.toggle('done', i <= cur); n.classList.toggle('cur', i === cur); }); }
  }
  // kalite rozeti (4K / HD) ve köşe işaretinin alt satırı
  quality(text) { if (this.f.q && this.f.q.textContent !== text) this.f.q.textContent = text; }
  bug(sub, title) {
    if (this.f.bugSub && sub && this.f.bugSub.textContent !== sub) this.f.bugSub.textContent = sub;
    if (this.f.bugT && title && this.f.bugT.textContent !== title) { this.f.bugT.textContent = title; this.f.bugT.setAttribute('translate', 'no'); }
  }
  // yapımcının görünüm ayarları (producer.js): kadraj (2,39:1 | 1,85:1 | tam), vurgu rengi, veri şeridi ve zaman çizelgesi; yazı (yazı tipi, boyut, kalınlık,
  // harf aralığı, büyük harf, renk, okunurluk perdesi); yerleşim (başlık/kapanış kartı, alt yazı, köşe işareti, bölüm numarası). Hepsi CSS değişkeni ya da veri özniteliği
  look(cut) {
    const r = this.root, st = r.style, ink = INKS[cut.ink] || INKS.cream;
    r.dataset.ar = cut.aspect || '239'; r.dataset.title = cut.titlePos || 'c'; r.dataset.close = cut.closePos || 'l'; r.dataset.cue = cut.cuePos || 'br'; r.dataset.bug = cut.bugPos || 'tl';
    st.setProperty('--cine-accent', ACCENTS[cut.accent] || ACCENTS.amber);
    st.setProperty('--cine-ink', ink[0]); st.setProperty('--cine-ink-2', ink[1]);
    st.setProperty('--cine-hf', (FONTS[cut.hFont] || FONTS.exo).css); st.setProperty('--cine-tf', (FONTS[cut.tFont] || FONTS.mono).css);
    st.setProperty('--cine-k', String(cut.hSize ?? 1)); st.setProperty('--cine-tk', String(cut.tSize ?? 1));
    st.setProperty('--cine-hw', String(WEIGHTS[cut.hWeight] || 600)); st.setProperty('--cine-ls', String(TRACKS[cut.track] ?? 1));
    st.setProperty('--cine-tt', cut.upper === false ? 'none' : 'uppercase'); st.setProperty('--cine-shade', String(SHADES[cut.shade] ?? 1));
    r.classList.toggle('hide-strip', cut.strip === false); r.classList.toggle('hide-timeline', cut.timeline === false); r.classList.toggle('no-num', cut.chNum === false);
  }
  // önizleme çubuğu (Yapımcı masasından açılan bölüm önizlemesi): o = { name, tau, shots, cur, onTau(τ), onShot(n), onBack() }; null: kapanır
  previewBar(o) {
    const b = this.f.pv; if (!b) return;
    if (!o) { b.hidden = true; return; }
    b.hidden = false; this.f.pvName.textContent = o.name || ''; this.f.pvName.setAttribute('translate', 'no');
    const r = this.f.pvTau; r.value = String(o.tau ?? 0.5); r.oninput = () => o.onTau(+r.value);
    const box = this.f.pvShots; box.replaceChildren();
    if (o.shots > 1) for (let n = 0; n < o.shots; n++) { const btn = el('button', n === o.cur ? 'on' : '', String(n + 1)); btn.type = 'button'; btn.setAttribute('aria-pressed', String(n === o.cur)); btn.title = `Çekim ${n + 1}`; btn.onclick = () => o.onShot(n); box.appendChild(btn); }
    this.f.pvBack.onclick = () => o.onBack();
    if (o.back) this.f.pvBack.lastChild.textContent = o.back;
    requestAnimationFrame(() => this.f.pvBack.focus());
  }
  // sahne atlama levhası (yapımcı bir bölümü çıkardı: aradaki görev süresi kararma altında hızla geçilir): üst satır başlık, alt satır görev süresi; null: kapanır
  slate(title, sub = '') {
    const n = this.f.slate; if (!n) return;
    if (!title) { n.classList.remove('in'); return; }
    if (this.f.slateT.textContent !== title) this.f.slateT.textContent = title;
    if (this.f.slateS.textContent !== sub) this.f.slateS.textContent = sub;
    n.classList.add('in');
  }
  // geniş çekimlerde cisim etiketleri: list = [{ k, name, sub, x, y }] (CSS piksel; görünmeyenler listede yok)
  tags(list) {
    const box = this.f.tags; if (!box) return; this.tagEls = this.tagEls || {};
    const seen = new Set();
    for (const t of list) {
      let n = this.tagEls[t.k]; if (!n) { n = this.tagEls[t.k] = el('div', 'cine-tag', '<i></i><b></b><span></span>'); box.appendChild(n); }
      n.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)`;
      if (n._n !== t.name) { n._n = t.name; n.children[1].textContent = t.name; } if (n._s !== t.sub) { n._s = t.sub; n.children[2].textContent = t.sub || ''; }
      n.classList.add('in'); seen.add(t.k);
    }
    for (const k in this.tagEls) if (!seen.has(k)) this.tagEls[k].classList.remove('in');
  }
  // kapanış jeneriği: rows = [[başlık, metin], …]
  credits(rows) { const b = el('div', 'cc-credits', rows.map(([k, v, user]) => `<div><span>${esc(k)}</span><p${user ? ' translate="no"' : ''}>${esc(v)}</p></div>`).join('')); return b; }
  // olay çizelgesi: list = [{ p (0..1), label }]; geçilen olaylar dolu, sıradaki vurgulu (progress günceller)
  ticks(list) {
    this.tickList = list.map((t) => (typeof t === 'number' ? { p: t, label: '' } : t));
    // birbirine çok yakın düğümlerin adları üst üste binmesin: bir öncekine ad uzunluğuna göre yer kalmıyorsa ad gizlenir (sıra ona gelince görünür)
    let lastP = -1, lastLen = 0; const W = this.root.clientWidth || 1200;
    for (const t of this.tickList) { const need = ((lastLen + (t.label || '').length) / 2 * 8.2 + 14) / (W * 0.85); t.tight = lastP >= 0 && t.p - lastP < need; if (!t.tight) { lastP = t.p; lastLen = (t.label || '').length; } }
    this.f.ticks.innerHTML = this.tickList.map((t) => `<i class="${t.tight ? 'tight' : ''}" style="left:${(t.p * 100).toFixed(2)}%">${t.label ? `<b>${t.label}</b>` : ''}</i>`).join(''); this.cache._tk = -2;
  }
  showHint(on) { this.f.hint.classList.toggle('show', on); if (on) this.after(5200, () => this.f.hint.classList.remove('show')); }

  // görüntü atfı (kalkış: Esri / Google 3B karolar): alt siyah bantta küçük satır
  credit(text) { const c = this.f.credit; if (c && c.textContent !== (text || '')) c.textContent = text || ''; }
  // ses düğmesi: sessizse "Sessiz" (üstü çizili hoparlör)
  setMuted(on) { const b = this.muteBtn; if (!b) return; setBtn(b, on ? 'mute' : 'volume', on ? 'Sessiz' : 'Ses'); b.setAttribute('aria-pressed', String(!!on)); b.setAttribute('aria-label', on ? 'Sesi aç' : 'Sesi kapat'); }
  // olay alt yazısı (kalkış anonsları, Ay'ın arkası, temas ışığı…): sağ altta kısa süre; yenisi eskisinin yerine geçer
  // user: yapımcının anlatıcı notu (sayfa çevirmeni dokunmaz)
  cue(text, ms = 3200, user = false) {
    const c = this.f.cue; if (!c) return;
    if (!text) { clearTimeout(this.cueT); c.classList.remove('in'); return; }
    if (user) c.setAttribute('translate', 'no'); else c.removeAttribute('translate');
    c.textContent = text; c.classList.remove('in'); void c.offsetWidth; c.classList.add('in');
    clearTimeout(this.cueT); this.cueT = setTimeout(() => c.classList.remove('in'), ms);
  }
  // kararma geçişi: to 0..1 (1 = siyah), ms
  fade(to, ms = 350) { this.fadeEl.style.transitionDuration = `${ms}ms`; this.fadeEl.style.opacity = String(to); }
  // ayrılma parlaması
  flash() { this.flashEl.classList.remove('go'); void this.flashEl.offsetWidth; this.flashEl.classList.add('go'); }
  set paused(on) { this.root.classList.toggle('paused', !!on); }

  // kapanış özeti: sayılar number-flow ile 0'dan değerlerine yuvarlanır (yalnız bir kez gösterilen kart: gösteri aşaması)
  async summary(rows) {
    let NF = null; if (!this.plain) { try { NF = (await import('number-flow')).default; } catch (e) { NF = null; } }     // dışa aktarımda düz metin (gölge DOM resme dökülmez)
    const box = el('div', 'cc-stats');
    const nodes = rows.map((r) => {
      const row = el('div', 'cc-stat'), val = el('span', 'cc-sv'), unit = el('span', 'cc-su', r.unit || '');
      row.appendChild(el('span', 'cc-sk', r.label)); const wrap = el('span', 'cc-sval'); wrap.appendChild(val); wrap.appendChild(unit); row.appendChild(wrap); box.appendChild(row);
      if (NF && !r.text) { const n = document.createElement('number-flow'); n.format = r.format || { maximumFractionDigits: 1 }; n.locales = LOC; n.animated = true; n.update(0); val.appendChild(n); return { n, v: r.value }; }
      val.textContent = r.text != null ? r.text : String(r.value); return null;
    });
    return { box, run: () => { for (const o of nodes) if (o) o.n.update(o.v); } };
  }
}
