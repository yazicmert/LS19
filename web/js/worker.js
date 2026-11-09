// LS19 fizik iş parçacığı (Web Worker): görev + motor burada koşar, ana iş parçacığı yalnız çizer.
import * as E from './engine.js';
import * as EO from './earth.js';
import { Mission, R_SITE, STAGES, LANDING_MODES } from './mission.js';
import { initConic, conicReady } from './conic.js';
import { makeLive, etOf } from './live.js';
import { EphStore } from './ephstore.js';
import { designMission } from './design.js';
import { EventScanner, hermitePos, scanPath } from './groundnet.js';

let K = null, DESIGN = null, T_START = 0, landingMode = 'opt', conicErr = null;     // landingMode: iniş güdümü (LANDING_MODES); konik çözücü yüklenemezse ZEM kullanılır
async function loadKernels() {
  if (K) return K;
  const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
  // JPL çekirdekleri parçalı depodan (ephstore.js): yalnız görevin yılının kayıtları iner (setupDate), tam dosyalar değil
  const [eph, eo, def] = await Promise.all([EphStore.open(new URL('../data/eph/v1/', import.meta.url).href),
    get('earth_orient.json').then((r) => r.json()), get('design_default.json').then((r) => r.json()).catch(() => null)]);
  K = { spk: eph.spk, pck: eph.pck, eph, eo, def }; EO.loadEarthOrientation(eo);
  try { await initConic(); } catch (err) { conicErr = String(err.message || err); }
  return K;
}
// UTC ms -> motor zamanı (TDB s), sağlayıcıdan bağımsız
function tOfUtcMs(ms) { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; }
// d: { startMs, tStart?, design?, nominal? } — tasarım normalde ana iş parçacığından hazır gelir;
// gelmezse (eski istemci) burada hesaplanır
async function setupDate(d) {
  await loadKernels();
  if (d.landing && LANDING_MODES[d.landing]) landingMode = d.landing;
  const startMs = d.startMs;
  const def = !d.design && K.def && Math.abs(K.def.startMs - startMs) < 1000 ? K.def : null;
  T_START = d.design ? d.tStart : def ? def.tStart : tOfUtcMs(startMs) - 86400;   // efemeris başlangıcı: seçilen günden 1 gün önce
  await K.eph.ensure(etOf(T_START) - 86400, etOf(T_START) + 120 * 86400);       // efemeris başlangıcı + görev süresi (ana iş parçacığıyla aynı pencere)
  makeLive(K.spk, K.pck, K.eo, T_START);
  let nominal = null;
  if (d.design) { DESIGN = d.design; nominal = d.nominal || null; }
  else if (def) { DESIGN = def.design; nominal = def.nominal || null; }
  else DESIGN = designMission(tOfUtcMs(startMs), (msg, frac) => postMessage({ type: 'designProgress', msg, frac }), d.cfg);
  E.setMoonZone(DESIGN.profile === 'HALO' ? 1.25 * DESIGN.HALO.stats.raKm : E.SOI_M);
  newMission(); paused = true;
  postMessage({ type: 'ready', t0: M.P.s.t, plan: M.plan, stages: DESIGN.STAGES || STAGES, design: DESIGN, tStart: T_START, startMs, nominal, landing: landingMode, optimalOk: conicReady(), optimalErr: conicErr });
}

let M = null, tDisp = 0, warp = 1, autoWarp = true, paused = true, maxWarp = 20000;
let manual = { throttle: 0, mode: 'PRO', hold: null };
let lastReal = 0, status = '', timer = null, sentEvents = 0;
let nbody = true, forces = null, lastForces = -1e9;                // çözücü: true N-cisim (tek çerçeve), false etki küresi; kuvvet dökümü (~2 Hz)
const TICK_MS = 1000 / 60;

