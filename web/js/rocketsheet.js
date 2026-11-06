// Roket bilgi kartı (Laboratuvar › Ay görevi › 2. adım): 3B görünüm, teknik özellikler, kademeler ve yakıtlar, tarihçe, Ay görevleri, simülasyondaki TLI kademesi.
// Her bilgi numaralı kaynağa bağlanır (rocketinfo.js). 3B görüntüleyici (rocketviewer.js) tembel yüklenir ve kart kapanınca serbest bırakılır.
import { ROCKET_INFO } from './rocketinfo.js';
import { ROCKETS, tliCapacity, parkMass } from './rockets.js';
import { fmt } from './format.js';
import { MONTHS } from './i18n.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const dateTr = (iso) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : iso; };

export class RocketSheet {
  constructor(root, { onFly } = {}) {
    this.root = root; this.onFly = onFly; this.viewer = null; this.id = null; this.back = null;
    this.box = root.querySelector('.rs-box'); this.title = root.querySelector('#rsTitle'); this.status = root.querySelector('.rs-status');
    this.canvas = root.querySelector('.rs-view canvas'); this.cap = root.querySelector('.rs-cap'); this.state = root.querySelector('.rs-state'); this.info = root.querySelector('.rs-info');
    root.querySelector('.rs-close').addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } else e.stopPropagation(); });
  }
  get isOpen() { return !this.root.hidden; }
  // kaynak numaraları: [1, 3] → ¹ ³ bağlantıları (kartın altındaki listeye)
  cite(nums) {
    const s = el('sup', 'rs-cite');
    for (const n of nums || []) { const a = el('a', null, `[${n}]`); a.href = `#rs-src-${n}`; a.addEventListener('click', (e) => { e.preventDefault(); const t = this.root.querySelector(`#rs-src-${n}`); if (t) { t.scrollIntoView({ block: 'nearest' }); t.classList.add('hl'); setTimeout(() => t.classList.remove('hl'), 1200); } }); s.append(a); }
    return s;
  }
  async open(id) {
    const r = ROCKETS[id], I = ROCKET_INFO[id]; if (!r || !I) return;
    this.id = id; this.back = document.activeElement;
    this.title.textContent = r.name; this.status.textContent = `${I.country} · ${I.status}`;
    this.render(id, r, I);
    this.root.hidden = false; document.body.classList.add('rs-open');
    this.root.querySelector('.rs-close').focus();
    // 3B
    this.cap.replaceChildren(document.createTextNode(I.model.credit + ' '), this.cite(I.model.src), document.createTextNode(' · sürükle: döndür, tekerlek: yakınlaş · turuncu: 1,8 m insan'));
    try {
      if (!this.viewer) { const { RocketViewer } = await import('./rocketviewer.js'); if (this.id !== id || !this.isOpen) return; this.viewer = new RocketViewer(this.canvas); }
      await this.viewer.show(I.model, (t) => { this.state.textContent = t; this.state.hidden = !t; });
    } catch (e) { this.state.textContent = '3B görünüm açılamadı'; this.state.hidden = false; }
  }
  close() {
    if (this.root.hidden) return;
    this.root.hidden = true; document.body.classList.remove('rs-open');
    if (this.viewer) { this.viewer.dispose(); this.viewer = null; }
    const c = this.canvas.cloneNode(false); this.canvas.replaceWith(c); this.canvas = c;          // kaybedilen WebGL bağlamı yerine taze tuval
    if (this.back && this.back.focus) this.back.focus();
  }
  render(id, r, I) {
    const box = this.info; box.replaceChildren(); box.scrollTop = 0;
    const sec = (t) => { const s = el('section', 'rs-sec'); s.append(el('h3', null, t)); box.append(s); return s; };
    // genel
    let s = sec('Genel');
    const p = el('p'); p.append(document.createTextNode(`Üretici: ${I.maker}. Rampa (simülasyonda): ${r.pad}.`)); s.append(p);
    const tb = el('table', 'tbl rs-specs'), tbody = el('tbody');
    for (const [k, v, src] of I.specs) { const tr = el('tr'), td = el('td'); td.append(document.createTextNode(v), this.cite(src)); tr.append(el('th', null, k), td); tbody.append(tr); }
    tb.append(tbody); s.append(tb);
    // kademeler ve yakıt
    s = sec('Kademeler ve yakıt');
    const ul = el('ul', 'rs-stages');
    for (const st of I.stages) {
      const li = el('li'); li.append(el('b', null, st.name), document.createTextNode(` — ${st.engines}; ${st.prop}.${st.note ? ' ' + st.note : ''}`), this.cite(st.src)); ul.append(li);
    }
    s.append(ul);
    // tarihçe
    s = sec('Tarihçe');
    for (const [t, src] of I.history) { const q = el('p'); q.append(document.createTextNode(t), this.cite(src)); s.append(q); }
    // görevler
    s = sec(id === 'FH' ? 'Önemli görevler' : 'Ay ve derin uzay görevleri');
    const ol = el('ol', 'rs-missions');
    for (const m of I.missions) {
      const li = el('li'), res = el('span', 'rs-res ' + (/^Başarılı$/.test(m.result) ? 'ok' : /Planlanıyor/.test(m.result) ? 'plan' : /başarısız|Kısmi|anomali|iniş yok/i.test(m.result) ? 'part' : 'ok'), m.result);
      li.append(el('time', null, m.date === 'planlanıyor' ? 'Planlanıyor' : dateTr(m.date)), el('b', null, m.name), res, el('span', 'rs-note', m.note), this.cite(m.src));
      ol.append(li);
    }
    s.append(ol);
    // simülasyondaki TLI kademesi (rockets.js)
    s = sec('Simülasyonda');
    const st = r.stage, cap = tliCapacity(id), M = parkMass(id), q = el('p');
    q.append(document.createTextNode(`Ay görevi park yörüngesinde başlar; TLI'ı ${st.name} yapar: ${st.engine || ''} ${fmt(st.T, 1)} kN, Isp ${fmt(st.isp, 1)} s, kuru ${fmt(st.dry, 0)} kg${st.dryEst ? ' (tahmin)' : ''}, tank ${fmt(st.tank, 0)} kg. ` +
      `Park yörüngesindeki toplam kütle ${fmt(M / 1000, 1)} t, yayımlanmış başarımdan (${r.ref.src}) roket denklemiyle türetilir; türetilen TLI kapasitesi ≈ ${fmt(cap / 1000, 1)} t.`));
    s.append(q);
    const fly = el('button', 'primary sm', 'Bu roketle uçur'); fly.type = 'button'; fly.addEventListener('click', () => { this.close(); this.onFly && this.onFly(id); }); s.append(fly);
    // kaynaklar
    s = sec('Kaynaklar');
    const src = el('ol', 'rs-sources');
    I.sources.forEach((x, i) => { const li = el('li'); li.id = `rs-src-${i + 1}`; const a = el('a', null, x.t); a.href = x.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); src.append(li); });
    s.append(src, el('p', 'note', 'Tarihler takvim günüdür (fırlatma yerel saatine göre bir gün kayabilir). "Planlanıyor" kayıtları 3 Kasım 2026 itibarıyla.'));
  }
}
