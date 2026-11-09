// LS19 temas ve yüzey evresi: iniş takımının temas zarfı, enerjiye dayalı devrilme denetimi ve temas sonrası olay çizelgesi (saf fonksiyonlar; DOM yok, Node'da sınanır: test/test_touchdown.js).
// Kaynaklar:
//   [R]  W. F. Rogers, "Apollo Experience Report — Lunar Module Landing Gear Subsystem", NASA TN D-6850 (1972), https://ntrs.nasa.gov/citations/19720018253
//        s. 3: yüzey ortalama eğimi ≤ 6°, etkin eğim (çukur/tümsek dahil) ≤ 12°, kayma sürtünmesi 0,4–1,0 (ya da tam tutulma); başta dikey 10 ft/s, yatay 5 ft/s.
//        s. 10, şekil 10: son iniş takımı "167-in (10-7-4)": dikey 10 ft/s (3,05 m/s) yatay hız yokken, yatay 4 ft/s'de (1,22 m/s) dikey 7 ft/s (2,13 m/s); 167 inç = ayak izi (tread) yarıçapı 4,24 m.
//        s. 10: tasarımda motor itkisinin sönme süresi ~0,5 s. s. 11, şekil 12: Apollo 11 analizinde 3σ temas yönelimi yunuslama 5,69°, yuvarlanma 5,72°; açısal hız 3σ yunuslama/yuvarlanma 6,0°/s, sapma 1,5°/s;
//        "sonda kipi": motor kesme sonda temasından sonra, ayaklar değmeden; pilot tepki süresi 1,7 s. s. 16: Apollo 11 temas: dikey 1,7 ft/s, yanal 2,1 ft/s.
//   [A]  Apollo Lunar Surface Journal, Apollo 11 iniş dökümü, https://www.apollojournals.org/alsj/a11/a11.landing.html
//        sondalar 67 inç (1,70 m); 102:45:40 "Contact Light", 102:45:43 "Shutdown" (+3 s), 102:45:47 "Engine Arm, Off. 413 is in" (+7 s), 102:45:58 "The Eagle has landed" (+18 s),
//        102:46:25 "descent vent" (+45 s), 102:47:03 oksitleyici tahliyesi görülüyor (+83 s), 102:47:09 "Stay for T1" (+89 s).
// (v): kaynaksız model değeri.
import { dot, cross, norm, unit } from './vec3.js';

const D2R = Math.PI / 180, FT = 0.3048;
export const TOUCH = {
  PROBE: 67 * 0.0254,           // m: temas sondası boyu, ayak tabanının altında [A] (67 inç = 1,70 m)
  REACT: 1.0,                   // s: temas ışığından motor kesme komutuna (v; görev kesmeyi sonda kipinde ister [R], Apollo 11'de 3 s sürdü [A], TN D-6850 analizi 1,7 s kullandı [R])
  DECAY: 0.5,                   // s: kesmeden sonra itkinin sönme süresi [R s. 10]
  VZ0: 10 * FT, VZ4: 7 * FT, VH: 4 * FT,          // m/s: hız zarfı (10-7-4) [R şekil 10]
  TILT: 6.0, RATE: 6.0, YAW_RATE: 1.5,             // °, °/s: temasta yönelim ve açısal hız (Apollo 11 analizinin 3σ sınırları) [R şekil 12]
  SLOPE: 12.0,                  // °: etkin yüzey eğimi sınırı [R s. 3]
  R_PAD: 2.4,                   // m: ayak izi yarıçapı. LM'de 167 inç (4,24 m) [R]; sahnedeki 4 m'lik LM modeli (gerçek LM ~7 m) aynı oranla 2,4 m (v; modelde ayaklar ±2,57 m'ye uzanır)
  SETTLE: 1.5,                  // s: temastan sonra araç dört ayağına oturur (v; Apollo 11'de yönelim geçişleri ~1,5 s sürdü [R şekil 16])
};
// Temas sonrası olay çizelgesi (temas ışığından saniye; Apollo 11 zamanları [A])
export const POST_LANDING = [
  { key: 'ENGINE_SAFE', dt: 7, msg: 'Motor emniyete alındı: motor ateşleme anahtarı kapalı, iniş motoru komut geçersiz kılma kapalı' },
  { key: 'TILT', dt: 18, msg: null },                                           // duruş raporu (mission.js doldurur)
  { key: 'DPS_VENT', dt: 45, msg: 'İniş kademesi yakıt tanklarının basıncı boşaltılıyor (yakıt ve oksitleyici tahliyesi)' },
  { key: 'STAY_T1', dt: 89, msg: 'Yüzeyde kalış kararı (T1): kal' },
];

