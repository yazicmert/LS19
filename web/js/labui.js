// Laboratuvar çalışma alanı: deney merkezi (ağaç), deney kaydı ve deneyler arası gezinme. Deneylerin kendisi ayrı modüllerdedir
// (Ay görevi: ui.js + fizik worker'ı; asteroit saptırma: deflectui.js; çarpma riski: impactui.js; Lagrange noktaları: lagrangeui.js).
//   LS19 › Canlı Gökyüzü · Laboratuvar › { Ay görevi · Asteroit saptırma · Çarpma riski · Lagrange noktaları }
import { $ } from './uiutil.js';

// Deney kaydı: her deney hangi MOTORU kullandığını kendisi bildirir. app.js görünüm → motor eşlemesini buradan yapar:
//   engine   'mission' (fizik worker'ı, görev saati) | 'sky' (gerçek saat, DE440, uydu/asteroit katmanları)
//   phoneOpen  telefonda Laboratuvar'a bu deneyle girilince panel kendiliğinden açılsın mı (deney ana içerikse evet; 3B uçuş ana içerikse hayır)
// Ana sayfa (home) bir menüdür: motor DEĞİŞTİRMEZ, arkadaki sahne olduğu gibi kalır.
export const EXPERIMENTS = {
  ay: { title: 'Ay görevi', engine: 'mission', phoneOpen: false },
  saptirma: { title: 'Asteroit saptırma', engine: 'sky', phoneOpen: true },
  carpma: { title: 'Çarpma riski', engine: 'sky', phoneOpen: true },                // eskiden Canlı Gökyüzü'nde "Çarpma" sekmesiydi
  lagrange: { title: 'Lagrange noktaları', engine: 'sky', phoneOpen: true },
};
export const LAB_HOME = 'home';
export const LAB_PAGES = { [LAB_HOME]: 'Laboratuvar', ...Object.fromEntries(Object.entries(EXPERIMENTS).map(([k, v]) => [k, v.title])) };

// Görünüm + deney → motor (saf: Node'da sınanır). Bilinmeyen deney ya da ana sayfa: motor değişmez (cur).
export function engineFor(view, exp, cur) {
  if (view === 'sky') return 'sky';
  const e = EXPERIMENTS[exp]; return e ? e.engine : cur;
}
// Eski ve yeni adres/depo değerlerini { view, exp } biçimine çevirir (saf). Eski "mission" alanı artık Laboratuvar › Ay görevi.
//   mode: ?mode= ya da localStorage değeri; exp: ?exp=; tab: ?tab= (eski bağlantılar); tabOwner(tab) → 'mission' | 'sky' | null
export function resolveView({ mode, exp, tab, tabOwner }) {
  const own = tab ? tabOwner(tab) : null;
  if (tab === 'saptirma' || tab === 'carpma') return { view: 'lab', exp: tab };   // eski sekme bağlantıları: bu deneyler artık Laboratuvar'da
  if (own === 'mission') return { view: 'lab', exp: 'ay', tab };
  if (own === 'sky') return { view: 'sky', exp: null, tab };
  if (mode === 'mission') return { view: 'lab', exp: 'ay' };
  if (mode === 'sky') return { view: 'sky', exp: null };
  if (mode === 'lab') return { view: 'lab', exp: LAB_PAGES[exp] ? exp : LAB_HOME };
  return null;                                                   // değer yok: varsayılan açılış (Laboratuvar › Ay görevi)
}

export class LabUI {
  // onShow(name): sayfa değişince (app.js motoru ve adresi eşler)
  constructor({ initial = LAB_HOME } = {}) {
    this.page = LAB_HOME; this.onShow = null;
    const panel = $('#labPanel');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-exp]'); if (!b || !panel.contains(b)) return;
      this.show(b.dataset.exp);
    });
    // formlarda yazarken ve düğmelerde Boşluk/Enter'da genel kısayollar (duraklat, kamera…) çalışmasın
    panel.addEventListener('keydown', (e) => {
      const t = e.target, typing = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName), press = (e.key === ' ' || e.key === 'Enter') && /^(BUTTON|SUMMARY)$/.test(t.tagName);
      if (typing || press) e.stopPropagation();
    });
    $('#labBack').addEventListener('click', () => this.show(LAB_HOME));
    this.show(initial);
  }
  show(name) {
    if (!LAB_PAGES[name]) name = LAB_HOME;
    this.page = name;
    for (const p of document.querySelectorAll('#labPanel .labpage')) p.hidden = p.id !== 'lab-' + name;
    $('#labBack').hidden = name === LAB_HOME;
    $('#labTitle').textContent = LAB_PAGES[name];
    $('#labCrumb').hidden = name !== LAB_HOME;
    // deneyler arası geçiş (panel başlığının altında; merkezde gizli: merkez zaten deney listesi). Brifing kartındaki seçici de aynı durumu gösterir
    $('#labNav').hidden = name === LAB_HOME;
    for (const b of document.querySelectorAll('#labNav [data-exp], .brief-labnav [data-exp]')) { const on = b.dataset.exp === name; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); }
    if (this.onShow) this.onShow(name);
  }
}
