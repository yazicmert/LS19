// Laboratuvar çalışma alanı: deney merkezi (ağaç) ve deneyler arası gezinme.
//   LS19 › Canlı Gökyüzü · Laboratuvar › { Görev ve araç tasarımı: Ay görevi (ayrı alan), Ay'a iniş tezgâhı ·
//                                          Çarpışma ve çarpma: asteroit → Dünya, uydu ↔ uydu/çöp, uydu yeniden girişi · Gezegen savunması: asteroit saptırma }
// Asteroit saptırma (deflectui.js) gökyüzü katmanlarıyla birlikte kurulur; öteki deneyler ilk açılışta tembel yüklenir (dinamik import: açılışı şişirmez).
const $ = (s) => document.querySelector(s);
export const LAB_PAGES = { home: 'Laboratuvar', saptirma: 'Asteroit saptırma', inis: "Ay'a iniş tezgâhı", carpma: 'Asteroit → Dünya çarpması', yakin: 'Uydu ↔ uydu yakın geçiş', giris: 'Uydu yeniden girişi' };
const LAZY = { inis: () => import('./landlab.js'), carpma: () => import('./impactlab.js'), yakin: () => import('./conjlab.js'), giris: () => import('./reentrylab.js') };

export class LabUI {
  // openMission: Ay görevi alanına geçer; ctx(): deneylerin kullandığı ortak nesneler (dünya, saat, uydu/asteroit katmanları, kamera işlevleri)
  constructor({ openMission, ctx }) {
    this.page = 'home'; this.onShow = null; this.ctx = ctx; this.exps = {}; this.loading = {};
    const panel = $('#labPanel');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-exp], [data-go]'); if (!b) return;
      if (b.dataset.exp) this.show(b.dataset.exp);
      else if (b.dataset.go === 'mission') openMission();
    });
    // formlarda yazarken ve düğmelerde Boşluk/Enter'da genel kısayollar (duraklat, kamera…) çalışmasın
    panel.addEventListener('keydown', (e) => {
      const t = e.target, typing = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName), press = (e.key === ' ' || e.key === 'Enter') && /^(BUTTON|SUMMARY)$/.test(t.tagName);
      if (typing || press) e.stopPropagation();
    });
    $('#labBack').addEventListener('click', () => this.show('home'));
    this.show('home');
  }
  show(name) {
    if (!LAB_PAGES[name]) name = 'home';
    this.page = name;
    for (const p of document.querySelectorAll('#labPanel .labpage')) p.hidden = p.id !== 'lab-' + name;
    $('#labBack').hidden = name === 'home';
    $('#labTitle').textContent = LAB_PAGES[name];
    $('#labCrumb').hidden = name !== 'home';
    if (LAZY[name]) this.ensure(name);
    if (this.onShow) this.onShow(name);
    return this.exps[name] ? Promise.resolve(this.exps[name]) : this.loading[name] || Promise.resolve(null);
  }
  // deney modülünü bir kez yükle ve sayfasını kur; sonraki açılışlarda yalnız onShow
  ensure(name) {
    const ex = this.exps[name];
    if (ex) { if (ex.onShow) ex.onShow(); return Promise.resolve(ex); }
    if (this.loading[name]) return this.loading[name];
    const root = document.getElementById('lab-' + name);
    root.innerHTML = '<p class="k small" role="status">Deney yükleniyor…</p>';
    this.loading[name] = LAZY[name]().then((m) => {
      root.textContent = '';
      const inst = this.exps[name] = new m.default(root, this.ctx);
      if (this.page === name && inst.onShow) inst.onShow();
      return inst;
    }).catch((err) => { root.innerHTML = ''; const p = document.createElement('p'); p.className = 'err small'; p.textContent = 'Deney yüklenemedi: ' + err.message; root.appendChild(p); delete this.loading[name]; console.error(err); return null; });
    return this.loading[name];
  }
}
