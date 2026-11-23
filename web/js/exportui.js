// Video dışa aktarım paneli (exporter.js): seçenekler (çözünürlük, kare hızı, kalite, ses), olanak denetimi (kodlayıcı, ekran kartı, yazı katmanı, diske yazma),
// tahmini süre ve dosya boyu; dışa aktarım sürerken altta ince ilerleme çubuğu (sahne üstte küçültülmüş görünür), İptal; bitince indirme / kaydedildi.
// Seçimler tarayıcıda hatırlanır ('ls19.export'). Metinler textContent ile yazılır.
import { applyIcons } from './icons.js';
import { translateText, LOC } from './i18n.js';
import { destekKarti, destekBaglantisi } from './destek.js';
import { uydum, uydumUretildi, uydumArsivle, uydumPaylasilan } from './usersat.js';
import { normalize, encodeCut } from './producer.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const KEY = 'ls19.export';
const mmss = (s) => { const r = Math.max(0, Math.round(s)); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toLocaleString(LOC, { maximumFractionDigits: 1 })} GB` : `${Math.max(1, Math.round(b / 1e6)).toLocaleString(LOC)} MB`);
const ERR = {
  codec: 'Bu tarayıcı bu çözünürlükte video kodlayamıyor. Daha düşük bir çözünürlük seç ya da Chrome veya Edge kullan.',
  gpu: 'Ekran kartın bu çözünürlükte çizemiyor. Daha düşük bir çözünürlük seç.',
  start: 'Fragman başlatılamadı: görev henüz hazır değil. Biraz bekleyip yeniden dene.',
  worker: 'Fizik hesabı yanıt vermedi. Sayfayı yenileyip yeniden dene.',
  size: 'Çizim boyu ayarlanamadı. Pencereyi büyütüp yeniden dene.',
  busy: 'Zaten bir dışa aktarım sürüyor.',
};

export class ExportPanel {
  // o: { exporter, EX (exporter modülü), planned(), estimate(cut) → s }
  constructor(o) {
    this.o = o; this.cut = null; this.url = null;
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    this.opt = { bicim: saved.bicim === 'dikey' ? 'dikey' : 'yatay', res: ['2160', '1440', '1080'].includes(String(saved.res)) ? String(saved.res) : '2160', fps: o.EX.FPS.includes(saved.fps) ? saved.fps : 30, quality: ['std', 'high', 'max'].includes(saved.quality) ? saved.quality : 'high', audio: saved.audio !== false };
    const root = this.root = el('div', 'xpanel'); root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'xpTitle');
    const box = this.box = el('div', 'xp-box'); root.append(box);
    // ekran okuyucu: kare kare değişen ilerleme metni sessiz; yalnız evre değişimleri ve sonuç duyurulur
    this.sr = el('div', 'sr-only'); this.sr.setAttribute('role', 'status'); this.sr.setAttribute('aria-live', 'polite'); root.append(this.sr);
    document.body.append(root);
    root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && !this.running) this.close(); });
  }
  // etkin çözünürlük: dikeyde 1080 × 1920 (exporter.js RES.dikey), yatayda seçilen
  res() { return this.opt.bicim === 'dikey' ? 'dikey' : this.opt.res; }
  say(t) { this.sr.textContent = t ? translateText(t) : ''; }   // sanal saat rAF/setTimeout'u tutabilir: doğrudan yaz
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.opt)); } catch (e) { /* özel pencere */ } }
  open(cut) { this.cut = cut; this.root.hidden = false; this.root.classList.remove('running'); this.viewOptions(); }
  close() { if (this.running) return; this.root.hidden = true; if (this.url) { URL.revokeObjectURL(this.url); this.url = null; } }
  head(title, sub) {
    const h = el('header', 'xp-head'), t = el('div'), h2 = el('h2', null, title); h2.id = 'xpTitle'; t.append(h2); if (sub) t.append(el('p', 'xp-sub', sub));
    const x = el('button', 'pd-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Kapat'); x.onclick = () => this.close(); x.hidden = !!this.running;
    h.append(t, x); return h;
  }
  seg(label, items, get, set) {
    const w = el('div', 'pd-field'), g = el('div', 'pd-seg'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
    const btns = items.map(([v, name, tip]) => { const b = el('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = String(v); b.append(el('span', null, name)); if (tip) b.append(el('small', 'xp-tip', tip)); b.onclick = () => { set(v); sync(); }; g.append(b); return b; });
    const sync = () => { for (const b of btns) { const on = b.dataset.v === String(get()); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; } };
    sync(); w.append(el('span', 'pd-k', label), g); return w;
  }

  // ---------------------------------------------------------------- seçenekler
  viewOptions() {
    const b = this.box; b.replaceChildren();
    b.append(this.head('Fragmanı video olarak kaydet', 'Her kare tam çözünürlükte, kare kare çizilir: video akıcı olur, bilgisayarın hızı yalnız bekleme süresini değiştirir.'));
    const body = el('div', 'xp-body'), O = this.opt, ch = () => { this.save(); this.refresh(); };
    body.append(
      this.seg('Biçim', [['yatay', 'Yatay', '16:9 · YouTube, sunum'], ['dikey', 'Dikey', '9:16 · Reels, TikTok, Shorts']], () => O.bicim, (v) => { if (O.bicim === v) return; O.bicim = v; this.save(); this.viewOptions(); }),
      ...(O.bicim === 'dikey' ? [el('p', 'pd-note xp-vertical', 'Dikey video 1080 × 1920 olarak kaydedilir: sinema bantları kalkar, yazılar telefon ekranına göre yerleşir.')]
        : [this.seg('Çözünürlük', [['2160', '4K', '3840 × 2160'], ['1440', '1440p', '2560 × 1440'], ['1080', '1080p', '1920 × 1080']], () => O.res, (v) => { O.res = v; ch(); })]),
      this.seg('Kare hızı', this.o.EX.FPS.map((f) => [f, `${f}`, f === 24 ? translateText('sinema') : f === 60 ? translateText('çok akıcı') : translateText('standart')]), () => O.fps, (v) => { O.fps = v; ch(); }),
      this.seg('Kalite', [['std', 'Standart', 'küçük dosya'], ['high', 'Yüksek', 'önerilen'], ['max', 'En yüksek', 'büyük dosya']], () => O.quality, (v) => { O.quality = v; ch(); }));
    const au = el('label', 'pd-check'), ai = el('input'); ai.type = 'checkbox'; ai.checked = O.audio; ai.onchange = () => { O.audio = ai.checked; ch(); };
    const at = el('span', 'pd-checkt'); at.append(el('span', null, 'Müzik ve efekt sesleri'), el('small', 'pd-hint', 'Sesli okuma (geri sayım, görev kontrol, anlatıcı) videoya giremez; yazıları videoda görünür.'));
    au.append(ai, at); body.append(au);
    this.info = el('div', 'xp-info'); this.warn = el('div', 'xp-warn'); this.warn.setAttribute('role', 'status');
    body.append(this.info, this.warn, el('p', 'pd-note', 'Dışa aktarım sürerken bu sekme açık ve önde kalsın; sahne küçültülmüş olarak görünür. İstediğin an iptal edebilirsin.'));
    const foot = el('footer', 'xp-foot');
    const cancel = el('button', null, 'Vazgeç'); cancel.type = 'button'; cancel.onclick = () => this.close();
    const go = this.goBtn = el('button', 'primary'); go.type = 'button'; go.innerHTML = '<i data-icon="download"></i><span>Dışa aktarmayı başlat</span>'; applyIcons(go); go.onclick = () => this.start();
    const destek = destekBaglantisi();                                                // Buy Me a Coffee: solda, sakin (destek.js)
    foot.append(...(destek ? [destek] : []), cancel, go);
    b.append(body, foot);
    this.refresh();
    go.focus();
  }
  async refresh() {
    const O = this.opt, EX = this.o.EX, R = EX.RES[this.res()], sec = this.o.estimate(this.cut), vbps = EX.videoBitrate(this.res(), O.fps, O.quality);
    const bytes = sec ? EX.estimateBytes(sec, vbps, O.audio ? EX.AUDIO_BPS : 0) : null;
    this.info.replaceChildren(el('span', null, `${this.res() === 'dikey' ? `${translateText('Dikey')} 1080 × 1920` : R.name} · ${O.fps} ${translateText('kare/s')}`), el('span', null, sec ? `${translateText('Video')} ≈ ${mmss(sec)}` : ''), el('span', null, bytes ? `${translateText('Dosya')} ≈ ${mb(bytes)}` : ''), el('span', 'xp-codec', translateText('Denetleniyor…')));
    this.goBtn.disabled = true; const token = this.tok = {};
    const p = await this.o.exporter.probe(this.res(), O.fps, O.quality, O.audio).catch(() => null);
    if (token !== this.tok) return;
    const w = []; let ok = !!p;
    if (!this.o.planned()) { ok = false; w.push('Görev henüz tasarlanmadı: önce görevin hazır olmasını bekle.'); }
    if (!p || !p.webcodecs) { ok = false; w.push('Bu tarayıcıda video kodlayıcı (WebCodecs) yok. Chrome, Edge ya da güncel Safari ile dene.'); }
    else {
      if (!p.video) { ok = false; w.push(ERR.codec); }
      if (!p.gpuOk) { ok = false; w.push(`${translateText('Ekran kartın en çok')} ${p.maxPx} ${translateText('piksel genişlikte çizebiliyor: daha düşük bir çözünürlük seç.')}`); }
      if (!p.overlay) w.push('Bu tarayıcıda yazılar (kartlar, şerit, alt yazılar) videoya giremiyor: yalnız görüntü kaydedilir. Chrome ya da Edge önerilir.');
      if (O.audio && !p.audio) w.push('Ses kodlayıcı yok: video sessiz kaydedilir.');
      if (!p.disk) w.push('Dosya bellekte toplanıp en sonda indirilir; çok büyük videolar için Chrome ya da Edge (doğrudan diske yazar) önerilir.');
    }
    const codec = this.info.querySelector('.xp-codec');
    codec.textContent = p && p.video ? `${p.video.name}${p.video.hw ? ' ' + translateText('(donanım)') : ''}${O.audio && p.audio ? ' + ' + p.audio.name : ''}` : '—';
    this.warn.replaceChildren(...w.map((t) => el('p', null, translateText(t))));
    this.warn.hidden = !w.length; this.goBtn.disabled = !ok;
  }

  // ---------------------------------------------------------------- dışa aktarım
  async start() {
    const O = this.opt, EX = this.o.EX, name = EX.fileName(this.cut, this.res(), O.fps);
    let handle = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'MP4', accept: { 'video/mp4': ['.mp4'] } }] }); }
      catch (e) { if (e && e.name === 'AbortError') return; handle = null; }      // vazgeçildi; başka hata: bellekte toplanıp indirilir
    }
    this.running = true; this.root.classList.add('running'); this.viewProgress();
    const t0 = Date.now();
    try {
      const r = await this.o.exporter.run({ cut: this.cut, res: this.res(), fps: O.fps, quality: O.quality, audio: O.audio, handle, onProgress: (p) => this.progress(p) });
      this.running = false; this.root.classList.remove('running'); this.viewDone(r, handle, name, (Date.now() - t0) / 1000);
    } catch (e) {
      this.running = false; this.root.classList.remove('running');
      if (e && e.code === 'cancel') this.viewMessage('Dışa aktarım iptal edildi.', handle ? 'Yarım dosya diske yazılmadı.' : '');
      else { console.error(e); this.viewMessage('Dışa aktarım tamamlanamadı', translateText(ERR[e && e.code] || '') || String((e && e.message) || e)); }
    }
  }
  viewProgress() {
    const b = this.box; b.replaceChildren();
    const row = el('div', 'xp-prog'), txt = el('div', 'xp-ptext'), bar = el('div', 'xp-bar'), fill = el('i');
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-label', translateText('Dışa aktarım'));
    bar.append(fill);
    this.p = { title: el('b', null, translateText('Hazırlanıyor…')), line: el('span', 'xp-pline', ''), fill, bar };
    txt.append(this.p.title, this.p.line);
    const cancel = el('button', null, 'İptal'); cancel.type = 'button'; cancel.onclick = () => { cancel.disabled = true; this.p.title.textContent = translateText('İptal ediliyor…'); this.o.exporter.cancel(); };
    row.append(txt, cancel);
    b.append(row, bar);
    cancel.focus();
  }
  progress(p) {
    const P = this.p; if (!P) return;
    if (p.phase !== P.phase) { P.phase = p.phase; this.say(p.phase === 'prepare' ? 'Hazırlanıyor…' : p.phase === 'audio' ? 'Müzik ve efektler üretiliyor…' : p.phase === 'finish' ? 'Dosya yazılıyor…' : 'Kaydediliyor'); }
    if (p.phase === 'prepare') { P.title.textContent = translateText('Hazırlanıyor: kodlayıcı, yazı tipleri, sahne…'); return; }
    if (p.phase === 'audio') { P.title.textContent = translateText('Müzik ve efektler üretiliyor…'); P.fill.style.transform = 'scaleX(1)'; return; }
    if (p.phase === 'finish') { P.title.textContent = translateText('Dosya yazılıyor…'); return; }
    const total = p.total || 0, frac = total ? Math.min(0.99, p.seconds / total) : 0, left = p.rate > 0 && total ? Math.max(0, (total - p.seconds) / p.rate) : null;
    P.title.textContent = `${translateText('Kaydediliyor')} ${mmss(p.seconds)}${total ? ' / ≈' + mmss(total) : ''}`;
    P.line.textContent = [`${translateText('kare')} ${p.frames.toLocaleString(LOC)}`, `${translateText('hız')} ×${(p.rate || 0).toLocaleString(LOC, { maximumFractionDigits: 2 })} ${translateText('gerçek zaman')}`, left != null ? `${translateText('kalan')} ≈ ${mmss(left)}` : '', `≈ ${mb(p.bytes)}`].filter(Boolean).join(' · ');
    P.fill.style.transform = `scaleX(${frac.toFixed(4)})`; P.bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
  }
  viewDone(r, handle, name, took) {
    const b = this.box; b.replaceChildren();
    this.say('Video hazır');
    b.append(this.head('Video hazır', `${name} · ${mb(r.bytes)} · ${mmss(r.seconds)} · ${r.codec}`));
    const body = el('div', 'xp-body');
    body.append(el('p', 'pd-note', `${translateText('Dışa aktarım')} ${mmss(took)} ${translateText('sürdü.')}${r.overlay ? '' : ' ' + translateText('Yazılar bu tarayıcıda videoya giremedi.')}`));
    const foot = el('footer', 'xp-foot'), close = el('button', null, 'Kapat'); close.type = 'button'; close.onclick = () => this.close();
    if (r.blob) {
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(r.blob);
      const a = el('a', 'primary xp-dl'); a.href = this.url; a.download = name; a.innerHTML = '<i data-icon="download"></i><span>Videoyu indir</span>'; applyIcons(a);
      foot.append(close, a); setTimeout(() => a.click(), 50); body.append(el('p', 'pd-hint', 'İndirme başlamadıysa “Videoyu indir”e dokun.'));
    } else { body.append(el('p', null, `${translateText('Kaydedildi')}: ${handle ? handle.name : name}`)); foot.append(close); }
    if (uydum() && !uydumPaylasilan() && this.cut && normalize(this.cut).ch.uydu.on) uydumUretildi(Date.now(), encodeCut(this.cut)).then(() => uydumArsivle()).catch(() => {});   // kullanıcının uydusuyla fragman üretildi: arşive (kapalıysa bekler; usersat.js)
    const destek = destekKarti(this.cut); if (destek) body.append(destek);                 // özel kurguda bir kez, engellemeden (destek.js)
    b.append(body, foot); close.focus();
  }
  viewMessage(title, text) {
    const b = this.box; b.replaceChildren(); b.append(this.head(title, text || '')); this.say(title);
    const foot = el('footer', 'xp-foot'), again = el('button', null, 'Seçeneklere dön'), close = el('button', 'primary', 'Kapat');
    again.type = close.type = 'button'; again.onclick = () => this.viewOptions(); close.onclick = () => this.close();
    foot.append(again, close); b.append(foot); close.focus();
  }
}
