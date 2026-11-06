// Görev grafikleri için hafif çizgi grafiği (ui.js'ten ayrıldı): tek seri, isteğe bağlı log ölçek, tema renkleri, kare başına en çok bir çizim.
import { fmt } from './format.js';
import { UNIT } from './i18n.js';

// ------------------------------------------------------------------ çizgi grafiği (tek seri, çapraz imleçli)
export class LineChart {
  constructor(canvas, title, unit, log) {
    this.c = canvas; this.title = title; this.unit = unit; this.log = log; this.x = []; this.y = []; this.hover = null;
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); this.hover = e.clientX - r.left; this.redraw(); });
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.redraw(); });
  }
  set(x, y) { this.x = x; this.y = y; }
  redraw() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); }); }      // imleç olayları (yüksek hızlı fare) kare başına tek çizime indirgenir
  // tema renkleri: getComputedStyle stil hesabını zorlar; renkler 1 sn önbelleklenir (tema değişimi yine görünür)
  colors() {
    const now = performance.now();
    if (!this._cols || now - this._colT > 1000) {
      const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
      const cols = { ink2: g('--text-secondary'), grid: g('--grid'), ser: g('--series-1'), s1: g('--surface-1'), s2: g('--surface-2'), ink: g('--text-primary') };
      cols.sig = Object.values(cols).join('|'); this._cols = cols; this._colT = now;
    }
    return this._cols;
  }
  draw() {
    const c = this.c, dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    // yeni örnek, boyut, imleç ya da renk değişmedikçe yeniden çizilmez (HUD her 100 ms'de çağırır)
    const C = this.colors(), n0 = this.x.length, sig = `${n0}:${n0 ? this.x[n0 - 1] : ''}:${n0 ? this.y[n0 - 1] : ''}:${W}x${H}:${dpr}:${this.hover}:${C.sig}`;
    if (sig === this._sig) return; this._sig = sig;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const ink2 = C.ink2, grid = C.grid, ser = C.ser;
    const L = 60, R = 12, T = 22, B = 22;
    g.font = '12px system-ui, sans-serif'; g.fillStyle = ink2; g.textBaseline = 'alphabetic';
    g.fillText(`${this.title} (${this.unit})`, L, 14);
    const n = this.x.length; if (n < 2) return;
    const x0 = this.x[0], x1 = this.x[n - 1] || x0 + 1;
    const fy = this.log ? (v) => Math.log10(Math.max(v, 1e-3)) : (v) => v;
    let ymin = Infinity, ymax = -Infinity; for (const v of this.y) { const f = fy(v); ymin = Math.min(ymin, f); ymax = Math.max(ymax, f); }
    if (this.log) { ymin = Math.floor(ymin); ymax = Math.ceil(ymax); } else { ymin = 0; ymax = ymax * 1.08 || 1; }
    const px = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), py = (f) => T + (1 - (f - ymin) / (ymax - ymin || 1)) * (H - T - B);
    // ızgara + eksen etiketleri
    g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = ink2; g.textAlign = 'right';
    const ticks = this.log ? Array.from({ length: ymax - ymin + 1 }, (_, i) => ymin + i) : [0, 0.25, 0.5, 0.75, 1].map((k) => ymin + k * (ymax - ymin));
    for (const f of ticks) {
      const y = Math.round(py(f)) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
      const v = this.log ? 10 ** f : f; g.fillText(this.log ? (v >= 1 ? fmt(v, 0) : String(v)) : fmt(v, v < 10 ? 1 : 0), L - 6, y + 4);
    }
    g.textAlign = 'center';
    for (let k = 0; k <= 4; k++) { const xv = x0 + (k / 4) * (x1 - x0); g.fillText(fmt(xv, xv < 10 ? 1 : 0) + ' ' + UNIT.h, px(xv), H - 6); }
    // seri
    g.strokeStyle = ser; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i < n; i++) { const X = px(this.x[i]), Y = py(fy(this.y[i])); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.stroke();
    // uç noktası
    const lx = px(this.x[n - 1]), ly = py(fy(this.y[n - 1]));
    g.fillStyle = C.s1; g.beginPath(); g.arc(lx, ly, 6, 0, 7); g.fill();
    g.fillStyle = ser; g.beginPath(); g.arc(lx, ly, 4, 0, 7); g.fill();
    // çapraz imleç + araç ipucu
    if (this.hover != null && this.hover >= L && this.hover <= W - R) {
      const xv = x0 + ((this.hover - L) / (W - L - R)) * (x1 - x0);
      let j = 0; while (j < n - 1 && this.x[j + 1] < xv) j++;
      const X = px(this.x[j]); g.strokeStyle = ink2; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(X) + 0.5, T); g.lineTo(Math.round(X) + 0.5, H - B); g.stroke();
      const val = this.y[j], lab = `${fmt(val, val < 10 ? 3 : 0)} ${this.unit}`, sub = `T+${fmt(this.x[j], 2)} ${UNIT.h}`;
      g.font = '600 12px system-ui, sans-serif'; const w = Math.max(g.measureText(lab).width, g.measureText(sub).width) + 16;
      const bx = Math.min(W - R - w, Math.max(L, X + 8)), by = T + 4;
      g.fillStyle = C.s2; g.fillRect(bx, by, w, 38);
      g.fillStyle = C.ink; g.textAlign = 'left'; g.fillText(lab, bx + 8, by + 16);
      g.font = '12px system-ui, sans-serif'; g.fillStyle = ink2; g.fillText(sub, bx + 8, by + 31);
    }
  }
}
