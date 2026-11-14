// Gök cisimlerinin küre ağında görülebilen enlem bandı (saf; Node'da sınanır: test/test_bodyband.js). Ağ: scenegeom.js › sphereGeometry.
// Ufuk bandı: sphereGeometry(R, W, H) ağında kameradan görülebilecek enlem satırlarının dizin aralığı (geometry.setDrawRange için) [başlangıç, sayı].
// Satırlar güney kutbundan (z = −R) kuzeye; kutup satırlarında hücre başına tek üçgen (3W dizin), aradakilerde 6W.
// Yüzey yarıçapı [rMin, rMax] içindeyse (kabartma, kiriş hatası), kameradan d > rMax uzaklıkta görülebilecek bir noktanın kameranın altındaki
// noktaya açısı ψ ≤ acos(rMin/d) + acos(rMin/rMax): görünür bir noktaya giden doğru parçası rMin küresinin içinden geçemez (yüzey her yerde ≥ rMin),
// en uç durum parçanın rMin küresine teğet olmasıdır. Kamera kabartma kabuğunun içindeyken de (rMin < d ≤ rMax, alçak iniş) geçerlidir.
// p: kameranın kürenin yerel çerçevesindeki konumu (km); m: güvenlik payı (satır). d ≤ rMin ise (yüzeyin altında) ağın tamamı.
export function bandRange(p, rMin, rMax, W, H, m = 2) {
  const d = Math.hypot(p[0], p[1], p[2]), total = 6 * W * (H - 1);
  if (!(d > rMin) || !(rMin > 0)) return [0, total];
  const psi = Math.acos(Math.min(1, rMin / d)) + Math.acos(Math.min(1, rMin / rMax));
  const th = Math.acos(Math.max(-1, Math.min(1, -p[2] / d)));                      // güney kutbundan açı (satır 0'ın yönü)
  const r0 = Math.max(0, Math.floor((th - psi) / Math.PI * H) - m);
  const r1 = Math.min(H, Math.ceil((th + psi) / Math.PI * H) + m);
  const at = (r) => (r <= 0 ? 0 : r >= H ? total : 3 * W + (r - 1) * 6 * W);
  return [at(r0), at(r1) - at(r0)];
}
