// Laboratuvar deneyleri için ortak arayüz araçları: adım akordeonu, bilimsel sayı biçimleri, anahtar–değer tablosu ve çok serili grafik (doğrusal/log eksen).
import { fmt } from './format.js';

export const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// bilimsel gösterim: 2,50×10¹⁵ (|x| 1e-3..1e5 arasında düz sayı)
export function sci(x, n = 3) {
  if (!Number.isFinite(x)) return '—'; if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 5) return fmt(x, Math.max(0, Math.min(6, n - 1 - e)));
  const m = x / 10 ** e;
  return `${fmt(m, n - 1)}×10${String(e).split('').map((c) => SUP[c]).join('')}`;
}
export const energyText = (J) => `${sci(J)} J = ${sci(J / 4.184e15)} Mt TNT`;
export function lenText(m) { const a = Math.abs(m); return a >= 1e6 ? `${sci(m / 1000, 3)} km` : a >= 1000 ? `${fmt(m / 1000, a >= 1e5 ? 0 : a >= 1e4 ? 1 : 2)} km` : a >= 1 ? `${fmt(m, a >= 100 ? 0 : 1)} m` : a >= 1e-3 ? `${fmt(m * 1000, 1)} mm` : `${sci(m * 1e6)} µm`; }
export function timeText(s) {
  const a = Math.abs(s); if (!Number.isFinite(s)) return '—';
  return a < 120 ? `${fmt(s, a < 10 ? 1 : 0)} s` : a < 7200 ? `${fmt(s / 60, 1)} dk` : a < 2 * 86400 ? `${fmt(s / 3600, 1)} sa` : a < 730 * 86400 ? `${fmt(s / 86400, 1)} gün` : a < 1e6 * 31557600 ? `${sci(s / 31557600)} yıl` : `${sci(s / 31557600)} yıl`;
}
export const pctText = (x) => `%${fmt(100 * x, Math.abs(x) < 0.1 ? 1 : 0)}`;

// anahtar–değer tablosu: rows [[anahtar, değer, sınıf?, açıklama?]]; açıklama satıra ipucu (tanım/formül) olur
export function kvTable(rows, cls = 'tbl kv2') {
  const tb = mk('table', cls);
  for (const r of rows) {
    if (!r) continue;
    if (r.head) { const tr = mk('tr', 'sec'); const th = mk('th', null, r.head); th.colSpan = 2; tr.appendChild(th); tb.appendChild(tr); continue; }
    const [k, v, c, tip] = r, tr = mk('tr'); if (c) tr.className = c; if (tip) tr.title = tip;
    tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr);
  }
  return tb;
}

