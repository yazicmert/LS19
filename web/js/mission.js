// LS19 görevi — rocsim_mission.py'nin canlı (adım adım) JavaScript karşılığı.
// Otopilot bir üreteç (generator): her fizik adımında yield eder, ekran saatini (P.tLimit) aşmaz.
// Otopilot kapatılınca üreteç bekler, araç elle uçurulur; açılınca kaldığı yerden devam eder
// (rota düzeltmeleri o anki duruma göre yeniden hedefler).
import * as E from './engine.js';
import { HaloRef } from './halo.js';
import { conicReady } from './conic.js';
import { Attitude, qSlerp, qRot, Z_AXIS } from './attitude.js';
import { solvePDG, replanPDG, controlAt } from './pdg.js';
const { add, sub, scale, dot, cross, norm, unit, mv, mtv } = E;

export const SITE_LAT = 0.67409 * Math.PI / 180, SITE_LON = 23.47298 * Math.PI / 180;
export const R_SITE = 1735.47, H_PARK = 185.0, H_LLO = 110.0;
export const STAGES = [
  { name: 'TLI kademesi', dry: 2300.0, prop: 6200.0, T: 100.0, isp: 450.0, thr_min: 1.0 },
  { name: 'İniş aracı', dry: 1300.0, prop: 2300.0, T: 16.0, isp: 320.0, thr_min: 0.10 }];
// İki kademeli iniş (gerçek ikinci itki sistemi): iniş aracı, Ay yörünge kademesi (MCC, LOI/NRI…, LLO işleri, DOI) ve iniş kademesi (motorlu iniş) olarak bölünür;
// yörünge kademesi iniş öncesi (H_SEP irtifasında) atılır, böylece ölü kütle (kuru kütle ve artan yakıt) motorlu inişe taşınmaz. Toplam kütle, itki ve Isp (yörünge kademesi)
// aynı kaldığından yörünge tasarımı (TLI, MCC, LOI…) değişmez; hazır tasarımlar olduğu gibi kullanılır. Yörünge kademesinin yakıtı tasarımın Δv'sinden (+%MARGIN +DVRES m/s) roket
// denklemiyle, iniş kademesininki kalandır (kuru kütleye DPEN kg ayırma cezası eklenir, toplam aynı kalsın diye yakıttan düşer).
export const TWO_STAGE = { D1: 380, DPEN: 60, MARGIN: 0.03, DVRES: 15, H_SEP: 15, T2: 12.0, ISP2: 325.0, THR_MIN2: 0.10 };
export function twoStageDesign(D, o = {}) {
  const c = { ...TWO_STAGE, ...o }, S = D.STAGES || STAGES;
  if (S.length > 2) return D;
  const L = S[1], dv = D.DV || {}, cEx = L.isp * E.G0 * 1000, mL = L.dry + L.prop;
  let dv1 = c.DVRES; for (const k of ['LOI', 'NRI', 'SK', 'DEP', 'LLOI', 'DOI']) dv1 += dv[k] || 0;
  dv1 *= 1 + c.MARGIN;
  const p1 = Math.ceil((mL * (1 - Math.exp(-dv1 / cEx))) / 10) * 10, d2 = L.dry + c.DPEN - c.D1, p2 = L.prop - p1 - c.DPEN;
  if (!(p2 > 0.2 * L.prop)) return D;
  return { ...D, STAGES: [S[0], { name: 'Ay yörünge kademesi', dry: c.D1, prop: p1, T: L.T, isp: L.isp, thr_min: L.thr_min }, { name: 'İniş kademesi', dry: d2, prop: p2, T: c.T2, isp: c.ISP2, thr_min: c.THR_MIN2 }],
    SEP2: { hSep: c.H_SEP }, TWO: { dv1, p1, p2, d1: c.D1, d2 } };
}
export const TLI = {
  x: [-0.15439776245200978, 272.83091805196824, -0.022276991913496073, 6.759823058395664e-05],
  t_ign: 1093113.5426107736,
  phat: [-0.3117337011889207, 0.8368331676337251, 0.4500359419992615],
  hhat: [0.3302313041907705, -0.3486918323997383, 0.8771324254353932] };
export const ARRIVAL = { t_P: 1434826.340426953, rP: [-440.1209747319318, -1534.658929695061, -929.5172172198984],
  vP: [-2.366133402092828, 0.6559758280060041, 0.03731590606260471],
  uP: 233.8652293328464, beta: -10.747537919560603, vp: 2.4556636659511857 };
export const LAUNCH = { t_launch: 1082571.0725359619, t_ins: 1083171.0725359619, az: 88.60848745290069,
  site: 'Kennedy Uzay Merkezi LC-39B (28.5729°K, 80.6490°B)' };
const TLI_DUR_ERROR = 0.05, PDI_ANGLE = 9.0 * Math.PI / 180, H_PDI = 15.0, TF_BRAKE = 310.0, TF_APPROACH = 45.0;
const GATE_HI = { x: -0.700, z: 1.500, vx: 0.045, vz: -0.035 }, GATE_LO = { x: 0.0, z: 0.250, vx: 0.0, vz: -0.018 };
const V_TOUCH = -0.001, TILT_MAX_LOW = 40 * Math.PI / 180;
// yerel çerçevede (x, y yatay, z yukarı) istenen itki ivmesini sınırla: itki ASLA aşağı yönde olamaz (dikey bileşen ≤ 0 ise dikey, en küçük gazla) ve dikeyden TILT_MAX_LOW'dan fazla yatmaz
function limitTilt(at, maxTilt = TILT_MAX_LOW) {
  if (at[2] <= 0) { at[0] = 0; at[1] = 0; at[2] = 1e-9; return at; }
  const hz = Math.hypot(at[0], at[1]);
  if (Math.atan2(hz, at[2]) > maxTilt) { const k = (Math.tan(maxTilt) * at[2]) / hz; at[0] *= k; at[1] *= k; }
  return at;
}
// Son iniş yasası (yerel çerçevede PD): yatay konum/hız sönümü + dikey hız profili; itki asla aşağı yönde değildir ve dikeyden TILT_MAX_LOW'dan fazla yatmaz.
// Yönelim fizik durumudur (hız sınırlı dönüş); optimal plan kapıya dikeye yakın biter (OPT_DESCENT.END_*), böylece bu yasaya geçişte büyük bir dönme gerekmez.
// p, v km ve km/s; döner: gereken itki ivmesi (yerel, km/s²)
export const TERM = { KP: 0.06, KD: 0.5, KV: 1.2 };
function terminalAccel(p, v, g) {
  const vzr = V_TOUCH - 0.07 * Math.max(p[2], 0.0), a = [-TERM.KP * p[0] - TERM.KD * v[0], -TERM.KP * p[1] - TERM.KD * v[1], TERM.KV * (vzr - v[2])], at = sub(a, g);
  limitTilt(at);
  if (p[2] < 0.003) { at[0] = 0; at[1] = 0; }
  return at;
}
// Optimal iniş (pdg.js). Ortak: son iniş kapısı irtifası GATE_H (m; kapıdaki iniş hızı son iniş yasasının eğrisiyle uyumlu: 1 + 0,07·h), itki payı (planlama için üst sınır = pay × tam itki),
// kuru kütleye yedek (kg), yeniden çözüm aralığı (s), düğüm sayısı, gevşek kısıt ağırlığı, kumanda sürekliliği. Ön ayarlar (güvenlik koridoru):
//   opt  (dengeli): son 100 s'de itki yönü dikeyden ≤ 45° ve son 20 s'de ≤ 15° (END_*: kapıya dikeye yakın varılır, son iniş yasasına geçişte büyük dönme olmaz),
//                   son 200 s'de iniş hızı ≤ vd + 0,06·h ve yatay hız ≤ 1 + 0,15·h (yüzeye göre); ZEM'e göre ~%1,4 daha az Δv
//   free (serbest): işaretleme sınırı yok, hız hunisi gevşek (0,25 / 0,6, son 120 s) — saf yakıt-optimale en yakın; ZEM'e göre ~%5 daha az Δv (kapıda hızla döner)
export const OPT_DESCENT = { GATE_H: 120, THR_MARGIN: 0.9, RESERVE: 25, REPLAN: 10, N: 60, SOFT: 200, REG: 0.003,
  PRESETS: { opt: { POINT_DEG: 45, POINT_TAIL: 100, END_DEG: 15, END_TAIL: 20, KD: 0.06, VH0: 1.0, KH: 0.15, FUNNEL_TAIL: 200 }, free: { POINT_DEG: 0, POINT_TAIL: 0, END_DEG: 0, END_TAIL: 0, KD: 0.25, VH0: 1.0, KH: 0.6, FUNNEL_TAIL: 120 } } };
