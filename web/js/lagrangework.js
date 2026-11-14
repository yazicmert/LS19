// Laboratuvar › Lagrange noktaları: halo yörüngesi iş parçacığı. Hesap lagrange.js › haloOf'tadır (saf, test_lagrange.js sınar); burada yalnız
// ana iş parçacığının dışında koşturulur: bir üye 0,1–0,75 sn sürebilir (masaüstü; telefonda birkaç katı), kaydırıcı ve çizim donmasın.
// İleti: { id, spec } → { id, h } ya da { id, err }. Eski isteklerin yanıtlarını çağıran (lagrangeui.js) sıra numarasıyla atar.
import { haloOf } from './lagrange.js';

onmessage = (e) => {
  const { id, spec } = e.data;
  try { postMessage({ id, h: haloOf(spec) }); } catch (err) { postMessage({ id, err: String((err && err.message) || err) }); }
};
