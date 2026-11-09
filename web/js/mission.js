// LS19 görevi — rocsim_mission.py'nin canlı (adım adım) JavaScript karşılığı.
// Otopilot bir üreteç (generator): her fizik adımında yield eder, ekran saatini (P.tLimit) aşmaz.
// Otopilot kapatılınca üreteç bekler, araç elle uçurulur; açılınca kaldığı yerden devam eder
// (rota düzeltmeleri o anki duruma göre yeniden hedefler).
import * as E from './engine.js';
import { HaloRef } from './halo.js';
import { conicReady } from './conic.js';
import { Attitude, qSlerp, qFromZ, qRot, qMul, qNormalize, qSwing, vAngle, Z_AXIS } from './attitude.js';
import { Dyn6 } from './attctl.js';
import { massProps, freeRot, Z_FEET } from './rigidbody.js';
import { TOUCH, POST_LANDING, velEnvelope, tipOver, surfaceNormal, tiltDeg, dustOnset } from './touchdown.js';
import { LandNav, NAV } from './landnav.js';
import { SEP, SpentStage, springSplit, tipOff, ccamDir, sepAxis, timeline } from './separation.js';
import { solvePDG, replanPDG, controlAt, controlAtSmooth } from './pdg.js';
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
  site: 'Kennedy Uzay Merkezi LC-39B (28.6271°K, 80.6210°B)' };
const TLI_DUR_ERROR = 0.05, PDI_ANGLE = 9.0 * Math.PI / 180, H_PDI = 15.0, TF_BRAKE = 310.0, TF_APPROACH = 45.0;
const GATE_HI = { x: -0.700, z: 1.500, vx: 0.045, vz: -0.035 }, GATE_LO = { x: 0.0, z: 0.250, vx: 0.0, vz: -0.018 };
const V_TOUCH = -0.001, TILT_MAX_LOW = 40 * Math.PI / 180;
const CALL_ALT = [1000, 500, 100, 30, 10], CALL_LOW = 0.05;                 // irtifa çağrıları (m); düşük yakıt: kalan/başlangıç (Apollo 11: "Five percent. Quantity light" [ALSJ 102:44:45])
export const CMD = { FOH: true, JOIN: true, HANDOVER: 4.0, HANDOVER_FAST: 1.0, MINTHR_RATE: 15 };                                  // FOH: plan düğümlerinde doğrusal ara değer (ZOH yerine); JOIN: yeni planın ilk düğümü önceki komuttan kesintisiz bağlanır; HANDOVER: plandan son iniş yasasına geçişte komutun yumuşak adım süresi (s);
// HANDOVER_FAST: ZEM/ZEV güdümünde (frenleme → yaklaşma → son iniş) aynı yumuşak adım (s; serbest güdümde devir harmanı yok: yatay temas hızını 0,4 → 0,8 m/s artırıyordu); 4 s.lik harman son iniş yasasını geciktirip
// yakıtı (ZEM'de ~8 kg) ve yatay temas hızını (serbest, tek kademe: 0,4 → 1,0 m/s) artırıyordu, 1 s komut sıçramasını 40–44° → ≤ 8°'ye indirir
// a'dan b'ye ara değer: büyüklük doğrusal, yön küresel (eşit açısal hızla). Doğrusal vektör karışımı büyüklük değişirken dönmeyi uca yığar (gaz 0,24 → 0,10 inerken adım başına 0,7° → 3,4°).
function blendVec(a, b, s) {
  const na = norm(a), nb = norm(b), lin = () => add(scale(a, 1 - s), scale(b, s));
  if (na < 1e-12 || nb < 1e-12) return lin();
  const ua = scale(a, 1 / na), ub = scale(b, 1 / nb), th = Math.acos(Math.max(-1, Math.min(1, dot(ua, ub)))), m = na + (nb - na) * s;
  if (th < 1e-6) return scale(ua, m);
  if (Math.PI - th < 1e-3) return lin();                                           // ters yönler: küresel ara değer tanımsız
  const st = Math.sin(th);
  return scale(add(scale(ua, Math.sin((1 - s) * th) / st), scale(ub, Math.sin(s * th) / st)), m);
}
// Güdüm yasası değişirken (plan → son iniş yasası) komut sıçramaz: önceki komutla yenisi arasında dur saniyede yumuşak adım (smoothstep; sıfır eğimle başlar, biter).
// Komut gaz × yön vektörü olarak harmanlanır. Süreklilik yalnız geçişte kurulur; sonrasında yasa gecikmesiz uygulanır (güdüm döngüsüne kalıcı gecikme eklenmez).
class Join {
  constructor() { this.v0 = null; this.t0 = 0; this.dur = 0; this.last = null; }
  start(t, dur) { if (this.last && dur > 0) { this.v0 = this.last; this.t0 = t; this.dur = dur; } }
  apply(t, thr, dir, thrMin) {
    let v = scale(dir, thr);
    if (this.v0) { const s = (t - this.t0) / this.dur; if (s >= 1) this.v0 = null; else { const f = s * s * (3 - 2 * s); v = blendVec(this.v0, v, f); } }
    this.last = v;
    const n = norm(v); return n > 1e-9 ? [Math.min(1.0, Math.max(thrMin, n)), scale(v, 1 / n)] : [thr, dir];
  }
}
// yerel çerçevede (x, y yatay, z yukarı) istenen itki ivmesini sınırla: itki ASLA aşağı yönde olamaz ve dikeyden TILT_MAX_LOW'dan fazla yatmaz.
// aMin (km/s²; en küçük gazın ivmesi): istenen itki en küçük gazın altındaysa (ya da aşağı yöndeyse) itki en küçük gazla verilir ve yön, istenen YATAY ivmeyi
// karşılayacak kadar yatırılır (sin φ = |a_yatay| / aMin, en çok TILT_MAX_LOW). Böylece komut yönü süreklidir: eskiden dikey bileşen sıfırın altına inince
// komut bir adımda 40° yatıktan dikeye atlıyordu (ZEM/ZEV ve serbest güdümde son iniş yasasının en küçük gaz bölgesi).
function limitTilt(at, maxTilt = TILT_MAX_LOW, aMin = 0) {
  if (at[2] <= 0 || (aMin > 0 && Math.hypot(at[0], at[1], at[2]) < aMin)) {
    const hz = Math.hypot(at[0], at[1]), sn = aMin > 0 && hz > 1e-15 ? Math.min(Math.sin(maxTilt), hz / aMin) : 0, k = 1e-9;          // k: büyüklük (gaz en küçüğe kırpılır)
    at[0] = hz > 1e-15 ? (at[0] / hz) * sn * k : 0; at[1] = hz > 1e-15 ? (at[1] / hz) * sn * k : 0; at[2] = Math.sqrt(1 - sn * sn) * k;
    return at;
  }
  const hz = Math.hypot(at[0], at[1]);
  if (Math.atan2(hz, at[2]) > maxTilt) { const k = (Math.tan(maxTilt) * at[2]) / hz; at[0] *= k; at[1] *= k; }
  return at;
}
// Son iniş yasası (yerel çerçevede PD): yatay konum/hız sönümü + dikey hız profili; itki asla aşağı yönde değildir ve dikeyden TILT_MAX_LOW'dan fazla yatmaz.
// Yönelim fizik durumudur (hız sınırlı dönüş); dengeli optimal plan kapıya dikeye yakın biter (OPT_DESCENT CONE çizelgesi), böylece bu yasaya geçişte büyük bir dönme gerekmez.
// p, v km ve km/s; döner: gereken itki ivmesi (yerel, km/s²)
export const TERM = { KP: 0.06, KD: 0.5, KV: 1.2 };
function terminalAccel(p, v, g, aMin = 0) {
  const vzr = V_TOUCH - 0.07 * Math.max(p[2], 0.0), a = [-TERM.KP * p[0] - TERM.KD * v[0], -TERM.KP * p[1] - TERM.KD * v[1], TERM.KV * (vzr - v[2])], at = sub(a, g);
  limitTilt(at, TILT_MAX_LOW, aMin);
  if (p[2] < 0.003) { at[0] = 0; at[1] = 0; }
  return at;
}
// Optimal iniş (pdg.js). Ortak: son iniş kapısı irtifası GATE_H (m; kapıdaki iniş hızı son iniş yasasının eğrisiyle uyumlu: 1 + 0,07·h), itki payı (planlama için üst sınır = pay × tam itki),
// kuru kütleye yedek (kg), yeniden çözüm aralığı (s), düğüm sayısı, gevşek kısıt ağırlığı, kumanda sürekliliği (REG: yeniden çözümde komutun önceki plandan sapma cezası; dengeli güdümde yüksek). Ön ayarlar (güvenlik koridoru):
//   opt  (dengeli): itki yönü dikeyden en çok CONE çizelgesindeki açı kadar sapar ([kalan süre s, açı °]; aralarında doğrusal): 180 s kalana dek 110° (kısıt yok gibi), 100 s kalana dek 45°'ye iner,
//                   60 s kalana dek 45°, 20 s kalana dek 20°'ye daralır ve kapıya dek 20° kalır (kapıya dikeye yakın varılır). Koni açısı basamak yerine eğimdir ve daralma yönelimin izleyebileceği kadar yavaştır:
//                   10 s'lik daralma (30 → 20 s) yönelimi planın gerisinde bırakıp son 30 s'de ani dönmelere (hata ≤ 29°, 15°/s) yol açıyordu; yakıt maliyeti ZEM'e göre kazancın bir kısmıdır.
//                   Daha dar son koni (≤ 15°) yakıtı artırır ve geç gelen bozulmayı gidermeyi güçleştirir (50 s'lik daralma + 15°'de 10 m/s bozulmalardan biri iniş planını bozdu; sona doğru 5° ve 0,5° koniler yakıtı bitirdi);
//                   son 200 s'de iniş hızı ≤ vd + 0,06·h ve yatay hız ≤ 1 + 0,15·h (yüzeye göre); ZEM'e göre ~%0,5–1 daha az Δv
//   free (serbest): işaretleme sınırı yok, hız hunisi gevşek (0,25 / 0,6, son 120 s) — saf yakıt-optimale en yakın; ZEM'e göre ~%5 daha az Δv (kapıda hızla döner)
export const OPT_DESCENT = { GATE_H: 120, THR_MARGIN: 0.9, RESERVE: 25, REPLAN: 10, N: 60, SOFT: 200, REG: 0.003,
  PRESETS: { opt: { CONE: [[180, 110], [100, 45], [60, 45], [20, 20], [0, 20]], REG: 0.3, KD: 0.06, VH0: 1.0, KH: 0.15, FUNNEL_TAIL: 200 }, free: { POINT_DEG: 0, POINT_TAIL: 0, END_DEG: 0, END_TAIL: 0, KD: 0.25, VH0: 1.0, KH: 0.6, FUNNEL_TAIL: 120 } } };
