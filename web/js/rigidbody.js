// LS19 rijit cisim dinamiği — 6 serbestlik derecesinin DÖNME yarısı: kütle özellikleri, Euler denklemleri, kuaterniyon kinematiği.
// Ötelemeyi engine.js'in N-cisim DOPRI5 çözücüsü taşır; kütle merkezi hareketi nokta kütledir, dönme bu modüldeki rijit cisim denklemleriyle ilerler.
//   Euler:     I·ω̇ = τ − ω × (I·ω)        (ω gövde çerçevesinde, I köşegen: eksen simetrik yığın; ürün terimleri yok)
//   Kinematik: q̇ = ½ q ⊗ [ω, 0]            (q: gövde → eylemsiz (ICRF), [x, y, z, w]; THREE.Quaternion ile aynı sıra)
// Birimler: SI (m, kg, s, N·m, rad). Gövde çerçevesi: z ekseni itki ekseni (motor çanı −z), başlangıç noktası iniş aracı modelinin başlangıç noktası
// (iniş ayaklarının 2,9 m üstü); yığın üstten alta: iniş aracı / (Ay yörünge kademesi) / TLI kademesi.
// Kademe geometrisi ve aktüatör değerleri TEMSİLİDİR (belirli bir aracın verisi değildir); doğrulama: test/test_dynamics6.js.
import { qMul, qRot, qNormalize, qConj } from './attitude.js';

const D2R = Math.PI / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------------------------------------------------------------- kademe rolleri (geometri, RCS, TVC, denetim parametreleri)
//  len/rad: gövde uzunluğu ve yarıçapı (m); cg: kuru kütle merkezi (kıç uçtan, m); tankAft/tankLen/tankRad: yakıt tankı (kıç uçtan başlar; sütun kıça çökmüş);
//  pivot: gimbal noktası (kıç uçtan, m); rcs: F itici itkisi (kN), n çift sayısı (eksen başına), arm kol (m), isp (s), tmin en küçük açık kalma (s), prop RCS yakıt bütçesi (kg; kuru kütlenin parçası);
//  tvc: max açı (°), rate hız (°/s), lag birinci derece gecikme (s); ctl: wMax azami dönme hızı (°/s; iniş ve elle uçuşta), wCruise seyir dönmelerinde (hizalama; RCS yakıtını korur), Kw hız döngüsü (1/s), Ki integratör (1/s²), thLin doğrusal bölge (°),
//  brake frenleme eğrisi payı, dt denetim periyodu (s); cgOff: kütle merkezi yanal ofseti (m), align: motor itki ekseni sapması (rad): sabit bozucu torklar.
export const ROLES = {
  lander: { len: 4.0, rad: 1.6, cg: 2.2, tankAft: 0.6, tankLen: 2.4, tankRad: 1.2, pivot: 1.0,
    rcs: { F: 0.45, n: [1, 1, 1], arm: [1.5, 1.5, 1.5], isp: 285, tmin: 0.014, prop: 36 }, tvc: { max: 5, rate: 25, lag: 0.06 },
    ctl: { wMax: 15, wCruise: 4, Kw: 3.0, Ki: 1.0, thLin: 4.0, brake: 0.4, dt: 0.05 }, cgOff: [0.012, -0.008], align: [0.0010, -0.0007] },
  orb: { len: 3.4, rad: 1.45, cg: 1.7, tankAft: 0.3, tankLen: 2.5, tankRad: 1.2, pivot: 0.6,
    rcs: { F: 0.45, n: [1, 1, 1], arm: [2.0, 2.0, 1.5], isp: 285, tmin: 0.014, prop: 36 }, tvc: { max: 5, rate: 25, lag: 0.06 },
    ctl: { wMax: 8, wCruise: 3, Kw: 2.5, Ki: 0.8, thLin: 4.0, brake: 0.4, dt: 0.05 }, cgOff: [0.012, -0.008], align: [0.0008, -0.0006] },
  tli: { len: 16.0, rad: 1.5, cg: 8.0, tankAft: 1.0, tankLen: 13.5, tankRad: 1.4, pivot: 1.5,
    rcs: { F: 0.45, n: [2, 2, 2], arm: [8.0, 8.0, 1.6], isp: 280, tmin: 0.02, prop: 60 }, tvc: { max: 5, rate: 5, lag: 0.2 },
    ctl: { wMax: 2, wCruise: 1.5, Kw: 1.2, Ki: 0.35, thLin: 2.0, brake: 0.5, dt: 0.1 }, cgOff: [0.020, 0.015], align: [0.0008, -0.0006] },
};
export const Z_FEET = -2.9, GAP = 0.15;                           // iniş ayaklarının gövde çerçevesindeki z'si; kademeler arası boşluk (m)
export const stageRole = (st) => (st.dyn && st.dyn.role) || (st.T >= 50 ? 'tli' : /yörünge/i.test(st.name || '') ? 'orb' : 'lander');
const SPEC = new WeakMap();
export function stageSpec(st) {                                    // kademe nesnesine bağlı önbellekli özellikler (st.dyn ile üzerine yazılabilir)
  let s = SPEC.get(st);
  if (!s) { const base = ROLES[stageRole(st)]; s = { role: stageRole(st), ...base, ...(st.dyn || {}) }; SPEC.set(st, s); }
  return s;
}

