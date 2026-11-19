// Yapımcı masası ↔ LS19 sekmesi eşitlemesi (ayrı pencerede editör). Aynı kökenli sekmeler arasında BroadcastChannel ('ls19-yapimci'):
//   · LS19 sekmesi (MainLink): kimliği (id) vardır; editör penceresine bölümleri, kayıtlı kurguyu, tahmini süreleri ve oynayan bölümü bildirir;
//     editörden gelen kurguyu oynayan fragmana canlı uygular, "oynat", "önizle", "durdur" komutlarını yürütür.
//   · Editör penceresi (PopLink): bağlandığı LS19 sekmesinin kimliğiyle konuşur (adreste ?ana=…; yoksa ilk yanıt veren sekme); 2 s'de bir yoklar,
//     5 s yanıt gelmezse bağlantı koptu sayar.
// İletiler düz nesnedir ({ t: tür, from|to: sekme kimliği, … }); kurgu her alımda normalize ile süzülür (producer.js), başka bir şey yürütülmez.
// Kurgu iki yönde eşitlenir: hangi taraf değiştirirse öbürü günceller (yalnız yerel düzenleme yayınlanır: yankı olmaz).
import { normalize } from './producer.js';

export const CHANNEL = 'ls19-yapimci';
export const hasChannel = () => typeof BroadcastChannel === 'function';
const rid = () => Math.random().toString(36).slice(2, 10);
const PING_MS = 2000, LOST_MS = 5500;

// LS19 sekmesi tarafı. h: { chapters(), cut(), estimate(cut) → { total, parts } | null, onCut(cut), onPlay(cut), onPreview(cut, k), onStop() }
export class MainLink {
  constructor(h) {
    this.h = h; this.id = rid(); this.peers = new Map(); this.state = { on: false, grp: null };
    if (!hasChannel()) return;
    this.ch = new BroadcastChannel(CHANNEL);
    this.ch.onmessage = (e) => this.recv(e.data || {});
  }
  get connected() { const now = Date.now(); for (const t of this.peers.values()) if (now - t < LOST_MS) return true; return false; }
  send(t, o = {}) { if (this.ch) this.ch.postMessage({ t, from: this.id, ...o }); }
  recv(m) {
    if (!m || typeof m.t !== 'string' || !m.pop || (m.to && m.to !== this.id)) return;     // yalnız editör pencerelerinden (başka LS19 sekmesinin iletisi değil)
    if (m.t === 'hello' || m.t === 'ping') {                                      // kimliksiz selama her LS19 sekmesi yanıtlar; editör ilkini seçer
      if (m.pop) this.peers.set(m.pop, Date.now());
      if (m.t === 'hello') this.send('info', { to: m.pop, chapters: this.h.chapters(), cut: this.h.cut(), state: this.state });
      else this.send('pong', { to: m.pop, state: this.state });
      return;
    }
    if (m.t === 'bye') { this.peers.delete(m.pop); return; }
    if (m.pop) this.peers.set(m.pop, Date.now());
    const cut = m.cut ? normalize(m.cut) : null;
    if (m.t === 'est' && cut) this.send('est', { to: m.pop, n: m.n, est: this.h.estimate(cut) });
    else if (m.t === 'cut' && cut) this.h.onCut(cut);
    else if (m.t === 'play' && cut) this.h.onPlay(cut);
    else if (m.t === 'preview' && cut && typeof m.k === 'string') this.h.onPreview(cut, m.k);
    else if (m.t === 'stop') this.h.onStop();
    else if (m.t === 'export' && cut) { if (this.h.onExport) this.h.onExport(cut); }
    else if (m.t === 'chapters') this.send('info', { to: m.pop, chapters: this.h.chapters(), cut: null, state: this.state });
  }
  close() { if (this.ch) this.ch.close(); }
  // yerel (sayfa içi masa) düzenlemesini editör penceresine ilet
  sendCut(cut) { if (this.peers.size) this.send('cut', { cut }); }
  // oynayan bölüm (fragman açık mı, hangi bölüm, önizleme mi)
  setState(s) { this.state = { ...this.state, ...s }; if (this.peers.size) this.send('state', { state: this.state }); }
}

// Editör penceresi tarafı. h: { onInfo(info), onCut(cut), onEst(), onState(state), onLost(), onBack() }
export class PopLink {
  constructor(mainId, h) {
    this.h = h; this.id = rid(); this.main = mainId || null; this.est = null; this.estKey = ''; this.n = 0; this.last = 0; this.lost = false; this.chapters = null;
    if (!hasChannel()) return;
    this.ch = new BroadcastChannel(CHANNEL);
    this.ch.onmessage = (e) => this.recv(e.data || {});
    this.send('hello');
    this.timer = setInterval(() => this.tick(), PING_MS);
    if (typeof addEventListener === 'function') addEventListener('pagehide', () => this.send('bye'));
  }
  send(t, o = {}) { if (this.ch) this.ch.postMessage({ t, pop: this.id, to: this.main || undefined, ...o }); }
  recv(m) {
    if (!m || typeof m.t !== 'string' || !m.from || m.pop) return;                   // yalnız LS19 sekmelerinden
    if (m.to ? m.to !== this.id : !this.main || m.from !== this.main) return;      // bana ya da bağlı olduğum sekmenin yayını
    if (this.main && m.from !== this.main) return;
    if (!this.main && m.t === 'info') this.main = m.from;                             // kimliksiz açıldıysa ilk yanıt veren LS19 sekmesi
    this.last = Date.now();
    if (this.lost) { this.lost = false; this.h.onBack && this.h.onBack(); }
    if (m.t === 'info') { if (Array.isArray(m.chapters)) this.chapters = m.chapters; this.h.onInfo({ chapters: this.chapters, cut: m.cut ? normalize(m.cut) : null, state: m.state || {} }); }
    else if (m.t === 'est' && m.n === this.n) { this.est = m.est; this.h.onEst && this.h.onEst(); }
    else if (m.t === 'cut' && m.cut) this.h.onCut(normalize(m.cut));
    else if (m.t === 'state' || m.t === 'pong') { if (m.state) this.h.onState && this.h.onState(m.state); }
  }
  close() { clearInterval(this.timer); if (this.ch) { this.send('bye'); this.ch.close(); } }
  tick() {
    if (this.main) this.send('ping'); else this.send('hello');
    if (!this.lost && this.last && Date.now() - this.last > LOST_MS) { this.lost = true; this.h.onLost && this.h.onLost(); }
    if (!this.last && !this.lost && performance.now() > LOST_MS) { this.lost = true; this.h.onLost && this.h.onLost(); }
  }
  // masanın cinema.estimate yerine: son yanıtı döndürür, kurgu değiştiyse yenisini ister (yanıt gelince onEst)
  estimate(cut, parts) {
    const key = JSON.stringify(cut);
    if (key !== this.estKey && this.main) { this.estKey = key; this.send('est', { cut, n: ++this.n }); }
    const e = this.est; if (!e) return null;
    return parts ? e : e.total;
  }
}
