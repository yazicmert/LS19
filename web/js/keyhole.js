// Yakın geçişin B-düzleminde rezonans çemberleri (saf; DOM yok, Node'da sınanır: test/test_keyhole.js).
// Öpik kuramının Valsecchi vd. (2003, A&A 408, 1179) genişletmesi: geçiş noktası (ξ, ζ) geçişten sonraki yörüngenin yarı büyük eksenini a' belirler.
// a'^(3/2) = k/h (k yılda h tur) olan noktalar ζ ekseni üzerinde merkezli bir çember oluşturur: o çemberden geçen asteroit k yıl sonra Dünya'ya yeniden
// yaklaşır (rezonanslı dönüş). Çarpmaya götüren dar bölgeler (anahtar delikleri) bu çemberlerin üzerindedir; yerlerini tam tümleme belirler
// (deflectwork.js sonraki geçişleri tümler), çemberler yalnız yapıyı gösterir.
//   Birimler: uzunluk Dünya'nın yörünge yarıçapı (≈ 1 AB), hız Dünya'nın yörünge hızı; U = v∞ / v⊕, θ: U ile Dünya hızı arasındaki açı.
//   c = m/U², m = μ⊕/μ☉;  cos θ' = [(b² − c²) cos θ + 2 c ζ sin θ] / (b² + c²);  a' = 1 / (1 − U² − 2 U cos θ').
//   Rezonans çemberi: cos θ' = (1 − U² − 1/a')/(2U); merkez (0, D), D = c sin θ / (cos θ' − cos θ); yarıçap R = c |sin θ'| / |cos θ' − cos θ|.
export const M_EARTH = 398600.435507 / 132712440041.279419;

// S: gelen asimptot (birim), vinf (km/s), vE: Dünya'nın Güneş merkezli hızı (km/s)
export function encounter(S, vinf, vE) {
  const vn = Math.hypot(vE[0], vE[1], vE[2]), cth = (S[0] * vE[0] + S[1] * vE[1] + S[2] * vE[2]) / vn;
  return { U: vinf / vn, cth, sth: Math.sqrt(Math.max(0, 1 - cth * cth)) };
}
// geçiş noktası (AB) → geçişten sonraki yarı büyük eksen (AB)
export function postA(g, xi, zeta) {
  const c = M_EARTH / (g.U * g.U), b2 = xi * xi + zeta * zeta, ctp = ((b2 - c * c) * g.cth + 2 * c * zeta * g.sth) / (b2 + c * c);
  return 1 / (1 - g.U * g.U - 2 * g.U * ctp);
}
// k yılda h tur: çember { D, R } (AB) ya da null (bu karşılaşmayla ulaşılamaz)
export function resonanceCircle(g, k, h) {
  const ap = Math.pow(k / h, 2 / 3), ctp = (1 - g.U * g.U - 1 / ap) / (2 * g.U);
  if (!(Math.abs(ctp) < 1)) return null;
  const c = M_EARTH / (g.U * g.U), den = ctp - g.cth; if (Math.abs(den) < 1e-12) return null;
  return { k, h, a: ap, D: c * g.sth / den, R: c * Math.sqrt(1 - ctp * ctp) / Math.abs(den) };
}
// görünen kareye (±ext AB, merkez cx, cz) giren çemberler, k ≤ kMax yıl (en kısa dönüşler önce; en çok n tane)
export function circlesInView(g, cx, cz, ext, kMax = 30, n = 10) {
  const out = [];
  for (let k = 1; k <= kMax; k++) for (let h = 1; h <= Math.ceil(k * 1.6); h++) {
    if (gcd(k, h) !== 1) continue;
    const C = resonanceCircle(g, k, h); if (!C) continue;
    // çemberin kareye en yakın noktası kare içinde mi? (kareyi çevreleyen daireyle kaba eleme + kareye uzaklık)
    const dc = Math.hypot(cx, cz - C.D), r2 = ext * Math.SQRT2;
    if (Math.abs(dc - C.R) < r2) out.push(C);
  }
  return out.sort((a, b) => a.k - b.k).slice(0, n);
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
