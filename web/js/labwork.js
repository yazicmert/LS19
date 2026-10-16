// Laboratuvar hesap iş parçacığı: uzun süren deney hesapları (iniş benzetimi + SOCP, SGP4 yakın geçiş taraması, yörünge bozunması) arayüzü dondurmasın.
// İleti: { id, kind, ... } → { id, result } | { id, error } ; ara durum: { id, progress: 0..1 | metin }
import { runBench } from './landbench.js';
import { initConic } from './conic.js';
import * as C from './conjunction.js';
import * as S from '../lib/satellite.esm.js';
import { decay, entry, latitudeBand } from './reentry.js';

self.onmessage = async (e) => {
  const m = e.data, post = (o) => self.postMessage({ id: m.id, ...o });
  try {
    let result;
    if (m.kind === 'land') result = await land(m, post);
    else if (m.kind === 'conj-pair') result = pair(m);
    else if (m.kind === 'conj-screen') result = screen(m, post);
    else if (m.kind === 'reentry') result = reentry(m, post);
    else throw new Error('bilinmeyen iş: ' + m.kind);
    post({ result });
  } catch (err) { post({ error: String((err && err.message) || err) }); }
};

// ---------------------------------------------------------------- Ay'a iniş: yasalar sırayla (optimal için konik çözücü yüklenir)
async function land({ P, laws, dt }, post) {
  const out = {};
  for (let k = 0; k < laws.length; k++) {
    if (laws[k] === 'opt') await initConic();
    const t0 = performance.now(), r = runBench(P, laws[k], { dt, rec: 1 });
    r.wallMs = performance.now() - t0; out[laws[k]] = r;
    post({ progress: (k + 1) / laws.length });
  }
  return out;
}

// ---------------------------------------------------------------- SGP4 (TEME, km, km/s); t: t0Ms'den saniye
function propOf(o, t0Ms) {
  const sr = S.json2satrec(o);
  if (!sr || sr.error) throw new Error(`${o.OBJECT_NAME || o.NORAD_CAT_ID}: GP kaydı SGP4'e uygun değil`);
  return (t) => { const pv = S.propagate(sr, new Date(t0Ms + t * 1000)); return pv && pv.position && Number.isFinite(pv.position.x) ? { r: [pv.position.x, pv.position.y, pv.position.z], v: [pv.velocity.x, pv.velocity.y, pv.velocity.z] } : null; };
}
// kaba ızgara noktalarını önbellekleyen yayılım (birincil cisim her adayda yeniden hesaplanmasın)
function gridCache(prop, dt) { const memo = new Map(); return (t) => { if (t % dt === 0) { let s = memo.get(t); if (s === undefined) { s = prop(t); memo.set(t, s); } return s; } return prop(t); }; }
// TCA çevresinde uzaklık eğrisi (grafik için)
function curveAround(pa, pb, t, half = 300, n = 121) {
  const out = [];
  for (let i = 0; i < n; i++) { const tt = t - half + (2 * half * i) / (n - 1), a = pa(tt), b = pb(tt); if (a && b) out.push([tt - t, Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1], a.r[2] - b.r[2])]); }
  return out;
}
const ev = (x, pa, pb, extra = {}) => ({ t: x.t, miss: x.miss, a: pa(x.t), b: pb(x.t), curve: curveAround(pa, pb, x.t), ...extra });

// iki belirli cisim: pencere boyunca tüm yerel en yakın yaklaşmalar (en yakın 12'si)
function pair({ a, b, t0Ms, hours, dt = 20 }) {
  const pa = propOf(a, t0Ms), pb = propOf(b, t0Ms), T = hours * 3600;
  if (C.coorbital(pa, pb, 0, T)) return { coorbital: true, events: [] };
  const all = C.findTCAs(pa, pb, 0, T, dt).sort((x, y) => x.miss - y.miss);
  return { coorbital: false, n: all.length, events: all.slice(0, 12).map((x) => ev(x, pa, pb)) };
}
// birincil cisme karşı aday listesi: apoje/perije süzgeci → eş yörünge ayıklama → TCA araması (gate km)
function screen({ primary, cands, t0Ms, hours, gate = 10, dt = 60 }, post) {
  const T = hours * 3600, pA = C.perApo(primary), pa = gridCache(propOf(primary, t0Ms), dt), margin = gate + 25;
  const keep = cands.filter((o) => { const q = C.perApo(o); return +o.NORAD_CAT_ID !== +primary.NORAD_CAT_ID && q.hp < pA.ha + margin && q.ha > pA.hp - margin; });
  const events = [], coorb = [], bad = [];
  let lastPost = 0;
  for (let i = 0; i < keep.length; i++) {
    const o = keep[i];
    let pb; try { pb = propOf(o, t0Ms); } catch (err) { bad.push(o.OBJECT_NAME); continue; }
    if (C.coorbital(pa, pb, 0, T)) { coorb.push(o.OBJECT_NAME); continue; }
    for (const x of C.findTCAs(pa, pb, 0, T, dt, gate)) events.push({ x, o, pb });
    const now = performance.now(); if (now - lastPost > 150) { lastPost = now; post({ progress: (i + 1) / keep.length }); }
  }
  events.sort((p, q) => p.x.miss - q.x.miss);
  return { total: cands.length, screened: keep.length, coorbital: coorb, bad, nEvents: events.length,
    events: events.slice(0, 40).map(({ x, o, pb }) => ev(x, pa, pb, { name: o.OBJECT_NAME, norad: +o.NORAD_CAT_ID, omm: o })) };
}

// ---------------------------------------------------------------- yeniden giriş: Güneş etkinliği senaryoları + giriş profili + enlem bandı
function reentry({ a0, e0, BC, model, F107s, Ap, inc, rn, gamma0, maxYears = 100 }, post) {
  const runs = [];
  const levels = model === 'gunes' ? F107s : [null];
  levels.forEach((F, k) => { runs.push({ F107: F, ...decay({ a0, e0, BC, model, F107: F ?? 150, Ap, maxYears }) }); post({ progress: (k + 1) / (levels.length + 1) }); });
  const v120 = Math.sqrt(398600.4418 / (6378.137 + 120));                                     // 120 km'de dairesel hız (bozunan yörünge bu hızla girer)
  const en = entry({ v0: v120, gamma0Deg: gamma0, BC, rn });
  return { runs, entry: en, band: latitudeBand(inc, 36) };
}
