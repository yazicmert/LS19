// TLI kademesi ayrılması (6-DOF): zaman çizelgesi, momentum korunumlu yay itişi, iki cisme ayrılma dönmesi (tip-off), ayrılan kademenin kendi tutum denetimiyle
// kaçınma manevrası (CCAM: 90° dönüş + hidrazin itişi), bertaraf yakışı (ana motorun yeniden ateşlenmesi), kalan LOX/LH2'nin boşaltılması, pasifleştirme ve takla.
// Fizik (mission.js) ve görüntü (worker.js `sep` iletisi → scene.js) aynı çizelgeyi kullanır; τ = t − t_ayrılma (s).
//
// Kaynaklar (RL10 motorlu kriyojenik üst kademeler):
//  [A1] Artemis I (SLS ICPS, 16.11.2022): TLI motor kesme 08:35:10 → Orion/ICPS ayrılması 08:45:20 UTC (≈610 s), 1,0 m/s.
//       ICPS sonra kalan iticiyi boşaltan küçük bir bertaraf yakışıyla "ölü kademe" oldu.
//       J. McDowell, planet4589.org/space/misc/artemis1.txt; W. B. Stein ve ark., AAS 25 (NTRS 20240015515).
//  [AS] W. B. Stein, A. J. Houin, S. B. Thompson, H. M. Koehler, "The Return of the ICPS", AAS/AIAA 2025 (NTRS 20240015515,
//       https://ntrs.nasa.gov/citations/20240015515): ICPS bertaraf yörüngesi Ay yakın geçişinden (LCA) 10 gün sonra C3 ≥ 0,1 km²/s² hedefler.
//  [AV] ULA, Atlas Launch System Mission Planner's Guide, Atlas V Addendum: ayrılma öncesi yönelim hatası ≤ 0,7°,
//       gövde hızları ≤ 0,2/0,2/0,25 °/s; ayrılma sonrası gövde hızları tipik < 0,6 °/s (yunuslama/sapma), < 0,5 °/s (yuvarlanma);
//       bağıl ayrılma hızı en az 0,27 m/s (≤ 4536 kg); Tablo 2.3-2/2.3-3: ayrılma → CCAM yönelimine dönüş +100 s,
//       kademe görev sonu +2125 s; CCAM'i kalan iticilerin boşaltılması (blowdown) izler; Centaur: 4 × 27 N hidrazin itici.
//  [W2] ULA, Atlas V WGS-2 görev özeti: CCAM biter "SV Sep + 370 s"; kademe görevi itici tanklarının boşaltılması ve
//       hidrazin artığının yakılmasıyla biter. CCAM, kademe ayrılan araca yeniden çarpmasın ve onu kirletmesin diye yapılır.
//  [MN] Orbital, Minotaur kullanıcı kılavuzu (CCAM): 90° sapma dönüşü (kalan itki yükten uzağa) + gecikmeli "yengeç yürüyüşü" itişi.
//  [CV] Vulcan Cert-1 (8.1.2024): Centaur V, Peregrine ayrıldıktan ~28 dk sonra bertaraf için yeniden ateşlendi
//       (https://www.space.com/vulcan-rocket-first-launch-private-moon-lander-what-time).
// Kaynakta sayısı olmayan değerler model varsayımıdır: aşağıda "(v)" ile işaretli.
import * as E from './engine.js';
import { qRot, Z_AXIS, D2R } from './attitude.js';
import { Dyn6 } from './attctl.js';
import { massProps, freeRot } from './rigidbody.js';
const { sub, scale, dot, unit, norm } = E;

