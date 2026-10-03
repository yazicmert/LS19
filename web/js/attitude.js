// LS19 araç yönelimi: itki ekseni (gövde +z) için hız sınırlı izleme.
// Fizik motoru nokta kütledir (3 serbestlik derecesi); yönelim burada kinematik bir durum olarak tutulur: komuta (istenen itki yönü) doğru
// sınırlı açısal hızla dönülür, itki gerçek eksen boyunca uygulanır. Dönme momenti/RCS dinamiği YOKTUR (6 serbestlik dereceli bir model değildir).
//   - Dönme açısal hızla sınırlıdır (ω_maks) ve komuta yaklaşırken üstel yavaşlar (zaman sabiti τ); komuta SNAP içindeyse tam komutaya oturur
//     (ince yönelim kararlılığı: kayan komutları izleyen yakışlarda gecikme olmaz).
//   - Dönme her adımda en kısa yayla yapılır (en küçük dönüş); yuvarlanma (gövde z eksenine göre dönüş) tekilliksiz, süreklidir:
//     itki yönü yerel dikeyden geçse de, 180° ters çevrilse de yuvarlanma sıçramaz.
// Kuaterniyonlar [x, y, z, w], gövde → eylemsiz (ICRF eksenleri); THREE.Quaternion ile aynı sıra ve dönüş yönü.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 1]; };
export const Z_AXIS = [0, 0, 1], Y_AXIS = [0, 1, 0];
export const D2R = Math.PI / 180;

export function qMul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
export function qRot(q, v) {                                    // q v q*
  const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export function qAxisAngle(n, ang) { const s = Math.sin(ang / 2); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; }
export function qNormalize(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
export function qAngle(a, b) {                                   // iki yönelim arası dönüş açısı (rad); a⁻¹ ⊗ b'nin açısı (küçük açılarda da duyarlı: atan2)
  const x = a[3] * b[0] - a[0] * b[3] - a[1] * b[2] + a[2] * b[1], y = a[3] * b[1] + a[0] * b[2] - a[1] * b[3] - a[2] * b[0],
    z = a[3] * b[2] - a[0] * b[1] + a[1] * b[0] - a[2] * b[3], w = a[3] * b[3] + a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return 2 * Math.atan2(Math.sqrt(x * x + y * y + z * z), Math.abs(w));
}
export const vAngle = (a, b) => Math.atan2(norm(cross(a, b)), dot(a, b));          // iki vektör arası açı (rad), küçük açılarda da duyarlı
export function qSlerp(a, b, s) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const sg = d < 0 ? -1 : 1; d = Math.abs(d);
  if (d > 0.9995) return qNormalize([0, 1, 2, 3].map((i) => a[i] + s * (sg * b[i] - a[i])));
  const th = Math.acos(d), sn = Math.sin(th), w1 = Math.sin((1 - s) * th) / sn, w2 = (Math.sin(s * th) / sn) * sg;
  return [0, 1, 2, 3].map((i) => w1 * a[i] + w2 * b[i]);
}
// (x, y, z) sütunlu dönme matrisinden kuaterniyon (THREE.Quaternion.setFromRotationMatrix ile aynı)
export function qFromBasis(x, y, z) {
  const m11 = x[0], m12 = y[0], m13 = z[0], m21 = x[1], m22 = y[1], m23 = z[1], m31 = x[2], m32 = y[2], m33 = z[2], tr = m11 + m22 + m33;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]; }
  if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s]; }
  if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s]; }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22); return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}
// z ekseni verilen, x ekseni ref'e (örn. yerel dikey) en yakın yönelim
export function qFromZ(z, ref = [1, 0, 0]) {
  z = unit(z); let x = [ref[0] - z[0] * dot(ref, z), ref[1] - z[1] * dot(ref, z), ref[2] - z[2] * dot(ref, z)];
  if (norm(x) < 1e-6) x = cross(z, [0, 0, 1]);
  if (norm(x) < 1e-6) x = cross(z, [0, 1, 0]);
  x = unit(x); return qFromBasis(x, cross(z, x), z);
}

// Bir adımın yönelim güncellemesi (saf): q'dan cmd yönüne h saniye boyunca dön. Döner { q, mid, phi, theta }:
//   theta: adım başında itki ekseni ile komut arasındaki açı; phi: bu adımda dönülen açı; mid: adımdaki ortalama eksen (itki yönü)
//   rate (rad/s) azami açısal hız, tau (s) yaklaşma zaman sabiti (dönme hızı = min(rate, theta/tau)), snap (rad): komuta bu kadar yakınsa tam komuta otur
export function attStep(q, cmd, h, { rate, tau = 1.5, snap = 0.5 * D2R }) {
  const a = qRot(q, Z_AXIS), c = unit(cmd), theta = vAngle(a, c);
  if (theta < 1e-12) return { q, mid: a, phi: 0, theta };
  if (theta <= snap) return { q: qNormalize(qMul(qSwing(a, c, q, theta), q)), mid: c, phi: theta, theta };      // ince yönelim: komut tam izlenir
  const phi = Math.min(theta, Math.min(rate, theta / tau) * h), sw = qSwing(a, c, q, phi);
  return { q: qNormalize(qMul(sw, q)), mid: qRot(qMul(qSwing(a, c, q, phi / 2), q), Z_AXIS), phi, theta };
}
function qSwing(a, c, q, phi) {                                  // a → c düzlemindeki dönme ekseni (z'ye dik); tam ters ise gövde y ekseni (yunuslama)
  let n = cross(a, c); const ns = norm(n);
  n = ns > 1e-9 ? [n[0] / ns, n[1] / ns, n[2] / ns] : qRot(q, Y_AXIS);
  return qAxisAngle(n, phi);
}

export class Attitude {
  constructor(z, ref = [1, 0, 0]) { this.q = qFromZ(z, ref); }
  axis() { return qRot(this.q, Z_AXIS); }
  angleTo(cmd) { return vAngle(this.axis(), unit(cmd)); }
  copy() { const o = Object.create(Attitude.prototype); o.q = this.q.slice(); return o; }
  set(q) { this.q = q.slice(); }
  // ekseni (yuvarlanmayı koruyarak, en kısa yayla) hemen cmd'ye getir: temas sonrası bacaklar üstünde dik durma gibi kinematik olaylar için
  snapTo(cmd) { const a = this.axis(), c = unit(cmd), th = vAngle(a, c); if (th > 1e-12) this.q = qNormalize(qMul(qSwing(a, c, this.q, th), this.q)); }
}
