// "Çarpma" sekmesi: Dünya'ya çarpma / yeniden giriş tahmini
//  • Uydular: yörünge bozunmasından tahmini yeniden giriş yılı (manevrasız); seçilince yükseklik-zaman eğrisi
//  • Asteroitler: JPL Sentry sanal çarpıcıları (olasılık, olası yıllar); seçilince N-cisim taraması için Saptırma laboratuvarı
import { fmtReentry, fmtSpan, fmtDate, sentryRows, fmtOdds, ageYears, controlNote, selectSats, CONF_TR, KLASS_TR } from './impact.js';
import { loadHist, histData, decayOf } from './decayhist.js';
import { fmt } from './format.js';
import { SAT_GROUPS } from './satlayer.js';
import { $, mk } from './uiutil.js';
import { LOC } from './i18n.js';

const DOT = { high: '#34d399', mid: '#f5b93a', low: '#8591a3' };
const KLASS_LONG = { kept: 'yörüngesi korunuyor', free: 'serbestçe bozunuyor', unknown: 'belirsiz' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
// 2.94e-6 -> "2,94×10⁻⁶" (arayüz dilinin ondalık ayracıyla)
const sci = (x) => { if (!(x > 0)) return '—'; const [m, e] = x.toExponential(2).split('e'); return `${fmt(+m, 2)}×10${+e < 0 ? '⁻' : ''}${String(Math.abs(+e)).replace(/\d/g, (c) => SUP[c])}`; };
const diam = (D, d = 1) => (D == null ? '—' : D >= 1 ? `${fmt(D, d)} km` : `${Math.round(D * 1000)} m`);
const HORIZON = { all: Infinity, d30: 30, y1: 365.25, y5: 5 * 365.25, y25: 25 * 365.25, y100: 100 * 365.25 };
const LIMIT = 80;

export class ImpactUI {
  constructor({ sats, asts, astui, follow }) {
    this.sats = sats; this.asts = asts; this.astui = astui; this.follow = follow;
    this.mode = 'sat'; this.res = null; this.doneFor = null; this.selId = null;
    $('#cpGroup').append(...[['all', 'Tüm gruplar'], ...SAT_GROUPS.map((g, i) => [String(i), g.name])].map(([v, t]) => { const o = mk('option', null, t); o.value = v; return o; }));
    document.querySelectorAll('#cpMode button').forEach((b) => b.addEventListener('click', () => { this.mode = b.dataset.m; this.render(); }));
    for (const id of ['#cpGroup', '#cpCtl', '#cpHorizon', '#cpSatQ', '#cpSort', '#cpYear', '#cpAstQ']) $(id).addEventListener(id.endsWith('Q') ? 'input' : 'change', () => this.renderList());
  }
  // sekme açıldığında: geçmiş yörünge özeti (decayhist.js) inince hesap başlar; inemezse yalnız yaş süzgeci kullanılır
  open() { loadHist().then(() => this.render()); }
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
    $('#cpSatList').replaceChildren(); $('#cpSatDet').hidden = true; this.selId = null;                 // eski katalogdan kalan liste ve seçim
    const step = () => {
      if (this.doneFor !== omm) return;
      const t0 = performance.now();
      while (i < omm.length && performance.now() - t0 < 12) { const o = omm[i++]; res.push({ o, id: +o.NORAD_CAT_ID, ...decayOf(o, now, false) }); }
      $('#cpSatSum').textContent = `Yörünge bozunması hesaplanıyor… ${i.toLocaleString(LOC)} / ${omm.length.toLocaleString(LOC)}`;
      if (i < omm.length) setTimeout(step, 0); else { this.groupOf = new Map((this.sats.ids || []).map((id, k) => [+id, this.sats.groups[k]])); this.renderList(); }
    };
    step();
  }
  renderList() { if (this.mode === 'sat') this.renderSatList(); else this.renderAstList(); }
  renderSatList() {
    const omm = this.sats.gp || this.sats.omm;
    if (omm && omm.length && this.doneFor !== omm) { this.computeSats(); return; }                   // katalog yenilendi: eski sonuçla süzme, yeniden hesapla
    if (!this.res || !omm || this.res.length < omm.length) return;                                    // hesap sürüyor
    const now = Date.now(), ctl = $('#cpCtl').value, days = (x) => (x.r.reentryMs - now) / 864e5, ageOf = (x) => ageYears(x.o, now);
    const { sel, live, alive, byHist, minAge, stale, nKept, n1, n5, nHigh } = selectSats(this.res, { now, ctl, group: $('#cpGroup').value, horizonDays: HORIZON[$('#cpHorizon').value], q: $('#cpSatQ').value, groupOf: (id) => this.groupOf.get(id) });
    $('#cpSatSum').innerHTML = `${byHist ? 'Son ~14 ayda <b>hiç yükseltme yapmadan serbestçe alçalan</b> (gözlenen bozunma B*\'la uyumlu)' : minAge > 0 ? `Fırlatmadan ≥ ${minAge} yıl geçmiş, <b>kontrolsüz olabilecek</b>` : 'Tüm aktif katalogda (manevrasız senaryo)'} <b>${live.length.toLocaleString(LOC)}</b> cisim${minAge > 0 || byHist ? ` (katalogda bozunan ${alive.length.toLocaleString(LOC)} cisimden)` : ''} · <b>${n1.toLocaleString(LOC)}</b> tanesi 1 yıl, <b>${n5.toLocaleString(LOC)}</b> tanesi 5 yıl içinde yeniden girer · ${nHigh.toLocaleString(LOC)} cisim çok yüksek yörüngede (bozunma ihmal edilebilir)${nKept ? ` · yaşı yeterli ama son ~14 ayda yörüngesini koruyan ${nKept.toLocaleString(LOC)} cisim elendi` : ''}${histData() ? '' : ' · geçmiş verisi yüklenemedi (yalnız yaş süzgeci)'}${stale ? ` · ${stale.toLocaleString(LOC)} cismin hesaplanan süresi veri çağından beri dolmuş (veri eski ya da çoktan yeniden girdi)` : ''}`;
    const ul = $('#cpSatList'); ul.replaceChildren();
    for (const x of sel.slice(0, LIMIT)) {
      const li = mk('li', 'cp-li' + (x.id === this.selId ? ' on' : '')), left = mk('div'), rem = days(x);
      const ag = ageOf(x);
      left.append(mk('b', null, x.o.OBJECT_NAME), mk('div', 'k small', `perije ${Math.round(x.r.perigeeKm)} km${x.r.ecc > 0.01 ? ` · apoje ${Math.round(x.r.apogeeKm)} km` : ''}${ag != null ? ` · ${Math.round(ag)} yıllık` : ''}${x.h ? ` · geçmiş: ${KLASS_TR[x.h.ctl.klass]}` : ''}${x.r.deep ? ' · Ay–Güneş etkisi modelde yok' : ''}`));
      const right = mk('div', 'cp-r'), dot = mk('i', 'cp-dot'); dot.style.background = DOT[x.r.conf] || DOT.low; dot.title = 'güven: ' + (CONF_TR[x.r.conf] || CONF_TR.low);
      right.append(mk('div', null, rem <= 0 ? 'şimdi' : rem < 730 ? fmtDate(x.r.reentryMs) : String(new Date(x.r.reentryMs).getUTCFullYear())), mk('div', 'k small', rem <= 0 ? '—' : fmtSpan(rem) + ' sonra')); right.prepend(dot);
      li.append(left, right); li.addEventListener('click', () => this.pickSat(x)); ul.appendChild(li);
    }
    if (sel.length > LIMIT) ul.appendChild(mk('li', 'k small', `… ve ${(sel.length - LIMIT).toLocaleString(LOC)} tane daha (filtreleyin)`));
    if (!sel.length) ul.appendChild(mk('li', 'k small', 'Bu filtreyle eşleşen cisim yok.'));
  }
  pickSat(x) {
    this.selId = x.id; const i = this.sats.indexOf(x.id); if (i >= 0) this.sats.select(i);
    const { h, r } = decayOf(x.o, Date.now(), true), el = $('#cpSatDet'); el.replaceChildren();
    const rows = [['Tahmini yeniden giriş', fmtReentry(r)], ['Kontrol durumu', controlNote(ageYears(x.o), this.groupOf.get(x.id) === 0)], ['Yörünge', `${Math.round(r.perigeeKm)} × ${Math.round(r.apogeeKm)} km · e ${fmt(r.ecc, 4)}`],
      ['Sürüklenme kaynağı', r.method === 'hist' ? `gözlenen a(t) eğimi (${h.segDays.toFixed(0)} gün)${r.ratio ? ` · B*'a oran ${fmt(r.ratio, 2)}` : ''}` : r.method === 'bstar' ? `B* = ${sci(+x.o.BSTAR)}${r.ratio ? ` · gözlenen bozunmayla (MEAN_MOTION_DOT) oran ${fmt(r.ratio, 2)}` : ''}` : 'MEAN_MOTION_DOT (gözlenen bozunma)'], ['Veri çağı (epoch)', fmtDate(r.epochMs)]];
    if (r.deep) rows.splice(1, 0, ['Model sınırı', 'Periyot ≥ 225 dk: perijeyi Ay ve Güneş\'in çekimi değiştirir; bu model yalnız atmosfer sürüklenmesini hesaplar, tahmin güvenilmez']);
    if (h) rows.splice(r.deep ? 3 : 2, 0, ['Geçmiş yörünge (CelesTrak, ~' + Math.round(h.spanDays / 30.4) + ' ay)', this.histText(h)]);
    const tb = mk('table', 'tbl'); for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', 'k', k), mk('td', null, v)); tb.appendChild(tr); } el.appendChild(tb);
    const ser = histData() && histData().seri && histData().seri[x.id];
    if (ser) { const hc = mk('canvas'); hc.id = 'cpHist'; hc.height = 120; el.append(mk('div', 'k small', 'Geçmiş: ortalama irtifa (a − Rₑ) ve gözlenen eğim'), hc); this.drawHist(hc, ser, h); }
    el.append(mk('div', 'k small', 'Tahmin: perije (sarı) ve apoje (mavi) yüksekliği'));
    const cv = mk('canvas'); cv.id = 'cpChart'; cv.height = 150; el.appendChild(cv); this.drawCurve(cv, r);
    const act = mk('div', 'daterow'), b = mk('button', 'sm', 'Kamerayla izle'); b.addEventListener('click', () => this.follow(x.id)); act.appendChild(b); el.appendChild(act);
    el.hidden = false; this.renderSatList();
  }
  histText(h) {
    const c = h.ctl, last = h.lastBoostMs ? `son yükseltme ${fmtDate(h.lastBoostMs)}` : 'yükseltme yok', slope = h.slopeKmDay ? `${fmt(-h.slopeKmDay * 365.25, 1)} km/yıl alçalma` : 'ölçülebilir eğim yok';
    const exp = h.expKmDay > 0 ? ` (B*'tan beklenen ${fmt(h.expKmDay * 365.25, 1)})` : '';
    return `${h.boostCount} manevra · ${last} · ${slope}${exp} → ${KLASS_LONG[c.klass]} (${c.neden})`;
  }
  // a(t) geçmişi: dikey eksen irtifa (a − Rₑ), düz çizgi Theil–Sen eğimi
  drawHist(cv, ser, h) {
    const dpr = window.devicePixelRatio || 1, W = Math.max(240, cv.clientWidth || 320), H = 120; cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const ax = histData().meta.eksen, pts = []; ser.forEach((a, k) => { if (a != null) pts.push([ax[k], a - 6378.135]); });
    if (pts.length < 2) return;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0], ys = pts.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(0.5, (hi - lo) * 0.15), L = 44, B = 16, R = 8, Tp = 8;
    const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), Y = (y) => Tp + (1 - (y - (lo - pad)) / (hi - lo + 2 * pad)) * (H - Tp - B);
    g.fillStyle = '#8591a3'; g.font = '10px "Roboto Mono", monospace'; g.fillText(hi.toFixed(0) + ' km', 2, Y(hi) + 3); g.fillText(lo.toFixed(0) + ' km', 2, Y(lo) + 3);
    g.fillText('0', L, H - 3); g.fillText(Math.round(t1 - t0) + ' gün', W - R - 48, H - 3);
    g.strokeStyle = '#ffd166'; g.lineWidth = 1.5; g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke();
    if (h && h.slopeKmDay) { const yEnd = pts[pts.length - 1][1], yStart = yEnd - h.slopeKmDay * (t1 - t0); g.strokeStyle = '#5ee7ff'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(t0), Y(yStart)); g.lineTo(X(t1), Y(yEnd)); g.stroke(); g.setLineDash([]); }
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
  // canlı katmandaki sıra no; asteroit kataloğu henüz inmediyse ya da inemediyse (Sentry ayrı indirilir) null
  astIndex(des) { const m = this.asts.index; return m ? m.get(des) ?? null : null; }
  renderAstList() {
    const rows = this.astRows; if (!rows) return;
    const lim = +$('#cpYear').value, sort = $('#cpSort').value, q = $('#cpAstQ').value.trim().toLowerCase();
    const label = (d) => { const i = this.astIndex(d.des); return i != null ? this.asts.label(i) : d.des; };
    const sel = rows.filter((d) => (d.y0 == null || d.y0 <= lim) && (!q || label(d).toLowerCase().includes(q)));
    sel.sort(sort === 'ip' ? (a, b) => b.ip - a.ip : sort === 'ps' ? (a, b) => b.ps - a.ps : (a, b) => (a.y0 ?? 9999) - (b.y0 ?? 9999) || b.ip - a.ip);
    const t1 = rows.filter((d) => +d.ts >= 1).length, high = rows.filter((d) => d.ip >= 1e-3).length;
    $('#cpAstSum').innerHTML = `JPL Sentry'de <b>${rows.length.toLocaleString(LOC)}</b> asteroit için sıfır olmayan çarpma olasılığı var · olasılığı ≥ 1/1000 olan: <b>${high}</b> · Torino ≥ 1: <b>${t1}</b>. <b>Kesin çarpacağı bilinen asteroit yok</b>; bunlar yörünge belirsizliğinden doğan olasılıklardır.`;
    const ul = $('#cpAstList'); ul.replaceChildren();
    for (const d of sel.slice(0, LIMIT)) {
      const li = mk('li', 'cp-li' + (d.des === this.selAst ? ' on' : '')), left = mk('div'), right = mk('div', 'cp-r');
      left.append(mk('b', null, label(d)), mk('div', 'k small', `${d.y0 === d.y1 ? d.y0 : d.y0 + '–' + d.y1} · Ø ${diam(d.D)} · ${d.n} sanal çarpıcı`));
      right.append(mk('div', null, fmtOdds(d.ip)), mk('div', 'k small', [d.inYears == null ? null : d.inYears === 0 ? 'bu yıl' : `${`${d.inYears} yıl`} sonra`, `Palermo ${fmt(d.ps, 1)}`, +d.ts >= 1 ? `Torino ${d.ts}` : null].filter(Boolean).join(' · ')));
      li.append(left, right); li.addEventListener('click', () => this.pickAst(d)); ul.appendChild(li);
    }
    if (sel.length > LIMIT) ul.appendChild(mk('li', 'k small', `… ve ${(sel.length - LIMIT).toLocaleString(LOC)} tane daha (filtreleyin)`));
    if (!sel.length) ul.appendChild(mk('li', 'k small', 'Bu filtreyle eşleşen asteroit yok.'));
  }
  pickAst(d) {
    this.selAst = d.des; const i = this.astIndex(d.des), el = $('#cpAstDet'); el.replaceChildren();
    const rows = [['Olası çarpma yılı', d.y0 === d.y1 ? String(d.y0) : `${d.y0} – ${d.y1}`], ['Toplam çarpma olasılığı', `${sci(d.ip)}  (${fmtOdds(d.ip)})`],
      ['Palermo / Torino', `${fmt(d.ps, 2)} / ${d.ts ?? '— (100 yıldan uzak: ölçek uygulanmaz)'}`], ['Çap (tahmini)', diam(d.D, 2)], ['Dünya\'ya varış hızı (v∞)', `${fmt(+d.vinf, 1)} km/s`],
      ['Son gözlem', d.last_obs || '—']];
    const tb = mk('table', 'tbl'); for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', 'k', k), mk('td', null, v)); tb.appendChild(tr); } el.appendChild(tb);
    const note = mk('p', 'note', 'Yıl aralığı, Sentry\'nin yörünge belirsizliği içindeki sanal çarpıcılarının (olası yörüngelerinin) Dünya\'ya çarpabileceği yıllardır. Olasılık, bunların toplamıdır. Gözlem arttıkça çoğu kez sıfıra iner.'); el.appendChild(note);
    const act = mk('div', 'daterow');
    if (i != null) {
      const b1 = mk('button', 'sm', 'Haritada izle'); b1.addEventListener('click', () => this.astui.follow(i));
      const b2 = mk('button', 'sm', 'Laboratuvarda dene (N-cisim taraması)'); b2.addEventListener('click', () => this.astui.openLab(i, { hypo: true }));        // sanal çarpıcı: "çarpacak olsaydı" senaryosuyla başlar
      act.append(b1, b2); this.asts.select(i);
    } else act.appendChild(mk('span', 'k small', 'Bu asteroit canlı katmanda yok (çok sönük/kısa yay).'));
    el.appendChild(act); el.hidden = false; this.renderAstList();
  }
}
