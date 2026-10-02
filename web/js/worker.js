// LS19 fizik iş parçacığı (Web Worker): görev + motor burada koşar, ana iş parçacığı yalnız çizer.
import * as E from './engine.js';
import * as EO from './earth.js';
import { Mission, R_SITE, STAGES } from './mission.js';
import { makeLive } from './live.js';
import { designMission } from './design.js';

let K = null, DESIGN = null, T_START = 0, LIVE = null;
async function loadKernels() {
  if (K) return K;
  const get = (f) => fetch(new URL('../data/' + f, import.meta.url)).then((r) => { if (!r.ok) throw new Error(f + ' yüklenemedi'); return r; });
  const [spk, pck, eo, def] = await Promise.all([get('de440s.bsp').then((r) => r.arrayBuffer()), get('moon_pa_de440_200625.bpc').then((r) => r.arrayBuffer()),
    get('earth_orient.json').then((r) => r.json()), get('design_default.json').then((r) => r.json()).catch(() => null)]);
  K = { spk, pck, eo, def }; EO.loadEarthOrientation(eo); return K;
}
// UTC ms -> motor zamanı (TDB s), sağlayıcıdan bağımsız
function tOfUtcMs(ms) { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; }
// d: { startMs, tStart?, design?, nominal? } — tasarım normalde ana iş parçacığından hazır gelir;
// gelmezse (eski istemci) burada hesaplanır
async function setupDate(d) {
  await loadKernels();
  const startMs = d.startMs;
  const def = !d.design && K.def && Math.abs(K.def.startMs - startMs) < 1000 ? K.def : null;
  T_START = d.design ? d.tStart : def ? def.tStart : tOfUtcMs(startMs) - 86400;   // efemeris başlangıcı: seçilen günden 1 gün önce
  LIVE = makeLive(K.spk, K.pck, K.eo, T_START);
  let nominal = null;
  if (d.design) { DESIGN = d.design; nominal = d.nominal || null; }
  else if (def) { DESIGN = def.design; nominal = def.nominal || null; }
  else DESIGN = designMission(tOfUtcMs(startMs), (msg, frac) => postMessage({ type: 'designProgress', msg, frac }), d.cfg);
  E.setMoonZone(DESIGN.profile === 'HALO' ? 1.25 * DESIGN.HALO.stats.raKm : E.SOI_M);
  newMission(); paused = true;
  postMessage({ type: 'ready', t0: M.P.s.t, plan: M.plan, stages: DESIGN.STAGES || STAGES, design: DESIGN, tStart: T_START, startMs, nominal });
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
    trailPending.push({ t: h.t, r: h.r, v: h.v, thr: h.thr }); trailLast = { p, c: nearM, t: h.t };
  }
}
function newMission() {
  M = new Mission({ design: DESIGN, nbody });
  M.attachHistory();
  const push = M.P.onStep; M.P.onStep = (...a) => { push(...a); sampleTrail(); };
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
function chooseWarp(x) {
  if (!M.auto && manual.throttle > 0) return Math.min(warp, 10);     // elle yakışta en çok ×10
  if (!autoWarp) return warp;
  if (!M.auto) return Math.min(warp, x.thr > 0 ? 10 : maxWarp);
  if (x.thr > 0) return burnWarp(x.phase);
  if (x.phase === 'PDI' || x.phase === 'YAKLASMA' || x.phase === 'SON_INIS') return 1;
  if (x.phase === 'INDI') return 1;
  const tn = M.tNext;
  if (tn == null || tn <= tDisp) return 5;
  return Math.max(1, Math.min(maxWarp, (tn - tDisp) / 4));
}

function manualCtrl(P) {
  if (manual.throttle <= 0) return null;
  const u = M.manualDir(manual.mode, manual.hold);
  return [manual.throttle, u];
}

function tick() {
  const now = performance.now();
  const dtReal = Math.min(0.1, (now - lastReal) / 1000); lastReal = now;
  if (!M) return;
  let x = M.stateAt(tDisp) || M.hist[M.hist.length - 1];
  const wEff = chooseWarp(x);
  let res = null;
  if (!paused && !M.done) {
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
  // ayrılan kademe
  let stage = null;
  if (M.stageP) {
    if (M.stageP.s.t < tDisp) M.stageP.runUntil(tDisp);
    stage = M.stageP.s.geo()[0];
  }
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
  postMessage({ type: 'state', t: x.t, r: x.r, v: x.v, m: x.m, prop: x.prop, k: x.k, thr: x.thr, u: x.u, phase: x.phase, nbody, forces,
    dv: x.dv, stage, local, auto: M.auto, done: M.done, result: M.result, paused, warp: wEff, warpSet: warp, autoWarp,
    tNext: M.tNext, status, events: newEv, drAxis: M.drAxis, manual, trail, trailReset: reset });
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
    case 'warp': warp = Math.max(1, Math.min(100000, d.value)); break;
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
    case 'perturb': M.perturb(tDisp, d.dv); break;
    case 'separate': M.manualSeparate(tDisp); break;
    case 'seek': seek(d.t); postMessage({ type: 'restarted', t0: M.t0, plan: M.plan, seek: true }); break;
  }
};
