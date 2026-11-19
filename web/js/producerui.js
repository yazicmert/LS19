// Yapımcı masası (arayüz): izleyici fragmanın yapımcısı olur. Dört sekme:
//   · Bölümler: hazır kurgular, tahmini süre; her bölüm için aç/kapa, kamera (hazır açılar ya da sürgülerle özel kamera + kroki), canlı önizleme, başlık, alt yazı,
//     anlatıcı notu, uzunluk, geçiş, kart konumu
//   · Künye: fragman adı, üst satır, yapımcı; başlık kartı önizlemesi
//   · Yazı ve yerleşim: başlık/metin yazı tipi, boyut, kalınlık, harf aralığı, büyük harf, yazı rengi, okunurluk perdesi; bölüm kartı, başlık kartı, kapanış kartı,
//     alt yazı ve köşe işareti konumu, bölüm numarası, kart süresi; canlı sahne maketi (seçilen yazı ve konumlarla)
//   · Görünüm ve ses: tempo, kadraj, film dokusu, renk düzeni, vurgu rengi, yayın grafikleri, müzik ruhu, sesler
// Her değişiklik tarayıcıda saklanır (producer.js saveCut); "Bağlantıyı kopyala" kurguyu adresin # kısmına kodlar (sunucuya gitmez).
// Kurgu mantığı ve süzgeç producer.js'tedir; bu dosya yalnız DOM kurar. Kullanıcı metni yalnız textContent/value ile yazılır (innerHTML'e girmez).
import { OPT, MAX, RANGE, ACCENTS, INKS, FONTS, WEIGHTS, TRACKS, PRESETS, normalize, applyPreset, presetOf, saveCut, encodeCut, isDefault, loadFonts, camMove } from './producer.js';
import { applyIcons } from './icons.js';
import { translateText, LOC } from './i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };
let uid = 0;
const nextId = (p) => `${p}${++uid}`;
const nf = (v, d = 0) => v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });

const CAM_LABEL = { auto: 'Yönetmenin seçimi', close: 'Yakın plan', orbit: 'Dönen kamera', ots: 'Omuz üstü', engine: 'Motor yakın planı', wide: 'Geniş: Dünya ya da Ay', top: 'Tepeden', custom: 'Özel kamera…' };
const CAM_TIP = { auto: 'Bu bölüm için hazırlanmış çekimler (motor yakın planı, geniş açı, yer kamerası…)', close: 'Araç çevresinde yakın, ağır dönüş', orbit: 'Araç çevresinde yarım turdan fazla dönen kamera', ots: 'Dünya ya da Ay arkada: araç ön planda, cisim fonda',
  engine: 'Gövdeye bağlı, motor çıkışına bakan kamera', wide: "Dünya ya da Ay bütünüyle, Güneş'in aydınlattığı yüz; araç ışıltıyla işaretli", top: 'Aracın tam üstünden, yerel dikeyden', custom: 'Açıyı, uzaklığı, görüş açısını ve hareketi sen ayarla' };
const LEN_LABEL = { short: 'Kısa', normal: 'Normal', long: 'Uzun' };
const TRANS_LABEL = { auto: 'Yönetmen', fade: 'Kararma', cut: 'Kesme', flash: 'Parlama' };
const POS_LABEL = { auto: 'Genel ayar', bl: 'Sol alt', tl: 'Sol üst', tr: 'Sağ üst', br: 'Sağ alt', bc: 'Alt orta', c: 'Orta', none: 'Kart yok' };
const AR_LABEL = { 239: '2,39:1 sinemaskop', 185: '1,85:1 geniş', full: 'Tam ekran' };
const FILM_LABEL = { off: 'Yok', light: 'Hafif', normal: 'Normal', strong: 'Yoğun' };
const GRADE_LABEL = { natural: 'Doğal', warm: 'Sıcak', cool: 'Soğuk', teal: 'Mavi-turuncu', bw: 'Siyah-beyaz', sepia: 'Sepya' };
const ACC_LABEL = { amber: 'Kehribar', ice: 'Buz mavisi', mint: 'Nane', rose: 'Gül', white: 'Beyaz' };
const INK_LABEL = { cream: 'Krem', white: 'Beyaz', gold: 'Altın', ice: 'Buz' };
const MOOD_LABEL = { gizem: 'Gizemli', umut: 'Umutlu', gerilim: 'Gerilim', off: 'Müzik yok' };
const FONT_LABEL = { exo: 'Exo (bilim kurgu)', mono: 'Roboto Mono (veri)', cinzel: 'Cinzel (destansı)', bebas: 'Bebas Neue (afiş)', playfair: 'Playfair (zarif)', grotesk: 'Space Grotesk (çağdaş)', rajdhani: 'Rajdhani (teknik)', serif: 'Georgia (klasik)', typewriter: 'Daktilo' };
const WEIGHT_LABEL = { light: 'İnce', normal: 'Normal', bold: 'Kalın' };
const TRACK_LABEL = { tight: 'Sıkı', normal: 'Normal', wide: 'Geniş' };
const SHADE_LABEL = { off: 'Yok', light: 'Hafif', normal: 'Normal', strong: 'Güçlü' };
const TITLEPOS_LABEL = { top: 'Üst', c: 'Orta', bottom: 'Alt' };
const CLOSEPOS_LABEL = { l: 'Sol', c: 'Orta', r: 'Sağ' };
const CUEPOS_LABEL = { br: 'Sağ alt', bl: 'Sol alt', bc: 'Alt orta', tc: 'Üst orta' };
const BUGPOS_LABEL = { tl: 'Sol üst', tr: 'Sağ üst', off: 'Gizli' };
const MOVE_LABEL = { none: 'Sabit', left: 'Sola dön', right: 'Sağa dön', in: 'Yaklaş', out: 'Uzaklaş', rise: 'Yüksel', orbit: 'Tam tur' };
const ORDER = { aspect: ['239', '185', 'full'], film: ['off', 'light', 'normal', 'strong'], len: ['short', 'normal', 'long'], mood: ['gizem', 'umut', 'gerilim', 'off'], grade: ['natural', 'warm', 'cool', 'teal', 'bw', 'sepia'],
  hWeight: ['light', 'normal', 'bold'], track: ['tight', 'normal', 'wide'], shade: ['off', 'light', 'normal', 'strong'], titlePos: ['top', 'c', 'bottom'], closePos: ['l', 'c', 'r'], cuePos: ['bl', 'bc', 'br', 'tc'], bugPos: ['tl', 'tr', 'off'] };
