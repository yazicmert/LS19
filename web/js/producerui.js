// Yapımcı masası (arayüz): izleyici fragmanın yapımcısı olur. Dört sekme:
//   · Bölümler: hızlı başlangıç, hazır kurgular, zaman şeridi (bölümler süreleriyle orantılı, tıklayınca o bölüme gider); her bölüm için aç/kapa anahtarı,
//     kamera, canlı önizleme; ayrıntıda ekrandaki yazılar (başlık, alt yazı, anlatıcı notu), kamera (hazır açılar ya da sürgülerle özel kamera + kroki),
//     zamanlama (uzunluk, geçiş, başlığın yeri), "bu bölümden oynat", "bölümü sıfırla"
//   · İsimler: fragman adı, üst yazı, yapımcı; başlık kartı önizlemesi
//   · Yazılar: yazı tipleri, boyut, kalınlık, harf aralığı, büyük harf, renk, yazı arkası gölge; başlıkların, alt yazıların ve köşe logosunun yeri; sahne maketi
//   · Görüntü ve ses: fragman hızı, ekran oranı, film efekti, renk düzeni, vurgu rengi, ekrandaki bilgiler, müzik, sesler
// Kullanım kolaylığı: geri al / yinele (Ctrl+Z, Ctrl+Y; yazı ve sürgü düzenlemeleri tek adımda birleşir), sekmelerde değişiklik sayısı, değişen bölüm işareti,
// sürgülerde varsayılana dönüş, "Kaydedildi" göstergesi; sıfırlama ve hazır kurgu seçimi uyarı satırından geri alınır.
// Her değişiklik tarayıcıda saklanır (producer.js saveCut); "Bağlantıyı kopyala" kurguyu adresin # kısmına kodlar (sunucuya gitmez).
// Kurgu mantığı ve süzgeç producer.js'tedir; bu dosya yalnız DOM kurar. Kullanıcı metni yalnız textContent/value ile yazılır (innerHTML'e girmez).
import { OPT, MAX, RANGE, ACCENTS, INKS, FONTS, WEIGHTS, TRACKS, PRESETS, DEFAULT_CUT, DEFAULT_CH, normalize, applyPreset, presetOf, saveCut, encodeCut, isDefault, loadFonts, camMove,
  History, changedCounts, chapterChanged } from './producer.js';