export const LANDING_MODES = { zem: 'ZEM/ZEV (Apollo benzeri)', opt: 'Optimal (SOCP, dengeli)', free: 'Optimal (SOCP, serbest)' };
export const T_L_TARGET = 1453339.4275498604;
// Ekim 2026 Apollo tasarımı (design.js, değişken kütleli sonlu itkiyle); diğer tarihler design.js ile tarayıcıda üretilir
export const DEFAULT_DESIGN = { TLI, ARRIVAL, LAUNCH, t_L: T_L_TARGET, label: '2026-10-13 (design.js)' };
const TWO_PI = 2 * Math.PI;
// Yönelim (attitude.js): ateşlemeden bu kadar önce (s) itki yönüne dönmeye başlanır; iniş aracı sınıfı 15°/s ile 180° ≈ 13 s, 2°/s'lik TLI yığını küçük açılar döner
const ATT_LEAD = 180.0, ATT_H_APPROACH = 5.0;
// TLI kesme dağılımı: tohumlu sözde rastgele sayı (mulberry32) + Box–Muller normal dağılım (yeniden üretilebilir Monte Carlo)
function gaussSeeded(seed) {
  let a = (seed >>> 0) || 1;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const u1 = Math.max(1e-12, rnd()), u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
// Dünya'ya göre özgül enerji (km²/s²), J2 potansiyeli dahil: Φ = −μ/r + μJ2R²(3 sin²φ − 1)/(2r³). İtkisiz süzülmede (J2 eksen simetrik, durağan) korunur;
// bu yüzden TLI kesmesi yakışın bitiş anından ve konumundan bağımsız aynı yörüngeyi hedefler (oskülatör Kepler enerjisi J2 yüzünden ~0,06 km²/s² salınırdı ≈ 6 m/s).
export function energyJ2(s) {
  const [r, v] = s.geo(), rn = norm(r), p = E.provider().pole(s.t), sp = dot(r, p) / rn;
  return 0.5 * dot(v, v) - E.MU_E / rn + E.MU_E * E.J2_E * E.R_E * E.R_E * (3 * sp * sp - 1) / (2 * rn ** 3);
}
// LOI doğruluğu: HA1 LOI-1'in hedef aposeleni (hedef irtifanın üstü, km; 0: yakışın bittiği yükseklik), DV_STOP kapalı döngü yakışın kesme eşiği (km/s), TOL bu kadar (km) içindeyse LOI-2 yakılmaz (v)
export const LOI_TRIM = { HA1: 0, DV_STOP: 0.00005, TOL: 0.2 };
const mod2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const dot2 = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

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

// dönme matrisinden kuaterniyon [x, y, z, w] (Shepperd): R eylemsiz vektörleri döndürür (R·v)
function qFromMat(R) {
  const tr = R[0][0] + R[1][1] + R[2][2];
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; return [(R[2][1] - R[1][2]) / S, (R[0][2] - R[2][0]) / S, (R[1][0] - R[0][1]) / S, 0.25 * S]; }
  if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const S = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; return [0.25 * S, (R[0][1] + R[1][0]) / S, (R[0][2] + R[2][0]) / S, (R[2][1] - R[1][2]) / S]; }
  if (R[1][1] > R[2][2]) { const S = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; return [(R[0][1] + R[1][0]) / S, 0.25 * S, (R[1][2] + R[2][1]) / S, (R[0][2] - R[2][0]) / S]; }
  const S = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; return [(R[0][2] + R[2][0]) / S, (R[1][2] + R[2][1]) / S, 0.25 * S, (R[1][0] - R[0][1]) / S];
}