// kart konum seçicisinin ekrandaki noktaları (yüzde): sol/üst
const SPOT = { tl: [14, 26], tr: [86, 26], c: [50, 50], bl: [14, 74], bc: [50, 74], br: [86, 74] };
// uzaklık sürgüsü logaritmik: 0…1000 → 12…3000 m
const DL = [Math.log(RANGE.cDist[0]), Math.log(RANGE.cDist[1])];
const distToS = (d) => Math.round((Math.log(d) - DL[0]) / (DL[1] - DL[0]) * 1000);
const sToDist = (v) => Math.round(Math.exp(DL[0] + (v / 1000) * (DL[1] - DL[0])));
const azWord = (a) => { const x = Math.abs(a); return x <= 25 ? 'önden' : x <= 65 ? 'önden çapraz' : x <= 115 ? 'yandan' : x <= 155 ? 'arkadan çapraz' : 'arkadan'; };

export class ProducerDesk {
  // host: { cinema, onPlay(cut), onPreview(cut, k) }
  constructor(host) {
    this.h = host; this.cut = normalize({}); this.shared = false; this.back = null; this.tab = 'ch'; this.syncs = []; this.open_ = new Set();
    const root = this.root = el('div', 'pdesk'); root.id = 'cineDesk'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'pdTitle');
    const box = el('div', 'pd-box'); root.append(box);
    const head = el('header', 'pd-head'), ht = el('div'), h2 = el('h2', null, 'Yapımcı masası'); h2.id = 'pdTitle';
    ht.append(h2, el('p', 'pd-lead', 'Fragmanın ipleri sende: hangi bölümler, hangi kamera, hangi sözler, hangi yazı ve nerede. Fizik ve olayların sırası gerçek kalır.'));
    const close = el('button', 'pd-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Kapat'); close.onclick = () => this.close();
    head.append(ht, close);
    // sekmeler (ok tuşlarıyla gezilir)
    const tabs = el('div', 'pd-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Yapımcı masası bölümleri');
    this.panes = {}; this.tabBtns = {};
    const body = this.body = el('div', 'pd-body');
    for (const [k, name] of [['ch', 'Bölümler'], ['credits', 'Künye'], ['type', 'Yazı ve yerleşim'], ['look', 'Görünüm ve ses']]) {
      const b = el('button', null, name); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = `pdTab-${k}`; b.setAttribute('aria-controls', `pdPane-${k}`);
      b.onclick = () => this.setTab(k);
      b.onkeydown = (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const ks = Object.keys(this.tabBtns), i = ks.indexOf(k), n = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]; this.setTab(n); this.tabBtns[n].focus(); };
      tabs.append(b); this.tabBtns[k] = b;
      const pane = el('section', 'pd-pane'); pane.id = `pdPane-${k}`; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', b.id); pane.tabIndex = -1;
      body.append(pane); this.panes[k] = pane;
    }
    // alt çubuk
    const foot = el('footer', 'pd-foot');
    this.status = el('span', 'pd-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    const reset = el('button', null, 'Varsayılana dön'); reset.type = 'button'; reset.onclick = () => this.reset();
    const share = el('button'); share.type = 'button'; share.innerHTML = '<i data-icon="link"></i><span>Bağlantıyı kopyala</span>'; share.onclick = () => this.share();
    const play = el('button', 'primary'); play.type = 'button'; play.innerHTML = '<i data-icon="play"></i><span>Fragmanı oynat</span>'; play.onclick = () => this.play();
    this.playBtn = play;
    foot.append(this.status, reset, share, play);
    box.append(head, tabs, body, foot);
    document.body.append(root); applyIcons(root);
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    // klavye: masa açıkken uygulama kısayolları (C, Boşluk, M…) çalışmaz; Esc kapatır; odak masada kalır
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (e.key === 'Tab') { const f = [...root.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null); if (f.length) { const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } }
      e.stopPropagation();
    });
    this.buildCredits(); this.buildType(); this.buildLook();
  }
  get isOpen() { return !this.root.hidden; }

  // ---------------------------------------------------------------- açma / kapama
  // cut: başlangıç kurgusu; shared: paylaşılan bağlantıdan geldi (ilk değişikliğe dek saklanmaz)
  open(cut, { shared = false } = {}) {
    this.cut = normalize(cut); this.shared = shared; this.back = document.activeElement;
    this.chapters = this.h.cinema.chapterInfo();
    loadFonts([this.cut.hFont, this.cut.tFont]).then(() => this.isOpen && this.fill());
    this.buildChapters(); this.fill();
    this.show();
    this.say(shared ? 'Paylaşılan kurgu yüklendi: değiştirirsen bu tarayıcıya kaydedilir.' : '');
    this.setTab(this.tab); this.playBtn.focus();
  }
  show() { this.root.hidden = false; document.body.classList.add('pd-open'); }
  // önizlemeden dönüş: masa olduğu gibi (açık bölümler, kaydırma) yeniden görünür
  reopen() {
    if (!this.chapters) { this.open(this.cut); return; }
    const y = this.body.scrollTop; this.show(); this.fill(); this.body.scrollTop = y;
    const b = this.lastPreview && this.root.querySelector(`.pd-ch[data-k="${this.lastPreview}"] .pd-pv`); (b || this.playBtn).focus();
  }
  hide() { this.root.hidden = true; document.body.classList.remove('pd-open'); }
  close() {
    if (this.root.hidden) return;
    this.hide();
    if (this.back && this.back.focus && document.contains(this.back)) this.back.focus();
  }
  play() { const c = this.cut; this.close(); this.h.onPlay(c); }
  // bölümü canlı önizle (kapalı bölüm de önizlenir): masa gizlenir, Esc ya da "Masaya dön" geri getirir
  preview(k) { this.lastPreview = k; const c = structuredClone(this.cut); c.ch[k].on = true; this.hide(); this.h.onPreview(normalize(c), k); }
  setTab(k) {
    this.tab = k;
    for (const [n, b] of Object.entries(this.tabBtns)) { const on = n === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); this.panes[n].hidden = !on; }
  }
  say(text) { this.status.textContent = text ? translateText(text) : ''; }

  // değişiklik: süzülür, saklanır, görünüm tazelenir (yazı alanları yeniden kurulmaz: imleç yerinde kalır)
  update(mut) {
    const c = structuredClone(this.cut); mut(c); this.cut = normalize(c);
    saveCut(this.cut); if (this.shared) { this.shared = false; this.say('Kurgu bu tarayıcıya kaydedildi.'); }
    this.fill();
  }
  reset() { this.cut = normalize({}); saveCut(this.cut); this.open_.clear(); this.buildChapters(); this.fill(); this.say('Yönetmenin kurgusuna dönüldü.'); }
  async share() {
    const u = new URL(location.href); u.searchParams.delete('seek'); u.searchParams.set('cine', '1');
    u.hash = isDefault(this.cut) ? '' : new URLSearchParams({ kurgu: encodeCut(this.cut) }).toString();
    const link = u.toString();
    try { await navigator.clipboard.writeText(link); this.say('Bağlantı kopyalandı: açan kişi fragmanı senin kurgunla izler.'); }
    catch (e) { window.prompt(translateText('Bağlantıyı kopyala'), link); }
  }

  // ---------------------------------------------------------------- denetimler
  // tek seçimli düğme grubu (radiogroup): ok tuşlarıyla gezilir
  seg(label, order, labels, get, set, tips = null) {
    const g = el('div', 'pd-seg'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
    const btns = order.map((v) => {
      const b = el('button', null, labels[v]); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = v; if (tips && tips[v]) b.title = tips[v];
      b.onclick = () => set(v);
      b.onkeydown = (e) => { const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return; e.preventDefault(); const i = (order.indexOf(v) + d + order.length) % order.length; set(order[i]); btns[i].focus(); };
      g.append(b); return b;
    });
    g.sync = () => { const cur = get(); for (const b of btns) { const on = b.dataset.v === cur; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); } };
    return g;
  }
  labeled(t, n) { const w = el('div', 'pd-field'); w.append(el('span', 'pd-k', t), n); w.sync = () => n.sync(); return w; }
  field(label, max, placeholder, get, set, multiline = false) {
    const id = nextId('pdf'), w = el('div', 'pd-field'), l = el('label', null, label); l.htmlFor = id;
    const i = el(multiline ? 'textarea' : 'input'); i.id = id; i.maxLength = max; i.placeholder = placeholder || ''; i.spellcheck = true; i.autocomplete = 'off'; if (multiline) i.rows = 2; else i.type = 'text';
    const n = el('small', 'pd-count'); n.setAttribute('aria-hidden', 'true');
    i.oninput = () => { set(i.value); n.textContent = `${[...i.value].length}/${max}`; };
    i.onblur = () => { if (i.value !== get()) i.value = get(); };                 // süzülmüş biçim (boşluklar) ayrılınca görünür
    w.append(l, i, n); w.sync = () => { if (document.activeElement !== i) i.value = get(); n.textContent = `${[...i.value].length}/${max}`; };
    return w;
  }
  // sürgü: range = [alt, üst, adım]; fmt: değer → gösterilen metin; map/unmap: sürgü ölçeği (logaritmik uzaklık); ends: uç etiketleri
  slider(label, range, get, set, fmt, { map = null, unmap = null, ends = null } = {}) {
    const id = nextId('pds'), w = el('div', 'pd-field pd-slider'), l = el('label', null, label); l.htmlFor = id;
    const r = el('input'); r.type = 'range'; r.id = id;
    if (map) { r.min = '0'; r.max = '1000'; r.step = '1'; } else { r.min = String(range[0]); r.max = String(range[1]); r.step = String(range[2]); }
    const out = el('output', 'pd-out'); out.htmlFor = id;
    r.oninput = () => set(unmap ? unmap(+r.value) : +r.value);
    w.append(l, r, out);
    if (ends) { const e = el('div', 'pd-ends'); e.setAttribute('aria-hidden', 'true'); for (const t of ends) e.append(el('span', null, t)); w.append(e); }
    w.sync = () => { const v = get(); if (document.activeElement !== r) r.value = String(map ? map(v) : v); out.textContent = fmt(v); r.setAttribute('aria-valuetext', out.textContent); };
    return w;
  }
  select(label, order, labels, get, set, { tips = null, cls = '' } = {}) {
    const id = nextId('pdl'), w = el('div', ('pd-field ' + cls).trim()), l = el('label', null, label); l.htmlFor = id;
    const s = el('select'); s.id = id;
    for (const v of order) { const o = el('option', null, labels[v]); o.value = v; if (tips && tips[v]) o.title = tips[v]; s.append(o); }
    s.onchange = () => set(s.value);
    w.append(l, s); w.sel = s; w.sync = () => { s.value = get(); };
    return w;
  }
  check(label, get, set, tip = '') {
    const l = el('label', 'pd-check'), i = el('input'); i.type = 'checkbox'; i.onchange = () => set(i.checked);
    l.append(i, el('span', null, label)); if (tip) l.title = tip; l.sync = () => { i.checked = get(); }; return l;
  }
  group(title, ...nodes) { const g = el('fieldset', 'pd-group'); g.append(el('legend', null, title), ...nodes); return g; }
  // renk örnekleri (radiogroup)
  swatches(label, order, colors, labels, get, set) {
    const g = this.seg(label, order, labels, get, set); g.classList.add('pd-swatches');
    for (const b of g.children) { b.style.setProperty('--sw', colors[b.dataset.v]); b.setAttribute('aria-label', translateText(labels[b.dataset.v])); b.title = labels[b.dataset.v]; b.textContent = ''; }
    return g;
  }
  // kart konumu seçicisi: küçük ekran üzerinde tıklanan noktalar (radiogroup)
  spotPicker(label, get, set) {
    const g = el('div', 'pd-spots'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
    const order = ['tl', 'tr', 'c', 'bl', 'bc', 'br'];
    const btns = order.map((v) => {
      const b = el('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = v; b.style.left = SPOT[v][0] + '%'; b.style.top = SPOT[v][1] + '%';
      b.setAttribute('aria-label', translateText(POS_LABEL[v])); b.title = POS_LABEL[v]; b.onclick = () => set(v);
      b.onkeydown = (e) => { const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return; e.preventDefault(); const i = (order.indexOf(v) + d + order.length) % order.length; set(order[i]); btns[i].focus(); };
      g.append(b); return b;
    });
    g.sync = () => { const cur = get(); for (const b of btns) { const on = b.dataset.v === cur; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); } };
    return g;
  }

  // ---------------------------------------------------------------- Bölümler
  buildChapters() {
    const pane = this.panes.ch; pane.replaceChildren(); this.syncs = this.syncs.filter((f) => !f.ch);
    const top = el('div', 'pd-top');
    const pre = el('div', 'pd-presets'); pre.setAttribute('role', 'group'); pre.setAttribute('aria-label', 'Hazır kurgular');
    pre.append(el('span', 'pd-k', 'Hazır kurgu'));
    this.presetBtns = Object.entries(PRESETS).map(([k, p]) => {
      const b = el('button', null, p.name); b.type = 'button'; b.dataset.k = k;
      b.onclick = () => { this.cut = applyPreset(this.cut, k); saveCut(this.cut); this.shared = false; loadFonts([this.cut.hFont, this.cut.tFont]).then(() => this.fill()); this.fill(); this.say(`${translateText(p.name)} ${translateText('seçildi; metinlerin korundu.')}`); };
      pre.append(b); return b;
    });
    this.est = el('span', 'pd-est'); this.est.setAttribute('aria-live', 'polite');
    top.append(pre, this.est);
    const note = el('p', 'pd-note', 'Kapattığın bölümün görev süresi kararma altında hızla geçilir; sıra gerçek görev akışıdır, değiştirilemez. Göz düğmesi bölümü o anki ayarlarınla canlı önizler.');
    const list = el('ol', 'pd-list');
    for (const info of this.chapters) list.append(this.chapterRow(info));
    pane.append(top, note, list);
  }
  chapterRow(info) {
    const k = info.k, li = el('li', 'pd-ch'), asc = k === 'asc'; li.dataset.k = k;
    const ch = () => this.cut.ch[k], set = (f) => this.update((c) => f(c.ch[k]));
    const row = el('div', 'pd-row');
    const sw = el('label', 'pd-sw'), cb = el('input'); cb.type = 'checkbox';
    cb.onchange = () => {
      const on = cb.checked, others = this.chapters.filter((c) => c.k !== k && this.cut.ch[c.k].on).length;
      if (!on && !others) { cb.checked = true; this.say('En az bir bölüm kalmalı.'); return; }
      set((c) => { c.on = on; });
    };
    const nm = el('span', 'pd-chname'); nm.append(el('b', null, info.name), el('small', 'pd-chtitle', ''));
    sw.append(cb, el('span', 'pd-n'), nm);
    const camL = el('label', 'pd-sr', 'Kamera'), cam = el('select', 'pd-cam'); cam.id = nextId('pdc'); camL.htmlFor = cam.id;
    for (const v of OPT.cam) { const o = el('option', null, CAM_LABEL[v]); o.value = v; o.title = CAM_TIP[v]; cam.append(o); }
    if (asc) { cam.disabled = true; cam.title = translateText('Kalkışta yayın kameraları gerçek görünürlükle çalışır (rampa, yer izleme, takip uçağı, araç üstü)'); }
    const pv = el('button', 'pd-pv'); pv.type = 'button'; pv.innerHTML = '<i data-icon="eye"></i>'; applyIcons(pv);
    pv.setAttribute('aria-label', `${translateText('Önizle')}: ${translateText(info.name)}`); pv.title = asc ? 'Kalkış açılışı önizlenemez: fragmanda izle' : 'Bölümü canlı önizle (kamera, kart, yazı)';
    pv.onclick = () => this.preview(k); pv.disabled = asc || !this.h.onPreview;
    const more = el('button', 'pd-more'); more.type = 'button'; const did = nextId('pdd'); more.setAttribute('aria-controls', did); more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<span>Ayrıntı</span><i data-icon="chev"></i>'; applyIcons(more);
    row.append(sw, camL, cam, pv, more);
    const det = el('div', 'pd-detail'); det.id = did; det.hidden = true;
    const toggle = (on) => { det.hidden = !on; more.setAttribute('aria-expanded', String(on)); li.classList.toggle('open', on); if (on) this.open_.add(k); else this.open_.delete(k); };
    more.onclick = () => toggle(det.hidden);
    cam.onchange = () => { set((c) => { c.cam = cam.value; }); if (cam.value === 'custom' && det.hidden) toggle(true); };
    // metinler
    const fT = this.field(k === 'outro' ? 'Kapanış başlığı' : 'Başlık', MAX.chTitle, info.title, () => ch().title, (v) => set((c) => { c.title = v; }));
    const fS = this.field(k === 'outro' ? 'Kapanış sözü' : 'Alt yazı', MAX.chSub, info.live ? translateText('Canlı veriden (ör. irtifa, hız)') : info.sub, () => ch().sub, (v) => set((c) => { c.sub = v; }));
    const fN = this.field('Anlatıcı notu', MAX.narr, translateText('Bu bölümde ekranda görünecek ve istersen seslendirilecek söz'), () => ch().narr, (v) => set((c) => { c.narr = v; }), true);
    fN.classList.add('pd-wide');
    // süre, geçiş, kart konumu
    const len = this.labeled('Uzunluk', this.seg('Uzunluk', ORDER.len, LEN_LABEL, () => ch().len, (v) => set((c) => { c.len = v; })));
    const trans = this.labeled('Geçiş', this.seg('Geçiş', OPT.trans, TRANS_LABEL, () => ch().trans, (v) => set((c) => { c.trans = v; }), { auto: 'Yönetmenin geçişi', fade: 'Siyaha kararıp açılır', cut: 'Doğrudan kesme', flash: 'Beyaz parlamayla açılır' }));
    const pos = this.select('Kart konumu', OPT.pos, POS_LABEL, () => ch().pos, (v) => set((c) => { c.pos = v; }));
    if (k === 'outro') pos.hidden = true;                                          // kapanış kartının yeri Yazı ve yerleşim sekmesinde
    if (asc) { len.hidden = true; trans.hidden = true; }                           // kalkış açılışı uçuş zamanına bağlı (çekim değil)
    const opts = el('div', 'pd-opts pd-wide'); opts.append(len, trans, pos);
    // özel kamera
    const camBox = this.cameraPanel(ch, set);
    det.append(fT, fS, fN, opts, camBox);
    li.append(row, det);
    if (this.open_.has(k)) toggle(true);
    const sync = () => {
      const c = ch(); cb.checked = c.on; li.classList.toggle('off', !c.on); cam.value = c.cam;
      nm.lastChild.textContent = c.title || info.title || '';
      [fT, fS, fN, len, trans, pos].forEach((f) => f.sync()); camBox.hidden = c.cam !== 'custom'; if (!camBox.hidden) camBox.sync();
      more.classList.toggle('dot', !!(c.title || c.sub || c.narr || c.len !== 'normal' || c.trans !== 'auto' || c.pos !== 'auto'));
    };
    sync.ch = true; this.syncs.push(sync);
    return li;
  }
  // özel kamera: yatay açı, yükseklik, uzaklık (logaritmik), görüş açısı, kadraj kaydırma, titreşim, hareket; üstten ve yandan kroki
  cameraPanel(ch, set) {
    const box = el('fieldset', 'pd-group pd-camera pd-wide'); box.append(el('legend', null, 'Özel kamera'));
    const deg = (v) => `${nf(v)}°`;
    const az = this.slider('Yatay açı', RANGE.cAz, () => ch().cAz, (v) => set((c) => { c.cAz = v; }), (v) => `${deg(v)} · ${translateText(azWord(v))}`, { ends: ['arkadan', 'önden', 'arkadan'] });
    const elv = this.slider('Yükseklik', RANGE.cEl, () => ch().cEl, (v) => set((c) => { c.cEl = v; }), deg, { ends: ['alttan', 'tepeden'] });
    const dist = this.slider('Uzaklık', RANGE.cDist, () => ch().cDist, (v) => set((c) => { c.cDist = v; }), (v) => (v >= 1000 ? `${nf(v / 1000, 2)} km` : `${nf(v)} m`), { map: distToS, unmap: sToDist, ends: ['yakın', 'uzak'] });
    const fov = this.slider('Görüş açısı', RANGE.cFov, () => ch().cFov, (v) => set((c) => { c.cFov = v; }), deg, { ends: ['tele', 'geniş açı'] });
    const yaw = this.slider('Kadraj kaydırma', RANGE.cYaw, () => ch().cYaw, (v) => set((c) => { c.cYaw = v; }), deg, { ends: ['araç sağda', 'araç solda'] });
    const shake = this.slider('El kamerası titreşimi', RANGE.cShake, () => ch().cShake, (v) => set((c) => { c.cShake = v; }), (v) => `%${nf(v * 100)}`, { ends: ['tripod', 'omuzda'] });
    const move = this.labeled('Hareket', this.seg('Kamera hareketi', OPT.cMove, MOVE_LABEL, () => ch().cMove, (v) => set((c) => { c.cMove = v; })));
    // kroki: üstten (yatay açı, uzaklık, hareket yayı, görüş konisi) ve yandan (yükseklik)
    const kro = el('figure', 'pd-kroki'); kro.setAttribute('aria-hidden', 'true');
    const top = svg('svg', { viewBox: '-60 -60 120 120', class: 'pk-top' }), side = svg('svg', { viewBox: '-60 -60 120 120', class: 'pk-side' });
    top.append(svg('circle', { r: 48, class: 'pk-ring' }), svg('circle', { r: 24, class: 'pk-ring' }), svg('path', { d: 'M0 -9 L5 6 L0 3 L-5 6 Z', class: 'pk-veh' }), svg('path', { d: 'M0 -14 L0 -30 M-4 -25 L0 -30 L4 -25', class: 'pk-fwd' }));
    const arc = svg('path', { class: 'pk-arc' }), camT = svg('g', { class: 'pk-cam' }); camT.append(svg('circle', { r: 5 }), svg('path', { class: 'pk-cone' }));
    top.append(arc, camT);
    const camS = svg('circle', { r: 5, class: 'pk-camdot' }), ray = svg('path', { class: 'pk-ray' });
    side.append(svg('path', { d: 'M-56 30 L56 30', class: 'pk-ground' }), svg('rect', { x: -4, y: -8, width: 8, height: 16, rx: 2, class: 'pk-veh' }), ray, camS);
    kro.append(top, side, el('figcaption', null, 'Kroki: üstten (yukarısı aracın gidiş yönü) ve yandan'));
    const sliders = el('div', 'pd-camgrid'); sliders.append(az, elv, dist, fov, yaw, shake);
    box.append(sliders, move, kro);
    const rr = (d) => 14 + (Math.log(d) - DL[0]) / (DL[1] - DL[0]) * 34;        // uzaklık → kroki yarıçapı (logaritmik)
    const P = (a, r) => [Math.sin(a * Math.PI / 180) * r, -Math.cos(a * Math.PI / 180) * r];   // 0° yukarıda (önden), saat yönünde artar
    const f1 = (v) => v.toFixed(1);
    box.sync = () => {
      [az, elv, dist, fov, yaw, shake, move].forEach((f) => f.sync());
      const c = ch(), m = camMove(c), r0 = rr(m.dist[0]), r1 = rr(m.dist[1]), [x0, y0] = P(m.az[0], r0), [x1, y1] = P(m.az[1], r1);
      camT.setAttribute('transform', `translate(${f1(x0)} ${f1(y0)})`);
      const look = Math.atan2(-y0, -x0), h = c.cFov * Math.PI / 360, L = 16;
      camT.lastChild.setAttribute('d', `M0 0 L${f1(Math.cos(look - h) * L)} ${f1(Math.sin(look - h) * L)} M0 0 L${f1(Math.cos(look + h) * L)} ${f1(Math.sin(look + h) * L)}`);
      let d = '';                                                                  // hareket yayı: başlangıçtan bitişe (tam tur: çember)
      if (c.cMove === 'orbit') d = `M${f1(x0)} ${f1(y0)} A${f1(r0)} ${f1(r0)} 0 1 1 ${(x0 - 0.01).toFixed(2)} ${f1(y0)}`;
      else if (c.cMove === 'left' || c.cMove === 'right') d = `M${f1(x0)} ${f1(y0)} A${f1(r0)} ${f1(r0)} 0 0 ${c.cMove === 'right' ? 1 : 0} ${f1(x1)} ${f1(y1)}`;
      else if (c.cMove === 'in' || c.cMove === 'out') d = `M${f1(x0)} ${f1(y0)} L${f1(x1)} ${f1(y1)}`;
      arc.setAttribute('d', d);
      const e0 = m.el[0] * Math.PI / 180, e1 = m.el[1] * Math.PI / 180, sr = rr(c.cDist), cx = -Math.cos(e0) * sr, cy = -Math.sin(e0) * sr;
      camS.setAttribute('cx', f1(cx)); camS.setAttribute('cy', f1(cy));
      ray.setAttribute('d', `M${f1(cx)} ${f1(cy)} L0 0${c.cMove === 'rise' ? ` M${f1(cx)} ${f1(cy)} A${f1(sr)} ${f1(sr)} 0 0 1 ${f1(-Math.cos(e1) * sr)} ${f1(-Math.sin(e1) * sr)}` : ''}`);
    };
    return box;
  }

  // ---------------------------------------------------------------- Künye
  buildCredits() {
    const pane = this.panes.credits;
    const fT = this.field('Fragman adı', MAX.title, 'LS19', () => this.cut.title, (v) => this.update((c) => { c.title = v; }));
    const fO = this.field('Üst satır', MAX.over, translateText('Ay görevi'), () => this.cut.over, (v) => this.update((c) => { c.over = v; }));
    const fP = this.field('Yapımcı', MAX.producer, translateText('Adın ya da ekibinin adı'), () => this.cut.producer, (v) => this.update((c) => { c.producer = v; }));
    const note = el('p', 'pd-note', 'Fragman adı başlık kartında ve köşe işaretinde, yapımcı başlık kartında “… sunar” olarak ve kapanış jeneriğinde görünür. Yazı tipi ve konumlar “Yazı ve yerleşim” sekmesinde.');
    const pv = el('figure', 'pd-preview'); pv.setAttribute('aria-label', 'Başlık kartı önizlemesi');
    const over = el('span', 'pdp-over'), title = el('b', 'pdp-title'), rule = el('i', 'pdp-rule'), sub = el('span', 'pdp-sub'); over.translate = false; title.translate = false; sub.translate = false;
    pv.append(over, title, rule, sub, el('figcaption', null, 'Başlık kartı önizlemesi'));
    const grid = el('div', 'pd-grid'); grid.append(fT, fO, fP);
    pane.append(grid, note, pv);
    this.syncs.push(() => {
      [fT, fO, fP].forEach((f) => f.sync()); const c = this.cut;
      over.textContent = c.producer ? `${c.producer} ${translateText('sunar')}` : c.over || translateText('Ay görevi'); title.textContent = c.title || 'LS19';
      sub.textContent = c.producer && c.over ? c.over : translateText('Kalkış tarihi · roket · rampa');
      this.typeVars(pv);
    });
  }
  // yazı ve renk değişkenleri (masadaki önizlemeler, sinematik bindirmeyle aynı değerler)
  typeVars(n) {
    const c = this.cut, st = n.style, ink = INKS[c.ink] || INKS.cream;
    st.setProperty('--pd-acc', ACCENTS[c.accent]); st.setProperty('--pd-ink', ink[0]); st.setProperty('--pd-ink2', ink[1]);
    st.setProperty('--pd-hf', FONTS[c.hFont].css); st.setProperty('--pd-tf', FONTS[c.tFont].css); st.setProperty('--pd-hw', String(WEIGHTS[c.hWeight]));
    st.setProperty('--pd-k', String(c.hSize)); st.setProperty('--pd-tk', String(c.tSize)); st.setProperty('--pd-ls', String(TRACKS[c.track])); st.setProperty('--pd-tt', c.upper ? 'uppercase' : 'none');
  }

  // ---------------------------------------------------------------- Yazı ve yerleşim
  buildType() {
    const pane = this.panes.type, S = this.syncs, C = () => this.cut;
    const upd = (k) => (v) => { this.update((c) => { c[k] = v; }); if (k === 'hFont' || k === 'tFont') loadFonts([v]).then(() => this.fill()); };
    const hf = this.select('Başlık yazı tipi', OPT.hFont, FONT_LABEL, () => C().hFont, upd('hFont'), { cls: 'pd-font' });
    const tf = this.select('Metin yazı tipi', OPT.tFont, FONT_LABEL, () => C().tFont, upd('tFont'), { cls: 'pd-font' });
    for (const s of [hf.sel, tf.sel]) for (const o of s.options) o.style.fontFamily = FONTS[o.value].css;
    const hs = this.slider('Başlık boyutu', RANGE.hSize, () => C().hSize, upd('hSize'), (v) => `×${nf(v, 2)}`, { ends: ['küçük', 'büyük'] });
    const ts = this.slider('Metin boyutu', RANGE.tSize, () => C().tSize, upd('tSize'), (v) => `×${nf(v, 2)}`, { ends: ['küçük', 'büyük'] });
    const hw = this.labeled('Başlık kalınlığı', this.seg('Başlık kalınlığı', ORDER.hWeight, WEIGHT_LABEL, () => C().hWeight, upd('hWeight')));
    const tr = this.labeled('Harf aralığı', this.seg('Harf aralığı', ORDER.track, TRACK_LABEL, () => C().track, upd('track')));
    const up = this.check('Başlıklar büyük harf', () => C().upper, upd('upper'), 'Bölüm ve başlık kartları büyük harfle');
    const ink = this.labeled('Yazı rengi', this.swatches('Yazı rengi', OPT.ink, Object.fromEntries(OPT.ink.map((k) => [k, INKS[k][0]])), INK_LABEL, () => C().ink, upd('ink')));
    const sh = this.labeled('Okunurluk perdesi', this.seg('Okunurluk perdesi', ORDER.shade, SHADE_LABEL, () => C().shade, upd('shade'), { off: 'Yazıların arkasında karartma yok', strong: 'Parlak sahnelerde koyu karartma' }));
    // yerleşim
    const spots = this.labeled('Bölüm kartları', this.spotPicker('Bölüm kartı konumu', () => C().cardPos, upd('cardPos')));
    const tp = this.labeled('Başlık kartı', this.seg('Başlık kartı konumu', ORDER.titlePos, TITLEPOS_LABEL, () => C().titlePos, upd('titlePos')));
    const cp = this.labeled('Kapanış kartı', this.seg('Kapanış kartı konumu', ORDER.closePos, CLOSEPOS_LABEL, () => C().closePos, upd('closePos')));
    const qp = this.labeled('Alt yazılar ve anlatıcı', this.seg('Alt yazı konumu', ORDER.cuePos, CUEPOS_LABEL, () => C().cuePos, upd('cuePos')));
    const bp = this.labeled('Köşe işareti', this.seg('Köşe işareti konumu', ORDER.bugPos, BUGPOS_LABEL, () => C().bugPos, upd('bugPos')));
    const num = this.check('Bölüm numarası (01 / 09)', () => C().chNum, upd('chNum'));
    const hold = this.slider('Kart süresi', RANGE.hold, () => C().hold, upd('hold'), (v) => `×${nf(v, 1)}`, { ends: ['kısa', 'uzun'] });
    // canlı sahne maketi: kadraj, köşe işareti, bölüm kartı (TLI bölümünün metniyle), alt yazı, veri şeridi — seçilen yazı tipi, renk ve konumlarla
    const fr = el('figure', 'pd-frame'); fr.setAttribute('aria-label', 'Sahne maketi');
    const scr = el('div', 'pf-screen'); scr.translate = false;
    const bug = el('div', 'pf-bug'), bugB = el('b'), bugS = el('span'), bugT = el('span', 'pf-bugt'); bugT.append(bugB, bugS); bug.append(el('i'), bugT);
    const card = el('div', 'pf-card'), idx = el('span', 'pf-idx', '04 / 09'), h = el('b', 'pf-h'), sub = el('span', 'pf-sub');
    card.append(idx, h, el('i', 'pf-rule'), sub);
    const cue = el('div', 'pf-cue'), strip = el('div', 'pf-strip');
    for (const t of ['T+0g 02:41:08', 'TLI', '312 km', '10,84 km/s']) strip.append(el('span', null, t));
    scr.append(el('i', 'pf-scrim'), el('i', 'pf-bar top'), el('i', 'pf-bar bottom'), bug, card, cue, strip);
    fr.append(scr, el('figcaption', null, 'Sahne maketi: yazıların yeri ve görünüşü (kamera görüntüsü yerine koyu fon)'));
    pane.append(
      this.group('Yazı', hf, tf, hs, ts, hw, tr, ink, sh, up),
      fr,
      this.group('Yerleşim', spots, tp, cp, qp, bp, hold, num));
    for (const f of [hf, tf, hs, ts, hw, tr, up, ink, sh, spots, tp, cp, qp, bp, num, hold]) S.push(f.sync);
    S.push(() => {
      const c = this.cut, tli = c.ch.tli; this.typeVars(scr);
      scr.dataset.ar = c.aspect; scr.dataset.cue = c.cuePos; scr.dataset.bug = c.bugPos; scr.dataset.shade = c.shade;
      card.className = 'pf-card pos-' + (tli.pos !== 'auto' && tli.pos !== 'none' ? tli.pos : c.cardPos); idx.hidden = !c.chNum;
      bugB.textContent = c.title || 'LS19'; bugS.textContent = c.over || translateText('Ay görevi');
      h.textContent = tli.title || translateText("AY'A TRANSFER YAKIŞI"); sub.textContent = tli.sub || translateText("TLI · 7,79 km/s'den hızlanıyor");
      cue.textContent = tli.narr || translateText('Alt yazılar burada: olaylar ve anlatıcı notların');
    });
  }

  // ---------------------------------------------------------------- Görünüm ve ses
  buildLook() {
    const pane = this.panes.look, S = this.syncs;
    const tempo = this.slider('Tempo', RANGE.tempo, () => this.cut.tempo, (v) => this.update((c) => { c.tempo = v; }), (v) => `×${nf(v, 2)}`, { ends: ['Hızlı', 'Ağır'] });
    tempo.classList.add('pd-tempo');
    const ar = this.seg('Kadraj', ORDER.aspect, AR_LABEL, () => this.cut.aspect, (v) => this.update((c) => { c.aspect = v; }));
    const film = this.seg('Film dokusu', ORDER.film, FILM_LABEL, () => this.cut.film, (v) => this.update((c) => { c.film = v; }), { off: 'Vinyet, tane ve renk sapması kapalı', strong: 'Belirgin vinyet ve film tanesi' });
    const grade = this.seg('Renk düzeni', ORDER.grade, GRADE_LABEL, () => this.cut.grade, (v) => this.update((c) => { c.grade = v; }), { teal: 'Gişe filmi görünümü: gölgeler mavi, parlak alanlar turuncu', bw: 'Renksiz, kontrast yüksek', sepia: 'Eski film tonu' });
    const acc = this.swatches('Vurgu rengi', OPT.accent, ACCENTS, ACC_LABEL, () => this.cut.accent, (v) => this.update((c) => { c.accent = v; }));
    const mood = this.seg('Müzik', ORDER.mood, MOOD_LABEL, () => this.cut.mood, (v) => this.update((c) => { c.mood = v; }));
    const chk = (label, key, tip) => { const c = this.check(label, () => this.cut[key], (v) => this.update((q) => { q[key] = v; }), tip); S.push(c.sync); return c; };
    pane.append(
      this.group('Görüntü', tempo, this.labeled('Kadraj', ar), this.labeled('Film dokusu', film), this.labeled('Renk düzeni', grade), this.labeled('Vurgu rengi', acc)),
      this.group('Yayın grafikleri', chk('Veri şeridi', 'strip', 'Görev süresi, aşama, irtifa ve hız'), chk('Zaman çizelgesi', 'timeline', 'Alttaki olay çizelgesi'), chk('Olay alt yazıları', 'cues', 'Gerçek görev olayları: ayrılmalar, irtifa çağrıları, sinyal kaybı…'), chk('Cisim etiketleri', 'tags', 'Geniş çekimlerde Dünya, Ay ve araç adları')),
      this.group('Ses', this.labeled('Müzik', mood), chk('Görev kontrol anonsları', 'voice', 'Geri sayım ve görev kontrolünün sözleri (konuşma sentezi)'), chk('Anlatıcı notlarını seslendir', 'narrate', 'Bölümlere yazdığın notlar konuşma sentezi ile okunur'), chk('Motor ve efekt sesleri', 'sfx', 'Motor uğultusu, ayrılma, temas ışığı, geri sayım tıkı')));
    S.push(tempo.sync); for (const g of [ar, film, grade, acc, mood]) S.push(g.sync);
  }

  // ---------------------------------------------------------------- görünümü kurgudan tazele
  fill() {
    for (const f of this.syncs) f();
    const p = presetOf(this.cut);
    for (const b of this.presetBtns || []) { const on = b.dataset.k === p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    // sıra numaraları (açık bölümler) ve tahmini süre
    let n = 0; for (const li of this.panes.ch.querySelectorAll('.pd-ch')) { const on = this.cut.ch[li.dataset.k].on; li.querySelector('.pd-n').textContent = on ? String(++n).padStart(2, '0') : '—'; }
    const sec = this.h.cinema.estimate(this.cut);
    if (this.est) { const r = Math.round((sec || 0) / 5) * 5; this.est.textContent = sec != null ? `${translateText('Tahmini süre')} ≈ ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}` : ''; }
  }
}