// HTML kalıpları (deney sayfaları JS içinde kurulur): adım akordeonu, sayı alanı, seçim kartları
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function stepsHtml(steps) {
  return '<ol class="steps">' + steps.map((st, i) => `<li class="step${i ? ' locked' : ' open'}"><button class="sh" type="button" aria-expanded="${i ? 'false' : 'true'}"${i ? ' disabled' : ''}>`
    + `<span class="sn">${i + 1}</span><span class="st">${st.t}</span><span class="ss">${st.s}</span></button><div class="sb">${st.b}</div></li>`).join('') + '</ol>';
}
export const numF = (label, f, v, unit = '', attrs = '', tip = '') => `<label${tip ? ` title="${esc(tip)}"` : ''}>${label}<span><input data-f="${f}" type="number" value="${v}" step="any" ${attrs}>${unit ? ' ' + unit : ''}</span></label>`;
// radyo kartları: [[değer, başlık, açıklama]]
export const cardsHtml = (name, items, on = items[0][0], cls = '') => `<div class="mseg ${cls}" role="radiogroup">` + items.map(([v, b, sm]) => `<label class="mcard${v === on ? ' on' : ''}"><input type="radio" name="${name}" value="${v}"${v === on ? ' checked' : ''}><span><b>${b}</b>${sm ? `<small>${sm}</small>` : ''}</span></label>`).join('') + '</div>';
export function bindCards(root, name, onChange) {
  const inputs = [...root.querySelectorAll(`input[name="${name}"]`)];
  const sync = () => inputs.forEach((x) => x.closest('.mcard').classList.toggle('on', x.checked));
  inputs.forEach((x) => x.addEventListener('change', () => { sync(); if (onChange) onChange(x.value); }));
  return { get: () => (inputs.find((x) => x.checked) || inputs[0]).value, set: (v) => { inputs.forEach((x) => { x.checked = x.value === v; }); sync(); } };
}
// alan erişimi: f('ad') -> [data-f="ad"], n('ad') -> sayı (boş/geçersiz: NaN)
export function fields(root) {
  const f = (k) => root.querySelector(`[data-f="${k}"]`);
  return { f, n: (k) => { const e = f(k); return e && e.value !== '' ? +e.value : NaN; }, set: (k, v) => { const e = f(k); if (e) e.value = v; } };
}
// iş parçacığında hesap (labwork.js): deney başına bir kanal (ayrı Worker), iptal = kanalın iş parçacığını sonlandır (sonraki çağrıda yeniden kurulur)
const chans = new Map(); let seq = 0;
export function labWork(chan, msg, onProgress) {
  let c = chans.get(chan);
  if (!c) {
    c = { w: new Worker(new URL('./labwork.js', import.meta.url), { type: 'module' }), pend: new Map() }; chans.set(chan, c);
    c.w.onmessage = (e) => { const d = e.data, p = c.pend.get(d.id); if (!p) return; if (d.progress != null) { if (p.onProgress) p.onProgress(d.progress); return; } c.pend.delete(d.id); if (d.error) p.rej(new Error(d.error)); else p.res(d.result); };
    c.w.onerror = (e) => { e.preventDefault(); for (const p of c.pend.values()) p.rej(new Error(e.message || 'iş parçacığı hatası')); c.pend.clear(); c.w.terminate(); chans.delete(chan); };
  }
  const id = ++seq;
  return new Promise((res, rej) => { c.pend.set(id, { res, rej, onProgress }); c.w.postMessage({ ...msg, id }); });
}
export function labWorkCancel(chan) { const c = chans.get(chan); if (!c) return; c.w.terminate(); chans.delete(chan); for (const p of c.pend.values()) p.rej(new Error('iptal')); }

