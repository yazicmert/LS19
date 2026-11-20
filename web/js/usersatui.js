// Yapımcı masası, "Uydum" sekmesi: kullanıcı kendi uydusunun 3B modelini ya da CAD çıktısını (GLB, STL, OBJ) ekler.
// Yüklemeden önce kullanım şartı onaylanmalı (dosya düğmesi ve bırakma alanı o zamana dek kapalı). Model eklenince: dönen önizleme, ad, boy, renk, fragmanda aç/kapa, değiştir, kaldır.
// Kullanıcı metni yalnız textContent/value ile yazılır. Önizleme three.js'i yalnız bu sekme açılınca yükler (usermodel.js).
import { SART_METNI, SART_SURUM, SINIR, RENKLER, BICIMLER, uydum, uydumYukle, uydumGuncelle, uydumSil } from './usersat.js';
import { translateText, LOC } from './i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = translateText(String(text)); return e; };
const mb = (b) => (b < 1e6 ? `${Math.max(1, Math.round(b / 1e3)).toLocaleString(LOC)} KB` : `${(b / 1e6).toLocaleString(LOC, { maximumFractionDigits: 1 })} MB`);
const HATA = {
  sart: 'Önce kullanım şartını onayla.',
  bicim: 'Bu dosya türü desteklenmiyor. GLB, STL ya da OBJ yükle (glTF ise tek dosya .glb olarak dışa aktar).',
  boyut: 'Dosya 40 MB’tan büyük. Modeli sadeleştirip yeniden dışa aktar.',
  ucgen: 'Model 1,5 milyon üçgenden fazla. CAD programında daha kaba bir ağla (mesh) dışa aktar.',
  bos: 'Dosyada çizilebilir bir yüzey bulunamadı.',
};
// boy sürgüsü: logaritmik (0,1–120 m)
const L0 = Math.log(SINIR.boyMin), L1 = Math.log(SINIR.boyMax);
const boyTo = (v) => Math.round(((Math.log(v) - L0) / (L1 - L0)) * 1000), toBoy = (u) => { const b = Math.exp(L0 + (u / 1000) * (L1 - L0)); return b < 10 ? Math.round(b * 10) / 10 : Math.round(b); };