export const SEP = {
  coast: 610,                       // s, TLI motor kesme → ayrılma [A1] (Atlas V'de MECO2 + 169…225 s [AV][W2])
  dvRel: 0.5,                       // m/s, yayların verdiği bağıl hız: [AV] en az 0,27, [A1] 1,0 → 0,5 (v)
  tipL: [0.30, -0.24, 0.12],        // °/s, ayrılma dönmesi (gövde x, y, z = yuvarlanma): eksen başına eylemsizliği küçük olan gövdenin aldığı hız; [AV] ayrılma sonrası
                                    // sınırları (0,6/0,6/0,5) içinde (v). Yay itişinin kaçık bileşeni iki gövdeye eşit ve zıt açısal darbe verir: ΔL = I_min·tip, Δω = ±ΔL/I
  turn0: 100,                       // s, kademe CCAM yönelimine dönmeye başlar [AV]; 90° dönüş [MN], kademenin kendi denetleyicisiyle (seyir hızı ≤ 1,5°/s)
  ccam0: 200, ccam1: 370,           // s, CCAM itişi: bitiş [W2], başlangıç (v)
  ccamT: 4 * 0.027, ccamIsp: 220,   // kN: 4 × 27 N hidrazin itici [AV]; Isp (v). Hidrazin kuru kütlenin parçasıdır (RCS gibi)
  disp0: 28 * 60,                   // s, bertaraf yakışı: ana motor ayrılmadan ~28 dk sonra yeniden ateşlenir [CV]
  bdWait: 60, bdDur: 150, bdC: 0.10, // s, s, km/s: bertaraf yakışından sonra kalan LOX/LH2 motordan boşaltılır [AV][W2]; bekleme, süre ve yanmasız akışın etkin çıkış hızı (v)
  eom: 2125,                        // s, kademe görev sonu: pasifleştirme tamam, tutum denetimi kapanır [AV] (bertaraf/boşaltma uzarsa onların bitişinden 60 s sonra)
  tumble: [0.30, -0.18, 0.10],      // °/s, görev sonundan sonra denetimsiz kademenin yavaş takla atması (v)
  dvBdMin: 0.05,                    // kg: bundan az kriyojenik artık boşaltılmaz
  comZ: -7.0,                       // görüntü: kademenin kütle merkezi model ekseninde üst ucundan 7 m aşağıda (motor ve itki yapısı arkada) (v)
};

// Ayrılma: bağıl hız yaylardan; momentum korunur (kütlelerle ters orantılı paylaşılır).
// mL / mS: iniş aracı / kademe kütlesi (kg). Döner: hız değişimleri (km/s): iniş aracı +dvL·eksen, kademe −dvS·eksen
export function springSplit(mL, mS, dvRel = SEP.dvRel) {
  const dv = dvRel / 1000;
  return { dvL: dv * mS / (mL + mS), dvS: dv * mL / (mL + mS) };
}
// Ayrılma dönmesi (gövde çerçevesi, rad/s): eşit ve zıt açısal darbe ΔL_i = min(I_L, I_S)_i · tipL_i (köşegen eylemsizlikler); hafif gövde tipL'yi, ağır gövde
// daha azını alır, ikisi de [AV] sınırları içinde kalır. Döner: wL iniş aracının (kalan araç), wS kademenin hız değişimi
export function tipOff(IL, IS) {
  const dL = SEP.tipL.map((x, i) => x * D2R * Math.min(IL[i], IS[i]));
  return { wL: dL.map((x, i) => x / IL[i]), wS: dL.map((x, i) => -x / IS[i]) };
}
// ayrılma eksenine dik, yörünge düzleminde dışa doğru birim vektör (CCAM yönü [MN]: itici gazı yükten uzağa)
export function ccamDir(r, axis) {
  const rh = unit(r), d = sub(rh, scale(axis, dot(rh, axis)));
  return norm(d) > 1e-9 ? unit(d) : unit(E.cross(axis, [0, 0, 1]));
}

// kademenin o anki işi (görüntü ve olay günlüğü için); S: SpentStage (bertaraf ve boşaltma zamanları ondan)
export function stagePhase(tau, S = null) {
  const T = S ? S.tl : timeline(0, 0);
  if (tau < SEP.turn0) return 'HOLD';
  if (tau < SEP.ccam0) return 'TURN';
  if (tau < SEP.ccam1) return 'CCAM';
  if (T.disp && tau < T.disp[0]) return 'WAIT';
  if (T.disp && tau < T.disp[1]) return 'DISPOSAL';
  if (T.bd && tau < T.bd[0]) return 'WAIT2';
  if (T.bd && tau < T.bd[1]) return 'BLOWDOWN';
  if (tau < T.eom) return 'SAFE';
  return 'DEAD';
}
// zaman çizelgesi (τ, s): bertaraf yakışı [başla, bitir] (süre tbD; yoksa null), boşaltma, görev sonu
export function timeline(tbD, cryoAfter) {
  const disp = tbD > 0 ? [SEP.disp0, SEP.disp0 + tbD] : null, b0 = (disp ? disp[1] : SEP.ccam1) + SEP.bdWait;
  const bd = cryoAfter > SEP.dvBdMin ? [b0, b0 + SEP.bdDur] : null;
  return { disp, bd, eom: Math.max(SEP.eom, (bd ? bd[1] : disp ? disp[1] : SEP.ccam1) + 60) };
}

