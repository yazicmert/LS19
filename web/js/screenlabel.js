// Dünya konumundaki bir noktaya HTML etiketi yerleştirir (kamera görüş alanı dışındaysa gizler). Uydu, asteroit ve takip katmanları ortak kullanır.
// p ve eye aynı (ICRF, km) çerçevede; sahne kameraya göre konumlandığı için nokta p − eye olarak izdüşürülür. dy: etiketin noktanın ne kadar üstünde duracağı (px).
import * as THREE from 'three';

const v = new THREE.Vector3();
export function placeScreenLabel(el, p, eye, camera, canvas, dy = 12) {
  v.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.transform = `translate(${((v.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v.y) / 2) * canvas.clientHeight - dy}px) translate(-50%, -100%)`;
}