// adım akordeonu: <ol class="steps"> içinde li.step (button.sh > .sn .st .ss, div.sb)
export class Steps {
  constructor(root, onOpen) {
    this.items = [...root.querySelectorAll(':scope > li.step')]; this.onOpen = onOpen; this.enabled = this.items.map((_, i) => i === 0);
    this.items.forEach((li, i) => li.querySelector('.sh').addEventListener('click', () => { if (this.enabled[i]) this.open(i + 1); }));
    this.open(1);
  }
  open(n) {
    this.items.forEach((li, i) => { const on = i + 1 === n; li.classList.toggle('open', on); li.querySelector('.sh').setAttribute('aria-expanded', on ? 'true' : 'false'); });
    this.cur = n; const li = this.items[n - 1];
    redrawIn(li);
    requestAnimationFrame(() => { if (li.offsetParent) li.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
    if (this.onOpen) this.onOpen(n);
  }
  // durum: [{enabled, done, summary, kind?}] — adım numarası tamamlanınca ✓, kind 'good'/'bad' sonuç rengi
  set(n, { enabled, done, summary, kind } = {}) {
    const li = this.items[n - 1], btn = li.querySelector('.sh');
    if (enabled != null) { this.enabled[n - 1] = enabled; btn.disabled = !enabled; li.classList.toggle('locked', !enabled); }
    if (done != null) { li.classList.toggle('done', done); li.querySelector('.sn').textContent = done ? '✓' : String(n); }
    if (summary != null) li.querySelector('.ss').textContent = summary;
    if (kind !== undefined) { li.classList.toggle('good', kind === 'good'); li.classList.toggle('bad', kind === 'bad'); }
  }
}

// ---------------------------------------------------------------- grafik
let colCache = null, colT = 0;
function colors() {
  const now = performance.now();
  if (!colCache || now - colT > 1000) {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    colCache = { ink: g('--text-primary'), ink2: g('--text-secondary'), mut: g('--text-muted'), grid: g('--grid') || '#1f2633' }; colT = now;
  }
  return colCache;
}
export const PALETTE = ['#5ee7ff', '#ffb36b', '#a78bfa', '#34d399', '#f87171', '#f5b93a', '#93c5fd'];
const niceStep = (span, n = 5) => { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
// opts: { series:[{x, y, color?, label?, dash?, width?, dots?}], xlog, ylog, xlabel, ylabel, title, hlines:[{y,label,color}], vlines:[{x,label,color}], xmin, xmax, ymin, ymax, yFmt, xFmt }
export function plot(canvas, o) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return null;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const C = colors(), fx = o.xlog ? (v) => Math.log10(v) : (v) => v, fy = o.ylog ? (v) => Math.log10(v) : (v) => v;
  const ok = (v, log) => Number.isFinite(v) && (!log || v > 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of o.series) for (let i = 0; i < s.x.length; i++) {
    if (!ok(s.x[i], o.xlog) || !ok(s.y[i], o.ylog)) continue;
    const X = fx(s.x[i]), Y = fy(s.y[i]); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  for (const h of o.hlines || []) if (ok(h.y, o.ylog)) { y0 = Math.min(y0, fy(h.y)); y1 = Math.max(y1, fy(h.y)); }
  if (o.xmin != null) x0 = fx(o.xmin); if (o.xmax != null) x1 = fx(o.xmax); if (o.ymin != null) y0 = fy(o.ymin); if (o.ymax != null) y1 = fy(o.ymax);
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null;
  if (x1 - x0 < 1e-12) { x0 -= 1; x1 += 1; } if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
  if (o.ylog) { y0 = Math.floor(y0); y1 = Math.ceil(y1); } else if (o.ymin == null && o.ymax == null) { const pad = 0.06 * (y1 - y0); y0 -= y0 === 0 ? 0 : pad; y1 += pad; }
  if (o.xlog) { x0 = Math.floor(x0); x1 = Math.ceil(x1); }
  const L = 48, R = 10, T = o.title ? 20 : 8, B = o.xlabel ? 32 : 20;
  const px = (X) => L + (X - x0) / (x1 - x0) * (W - L - R), py = (Y) => T + (1 - (Y - y0) / (y1 - y0)) * (H - T - B);
  g.font = '11px system-ui, sans-serif'; g.lineWidth = 1;
  // doğrusal eksen: adımın ondalığına göre (dar aralıkta 12,1 · 12,2 …), çok büyük/küçükte bilimsel; log eksen: 10'un kuvvetleri
  const linTxt = (v, st) => { const a = Math.abs(v); if (v === 0) return '0'; if (a >= 1e5 || a < 1e-3) return sci(v, 2); return fmt(v, Math.max(0, Math.min(4, -Math.floor(Math.log10(st) + 1e-9)))); };
  const tickTxt = (v, log, f, st) => (log ? (Math.abs(v) <= 4 ? fmt(10 ** v, v < 0 ? -v : 0) : `10${String(v).split('').map((c) => SUP[c]).join('')}`) : f ? f(v) : linTxt(v, st));
  const ticks = (a, b, log) => { if (log) { const out = []; const st = Math.max(1, Math.ceil((b - a) / 6)); for (let v = Math.ceil(a); v <= b + 1e-9; v += st) out.push(v); return out; } const s = niceStep(b - a), out = []; for (let v = Math.ceil(a / s) * s; v <= b + 1e-9 * s; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v); out.step = s; return out; };
  g.strokeStyle = C.grid; g.fillStyle = C.mut;
  const ty = ticks(y0, y1, o.ylog), tx = ticks(x0, x1, o.xlog);
  g.textAlign = 'right'; for (const v of ty) { const y = Math.round(py(v)) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(tickTxt(v, o.ylog, o.yFmt, ty.step), L - 4, y + 4); }
  g.textAlign = 'center'; for (const v of tx) { const x = Math.round(px(v)) + 0.5; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.fillText(tickTxt(v, o.xlog, o.xFmt, tx.step), x, H - B + 13); }
  g.fillStyle = C.ink2; g.textAlign = 'left'; if (o.title) g.fillText(o.title, 4, 12);
  if (o.xlabel) { g.textAlign = 'center'; g.fillText(o.xlabel, L + (W - L - R) / 2, H - 3); }
  if (o.ylabel) { g.save(); g.translate(10, T + (H - T - B) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(o.ylabel, 0, 0); g.restore(); }
  g.save(); g.beginPath(); g.rect(L, T, W - L - R, H - T - B); g.clip();
  (o.hlines || []).forEach((h, k) => {                                               // yakın eşik etiketleri üst üste binmesin: sırayla sağa/sola
    if (!ok(h.y, o.ylog)) return; const y = py(fy(h.y));
    g.setLineDash([4, 4]); g.strokeStyle = h.color || '#e66767'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.setLineDash([]);
    if (h.label) { g.fillStyle = h.color || '#e66767'; const left = k % 2 === 1; g.textAlign = left ? 'left' : 'right'; g.fillText(h.label, left ? L + 4 : W - R - 3, y - 3); }
  });
  for (const v of o.vlines || []) {
    if (!ok(v.x, o.xlog)) continue; const x = px(fx(v.x));
    g.setLineDash([3, 3]); g.strokeStyle = v.color || C.mut; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.setLineDash([]);
    if (v.label) { g.fillStyle = v.color || C.mut; g.textAlign = 'left'; g.fillText(v.label, x + 3, T + 10); }
  }
  o.series.forEach((s, k) => {
    const col = s.color || PALETTE[k % PALETTE.length];
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s.width || 1.6; if (s.dash) g.setLineDash(s.dash);
    if (s.dots) { for (let i = 0; i < s.x.length; i++) if (ok(s.x[i], o.xlog) && ok(s.y[i], o.ylog)) { g.beginPath(); g.arc(px(fx(s.x[i])), py(fy(s.y[i])), s.r || 1.6, 0, 7); g.fill(); } }
    else { g.beginPath(); let pen = false; for (let i = 0; i < s.x.length; i++) { if (!ok(s.x[i], o.xlog) || !ok(s.y[i], o.ylog)) { pen = false; continue; } const X = px(fx(s.x[i])), Y = py(fy(s.y[i])); if (pen) g.lineTo(X, Y); else { g.moveTo(X, Y); pen = true; } } g.stroke(); }
    g.setLineDash([]); g.lineWidth = 1;
  });
  g.restore();
  const named = o.series.filter((s) => s.label);
  if (named.length) {                                                                  // gösterge: sağ üst
    g.textAlign = 'left'; let y = T + 12; const xL = W - R - 8 - Math.max(...named.map((s) => g.measureText(s.label).width)) - 16;
    named.forEach((s) => { const k = o.series.indexOf(s); g.fillStyle = s.color || PALETTE[k % PALETTE.length]; g.fillRect(xL, y - 7, 10, 3); g.fillStyle = C.ink2; g.fillText(s.label, xL + 14, y - 3); y += 14; });
  }
  return { px, py, fx, fy };
}
// görünür olunca/boyut değişince yeniden çiz: ResizeObserver + adım açılınca eşzamanlı çizim (Steps.open; yavaş karelerde RO gecikebilir)
export function autoPlot(canvas, getOpts) {
  const draw = () => { const o = getOpts(); if (o) plot(canvas, o); };
  canvas.ls19Draw = draw;
  if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas);
  if (canvas.isConnected && canvas.clientWidth) draw();
  return draw;
}
export function redrawIn(el) { el.querySelectorAll('canvas').forEach((c) => { if (c.ls19Draw && c.clientWidth && c.width !== Math.round(c.clientWidth * (window.devicePixelRatio || 1))) c.ls19Draw(); }); }
