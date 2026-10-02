// "Çarpma" sekmesi: Dünya'ya çarpma / yeniden giriş tahmini
//  • Uydular: yörünge bozunmasından tahmini yeniden giriş yılı (manevrasız); seçilince yükseklik-zaman eğrisi
//  • Asteroitler: JPL Sentry sanal çarpıcıları (olasılık, olası yıllar); seçilince N-cisim taraması için Saptırma laboratuvarı
import { assessSat, fmtReentry, fmtSpan, fmtDate, sentryRows, fmtOdds } from './impact.js';
import { SAT_GROUPS } from './satlayer.js';

const $ = (s) => document.querySelector(s);
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DOT = { yüksek: '#34d399', orta: '#f5b93a', düşük: '#8591a3' };
const HORIZON = { all: Infinity, d30: 30, y1: 365.25, y5: 5 * 365.25, y25: 25 * 365.25, y100: 100 * 365.25 };
const LIMIT = 80;

export class ImpactUI {
  constructor({ sats, asts, astui, follow }) {
    this.sats = sats; this.asts = asts; this.astui = astui; this.follow = follow;
    this.mode = 'sat'; this.res = null; this.doneFor = null; this.selId = null;
    $('#cpGroup').append(...[['all', 'Tüm gruplar'], ...SAT_GROUPS.map((g, i) => [String(i), g.name])].map(([v, t]) => { const o = mk('option', null, t); o.value = v; return o; }));
    document.querySelectorAll('#cpMode button').forEach((b) => b.addEventListener('click', () => { this.mode = b.dataset.m; this.render(); }));
    for (const id of ['#cpGroup', '#cpHorizon', '#cpSatQ', '#cpSort', '#cpYear', '#cpAstQ']) $(id).addEventListener(id.endsWith('Q') ? 'input' : 'change', () => this.renderList());
  }
  // sekme açıldığında
  open() { this.render(); }
  render() {
    document.querySelectorAll('#cpMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === this.mode));
    $('#cpSat').hidden = this.mode !== 'sat'; $('#cpAst').hidden = this.mode !== 'ast';
    if (this.mode === 'sat') this.computeSats(); else this.renderAst();
  }

  // ---------------------------------------------------------------- uydular
  computeSats() {
    const omm = this.sats.gp || this.sats.omm;                                                  // standart GP: SupGP'nin B* değerleri bozunma için güvenilir değil
    if (!omm || !omm.length) { $('#cpSatSum').textContent = 'Uydu verisi henüz yüklenmedi.'; $('#cpSatList').replaceChildren(); return; }
    if (this.doneFor === omm) { this.renderList(); return; }
    this.doneFor = omm; const res = this.res = [], now = Date.now(); let i = 0;
    const step = () => {
      if (this.doneFor !== omm) return;
      const t0 = performance.now();
      while (i < omm.length && performance.now() - t0 < 12) { const o = omm[i++]; res.push({ o, id: +o.NORAD_CAT_ID, r: assessSat(o, now, false) }); }
      $('#cpSatSum').textContent = `Yörünge bozunması hesaplanıyor… ${i.toLocaleString('tr-TR')} / ${omm.length.toLocaleString('tr-TR')}`;
      if (i < omm.length) setTimeout(step, 0); else { this.groupOf = new Map((this.sats.ids || []).map((id, k) => [+id, this.sats.groups[k]])); this.renderList(); }
    };
    step();
  }
  renderList() { if (this.mode === 'sat') this.renderSatList(); else this.renderAstList(); }
  renderSatList() {
    if (!this.res || this.res.length < (this.sats.gp || this.sats.omm || []).length) return;
    const now = Date.now(), g = $('#cpGroup').value, hz = HORIZON[$('#cpHorizon').value], q = $('#cpSatQ').value.trim().toUpperCase();
    const days = (x) => (x.r.reentryMs - now) / 864e5;
    const all = this.res.filter((x) => x.r.durum === 'bozunuyor' || x.r.durum === 'girdi');
    const live = all.filter((x) => x.r.durum === 'girdi' || days(x) > 0), stale = all.length - live.length;     // süresi elemanların çağından beri dolmuş: veri eski (ya da çoktan yeniden girmiş)
    const sel = live.filter((x) => (g === 'all' || this.groupOf.get(x.id) === +g) && days(x) <= hz && (!q || x.o.OBJECT_NAME.toUpperCase().includes(q) || String(x.id) === q));
    sel.sort((a, b) => a.r.reentryMs - b.r.reentryMs);
    const n1 = live.filter((x) => days(x) <= 365.25).length, n5 = live.filter((x) => days(x) <= 5 * 365.25).length, nHigh = this.res.filter((x) => x.r.durum === 'yüksek').length;
    $('#cpSatSum').innerHTML = `<b>${live.length.toLocaleString('tr-TR')}</b> uydu/cisim yörünge bozunmasıyla alçalıyor · <b>${n1.toLocaleString('tr-TR')}</b> tanesi 1 yıl, <b>${n5.toLocaleString('tr-TR')}</b> tanesi 5 yıl içinde yeniden girer (manevra yapılmazsa) · ${nHigh.toLocaleString('tr-TR')} cisim çok yüksek yörüngede (bozunma ihmal edilebilir)${stale ? ` · ${stale.toLocaleString('tr-TR')} cismin hesaplanan süresi veri çağından beri dolmuş (veri eski ya da çoktan yeniden girdi)` : ''}`;
    const ul = $('#cpSatList'); ul.replaceChildren();
    for (const x of sel.slice(0, LIMIT)) {
      const li = mk('li', 'cp-li' + (x.id === this.selId ? ' on' : '')), left = mk('div'), rem = days(x);
      left.append(mk('b', null, x.o.OBJECT_NAME), mk('div', 'k small', `perije ${Math.round(x.r.perigeeKm)} km${x.r.ecc > 0.01 ? ` · apoje ${Math.round(x.r.apogeeKm)} km` : ''}`));
      const right = mk('div', 'cp-r'), dot = mk('i', 'cp-dot'); dot.style.background = DOT[x.r.conf] || DOT.düşük; dot.title = 'güven: ' + x.r.conf;
      right.append(mk('div', null, rem <= 0 ? 'şimdi' : rem < 730 ? fmtDate(x.r.reentryMs) : String(new Date(x.r.reentryMs).getUTCFullYear())), mk('div', 'k small', rem <= 0 ? '—' : fmtSpan(rem) + ' sonra')); right.prepend(dot);
      li.append(left, right); li.addEventListener('click', () => this.pickSat(x)); ul.appendChild(li);
    }
    if (sel.length > LIMIT) ul.appendChild(mk('li', 'k small', `… ve ${(sel.length - LIMIT).toLocaleString('tr-TR')} tane daha (filtreleyin)`));
    if (!sel.length) ul.appendChild(mk('li', 'k small', 'Bu filtreyle eşleşen cisim yok.'));
  }
  pickSat(x) {
    this.selId = x.id; const i = this.sats.indexOf(x.id); if (i >= 0) this.sats.select(i);
    const r = assessSat(x.o, Date.now(), true), el = $('#cpSatDet'); el.replaceChildren();
    const rows = [['Tahmini yeniden giriş', fmtReentry(r)], ['Yörünge', `${Math.round(r.perigeeKm)} × ${Math.round(r.apogeeKm)} km · e ${r.ecc.toFixed(4)}`],
      ['Sürüklenme kaynağı', r.method === 'B*' ? `B* = ${(+x.o.BSTAR).toExponential(2)}${r.ratio ? ` · gözlenen bozunmayla (MEAN_MOTION_DOT) oran ${r.ratio.toFixed(2)}` : ''}` : 'MEAN_MOTION_DOT (gözlenen bozunma)'], ['Veri çağı (epoch)', fmtDate(r.epochMs)]];
    const tb = mk('table', 'tbl'); for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', 'k', k), mk('td', null, v)); tb.appendChild(tr); } el.appendChild(tb);
    const cv = mk('canvas'); cv.id = 'cpChart'; cv.height = 150; el.appendChild(cv); this.drawCurve(cv, r);
    const act = mk('div', 'daterow'), b = mk('button', 'sm', 'Kamerayla izle'); b.addEventListener('click', () => this.follow(x.id)); act.appendChild(b); el.appendChild(act);
    el.hidden = false; this.renderSatList();
  }
  drawCurve(cv, r) {
    const dpr = window.devicePixelRatio || 1, W = Math.max(240, cv.clientWidth || 320), H = 150; cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const C = r.curve; if (!C || C.length < 2) return;
    const tmax = C[C.length - 1][0], useY = tmax > 400, T = (d) => (useY ? d / 365.25 : d), unit = useY ? 'yıl' : 'gün';
    const hs = C.flatMap((c) => [c[1], c[2]]), hmax = Math.ceil(Math.max(...hs) / 50) * 50 + 20, hmin = 100, L = 40, B = 20, R = 8, Tp = 8;
    const X = (d) => L + (T(d) / T(tmax || 1)) * (W - L - R), Y = (h) => Tp + (1 - (h - hmin) / (hmax - hmin)) * (H - Tp - B);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.fillStyle = '#8591a3'; g.font = '10px "Roboto Mono", monospace'; g.lineWidth = 1;
    for (let h = Math.ceil(hmin / 100) * 100; h <= hmax; h += Math.max(50, Math.ceil((hmax - hmin) / 4 / 50) * 50)) { g.beginPath(); g.moveTo(L, Y(h)); g.lineTo(W - R, Y(h)); g.stroke(); g.fillText(String(h), 4, Y(h) + 3); }
    g.fillText('0', L, H - 6); g.fillText(`${T(tmax).toFixed(T(tmax) < 10 ? 1 : 0)} ${unit}`, W - R - 44, H - 6);
    g.strokeStyle = '#f87171'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(L, Y(120)); g.lineTo(W - R, Y(120)); g.stroke(); g.setLineDash([]); g.fillStyle = '#f87171'; g.fillText('120 km · yeniden giriş', L + 4, Y(120) - 4);
    const line = (idx, col) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); C.forEach((c, k) => { const x = X(c[0]), y = Y(c[idx]); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
    if (r.ecc > 0.005) line(2, '#5ee7ff'); line(1, '#ffd166');
  }

  // ---------------------------------------------------------------- asteroitler
  renderAst() {
    const A = this.asts;
    if (!A.sentry || !A.sentry.size) { $('#cpAstSum').textContent = 'Sentry verisi henüz yüklenmedi.'; $('#cpAstList').replaceChildren(); return; }
    this.astRows = sentryRows(A.sentry); this.renderAstList();
  }
  renderAstList() {
    const rows = this.astRows; if (!rows) return;
    const nowY = new Date().getUTCFullYear(), lim = +$('#cpYear').value, sort = $('#cpSort').value, q = $('#cpAstQ').value.trim().toLowerCase();
    const label = (d) => { const i = this.asts.index.get(d.des); return i != null ? this.asts.label(i) : d.des; };
    const sel = rows.filter((d) => (d.y0 == null || d.y0 <= lim) && (!q || label(d).toLowerCase().includes(q)));
    sel.sort(sort === 'ip' ? (a, b) => b.ip - a.ip : sort === 'ps' ? (a, b) => b.ps - a.ps : (a, b) => (a.y0 ?? 9999) - (b.y0 ?? 9999) || b.ip - a.ip);
    const t1 = rows.filter((d) => +d.ts >= 1).length, high = rows.filter((d) => d.ip >= 1e-3).length;
    $('#cpAstSum').innerHTML = `JPL Sentry'de <b>${rows.length.toLocaleString('tr-TR')}</b> asteroit için sıfır olmayan çarpma olasılığı var · olasılığı ≥ 1/1000 olan: <b>${high}</b> · Torino ≥ 1: <b>${t1}</b>. <b>Kesin çarpacağı bilinen asteroit yok</b>; bunlar yörünge belirsizliğinden doğan olasılıklardır.`;
    const ul = $('#cpAstList'); ul.replaceChildren();
    for (const d of sel.slice(0, LIMIT)) {
      const li = mk('li', 'cp-li' + (d.des === this.selAst ? ' on' : '')), left = mk('div'), right = mk('div', 'cp-r');
      left.append(mk('b', null, label(d)), mk('div', 'k small', `${d.y0 === d.y1 ? d.y0 : d.y0 + '–' + d.y1} · Ø ${d.D >= 1 ? d.D.toFixed(1).replace('.', ',') + ' km' : Math.round(d.D * 1000) + ' m'} · ${d.n} sanal çarpıcı`));
      right.append(mk('div', null, fmtOdds(d.ip)), mk('div', 'k small', `${d.inYears == null ? '' : d.inYears === 0 ? 'bu yıl · ' : d.inYears + ' yıl sonra · '}Palermo ${d.ps.toFixed(1).replace('.', ',')}${+d.ts >= 1 ? ' · Torino ' + d.ts : ''}`));
      li.append(left, right); li.addEventListener('click', () => this.pickAst(d)); ul.appendChild(li);
    }
    if (sel.length > LIMIT) ul.appendChild(mk('li', 'k small', `… ve ${(sel.length - LIMIT).toLocaleString('tr-TR')} tane daha (filtreleyin)`));
    if (!sel.length) ul.appendChild(mk('li', 'k small', 'Bu filtreyle eşleşen asteroit yok.'));
    void nowY;
  }
  pickAst(d) {
    this.selAst = d.des; const i = this.asts.index.get(d.des), el = $('#cpAstDet'); el.replaceChildren();
    const rows = [['Olası çarpma yılı', d.y0 === d.y1 ? String(d.y0) : `${d.y0} – ${d.y1}`], ['Toplam çarpma olasılığı', `${d.ip.toExponential(2).replace('e-', '×10⁻')}  (${fmtOdds(d.ip)})`],
      ['Palermo / Torino', `${d.ps.toFixed(2).replace('.', ',')} / ${d.ts}`], ['Çap (tahmini)', d.D >= 1 ? `${d.D.toFixed(2).replace('.', ',')} km` : `${Math.round(d.D * 1000)} m`], ['Dünya\'ya varış hızı (v∞)', `${(+d.vinf).toFixed(1).replace('.', ',')} km/s`],
      ['Son gözlem', d.last_obs || '—']];
    const tb = mk('table', 'tbl'); for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', 'k', k), mk('td', null, v)); tb.appendChild(tr); } el.appendChild(tb);
    const note = mk('p', 'note', 'Yıl aralığı, Sentry\'nin yörünge belirsizliği içindeki sanal çarpıcılarının (olası yörüngelerinin) Dünya\'ya çarpabileceği yıllardır. Olasılık, bunların toplamıdır. Gözlem arttıkça çoğu kez sıfıra iner.'); el.appendChild(note);
    const act = mk('div', 'daterow');
    if (i != null) {
      const b1 = mk('button', 'sm', 'Haritada izle'); b1.addEventListener('click', () => this.astui.follow(i));
      const b2 = mk('button', 'sm', 'N-cisim taramasını aç (Saptırma lab.)'); b2.addEventListener('click', () => { this.astui.openLab(i); setTimeout(() => this.astui.scan(), 300); });
      act.append(b1, b2); this.asts.select(i);
    } else act.appendChild(mk('span', 'k small', 'Bu asteroit canlı katmanda yok (çok sönük/kısa yay).'));
    el.appendChild(act); el.hidden = false; this.renderAstList();
  }
}