export const LANDING_MODES = { zem: 'ZEM/ZEV (Apollo benzeri)', opt: 'Optimal (SOCP, dengeli)', free: 'Optimal (SOCP, serbest)' };
export const T_L_TARGET = 1453339.4275498604;
// Ekim 2026 Apollo tasarımı (design.js, değişken kütleli sonlu itkiyle); diğer tarihler design.js ile tarayıcıda üretilir
export const DEFAULT_DESIGN = { TLI, ARRIVAL, LAUNCH, t_L: T_L_TARGET, label: '2026-10-13 (design.js)' };
const TWO_PI = 2 * Math.PI;
// Yönelim (attitude.js): ateşlemeden bu kadar önce (s) itki yönüne dönmeye başlanır; iniş aracı sınıfı 15°/s ile 180° ≈ 13 s, 2°/s'lik TLI yığını küçük açılar döner
const ATT_LEAD = 180.0, ATT_H_APPROACH = 5.0;
const mod2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

export const siteMe = () => [Math.cos(SITE_LAT) * Math.cos(SITE_LON), Math.cos(SITE_LAT) * Math.sin(SITE_LON), Math.sin(SITE_LAT)];
export const siteIcrf = (t) => scale(mtv(E.moonIcrfToMe(t), siteMe()), R_SITE);

// sabit yönlü yakış süresi
function burnTime(veh, dvm) {
  const st = veh.active, m0 = veh.mass(), mdot = st.T / (st.isp * E.G0);
  return (m0 * (1 - Math.exp(-dvm / (st.isp * E.G0)))) / mdot;
}
function solve3(J, F) {             // J x = F (Cramer)
  const d = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = d(J), x = [0, 0, 0];
  for (let k = 0; k < 3; k++) { const M = J.map((row, i) => row.map((v, j) => (j === k ? F[i] : v))); x[k] = d(M) / D; }
  return x;
}

export class Mission {
  // nbody: true (varsayılan) N-cisim çözücü (tek eylemsiz çerçeve, etki küresi geçişi yok); false etki küresi (iki merkez cisimli) çözücü
  // landing: 'zem' (sıfır-çaba-ıskası güdümü) | 'opt' | 'free' (yakıt-optimal, kayıpsız dışbükeyleştirilmiş SOCP; LANDING_MODES; konik çözücü yüklü değilse ZEM)
  constructor({ tliError = TLI_DUR_ERROR, verbose = false, compat = false, design = DEFAULT_DESIGN, nbody = true, landing = 'zem', attitude = true } = {}) {
    this.D = design; const { TLI, ARRIVAL, LAUNCH } = design;
    this.nbody = nbody; this.landing = landing; this.descentInfo = null;
    this.compat = compat;          // true: Python sürümüyle birebir (MCC-3 yok, LOI 20 s kuantalı)
    this.attitude = !!attitude && !compat;       // true: itki, hız sınırlı dönen gerçek yönelim ekseni boyunca uygulanır (attitude.js); false: itki yönü komutla birebir
    this.debris = [];              // ayrılan kademeler: { id, kind: 'tli' | 'orb', name, P: yayınım, q: ayrılma anındaki yönelim (eylemsiz sabit), t }
    // modüler yapılandırma (eski tasarımlarda yoksa Apollo varsayılanları)
    this.hPark = design.EARTH ? design.EARTH.h : H_PARK;
    this.hLlo = design.LLO && design.LLO.h ? design.LLO.h : H_LLO;
    this.nLlo = design.LLO && design.LLO.revs ? design.LLO.revs : 2;
    this.halo = design.profile === 'HALO' ? new HaloRef(null, design.HALO.patches, design.HALO.tDep, design.HALO.tNri) : null;
    this.veh = new E.Vehicle(design.STAGES || STAGES);
    this.events = []; this.verbose = verbose; this.tliError = tliError;
    this.auto = true; this.status = ''; this.tNext = null; this.done = false; this.result = null;
    this.stageP = null; this.t_sep = null; this.local = null; this.drAxis = null;
    // park yörüngesinde TLI ateşlemesinden geriye: giriş anındaki durum (J2 dahil tutarlı)
    let s0;
    if (design.INS) s0 = new E.State(design.INS.t, design.INS.r, design.INS.v, 'E');          // yörünge yükseltmeli tasarım: giriş durumu tasarımdan
    else {
      const stIgn = this.parkStateAtIgn();
      const Pb = this.prop(stIgn.copy(), E.dummyVehicle(), 30.0);
      Pb.runUntil(LAUNCH.t_ins);
      s0 = Pb.s;
    }
    this.t0 = s0.t;
    this.P = this.prop(s0.copy(), this.veh, 30.0, 1.0);
    this.P.phase = 'PARK';
    if (this.attitude) this.initAttitude();
    const Pl = 2 * Math.PI * Math.sqrt((E.R_M + this.hLlo) ** 3 / E.MU_M);
    this.plan = [
      { key: 'INS', name: 'Yörüngeye giriş', t: LAUNCH.t_ins },
      ...(design.RAISE ? design.RAISE.burns.map((b) => ({ key: 'RAISE-' + b.k, name: `Yörünge yükseltme ${b.k}/${design.RAISE.n} (apoje ${Math.round(b.apo)} km)`, t: b.t })) : []),
      { key: 'TLI', name: 'TLI ateşleme', t: TLI.t_ign },
      { key: 'SEP', name: 'TLI kademesi ayrılır', t: TLI.t_ign + TLI.x[1] + 1800 },
      { key: 'MCC-1', name: 'MCC-1', t: TLI.t_ign + TLI.x[1] + 1800 + 20 * 3600 },
      { key: 'MCC-2', name: 'MCC-2', t: ARRIVAL.t_P - 22 * 3600 }];
    if (this.halo) {
      const H = design.HALO;
      this.plan.push({ key: 'NRI', name: 'Halo girişi (NRI)', t: ARRIVAL.t_P - 60 });
      this.skTimes().forEach((sk, i) => this.plan.push({ key: 'SK-' + (i + 1), name: `İstasyon tutma ${i + 1}`, t: sk.t }));
      this.plan.push({ key: 'DEP', name: "Halo'dan ayrılış", t: design.DEP.t - 90 }, { key: 'LOI', name: 'LLO girişi', t: design.LLO.tP - 84 });
    } else this.plan.push({ key: 'LOI', name: 'LOI', t: ARRIVAL.t_P - 84 });
    // SEP2 zamanı yaklaşıktır: alçalış yayında hSep irtifasına ulaşma, profile göre PDI'dan ~140–240 s önce
    this.plan.push({ key: 'DOI', name: 'DOI', t: design.t_L - 1620 - 395 - 0.5 * Pl + 60 }, ...(design.SEP2 ? [{ key: 'SEP2', name: 'Ay yörünge kademesi ayrılır', t: design.t_L - 2015 - 200 }] : []), { key: 'PDI', name: 'PDI', t: design.t_L - 2015 },
      { key: 'INDI', name: 'Temas', t: design.t_L - 1620 });
    this.gen = this.run();
  }

  // görevin tüm yayınımları aynı çözücüyü kullanır (N-cisim ya da etki küresi)
  prop(state, veh, hMaxCoast, hMaxBurn = 1.0) { return new E.Propagator(state, veh, hMaxCoast, hMaxBurn, { nbody: this.nbody }); }
  // çözücüyü uçuş sırasında değiştir: durum iki çerçeve arasında kesin dönüştürülür (fizik değişmez, yalnız çerçeve)
  setSolver(nbody) {
    if (nbody === this.nbody) return;
    this.nbody = nbody;
    const frame = (s) => (nbody ? 'N' : norm(s.seleno()[0]) < E.SOI_M ? 'M' : 'E');
    this.P.s = this.P.s.toFrame(frame(this.P.s)); this.P.nbody = nbody;
    for (const d of this.debris) { d.P.s = d.P.s.toFrame(frame(d.P.s)); d.P.nbody = nbody; }
  }

  log(msg, key = null, extra = {}) {
    const P = this.P;
    const ev = { t: P.s.t, utc: E.utcString(P.s.t), phase: P.phase, key, msg, m: this.veh.mass(), dv: P.dvUsed, ...extra };
    this.events.push(ev);
    if (this.verbose) console.log(`[${ev.utc}] ${P.phase.padEnd(12)} ${msg}  m=${ev.m.toFixed(1)}  Δv=${(ev.dv * 1000).toFixed(1)} m/s`);
    return ev;
  }