import { applyIcons } from './icons.js';
import { hasChannel } from './producersync.js';
import { translateText, LOC } from './i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };
const iconBtn = (cls, html, label) => { const b = el('button', cls); b.type = 'button'; b.innerHTML = html; b.setAttribute('aria-label', label); b.title = label; applyIcons(b); return b; };
let uid = 0;
const nextId = (p) => `${p}${++uid}`;
const nf = (v, d = 0) => v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
const mmss = (s) => { const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const INTRO_KEY = 'ls19.deskIntro';

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
const PRESET_TIP = { director: 'Hazırlanmış kurgu: bütün bölümler, yönetmenin kameraları', short: 'Yaklaşık bir buçuk dakika: yalnız ana anlar, gerilimli müzik', doc: 'Ağır ve açıklayıcı: uzun bölümler, sade yazılar, umutlu müzik',
  epic: 'Sinema fragmanı: Cinzel başlıklar ortada, mavi-turuncu renk, motor ve geniş çekimler', silent: 'Siyah-beyaz, yazısız ve sessiz: yalnız görüntü ve müzik' };
// kart konum seçicisinin ekrandaki noktaları (yüzde): sol/üst
const SPOT = { tl: [14, 26], tr: [86, 26], c: [50, 50], bl: [14, 74], bc: [50, 74], br: [86, 74] };
// uzaklık sürgüsü logaritmik: 0…1000 → 12…3000 m
const DL = [Math.log(RANGE.cDist[0]), Math.log(RANGE.cDist[1])];
const distToS = (d) => Math.round((Math.log(d) - DL[0]) / (DL[1] - DL[0]) * 1000);
const sToDist = (v) => Math.round(Math.exp(DL[0] + (v / 1000) * (DL[1] - DL[0])));
const azWord = (a) => { const x = Math.abs(a); return x <= 25 ? 'önden' : x <= 65 ? 'önden çapraz' : x <= 115 ? 'yandan' : x <= 155 ? 'arkadan çapraz' : 'arkadan'; };

export class ProducerDesk {
  // host: { cinema (chapterInfo, estimate), onPlay(cut), onPreview(cut, k), onChange(cut) (yerel düzenleme: canlı uygulama, eşitleme), onPopOut() (ayrı pencere),
  //         onDock(on) (yanaşık masa: sahne yeniden boyutlanır), standalone (ayrı pencerenin kendisi) }
  constructor(host) {
    this.h = host; this.cut = normalize({}); this.shared = false; this.back = null; this.tab = 'ch'; this.syncs = []; this.open_ = new Set(); this.hist = new History(); this.rows = {};
    try { this.introOn = localStorage.getItem(INTRO_KEY) !== '1'; } catch (e) { this.introOn = true; }
    const root = this.root = el('div', 'pdesk' + (host.standalone ? ' standalone' : '')); root.id = 'cineDesk'; root.hidden = true; this.docked = false;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'pdTitle');
    const box = el('div', 'pd-box'); root.append(box);
    const head = el('header', 'pd-head'), ht = el('div'), h2 = el('h2', null, 'Yapımcı masası'); h2.id = 'pdTitle';
    ht.append(h2, el('p', 'pd-lead', 'Fragmanın ipleri sende. Her değişiklik kendiliğinden kaydedilir ve geri alınabilir; görev fiziği ve olayların sırası gerçek kalır.'));
    this.live = el('span', 'pd-live', 'Canlı'); this.live.title = 'Değişiklikler oynayan fragmana anında yansır'; this.live.hidden = true;
    h2.append(' ', this.live);
    this.undoBtn = iconBtn('pd-iconbtn', '<i data-icon="undo"></i>', translateText('Geri al (Ctrl+Z)')); this.undoBtn.onclick = () => this.undo();
    this.redoBtn = iconBtn('pd-iconbtn', '<i data-icon="redo"></i>', translateText('Yinele (Ctrl+Y)')); this.redoBtn.onclick = () => this.redo();
    const pop = this.popBtn = iconBtn('pd-iconbtn pd-popbtn', '<i data-icon="external"></i>', translateText('Ayrı pencerede aç: LS19 öbür pencerede oynarken düzenle, değişiklikler anında yansır'));
    pop.onclick = () => host.onPopOut && host.onPopOut(); pop.hidden = !!host.standalone || !host.onPopOut || !hasChannel();
    const help = this.helpBtn = iconBtn('pd-iconbtn', '<i data-icon="help"></i>', translateText('Hızlı başlangıç ve ipuçları')); help.setAttribute('aria-pressed', 'false');
    help.onclick = () => { this.setIntro(!this.introOn); this.setTab('ch'); if (this.introOn) this.intro.scrollIntoView({ block: 'nearest' }); };
    const close = el('button', 'pd-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Kapat'); close.onclick = () => this.close();
    if (host.standalone) { close.setAttribute('aria-label', translateText('Pencereyi kapat')); close.onclick = () => window.close(); }
    const sep = el('i', 'pd-hsep'); sep.setAttribute('aria-hidden', 'true');
    const hb = el('div', 'pd-headbtns'); hb.append(this.undoBtn, this.redoBtn, sep, pop, help, close);
    head.append(ht, hb);
    // sekmeler (ok tuşlarıyla gezilir); rozet: o sekmede kaç şey değişti
    const tabs = el('div', 'pd-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Yapımcı masası bölümleri');
    this.panes = {}; this.tabBtns = {}; this.badges = {};
    const body = this.body = el('div', 'pd-body');
    this.banner = el('div', 'pd-banner'); this.banner.setAttribute('role', 'status'); this.banner.hidden = true;
    for (const [k, name, short] of [['ch', 'Bölümler'], ['credits', 'İsimler'], ['type', 'Yazılar'], ['look', 'Görüntü ve ses', 'Görüntü']]) {
      const b = el('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = `pdTab-${k}`; b.setAttribute('aria-controls', `pdPane-${k}`);
      const bd = this.badges[k] = el('span', 'pd-badge'); bd.hidden = true; b.append(el('span', short ? 'pd-long' : null, name), ...(short ? [el('span', 'pd-short', short)] : []), bd);   // dar ekranda kısa ad
      b.onclick = () => this.setTab(k);
      b.onkeydown = (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const ks = Object.keys(this.tabBtns), i = ks.indexOf(k), n = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]; this.setTab(n); this.tabBtns[n].focus(); };
      tabs.append(b); this.tabBtns[k] = b;
      const pane = el('section', 'pd-pane'); pane.id = `pdPane-${k}`; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', b.id); pane.tabIndex = -1;
      body.append(pane); this.panes[k] = pane;
    }
    // alt çubuk: durum, kaydedildi, sıfırla, bağlantı, oynat (geri al / yinele başlıkta)
    const foot = el('footer', 'pd-foot');
    // durum: alt çubuğun üstünde kısa süre görünen bildirim (alt çubuğu büyütmez); "Kaydedildi" alt çubukta küçük işaret
    this.toast = el('div', 'pd-toast'); this.toast.setAttribute('role', 'status'); this.toast.setAttribute('aria-live', 'polite');
    this.status = el('span', 'pd-status'); this.toast.append(this.status);
    const st = el('div', 'pd-statusbox');
    this.saved = el('span', 'pd-saved'); this.saved.innerHTML = '<i data-icon="check"></i><span>Kaydedildi</span>'; applyIcons(this.saved);
    st.append(this.saved);
    const reset = el('button', 'pd-reset'); reset.type = 'button'; reset.innerHTML = '<i data-icon="restart"></i><span>Hepsini sıfırla</span>'; reset.title = 'Yönetmenin kurgusuna dön (geri alınabilir)'; reset.onclick = () => this.reset();
    reset.setAttribute('aria-label', translateText('Hepsini sıfırla'));
    const share = el('button'); share.type = 'button'; share.innerHTML = '<i data-icon="link"></i><span>Bağlantıyı kopyala</span>'; share.title = 'Kurgunu paylaş: bağlantıyı açan fragmanı senin kurgunla izler'; share.onclick = () => this.share(); share.setAttribute('aria-label', translateText('Bağlantıyı kopyala'));
    const xp = el('button'); xp.type = 'button'; xp.innerHTML = '<i data-icon="download"></i><span>Video olarak kaydet</span>'; xp.title = 'Fragmanı 4K (ya da 1440p, 1080p) MP4 video olarak dışa aktar'; xp.setAttribute('aria-label', translateText('Video olarak kaydet'));
    xp.onclick = () => this.h.onExport && this.h.onExport(this.cut); xp.hidden = !this.h.onExport;
    const play = el('button', 'primary'); play.type = 'button'; play.innerHTML = '<i data-icon="play"></i><span>Fragmanı oynat</span>'; play.onclick = () => this.play();
    this.playBtn = play;
    this.playLabel = play.querySelector('span');
    foot.append(st, reset, share, xp, play);
    box.append(head, tabs, this.banner, body, this.toast, foot);
    document.body.append(root); applyIcons(root);
    root.addEventListener('click', (e) => { if (e.target === root && !this.docked && !host.standalone) this.close(); });
    // klavye: masa açıkken uygulama kısayolları (C, Boşluk, M…) çalışmaz; Esc kapatır; Ctrl+Z / Ctrl+Y (yazı alanında tarayıcının kendi geri alması); odak masada kalır
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!host.standalone) this.close(); return; }
      const typing = e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type === 'text'));
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
      }
      if (e.key === 'Tab' && !this.docked && !host.standalone) { const f = [...root.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null); if (f.length) { const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } }
      e.stopPropagation();
    });
    this.buildCredits(); this.buildType(); this.buildLook();
  }
  get isOpen() { return !this.root.hidden; }

  // ---------------------------------------------------------------- açma / kapama
  // cut: başlangıç kurgusu; shared: paylaşılan bağlantıdan geldi (ilk değişikliğe dek saklanmaz)
  // dock: fragman oynarken sağa yanaşık açılır (sahne solda oynar, değişiklikler canlı)
  open(cut, { shared = false, dock = false } = {}) {
    this.cut = normalize(cut); this.shared = shared; this.back = document.activeElement; this.hist.clear(); this.setDock(dock);
    this.chapters = this.h.cinema.chapterInfo();
    loadFonts([this.cut.hFont, this.cut.tFont]).then(() => this.isOpen && this.fill());
    this.buildChapters(); this.fill();
    this.show();
    this.say(shared ? 'Paylaşılan kurgu yüklendi: değiştirirsen bu tarayıcıya kaydedilir.' : '');
    this.setTab(this.tab); this.playBtn.focus();
  }
  show() { this.root.hidden = false; document.body.classList.add('pd-open'); }
  // önizlemeden dönüş: masa olduğu gibi (açık bölümler, kaydırma, geçmiş) yeniden görünür
  reopen() {
    if (!this.chapters) { this.open(this.cut); return; }
    const y = this.body.scrollTop; this.show(); this.fill(); this.body.scrollTop = y;
    const b = this.lastPreview && this.root.querySelector(`.pd-ch[data-k="${this.lastPreview}"] .pd-pv`); (b || this.playBtn).focus();
  }
  hide() { this.root.hidden = true; document.body.classList.remove('pd-open'); }
  close() {
    if (this.root.hidden) return;
    this.hide(); this.setDock(false);
    if (this.back && this.back.focus && document.contains(this.back)) this.back.focus();
  }
  play() { const c = this.cut; if (!this.h.standalone) this.close(); this.h.onPlay(c); if (this.h.standalone) this.say('Fragman LS19 penceresinde oynatılıyor.'); }
  // yanaşık kip: modal değil (arka plan, odak tuzağı yok), sağda dar sütun; host sahneyi daraltır
  setDock(on) {
    on = !!on && !this.h.standalone; if (on === this.docked) return;
    this.docked = on; this.root.classList.toggle('docked', on); this.root.setAttribute('aria-modal', String(!on && !this.h.standalone));
    document.body.classList.toggle('pd-docked', on); this.live.hidden = !on && !this.h.standalone;
    if (this.playLabel) this.playLabel.textContent = translateText(on ? 'Baştan oynat' : 'Fragmanı oynat');
    if (this.h.onDock) this.h.onDock(on);
  }
  // başka yerden gelen kurgu (ayrı pencere ya da sayfa içi masa): kaydedilmiş sayılır, geçmişe yazılmaz, yayınlanmaz
  load(cut) { this.cut = normalize(cut); this.shared = false; if (this.isOpen || this.h.standalone) this.fill(); }
  // oynayan bölüm: zaman şeridinde ve bölüm satırında işaretli (canlı ve ayrı pencerede)
  setNowPlaying(k, on = true) {
    this.now = on ? k : null;
    for (const li of this.root.querySelectorAll('.pd-ch')) li.classList.toggle('now', li.dataset.k === this.now);
    if (this.strip) for (const b of this.strip.children) b.classList.toggle('now', b.dataset.k === this.now);
  }
  // bilgi bandı (bağlantı durumu): text, düğmeler [[ad, işlev]]; boş metin gizler
  setBanner(text, buttons = [], kind = 'info') {
    const b = this.banner; b.replaceChildren(); b.hidden = !text; b.dataset.kind = kind; if (!text) return;
    b.append(el('span', null, translateText(text)));
    for (const [name, fn] of buttons) { const x = el('button', 'pd-link', name); x.type = 'button'; x.onclick = fn; b.append(' ', x); }
  }
  // bu bölümden oynat: önceki bölümler bu oynatma için kapanır (kurgu değişmez)
  playFrom(k) {
    const c = structuredClone(this.cut), ks = this.chapters.map((q) => q.k), i = ks.indexOf(k);
    ks.forEach((q, j) => { if (j < i) c.ch[q].on = false; }); c.ch[k].on = true;
    if (!this.h.standalone && !this.docked) this.close(); this.h.onPlay(normalize(c));
  }
  // bölümü canlı önizle (kapalı bölüm de önizlenir): masa gizlenir, Esc ya da "Masaya dön" geri getirir
  preview(k) {
    this.lastPreview = k; const c = structuredClone(this.cut); c.ch[k].on = true;
    if (this.h.standalone) this.say('Önizleme LS19 penceresinde: Esc ile kapanır.'); else this.hide();
    this.h.onPreview(normalize(c), k);
  }
  setTab(k) {
    this.tab = k;
    for (const [n, b] of Object.entries(this.tabBtns)) { const on = n === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); this.panes[n].hidden = !on; }
  }
  // durum satırı; undo: yanında "Geri al" düğmesi
  say(text, undo = false) {
    this.status.replaceChildren(); clearTimeout(this.toastT);
    if (!text) { this.toast.classList.remove('in'); return; }
    this.status.append(document.createTextNode(translateText(text)));
    if (undo && this.hist.canUndo) { const b = el('button', 'pd-link', 'Geri al'); b.type = 'button'; b.onclick = () => this.undo(); this.status.append(' ', b); }
    this.toast.classList.add('in'); this.toastT = setTimeout(() => this.toast.classList.remove('in'), undo ? 7000 : 4500);
  }
  setIntro(on) {
    this.introOn = on; try { localStorage.setItem(INTRO_KEY, on ? '0' : '1'); } catch (e) { /* özel pencere */ }
    if (this.intro) this.intro.hidden = !on; this.helpBtn.setAttribute('aria-pressed', String(on));
  }

  // ---------------------------------------------------------------- değişiklik, geçmiş, kayıt
  // değişiklik: süzülür, geçmişe yazılır (key: aynı alanın art arda düzenlemeleri tek adım), saklanır, görünüm tazelenir (yazı alanları yeniden kurulmaz: imleç yerinde kalır)
  update(mut, key = null) {
    const prev = JSON.stringify(this.cut), c = structuredClone(this.cut); mut(c); const next = normalize(c);
    if (JSON.stringify(next) === prev) { this.fill(); return; }
    this.hist.record(prev, key, Date.now(), Infinity); this.commit(next);            // aynı alan: alandan çıkana / sürgü bırakılana dek tek adım
  }
  // tüm kurguyu değiştir (hazır kurgu, sıfırlama): tek geri alınabilir adım
  replace(cut, msg) { const prev = JSON.stringify(this.cut); this.hist.record(prev, null); this.commit(normalize(cut)); this.say(msg, true); }
  commit(cut) {
    this.cut = cut; saveCut(this.cut); if (this.h.onChange) this.h.onChange(this.cut);
    if (this.shared) { this.shared = false; this.say('Kurgu bu tarayıcıya kaydedildi.'); }
    this.fill(); this.flashSaved();
  }
  flashSaved() { const s = this.saved; s.classList.remove('in'); void s.offsetWidth; s.classList.add('in'); clearTimeout(this.savedT); this.savedT = setTimeout(() => s.classList.remove('in'), 1600); }
  undo() { const s = this.hist.undo(JSON.stringify(this.cut)); if (s == null) return; this.restore(s); this.say('Geri alındı.'); }
  redo() { const s = this.hist.redo(JSON.stringify(this.cut)); if (s == null) return; this.restore(s); this.say('Yinelendi.'); }
  restore(s) { this.cut = normalize(JSON.parse(s)); saveCut(this.cut); if (this.h.onChange) this.h.onChange(this.cut); this.fill(); this.flashSaved(); }
  reset() { if (isDefault(this.cut)) { this.say('Zaten yönetmenin kurgusundasın.'); return; } this.replace({}, 'Yönetmenin kurgusuna dönüldü.'); }
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
  labeled(t, n, hint = '') { const w = el('div', 'pd-field'); w.append(el('span', 'pd-k', t), n); if (hint) w.append(el('small', 'pd-hint', hint)); w.sync = () => n.sync(); return w; }
  field(label, max, placeholder, get, set, multiline = false, hint = '') {
    const id = nextId('pdf'), w = el('div', 'pd-field'), l = el('label', null, label); l.htmlFor = id;
    const i = el(multiline ? 'textarea' : 'input'); i.id = id; i.maxLength = max; i.placeholder = placeholder || ''; i.spellcheck = true; i.autocomplete = 'off'; if (multiline) i.rows = 2; else i.type = 'text';
    const n = el('small', 'pd-count'); n.setAttribute('aria-hidden', 'true');
    i.oninput = () => { set(i.value); n.textContent = `${[...i.value].length}/${max}`; };
    i.onblur = () => { if (i.value !== get()) i.value = get(); this.hist.seal(); };   // süzülmüş biçim (boşluklar) ayrılınca görünür; yazma adımı biter
    w.append(l, i, n); if (hint) { const h = el('small', 'pd-hint', hint); h.id = id + 'h'; i.setAttribute('aria-describedby', h.id); w.append(h); }
    w.sync = () => { if (document.activeElement !== i) i.value = get(); n.textContent = `${[...i.value].length}/${max}`; };
    return w;
  }
  // sürgü: range = [alt, üst, adım]; fmt: değer → gösterilen metin; def: varsayılan (değişmişse ↺ düğmesi döndürür); map/unmap: sürgü ölçeği (logaritmik uzaklık); ends: uç etiketleri
  slider(label, range, get, set, fmt, { map = null, unmap = null, ends = null, def = null } = {}) {
    const id = nextId('pds'), w = el('div', 'pd-field pd-slider'), top = el('div', 'pd-sltop'), l = el('label', null, label); l.htmlFor = id;
    const r = el('input'); r.type = 'range'; r.id = id;
    if (map) { r.min = '0'; r.max = '1000'; r.step = '1'; } else { r.min = String(range[0]); r.max = String(range[1]); r.step = String(range[2]); }
    const out = el('output', 'pd-out'); out.htmlFor = id;
    const rs = iconBtn('pd-mini', '<i data-icon="restart"></i>', `${translateText(label)}: ${translateText('varsayılana dön')}`); rs.hidden = true;
    if (def != null) rs.onclick = () => set(def);
    r.oninput = () => set(unmap ? unmap(+r.value) : +r.value);
    r.onchange = () => this.hist.seal();                                         // sürgü bırakıldı: sürükleme tek adım
    r.ondblclick = () => { if (def != null) set(def); };                          // çift tıklama: varsayılan
    top.append(l, out, rs); w.append(top, r);
    if (ends) { const e = el('div', 'pd-ends'); e.setAttribute('aria-hidden', 'true'); for (const t of ends) e.append(el('span', null, t)); w.append(e); }
    w.sync = () => { const v = get(); if (document.activeElement !== r) r.value = String(map ? map(v) : v); out.textContent = fmt(v); r.setAttribute('aria-valuetext', out.textContent); rs.hidden = def == null || v === def; };
    return w;
  }
  select(label, order, labels, get, set, { tips = null, cls = '', hint = '' } = {}) {
    const id = nextId('pdl'), w = el('div', ('pd-field ' + cls).trim()), l = el('label', null, label); l.htmlFor = id;
    const s = el('select'); s.id = id;
    for (const v of order) { const o = el('option', null, labels[v]); o.value = v; if (tips && tips[v]) o.title = tips[v]; s.append(o); }
    s.onchange = () => set(s.value);
    w.append(l, s); if (hint) w.append(el('small', 'pd-hint', hint)); w.sel = s; w.sync = () => { s.value = get(); };
    return w;
  }
  check(label, get, set, tip = '') {
    const l = el('label', 'pd-check'), i = el('input'); i.type = 'checkbox'; i.onchange = () => set(i.checked);
    const t = el('span', 'pd-checkt'); t.append(el('span', null, label)); if (tip) t.append(el('small', 'pd-hint', tip));
    l.append(i, t); l.sync = () => { i.checked = get(); }; return l;
  }
  group(title, hint, ...nodes) { const g = el('fieldset', 'pd-group'); g.append(el('legend', null, title)); if (hint) g.append(el('p', 'pd-ghint', hint)); g.append(...nodes); return g; }
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
    const pane = this.panes.ch; pane.replaceChildren(); this.syncs = this.syncs.filter((f) => !f.ch); this.rows = {};
    // hızlı başlangıç: üç adım (ilk açılışta; "?" ile yeniden)
    const intro = this.intro = el('section', 'pd-intro'); intro.setAttribute('aria-label', 'Hızlı başlangıç'); intro.hidden = !this.introOn;
    const steps = el('ol', 'pd-steps');
    const step = (n, title, text, btn) => { const li = el('li'); li.append(el('b', 'pd-stepn', String(n)), el('span', 'pd-stept', title), el('small', null, text)); if (btn) li.append(btn); steps.append(li); };
    const b1 = el('button', 'pd-link', 'Hazır kurgulara git'); b1.type = 'button'; b1.onclick = () => { const p = pane.querySelector('.pd-presets button'); if (p) { p.scrollIntoView({ block: 'nearest' }); p.focus(); } };
    const b2 = el('button', 'pd-link', 'İsim yaz'); b2.type = 'button'; b2.onclick = () => { this.setTab('credits'); const i = this.panes.credits.querySelector('input'); if (i) i.focus(); };
    const b3 = el('button', 'pd-link', 'Fragmanı oynat'); b3.type = 'button'; b3.onclick = () => this.play();
    step(1, 'Bir hazır kurgu seç', 'Başlangıç noktası: sonra istediğin kadar değiştir.', b1);
    step(2, 'Fragmanına isim ver', 'Başlık kartında ve kapanışta senin adın görünür.', b2);
    step(3, 'Bölümleri düzenle', 'Bir bölümün adına dokun: yazılar, kamera ve süre açılır. Göz düğmesi o bölümü önizler.', null);
    step(4, 'Oynat ve paylaş', 'Beğenmezsen geri al (Ctrl+Z); “Bağlantıyı kopyala” ile paylaş.', b3);
    const ok = el('button', 'pd-introok', 'Anladım'); ok.type = 'button'; ok.onclick = () => { this.setIntro(false); this.playBtn.focus(); };
    const ih = el('div', 'pd-introhead'); ih.append(el('b', null, 'Hızlı başlangıç'), ok);
    intro.append(ih, steps);
    this.helpBtn.setAttribute('aria-pressed', String(this.introOn));
    // hazır kurgular
    const pre = el('div', 'pd-presets'); pre.setAttribute('role', 'group'); pre.setAttribute('aria-label', 'Hazır kurgular');
    pre.append(el('span', 'pd-k', 'Hazır kurgu'));
    this.presetBtns = Object.entries(PRESETS).map(([k, p]) => {
      const b = el('button', null, p.name); b.type = 'button'; b.dataset.k = k; b.title = PRESET_TIP[k] || '';
      b.onclick = () => { if (presetOf(this.cut) === k) return; this.replace(applyPreset(this.cut, k), `${translateText(p.name)} ${translateText('seçildi; yazdıkların korundu.')}`); loadFonts([this.cut.hFont, this.cut.tFont]).then(() => this.fill()); };
      pre.append(b); return b;
    });
    // zaman şeridi: bölümler tahmini süreleriyle orantılı; kapalı bölümler ince ve taralı; tıklayınca bölüme gider
    const tl = el('div', 'pd-timeline'), tlHead = el('div', 'pd-tlhead');
    this.est = el('span', 'pd-est'); this.est.setAttribute('aria-live', 'polite');
    tlHead.append(el('span', 'pd-k', 'Fragmanın akışı'), this.est);
    this.strip = el('div', 'pd-strip'); this.strip.setAttribute('role', 'list'); this.strip.setAttribute('aria-label', 'Bölümlerin sırası ve süreleri');
    tl.append(tlHead, this.strip);
    const note = el('p', 'pd-note', 'Sıra gerçek görev akışıdır. Kapattığın bölümün süresi ekran karartılıp hızla geçilir.');
    const list = el('ol', 'pd-list');
    for (const info of this.chapters) list.append(this.chapterRow(info));
    pane.append(intro, pre, tl, note, list);
  }
  // zaman şeridini kur (fill çağırır)
  buildStrip() {
    if (!this.strip) return;
    const E = this.h.cinema.estimate(this.cut, true), parts = (E && E.parts) || {}, total = (E && E.total) || 0;
    this.est.textContent = E ? `${translateText('Tahmini süre')} ≈ ${mmss(Math.round(total / 5) * 5)}` : '';
    this.strip.replaceChildren();
    for (const info of this.chapters) {
      const on = this.cut.ch[info.k].on, sec = parts[info.k] || 0, b = el('button', 'pd-tl-' + (on ? 'on' : 'off')); b.type = 'button'; b.setAttribute('role', 'listitem');
      b.style.flexGrow = on ? String(Math.max(sec, total * 0.035)) : '0';
      const nm = translateText(info.name); b.title = on ? `${nm} · ≈ ${mmss(sec)}` : `${nm} · ${translateText('kapalı')}`; b.setAttribute('aria-label', b.title);
      if (on) b.append(el('span', null, nm));
      b.classList.toggle('changed', chapterChanged(this.cut, info.k));
      b.dataset.k = info.k; b.classList.toggle('now', info.k === this.now);
      b.onclick = () => this.focusChapter(info.k);
      this.strip.append(b);
    }
  }
  focusChapter(k) { const r = this.rows[k]; if (!r) return; r.toggle(true); r.li.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); r.focus.focus({ preventScroll: true }); }
  chapterRow(info) {
    const k = info.k, li = el('li', 'pd-ch'), asc = k === 'asc'; li.dataset.k = k;
    const ch = () => this.cut.ch[k], set = (f, key = null) => this.update((c) => f(c.ch[k]), key && `${k}.${key}`);
    const row = el('div', 'pd-row');
    // aç/kapa anahtarı (yalnız bu: adına dokunmak bölümü kapatmaz, ayrıntıyı açar)
    const cb = el('input', 'pd-switch'); cb.type = 'checkbox'; cb.setAttribute('role', 'switch'); cb.setAttribute('aria-label', `${translateText(info.name)}: ${translateText('fragmanda')}`);
    cb.title = 'Bölüm fragmanda (kapatırsan süresi hızla geçilir)';
    cb.onchange = () => {
      const on = cb.checked, others = this.chapters.filter((c) => c.k !== k && this.cut.ch[c.k].on).length;
      if (!on && !others) { cb.checked = true; this.say('En az bir bölüm kalmalı.'); return; }
      set((c) => { c.on = on; }); if (!on) this.say(`${translateText(info.name)} ${translateText('kapatıldı.')}`, true);
    };
    const did = nextId('pdd');
    const nb = el('button', 'pd-chbtn'); nb.type = 'button'; nb.setAttribute('aria-expanded', 'false'); nb.setAttribute('aria-controls', did);
    nb.innerHTML = '<i data-icon="chev"></i>'; applyIcons(nb);
    const nm = el('span', 'pd-chname'), chg = el('span', 'pd-chg', 'değişti'); chg.hidden = true;
    const nmTop = el('span', 'pd-chtop'); nmTop.append(el('b', null, info.name), chg);
    nm.append(nmTop, el('small', 'pd-chtitle', ''));
    nb.append(el('span', 'pd-n'), nm);
    const camL = el('label', 'pd-sr', 'Kamera'), cam = el('select', 'pd-cam'); cam.id = nextId('pdc'); camL.htmlFor = cam.id;
    for (const v of OPT.cam) { const o = el('option', null, CAM_LABEL[v]); o.value = v; o.title = CAM_TIP[v]; cam.append(o); }
    if (asc) { cam.disabled = true; cam.title = translateText('Kalkışta yayın kameraları gerçek görünürlükle çalışır (rampa, yer izleme, takip uçağı, araç üstü)'); }
    const pv = iconBtn('pd-pv', '<i data-icon="eye"></i>', `${translateText('Önizle')}: ${translateText(info.name)}`);
    pv.title = translateText(asc ? 'Kalkış açılışı önizlenemez: fragmanda izle' : 'Bölümü canlı önizle (kamera, kart, yazı)');
    pv.onclick = () => this.preview(k); pv.disabled = asc || !this.h.onPreview;
    row.append(cb, nb, camL, cam, pv);
    const det = el('div', 'pd-detail'); det.id = did; det.hidden = true;
    const toggle = (on) => { det.hidden = !on; nb.setAttribute('aria-expanded', String(on)); li.classList.toggle('open', on); if (on) this.open_.add(k); else this.open_.delete(k); };
    nb.onclick = () => toggle(det.hidden);
    cam.onchange = () => { set((c) => { c.cam = cam.value; }); if (cam.value === 'custom' && det.hidden) toggle(true); };
    // 1) ekrandaki yazılar
    const fT = this.field(k === 'outro' ? 'Kapanış başlığı' : 'Başlık', MAX.chTitle, info.title, () => ch().title, (v) => set((c) => { c.title = v; }, 'title'), false, translateText('Boş bırakırsan yönetmenin başlığı kalır.'));
    const fS = this.field(k === 'outro' ? 'Kapanış sözü' : 'Alt yazı', MAX.chSub, info.live ? translateText('Canlı veriden (ör. irtifa, hız)') : info.sub, () => ch().sub, (v) => set((c) => { c.sub = v; }, 'sub'), false, info.live ? translateText('Boşsa o anki irtifa ya da hız yazar.') : '');
    const fN = this.field('Anlatıcı notu', MAX.narr, translateText('Bu bölümde ekranda görünecek ve istersen seslendirilecek söz'), () => ch().narr, (v) => set((c) => { c.narr = v; }, 'narr'), true);
    fN.classList.add('pd-wide');
    const sText = el('section', 'pd-sec'); sText.append(el('h4', null, 'Ekrandaki yazılar'));
    const tGrid = el('div', 'pd-sgrid'); tGrid.append(fT, fS, fN); sText.append(tGrid);
    // 2) kamera
    const sCam = el('section', 'pd-sec'); sCam.append(el('h4', null, 'Kamera'));
    const camDesc = el('p', 'pd-camdesc');
    const camBox = this.cameraPanel(ch, set);
    sCam.append(camDesc, camBox);
    if (asc) sCam.hidden = true;
    // 3) zamanlama ve geçiş
    const len = this.labeled('Uzunluk', this.seg('Uzunluk', ORDER.len, LEN_LABEL, () => ch().len, (v) => set((c) => { c.len = v; })));
    const trans = this.labeled('Bölüme giriş', this.seg('Bölüme giriş', OPT.trans, TRANS_LABEL, () => ch().trans, (v) => set((c) => { c.trans = v; }), { auto: 'Yönetmenin geçişi', fade: 'Siyaha kararıp açılır', cut: 'Doğrudan kesme', flash: 'Beyaz parlamayla açılır' }));
    const pos = this.select('Başlığın yeri', OPT.pos, POS_LABEL, () => ch().pos, (v) => set((c) => { c.pos = v; }), { hint: translateText('“Genel ayar”: Yazılar sekmesindeki yer.') });
    if (k === 'outro') pos.hidden = true;                                          // kapanış kartının yeri Yazılar sekmesinde
    const sTime = el('section', 'pd-sec'); sTime.append(el('h4', null, 'Zamanlama'));
    const opts = el('div', 'pd-opts'); opts.append(len, trans, pos); sTime.append(opts);
    if (asc) { len.hidden = true; trans.hidden = true; }                           // kalkış açılışı uçuş zamanına bağlı (çekim değil)
    // eylemler
    const acts = el('div', 'pd-acts');
    const pf = el('button'); pf.type = 'button'; pf.innerHTML = '<i data-icon="play"></i><span>Bu bölümden oynat</span>'; applyIcons(pf); pf.onclick = () => this.playFrom(k);
    pf.title = 'Önceki bölümler bu oynatmada atlanır (kurgun değişmez)';
    const pv2 = el('button'); pv2.type = 'button'; pv2.innerHTML = '<i data-icon="eye"></i><span>Önizle</span>'; applyIcons(pv2); pv2.onclick = () => this.preview(k); pv2.disabled = asc || !this.h.onPreview;
    const rs = el('button', 'pd-reset'); rs.type = 'button'; rs.innerHTML = '<i data-icon="restart"></i><span>Bölümü sıfırla</span>'; applyIcons(rs);
    rs.onclick = () => { this.update((c) => { c.ch[k] = { ...DEFAULT_CH }; }); this.say(`${translateText(info.name)} ${translateText('yönetmenin haline döndü.')}`, true); };
    acts.append(pf, pv2, rs);
    det.append(sText, sCam, sTime, acts);
    li.append(row, det);
    this.rows[k] = { li, toggle, focus: nb };
    if (this.open_.has(k)) toggle(true);
    const sync = () => {
      const c = ch(), changed = chapterChanged(this.cut, k); cb.checked = c.on; li.classList.toggle('off', !c.on); li.classList.toggle('now', k === this.now); cam.value = c.cam;
      nm.lastChild.textContent = c.on ? (c.title || info.title || '') : translateText('Fragmanda yok: süresi hızla geçilir');
      chg.hidden = !changed; rs.disabled = !changed;
      camDesc.textContent = `${translateText(CAM_LABEL[c.cam].replace('…', ''))}: ${translateText(CAM_TIP[c.cam])}`;
      [fT, fS, fN, len, trans, pos].forEach((f) => f.sync()); camBox.hidden = c.cam !== 'custom'; if (!camBox.hidden) camBox.sync();
    };
    sync.ch = true; this.syncs.push(sync);
    return li;
  }
  // özel kamera: yatay açı, yükseklik, uzaklık (logaritmik), görüş açısı, kaydırma, titreşim, hareket; üstten ve yandan kroki
  cameraPanel(ch, set) {
    const box = el('div', 'pd-camera'); const D = DEFAULT_CH;
    const deg = (v) => `${nf(v)}°`;
    const az = this.slider('Kamera yönü', RANGE.cAz, () => ch().cAz, (v) => set((c) => { c.cAz = v; }, 'cAz'), (v) => `${deg(v)} · ${translateText(azWord(v))}`, { ends: ['arkadan', 'önden', 'arkadan'], def: D.cAz });
    const elv = this.slider('Yükseklik', RANGE.cEl, () => ch().cEl, (v) => set((c) => { c.cEl = v; }, 'cEl'), deg, { ends: ['alttan', 'tepeden'], def: D.cEl });
    const dist = this.slider('Uzaklık', RANGE.cDist, () => ch().cDist, (v) => set((c) => { c.cDist = v; }, 'cDist'), (v) => (v >= 1000 ? `${nf(v / 1000, 2)} km` : `${nf(v)} m`), { map: distToS, unmap: sToDist, ends: ['yakın', 'uzak'], def: D.cDist });
    const fov = this.slider('Yakınlaştırma', RANGE.cFov, () => ch().cFov, (v) => set((c) => { c.cFov = v; }, 'cFov'), (v) => `${deg(v)} ${translateText('görüş açısı')}`, { ends: ['yakın çekim', 'geniş açı'], def: D.cFov });
    const yaw = this.slider('Aracı yana kaydır', RANGE.cYaw, () => ch().cYaw, (v) => set((c) => { c.cYaw = v; }, 'cYaw'), deg, { ends: ['araç sağda', 'araç solda'], def: D.cYaw });
    const shake = this.slider('El kamerası titreşimi', RANGE.cShake, () => ch().cShake, (v) => set((c) => { c.cShake = v; }, 'cShake'), (v) => `%${nf(v * 100)}`, { ends: ['tripod', 'omuzda'], def: D.cShake });
    const move = this.labeled('Hareket', this.seg('Kamera hareketi', OPT.cMove, MOVE_LABEL, () => ch().cMove, (v) => set((c) => { c.cMove = v; })));
    // kroki: üstten (yatay açı, uzaklık, hareket yayı, görüş konisi) ve yandan (yükseklik)
    const kro = el('figure', 'pd-kroki'); kro.setAttribute('aria-hidden', 'true');
    const top = svg('svg', { viewBox: '-60 -60 120 120', class: 'pk-top' }), side = svg('svg', { viewBox: '-60 -60 120 120', class: 'pk-side' });
    top.append(svg('circle', { r: 48, class: 'pk-ring' }), svg('circle', { r: 24, class: 'pk-ring' }), svg('path', { d: 'M0 -9 L5 6 L0 3 L-5 6 Z', class: 'pk-veh' }), svg('path', { d: 'M0 -14 L0 -30 M-4 -25 L0 -30 L4 -25', class: 'pk-fwd' }));
    const arc = svg('path', { class: 'pk-arc' }), camT = svg('g', { class: 'pk-cam' }); camT.append(svg('circle', { r: 5 }), svg('path', { class: 'pk-cone' }));
    top.append(arc, camT);
    const camS = svg('circle', { r: 5, class: 'pk-camdot' }), ray = svg('path', { class: 'pk-ray' });
    side.append(svg('path', { d: 'M-56 30 L56 30', class: 'pk-ground' }), svg('rect', { x: -4, y: -8, width: 8, height: 16, rx: 2, class: 'pk-veh' }), ray, camS);
    kro.append(top, side, el('figcaption', null, 'Kroki: üstten (yukarısı aracın gidiş yönü) ve yandan. Mavi nokta kamera.'));
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

  // ---------------------------------------------------------------- İsimler
  buildCredits() {
    const pane = this.panes.credits, upd = (k) => (v) => this.update((c) => { c[k] = v; }, k);
    const fT = this.field('Fragman adı', MAX.title, 'LS19', () => this.cut.title, upd('title'), false, translateText('Başlık kartında ve sol üstteki logoda görünür.'));
    const fO = this.field('Üst yazı', MAX.over, translateText('Ay görevi'), () => this.cut.over, upd('over'), false, translateText('Fragman adının üstündeki kısa satır, ör. “Okul projesi”.'));
    const fP = this.field('Yapımcı', MAX.producer, translateText('Adın ya da ekibinin adı'), () => this.cut.producer, upd('producer'), false, translateText('Başlıkta “… sunar”, kapanışta jenerikte görünür.'));
    const pv = el('figure', 'pd-preview'); pv.setAttribute('aria-label', 'Başlık kartı önizlemesi');
    const over = el('span', 'pdp-over'), title = el('b', 'pdp-title'), rule = el('i', 'pdp-rule'), sub = el('span', 'pdp-sub'); over.translate = false; title.translate = false; sub.translate = false;
    pv.append(over, title, rule, sub, el('figcaption', null, 'Başlık kartı önizlemesi (yazı tipi ve renkler Yazılar sekmesinde)'));
    const grid = el('div', 'pd-grid'); grid.append(fT, fO, fP);
    pane.append(this.group('Fragmanın isimleri', 'Hepsi isteğe bağlı; boş bırakırsan LS19 adı kullanılır.', grid), pv);
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

  // ---------------------------------------------------------------- Yazılar
  buildType() {
    const pane = this.panes.type, S = this.syncs, C = () => this.cut, D = DEFAULT_CUT;
    const upd = (k) => (v) => { this.update((c) => { c[k] = v; }, k); if (k === 'hFont' || k === 'tFont') loadFonts([v]).then(() => this.fill()); };
    const hf = this.select('Başlık yazı tipi', OPT.hFont, FONT_LABEL, () => C().hFont, upd('hFont'), { cls: 'pd-font' });
    const tf = this.select('Metin yazı tipi', OPT.tFont, FONT_LABEL, () => C().tFont, upd('tFont'), { cls: 'pd-font', hint: translateText('Alt yazılar, bilgi şeridi ve anlatıcı notları.') });
    for (const s of [hf.sel, tf.sel]) for (const o of s.options) o.style.fontFamily = FONTS[o.value].css;
    const hs = this.slider('Başlık boyutu', RANGE.hSize, () => C().hSize, upd('hSize'), (v) => `×${nf(v, 2)}`, { ends: ['küçük', 'büyük'], def: D.hSize });
    const ts = this.slider('Metin boyutu', RANGE.tSize, () => C().tSize, upd('tSize'), (v) => `×${nf(v, 2)}`, { ends: ['küçük', 'büyük'], def: D.tSize });
    const hw = this.labeled('Başlık kalınlığı', this.seg('Başlık kalınlığı', ORDER.hWeight, WEIGHT_LABEL, () => C().hWeight, upd('hWeight')));
    const tr = this.labeled('Harf aralığı', this.seg('Harf aralığı', ORDER.track, TRACK_LABEL, () => C().track, upd('track')));
    const up = this.check('Başlıklar büyük harf', () => C().upper, upd('upper'));
    const ink = this.labeled('Yazı rengi', this.swatches('Yazı rengi', OPT.ink, Object.fromEntries(OPT.ink.map((k) => [k, INKS[k][0]])), INK_LABEL, () => C().ink, upd('ink')));
    const sh = this.labeled('Yazı arkası gölge', this.seg('Yazı arkası gölge', ORDER.shade, SHADE_LABEL, () => C().shade, upd('shade')), translateText('Parlak Ay ya da Dünya önünde yazıyı okunur tutar.'));
    // yerleşim
    const spots = this.labeled('Bölüm başlıklarının yeri', this.spotPicker('Bölüm başlıklarının yeri', () => C().cardPos, upd('cardPos')), translateText('Ekranda bir noktaya dokun. Bölüm bazında da değiştirilebilir.'));
    const tp = this.labeled('Fragman adının yeri', this.seg('Fragman adının yeri', ORDER.titlePos, TITLEPOS_LABEL, () => C().titlePos, upd('titlePos')));
    const cp = this.labeled('Kapanış yazısının yeri', this.seg('Kapanış yazısının yeri', ORDER.closePos, CLOSEPOS_LABEL, () => C().closePos, upd('closePos')));
    const qp = this.labeled('Alt yazılar ve anlatıcı', this.seg('Alt yazı konumu', ORDER.cuePos, CUEPOS_LABEL, () => C().cuePos, upd('cuePos')));
    const bp = this.labeled('Köşe logosu', this.seg('Köşe logosu', ORDER.bugPos, BUGPOS_LABEL, () => C().bugPos, upd('bugPos')));
    const num = this.check('Bölüm numarası (01 / 09)', () => C().chNum, upd('chNum'));
    const hold = this.slider('Başlıkların ekranda kalma süresi', RANGE.hold, () => C().hold, upd('hold'), (v) => `×${nf(v, 1)}`, { ends: ['kısa', 'uzun'], def: D.hold });
    // canlı sahne maketi: ekran oranı, köşe logosu, bölüm başlığı (TLI bölümünün metniyle), alt yazı, bilgi şeridi — seçilen yazı tipi, renk ve yerlerle
    const fr = el('figure', 'pd-frame'); fr.setAttribute('aria-label', 'Sahne maketi');
    const scr = el('div', 'pf-screen'); scr.translate = false;
    const bug = el('div', 'pf-bug'), bugB = el('b'), bugS = el('span'), bugT = el('span', 'pf-bugt'); bugT.append(bugB, bugS); bug.append(el('i'), bugT);
    const card = el('div', 'pf-card'), idx = el('span', 'pf-idx', '04 / 09'), h = el('b', 'pf-h'), sub = el('span', 'pf-sub');
    card.append(idx, h, el('i', 'pf-rule'), sub);
    const cue = el('div', 'pf-cue'), strip = el('div', 'pf-strip');
    for (const t of ['T+0g 02:41:08', 'TLI', '312 km', '10,84 km/s']) strip.append(el('span', null, t));
    scr.append(el('i', 'pf-scrim'), el('i', 'pf-bar top'), el('i', 'pf-bar bottom'), bug, card, cue, strip);
    fr.append(scr, el('figcaption', null, 'Canlı maket: değiştirdikçe burada güncellenir.'));
    // geniş masada maket solda sabit, ayarlar sağda; dar masada maket üstte yapışkan (küçük): ayarları değiştirirken görünür kalır
    const mk = el('div', 'pd-maket'); mk.append(fr);
    const col = el('div', 'pd-typecol');
    col.append(this.group('Yazı tipi ve görünüş', '', hf, tf, hs, ts, hw, tr, ink, sh, up), this.group('Yazıların yeri', '', spots, tp, cp, qp, bp, hold, num));
    pane.classList.add('pd-typepane'); pane.append(mk, col);
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

  // ---------------------------------------------------------------- Görüntü ve ses
  buildLook() {
    const pane = this.panes.look, S = this.syncs, D = DEFAULT_CUT, upd = (k) => (v) => this.update((c) => { c[k] = v; }, k);
    const tempo = this.slider('Fragman hızı', RANGE.tempo, () => this.cut.tempo, upd('tempo'), (v) => `×${nf(v, 2)}`, { ends: ['daha kısa', 'daha uzun'], def: D.tempo });
    tempo.classList.add('pd-tempo');
    const ar = this.seg('Ekran oranı', ORDER.aspect, AR_LABEL, () => this.cut.aspect, upd('aspect'), { 239: 'Üstte ve altta siyah bantlı sinema görünümü', full: 'Bant yok, bütün ekran' });
    const film = this.seg('Film efekti', ORDER.film, FILM_LABEL, () => this.cut.film, upd('film'), { off: 'Vinyet, tane ve renk sapması kapalı', strong: 'Belirgin vinyet ve film tanesi' });
    const grade = this.seg('Renk düzeni', ORDER.grade, GRADE_LABEL, () => this.cut.grade, upd('grade'), { teal: 'Gişe filmi görünümü: gölgeler mavi, parlak alanlar turuncu', bw: 'Renksiz, kontrast yüksek', sepia: 'Eski film tonu' });
    const acc = this.swatches('Vurgu rengi', OPT.accent, ACCENTS, ACC_LABEL, () => this.cut.accent, upd('accent'));
    const mood = this.seg('Müzik', ORDER.mood, MOOD_LABEL, () => this.cut.mood, upd('mood'));
    const chk = (label, key, tip) => { const c = this.check(label, () => this.cut[key], upd(key), tip); S.push(c.sync); return c; };
    pane.append(
      this.group('Görüntü', translateText('Renk ve film efekti güçlü ekran kartında görünür; zayıf cihazda kendiliğinden kapanabilir.'), tempo, this.labeled('Ekran oranı', ar), this.labeled('Film efekti', film), this.labeled('Renk düzeni', grade), this.labeled('Vurgu rengi', acc, translateText('Çizgiler, numaralar ve işaretler.'))),
      this.group('Ekrandaki bilgiler', '', chk('Bilgi şeridi', 'strip', 'Altta görev süresi, aşama, irtifa ve hız'), chk('Zaman çizelgesi', 'timeline', 'En altta bölüm noktaları'), chk('Olay alt yazıları', 'cues', 'Gerçek olaylar: ayrılmalar, irtifa çağrıları, sinyal kaybı…'), chk('Cisim etiketleri', 'tags', 'Geniş çekimlerde Dünya, Ay ve araç adları')),
      this.group('Ses', '', this.labeled('Müzik', mood), chk('Görev kontrol anonsları', 'voice', 'Geri sayım ve görev kontrolünün sözleri'), chk('Anlatıcı notlarını seslendir', 'narrate', 'Bölümlere yazdığın notlar sesli okunur'), chk('Motor ve efekt sesleri', 'sfx', 'Motor uğultusu, ayrılma, temas ışığı, tıklar')));
    S.push(tempo.sync); for (const g of [ar, film, grade, acc, mood]) S.push(g.sync);
  }

  // ---------------------------------------------------------------- görünümü kurgudan tazele
  fill() {
    for (const f of this.syncs) f();
    const p = presetOf(this.cut);
    for (const b of this.presetBtns || []) { const on = b.dataset.k === p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    // sıra numaraları (açık bölümler), zaman şeridi, sekme rozetleri, geri al / yinele
    let n = 0; for (const li of this.panes.ch.querySelectorAll('.pd-ch')) { const on = this.cut.ch[li.dataset.k].on; li.querySelector('.pd-n').textContent = on ? String(++n).padStart(2, '0') : '—'; }
    this.buildStrip();
    const cnt = changedCounts(this.cut);
    for (const [k, b] of Object.entries(this.badges)) { const v = cnt[k] || 0; b.hidden = !v; b.textContent = String(v); b.title = `${v} ${translateText('değişiklik')}`; }
    this.undoBtn.disabled = !this.hist.canUndo; this.redoBtn.disabled = !this.hist.canRedo;
  }
}
