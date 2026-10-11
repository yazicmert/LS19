// Laboratuvar çalışma alanı: deney merkezi (ağaç) ve deneyler arası gezinme. Deneylerin kendisi ayrı modüllerdedir (asteroit saptırma: deflectui.js).
//   LS19 › Ay Görevi · Canlı Gökyüzü · Laboratuvar › { Asteroit saptırma · Ay görevi tasarımı (Ay Görevi alanına kısayol) · Çarpma ve yeniden giriş (Canlı Gökyüzü'ne kısayol) }
const $ = (s) => document.querySelector(s);
export const LAB_PAGES = { home: 'Laboratuvar', saptirma: 'Asteroit saptırma' };

export class LabUI {
  // openMission / openImpact: başka çalışma alanlarındaki ilgili yere gider (app.js)
  constructor({ openMission, openImpact }) {
    this.page = 'home'; this.onShow = null;
    const panel = $('#labPanel');
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-exp], [data-go]'); if (!b) return;
      if (b.dataset.exp) this.show(b.dataset.exp);
      else if (b.dataset.go === 'mission') openMission();
      else if (b.dataset.go === 'impact') openImpact();
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
    if (this.onShow) this.onShow(name);
  }
}