  parkStateAtIgn() {
    const { TLI } = this.D;
    const [phi, , , psi] = TLI.x, phat = TLI.phat, hhat = TLI.hhat;
    const h = unit(add(scale(hhat, Math.cos(psi)), scale(cross(phat, hhat), Math.sin(psi))));
    const p = unit(sub(phat, scale(h, dot(phat, h)))), q = cross(h, p);
    const rp = E.R_E + this.hPark, vc = Math.sqrt(E.MU_E / rp);
    return new E.State(TLI.t_ign, add(scale(p, rp * Math.cos(phi)), scale(q, rp * Math.sin(phi))),
      add(scale(p, -vc * Math.sin(phi)), scale(q, vc * Math.cos(phi))), 'E');
  }

  // ---------------------------------------------------------------- canlı adım ilkelleri
  *waitClock() { while (!this.auto || this.P.s.t >= this.P.tLimit - 1e-9) yield 0; }
  *until(tEnd, control = null, stop = null) {
    const P = this.P;
    while (tEnd - P.s.t > 1e-9) {
      yield* this.waitClock();
      if (tEnd - P.s.t <= 1e-9) break;
      if (stop && stop(P)) return true;
      P.step(Math.min(tEnd - P.s.t, P.tLimit - P.s.t), control);
      yield 1;
    }
    return false;
  }
  *stepOnce(control = null) {
    yield* this.waitClock();
    this.P.step(Math.min(1e9, this.P.tLimit - this.P.s.t), control);
    yield 1;
  }

  // ---------------------------------------------------------------- yönelim (attitude.js)
  // Yönelim fizik durumudur: itki, komuta hız sınırlı dönen GERÇEK eksen boyunca uygulanır; görüntü aynı yönelimi çizer. Süzülürken komut:
  // attMode (yakış öncesi hizalama, ya da inişte sürdürülen ters yön) yoksa ileri yön (merkez cisme göre hız yönü).
  initAttitude() {
    const P = this.P, [r] = P.s.geo();
    P.att = new Attitude(this.prograde(P), unit(r));                  // gövde x: yerel dikey; yuvarlanma sonra sürekli (en kısa yay) taşınır
    this.attMode = null;
    P.attCmd = (Pp) => (this.attMode ? this.attMode(Pp) : this.prograde(Pp));
  }
  prograde(Pp) { const t = Pp.s.t, [r, v] = Pp.s.geo(), rm = E.moonPos(t); return unit(norm(sub(r, rm)) < E.MOON_ZONE ? sub(v, E.moonVel(t)) : v); }
  retro(Pp) { return scale(this.prograde(Pp), -1); }
  // ateşlemeden ATT_LEAD s önce yönelimi dirFn'e çevirmeye başla ve tIgn'e kadar süzül (yönelim dönerken adımlar ≤ H_SLEW); yakıştan sonra attMode = null yapılır
  *approach(tIgn, dirFn, lead = ATT_LEAD) {
    const P = this.P;
    yield* this.until(tIgn - lead);
    if (!this.attitude) { yield* this.until(tIgn); return; }
    this.attMode = dirFn;
    const h0 = P.hMaxCoast; P.hMaxCoast = Math.min(h0, ATT_H_APPROACH);        // kayan bir yöne (TLI) kalıcı gecikmesiz otursun
    yield* this.until(tIgn);
    P.hMaxCoast = h0;
  }
  coastCopy(s, t) { const Q = this.prop(s.copy(), this.veh.clone(), 600.0); Q.runUntil(t); return Q.s; }          // itkisiz öngörü (ateşlemedeki durum)

  // ---------------------------------------------------------------- görev programı
  *run() {
    const P = this.P, { TLI, ARRIVAL, LAUNCH } = this.D;
    this.log(`Yörüngeye giriş (fırlatma ${E.utcString(LAUNCH.t_launch)}, KSC, azimut ${LAUNCH.az.toFixed(1)}°) — ${(this.D.RAISE ? this.D.RAISE.leo.alt : this.hPark).toFixed(0)} km park yörüngesi`, 'INS');
    let tTli = TLI.t_ign;
    if (this.D.RAISE) {
      yield* this.raiseBurns();
      this.tNext = TLI.t_ign; P.hMaxCoast = 600.0;
      tTli = yield* this.tliSync();
    }
    this.tNext = tTli;
    const [, dur, pitch] = TLI.x;
    const tliCtrl = (Pp) => {
      const r = Pp.s.r, v = Pp.s.v, vh = unit(v), nh = unit(cross(r, v)), rh = cross(nh, vh);
      return [1.0, add(scale(vh, Math.cos(pitch)), scale(rh, Math.sin(pitch)))];
    };
    yield* this.approach(tTli, (Pp) => tliCtrl(Pp)[1]);
    // TLI
    P.phase = 'TLI'; this.log('TLI ateşleme', 'TLI');
    yield* this.until(tTli + dur + this.tliError, tliCtrl);
    this.attMode = null;
    this.log('TLI motor kesme', 'TLI_CUT');
    P.phase = 'SUZULME'; P.hMaxCoast = 120.0;
    this.tNext = P.s.t + 1800.0;
    yield* this.until(P.s.t + 1800.0);
    // kademe ayrılması
    this.separateStage();
    P.hMaxCoast = 1800.0;
    const refS = this.referenceTrajectory(), ref = (t) => this.refAt(refS, t);
    yield* this.mcc(this.t_sep + 20 * 3600, ARRIVAL.t_P - 8 * 3600, ref, 'MCC-1', 'pos');
    if (this.halo) {
      // halo varışı: tam varış noktasına konum hedeflemesi
      yield* this.mcc(ARRIVAL.t_P - 22 * 3600, ARRIVAL.t_P, ref, 'MCC-2', 'pos');
      yield* this.mcc(ARRIVAL.t_P - 5 * 3600, ARRIVAL.t_P, ref, 'MCC-3', 'pos', 0.1);
      yield* this.nri();
      yield* this.haloOps();
      yield* this.loi(this.D.LLO.n);
    } else {
      yield* this.mcc(ARRIVAL.t_P - 22 * 3600, ARRIVAL.t_P - 1 * 3600, ref, 'MCC-2', 'peri');
      // MCC-3: yalnız bozulma varsa (nominal uçuşta gerekmez)
      if (!this.compat) yield* this.mcc(ARRIVAL.t_P - 5 * 3600, ARRIVAL.t_P - 1 * 3600, ref, 'MCC-3', 'peri', 0.1);
      yield* this.loi();
    }
    yield* this.lunarOps();
    this.done = true;
  }

  // ---------------------------------------------------------------- Dünya park yörüngesinde enerji yükseltme (TLI öncesi)
  // Her yakış tam itkılı ve sabit eylemsiz yönlüdür (tasarım). İlk yakış tasarım anında başlar (dairesel yörüngede faz yakışın yerini belirler);
  // sonrakiler aracın KENDİ perijesine göre ortalanır (süzülme hatası zamanlamayı kaydırmasın) ve yakış süresi, tasarımın bitiş apojesine ulaşacak biçimde
  // ateşlemede gerçek durumdan çözülür (enerji hatası bir sonraki yakışa taşınmasın). Nominal uçuşta tasarımla birebir aynı an ve süredir.
  *raiseBurns() {
    const P = this.P, R = this.D.RAISE;
    for (const b of R.burns) {
      P.phase = b.k === 1 ? 'PARK' : 'YUKSELTME'; P.hMaxCoast = b.k === 1 ? 30.0 : 600.0;
      let tIgn = b.t; this.tNext = b.t;
      if (b.k > 1) {
        yield* this.until(b.t - 1200);
        P.hMaxCoast = 60.0; tIgn = Math.max(P.s.t, P.s.t + E.timeToPerigee(P.s) - b.tauPeri);
      }
      this.tNext = tIgn;
      yield* this.approach(tIgn, () => b.u);
      const dur = this.raiseDuration(b);                                 // ateşlemede gerçek durumdan çözülen süre (nominalde tasarım süresi)
      P.phase = 'RAISE-' + b.k; P.hMaxBurn = 1.0; this.tNext = P.s.t + dur;
      this.log(`Yörünge yükseltme ${b.k}/${R.n}: ${dur.toFixed(1)} s, hedef apoje ~${Math.round(b.apo)} km`, 'RAISE-' + b.k);
      yield* this.until(P.s.t + dur, () => [1.0, b.u]);
      this.attMode = null;
      const el = E.elements(P.s.r, P.s.v, E.MU_E);
      this.log(`Yörünge yükseltme ${b.k} tamam: perije ${(el.rp - E.R_E).toFixed(1)} km, apoje ${(el.ra - E.R_E).toFixed(0)} km`, 'RAISE-' + b.k + '_CUT');
      P.phase = 'YUKSELTME'; P.hMaxCoast = 600.0; P.hMaxBurn = 1.0;
    }
  }
  // yakış süresi: aracın şimdiki durumundan, kopya yayınımla tasarımın bitiş apojesine (osküle) ulaşma süresi (ikiye bölme; apoje süreyle hızla artar,
  // bu yüzden yalancı konum güvenilmez); bulunamazsa tasarım süresi
  raiseDuration(b) {
    const s0 = this.P.s, apo = (tau) => {
      const Q = this.prop(s0.copy(), this.veh.clone(), 600.0, 1.0); Q.runUntil(s0.t + tau, () => [1.0, b.u]);
      return E.elements(Q.s.r, Q.s.v, E.MU_E).ra - b.raEnd;
    };
    let lo = 0.5 * b.dur, hi = 1.5 * b.dur;
    if (!(apo(lo) < 0 && apo(hi) > 0)) return b.dur;
    for (let i = 0; i < 48; i++) { const x = 0.5 * (lo + hi); if (apo(x) < 0) lo = x; else hi = x; }
    return 0.5 * (lo + hi);
  }
  // TLI öncesi yüksek elips: ateşleme aracın kendi perijesine göre (tasarımdaki perijeye kalan süre korunur)
  *tliSync() {
    const P = this.P;
    yield* this.until(this.D.TLI.t_ign - 1200);
    P.hMaxCoast = 60.0;
    return Math.max(P.s.t, P.s.t + E.timeToPerigee(P.s) - this.D.RAISE.tliTauPeri);
  }

