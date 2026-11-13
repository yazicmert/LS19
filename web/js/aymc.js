// Laboratuvar › Ay görevi › Sonuç: dağılım denemesi (Monte Carlo). Aynı görevi tohumlu hatalarla (TLI kesmesi, iniş seyrüseferi, isteğe bağlı algılayıcı
// arızası) birkaç iş parçacığında art arda uçurur (mcwork.js → nominalrun.js › flyDispersed) ve başarı oranını, yakıt payını, iniş dağılımını gösterir.
// Görev worker'ına komut göndermez: canlı uçuş etkilenmez. Özet ve metin: mcstats.js (saf).
import { $, mk } from './uiutil.js';
import { fmt } from './format.js';
import { workerOpts } from './i18n.js';
import { summarize, mcText } from './mcstats.js';
import { TOUCH } from './touchdown.js';

const FAULT_LABEL = { none: '', trn: 'arazi göreli seyrüsefer yok', alt: 'altimetre 3 km altında susar', vel: 'hız ölçer 2 km altında susar' };
const LANDING_LABEL = { opt: 'Optimal (dengeli)', free: 'Optimal (serbest)', zem: 'ZEM/ZEV' };
const HIST_KEY = 'ls19.mcHist';
// metin parçaları " · " ile ayrı düğümler (çeviri her parçayı ayrı eşler)
const cell = (cls, v) => { const td = mk('td', cls); (Array.isArray(v) ? v : [v]).forEach((t, k) => { if (k) td.append(' · '); td.append(mk('span', null, t)); }); return td; };