export class SatPane {
  // desk: ProducerDesk (update, say, cut); pane: sekme gövdesi
  constructor(desk, pane) { this.d = desk; this.p = pane; this.yeni = false; this.view = null; this.build(); }
  build() {
    this.stopView(); const p = this.p; p.replaceChildren(); const m = uydum();
    p.append(el('p', 'pd-note', 'Kendi uydunun 3B modelini ya da CAD çiziminin dışa aktarımını ekle: uydun fragmanda park yörüngesinde araçtan ayrılır, kamera ona döner.'));
    if (m && !this.yeni) this.loaded(m); else this.upload(m);
  }
  // ---- yükleme: kullanım şartı + dosya
  upload(m) {
    const p = this.p, g = el('fieldset', 'pd-group us-sart'); g.append(el('legend', null, 'Kullanım şartı'));
    const ol = el('ol', 'us-terms'); for (const t of SART_METNI) ol.append(el('li', null, t)); g.append(ol, el('small', 'pd-hint us-version', `${translateText('Sürüm')} ${SART_SURUM}`));
    const lab = el('label', 'pd-check us-ok'), cb = el('input'); cb.type = 'checkbox';
    lab.append(cb, el('span', null, 'Şartları okudum. Yüklediğim modelin haklarının bende olduğunu ve bu modelle fragman üretilirse LS19 arşivinde saklanmasına izin verdiğimi beyan ederim.'));
    g.append(lab);
    const drop = el('div', 'us-drop'), inp = el('input'); inp.type = 'file'; inp.accept = '.glb,.stl,.obj'; inp.hidden = true;
    const pick = el('button', 'us-pick', 'Dosya seç'); pick.type = 'button';
    const fmts = Object.values(BICIMLER).map((v) => translateText(v)).join(', ');
    drop.append(el('b', null, 'Modelini buraya bırak'), el('span', null, `${fmts} · ${translateText('en çok')} 40 MB`), pick, inp,
      el('small', 'pd-hint', 'CAD programından (SolidWorks, Fusion 360, FreeCAD, Blender…) STL ya da OBJ olarak dışa aktarabilirsin. Boyutu sonra metre olarak ayarlarsın.'));
    const err = el('p', 'us-err'); err.setAttribute('role', 'alert'); err.hidden = true;
    const busy = el('p', 'pd-note us-busy', 'Model okunuyor…'); busy.hidden = true;
    const durum = () => { const on = cb.checked; pick.disabled = !on; drop.classList.toggle('kapali', !on); drop.title = on ? '' : translateText('Önce kullanım şartını onayla.'); };
    cb.onchange = durum; durum();
    const al = async (f) => {
      if (!f) return; if (!cb.checked) { err.textContent = translateText(HATA.sart); err.hidden = false; return; }
      err.hidden = true; busy.hidden = false; pick.disabled = true;
      try {
        const eski = uydum();
        await uydumYukle(f, { onay: true, boy: eski ? eski.boy : 3, renk: eski ? eski.renk : RENKLER[0] });
        this.yeni = false; this.d.say('Uydun eklendi: fragmanda park yörüngesinde araçtan ayrılacak.');
        this.d.update((c) => { c.ch.uydu.on = true; });                              // eklenen uydu fragmanda (kapalıysa açılır)
        this.d.selectClip('uydu', false);
      } catch (e) {
        const k = e && HATA[e.message] ? e.message : null;
        err.textContent = translateText(k ? HATA[k] : 'Model okunamadı. Dosya bozuk ya da desteklenmeyen bir glTF uzantısı kullanıyor olabilir.'); err.hidden = false;
        if (!k) console.warn('uydum:', e);
      } finally { busy.hidden = true; durum(); }
    };
    pick.onclick = () => inp.click(); inp.onchange = () => { al(inp.files[0]); inp.value = ''; };
    drop.ondragover = (e) => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); drop.classList.add('ust'); };
    drop.ondragleave = () => drop.classList.remove('ust');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('ust'); al(e.dataTransfer.files[0]); };
    p.append(g, drop, busy, err);
    if (m) { const b = el('button', 'pd-link', 'Vazgeç, mevcut modelim kalsın'); b.type = 'button'; b.onclick = () => { this.yeni = false; this.build(); }; p.append(b); }
  }
  // ---- eklenmiş model
  loaded(m) {
    const p = this.p, card = el('div', 'us-card'), cv = el('canvas', 'us-view'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${m.ad}: ${translateText('3B önizleme')}`);
    const info = el('div', 'us-info');
    const row = (k, v) => { const r = el('div', 'us-row'); r.append(el('span', null, k), Object.assign(document.createElement('b'), { textContent: v })); return r; };
    info.append(row('Dosya', m.dosyaAdi), row('Biçim', translateText(BICIMLER[m.bicim] || m.bicim)), row('Boyut', mb(m.bayt)), row('Üçgen', m.ucgen.toLocaleString(LOC)));
    card.append(cv, info); p.append(card);
    // ad
    const fAd = el('div', 'pd-field'), lAd = el('label', null, 'Uydunun adı'), iAd = el('input'); iAd.type = 'text'; iAd.id = 'usAd'; lAd.htmlFor = iAd.id; iAd.maxLength = SINIR.ad; iAd.value = m.ad; iAd.autocomplete = 'off';
    let tAd = 0; iAd.oninput = () => { clearTimeout(tAd); tAd = setTimeout(() => uydumGuncelle({ ad: iAd.value }), 400); };
    iAd.onblur = () => { clearTimeout(tAd); uydumGuncelle({ ad: iAd.value }).then((n) => { if (n) iAd.value = n.ad; }); };
    fAd.append(lAd, iAd, el('small', 'pd-hint', 'Bölüm kartında büyük harfle görünür.'));
    // boy
    const fB = el('div', 'pd-field pd-slider'), top = el('div', 'pd-sltop'), lB = el('label', null, 'Gerçek boyu'), r = el('input'), out = el('output', 'pd-out');
    r.type = 'range'; r.id = 'usBoy'; lB.htmlFor = r.id; r.min = '0'; r.max = '1000'; r.step = '1'; r.value = String(boyTo(m.boy));
    const yaz = (b) => { out.textContent = `${b.toLocaleString(LOC)} m`; r.setAttribute('aria-valuetext', out.textContent); };
    yaz(m.boy); let tB = 0;
    r.oninput = () => { const b = toBoy(+r.value); yaz(b); clearTimeout(tB); tB = setTimeout(() => uydumGuncelle({ boy: b }), 250); if (this.view) this.view.boy(b); };
    top.append(lB, out); fB.append(top, r, el('small', 'pd-hint', 'En uzun kenarı (ör. küp uydu 0,3 m, iletişim uydusu 7 m). Model birimi ne olursa olsun bu boya ölçeklenir.'));
    p.append(fAd, fB);
    // renk (renksiz STL/OBJ)
    if (m.boyanir) {
      const fR = el('div', 'pd-field'), lR = el('span', 'pd-k', 'Renk'), sw = el('div', 'us-sw'); sw.setAttribute('role', 'radiogroup'); sw.setAttribute('aria-label', translateText('Renk'));
      const ADLAR = ['Alüminyum', 'Altın folyo', 'Beyaz boya', 'Lacivert panel', 'Bordo'];
      RENKLER.forEach((c, i) => {
        const b = el('button', 'us-c'); b.type = 'button'; b.style.setProperty('--c', c); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(c === m.renk)); b.title = translateText(ADLAR[i]); b.setAttribute('aria-label', translateText(ADLAR[i]));
        b.onclick = () => { for (const x of sw.children) x.setAttribute('aria-checked', String(x === b)); uydumGuncelle({ renk: c }); if (this.view) this.view.renk(c); };
        sw.append(b);
      });
      fR.append(lR, sw); p.append(fR);
    }
    // fragmanda
    const lOn = el('label', 'pd-check'), cOn = el('input'); cOn.type = 'checkbox'; cOn.setAttribute('role', 'switch'); cOn.checked = this.d.cut.ch.uydu.on;
    lOn.append(cOn, el('span', null, 'Fragmanda göster'));
    cOn.onchange = () => this.d.toggleClip('uydu', cOn.checked); this.onSw = cOn;
    p.append(lOn);
    const acts = el('div', 'pd-acts'), ch = el('button', null, 'Modeli değiştir'), rm = el('button', 'us-rm', 'Kaldır'); ch.type = rm.type = 'button';
    ch.onclick = () => { this.yeni = true; this.build(); };
    rm.onclick = async () => {
      if (!window.confirm(translateText('Uydun bu tarayıcıdan silinsin mi? Bu geri alınamaz.'))) return;
      await uydumSil(); this.d.say('Uydun kaldırıldı.');
    };
    acts.append(ch, rm); p.append(acts);
    const tarih = new Date(m.onay.t).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
    p.append(el('p', 'pd-note us-legal', `${translateText('Kullanım şartını onayladın')}: ${tarih} (${translateText('sürüm')} ${m.onay.surum}). ${translateText('Model şimdilik yalnız bu tarayıcıda saklanıyor; paylaşım bağlantısına girmez. LS19 arşivine gönderim web sitesiyle başlayacak.')}`));
    if (m.uretim.length) p.append(el('p', 'pd-note', `${translateText('Bu modelle üretilen fragman')}: ${m.uretim.length}`));
    this.startView(cv, m);
  }
  sync() { if (this.onSw) this.onSw.checked = this.d.cut.ch.uydu.on; }
  // ---- dönen önizleme (yalnız sekme görünürken çizer)
  async startView(cv, m) {
    let M, THREE;
    try { [M, THREE] = await Promise.all([import('./usermodel.js'), import('three')]); } catch (e) { cv.replaceWith(el('p', 'pd-note', 'Önizleme bu pencerede açılamadı.')); return; }
    const { uydumKayit } = await import('./usersat.js'), r = await uydumKayit(); if (!r || !cv.isConnected) return;
    let model; try { model = await M.modelCoz(await r.dosya.arrayBuffer(), r.bicim); } catch (e) { return; }
    if (!cv.isConnected) { M.modelBirak(model); return; }
    let ren; try { ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { M.modelBirak(model); return; }
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x1a1c22, 0.9)); const sun = new THREE.DirectionalLight(0xfff4e2, 2.6); sun.position.set(3, 2, 4); scene.add(sun);
    M.modelBoya(model, r.renk); const obj = M.modelOlcekle(model, 2, 1); scene.add(obj);              // önizleme: en uzun kenar 2 birim
    cam.position.set(0, 0.9, 4.2); cam.lookAt(0, 0, 0);
    let raf = 0, a = 0.6;
    const ciz = () => {
      raf = requestAnimationFrame(ciz); if (this.p.hidden || document.hidden) return;
      const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * devicePixelRatio)) { ren.setPixelRatio(devicePixelRatio); ren.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) a += 0.006; obj.rotation.y = a; ren.render(scene, cam);
    };
    ciz();
    this.view = { stop: () => { cancelAnimationFrame(raf); M.modelBirak(obj); ren.dispose(); }, renk: (c) => M.modelBoya(model, c), boy: () => {} };
  }
  stopView() { if (this.view) { this.view.stop(); this.view = null; } this.onSw = null; }
}