  // ---------------------------------------------------------------- halo fazları
  haloRefGeo(t) { const [r, v] = this.halo.state(t); return [add(r, E.moonPos(t)), add(v, E.moonVel(t))]; }
  skTimes() {
    const H = this.D.HALO, nrho = H.preset === 'NRHO92' || (H.stats && H.stats.rpKm < 20000);
    const dt = nrho ? H.T : H.T / 4, out = [];
    for (let t = H.tNri + (nrho ? 0.5 : 0.25) * H.T; t < this.D.DEP.t - 0.2 * dt; t += dt) out.push({ t, tTgt: Math.min(t + dt, this.D.DEP.t) });
    return out;
  }
  *nri() {
    const P = this.P, { ARRIVAL } = this.D, stg = this.veh.active;
    const dvEst = (this.D.DV && this.D.DV.NRI ? this.D.DV.NRI / 1000 : 0.3), tb = burnTime(this.veh, dvEst);
    P.phase = 'SUZULME'; this.tNext = ARRIVAL.t_P - tb / 2; P.hMaxCoast = 600;
    yield* this.until(ARRIVAL.t_P - tb / 2 - 300);
    P.hMaxCoast = 20;
    // hedef hız: halo referansının hızı (yakış boyunca doğrusal ara değer); yönelim ateşlemeden önce hedef hıza göre hizalanır
    const vTof = (t0, t1) => { const v0 = this.halo.state(t0)[1], v1 = this.halo.state(t1)[1]; return (t) => { const s = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))); return add(scale(v0, 1 - s), scale(v1, s)); }; };
    const tN0 = ARRIVAL.t_P - tb / 2, vTn = vTof(tN0, tN0 + 1.5 * tb + 60);
    yield* this.approach(tN0, (Pp) => unit(sub(vTn(Pp.s.t), Pp.s.seleno()[1])));
    const t0 = P.s.t, t1 = t0 + 1.5 * tb + 60, vT = vTof(t0, t1);
    P.phase = 'NRI'; P.hMaxBurn = 0.2;
    this.log(`NRI ateşleme: halo yörüngesine giriş (${this.D.HALO.name})`, 'NRI');
    const ctrl = (Pp) => { const [, vs] = Pp.s.seleno(), dv = sub(vT(Pp.s.t), vs), amax = stg.T / this.veh.mass();
      return [Math.min(1.0, Math.max(stg.thr_min, norm(dv) / (amax * 2.0))), unit(dv)]; };
    const stop = (Pp) => norm(sub(vT(Pp.s.t), Pp.s.seleno()[1])) < 0.0004;
    yield* this.until(t1, ctrl, stop);
    this.attMode = null;
    const [rs] = P.s.seleno(), rr = this.halo.state(P.s.t)[0];
    this.log(`NRI tamam: referansa uzaklık ${norm(sub(rs, rr)).toFixed(2)} km`, 'NRI_END');
    P.phase = 'HALO'; P.hMaxCoast = 1800;
  }
  *haloOps() {
    const P = this.P, D = this.D, refFn = (t) => this.haloRefGeo(t);
    const sks = this.skTimes();
    for (let i = 0; i < sks.length; i++) {
      yield* this.mcc(sks[i].t, sks[i].tTgt, refFn, 'SK-' + (i + 1), 'pos', 0.01, 'HALO');
    }
    // ayrılış: LLO varış noktasını hedefle (sonlu yakış, tasarımın Δv'si başlangıç tahmini)
    const dv0 = D.DEP.dv, tb = burnTime(this.veh, norm(dv0));
    const rP2geo = (t) => [add(D.DEP.rP2, E.moonPos(D.LLO.tP)), add(D.DEP.vP2, E.moonVel(D.LLO.tP))];
    yield* this.mcc(D.DEP.t - tb / 2, D.LLO.tP, rP2geo, 'DEP', 'pos', 0, 'TRANSFER', 'DEP', dv0);
  }

  // etkin kademeyi ayır (sonraki kademe varsa): TLI kademesi TLI'dan 30 dk sonra; iki kademeli inişte Ay yörünge kademesi PDI'dan önce
  separateStage() {
    const P = this.P, k = this.veh.k, st = this.veh.stages[k];
    if (k >= this.veh.stages.length - 1) return;
    // ayrılma itkisi 0,5 m/s, kademenin KENDİ ekseni boyunca (araçtan uzağa, −z): TLI'da araç ileri yönelimlidir (kademe geride, geriye iter), inişte ters yönelimlidir (kademe önde, ileriye iter)
    const sst = P.s.copy(), axis = P.att ? qRot(P.att.q, Z_AXIS) : unit(sst.v); sst.v = sub(sst.v, scale(axis, 0.0005));
    this.stageP = this.prop(sst, new E.Vehicle([{ name: 'kademe', dry: st.dry, prop: st.prop, T: 0, isp: 1 }]), k === 0 ? 1800.0 : 60.0);
    // ayrılan kademe, ayrıldığı andaki yönelimini eylemsiz uzayda korur (dönme momenti yok); her ayrılan kademe kendi modeliyle çizilir ve görev boyunca kalır
    this.debris.push({ id: this.debris.length, kind: k === 0 ? 'tli' : 'orb', name: st.name, P: this.stageP, q: P.att ? P.att.q.slice() : null, t: P.s.t });
    if (k === 0) this.t_sep = P.s.t; else this.t_sep2 = P.s.t;
    this.veh.separate();
    this.log(k === 0 ? `${st.name} ayrıldı` : `${st.name} ayrıldı (irtifa ${(norm(P.s.seleno()[0]) - R_SITE).toFixed(1)} km, ${st.prop.toFixed(0)} kg yakıt atıldı); iniş kademesi ${this.veh.mass().toFixed(0)} kg`, k === 0 ? 'SEP' : 'SEP2');
  }

  referenceTrajectory() {
    const { ARRIVAL } = this.D;
    if (ARRIVAL.vP) return new E.State(ARRIVAL.t_P, ARRIVAL.rP, ARRIVAL.vP, 'M');
    const tL = this.D.t_L, s = scale(siteIcrf(tL), 1 / R_SITE);
    const zp = mtv(E.moonIcrfToMe(tL), [0, 0, 1]);
    const n0 = unit(sub(zp, scale(s, dot(zp, s)))), b = ARRIVAL.beta * Math.PI / 180;
    const n = add(scale(n0, Math.cos(b)), scale(cross(s, n0), Math.sin(b))), h = scale(n, -1);
    const rP = ARRIVAL.rP;
    return new E.State(ARRIVAL.t_P, rP, scale(unit(cross(h, unit(rP))), ARRIVAL.vp), 'M');
  }
  refAt(ref, t) { const Q = new E.Propagator(ref.copy(), E.dummyVehicle(), 1800.0); Q.runUntil(t); return Q.s.geo(); }

  flyBurn(st, veh, dv, tTarget) {
    const Q = this.prop(st.copy(), veh, 1800.0, 0.5);
    const dvm = norm(dv);
    if (dvm > 1e-9) { const tb = burnTime(veh, dvm), u = scale(dv, 1 / dvm); Q.runUntil(st.t + tb, () => [1.0, u]); }
    return Q;
  }

  // Rota düzeltmesi: hedefleme, ateşlemedeki (tBurn) ÖNGÖRÜLEN durumdan ATT_LEAD s önce yapılır; araç yakış yönüne önceden döner ve tam tBurn'de ateşlenir
  // (itkisiz süzülme deterministiktir: öngörülen ve gerçek durum cm düzeyinde aynıdır). Elle müdahale/bozulma durumu değiştirdiyse ateşlemede yeniden hedeflenir.
  *mcc(tBurn, tTarget, ref, name, mode, minDvMps = 0, coastPhase = 'SUZULME', key = null, dvInit = null) {
    const P = this.P, { ARRIVAL } = this.D, lead = this.attitude ? ATT_LEAD : 0;
    P.phase = coastPhase; this.tNext = tBurn;
    yield* this.until(tBurn - lead);
    if (P.s.t > tTarget - 600) return;                  // hedef anı geçmiş (elle uçuştan sonra)
    const [rRef, vRef] = ref(tTarget);
    const zM = mtv(E.moonIcrfToMe(ARRIVAL.t_P), [0, 0, 1]);
    const periTargets = (rs, vs, t) => {
      const el = E.elements(rs, vs, E.MU_M), e = el.e, a = Math.abs(el.a);
      const cnu = Math.max(-1, Math.min(1, (el.p / norm(rs) - 1) / e));
      const nu = Math.sign(dot(rs, vs) || 1) * Math.acos(cnu);
      const F_ = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
      const tPeri = t - (e * Math.sinh(F_) - F_) * Math.sqrt(a ** 3 / E.MU_M);
      return [el.rp, 100.0 * dot(unit(el.h), zM), (tPeri - ARRIVAL.t_P) / 10.0];
    };
    let T0 = null;
    if (mode === 'peri') { const rm = E.moonPos(tTarget), vm = E.moonVel(tTarget); T0 = periTargets(sub(rRef, rm), sub(vRef, vm), tTarget); }
    const nominal = this.compat;         // Python sürümüyle birebir: sönümsüz Newton, 12 yineleme
    const newton = (miss, dv, iters) => {
      let F = miss(dv);
      for (let it = 0; it < iters; it++) {
        if (!F.every(Number.isFinite)) { F = [1e9, 0, 0]; break; }
        if (norm(F) < 0.05) break;
        const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], hh = 1e-5;
        for (let k = 0; k < 3; k++) { const d = dv.slice(); d[k] += hh; const Fk = miss(d); for (let i = 0; i < 3; i++) J[i][k] = (Fk[i] - F[i]) / hh; }
        let step = solve3(J, F).map((x) => -x);
        const sn = norm(step); if (sn > 0.05) step = scale(step, 0.05 / sn);
        if (nominal) { dv = add(dv, step); F = miss(dv); continue; }
        // geri izlemeli (backtracking) Newton: büyük bozulmalarda da yakınsasın
        let lam = 1.0, dvN = add(dv, step), FN = miss(dvN);
        while ((!FN.every(Number.isFinite) || norm(FN) > norm(F)) && lam > 1 / 64) { lam /= 2; dvN = add(dv, scale(step, lam)); FN = miss(dvN); }
        dv = dvN; F = FN;
      }
      return [dv, F];
    };
    // sStart: yakışın başladığı durum; döner [dv, F]
    const solve = (sStart) => {
      const missOf = (md) => (dv) => {
        const Q = this.flyBurn(sStart, this.veh.clone(), dv, tTarget);
        Q.runUntil(tTarget);
        if (md === 'pos') return sub(Q.s.geo()[0], rRef);
        const [rs, vs] = Q.s.seleno(); const T1 = periTargets(rs, vs, tTarget);
        return [T1[0] - T0[0], T1[1] - T0[1], T1[2] - T0[2]];
      };
      let [dv, F] = newton(missOf(mode), dvInit ? dvInit.slice() : [0, 0, 0], nominal ? 12 : 30);
      if (!nominal && mode === 'peri' && !(norm(F) < 0.05)) {
        // büyük sapma: önce iyi koşullu konum hedeflemesi, sonra periselen hedeflemesi
        const [dv0] = newton(missOf('pos'), [0, 0, 0], 30);
        const [dv1, F1] = newton(missOf('peri'), dv0, 30);
        if (norm(F1) < norm(F)) { dv = dv1; F = F1; }
      }
      return [dv, F];
    };
    const early = lead > 0 && P.s.t < tBurn - 1e-6;      // ateşlemeden önce hedefle ve hizalan
    const sPred = early ? this.coastCopy(P.s, tBurn) : P.s;
    this.status = `${name} hedefleniyor…`; yield 'COMPUTE';
    let [dv, F] = solve(sPred);
    this.status = '';
    if (early) {
      const u0 = norm(dv) > 1e-6 && !(minDvMps > 0 && norm(dv) * 1000 < minDvMps) ? scale(dv, 1 / norm(dv)) : null;       // gerekmeyecek yakış için dönülmez
      if (u0) this.attMode = () => u0;                                  // yakış yönüne dön, tBurn'e kadar süzül
      yield* this.until(tBurn);
      if (norm(sub(P.s.r, sPred.r)) > 1e-3 || norm(sub(P.s.v, sPred.v)) > 1e-6) {          // durum öngörüden sapmış (bozulma, elle uçuş): ateşlemede yeniden hedefle
        this.status = `${name} hedefleniyor…`; yield 'COMPUTE';
        [dv, F] = solve(P.s);
        this.status = '';
      }
    }
    const dvm = norm(dv);
    const k = key || name;
    if (minDvMps > 0 && dvm * 1000 < minDvMps) { this.attMode = null; this.log(`${name} gerekmedi (Δv ${(dvm * 1000).toFixed(3)} m/s)`, k + '_SKIP'); P.phase = coastPhase; return; }
    P.phase = key || name;
    const fx = norm(F) > 1 ? (mode === 'peri' ? ` (rp ${F[0].toFixed(1)} km, düzlem ${(F[1] / 100).toFixed(3)}, t_peri ${(F[2] * 10).toFixed(0)} s)` : '') : '';
    this.log(`${name}: Δv=${(dvm * 1000).toFixed(2)} m/s, kalan hedef hatası ${norm(F).toFixed(4)}${fx}`, k, { dvm: dvm * 1000 });
    if (dvm > 1e-6) {
      const tb = burnTime(this.veh, dvm), u = scale(dv, 1 / dvm); P.hMaxBurn = 0.5;
      yield* this.until(P.s.t + tb, () => [1.0, u]);
    }
    this.attMode = null;
    P.phase = coastPhase === 'TRANSFER' ? 'TRANSFER' : coastPhase;
  }

  timeToPeriapsis() {                 // Ay'a göre (hiperbol/elips), yaklaşan dalda
    const [rs, vs] = this.P.s.seleno(), el = E.elements(rs, vs, E.MU_M), e = el.e, a = Math.abs(el.a);
    if (dot(rs, vs) >= 0) return null;
    const cnu = Math.max(-1, Math.min(1, (el.p / norm(rs) - 1) / e)), nu = -Math.acos(cnu);
    if (e > 1) { const F_ = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2)); return -(e * Math.sinh(F_) - F_) * Math.sqrt(a ** 3 / E.MU_M); }
    const Ea = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)); return -(Ea - e * Math.sin(Ea)) * Math.sqrt(a ** 3 / E.MU_M);
  }

  *loi(planeN = null) {
    const P = this.P, { ARRIVAL } = this.D, tArr = this.halo ? this.D.LLO.tP : ARRIVAL.t_P;
    P.phase = this.halo ? 'TRANSFER' : 'SUZULME';
    const stg = this.veh.active;
    const tToPeri = (Pp) => { const [rs, vs] = Pp.s.seleno(); return -dot(rs, vs) / dot(vs, vs); };
    // ateşleme yönü (dairesel hıza ulaştıran Δv); ateşlemeden önce yönelim bu yöne çevrilir
    const dirLoi = (Pp) => { const [rs, vs] = Pp.s.seleno(), hd = planeN ? unit(planeN) : unit(cross(rs, vs)); return unit(sub(scale(unit(cross(hd, rs)), Math.sqrt(E.MU_M / norm(rs))), vs)); };
    for (;;) {
      if (P.s.inMoonFrame()) {
        const [rs, vs] = P.s.seleno(), rn = norm(rs);
        const dvEst = rn < 3000 ? norm(vs) - Math.sqrt(E.MU_M / rn) : 0.9;
        const tb = burnTime(this.veh, Math.max(dvEst, 0.5));
        const rem = tToPeri(P) - tb / 2;
        // Python sürümünde ateşleme anı adım boyuna (20 s) kuantalanıyordu; burada 0.05 s'ye inceltilir
        if (rn < 20000) P.hMaxCoast = (dot(rs, vs) < 0 && !this.compat) ? Math.max(0.05, Math.min(20.0, rem * 0.5)) : 20.0;
        const tp = this.timeToPeriapsis(); this.tNext = tp !== null ? P.s.t + tp - tb / 2 : this.tNext;
        if (this.attitude && !this.attMode && rem < ATT_LEAD && dot(rs, vs) < 0) this.attMode = dirLoi;
        if (rem <= 0 && dot(rs, vs) < 0) break;
      } else this.tNext = tArr - 90;
      yield* this.stepOnce();
    }
    P.phase = 'LOI'; P.hMaxBurn = 0.5;
    const hdir = planeN ? unit(planeN) : unit(cross(...P.s.seleno()));
    this.log(`${this.halo ? 'LLO girişi' : 'LOI'} ateşleme (periselen irtifası ~${this.periAlt().toFixed(1)} km)`, 'LOI');
    const vt = (rs) => scale(unit(cross(hdir, rs)), Math.sqrt(E.MU_M / norm(rs)));
    const loiCtrl = (Pp) => {
      const [rs, vs] = Pp.s.seleno(), dv = sub(vt(rs), vs), amax = stg.T / this.veh.mass();
      return [Math.min(1.0, Math.max(stg.thr_min, norm(dv) / (amax * 2.0))), unit(dv)];
    };
    const loiStop = (Pp) => { const [rs, vs] = Pp.s.seleno(); return norm(sub(vt(rs), vs)) < 0.0004; };
    P.hMaxBurn = 0.2;
    yield* this.until(P.s.t + 2000, loiCtrl, loiStop);
    this.attMode = null;
    const [rs, vs] = P.s.seleno(), el = E.elements(rs, vs, E.MU_M);
    this.log(`${this.halo ? 'LLO girişi' : 'LOI'} tamam: periselen ${(el.rp - E.R_M).toFixed(1)} km, aposelen ${(el.ra - E.R_M).toFixed(1)} km`, 'LOI_END');
    P.phase = 'AY_YORUNGESI'; P.hMaxCoast = 60.0;
  }

  periAlt() { const [rs, vs] = this.P.s.seleno(); return E.elements(rs, vs, E.MU_M).rp - E.R_M; }

  angleToSite(tLand = null) {
    const [rs, vs] = this.P.s.seleno(), h = unit(cross(rs, vs)), s = siteIcrf(tLand ?? this.P.s.t);
    const sp = unit(sub(s, scale(h, dot(s, h)))), rh = unit(rs);
    return mod2pi(Math.atan2(dot(cross(rh, sp), h), dot(rh, sp)));
  }

  *lunarOps() {
    const P = this.P, stg = this.veh.active;
    const n = Math.sqrt(E.MU_M / (E.R_M + this.hLlo) ** 3), Tp = TWO_PI / n;
    const tMinDoi = P.s.t + (this.nLlo - 0.5) * Tp, doiAng = Math.PI + PDI_ANGLE;
    P.hMaxCoast = 60.0;
    this.tNext = tMinDoi + 600;
    yield* this.until(tMinDoi);
    for (;;) {
      const tLand = P.s.t + (doiAng - PDI_ANGLE) / n + 700.0;
      const rem = mod2pi(this.angleToSite(tLand) - doiAng);
      if (rem < 2e-4 || rem > TWO_PI - 0.02) break;
      if (this.attitude && !this.attMode && rem / n < ATT_LEAD) this.attMode = (Pp) => this.retro(Pp);        // DOI ve sonrası PDI ters yönde (motor ileri): iniş inişe kadar bu yönelimde kalır
      this.tNext = P.s.t + rem / n;
      P.hMaxCoast = Math.max(0.2, Math.min(60.0, (rem / n) * 0.5));
      yield* this.stepOnce();
    }
    P.phase = 'DOI'; P.hMaxBurn = 0.05;
    this.log('DOI ateşleme', 'DOI');
    const doiCtrl = (Pp) => { const [rs, vs] = Pp.s.seleno(), el = E.elements(rs, vs, E.MU_M);
      return [Math.min(1.0, Math.max(stg.thr_min, (el.rp - (R_SITE + H_PDI)) / 20.0)), scale(unit(vs), -1)]; };
    const doiStop = (Pp) => { const [rs, vs] = Pp.s.seleno(); return E.elements(rs, vs, E.MU_M).rp <= R_SITE + H_PDI; };
    yield* this.until(P.s.t + 300, doiCtrl, doiStop);
    { const [rs, vs] = P.s.seleno(), el = E.elements(rs, vs, E.MU_M);
      this.log(`DOI tamam: periselen ${(el.rp - R_SITE).toFixed(2)} km (iniş yerine göre)`, 'DOI_END'); }
    P.phase = 'INIS_SUZULME';
    const sep2 = this.D.SEP2 && this.veh.k === 1 && this.veh.stages.length > 2;
    for (;;) {
      const rem = mod2pi(this.angleToSite(P.s.t + 650.0) - PDI_ANGLE);
      if (rem < 2e-5 || rem > TWO_PI - 0.02) break;
      if (sep2 && this.veh.k === 1 && norm(P.s.seleno()[0]) - R_SITE <= this.D.SEP2.hSep) this.separateStage();       // iniş kademesinin son H_SEP km'si
      this.tNext = P.s.t + rem / n;
      P.hMaxCoast = Math.max(0.1, Math.min(60.0, (rem / n) * 0.5));
      yield* this.stepOnce();
    }
    if (sep2 && this.veh.k === 1) this.separateStage();                       // irtifa ölçütü sağlanmadan PDI geldiyse ateşlemeden hemen önce ayır
    yield* ((this.landing === 'opt' || this.landing === 'free') && conicReady() ? this.descentOptimal() : this.descent());
  }

  // site'a bağlı yerel çerçeve: x menzil (yaklaşma yönü), y sol, z yukarı
  localState(t = this.P.s.t, rs = null, vs = null) {
    if (!rs) [rs, vs] = this.P.s.seleno();
    const s = siteIcrf(t), up = unit(s), ax = this.drAxis || unit(sub(vs, scale(up, dot(vs, up))));
    const x = unit(sub(ax, scale(up, dot(ax, up)))), y = cross(up, x), Rf = [x, y, up];
    const w = E.omegaMoon(t), rel = sub(rs, s), vrel = sub(vs, cross(w, rs));
    const p = mv(Rf, rel), v = mv(Rf, vrel);
    p[2] = norm(rs) - R_SITE;
    const g = mv(Rf, scale(rs, -E.MU_M / norm(rs) ** 3));
    return { p, v, g, Rf };
  }

  *descent() {
    const P = this.P, stg = this.veh.active;
    const [, vs0] = P.s.seleno(), s0 = siteIcrf(P.s.t), up0 = unit(s0);
    this.drAxis = unit(sub(vs0, scale(up0, dot(vs0, up0))));
    const st = { phase: 'BRAKE', tph: P.s.t };
    P.phase = 'PDI'; P.hMaxBurn = 0.2;
    this.log(`PDI ateşleme (irtifa ${(norm(P.s.seleno()[0]) - R_SITE).toFixed(2)} km)`, 'PDI');
    const gHi = [GATE_HI.x, 0, GATE_HI.z], vHi = [GATE_HI.vx, 0, GATE_HI.vz], gLo = [GATE_LO.x, 0, GATE_LO.z], vLo = [GATE_LO.vx, 0, GATE_LO.vz];
    const zem = (p, v, g, pf, vf, tgo) => [0, 1, 2].map((k) =>
      (6 * (pf[k] - (p[k] + v[k] * tgo + 0.5 * g[k] * tgo * tgo))) / (tgo * tgo) - (2 * (vf[k] - (v[k] + g[k] * tgo))) / tgo);
    const ctrl = (Pp) => {
      const { p, v, g, Rf } = this.localState(Pp.s.t); const t = Pp.s.t; let a;
      if (st.phase === 'BRAKE') {
        const tgo = Math.max(TF_BRAKE - (t - st.tph), 3.0); a = zem(p, v, g, gHi, vHi, tgo);
        if (t - st.tph >= TF_BRAKE) { st.phase = 'APPROACH'; st.tph = t; Pp.phase = 'YAKLASMA'; }
      } else if (st.phase === 'APPROACH') {
        const tgo = Math.max(TF_APPROACH - (t - st.tph), 2.0); a = zem(p, v, g, gLo, vLo, tgo);
        if (p[2] <= GATE_LO.z + 0.0005 || t - st.tph >= TF_APPROACH) { st.phase = 'TERMINAL'; st.tph = t; Pp.phase = 'SON_INIS'; }
      } else {
        const atT = terminalAccel(p, v, g), T = this.veh.mass() * norm(atT);
        return [Math.min(1.0, Math.max(stg.thr_min, T / stg.T)), mtv(Rf, unit(atT))];
      }
      const at = sub(a, g);
      if (st.phase !== 'BRAKE') limitTilt(at);                              // yaklaşma (ve son iniş yasasına geçiş adımı)
      const T = this.veh.mass() * norm(at);
      return [Math.min(1.0, Math.max(stg.thr_min, T / stg.T)), mtv(Rf, unit(at))];
    };
    const stop = (Pp) => norm(Pp.s.seleno()[0]) - R_SITE <= 0.0;
    this.tNext = null;
    yield* this.until(P.s.t + 1500, ctrl, stop);
    this.touchdown();
  }

  // Optimal iniş: PDI'da yakıt-optimal plan (pdg.js: kayıpsız dışbükeyleştirme + SOCP), planı uygula, her OPT.REPLAN s'de (son dakikada 4 s) sıcak başlangıçlı yeniden çöz;
  // plan, iniş yerinin GATE_H irtifalı kapısına biter, ardından eski ZEM güdümündeki son iniş yasası temas edene dek sürer. Plan Ay merkezli eylemsiz çerçevede (ICRF eksenleri), SI birimlerindedir.
  // Çözüm bulunamazsa ZEM/ZEV güdümüne dönülür. Kumanda: ZOH düğümündeki ivme vektörü u → itki = m·|u| (gerçek kütleyle), tam itkıya ve en küçük kısmaya kırpılır.
  *descentOptimal() {
    const P = this.P, stg = this.veh.active, O = { ...OPT_DESCENT, ...OPT_DESCENT.PRESETS[this.landing] }, MU = E.MU_M * 1e9, G0m = E.G0 * 1e3;
    O.VD_GATE = 1.0 + 0.07 * O.GATE_H;
    const gfun = (r) => { const n = Math.hypot(r[0], r[1], r[2]), k = -MU / (n * n * n); return [r[0] * k, r[1] * k, r[2] * k]; };
    const mk = (t0) => {
      const [rs, vs] = P.s.seleno(), m = this.veh.mass();
      return { r0: scale(rs, 1000), v0: scale(vs, 1000), m0: m, mDry: m - stg.prop + O.RESERVE, rho1: stg.thr_min * stg.T * 1000, rho2: O.THR_MARGIN * stg.T * 1000, alpha: 1 / (stg.isp * G0m),
        gfun, surfaceR: R_SITE * 1000, floorMargin: 0, soft: O.SOFT,
        point: O.POINT_DEG ? { cosTheta: Math.cos(O.POINT_DEG * Math.PI / 180), tail: O.POINT_TAIL } : undefined,
        point2: O.END_DEG ? { cosTheta: Math.cos(O.END_DEG * Math.PI / 180), tail: O.END_TAIL } : undefined,
        funnel: { vd0: O.VD_GATE, kd: O.KD, vh0: O.VH0, kh: O.KH, tail: O.FUNNEL_TAIL },
        target: (tf) => { const tl = t0 + tf, sU = siteIcrf(tl), up = unit(sU), rf = add(scale(sU, 1000), scale(up, O.GATE_H)), vsite = cross(E.omegaMoon(tl), rf);
          return { rf, vf: sub(vsite, scale(up, O.VD_GATE)), up, vsite }; } };
    };
    const [, vs0] = P.s.seleno(), s0 = siteIcrf(P.s.t), up0 = unit(s0);
    this.status = 'İniş yörüngesi hesaplanıyor…'; yield 'COMPUTE';
    const t0 = P.s.t, R = solvePDG(mk(t0), { Nfinal: O.N });
    this.status = '';
    if (!R.ok) { this.log(`Optimal iniş planı bulunamadı (${R.why}): ZEM/ZEV güdümü`, 'PLAN_FAIL'); yield* this.descent(); return; }
    this.drAxis = unit(sub(vs0, scale(up0, dot(vs0, up0))));
    let plan = { t0, sol: R.sol };
    const info = this.descentInfo = { tf: R.tf, fuel: R.fuel, calls: R.calls, planMs: R.ms, replans: 0, fails: 0, replanMs: 0, violMax: R.sol.violMax ?? 0, gateT: null };
    P.phase = 'PDI'; P.hMaxBurn = 0.2;
    this.log(`PDI ateşleme (irtifa ${(norm(P.s.seleno()[0]) - R_SITE).toFixed(2)} km)`, 'PDI');
    this.log(`Optimal iniş planı (SOCP): ${R.tf.toFixed(0)} s, ~${R.fuel.toFixed(0)} kg yakıt (Δv ${(stg.isp * G0m * Math.log(this.veh.mass() / R.sol.m[R.sol.N])).toFixed(0)} m/s), ${R.calls} çözüm / ${R.ms} ms`, 'PLAN', { fuel: R.fuel, tf: R.tf });
    const alt = () => norm(P.s.seleno()[0]) - R_SITE;                       // km
    const st = { mode: 'PDG', fails: 0 };
    const clampThr = (T) => Math.min(1.0, Math.max(stg.thr_min, T / stg.T));
    const ctrl = (Pp) => {
      if (st.mode === 'PDG') {
        const c = controlAt(plan.sol, Pp.s.t - plan.t0), an = norm(c.u), a = alt();
        Pp.phase = a > 3.0 ? 'PDI' : 'YAKLASMA';
        return [clampThr((this.veh.mass() * an) / 1000), unit(c.u)];          // kg·m/s² = N → kN
      }
      const { p, v, g, Rf } = this.localState(Pp.s.t), at = terminalAccel(p, v, g);
      return [clampThr(this.veh.mass() * norm(at)), mtv(Rf, unit(at))];
    };
    const surface = () => alt() <= 0.0, gate = () => alt() <= O.GATE_H / 1000 + 0.002;
    this.tNext = null;
    for (;;) {
      if (st.mode === 'PDG') {
        const tEnd = plan.t0 + plan.sol.tf, tgo = tEnd - P.s.t;
        if (tgo <= 0.5 || gate()) {
          st.mode = 'TERMINAL'; P.phase = 'SON_INIS'; info.gateT = P.s.t;
          const { v } = this.localState();
          this.log(`Son iniş kapısı: irtifa ${(alt() * 1000).toFixed(0)} m, dikey hız ${(v[2] * 1000).toFixed(1)} m/s, yatay ${(Math.hypot(v[0], v[1]) * 1000).toFixed(1)} m/s`, 'GATE');
          continue;
        }
        const hit = yield* this.until(Math.min(P.s.t + (tgo > 60 ? O.REPLAN : 4), tEnd), ctrl, (Pp) => surface() || gate());
        if (hit && surface()) break;
        if (hit || P.s.t >= tEnd - 1e-9) continue;
        const left = tEnd - P.s.t;
        if (left > 8) {
          let q = replanPDG(mk(P.s.t), plan, P.s.t, { N: Math.max(10, Math.min(O.N, Math.round(left / 0.6))), reg: O.REG });
          if (!q.ok && st.fails >= 1) q = solvePDG(mk(P.s.t), { Nfinal: O.N, tfGuess: Math.max(left, 20), tfSpan: 0.6 });   // art arda ikinci başarısızlık (elle uçuş, büyük bozulma): sıfırdan çöz
          if (q.ok) { plan = { t0: P.s.t, sol: q.sol }; st.fails = 0; info.replans++; info.replanMs += q.ms; info.violMax = Math.max(info.violMax, q.sol.violMax ?? 0); }
          else {
            info.fails++; st.fails++;
            if (st.fails >= 4) { st.mode = 'TERMINAL'; P.phase = 'SON_INIS'; this.log('Optimal iniş planı sürdürülemedi: son iniş yasasına geçildi', 'PLAN_FAIL'); }
          }
        }
      } else { yield* this.until(P.s.t + 1500, ctrl, surface); break; }
    }
    this.touchdown();
  }

  touchdown(manual = false) {
    const P = this.P, { p, v } = this.localState();
    P.phase = 'INDI';
    const vh = Math.hypot(v[0], v[1]) * 1000, vz = v[2] * 1000, ok = Math.abs(vz) < 3.0 && vh < 1.5;
    this.result = { t: P.s.t, utc: E.utcString(P.s.t), posErr_m: [p[0] * 1000, p[1] * 1000], v_mps: [v[0] * 1000, v[1] * 1000, vz],
                    prop: this.veh.active.prop, ok, manual };
    P.lastThr = 0; if (P.att) P.att.snapTo(unit(siteIcrf(P.s.t)));          // temasta araç bacaklarının üstünde yerel dikeyde durur (kinematik olay)
    if (this.pushHist) this.pushHist();
    this.log(`${ok ? 'TEMAS' : 'ÇARPMA'}${manual ? ' (elle)' : ''}: konum hatası ${(Math.hypot(p[0], p[1]) * 1000).toFixed(1)} m, dikey hız ${vz.toFixed(2)} m/s, yatay ${vh.toFixed(2)} m/s, kalan yakıt ${this.veh.active.prop.toFixed(0)} kg`, 'INDI');
    this.done = true;
  }

  // ---------------------------------------------------------------- canlı sürüş (worker çağırır)
  // Sabit fizik: otopilotta fizik adımları ekran saatinden bağımsızdır (hızlı hesapla birebir aynı sonuç);
  // fizik ekranın biraz önünde koşar, ekran iki fizik durumu arasında Hermite ile ara değer alır.
  attachHistory() {
    this.hist = [];
    const push = () => {
      const P = this.P, [g, gv] = P.s.geo();
      this.hist.push({ t: P.s.t, r: g, v: gv, m: this.veh.mass(), prop: this.veh.active.prop, k: this.veh.k,
                       thr: P.lastThr, u: P.lastU, q: P.att ? P.att.q.slice() : null, phase: P.phase, dv: P.dvUsed });
      if (this.hist.length > 4000) this.hist.splice(0, 2000);
    };
    push();
    this.P.onStep = push;
    this.pushHist = push;
  }

  // ekran zamanındaki durum (ara değer)
  stateAt(td) {
    const H = this.hist; if (!H || !H.length) return null;
    let j = H.length - 1;
    while (j > 0 && H[j - 1].t > td) j--;
    if (j === 0 || td >= H[H.length - 1].t) { const x = H[Math.max(0, Math.min(j, H.length - 1))]; return { ...x, t: Math.min(td, x.t) }; }
    const a = H[j - 1], b = H[j], h = b.t - a.t, s = Math.max(0, Math.min(1, (td - a.t) / h));
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    const d00 = 6 * s * s - 6 * s, d10 = 3 * s * s - 4 * s + 1, d01 = -6 * s * s + 6 * s, d11 = 3 * s * s - 2 * s;
    const r = [0, 1, 2].map((k) => h00 * a.r[k] + h10 * h * a.v[k] + h01 * b.r[k] + h11 * h * b.v[k]);
    const v = [0, 1, 2].map((k) => (d00 * a.r[k] + d01 * b.r[k]) / h + d10 * a.v[k] + d11 * b.v[k]);
    // yakış verisi: b adımında uygulanan itki (a→b aralığında sabit tutuldu)
    return { t: td, r, v, m: a.m + (b.m - a.m) * s, prop: a.k === b.k ? a.prop + (b.prop - a.prop) * s : b.prop, k: b.k,
             thr: b.thr, u: b.u, q: a.q && b.q ? qSlerp(a.q, b.q, s) : b.q, phase: b.phase, dv: a.dv + (b.dv - a.dv) * s };
  }
  pruneHistory(td) { const H = this.hist; let i = 0; while (i < H.length - 2 && H[i + 1].t < td) i++; if (i > 0) H.splice(0, i); }

  // otopilottan elle uçuşa geçerken fiziği ekran zamanına geri al
  rewindTo(td) {
    const x = this.stateAt(td); if (!x || x.t >= this.P.s.t - 1e-9) return;
    const st = new E.State(x.t, x.r, x.v, this.nbody ? 'N' : 'E');
    if (!this.nbody && norm(sub(x.r, E.moonPos(x.t))) < E.SOI_M) { st.r = sub(x.r, E.moonPos(x.t)); st.v = sub(x.v, E.moonVel(x.t)); st.central = 'M'; }
    this.P.s = st; this.P.h = 1.0;
    if (this.veh.k === x.k) this.veh.active.prop = x.prop;
    this.P.dvUsed = x.dv;
    if (this.P.att && x.q) this.P.att.set(x.q);
    this.hist = this.hist.filter((e) => e.t <= td); this.pushHist();
  }

  // tTarget'e kadar ilerle; bütçe (ms) aşılırsa bırak. Döner: 'COMPUTE' | 'DONE' | null
  advance(tTarget, budgetMs, manualCtrl = null, now = () => Date.now()) {
    const P = this.P, t0 = now();
    if (this.done) return 'DONE';
    if (!this.auto) {                          // elle uçuş: adımlar ekran saatine kırpılır (anında tepki)
      P.tLimit = tTarget;
      while (P.s.t < tTarget - 1e-9 && now() - t0 < budgetMs) {
        P.step(Math.min(1e9, tTarget - P.s.t), manualCtrl);
        if (this.checkSurface(true)) return 'DONE';
      }
      return null;
    }
    P.tLimit = Infinity;
    while (P.s.t < tTarget - 1e-9 && now() - t0 < budgetMs) {
      const r = this.gen.next();
      if (r.done) { this.done = true; return 'DONE'; }
      if (r.value === 'COMPUTE') return 'COMPUTE';
      if (r.value === 0) break;
      if (P.phase !== 'PDI' && P.phase !== 'YAKLASMA' && P.phase !== 'SON_INIS' && this.checkSurface(false)) return 'DONE';
    }
    return this.done ? 'DONE' : null;
  }

  // ---------------------------------------------------------------- kullanıcı müdahaleleri
  setAuto(on, td) {
    if (on === this.auto || this.done) return;
    if (!on) { this.rewindTo(td); this.auto = false; this.log('Otopilot kapatıldı — elle kontrol', 'AUTO_OFF'); }
    else { this.auto = true; this.log('Otopilot yeniden devrede (rota düzeltmeleri o anki durumdan hedefler)', 'AUTO_ON'); }
  }
  perturb(td, dvMps, dir = null) {
    if (this.done) return;
    this.rewindTo(td);
    let d = dir;
    if (!d) { const u = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; d = unit(u); }
    this.P.s.v = add(this.P.s.v, scale(d, dvMps / 1000));
    this.log(`Bozulma uygulandı: ${dvMps.toFixed(1)} m/s`, 'PERTURB', { dvm: dvMps });
    this.hist = this.hist.filter((e) => e.t < this.P.s.t); this.pushHist();
  }
  manualSeparate(td) { if (this.veh.k < this.veh.stages.length - 1 && !this.done) { this.rewindTo(td); this.separateStage(); this.pushHist(); } }

  // elle yönelim modları (merkez cisme göre)
  manualDir(mode, hold) {
    const P = this.P, moon = P.s.inMoonFrame(), [r, v] = moon ? P.s.seleno() : P.s.geo();      // merkez cisme göre (Ay'ın çevresinde Ay'a göre)
    const vh = unit(v), rh = unit(r), nh = unit(cross(r, v));
    switch (mode) {
      case 'PRO': return vh; case 'RETRO': return scale(vh, -1);
      case 'NML': return nh; case 'ANML': return scale(nh, -1);
      case 'RADOUT': return rh; case 'RADIN': return scale(rh, -1);
      case 'SRFRETRO': {                               // Ay yüzeyine göre geri yön
        if (!moon) return scale(vh, -1);
        const vr = sub(v, cross(E.omegaMoon(P.s.t), r)); return scale(unit(vr), -1);
      }
      case 'HOLD': return hold || vh;
      default: return vh;
    }
  }

  // Ay yüzeyine (ya da Dünya atmosferine) çarpma / elle temas denetimi
  checkSurface(manual) {
    const P = this.P;
    if (P.s.inMoonFrame()) {
      const [rs] = P.s.seleno();
      if (norm(rs) - R_SITE <= 0) { this.touchdown(manual); return true; }
    } else if (norm(P.s.geo()[0]) < E.R_E + 80) {
      this.log('Dünya atmosferine girdi — görev sona erdi', 'REENTRY'); this.done = true; this.result = { ok: false, reentry: true }; return true;
    }
    return false;
  }
}