export class AyMC {
  // get(): { tStart, design, landing, vehicle, profileName } — o anki görev (app.js)
  constructor({ get }) {
    this.get = get; this.ws = []; this.runs = []; this.busy = false; this.id = 0; this.opts = null;
    try { this.hist = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); if (!Array.isArray(this.hist)) this.hist = []; } catch (e) { this.hist = []; }
    $('#mcRun').addEventListener('click', () => this.start());
    $('#mcStop').addEventListener('click', () => this.stop('Durduruldu.'));
    $('#mcClear').addEventListener('click', () => { this.hist = []; this.saveHist(); this.renderHist(); });
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (this.runs.length) this.draw(); }); ro.observe($('#mcScatter')); }
    this.renderHist();
  }
  saveHist() { try { localStorage.setItem(HIST_KEY, JSON.stringify(this.hist.slice(0, 20))); } catch (e) { /* özel pencere */ } }
  start() {
    const g = this.get();
    if (!g || !g.design || g.tStart == null) { $('#mcMsg').textContent = 'Önce görev kurulsun (Görev adımı).'; return; }
    this.stop('');
    const N = +$('#mcN').value || 50, tliSigma = Math.max(0, Math.min(10, +$('#mcTli').value || 0)), nav = $('#mcNav').value !== 'off', fault = nav ? $('#mcFault').value : 'none';
    const K = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, N)), id = ++this.id;
    this.opts = { N, tliSigma, nav, fault, landing: g.landing, vehicle: g.vehicle, profileName: g.profileName, t0: performance.now() };
    this.runs = []; this.busy = true; this.left = K;
    $('#mcRun').disabled = true; $('#mcStop').hidden = false; $('#mcOut').hidden = false; this.progress();
    for (let k = 0; k < K; k++) {
      const w = new Worker(new URL('./mcwork.js', import.meta.url), workerOpts()), seeds = [];
      for (let s = k + 1; s <= N; s += K) seeds.push(s);
      w.onmessage = (e) => this.onMsg(e.data, id);
      w.onerror = (e) => { if (id === this.id) this.stop('Hesap iş parçacığı hatası: ' + (e.message || '')); };
      w.postMessage({ id, tStart: g.tStart, design: g.design, landing: g.landing, seeds, tliSigma, nav, fault });
      this.ws.push(w);
    }
  }
  stop(msg) {
    for (const w of this.ws) w.terminate(); this.ws = []; this.busy = false;
    $('#mcRun').disabled = false; $('#mcStop').hidden = true; if (msg != null) $('#mcMsg').textContent = msg;
  }
  onMsg(d, id) {
    if (id !== this.id || d.id !== id) return;
    if (d.type === 'error') { this.stop('Hata: ' + d.error); return; }
    if (d.type === 'run') { this.runs.push(d.run); this.progress(); this.render(); return; }
    if (d.type === 'done' && --this.left === 0) {
      const o = this.opts, s = summarize(this.runs);
      this.stop(`${this.runs.length} uçuş · ${fmt((performance.now() - o.t0) / 1000, 0)} s`);
      this.hist.unshift({ at: Date.now(), profile: o.profileName || '', landing: o.landing, vehicle: o.vehicle, tliSigma: o.tliSigma, nav: o.nav, fault: o.fault,
        n: s.n, ok: s.ok, lo: s.ci[0], hi: s.ci[1], prop: s.prop && s.prop[1], propMin: s.propMin, miss: s.miss && s.miss[1] });
      this.saveHist(); this.renderHist();
    }
  }
  progress() { if (this.busy) $('#mcMsg').textContent = `Uçuluyor… ${this.runs.length}/${this.opts.N}`; }
  render() {
    const o = this.opts, s = summarize(this.runs), t = mcText(s, { tliSigma: o.tliSigma, nav: o.nav, faultLabel: FAULT_LABEL[o.fault] });
    $('#mcVerdict').className = 'unc ' + t.kind; $('#mcVT').textContent = t.title;
    const tb = $('#mcTbl tbody'); tb.replaceChildren();
    for (const [k, v] of t.rows) { const tr = mk('tr'); tr.append(mk('td', null, k), cell('num', v)); tb.appendChild(tr); }
    const why = {}; for (const f of s.fails) for (const w of f.why) why[w] = (why[w] || 0) + 1;
    $('#mcFails').textContent = s.fails.length ? 'Başarısız uçuşların nedeni: ' + Object.entries(why).map(([w, n]) => `${w} (${n})`).join('; ') : '';
    this.draw();
  }
  // iki grafik: iniş noktaları (iniş yerine göre, m) ve temas hızları (yatay–dikey, güvenli temas zarfıyla)
  draw() {
    const c = $('#mcScatter'), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = '11px system-ui, sans-serif';
    const pw = (w - 18) / 2, R = this.runs.filter((r) => r.pos);
    // sol: iniş noktaları
    {
      const x0 = 6, cx = x0 + pw / 2, cy = h / 2 + 8, ext = Math.max(5, ...R.map((r) => Math.hypot(r.pos[0], r.pos[1]))) * 1.2, s = Math.min(pw, h - 30) / 2 / ext;
      g.fillStyle = '#9aa3b2'; g.fillText(`İniş noktaları (±${fmt(ext, ext < 10 ? 1 : 0)} m)`, x0, 12);
      g.strokeStyle = '#2b313c'; g.beginPath(); g.moveTo(x0, cy); g.lineTo(x0 + pw, cy); g.moveTo(cx, 20); g.lineTo(cx, h - 4); g.stroke();
      g.fillStyle = '#9aa3b2'; g.fillText('menzil →', x0 + pw - 50, cy - 4); g.fillText('yan', cx + 4, 28);
      for (const r of R) { g.fillStyle = r.ok ? 'rgba(52,211,153,.85)' : '#f87171'; g.beginPath(); g.arc(cx + r.pos[0] * s, cy - r.pos[1] * s, 3, 0, 7); g.fill(); }
      g.strokeStyle = '#d8dde6'; g.beginPath(); g.moveTo(cx - 5, cy - 5); g.lineTo(cx + 5, cy + 5); g.moveTo(cx + 5, cy - 5); g.lineTo(cx - 5, cy + 5); g.stroke();
    }
    // sağ: temas hızları ve 10-7-4 zarfı (touchdown.js)
    {
      const x0 = 12 + pw, L = 30, B = 22, T = 20, vhMax = Math.max(TOUCH.VH * 1.3, ...R.map((r) => r.vh || 0)) * 1.05, vzMax = Math.max(TOUCH.VZ0 * 1.2, ...R.map((r) => -r.vz || 0)) * 1.05;
      const X = (v) => x0 + L + v / vhMax * (pw - L - 4), Y = (v) => h - B - v / vzMax * (h - B - T);
      g.fillStyle = '#9aa3b2'; g.fillText('Temas hızı (m/s)', x0, 12); g.fillText('yatay →', X(vhMax) - 42, h - 6); g.fillText('dikey', x0, T + 4);
      g.strokeStyle = '#2b313c'; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(vhMax), Y(0)); g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(vzMax)); g.stroke();
      g.strokeStyle = '#e66767'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(0), Y(TOUCH.VZ0)); g.lineTo(X(TOUCH.VH), Y(TOUCH.VZ4)); g.lineTo(X(TOUCH.VH), Y(0)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#e66767'; g.fillText('güvenli temas sınırı', X(0) + 4, Y(TOUCH.VZ0) - 4);
      for (const r of R) { if (r.vh == null) continue; g.fillStyle = r.ok ? 'rgba(52,211,153,.85)' : '#f87171'; g.beginPath(); g.arc(X(r.vh), Y(-r.vz), 3, 0, 7); g.fill(); }
    }
  }
  renderHist() {
    const box = $('#mcHist'), tb = $('#mcHistTbl tbody'); tb.replaceChildren(); box.hidden = !this.hist.length;
    for (const h of this.hist) {
      const tr = mk('tr');
      tr.append(cell(null, [LANDING_LABEL[h.landing] || h.landing, h.vehicle === 'one' ? 'Tek kademe' : 'İki kademe']),
        cell(null, [`TLI ${fmt(h.tliSigma, 1)} m/s`, ...(h.nav ? [] : ['seyrüsefer kusursuz']), ...(h.fault && h.fault !== 'none' ? [FAULT_LABEL[h.fault]] : [])]),
        mk('td', 'num', `${h.ok}/${h.n}`), mk('td', 'num', h.prop != null ? `${fmt(h.prop, 0)} kg` : '—'), mk('td', 'num', h.miss != null ? `${fmt(h.miss, 1)} m` : '—'));
      tb.appendChild(tr);
    }
  }
}