export class Mission {
  // nbody: true (varsayılan) N-cisim çözücü (tek eylemsiz çerçeve, etki küresi geçişi yok); false etki küresi (iki merkez cisimli) çözücü
  // landing: 'zem' (sıfır-çaba-ıskası güdümü) | 'opt' | 'free' (yakıt-optimal, kayıpsız dışbükeyleştirilmiş SOCP; LANDING_MODES; konik çözücü yüklü değilse ZEM)
  // attitude: 'dyn6' (varsayılan; true) 6-DOF rijit cisim dinamiği (attctl.js: RCS + TVC, Euler denklemleri) | 'kin' kinematik hız sınırlı yönelim (attitude.js) | false yönelimsiz (itki yönü komutla birebir)
  // nav: iniş seyrüseferi (landnav.js): {} ya da { seed, faults, … } = açık (güdüm IMU + radar + TRN kestirimini kullanır) | false (varsayılan: güdüm gerçek durumu bilir; hazır nominal veri ve testler bununla)
  // TLI kesmesi güdümle (enerji hedefi): tliCutErr (m/s, işaretli) açık kesme hatası; tliDisp { sigma (m/s, 1σ), seed } tohumlu normal dağılım; tliError (s) eski
  // zamanlama hatası seçeneği (kesmedeki ivmeyle Δv'ye çevrilir; varsayılan 0). Python uyumunda (compat) TLI eskisi gibi süreli (TLI_DUR_ERROR fazla yakışla).
  constructor({ tliError = 0, tliCutErr = 0, tliDisp = null, verbose = false, compat = false, design = DEFAULT_DESIGN, nbody = true, landing = 'zem', attitude = 'dyn6', nav = false } = {}) {
    this.D = design; const { TLI, ARRIVAL, LAUNCH } = design;
    this.nbody = nbody; this.landing = landing; this.descentInfo = null;
    this.navOpt = compat || nav === false ? null : nav; this.nav = null;
    this.compat = compat;          // true: Python sürümüyle birebir (MCC-3 yok, LOI 20 s kuantalı)
    this.attModel = compat || !attitude ? null : attitude === 'kin' ? 'kin' : 'dyn6';
    this.attitude = !!this.attModel;               // true: itki, dönen GERÇEK yönelim ekseni boyunca uygulanır (6-DOF ya da kinematik); false: itki yönü komutla birebir
    this.debris = [];              // ayrılan kademeler: { id, kind: 'tli' | 'orb', name, P: yayınım, q: ayrılma anındaki yönelim, rot: 6-DOF serbest dönme durumu { q, w, I, t } (yoksa q eylemsiz sabit), t }
    // modüler yapılandırma (eski tasarımlarda yoksa Apollo varsayılanları)
    this.hPark = design.EARTH ? design.EARTH.h : H_PARK;
    this.hLlo = design.LLO && design.LLO.h ? design.LLO.h : H_LLO;
    this.nLlo = design.LLO && design.LLO.revs ? design.LLO.revs : 2;
    this.halo = design.profile === 'HALO' ? new HaloRef(null, design.HALO.patches, design.HALO.tDep, design.HALO.tNri) : null;
    this.veh = new E.Vehicle(design.STAGES || STAGES);
    this.events = []; this.verbose = verbose; this.tliError = compat ? TLI_DUR_ERROR : tliError;
    // TLI kesme hatası (km/s, hız yönünde): açık değer + tohumlu dağılım. Gerçek üst kademeler hedef enerjiye (C3) göre keser; kalan hata kesme dağılımıdır.
    this.tliCutErr = (tliCutErr || 0) / 1000 + (tliDisp && tliDisp.sigma ? (tliDisp.sigma / 1000) * gaussSeeded(tliDisp.seed ?? 1) : 0);
    this.stage = null;                 // ayrılan TLI kademesi (separation.js SpentStage)
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
      ...this.sepPlan(TLI.t_ign + TLI.x[1] + this.sepCoast()),
      { key: 'MCC-1', name: 'MCC-1', t: TLI.t_ign + TLI.x[1] + this.sepCoast() + 20 * 3600 },
      { key: 'MCC-2', name: 'MCC-2', t: ARRIVAL.t_P - 22 * 3600 }];
    if (this.halo) {
      this.plan.push({ key: 'NRI', name: 'Halo girişi (NRI)', t: ARRIVAL.t_P - 60 });
      this.skTimes().forEach((sk, i) => this.plan.push({ key: 'SK-' + (i + 1), name: `İstasyon tutma ${i + 1}`, t: sk.t }));
      this.plan.push({ key: 'DEP', name: "Halo'dan ayrılış", t: design.DEP.t - 90 }, ...this.tcmTimes().map((c, i) => ({ key: c.key, name: `Transfer düzeltmesi ${i + 1}`, t: c.t })),
        { key: 'LOI', name: 'LLO girişi', t: design.LLO.tP - 84 });
    } else this.plan.push({ key: 'LOI', name: 'LOI', t: ARRIVAL.t_P - 84 });
    // LOI-2: LOI-1'den yaklaşık yarım tur sonra (en yakın noktada) kısa düzeltme yakışı; tek turluk LLO'da ve Python uyumluluk kipinde yok
    if (!compat && this.nLlo >= 2) this.plan.push({ key: 'LOI-2', name: 'LOI-2 (dairesel yörünge düzeltmesi)', t: (this.halo ? design.LLO.tP : ARRIVAL.t_P) + 120 + 0.5 * Pl });
    // SEP2 zamanı yaklaşıktır: alçalış yayında hSep irtifasına ulaşma, profile göre PDI'dan ~140–240 s önce
    this.plan.push({ key: 'DOI', name: 'DOI', t: design.t_L - 1620 - 395 - 0.5 * Pl + 60 }, ...(design.SEP2 ? [{ key: 'SEP2', name: 'Ay yörünge kademesi ayrılır', t: design.t_L - 2015 - 200 }] : []), { key: 'PDI', name: 'PDI', t: design.t_L - 2015 },
      { key: 'INDI', name: 'Temas', t: design.t_L - 1620 });
    this.gen = this.run();
  }

  // TLI motor kesmeden ayrılmaya süzülme: Artemis I'deki gibi 610 s (separation.js [A1]); Python uyumunda eski 30 dk
  sepCoast() { return this.compat ? 1800.0 : SEP.coast; }
  // ayrılma ve kademenin işleri (plan çizelgesi): ayrılma, CCAM, bertaraf yakışı, boşaltma, görev sonu
  sepPlan(tSep, S = null) {
    if (this.compat) return [{ key: 'SEP', name: 'TLI kademesi ayrılır', t: tSep }];
    const T = S ? S.tl : timeline(0, 1);
    return [{ key: 'SEP', name: 'TLI kademesi ayrılır', t: tSep }, { key: 'SEP-CCAM', name: 'Kademe kaçınma manevrası (CCAM)', t: tSep + SEP.ccam0 },
      ...(T.disp ? [{ key: 'SEP-DISP', name: 'Kademe bertaraf yakışı', t: tSep + T.disp[0] }] : []),
      ...(T.bd ? [{ key: 'SEP-BD', name: 'Kademe itici boşaltma', t: tSep + T.bd[0] }] : []), { key: 'SEP-EOM', name: 'Kademe pasifleştirme', t: tSep + T.eom }];
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
    if (this.D.RAISE && this.D.RAISE.n) {                             // yükseltilmiş elips (design.js parkState): perije rp, apoje R_E + ha; phi perijeden gerçek anomali
      const RA = E.R_E + this.D.RAISE.ha, e = (RA - rp) / (RA + rp), pp = rp * (1 + e), r = pp / (1 + e * Math.cos(phi)), w = Math.sqrt(E.MU_E / pp);
      const rh = add(scale(p, Math.cos(phi)), scale(q, Math.sin(phi))), th = add(scale(p, -Math.sin(phi)), scale(q, Math.cos(phi)));
      return new E.State(TLI.t_ign, scale(rh, r), add(scale(rh, w * e * Math.sin(phi)), scale(th, w * (1 + e * Math.cos(phi)))), 'E');
    }
    return new E.State(TLI.t_ign, add(scale(p, rp * Math.cos(phi)), scale(q, rp * Math.sin(phi))),
      add(scale(p, -vc * Math.sin(phi)), scale(q, vc * Math.cos(phi))), 'E');
  }
  // TLI hedefi: tasarımın TLI yakışı (design.js flyTli: aynı başlangıç durumu, araç ve sabit yunuslamalı yönlendirme, tasarım süresi) bittiğinde J2 dahil özgül enerji
  // ve ayrılma anındaki hız (yayın enerjiye katkısı v·Δv_L için). Tasarımın hedeflediği yörünge budur; araç bu enerjiye ulaşınca keser.
  tliTarget() {
    if (this._tliTgt) return this._tliTgt;
    const D = this.D, [, dur, pitch] = D.TLI.x;
    const Q = new E.Propagator(this.parkStateAtIgn(), new E.Vehicle(this.tliDesignStages()), 1800.0, 1.0);
    const c = (Pp) => { const r = Pp.s.r, v = Pp.s.v, vh = unit(v), nh = unit(cross(r, v)), rh = cross(nh, vh); return [1.0, add(scale(vh, Math.cos(pitch)), scale(rh, Math.sin(pitch)))]; };
    Q.runUntil(D.TLI.t_ign + dur, c);
    const Et = energyJ2(Q.s), [r, v] = Q.s.geo();
    Q.runUntil(Q.s.t + this.sepCoast());
    return (this._tliTgt = { E: Et, c3: dot(v, v) - 2 * E.MU_E / norm(r), vSep: norm(Q.s.geo()[1]) });
  }
  // tasarımın TLI yakışındaki araç (design.js flyTli: K.STAGES): yükseltmeli tasarımda kademe yükseltme yakışlarının yakıtını da taşır (D.STAGES'e sonradan eklenir), TLI başında o yakıt yoktur
  tliDesignStages() {
    const S = (this.D.STAGES || STAGES).map((x) => ({ ...x }));
    if (this.D.RAISE && this.D.RAISE.propExtra) S[0].prop = Math.max(0, S[0].prop - Math.round(this.D.RAISE.propExtra));
    return S;
  }
  // Güdümlü TLI kesmesi: her adımda kalan süre τ = (E_hedef − E) / (dE/dt), dE/dt = (T/m)·(v·u); son adım tam τ'ya kesilir (denetim periyodundan bağımsız).
  // E_hedef = tasarım enerjisi − ayrılma yayının iniş aracına vereceği enerji (v_ayrılma · Δv_L) − motor kuyruk itkisinin enerjisi + kesme hatası (v · δv).
  *tliBurn(tIgn, dur, ctrl) {
    const P = this.P, st = this.veh.active, tg = this.tliTarget(), tMax = tIgn + 1.5 * dur + 60;
    const tailImp = st.eng ? st.eng.tailImp || 0 : 0, tailDur = st.eng ? st.eng.tail[st.eng.tail.length - 1][0] : 0;
    for (;;) {
      yield* this.waitClock();
      const [, v] = P.s.geo(), m = this.veh.mass(), u = P.lastThr > 0 ? P.lastU : ctrl(P)[1], vu = dot(v, u);
      const mS = st.dry + st.prop, dvL = springSplit(m - mS, mS).dvL, aF = st.T / m;
      const eT = tg.E - tg.vSep * dvL - vu * tailImp * aF + norm(v) * (this.tliCutErr + this.tliError * aF);
      const tau = (eT - energyJ2(P.s)) / Math.max(1e-12, aF * vu);
      if (tau <= 1e-5 || st.prop <= 0 || P.s.t >= tMax) break;
      P.step(Math.min(tau, P.tLimit - P.s.t), ctrl);
      yield 1;
    }
    this.tliCut = { t: P.s.t, tg };
    if (tailDur > 0) yield* this.until(P.s.t + tailDur + 1e-3);                 // kuyruk itkisi (motor sönerken)
  }
  // TLI kesme günlüğü: yakış süresi, Δv, C3 (hedefle), perije/apoje, kalan yakıt
  logTliCut() {
    const P = this.P, st = this.veh.active, e0 = this.events.find((e) => e.key === 'TLI'), [r, v] = P.s.geo(), el = E.elements(r, v, E.MU_E);
    const c3 = dot(v, v) - 2 * E.MU_E / norm(r), tb = P.s.t - e0.t, dv = (P.dvUsed - e0.dv) * 1000, tg = this.tliCut ? this.tliCut.tg : null;
    const apo = el.e < 1 ? `${Math.round(el.ra - E.R_E)} km` : '∞';
    this.log(`TLI motor kesme: yakış ${tb.toFixed(1)} s, Δv ${dv.toFixed(1)} m/s, C3 ${c3.toFixed(3)} km²/s²${tg ? ` (tasarım ${tg.c3.toFixed(3)})` : ''}, perije ${(el.rp - E.R_E).toFixed(1)} km, apoje ${apo}, kademede ${st.prop.toFixed(0)} kg yakıt`,
      'TLI_CUT', { c3, tb, dvm: dv, rp: el.rp - E.R_E, ra: el.ra - E.R_E });
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
    P.att = this.attModel === 'dyn6' ? new Dyn6(this.prograde(P), unit(r)) : new Attitude(this.prograde(P), unit(r));       // gövde x: yerel dikey; yuvarlanma sonra sürekli (en kısa yay) taşınır
    this.coastSign = 1; this.attMode = null;
    P.attCmd = (Pp) => (this.attMode ? this.attMode(Pp) : scale(this.prograde(Pp), this.coastSign));
  }
  // attMode (yakış öncesi hizalama komutu): atanınca fizik motoruna 'itki vektörünü hedefle' bayrağı da verilir (Propagator.attAim).
  // Yakış bitince (attMode = null) araç bakmakta olduğu tarafta kalır: hız yönünde (ileri) ya da hıza ters (geri) hizalı süzülür (coastSign); ters yönlü bir yakıştan (LOI, NRI…) sonra
  // gereksiz bir 180° "takla" atıp ileri yöne dönmez, sıradaki ters yönlü yakışa (DOI) hazır kalır.
  get attMode() { return this._attMode || null; }
  set attMode(v) {
    if (!v && this._attMode && this.P && this.P.att) { const a = this.P.att.axis(); this.coastSign = dot(a, this.prograde(this.P)) < 0 ? -1 : 1; }
    this._attMode = v; if (this.P) this.P.attAim = !!v;
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
    this.log(`Yörüngeye giriş (fırlatma ${E.utcString(LAUNCH.t_launch)}, ${(LAUNCH.site || 'KSC').replace(/\s*\(.*$/, '')}, azimut ${LAUNCH.az.toFixed(1)}°) — ${(this.D.RAISE ? this.D.RAISE.leo.alt : this.hPark).toFixed(0)} km park yörüngesi`, 'INS');
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
    // TLI: güdümlü kesme (hedef enerji; ayrılma yayının iniş aracına vereceği Δv ve kuyruk itkisi hesaba katılır); Python uyumunda süreli
    P.phase = 'TLI'; this.log('TLI ateşleme', 'TLI');
    if (this.compat) yield* this.until(tTli + dur + this.tliError, tliCtrl);
    else yield* this.tliBurn(tTli, dur, tliCtrl);
    this.attMode = null;
    this.logTliCut();
    P.phase = 'SUZULME'; P.hMaxCoast = 120.0;
    this.tNext = this.tSepPlan = P.s.t + this.sepCoast();
    yield* this.until(this.tSepPlan);
    // kademe ayrılması; kademe kendi yayınımı ve tutum denetimiyle uçar, işleri (CCAM, bertaraf, boşaltma, pasifleştirme) zamanında kaydedilir
    this.separateStage();
    P.hMaxCoast = 1800.0;
    if (this.stage) yield* this.stageEvents();
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
    const D = this.D, refFn = (t) => this.haloRefGeo(t);
    const sks = this.skTimes();
    for (let i = 0; i < sks.length; i++) {
      yield* this.mcc(sks[i].t, sks[i].tTgt, refFn, 'SK-' + (i + 1), 'pos', 0.01, 'HALO');
    }
    // ayrılış: LLO varış noktasını hedefle (sonlu yakış, tasarımın Δv'si başlangıç tahmini)
    const dv0 = D.DEP.dv, tb = burnTime(this.veh, norm(dv0));
    const rP2geo = (t) => [add(D.DEP.rP2, E.moonPos(D.LLO.tP)), add(D.DEP.vP2, E.moonVel(D.LLO.tP))];
    yield* this.mcc(D.DEP.t - tb / 2, D.LLO.tP, rP2geo, 'DEP', 'pos', 0, 'TRANSFER', 'DEP', dv0);
    // DEP → LLO transferinde rota düzeltmeleri (TCM): ayrılış yakışının hatası (ör. 0,7 m/s) 3,5 günde perilünü ±50 km kaydırır, 2,5 m/s Ay'a çarptırır.
    // Her biri aynı LLO varış noktasını (konum + zaman) hedefler; gereken Δv eşiğin altındaysa yakılmaz (Artemis II ilk dış yol düzeltmesini rota zaten doğru olduğu için iptal etti).
    for (const c of this.tcmTimes()) yield* this.mcc(c.t, D.LLO.tP, rP2geo, c.key, 'pos', c.min, 'TRANSFER');
  }
  // DEP → LLO düzeltme zamanları: DEP + 12 sa, LLO − 12 sa, LLO − 5 sa; eşikler 0,05 / 0,05 / 0,1 m/s (v). Kısa transferde birbirine 6 sa'ten yakın olanlar düşer.
  tcmTimes() {
    const D = this.D; if (!this.halo || !D.DEP || !D.LLO) return [];
    const H = 3600, t0 = D.DEP.t, t1 = D.LLO.tP, out = [];
    for (const [t, min] of [[t0 + 12 * H, 0.05], [t1 - 12 * H, 0.05], [t1 - 5 * H, 0.1]]) {
      if (t < t0 + 2 * H || t > t1 - 3 * H || (out.length && t < out[out.length - 1].t + 6 * H)) continue;
      out.push({ t, min });
    }
    return out.map((c, i) => ({ ...c, key: 'TCM-' + (i + 1) }));
  }

  // etkin kademeyi ayır (sonraki kademe varsa): TLI kademesi TLI kesmeden 610 s sonra (Artemis I), iki kademeli inişte Ay yörünge kademesi PDI'dan önce.
  // Kelepçe bandı açılır, yaylar ayrılma ekseni (yığının gövde +z ekseni; süzülmede TLI'dan sonra ileri, inişte geri yönelimli) boyunca SEP.dvRel bağıl hız verir;
  // momentum korunur (separation.js springSplit): iniş aracı +Δv_L, kademe −Δv_S, kütlelerle ters orantılı. 6-DOF'ta iki gövde ayrılma dönmesi (tip-off) alır:
  // iniş aracı SEP.tipL (Atlas V sınırları içinde), kademe eşit ve zıt açısal momentum. TLI kademesi kendi tutum denetimiyle uçan bir SpentStage olur (CCAM, bertaraf,
  // boşaltma, pasifleştirme, takla); Ay yörünge kademesi ayrılır ayrılmaz denetimsizdir (torksuz serbest dönme). Döner: şimdi ayrıldıysa true.
  separateStage() {
    const P = this.P, k = this.veh.k, st = this.veh.stages[k];
    if (k >= this.veh.stages.length - 1) return false;
    if (this.compat) {                                                  // Python sürümü: kademe 0,5 m/s geri, iniş aracına itki yok
      const sst = P.s.copy(); sst.v = sub(sst.v, scale(unit(sst.v), 0.0005));
      this.stageP = this.prop(sst, new E.Vehicle([{ name: 'kademe', dry: st.dry, prop: st.prop, T: 0, isp: 1 }]), 1800.0);
      this.debris.push({ id: this.debris.length, kind: k === 0 ? 'tli' : 'orb', name: st.name, P: this.stageP, q: null, rot: null, t: P.s.t });
      if (k === 0) this.t_sep = P.s.t; else this.t_sep2 = P.s.t;
      this.veh.separate(); this.log(`${st.name} ayrıldı`, k === 0 ? 'SEP' : 'SEP2');
      return true;
    }
    const axis = sepAxis(P), mS = st.dry + st.prop, mL = this.veh.mass() - mS, { dvL, dvS } = springSplit(mL, mS);
    const sst = P.s.copy(); sst.v = sub(sst.v, scale(axis, dvS));
    const q0 = P.att ? P.att.q.slice() : null;
    let rot = null, wS = [0, 0, 0];
    if (P.att && P.att.dynamic) {
      const mpS = massProps([{ ...st }], 0), mpL = massProps(this.veh.stages, k + 1), tip = tipOff(mpL.I, mpS.I);       // ayrılan kademe tek başına (kendi rolü ve geometrisi) / kalan araç
      wS = add(P.att.w, tip.wS); P.att.w = add(P.att.w, tip.wL);
      P.att.mode = 'dyn'; P.att.cPrev = null;
      if (k > 0) rot = { q: q0.slice(), w: wS, I: mpS.I, t: P.s.t };
    }
    const sep = { t: P.s.t, axis, dvL, dvS, mL, mS, vS: sst.v.slice(), vL: add(P.s.v, scale(axis, dvL)), v0: P.s.v.slice() };
    this.veh.separate();
    P.s.v = sep.vL.slice();
    if (this.pushHist) this.pushHist();                                 // ayrılma anı: yay itişi sonrası durum (ekran ara değeri sıçramayı karıştırmasın)
    if (k === 0) {
      const S = this.stage = new SpentStage(sst, st, q0 || qFromZ(axis), wS, axis, ccamDir(P.s.geo()[0], axis), (s, v) => this.prop(s, v, 1800.0, 1.0), { mL, mS, dvL, dvS });
      this.stageP = S;
      this.debris.push({ id: this.debris.length, kind: 'tli', name: st.name, P: S, S, q: q0, get rot() { return S.rot; }, t: P.s.t, sep });
      this.t_sep = P.s.t;
    } else {
      this.stageP = this.prop(sst, new E.Vehicle([{ name: 'kademe', dry: st.dry, prop: st.prop, T: 0, isp: 1 }]), 60.0);
      this.debris.push({ id: this.debris.length, kind: 'orb', name: st.name, P: this.stageP, q: q0, rot, t: P.s.t, sep });
      this.t_sep2 = P.s.t;
    }
    if (k === 0) {
      this.log(`${st.name} ayrıldı`, 'SEP', { dvL: dvL * 1000, dvS: dvS * 1000 });
      this.log(`Kelepçe bandı açıldı: yaylar ${SEP.dvRel.toFixed(1)} m/s bağıl hız verdi (iniş aracı +${(dvL * 1e6).toFixed(0)} mm/s, kademe −${(dvS * 1e6).toFixed(0)} mm/s, momentum korunur); kademede ${st.prop.toFixed(0)} kg yakıt`, 'SEP-SPRING');
    } else this.log(`${st.name} ayrıldı (irtifa ${(norm(P.s.seleno()[0]) - R_SITE).toFixed(1)} km, ${st.prop.toFixed(0)} kg yakıt atıldı); iniş kademesi ${this.veh.mass().toFixed(0)} kg`, 'SEP2', { dvL: dvL * 1000, dvS: dvS * 1000 });
    return true;
  }
  // ayrılan TLI kademesinin işleri: kademe kendi yayınımıyla uçar; görev her işin anında kademeyi oraya dek ilerletir ve kaydeder
  *stageEvents() {
    const S = this.stage, t0 = S.t0;
    const at = function* (self, dt, key, msg) { self.tNext = t0 + dt; yield* self.until(t0 + dt); S.runUntil(t0 + dt); self.log(msg(), key); };
    yield* at(this, SEP.turn0, 'SEP-TURN', () => 'TLI kademesi CCAM yönelimine dönüyor (90°, itici gazı iniş aracından uzağa)');
    yield* at(this, SEP.ccam0, 'SEP-CCAM', () => `TLI kademesi CCAM: 4 × 27 N hidrazin iticisi ${(SEP.ccam1 - SEP.ccam0).toFixed(0)} s`);
    yield* at(this, SEP.ccam1, 'SEP-CCAM_END', () => `TLI kademesi CCAM tamam: iniş aracına uzaklık ${(this.stageRange() * 1000).toFixed(0)} m`);
    yield* this.stageDisposal();
    const T = S.tl;
    this.plan = this.plan.filter((p) => !/^SEP-/.test(p.key));
    this.plan.splice(this.plan.findIndex((p) => p.key === 'SEP') + 1, 0, ...this.sepPlan(t0, S).slice(1));
    if (T.bd) yield* at(this, T.bd[0], 'SEP-BD', () => `TLI kademesi kalan ${S.st.prop.toFixed(0)} kg LOX/LH2'yi motordan boşaltıyor`);
    this.tNext = t0 + T.eom; yield* this.until(t0 + T.eom); S.runUntil(t0 + T.eom); if (!S.rot) S.passivate();
    this.log(`TLI kademesi pasifleştirildi: görev sonu, tutum denetimi kapandı, denetimsiz süzülüyor (iniş aracına uzaklık ${this.stageRange().toFixed(1)} km)`, 'SEP-EOM');
  }
  // bertaraf yakışı (kademenin ana motoru): stageDisposalPlan çözer; çözüm yoksa yakış yapılmaz
  *stageDisposal() {
    const S = this.stage, plan = this.stageDisposalPlan ? this.stageDisposalPlan() : null;
    if (plan && plan.dv) S.setDisposal(plan.dv);
  }
  // ayrılan TLI kademesinin iniş aracına uzaklığı (km): kademe şimdiki görev anına ilerletilir
  stageRange() {
    const S = this.stage; if (!S) return null;
    if (S.s.t < this.P.s.t) S.runUntil(this.P.s.t);
    const Q = this.prop(this.P.s.copy(), E.dummyVehicle(), 60.0); Q.runUntil(S.s.t);
    return norm(sub(S.s.geo()[0], Q.s.geo()[0]));
  }
  // ayrılan kademenin t anındaki yönelimi: TLI kademesi görev sonuna dek kendi denetimiyle, sonra (ve Ay yörünge kademesi hep) torksuz serbest dönme (Euler denklemleri);
  // kinematik/yönelimsiz modelde Ay yörünge kademesinin yönelimi ayrıldığı andaki gibi sabit kalır
  debrisQ(d, t) {
    if (d.S) return d.S.qAt(t) || d.q;
    const r = d.rot; if (!r) return d.q;
    if (t > r.t + 1e-9) { const s = freeRot(r.q, r.w, r.I, t - r.t); r.q = s.q; r.w = s.w; r.t = t; }
    return r.q;
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
        if (!this.compat && rem < ATT_LEAD + 120 && dot(rs, vs) < 0) break;               // ateşleme anı ve hedef öngörüyle (loiPlan) seçilir
        if (this.attitude && !this.attMode && rem < ATT_LEAD && dot(rs, vs) < 0) this.attMode = dirLoi;
        if (rem <= 0 && dot(rs, vs) < 0) break;
      } else this.tNext = tArr - 90;
      yield* this.stepOnce();
    }
    let lp = null;
    if (!this.compat) {
      this.status = 'LOI hedefleniyor…'; yield 'COMPUTE';
      lp = this.loiPlan(P.s, planeN ? unit(planeN) : unit(cross(...P.s.seleno())));
      this.status = ''; this.tNext = lp.tIgn;
      yield* this.approach(lp.tIgn, dirLoi, Math.min(ATT_LEAD, Math.max(0, lp.tIgn - P.s.t - 1)));
    }
    P.phase = 'LOI'; P.hMaxBurn = 0.5;
    const hdir = planeN ? unit(planeN) : unit(cross(...P.s.seleno())), nm = this.halo ? 'LLO girişi' : 'LOI';
    this.log(`${nm} ateşleme (periselen irtifası ~${this.periAlt().toFixed(1)} km)`, 'LOI');
    const orbit = () => { const [rs, vs] = P.s.seleno(), el = E.elements(rs, vs, E.MU_M); return [el.rp - E.R_M, el.ra - E.R_M]; };
    if (this.compat) {                                  // Python sürümü: tek yakış, bittiği yarıçapta dairesel (hedef irtifadan 2–5 km yüksek biter)
      const vt = (rs) => scale(unit(cross(hdir, rs)), Math.sqrt(E.MU_M / norm(rs)));
      const loiCtrl = (Pp) => {
        const [rs, vs] = Pp.s.seleno(), dv = sub(vt(rs), vs), amax = stg.T / this.veh.mass();
        return [Math.min(1.0, Math.max(stg.thr_min, norm(dv) / (amax * 2.0))), unit(dv)];
      };
      const loiStop = (Pp) => { const [rs, vs] = Pp.s.seleno(); return norm(sub(vt(rs), vs)) < 0.0004; };
      P.hMaxBurn = 0.2;
      yield* this.until(P.s.t + 2000, loiCtrl, loiStop);
      this.attMode = null;
    } else {
      // Ay'ın J2/C22 alanında osküle periselen/aposelen tur boyunca ~1,5 km oynar (110 km'de gerçekten dairesel bir yörüngenin osküle aposeleni 0,5–1,5 km yüksek okunur):
      // hedef, aracın GERÇEK uzaklığıdır (yayınımla öngörülen bir turdaki en yakın/en uzak yükseklik). Eski yasa "bulunduğu yarıçapta dairesel" hedefliyordu; yakış periselenden
      // tb/2 önce (~7 km yukarıda) başlayıp radyal hızı erken söndürdüğü için yörünge hedefin 2–6 km üstünde bitiyordu (Apollo 114,7 × 116,5, NRHO 102,0 × 103,7 km).
      const rT = E.R_M + this.hLlo, Tp = TWO_PI * Math.sqrt(rT ** 3 / E.MU_M);
      // LOI-1 (kapalı döngü): periselen hedefte, aposelen olabildiğince alçak. Osküle periselen hedefi, kopya üzerinde uçulan yakıştan sonraki GERÇEK en yakın yükseklik hedefe eşit olana dek düzeltilir.
      { const L = this.loiLaw(hdir, lp.rpT, rT, this.veh); P.hMaxBurn = 0.05; yield* this.until(P.s.t + 2000, L.ctrl, L.stop); this.attMode = null; }
      const [p1, a1] = this.rRange(P.s, 1.2 * Tp);
      this.tLlo = P.s.t;                                // Ay yörüngesinin başlangıcı: DOI zamanlaması buna göre (LOI-2 araya girse de iniş zamanı değişmez)
      this.log(`${nm} 1. yakış tamam: periselen ${p1.toFixed(1)} km, aposelen ${a1.toFixed(1)} km`, 'LOI-1_END');
      P.phase = 'AY_YORUNGESI'; P.hMaxCoast = 60.0;
      // LOI-2 (Apollo 11'de LOI-1'den iki tur sonra periselende daireselleştirme): en yakın noktada kısa düzeltme yakışı; yörünge hedefe zaten yakınsa yakılmaz.
      // Tek turluk LLO'da (DOI yarım turdan sonra) yer yoktur.
      if (Math.abs(p1 - this.hLlo) > LOI_TRIM.TOL || Math.abs(a1 - this.hLlo) > LOI_TRIM.TOL) {
        if (this.nLlo >= 2) yield* this.loi2(hdir, rT, Tp);
        else this.log(`LOI-2 atlandı: tek turluk Ay yörüngesinde zaman yok (periselen ${p1.toFixed(1)} km, aposelen ${a1.toFixed(1)} km)`, 'LOI-2_SKIP');
      } else this.log(`LOI-2 gerekmedi: yörünge hedeften en çok ${LOI_TRIM.TOL} km sapıyor`, 'LOI-2_SKIP');
    }
    const [rp, ra] = this.compat ? orbit() : this.rRange(P.s, 1.2 * TWO_PI * Math.sqrt((E.R_M + this.hLlo) ** 3 / E.MU_M));
    this.log(`${nm} tamam: periselen ${rp.toFixed(1)} km, aposelen ${ra.toFixed(1)} km`, 'LOI_END');
    P.phase = 'AY_YORUNGESI'; P.hMaxCoast = 60.0;
  }
  // LOI-1 öngörüsü (kopya üzerinde uçulan kapalı döngü yakış): ateşleme anı ve osküle periselen hedefi, yakıştan sonraki bir turda GERÇEK en yakın yükseklik hedefe eşit olacak
  // biçimde düzeltilir: varış periseleni hedefteyse periselende ortalı yakışın osküle periselen hedefi, hedefin altındaysa (halo → LLO transferi hedef noktayı eğik keser)
  // "bulunduğu yarıçapta dairesel" yakışın ateşleme anı. Döner { tIgn, rpT }.
  loiPlan(s0, hdir) {
    const rT = E.R_M + this.hLlo, Tp = TWO_PI * Math.sqrt(rT ** 3 / E.MU_M), [rs, vs] = s0.seleno(), el = E.elements(rs, vs, E.MU_M), e = el.e, a = Math.abs(el.a), r = norm(rs);
    const tAt = (nu) => { if (e > 1) { const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2)); return (e * Math.sinh(F) - F) * Math.sqrt(a ** 3 / E.MU_M); }
      const Ea = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)); return (Ea - e * Math.sin(Ea)) * Math.sqrt(a ** 3 / E.MU_M); };
    const nu0 = -Math.acos(Math.max(-1, Math.min(1, (el.p / r - 1) / e))), nuS = el.rp >= rT ? 0 : -Math.acos(Math.max(-1, Math.min(1, (el.p / rT - 1) / e)));
    const vS = Math.sqrt(E.MU_M * (2 / Math.max(el.rp, rT) - (e < 1 ? 1 / a : -1 / a))), tb = burnTime(this.veh, Math.max(0.05, vS - Math.sqrt(E.MU_M / rT)));
    const tMinIgn = s0.t + 30;
    let tIgn = Math.max(tMinIgn, s0.t + tAt(nuS) - tAt(nu0) - tb / 2), rpT = rT;
    const sim = (t, rp) => {
      const Q = this.prop(this.coastCopy(s0, t), this.veh.clone(), 60.0, 0.05), L = this.loiLaw(hdir, rp, rT, Q.veh);
      Q.runUntil(Q.s.t + 2000, L.ctrl, L.stop);
      return this.rRange(Q.s, 1.2 * Tp)[0] - this.hLlo;
    };
    if (el.rp >= rT - 3) {                              // varış periseleni hedefte (Apollo, NRHO): periselende ortalı, osküle periselen hedefi düzeltilir
      for (let it = 0; it < 4; it++) { const f = sim(tIgn, rpT); if (Math.abs(f) < 0.02) break; rpT -= f; }
    } else {                                            // hedefin altından geçen varış (L1/L2 halo → LLO): bulunduğu yarıçapta dairesel; ateşleme anı (kiriş yöntemi) yakış hedef yükseklikte bitsin diye
      rpT = Infinity;
      let t0 = tIgn, f0 = sim(t0, rpT), t1 = Math.max(tMinIgn, t0 - 20), f1 = sim(t1, rpT);
      for (let it = 0; it < 8 && Math.abs(f1) > 0.02 && Math.abs(f1 - f0) > 1e-6; it++) {
        const t2 = Math.max(tMinIgn, Math.min(t0 + 120, t1 - f1 * (t1 - t0) / (f1 - f0)));
        t0 = t1; f0 = f1; t1 = t2; f1 = sim(t1, rpT);
      }
      tIgn = t1;
    }
    return { tIgn, rpT };
  }
  // s durumundan T boyunca itkisiz yayınımda Ay yüzeyine (R_M) göre en küçük ve en büyük GERÇEK yükseklik (km); dv: başta eklenen anlık hız (km/s, isteğe bağlı)
  rRange(s, T, dv = null) {
    const s0 = s.copy(); if (dv) s0.v = add(s0.v, dv);
    const Q = this.prop(s0, E.dummyVehicle(), 30.0), t1 = s0.t + T; let lo = Infinity, hi = -Infinity;
    while (Q.s.t < t1 - 1e-9) { Q.step(Math.min(30.0, t1 - Q.s.t)); const h = norm(Q.s.seleno()[0]) - E.R_M; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    return [lo, hi];
  }
  // Kapalı döngü yörünge hedefleme (kazanılacak hız güdümü): her adımda, bulunulan noktadan geçen ve osküle periselen/aposeleni (rpT, raT) olan yörüngenin (hdir düzleminde) hızı istenir;
  // itki farka doğru, bitişe yaklaştıkça kısılır; fark LOI_TRIM.DV_STOP'un altına inince (ya da en küçük değerinden artmaya başlayınca) kesilir.
  // Nokta hedef periselenin altındaysa periselen orada, aposelen hedefinin üstündeyse aposelen orada alınır (yörünge bulunulan noktadan geçmek zorundadır).
  loiLaw(hdir, rpT, raT, veh) {
    const stg = veh.active;
    const vReq = (rs, vs) => {
      const r = norm(rs), rh = scale(rs, 1 / r), th = unit(cross(hdir, rh)), rp = Math.min(rpT, r), ra = Math.max(raT, r), a = 0.5 * (rp + ra);
      const vt = Math.sqrt(E.MU_M * 2 * rp * ra / (rp + ra)) / r, vr2 = E.MU_M * (2 / r - 1 / a) - vt * vt;
      return add(scale(th, vt), scale(rh, Math.sqrt(Math.max(0, vr2)) * Math.sign(dot(rs, vs) || 1)));
    };
    const gap = (Pp) => { const [rs, vs] = Pp.s.seleno(); return sub(vReq(rs, vs), vs); };
    let best = Infinity;
    return {
      ctrl: (Pp) => { const dv = gap(Pp), amax = stg.T / veh.mass(); return [Math.min(1.0, Math.max(stg.thr_min, norm(dv) / (amax * 2.0))), unit(dv)]; },
      stop: (Pp) => { const g = norm(gap(Pp)); if (g < LOI_TRIM.DV_STOP || (best < 0.002 && g > best + 1e-4)) return true; best = Math.min(best, g); return false; } };
  }
  // LOI-2: LOI-1'den 0,3–0,8 tur sonraki en yakın noktada (yayınımla bulunur; planda yarım tur) hız doğrultusunda anlık Δv Gauss–Newton ile çözülür: sonraki turda
  // gerçek yükseklik 24 örnekte hedefe en yakın olsun (en küçük kareler). Yakış o noktada ortalanır. Pencere tam tur değil: GRAIL alanında maskonlar yarıçapı tur
  // boyunca dalgalandırır, en alçak nokta bir sonraki tura kayıp Ay yörüngesini bir tur kısaltabilirdi (en küçük kareler yakış yerine duyarsız).
  *loi2(hdir, rT, Tp) {
    const P = this.P, sNow = P.s.copy();
    let tMin = null;
    { const Q = this.prop(sNow.copy(), E.dummyVehicle(), 30.0), t1 = sNow.t + 0.8 * Tp; let lo = Infinity;
      while (Q.s.t < t1 - 1e-9) { Q.step(Math.min(30.0, t1 - Q.s.t)); const r = norm(Q.s.seleno()[0]); if (Q.s.t > sNow.t + 0.3 * Tp && r < lo) { lo = r; tMin = Q.s.t; } } }
    // yalnız hız doğrultusunda (en yakın noktada radyal hız ~0): araç zaten hıza ters hizalı süzüldüğünden yakış için dönmez
    const s2 = this.coastCopy(sNow, tMin), [rs2, vs2] = s2.seleno(), vh = unit(vs2);
    const resid = (x) => {
      const s0 = s2.copy(); s0.v = add(s0.v, scale(vh, x));
      const Q = this.prop(s0, E.dummyVehicle(), 30.0), out = [];
      for (let k = 1; k <= 24; k++) { Q.runUntil(s2.t + k * Tp / 24); out.push(norm(Q.s.seleno()[0]) - rT); }
      return out;
    };
    let x = 0;
    for (let it = 0; it < 5; it++) {                    // tek bilinmeyenli Gauss–Newton (en küçük kareler)
      const F = resid(x), hh = 1e-6, Fj = resid(x + hh), J = Fj.map((f, i) => (f - F[i]) / hh), jj = dot2(J, J);
      if (!(jj > 0)) break;
      const d = -dot2(J, F) / jj; x += d;
      if (Math.abs(d) < 2e-7) break;
    }
    const dv = scale(vh, x), dvm = norm(dv);
    const lo1 = norm(rs2) - E.R_M;
    if (dvm < 1e-7) { this.log(`LOI-2 gerekmedi: yörünge hedeften en çok ${LOI_TRIM.TOL} km sapıyor`, 'LOI-2_SKIP'); return; }
    const tb = burnTime(this.veh, dvm), sg = Math.sign(x), u = (Pp) => scale(this.prograde(Pp), sg);         // hız doğrultusunu izler (sabit eylemsiz yön ATT_LEAD s'de yörüngeyle ~9° kayardı)
    this.tNext = tMin - tb / 2;
    yield* this.approach(tMin - tb / 2, u);
    P.phase = 'LOI-2'; P.hMaxBurn = 0.05;
    this.log(`LOI-2 ateşleme: Δv=${(dvm * 1000).toFixed(2)} m/s (en yakın nokta ${lo1.toFixed(1)} km → ${this.hLlo.toFixed(1)} km dairesel)`, 'LOI-2', { dvm: dvm * 1000 });
    yield* this.until(P.s.t + tb, (Pp) => [1.0, u(Pp)]);
    this.attMode = null;
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
    const tMinDoi = (this.tLlo ?? P.s.t) + (this.nLlo - 0.5) * Tp, doiAng = Math.PI + PDI_ANGLE;          // LLO başlangıcından (LOI-1 sonu; LOI-2 araya girse de)
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

  // ---------------------------------------------------------------- iniş seyrüseferi (landnav.js): güdüm kestirimi kullanır, temas ve yüzey denetimi gerçeği
  navStart() {
    if (!this.navOpt) return;
    const P = this.P, [rs, vs] = P.s.seleno();
    this.nav = new LandNav(this.navOpt); this.nav.init(P.s.t, rs, vs, this.localState(P.s.t, rs, vs).Rf); this.navFlush();
  }
  // her güdüm çağrısında: hata durumunu IMU ile şimdiye ilerlet (son adımda uygulanan gerçek itki ivmesi), sırası gelen ölçümleri işle
  navTick() {
    const N = this.nav; if (!N) return;
    const P = this.P, t = P.s.t, [rs, vs] = P.s.seleno(), st = this.veh.active;
    const aThr = P.lastThr > 0 && P.lastU ? scale(unit(P.lastU), (P.lastThr * st.T) / this.veh.mass()) : [0, 0, 0];
    N.propagate(t, aThr, rs, E.MU_M);
    if (t >= N.tMeas + NAV.DT - 1e-9) { const L = this.localState(t, rs, vs); N.measure(t, { Rf: L.Rf, h: L.p[2] * 1000, vrel: sub(vs, cross(E.omegaMoon(t), rs)) }); this.navFlush(); }
  }
  navFlush() { for (const e of this.nav.ev) this.log(e.msg, e.key); this.nav.ev = []; }
  // Çağrılar (L7, Apollo 11 iniş dökümündeki gibi: "100 feet, 3 1/2 down, 9 forward", "Five percent. Quantity light", "60 seconds", "Picking up some dust" [ALSJ]):
  // evre geçişi, irtifa/hız çağrıları (kestirim: mürettebatın gördüğü değerler), düşük yakıt (%5) ve askıda kalma yakıtının 60/30 s'ye inmesi, toz kalkışı.
  callouts() {
    const P = this.P, c = this.calls || (this.calls = { h: [...CALL_ALT], phase: P.phase, low: false, hov: [60, 30], dust: false });
    const L = this.localNav(), h = L.p[2] * 1000, vz = L.v[2] * 1000, vh = Math.hypot(L.v[0], L.v[1]) * 1000;
    if (P.phase !== c.phase) {
      if (P.phase === 'YAKLASMA') this.log(`Yaklaşma evresi: irtifa ${h.toFixed(0)} m, iniş yerine ${(Math.hypot(L.p[0], L.p[1])).toFixed(2)} km, alçalış ${(-vz).toFixed(1)} m/s`, 'PHASE');
      else if (P.phase === 'SON_INIS' && !this.events.some((e) => e.key === 'GATE')) this.log(`Son iniş evresi: irtifa ${h.toFixed(0)} m, alçalış ${(-vz).toFixed(1)} m/s, yatay ${vh.toFixed(1)} m/s`, 'PHASE');
      c.phase = P.phase;
    }
    while (c.h.length && h <= c.h[0]) { const H = c.h.shift(); this.log(`${H} m: alçalış ${(-vz).toFixed(1)} m/s, yatay ${vh.toFixed(1)} m/s`, 'CALL'); }
    const st = this.veh.active, [rs] = P.s.seleno(), g = (E.MU_M / norm(rs) ** 2) * 1000, mdotH = (this.veh.mass() * g) / (st.isp * E.G0 * 1000), tHov = st.prop / mdotH;
    if (!c.low && st.prop <= CALL_LOW * (st.prop0 || st.prop)) { c.low = true; this.log(`Düşük yakıt: %${(CALL_LOW * 100).toFixed(0)} kaldı (${st.prop.toFixed(0)} kg, askıda ~${tHov.toFixed(0)} s)`, 'LOW_FUEL'); }
    while (c.hov.length && tHov <= c.hov[0]) { const H = c.hov.shift(); this.log(`Yakıt: askıda kalmaya ${H} s`, 'FUEL'); }
    const Tn = P.lastThr * st.T * 1000, he = (norm(rs) - R_SITE) * 1000 + TOUCH.EXIT;
    if (!c.dust && Tn > 0 && he < dustOnset(Tn)) { c.dust = true; this.log(`Toz kalkıyor: motor çıkışı yüzeyden ${he.toFixed(0)} m yukarıda (itki ${(Tn / 1000).toFixed(1)} kN)`, 'DUST'); }
  }
  navSel() { const [rs, vs] = this.P.s.seleno(); return this.nav ? this.nav.estimate(rs, vs) : [rs, vs]; }            // güdümün bildiği Ay merkezli durum
  localNav(t = this.P.s.t) { const [rs, vs] = this.navSel(); return this.localState(t, rs, vs); }                 // güdümün bildiği yerel durum (iniş yerine göre)

  *descent() {
    const P = this.P, stg = this.veh.active;
    const [, vs0] = P.s.seleno(), s0 = siteIcrf(P.s.t), up0 = unit(s0);
    this.drAxis = unit(sub(vs0, scale(up0, dot(vs0, up0))));
    const st = { phase: 'BRAKE', tph: P.s.t }, jn = new Join();
    if (!this.nav) this.navStart();
    P.phase = 'PDI'; P.hMaxBurn = 0.2;
    this.log(`PDI ateşleme (irtifa ${(norm(P.s.seleno()[0]) - R_SITE).toFixed(2)} km)`, 'PDI');
    const gHi = [GATE_HI.x, 0, GATE_HI.z], vHi = [GATE_HI.vx, 0, GATE_HI.vz], gLo = [GATE_LO.x, 0, GATE_LO.z], vLo = [GATE_LO.vx, 0, GATE_LO.vz];
    const zem = (p, v, g, pf, vf, tgo) => [0, 1, 2].map((k) =>
      (6 * (pf[k] - (p[k] + v[k] * tgo + 0.5 * g[k] * tgo * tgo))) / (tgo * tgo) - (2 * (vf[k] - (v[k] + g[k] * tgo))) / tgo);
    const ctrl = (Pp) => {
      this.navTick(); this.callouts(); const { p, v, g, Rf } = this.localNav(Pp.s.t); const t = Pp.s.t; let a;
      if (st.phase === 'BRAKE') {
        const tgo = Math.max(TF_BRAKE - (t - st.tph), 3.0); a = zem(p, v, g, gHi, vHi, tgo);
        if (t - st.tph >= TF_BRAKE) { st.phase = 'APPROACH'; st.tph = t; Pp.phase = 'YAKLASMA'; st.sw = CMD.HANDOVER_FAST; }
      } else if (st.phase === 'APPROACH') {
        const tgo = Math.max(TF_APPROACH - (t - st.tph), 2.0); a = zem(p, v, g, gLo, vLo, tgo);
        if (p[2] <= GATE_LO.z + 0.0005 || t - st.tph >= TF_APPROACH) { st.phase = 'TERMINAL'; st.tph = t; Pp.phase = 'SON_INIS'; st.sw = CMD.HANDOVER_FAST; }
      } else {
        const atT = terminalAccel(p, v, g, (stg.thr_min * stg.T) / this.veh.mass()), T = this.veh.mass() * norm(atT);
        if (st.sw) { jn.start(t, st.sw); st.sw = 0; }                        // yaklaşma → son iniş yasası: komut CMD.HANDOVER_FAST s'de yumuşak adımla (dengeli güdümdeki gibi)
        return jn.apply(t, Math.min(1.0, Math.max(stg.thr_min, T / stg.T)), mtv(Rf, unit(atT)), stg.thr_min);
      }
      const at = sub(a, g);
      if (st.phase !== 'BRAKE') limitTilt(at, TILT_MAX_LOW, (stg.thr_min * stg.T) / this.veh.mass());          // yaklaşma (ve son iniş yasasına geçiş adımı)
      const T = this.veh.mass() * norm(at);
      if (st.sw && st.phase === 'APPROACH') { jn.start(t, st.sw); st.sw = 0; }          // frenleme → yaklaşma: hedef ve eğim sınırı değişir (eskiden komut ~16° sıçrıyordu)
      return jn.apply(t, Math.min(1.0, Math.max(stg.thr_min, T / stg.T)), mtv(Rf, unit(at)), stg.thr_min);
    };
    this.tNext = null;
    yield* this.finalContact(ctrl);
  }

  // Optimal iniş: PDI'da yakıt-optimal plan (pdg.js: kayıpsız dışbükeyleştirme + SOCP), planı uygula, her OPT.REPLAN s'de (son dakikada 4 s) sıcak başlangıçlı yeniden çöz;
  // plan, iniş yerinin GATE_H irtifalı kapısına biter, ardından eski ZEM güdümündeki son iniş yasası temas edene dek sürer. Plan Ay merkezli eylemsiz çerçevede (ICRF eksenleri), SI birimlerindedir.
  // Çözüm bulunamazsa ZEM/ZEV güdümüne dönülür. Kumanda: düğümlerdeki ivme vektörü u → itki = m·|u| (gerçek kütleyle), tam itkıya ve en küçük kısmaya kırpılır.
  // Dengeli güdümde itki vektörü sürekli tutulur (görüntü ve aktüatörler için; fizik aynı): düğümler arası doğrusal ara değer (FOH), yeni planın ilk düğümü önceki komuttan kesintisiz bağlanır (JOIN),
  // plandan son iniş yasasına geçişte CMD.HANDOVER saniyelik yumuşak adım.
  *descentOptimal() {
    const P = this.P, stg = this.veh.active, O = { ...OPT_DESCENT, ...OPT_DESCENT.PRESETS[this.landing] }, MU = E.MU_M * 1e9, G0m = E.G0 * 1e3;
    O.VD_GATE = 1.0 + 0.07 * O.GATE_H;
    const smooth = !!O.CONE;                                                  // yumuşak itki yönü (FOH, kesintisiz plan geçişi): yalnız işaretleme koni çizelgeli (dengeli) güdümde; son iniş yasasına devir (CMD.HANDOVER) tüm güdümlerde yumuşak
    const gfun = (r) => { const n = Math.hypot(r[0], r[1], r[2]), k = -MU / (n * n * n); return [r[0] * k, r[1] * k, r[2] * k]; };
    const mk = (t0) => {
      const [rs, vs] = this.navSel(), m = this.veh.mass();
      return { r0: scale(rs, 1000), v0: scale(vs, 1000), m0: m, mDry: m - stg.prop + O.RESERVE, rho1: stg.thr_min * stg.T * 1000, rho2: O.THR_MARGIN * stg.T * 1000, alpha: 1 / (stg.isp * G0m),
        gfun, surfaceR: R_SITE * 1000, floorMargin: 0, soft: O.SOFT,
        point: O.CONE ? { sched: O.CONE.map(([tgo, deg]) => [tgo, Math.cos(deg * Math.PI / 180)]) } : O.POINT_DEG ? { cosTheta: Math.cos(O.POINT_DEG * Math.PI / 180), tail: O.POINT_TAIL } : undefined,
        point2: !O.CONE && O.END_DEG ? { cosTheta: Math.cos(O.END_DEG * Math.PI / 180), tail: O.END_TAIL } : undefined,
        funnel: { vd0: O.VD_GATE, kd: O.KD, vh0: O.VH0, kh: O.KH, tail: O.FUNNEL_TAIL },
        target: (tf) => { const tl = t0 + tf, sU = siteIcrf(tl), up = unit(sU), rf = add(scale(sU, 1000), scale(up, O.GATE_H)), vsite = cross(E.omegaMoon(tl), rf);
          return { rf, vf: sub(vsite, scale(up, O.VD_GATE)), up, vsite }; } };
    };
    const [, vs0] = P.s.seleno(), s0 = siteIcrf(P.s.t), up0 = unit(s0);
    this.navStart();
    this.status = 'İniş yörüngesi hesaplanıyor…'; yield 'COMPUTE';
    const t0 = P.s.t, R = solvePDG(mk(t0), { Nfinal: O.N });
    this.status = '';
    if (!R.ok) { this.log(`Optimal iniş planı bulunamadı (${R.why}): ZEM/ZEV güdümü`, 'PLAN_FAIL'); yield* this.descent(); return; }
    this.drAxis = unit(sub(vs0, scale(up0, dot(vs0, up0))));
    let plan = { t0, sol: R.sol };
    const info = this.descentInfo = { tf: R.tf, fuel: R.fuel, calls: R.calls, planMs: R.ms, replans: 0, fails: 0, replanMs: 0, violMax: R.sol.violMax ?? 0, gateT: null, plan };
    P.phase = 'PDI'; P.hMaxBurn = 0.2;
    this.log(`PDI ateşleme (irtifa ${(norm(P.s.seleno()[0]) - R_SITE).toFixed(2)} km)`, 'PDI');
    this.log(`Optimal iniş planı (SOCP): ${R.tf.toFixed(0)} s, ~${R.fuel.toFixed(0)} kg yakıt (Δv ${(stg.isp * G0m * Math.log(this.veh.mass() / R.sol.m[R.sol.N])).toFixed(0)} m/s), ${R.calls} çözüm / ${R.ms} ms`, 'PLAN', { fuel: R.fuel, tf: R.tf });
    const alt = () => norm(this.navSel()[0]) - R_SITE, altTrue = () => norm(P.s.seleno()[0]) - R_SITE;          // km: güdümün bildiği / gerçek irtifa
    const st = { mode: 'PDG', fails: 0 };
    const clampThr = (T) => Math.min(1.0, Math.max(stg.thr_min, T / stg.T));
    let lastU = null;                                                         // en son uygulanan itki ivmesi vektörü (m/s²): yeni plana kesintisiz geçiş için
    const jn = new Join();                                                    // plandan son iniş yasasına geçişte yumuşak adım
    const ctrl = (Pp) => {
      this.navTick(); this.callouts();
      if (st.mode === 'PDG') {
        const t = Pp.s.t - plan.t0, c = (smooth && CMD.FOH ? controlAtSmooth : controlAt)(plan.sol, t, plan.join ? 1 : 0); let u = c.u;
        // yeni planın ilk düğümü önceki planın izlediği değeri düzeltir ve sıçrayabilir (bir düğüm süresince, ~15°); ilk aralıkta komut, önceki komuttan ikinci düğüme doğrusal geçer, ikinci aralığın ilk yarısında düğüm 1'de kalır (ilk düğüm hiç karışmaz)
        if (plan.join && c.k === 0 && plan.sol.N > 1) u = blendVec(plan.join, plan.sol.u[1], Math.min(1, Math.max(0, t / plan.sol.dt)));
        lastU = u;
        const an = norm(u), a = alt();
        Pp.phase = a > 3.0 ? 'PDI' : 'YAKLASMA';
        const o = [clampThr((this.veh.mass() * an) / 1000), unit(u)];         // kg·m/s² = N → kN
        // serbest güdüm (ZOH, işaretleme sınırı yok): en küçük gazda planın itki yönü düğümden düğüme ~40° dönebilir (itki istenenden fazla, yön önemsizleşir);
        // en küçük gazdayken komut yönü CMD.MINTHR_RATE °/s ile sınırlanır (dönme zaten ≤ 15°/s; gazın üstünde plan aynen uygulanır)
        if (!smooth && st.dPrev && o[0] <= stg.thr_min + 1e-9) { const th = vAngle(st.dPrev, o[1]), mx = CMD.MINTHR_RATE * Math.PI / 180 * Math.max(0, Pp.s.t - st.tPrev); if (th > mx) o[1] = unit(blendVec(st.dPrev, o[1], mx / th)); }
        st.dPrev = o[1]; st.tPrev = Pp.s.t;
        jn.last = scale(o[1], o[0]); return o;
      }
      const { p, v, g, Rf } = this.localNav(Pp.s.t), at = terminalAccel(p, v, g, (stg.thr_min * stg.T) / this.veh.mass());
      if (st.sw) { jn.start(Pp.s.t, st.sw); st.sw = 0; }
      return jn.apply(Pp.s.t, clampThr(this.veh.mass() * norm(at)), mtv(Rf, unit(at)), stg.thr_min);
    };
    const surface = () => altTrue() <= 0.0, gate = () => alt() <= O.GATE_H / 1000 + 0.002;
    this.tNext = null;
    for (;;) {
      if (st.mode === 'PDG') {
        const tEnd = plan.t0 + plan.sol.tf, tgo = tEnd - P.s.t;
        if (tgo <= 0.5 || gate()) {
          st.mode = 'TERMINAL'; st.sw = smooth ? CMD.HANDOVER : 0; P.phase = 'SON_INIS'; info.gateT = P.s.t;
          const { v } = this.localNav();
          this.log(`Son iniş kapısı: irtifa ${(alt() * 1000).toFixed(0)} m, dikey hız ${(v[2] * 1000).toFixed(1)} m/s, yatay ${(Math.hypot(v[0], v[1]) * 1000).toFixed(1)} m/s`, 'GATE');
          continue;
        }
        const hit = yield* this.until(Math.min(P.s.t + (tgo > 60 ? O.REPLAN : 4), tEnd), ctrl, (Pp) => surface() || gate());
        if (hit && surface()) { this.touchdown(); return; }
        if (hit || P.s.t >= tEnd - 1e-9) continue;
        const left = tEnd - P.s.t;
        if (left > 8) {
          let q = replanPDG(mk(P.s.t), plan, P.s.t, { N: Math.max(10, Math.min(O.N, Math.round(left / 0.6))), reg: O.REG });
          if (!q.ok && st.fails >= 1) q = solvePDG(mk(P.s.t), { Nfinal: O.N, tfGuess: Math.max(left, 20), tfSpan: 0.6 });   // art arda ikinci başarısızlık (elle uçuş, büyük bozulma): sıfırdan çöz
          if (q.ok) { plan = info.plan = { t0: P.s.t, sol: q.sol, join: smooth && CMD.JOIN ? lastU : null }; st.fails = 0; info.replans++; info.replanMs += q.ms; info.violMax = Math.max(info.violMax, q.sol.violMax ?? 0); }
          else {
            info.fails++; st.fails++;
            if (st.fails >= 4) { st.mode = 'TERMINAL'; st.sw = smooth ? CMD.HANDOVER : 0; P.phase = 'SON_INIS'; this.log('Optimal iniş planı sürdürülemedi: son iniş yasasına geçildi', 'PLAN_FAIL'); }
          }
        }
      } else { yield* this.finalContact(ctrl); return; }
    }
  }

  // ---------------------------------------------------------------- temas ve yüzey evresi (touchdown.js; NASA TN D-6850, ALSJ Apollo 11)
  // en alçaktaki ayağın yüzeyden yüksekliği (m): fiziksel nokta ayak düzleminin merkezidir (sahne: model ayak tabanı); gövde θ yatıksa bir ayak R_PAD·sinθ daha alçaktadır
  padAlt() {
    const [rs] = this.P.s.seleno(), up = unit(rs), ax = this.P.att ? this.P.att.axis() : up;
    return (norm(rs) - R_SITE) * 1000 - TOUCH.R_PAD * Math.sqrt(Math.max(0, 1 - dot(ax, up) ** 2));
  }
  // temas ışığı: ayakların altından sarkan 1,70 m'lik sondalardan biri yüzeye değdi
  contactLight() {
    if (this.contact) return;
    const { v } = this.localState();
    this.contact = { t: this.P.s.t, tStop: null };
    this.log(`Temas ışığı: sonda yüzeye değdi (ayaklar ~${TOUCH.PROBE.toFixed(2)} m yukarıda), dikey hız ${(v[2] * 1000).toFixed(2)} m/s`, 'CONTACT');
  }
  // Son metreler (sonda kipi, TN D-6850): güdüm sonda temasına dek sürer → temas ışığı → TOUCH.REACT s sonra motor kesme (itki TOUCH.DECAY s'de söner) →
  // araç ayaklarına düşer (yönelim kesmedeki eksende tutulur). Temas fiziği touchdown()'da: yönelim fizikten gelir (dikeye ışınlanmaz).
  *finalContact(ctrl) {
    const P = this.P, pads = () => this.padAlt() <= 0;
    if (!this.contact) {
      yield* this.until(P.s.t + 1500, ctrl, () => this.padAlt() <= TOUCH.PROBE);
      if (!pads()) this.contactLight();
    }
    const h0 = [P.hMaxBurn, P.hMaxCoast]; P.hMaxBurn = Math.min(P.hMaxBurn, 0.02); P.hMaxCoast = Math.min(P.hMaxCoast, 0.02);          // temas anı ~2 cm içinde
    if (!pads()) yield* this.until(this.contact.t + TOUCH.REACT, ctrl, pads);
    if (!pads()) {
      const tc = P.s.t, thr0 = P.lastThr, hold = P.att ? P.att.axis() : unit(siteIcrf(tc));
      this.contact.tStop = tc;
      this.log(`Motor durduruldu: temas ışığından ${(tc - this.contact.t).toFixed(1)} s sonra (itki ${TOUCH.DECAY.toFixed(1)} s'de söner), araç ${this.padAlt().toFixed(2)} m'den ayaklarına düşüyor`, 'ENGINE_STOP');
      const decay = (Pp) => { const f = (Pp.s.t - tc) / TOUCH.DECAY; return [f < 1 ? thr0 * (1 - f) : 0, hold]; };
      yield* this.until(P.s.t + 120, decay, pads);
    }
    [P.hMaxBurn, P.hMaxCoast] = h0;
    this.touchdown();
  }

  // Temas: yüzeye göre hız, yönelim ve açısal hız fizikten; başarı = hız zarfı (10-7-4) + devrilmeme (enerji) + eğim ≤ 12°. Temas yönelimi ya da açısal hız
  // 3σ zarfını (6°, 6°/s, sapma 1,5°/s) aşarsa iniş 'sınırda' sayılır (uyarı). Sonra yüzey evresi: araç dönen Ay'a bağlanır, saat işlemeye devam eder (surfaceAdvance).
  touchdown(manual = false) {
    const P = this.P, t = P.s.t, { p, v, Rf } = this.localState(), D2R = Math.PI / 180;
    P.phase = 'INDI';
    const vh = Math.hypot(v[0], v[1]) * 1000, vz = v[2] * 1000;
    const q = P.att ? P.att.q.slice() : null, wB = P.att && P.att.dynamic && P.att.w ? P.att.w : [0, 0, 0];
    const axis = q ? mv(Rf, qRot(q, Z_AXIS)) : [0, 0, 1], xb = q ? mv(Rf, qRot(q, [1, 0, 0])) : [1, 0, 0], wL = q ? mv(Rf, qRot(q, wB)) : [0, 0, 0];
    const tilt = tiltDeg(axis), rate = Math.hypot(wB[0], wB[1]) / D2R, yawRate = Math.abs(wB[2]) / D2R;
    const mp = massProps(this.veh.stages, this.veh.k), [rs] = P.s.seleno(), g = (E.MU_M / norm(rs) ** 2) * 1000;
    const slope = this.siteSlope || null, slopeDeg = slope ? slope.deg : 0;
    const tip = tipOver({ axis, xb, v: scale(v, 1000), w: wL, m: mp.m, It: mp.I[0], h: mp.zCg - Z_FEET, g, slope });
    const env = velEnvelope(vz, vh), attOk = tilt <= TOUCH.TILT, rateOk = rate <= TOUCH.RATE && yawRate <= TOUCH.YAW_RATE, slopeOk = slopeDeg <= TOUCH.SLOPE;
    const ok = env.ok && tip.stable && slopeOk;
    const why = [];
    if (!env.ok) why.push(`hız zarfı aşıldı (dikey sınır ${env.vzMax.toFixed(2)} m/s, yatay ${TOUCH.VH.toFixed(2)} m/s)`);
    if (!tip.stable) why.push(`araç devrildi (yön ${tip.dirDeg}°)`);
    if (!slopeOk) why.push(`eğim ${slopeDeg.toFixed(1)}° > ${TOUCH.SLOPE.toFixed(0)}°`);
    if (ok && !attOk) why.push(`temas yönelimi ${tilt.toFixed(1)}° > ${TOUCH.TILT.toFixed(0)}°`);
    if (ok && !rateOk) why.push(`temas açısal hızı ${rate.toFixed(1)}°/s (sapma ${yawRate.toFixed(1)}°/s)`);
    this.result = { t, utc: E.utcString(t), posErr_m: [p[0] * 1000, p[1] * 1000], v_mps: [v[0] * 1000, v[1] * 1000, vz], prop: this.veh.active.prop, ok, manual,
      grade: !ok ? 'fail' : attOk && rateOk ? 'ok' : 'marginal', tilt_deg: tilt, rate_dps: rate, yawRate_dps: yawRate, slope_deg: slopeDeg,
      env: { vel: env.ok, vzMax: env.vzMax, att: attOk, rate: rateOk, slope: slopeOk }, tip: { margin: tip.margin, dirDeg: tip.dirDeg, stable: tip.stable, phiDeg: tip.phiDeg },
      tContact: this.contact ? this.contact.t : null, tStop: this.contact ? this.contact.tStop : null, why };
    P.lastThr = 0;
    // yüzey evresi: ayak düzlemi yüzeye (R_SITE) oturur, Ay'a bağlı konum; yönelim TOUCH.SETTLE s'de zemin normaline oturur (sapma korunur)
    const M0 = E.moonIcrfToMe(t), up = unit(rs), rPin = scale(up, R_SITE), nI = mtv(Rf, surfaceNormal(slope));
    let qSet = q;
    if (q) { const a = qRot(q, Z_AXIS), th = vAngle(a, nI); qSet = th > 1e-12 ? qNormalize(qMul(qSwing(a, nI, q, th), q)) : q; }
    const t0 = this.contact ? this.contact.t : t;
    this.surf = { t0: t, M0, rMe: mv(M0, rPin), q0: q, q1: qSet, restTilt: q ? vAngle(qRot(qSet, Z_AXIS), up) / D2R : 0,
      ev: POST_LANDING.map((e) => ({ ...e, t: Math.max(t + 0.05, t0 + e.dt) })), i: 0 };
    if (this.pushHist) this.pushHist();                                      // temas anındaki durum (çarpma hızıyla); ilk yüzey adımından sonra araç yüzeye bağlanır
    const tipTxt = tip.margin > 100 ? 'devrilme payı > 100×' : `devrilme payı ${tip.margin.toFixed(1)}×`;
    this.log(`${ok ? 'TEMAS' : 'ÇARPMA'}${manual ? ' (elle)' : ''}: konum hatası ${(Math.hypot(p[0], p[1]) * 1000).toFixed(1)} m, dikey hız ${vz.toFixed(2)} m/s, yatay ${vh.toFixed(2)} m/s, kalan yakıt ${this.veh.active.prop.toFixed(0)} kg`, 'INDI');
    this.log(`Temas zarfı: eğim ${tilt.toFixed(1)}°, açısal hız ${rate.toFixed(1)}°/s, ${tipTxt}${why.length ? ' — ' + why.join('; ') : ''}`, 'TOUCH_ENV');
    this.done = true;
  }
  // yüzeyde: t anında Ay'a bağlı konum/hız ve yönelim (oturma geçişi + Ay'ın dönmesi)
  pinSurface(t) {
    const S = this.surf, P = this.P, M = E.moonIcrfToMe(t), rs = mtv(M, S.rMe), vs = cross(E.omegaMoon(t), rs);
    P.s.t = t;
    if (P.s.central === 'M') { P.s.r = rs; P.s.v = vs; } else { P.s.r = add(rs, E.moonPos(t)); P.s.v = add(vs, E.moonVel(t)); }
    if (P.att && S.q0) {
      const f = Math.min(1, Math.max(0, (t - S.t0) / TOUCH.SETTLE)), qb = qSlerp(S.q0, S.q1, f * f * (3 - 2 * f));
      const Rm = [0, 1, 2].map((i) => [0, 1, 2].map((j) => M[0][i] * S.M0[0][j] + M[1][i] * S.M0[1][j] + M[2][i] * S.M0[2][j]));      // ICRF(t0) → ICRF(t): Ay'a bağlı dönme
      const q = qNormalize(qMul(qFromMat(Rm), qb));
      if (P.att.dynamic) { P.att.set(q, [0, 0, 0]); P.att.tq = [0, 0, 0]; P.att.tqRcs = [0, 0, 0]; P.att.tqTvc = [0, 0, 0]; P.att.duty = [0, 0, 0]; P.att.err = 0; P.att.mode = 'hold'; }
      else P.att.set(q);
    }
    P.lastThr = 0; P.lastU = [0, 0, 0];
  }
  // temas sonrası saat: araç Ay yüzeyinde durur, olay çizelgesi (motor emniyeti, duruş raporu, tank tahliyesi, kalış kararı) zamanı gelince günlüğe düşer
  surfaceAdvance(tTarget) {
    const S = this.surf, P = this.P; if (!S) return;
    while (P.s.t < tTarget - 1e-9) {
      const nx = S.i < S.ev.length ? S.ev[S.i].t : Infinity, dt = P.s.t - S.t0 < TOUCH.SETTLE + 0.5 ? 0.1 : 10;
      const t = Math.min(tTarget, nx, P.s.t + dt);
      this.pinSurface(t);
      while (S.i < S.ev.length && S.ev[S.i].t <= t + 1e-9) {
        const e = S.ev[S.i++], R = this.result;
        if (e.key === 'TILT') this.log(`Yüzeyde duruş: araç dikeyden ${S.restTilt.toFixed(1)}° eğik (temasta ${R.tilt_deg.toFixed(1)}°, zemin eğimi ${R.slope_deg.toFixed(1)}°), ${R.ok ? 'kalkış için uygun' : 'araç hasarlı'}`, 'TILT');
        else this.log(e.msg, e.key);
      }
      if (this.pushHist) this.pushHist();
    }
  }

  // ---------------------------------------------------------------- canlı sürüş (worker çağırır)
  // Sabit fizik: otopilotta fizik adımları ekran saatinden bağımsızdır (hızlı hesapla birebir aynı sonuç);
  // fizik ekranın biraz önünde koşar, ekran iki fizik durumu arasında Hermite ile ara değer alır.
  attachHistory() {
    this.hist = [];
    const push = () => {
      const P = this.P, [g, gv] = P.s.geo();
      this.hist.push({ t: P.s.t, r: g, v: gv, m: this.veh.mass(), prop: this.veh.active.prop, k: this.veh.k,
                       thr: P.lastThr, u: P.lastU, q: P.att ? P.att.q.slice() : null, w: P.att && P.att.dynamic ? P.att.w.slice() : null, att: P.att && P.att.dynamic ? P.att.diag() : null,
                       rcsUsed: this.veh.active.rcsUsed || 0, phase: P.phase, dv: P.dvUsed });
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
             thr: b.thr, u: b.u, q: a.q && b.q ? qSlerp(a.q, b.q, s) : b.q, w: a.w && b.w ? [0, 1, 2].map((i) => a.w[i] + (b.w[i] - a.w[i]) * s) : b.w, att: b.att, rcsUsed: b.rcsUsed,
             phase: b.phase, dv: a.dv + (b.dv - a.dv) * s };
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
    if (this.P.att && x.q) this.P.att.set(x.q, x.w);
    if (x.rcsUsed != null && this.veh.k === x.k) { const st = this.veh.active; st.rcsUsed = x.rcsUsed; st.dry = (st.dry0 != null ? st.dry0 : st.dry) - x.rcsUsed; }
    this.hist = this.hist.filter((e) => e.t <= td); this.pushHist();
  }

  // tTarget'e kadar ilerle; bütçe (ms) aşılırsa bırak. Döner: 'COMPUTE' | 'DONE' | null
  advance(tTarget, budgetMs, manualCtrl = null, now = () => Date.now()) {
    const P = this.P, t0 = now();
    if (this.done) { if (this.surf) this.surfaceAdvance(tTarget); return 'DONE'; }
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
    if (!on) { this.rewindTo(td); this.auto = false; this.P.attFast = true; this.log('Otopilot kapatıldı — elle kontrol', 'AUTO_OFF'); }
    else { this.auto = true; this.P.attFast = false; this.log('Otopilot yeniden devrede (rota düzeltmeleri o anki durumdan hedefler)', 'AUTO_ON'); }
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
      if (this.padAlt() <= 0) { this.touchdown(manual); return true; }
      if (manual && !this.contact && this.padAlt() <= TOUCH.PROBE) this.contactLight();
    } else if (norm(P.s.geo()[0]) < E.R_E + 80) {
      this.log('Dünya atmosferine girdi — görev sona erdi', 'REENTRY'); this.done = true; this.result = { ok: false, reentry: true }; return true;
    }
    return false;
  }
}
