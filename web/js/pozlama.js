// Pozlama uyarlaması ve Güneş görünürlüğü (saf hesap: DOM ve THREE yok, Node'da sınanır; scene.js her kare çağırır).
// Ölçüm, piksel okumadan, sahnenin geometrisinden yapılır: Dünya, Ay ve araç ekranın ne kadarını kaplıyor, kaplanan yerin ne kadarı Güneş'le aydınlık.
// Kural (gerçek kameradaki parlak nokta öncelikli ölçüm gibi): ekranda belirgin bir aydınlık yüzey (gündüz yüzü, Güneş'teki araç) varsa pozlama 1 kalır;
// kadrajı karanlık yüz (Ay'ın Dünya ışığındaki gecesi, Dünya'nın şehir ışıklı gecesi, gölgedeki araç) dolduruyorsa pozlama açılır (en çok EXP_MAX);
// çok parlak, kadrajı dolduran yüzde (dolunay parlaması, tam Dünya) biraz kısılır (en az EXP_MIN). Geçiş göz gibi: karanlığa yavaş, aydınlığa hızlı;
// kesmede (kamera sıçrayınca) beklemeden hedefe atlar. Sanal saatte (dışa aktarım) aynı kareler aynı pozlamayı verir.
export const EXP_MAX = 8, EXP_MIN = 0.72, TAU_UP = 1.2, TAU_DOWN = 0.35;
export const SUN_ANG = 0.00465;                                      // Güneş'in açısal yarıçapı (rad)

const len = (a) => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dotn = (a, b) => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b) || 1);
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dotn(a, b))));
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// iki dairenin (düzlemde, yarıçap r1 ve r2, merkezler arası d) kesişim alanı
export function circleOverlap(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos(Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1))));
  const b = r2 * r2 * Math.acos(Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2))));
  return a + b - 0.5 * Math.sqrt(Math.max(0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)));
}

// kadraj: göz, bakış yönü, dikey görüş açısı (derece), en/boy. Görüş alanı eşit alanlı bir daire sayılır (yarıçap ψ = √(yarı yatay · yarı dikey))
const viewPsi = (fovY, aspect) => { const vy = fovY * Math.PI / 360, vx = Math.atan(Math.tan(vy) * aspect); return Math.sqrt(vx * vy); };

// bir kürenin kadrajda kapladığı pay (0…1)
export function coverOf(eye, dir, psi, c, R) {
  const v = sub(c, eye), d = len(v);
  if (d <= R) return 1;
  const rho = Math.asin(Math.min(1, R / d));
  return Math.min(1, circleOverlap(psi, Math.min(rho, Math.PI / 2), ang(dir, v)) / (Math.PI * psi * psi));
}

// ölçüm → hedef pozlama. bodies: [{ c, R, w }] (w: parlaklık ağırlığı; dolunay parlaması dahil), veh: { p, size, lit } (lit: tutulma 0…1)
export function meter({ eye, dir, fovY, aspect, sun, bodies, veh }) {
  const psi = viewPsi(fovY, aspect);
  let litL = 0, dark = 0;
  for (const b of bodies) {
    const cv = coverOf(eye, dir, psi, b.c, b.R); if (cv <= 0) continue;
    // aydınlık pay: uzaktan diskin evresi; yüzeye yakınken (cisim kadrajı aşacak kadar büyük) gözün altındaki yerin Güneş yüksekliği
    const ph = ang(sub(sun, b.c), sub(eye, b.c)), kd = (1 + Math.cos(ph)) / 2, kl = smooth(-0.03, 0.06, Math.cos(ph));
    const k = kd + (kl - kd) * smooth(0.5, 1.2, Math.asin(Math.min(1, b.R / len(sub(eye, b.c)))));
    litL += cv * k * b.w; dark += cv * (1 - k);
  }
  if (veh) {                                                         // araç (konu): kadrajdaki açısal boyu
    const v = sub(veh.p, eye), d = len(v);
    if (d > 0 && ang(dir, v) < psi * 1.3) { const a = Math.min(1, (veh.size / d) / (2 * psi)); const cv = Math.min(1, 1.5 * a * a); litL += cv * veh.lit; dark += cv * (1 - veh.lit); }
  }
  const up = smooth(0.05, 0.45, dark) * (1 - smooth(0.02, 0.12, litL));
  const down = litL > 0.75 ? Math.max(EXP_MIN, 0.75 / litL) : 1;
  return { lit: litL, dark, target: Math.exp(Math.log(EXP_MAX) * up) * down };
}

// zamanla uyarlama (logaritmik): karanlığa yavaş (TAU_UP), aydınlığa hızlı (TAU_DOWN)
export function adapt(cur, target, dt) {
  if (!(cur > 0)) return target;
  const tau = target > cur ? TAU_UP : TAU_DOWN, k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return Math.exp(Math.log(cur) + (Math.log(target) - Math.log(cur)) * k);
}

// Güneş diskinin gözden görünen payı (0…1): Dünya ve Ay örtmesi (yumuşak kenar: Güneş'in açısal yarıçapı)
export function sunVisible(eye, sun, spheres) {
  const sv = sub(sun, eye); let vis = 1;
  for (const [c, R] of spheres) {
    const b = sub(c, eye), bn = len(b); if (bn <= R) return 0;
    if (bn > len(sv)) continue;
    const sep = ang(b, sv), bAng = Math.asin(Math.min(1, R / bn));
    vis = Math.min(vis, Math.max(0, Math.min(1, (sep - (bAng - SUN_ANG)) / (2 * SUN_ANG))));
  }
  return vis;
}