// Hız zarfı: dikey sınır yatay hızla doğrusal azalır (10 ft/s → 4 ft/s yatayda 7 ft/s). vz, vh: m/s (vz işaretsiz alınır). Döner { ok, vzMax }.
export function velEnvelope(vz, vh) {
  const vzMax = TOUCH.VZ0 - (TOUCH.VZ0 - TOUCH.VZ4) * Math.min(1, vh / TOUCH.VH);
  return { ok: Math.abs(vz) <= vzMax && vh <= TOUCH.VH, vzMax };
}

// Enerjiye dayalı devrilme denetimi (rijit cisim, öndeki ayak(lar) tutulmuş: TN D-6850'deki kritik kararlılık durumu, sürtünme tam tutulma).
// Her yatay devrilme yönü d için (5° adım): dönme ekseni ayak izi karesinin d yönündeki kenarıdır (d'ye ayak yönünde R, iki ayak arasında R/√2).
//   kol a(d), kütle merkezinin ayak düzleminden yüksekliği h: L = √(a²+h²), β = atan(a/h) (düz zeminde dik araçta statik devrilme açısı)
//   φ = β − σ_d − θ_d (σ_d: d yönünde yokuş aşağı eğim, θ_d: aracın d'ye yatıklığı): kütle merkezinin pivotun üstüne gelmesi için gereken dönme
//   açısal momentum (pivot çevresinde, çarpmada korunur): H = m·h·v_d + I_t·ω_d (v_d: d yönündeki yatay hız, ω_d: d'ye devrilme hızı). Dikey hızın dengeleyici momenti ihmal edilir (tutucu).
//   KE = H² / (2·(I_t + m·L²)), engel ΔPE = m·g·L·(1 − cos φ); KE ≥ ΔPE ya da φ ≤ 0 → devrilir. Pay = ΔPE / KE (≥ 1 kararlı).
// Girdiler yerel çerçevede (x, y yatay, z yukarı): axis aracın gövde ekseni (birim), xb gövde x ekseni (ayak yönü), v yüzeye göre hız (m/s), w açısal hız (rad/s, yerel),
//   m kg, It devrilme eksenindeki eylemsizlik (kg·m², kütle merkezinde), h m, g m/s², slope { deg, az } (az: yokuş aşağı yönün x'ten açısı, °).
export function tipOver({ axis, xb, v, w, m, It, h, g, slope = null, rPad = TOUCH.R_PAD }) {
  const sDeg = slope ? slope.deg : 0, sAz = slope ? slope.az * D2R : 0, tanS = Math.tan(sDeg * D2R);
  const xh = unit([xb[0], xb[1], 0]), psiB = Math.atan2(xh[1], xh[0]);
  let worst = null;
  for (let k = 0; k < 72; k++) {
    const psi = (k * 5) * D2R, d = [Math.cos(psi), Math.sin(psi), 0];
    let dp = ((psi - psiB) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2); if (dp > Math.PI / 4) dp -= Math.PI / 2;      // ayak yönüne göre açı, [−45°, 45°]
    const eps = Math.PI / 4 - Math.abs(dp), a = (rPad / Math.SQRT2) / Math.cos(eps);
    const L = Math.hypot(a, h), beta = Math.atan2(a, h);
    const sig = Math.atan(tanS * Math.cos(psi - sAz)), th = Math.atan2(dot(axis, d), axis[2]);
    const phi = beta - sig - th;
    const vd = v[0] * d[0] + v[1] * d[1], wd = dot(w, cross([0, 0, 1], d));
    const H = Math.max(0, m * h * vd + It * wd), Ip = It + m * L * L, KE = H * H / (2 * Ip), PE = phi > 0 ? m * g * L * (1 - Math.cos(phi)) : 0;
    const margin = phi <= 0 ? 0 : KE > 0 ? PE / KE : Infinity;
    if (!worst || margin < worst.margin) worst = { margin, dirDeg: k * 5, phiDeg: phi / D2R, betaDeg: beta / D2R, lever: a, KE, PE };
  }
  return { ...worst, stable: worst.margin > 1 };
}

// Yüzeyde duruş: dört ayağa oturunca gövde ekseni zemin normaline oturur (yaw korunur). slope: { deg, az } → yerel çerçevede normal
export function surfaceNormal(slope) {
  if (!slope || !slope.deg) return [0, 0, 1];
  const s = slope.deg * D2R, az = slope.az * D2R;
  return [Math.sin(s) * Math.cos(az), Math.sin(s) * Math.sin(az), Math.cos(s)];
}
export const tiltDeg = (axisLocal) => Math.acos(Math.max(-1, Math.min(1, axisLocal[2] / norm(axisLocal)))) / D2R;