let trailPending = [], trailLast = null, trailReset = true;
function sampleTrail() {
  const h = M.hist[M.hist.length - 1]; if (!h) return;
  const rm = E.moonPos(h.t), rs = E.sub(h.r, rm), nearM = E.norm(rs) < E.MOON_ZONE;
  const p = nearM ? rs : h.r, step = nearM ? Math.max(0.5, E.norm(rs) * 0.004) : Math.max(2, E.norm(h.r) * 0.003);
  const dtLog = Math.max(1, 0.003 * (h.t - M.t0));          // grafikler için log-zaman örneklemesi
  if (!trailLast || trailLast.c !== nearM || E.norm(E.sub(p, trailLast.p)) > step || h.t - trailLast.t > dtLog) {
    trailPending.push({ t: h.t, r: h.r, v: h.v, thr: h.thr, ph: h.phase }); trailLast = { p, c: nearM, t: h.t };          // ph: grafik irtifa tanımı (motorlu inişte iniş yeri)
  }
}
// ------------------------------------------------------------------ gösterim olayları (fizik değil): iletişim ve gölge (groundnet.js)
// Gerçekleşen: her fizik adımında araç geçmişi taranır (LOS/AOS, istasyon/ağ devri, gölge giriş/çıkış; ikiye bölmeyle ~0,5 s); olay ekran saati geçince gönderilir.
// Öngörü: araç itkisizken şimdiki durumdan N-cisim yayınımla (Dünya, Ay, Güneş; çözücü seçiminden bağımsız) sıradaki büyük yakışa dek yol ve o yoldaki olaylar.
let scan = null, scanLast = null, dispPending = [];
function scanHook() {
  const H = M.hist, b = H[H.length - 1]; if (!b) return;
  if (!scan) { scan = new EventScanner(); scan.start(b.t, b.r); scanLast = b; return; }
  if (b.t < scan.t - 1e-6) {                                               // geri sarma (elle uçuş, bozulma): ekranın ötesindeki olaylar geçersiz
    dispPending = dispPending.filter((e) => e.t <= b.t); scan.start(b.t, b.r, { losT: scan.losT, shT: scan.shT }); scanLast = b; return;
  }
  if (b.thr > 0 && b.t - scanLast.t < 2) return;                         // yakışta (0,05 s adımlar) en çok 2 s'de bir
  dispPending.push(...scan.scan(b.t, hermitePos(scanLast, b))); scanLast = b;
}
const MAJOR = /^(TLI|LOI|NRI|DEP|DOI|PDI|INDI|SEP2|RAISE-\d+)$/, FC_MAX = 6 * 86400;
let fc = null, fcVer = 0, fcSent = -1, fcReal = -1e9;
function makeForecast(x) {
  const done = new Set(M.events.map((e) => e.key)), nx = M.plan.find((p) => p.t > x.t + 30 && MAJOR.test(p.key) && !done.has(p.key) && !done.has(p.key + '_SKIP'));
  const tBurn = nx ? nx.t : x.t + FC_MAX, tEnd = Math.min(x.t + FC_MAX, tBurn + (nx && /^(LOI|NRI)$/.test(nx.key) ? 900 : 0));   // Ay'a varışta en yakın geçiş dahil
  if (tEnd - x.t < 120) return null;
  const rm = E.moonPos(x.t), nearM = E.norm(E.sub(x.r, rm)) < E.MOON_ZONE, mu = nearM ? E.MU_M : E.MU_E;
  const el = nearM ? E.elements(E.sub(x.r, rm), E.sub(x.v, E.moonVel(x.t)), mu) : E.elements(x.r, x.v, mu);
  const hMax = el.e < 1 && el.a > 0 ? Math.max(20, Math.min(600, 2 * Math.PI * Math.sqrt(el.a ** 3 / mu) / 120)) : 600;
  const Q = new E.Propagator(new E.State(x.t, x.r, x.v, 'E'), E.dummyVehicle(), hMax, 1.0, { nbody: true }), pts = [{ t: x.t, r: x.r.slice(), v: x.v.slice() }];
  Q.onStep = (P) => { const [r, v] = P.s.geo(); pts.push({ t: P.s.t, r, v }); };
  const t0 = performance.now();
  Q.runUntil(tEnd, null, () => pts.length > 3000 || performance.now() - t0 > 150);
  // Ay'a en yakın geçiş (örnekler arası Hermite ile 1 s'ye dek)
  let ca = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], f = hermitePos(a, b), dist = (t) => E.norm(E.sub(f(t), E.moonPos(t)));
    let lo = a.t, hi = b.t; for (let k = 0; k < 40 && hi - lo > 1; k++) { const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (dist(m1) < dist(m2)) hi = m2; else lo = m1; }
    const tm = 0.5 * (lo + hi), d = dist(tm); if (!ca || d < ca.d) ca = { t: tm, d, r: f(tm) };
  }
  const ev = scanPath(pts, scan ? { losT: scan.losT, shT: scan.shT } : {}).filter((e) => e.t > x.t && e.t <= tBurn);
  const flat = new Float64Array(pts.length * 4); pts.forEach((p, i) => { flat[4 * i] = p.t; flat[4 * i + 1] = p.r[0]; flat[4 * i + 2] = p.r[1]; flat[4 * i + 3] = p.r[2]; });
  return { ver: ++fcVer, t0: x.t, t1: pts[pts.length - 1].t, tBurn, burn: nx ? nx.key : null, pts: flat, ev, ca: ca && ca.d < E.MOON_ZONE ? { t: ca.t, d: ca.d, r: ca.r } : null, nev: M.events.length, tRefresh: x.t + Math.min(0.25 * (tEnd - x.t), 6 * 3600) };
}
// öngörü yalnız itkisiz süzülürken; yakış başlayınca, olay (yakış, bozulma) eklenince ya da süresinin dörtte biri geçince yenilenir (en çok saniyede bir)
function forecastTick(x, now) {
  const coasting = !(x.thr > 0) && !M.done && !(M.P.lastThr > 0 && M.P.s.t - x.t < 5);
  if (!coasting) { if (fc) { fc = null; fcVer++; } return; }
  if ((!fc || M.events.length !== fc.nev || x.t > fc.tRefresh || x.t < fc.t0 - 1) && now - fcReal > 1000) {
    fcReal = now;
    try { fc = makeForecast(x); } catch (err) { fc = null; }
    if (!fc) fcVer++;
  }
}
// durum iletisine eklenenler: yeni gerçekleşen gösterim olayları (ekran saatine dek) ve değiştiyse öngörü
function obsTick(x, now) {
  forecastTick(x, now);
  let i = 0; while (i < dispPending.length && dispPending[i].t <= x.t + 1e-6) i++;
  const out = { disp: dispPending.splice(0, i) };
  if (fcSent !== fcVer) { fcSent = fcVer; out.fc = fc; }
  return out;
}