// Ayrılan kademe: kendi yayınımı ve kendi 6-DOF tutum denetimi (Dyn6, kademe tek başına: kendi kütle özellikleri ve RCS'i). İşleri sonlu itkidir:
//  CCAM (hidrazin, Propagator.aux), bertaraf yakışı (ana motor: rampa ve kuyruk itkisiyle, st.eng), boşaltma (yanmasız akış, etkin çıkış hızı bdC).
// Görev sonunda tutum denetimi kapanır, kademe torksuz takla atar (rot: freeRot). Debris kaydı bunu yayınım gibi kullanır (s, nbody, runUntil).
export class SpentStage {
  // state: ayrılma anındaki durum (yay hızı uygulanmış); st: kademe kaydı (kopyalanır; dry hidrazin ve RCS yakıtı dahil, prop kalan LOX/LH2);
  // q, w: ayrılma anındaki yönelim ve açısal hızı (tip-off dahil); axis: ayrılma ekseni; xdir: CCAM yönü; mkProp(state, vehicle) -> Propagator; extra: bilgi
  constructor(state, st, q, w, axis, xdir, mkProp, extra = {}) {
    this.t0 = state.t; this.axis = axis; this.xdir = xdir; this.cryo0 = st.prop;
    this.rec = { ...st, dyn: { ...(st.dyn || {}), role: 'tli' }, T: st.T, isp: st.isp };
    this.T0 = st.T; this.isp0 = st.isp; this.eng0 = st.eng || null;
    this.veh = new E.Vehicle([this.rec]); this.st = this.veh.stages[0]; this.st.prop0 = Math.max(st.prop0 || 0, st.prop, 1e-6);
    this.P = mkProp(state, this.veh); this.P.phase = 'KADEME'; this.mkProp = mkProp;
    this.P.att = new Dyn6(axis); this.P.att.set(q, w); this.P.att.mode = 'dyn';
    this.P.attCmd = () => this.cmdAt(this.P.s.t - this.t0);
    this.burn = null;                          // bertaraf yakışı: { dv (km/s, eylemsiz), u, tb (s) }
    this.tl = timeline(0, this.cryo0);
    this.mode = 'COAST'; this.rot = null; this.events = [];
    this.info = { t0: this.t0, axis, xdir, cryo0: this.cryo0, ...extra };
  }
  get s() { return this.P.s; } set s(v) { this.P.s = v; }
  get nbody() { return this.P.nbody; } set nbody(v) { this.P.nbody = v; }
  mass() { return this.veh.mass(); }
  q() { return this.rot ? this.rot.q : this.P.att ? this.P.att.q : null; }
  // bertaraf yakışını kur: dv (km/s, eylemsiz); süre roket denkleminden (rampa/kuyruk kaybı için tam itki varsayımı; kesme Δv'ye göre)
  setDisposal(dv) {
    const dvm = norm(dv);
    if (!(dvm > 1e-7)) { this.burn = null; this.tl = timeline(0, this.cryo0); return; }
    const c = this.isp0 * E.G0, m0 = this.mass(), mdot = this.T0 / c, tb = Math.min(this.st.prop / mdot, m0 * (1 - Math.exp(-dvm / c)) / mdot) + (this.eng0 ? this.eng0.rampLoss || 0 : 0);
    this.burn = { dv, u: scale(dv, 1 / dvm), dvm, tb, dv0: null };
    this.tl = timeline(tb + 2, Math.max(0, this.st.prop - mdot * tb));
  }
  // yönelim komutu (eylemsiz birim): ayrılma ekseni → CCAM yönü → bertaraf yönü → (boşaltma bertaraf yönünde)
  cmdAt(tau) {
    if (tau < SEP.turn0) return this.axis;
    if (this.burn && tau >= SEP.ccam1) return this.burn.u;
    return this.xdir;
  }
  // t anına kadar yayınla; işlerin sınırlarında adım kesilir
  runUntil(t) {
    const P = this.P;
    while (t - P.s.t > 1e-9) {
      const tau = P.s.t - this.t0, T = this.tl;
      let tB = Infinity, ctl = null;
      const seg = (a, b) => tau >= a - 1e-9 && tau < b - 1e-9;
      if (this.rot) { P.runUntil(t); return; }                       // görev sonundan sonra itkisiz süzülme (yönelim qAt ile)
      if (tau < SEP.ccam0 - 1e-9) { this.setMode('COAST'); tB = SEP.ccam0; }
      else if (seg(SEP.ccam0, SEP.ccam1)) { this.setMode('CCAM'); tB = SEP.ccam1; }
      else if (T.disp && tau < T.disp[0] - 1e-9) { this.setMode('COAST2'); tB = T.disp[0]; }
      else if (T.disp && seg(T.disp[0], T.disp[1])) { this.setMode('DISPOSAL'); tB = T.disp[1]; ctl = this.dispCtl(); }
      else if (T.bd && tau < T.bd[0] - 1e-9) { this.setMode('COAST3'); tB = T.bd[0]; }
      else if (T.bd && seg(T.bd[0], T.bd[1])) { this.setMode('BD'); tB = T.bd[1]; ctl = () => [1, this.cmdAt(P.s.t - this.t0)]; }
      else if (tau < T.eom - 1e-9) { this.setMode('SAFE'); tB = T.eom; }
      else { this.passivate(); continue; }
      P.step(Math.min(t, this.t0 + tB) - P.s.t, ctl);
    }
  }
  // bertaraf yakışı: hedef Δv'ye ulaşınca kes (kuyruk itkisi payıyla); yönelim yakış yönünü izler
  dispCtl() {
    const B = this.burn, P = this.P;
    if (B.dv0 == null) B.dv0 = P.dvUsed;
    const tail = this.eng0 && this.eng0.tailImp ? this.eng0.tailImp * this.T0 / this.mass() : 0;
    return () => (P.dvUsed - B.dv0 + tail < B.dvm && this.st.prop > 0 ? [1, B.u] : null);
  }
  setMode(m) {
    if (m === this.mode) return;
    const st = this.st, P = this.P;
    P.aux = m === 'CCAM' ? { T: SEP.ccamT, isp: SEP.ccamIsp } : null;
    if (m === 'BD') {                                   // yanmasız akış: kalan LOX/LH2 motordan; itki = ṁ·c_etkin
      st.eng = null; st.isp = SEP.bdC / E.G0; st.T = Math.max(1e-6, st.prop * SEP.bdC / SEP.bdDur);
    } else if (m === 'DISPOSAL') { st.T = this.T0; st.isp = this.isp0; st.eng = this.eng0; }
    else if (this.mode === 'BD') { st.T = this.T0; st.isp = this.isp0; }
    this.events.push({ t: P.s.t, mode: m, m: this.mass(), prop: st.prop });
    this.mode = m;
  }
  // görev sonu: tutum denetimi kapanır, kademe torksuz serbest döner (gövde hızlarına takla eklenir)
  passivate() {
    const P = this.P, D = P.att, mp = massProps(this.veh.stages, 0);
    const w = D.w.map((x, i) => x + SEP.tumble[i] * D2R);
    this.rot = { q: D.q.slice(), w, I: mp.I, t: P.s.t };
    P.att = null; P.attCmd = null; P.aux = null; this.setMode('DEAD');
    this.st.T = 0;
  }
  // t anındaki yönelim (görev sonundan sonra serbest dönme)
  qAt(t) {
    const r = this.rot; if (!r) return this.P.att ? this.P.att.q : null;
    if (t > r.t + 1e-9) { const s = freeRot(r.q, r.w, r.I, t - r.t); r.q = s.q; r.w = s.w; r.t = t; }
    return r.q;
  }
  // bertaraf çözümü için kopya: aynı durum, kütle, yönelim ve iş çizelgesi
  clone() {
    const P = this.P, S = Object.create(SpentStage.prototype);
    Object.assign(S, this);
    S.veh = this.veh.clone(); S.veh.stages = this.veh.stages.map((x) => ({ ...x })); S.st = S.veh.stages[0];
    S.P = this.mkProp(P.s.copy(), S.veh); S.P.phase = P.phase; S.P.dvUsed = P.dvUsed; S.P.h = P.h;
    S.P.eng = { ...P.eng }; S.P.aux = P.aux ? { ...P.aux } : null;
    if (P.att) { S.P.att = P.att.copy(); S.P.attCmd = () => S.cmdAt(S.P.s.t - S.t0); }
    S.burn = this.burn ? { ...this.burn } : null; S.rot = this.rot ? { ...this.rot } : null; S.events = [];
    return S;
  }
}

// ayrılma ekseni (iniş aracı yönü): yığının gövde +z ekseni (yönelim yoksa hız yönü)
export const sepAxis = (P) => (P.att ? qRot(P.att.q, Z_AXIS) : unit(P.s.v));