// ---------------------------------------------------------------- kütle özellikleri
// stages: Vehicle.stages (dry: yapı + RCS yakıtı, prop: ana yakıt (etkin kademede güncel, sonrakilerde dolu), prop0: başlangıç yakıtı), k: etkin kademe.
// Bileşenler (kademe başına): kuru gövde (düzgün silindir) + yakıt sütunu (tankın kıçına çökmüş silindir, doluluk = prop/prop0). Toplam kütle merkezi ve
// eylemsizlik tensörü (kütle merkezinde, köşegen) paralel eksen teoremiyle toplanır. Dönen: { m, zCg, I:[Ix,Iy,Iz], ell, zPivot, sp }.
//  ell: kütle merkezinden etkin kademenin gimbal noktasına kol (m, kütle merkezi gimbalin üstündeyse > 0).
const cylI = (m, R, L) => [m * (3 * R * R + L * L) / 12, m * (3 * R * R + L * L) / 12, 0.5 * m * R * R];
export function massProps(stages, k) {
  const n = stages.length, lay = new Array(n);
  let zAft = Z_FEET;
  for (let j = n - 1; j >= k; j--) {
    const sp = stageSpec(stages[j]);
    if (j < n - 1) zAft = zAft - GAP - sp.len;                       // altındaki kademe: üstü, üsttekinin kıç ucunun GAP altında
    lay[j] = { sp, zAft };
  }
  const comp = [];                                                  // [kütle, z, [Ix, Iy, Iz] kendi merkezinde]
  for (let j = k; j < n; j++) {
    const st = stages[j], { sp, zAft: za } = lay[j];
    comp.push([st.dry, za + sp.cg, cylI(st.dry, sp.rad, sp.len)]);
    if (st.prop > 0) {
      const f = Math.min(1, st.prop / (st.prop0 || st.prop)), Lc = Math.max(1e-3, f * sp.tankLen);
      comp.push([st.prop, za + sp.tankAft + 0.5 * Lc, cylI(st.prop, sp.tankRad, Lc)]);
    }
  }
  let m = 0, mz = 0; for (const [mi, zi] of comp) { m += mi; mz += mi * zi; }
  const zCg = mz / m, I = [0, 0, 0];
  for (const [mi, zi, Ic] of comp) { const d = zi - zCg; I[0] += Ic[0] + mi * d * d; I[1] += Ic[1] + mi * d * d; I[2] += Ic[2]; }
  const sp = lay[k].sp, zPivot = lay[k].zAft + sp.pivot;
  return { m, zCg, I, ell: zCg - zPivot, zPivot, sp, zAft: lay[k].zAft };
}

// ---------------------------------------------------------------- rijit cisim dinamiği
// ω̇ = I⁻¹ (τ − ω × Iω) ve q̇ = ½ q ⊗ [ω, 0]; τ gövde çerçevesinde (N·m), adım boyunca sabit (ZOH).
function rotDeriv(q, w, I, tau) {
  const dq = qMul(q, [w[0], w[1], w[2], 0]), Iw = [I[0] * w[0], I[1] * w[1], I[2] * w[2]], gc = cross(w, Iw);
  return [[0.5 * dq[0], 0.5 * dq[1], 0.5 * dq[2], 0.5 * dq[3]], [(tau[0] - gc[0]) / I[0], (tau[1] - gc[1]) / I[1], (tau[2] - gc[2]) / I[2]]];
}
// RK4 adımı (q normlanır). Döner { q, w }.
export function rk4Rot(q, w, I, tau, h) {
  const add = (a, b, s) => a.map((x, i) => x + s * b[i]);
  const [k1q, k1w] = rotDeriv(q, w, I, tau);
  const [k2q, k2w] = rotDeriv(add(q, k1q, h / 2), add(w, k1w, h / 2), I, tau);
  const [k3q, k3w] = rotDeriv(add(q, k2q, h / 2), add(w, k2w, h / 2), I, tau);
  const [k4q, k4w] = rotDeriv(add(q, k3q, h), add(w, k3w, h), I, tau);
  const q1 = qNormalize(q.map((x, i) => x + (h / 6) * (k1q[i] + 2 * k2q[i] + 2 * k3q[i] + k4q[i])));
  const w1 = w.map((x, i) => x + (h / 6) * (k1w[i] + 2 * k2w[i] + 2 * k3w[i] + k4w[i]));
  return { q: q1, w: w1 };
}
// serbest (torksuz) dönme, tau = 0: büyük süreleri küçük RK4 adımlarına böler (ayrılan kademelerin devrilmesi)
export function freeRot(q, w, I, T, hMax = 5.0) {
  const n = Math.max(1, Math.ceil(T / hMax)), h = T / n; let s = { q, w };
  for (let i = 0; i < n; i++) s = rk4Rot(s.q, s.w, I, [0, 0, 0], h);
  return s;
}
// gravite gradyanı torku (gövde çerçevesi): τ = 3μ/r³ · r̂ × (I r̂); rb: merkez cisimden araca birim vektör (gövdede), k3 = 3μ/r³ (s⁻²)
export function ggTorque(rb, k3, I) { const c = cross(rb, [I[0] * rb[0], I[1] * rb[1], I[2] * rb[2]]); return [k3 * c[0], k3 * c[1], k3 * c[2]]; }
// korunan/büyüklükler (testler): eylemsiz açısal momentum L = R·(Iω) ve dönme kinetik enerjisi
export function angMomentum(q, w, I) { return qRot(q, [I[0] * w[0], I[1] * w[1], I[2] * w[2]]); }
export function rotEnergy(w, I) { return 0.5 * (I[0] * w[0] * w[0] + I[1] * w[1] * w[1] + I[2] * w[2] * w[2]); }
export { D2R, qConj };