function newMission() {
  M = new Mission({ design: DESIGN, nbody, landing: conicReady() ? landingMode : 'zem' });
  M.attachHistory();
  scan = null; scanLast = null; dispPending = []; fc = null; fcVer++; fcReal = -1e9;
  const push = M.P.onStep; M.P.onStep = (...a) => { push(...a); sampleTrail(); scanHook(); };
  tDisp = M.P.s.t; sentEvents = 0; status = '';
  trailPending = []; trailLast = null; trailReset = true; sampleTrail();
  manual = { throttle: 0, mode: 'PRO', hold: null };
}
const MODE_TR = { PRO: 'ileri', RETRO: 'geri', NML: 'normal', ANML: 'anti-normal', RADOUT: 'radyal dış', RADIN: 'radyal iç', SRFRETRO: 'yüzeye göre geri', HOLD: 'sabit' };
function endManualBurn() {
  const dv = (M.P.dvUsed - (manual.dv0 ?? M.P.dvUsed)) * 1000; manual.dv0 = null;
  if (dv > 0.01) M.log(`Elle yakış (${MODE_TR[manual.mode] || manual.mode}): Δv=${dv.toFixed(2)} m/s`, 'MANUAL', { dvm: dv });
}
function seek(t) {
  newMission();
  const t0 = performance.now();
  while (M.P.s.t < t - 1e-9 && !M.done && performance.now() - t0 < 20000) {
    if (M.advance(t, 20000, null, () => performance.now()) === 'DONE') break;
  }
  if (M.done && M.surf && t > M.P.s.t) M.surfaceAdvance(t);       // temastan sonraya atlama: yüzey evresi
  tDisp = Math.min(t, M.P.s.t);
}

// otomatik zaman hızı: sıradaki olaya ~4 s gerçek zamanda yaklaş, yakışta yavaşla
function burnWarp(phase) {
  if (/^RAISE-/.test(phase)) return 10;
  switch (phase) {
    case 'TLI': return 10; case 'LOI': return 10; case 'DOI': return 2;
    case 'PDI': return 4; case 'YAKLASMA': return 1; case 'SON_INIS': return 1;
    default: return 5;
  }
}
// otomatik zaman hızı yönelim manevrası sürerken (yakış öncesi hizalama, yakış sonrası ileri yöne dönüş: komutla eksen arası > 8°) en çok ×SLEW_WARP: dönme izlenebilsin
const SLEW_WARP = 5, SLEW_DEG = 8 * Math.PI / 180;
function chooseWarp(x) {
  if (!M.auto && manual.throttle > 0) return Math.min(warp, 10);     // elle yakışta en çok ×10
  if (!autoWarp) return warp;
  if (!M.auto) return Math.min(warp, x.thr > 0 ? 10 : maxWarp);
  let w;
  if (x.thr > 0) w = burnWarp(x.phase);
  else if (x.phase === 'PDI' || x.phase === 'YAKLASMA' || x.phase === 'SON_INIS' || x.phase === 'INDI') w = 1;
  else { const tn = M.tNext; w = tn == null || tn <= tDisp ? 5 : Math.max(1, Math.min(maxWarp, (tn - tDisp) / 4)); }
  return M.P.att && M.P.lastTheta > SLEW_DEG ? Math.min(w, SLEW_WARP) : w;
}

// elle uçuş: seçili yön moduna (ileri, geri, normal…) itkisiz de dönülür (gaz 0 ile verilen yön yalnız yönelim komutudur); itki gerçek yönelim ekseni boyunca uygulanır
function manualCtrl(P) {
  const u = M.manualDir(manual.mode, manual.hold);
  return [Math.max(0, manual.throttle), u];
}

function tick() {
  const now = performance.now();
  const dtReal = Math.min(0.1, (now - lastReal) / 1000); lastReal = now;
  if (!M) return;
  let x = M.stateAt(tDisp) || M.hist[M.hist.length - 1];
  const wEff = chooseWarp(x);
  let res = null;
  if (!paused && (!M.done || M.surf)) {                         // temastan sonra saat işlemeye devam eder: araç Ay yüzeyinde (M.surfaceAdvance), olay çizelgesi sürer
    const tTarget = tDisp + dtReal * wEff;
    res = M.advance(tTarget, 12, manualCtrl, () => performance.now());
    if (res === 'COMPUTE') status = M.status;
    else status = M.status || '';
    // ekran zamanı: fizik geride kalırsa (ağır hesap) onu bekle
    tDisp = Math.min(tTarget, M.P.s.t);
    if (M.done) tDisp = Math.max(tDisp, M.P.s.t);
  }
  M.pruneHistory(tDisp);
  x = M.stateAt(tDisp);
  if (!x) return;
  // ayrılan kademeler: her biri kendi yörüngesinde ve ayrıldığı andaki (eylemsiz sabit) yönelimiyle; stage: en son ayrılanın konumu (işaretçi, etiket)
  const debris = M.debris.filter((d) => d.t <= tDisp + 1e-6).map((d) => { if (d.P.s.t < tDisp) d.P.runUntil(tDisp); return { id: d.id, kind: d.kind, name: d.name, r: d.P.s.geo()[0], q: M.debrisQ(d, tDisp) }; });      // fizik ekranın önündeyse henüz ayrılmamış kademe çizilmez
  const stage = debris.length ? debris[debris.length - 1].r : null;
  // yerel iniş verisi (iniş yerine yakınken)
  let local = null;
  const rm = E.moonPos(x.t), vm = E.moonVel(x.t);
  const rs = E.sub(x.r, rm), vs = E.sub(x.v, vm);
  if (E.norm(rs) - R_SITE < 300) {
    const L = M.localState(x.t, rs, vs);
    local = { p: L.p, v: L.v };
  }
  const newEv = M.events.filter((e, i) => i >= sentEvents && e.t <= tDisp + 1e-6);
  sentEvents += newEv.length;
  let i = 0; while (i < trailPending.length && trailPending[i].t <= tDisp) i++;
  const trail = trailPending.splice(0, i), reset = trailReset; trailReset = false;
  if (now - lastForces > 400) {                                  // kuvvet dökümü: Dünya, Ay, Güneş ve diğer etkiler (m/s²); itki ivmesi eklenir
    lastForces = now;
    try { forces = E.accelBreakdown(x.t, x.r, 'N'); const st = M.veh.stages[x.k]; forces.thrust = st && x.thr > 0 ? (1000 * x.thr * st.T) / x.m : 0; } catch (err) { forces = null; }
  }
  postMessage({ ...obsTick(x, now), type: 'state', t: x.t, r: x.r, v: x.v, m: x.m, prop: x.prop, k: x.k, thr: x.thr, u: x.u, q: x.q, w: x.w, att: x.att, rcsUsed: x.rcsUsed, phase: x.phase, nbody, forces,
    dv: x.dv, stage, debris, local, auto: M.auto, done: M.done, result: M.result, paused, warp: wEff, warpSet: warp, autoWarp,
    tNext: M.tNext, status, events: newEv, drAxis: M.drAxis, manual, trail, trailReset: reset, landing: M.landing, opt: M.descentInfo ? { tf: M.descentInfo.tf, fuel: M.descentInfo.fuel, replans: M.descentInfo.replans, fails: M.descentInfo.fails } : null });
}

onmessage = (e) => {
  const d = e.data;
  if (!M && d.cmd !== 'init' && d.cmd !== 'design') return;
  switch (d.cmd) {
    case 'init':
    case 'design':
      M = null;
      setupDate(d).then(() => { lastReal = performance.now(); if (!timer) timer = setInterval(tick, TICK_MS); })
        .catch((err) => postMessage({ type: 'error', msg: String(err.message || err) }));
      break;
    case 'restart': if (!M) break; newMission(); paused = true; postMessage({ type: 'restarted', t0: M.P.s.t, plan: M.plan }); break;
    case 'pause': paused = d.on; lastReal = performance.now(); break;
    case 'warp': warp = Math.max(0.05, Math.min(100000, d.value)); break;               // < 1: sinematik yavaş çekim (arayüz düğmeleri ≥ 1 gönderir)
    case 'autoWarp': autoWarp = d.on; break;
    case 'auto':
      if (d.on && manual.throttle > 0) endManualBurn();
      M.setAuto(d.on, tDisp); manual.throttle = 0; manual.hold = null; break;
    case 'manual':
      if (d.mode) { manual.mode = d.mode; if (d.mode === 'HOLD') manual.hold = M.manualDir('PRO'); }
      if (d.throttle !== undefined) {
        const th = Math.max(0, Math.min(1, d.throttle));
        if (manual.throttle <= 0 && th > 0) manual.dv0 = M.P.dvUsed;                 // elle yakış başladı
        if (manual.throttle > 0 && th <= 0 && manual.dv0 != null) { endManualBurn(); }
        manual.throttle = th;
      }
      break;
    case 'solver': nbody = !!d.nbody; M.setSolver(nbody); break;
    case 'landing': if (LANDING_MODES[d.mode]) { landingMode = d.mode; if (!M.done) M.landing = conicReady() ? landingMode : 'zem'; } break;     // PDI'dan önce etkili (iniş başlamışsa sürmekte olan güdüm değişmez)
    case 'perturb': M.perturb(tDisp, d.dv); break;
    case 'separate': M.manualSeparate(tDisp); break;
    case 'seek': seek(d.t); postMessage({ type: 'restarted', t0: M.t0, plan: M.plan, seek: true }); break;
  }
};
