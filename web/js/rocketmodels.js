// Gerçek roketlerin üst kademeleri (TLI kademesi) için 3B çizimler: yayımlanmış ölçülerden (çap, boy, motor çanı çıkış çapı ve boyu; rockets.js dims).
// ICPS, Falcon ikinci kademesi ve Centaur V'nin kamu malı resmî 3B modeli yok (NASA 3D Resources'taki SLS Block 1 modeli fırlatma düzeninde, ICPS adaptör kabuğunun içinde):
// gövde dönel yüzeylerle (LatheGeometry) ölçüye sadık çizilir. Saturn V'nin S-IVB'si resmî NASA modelidir (models/stage.glb).
// Çerçeve: birim metre, gövde ekseni z (kademenin üst yüzü z = 0, motor çanı −z'de), grup ölçeği 1e-3 (sahne km).
import * as THREE from 'three';
import { ROCKETS } from './rockets.js';

const M = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });      // profil yönünden bağımsız (iç/dış yüz)
function mats() {
  return {
    white: M({ color: 0xeceae4, metalness: 0.0, roughness: 0.55 }),
    paint: M({ color: 0xdcdcd8, metalness: 0.05, roughness: 0.5 }),
    steel: M({ color: 0xd3d6db, metalness: 0.45, roughness: 0.35 }),     // paslanmaz çelik (uzayda ortam yansıması zayıf: düşük metaliklik, açık ton)
    alu: M({ color: 0xb9bdc3, metalness: 0.6, roughness: 0.4 }),
    sofi: M({ color: 0xc9773a, metalness: 0.0, roughness: 0.85 }),       // sprey köpük yalıtım (turuncu)
    dark: M({ color: 0x2e3034, metalness: 0.3, roughness: 0.6 }),
    nb: M({ color: 0x5e5c60, metalness: 1.0, roughness: 0.42, side: THREE.DoubleSide }),   // niyobyum / karbon-karbon çan uzantısı
    cu: M({ color: 0x8a5a3c, metalness: 1.0, roughness: 0.4, side: THREE.DoubleSide }),    // rejeneratif soğutmalı çan (bakır alaşımı görünümü)
  };
}
// profil [[r, z], …] (z azalan) etrafında dönel yüzey; LatheGeometry Y ekseni etrafında döndürür → x ekseninde +90° ile Y → Z
function lathe(g, prof, mat) {
  const geo = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(Math.max(r, 1e-4), z)), 64);
  const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2; g.add(m);
  return m;
}
const dome = (r, z0, depth, n = 10, down = true) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI / 2; return [r * Math.cos(a), z0 + (down ? -1 : 1) * depth * Math.sin(a)]; });
// çan: boğaz yarıçapı rt, çıkış re, boy L; parabolik (Rao benzeri) profil
const bell = (rt, re, z0, L, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const s = i / n; return [rt + (re - rt) * Math.sqrt(s) * (0.35 + 0.65 * s) / 1.0, z0 - L * s]; });
function engine(g, x, y, z0, spec, K, ext) {
  const e = new THREE.Group(); e.position.set(x, y, 0); g.add(e);
  const { exitD, len } = spec.bell, re = exitD / 2, rt = re * 0.22;
  lathe(e, [[rt * 1.6, z0], [rt * 1.9, z0 - 0.25], [rt * 1.7, z0 - 0.55], [rt, z0 - 0.8]], K.dark);              // yanma odası + boğaz
  const zb = z0 - 0.8, Lb = len - 0.8;
  if (ext) { const zs = zb - Lb * 0.35; lathe(e, bell(rt, re * 0.62, zb, Lb * 0.35), K.cu); lathe(e, bell(re * 0.62, re, zs, Lb * 0.65), K.nb); }
  else lathe(e, bell(rt, re, zb, Lb), K.cu);
  return e;
}

// key: 'icps' | 'f9s2' | 'centaur' → { group, place: { exitZ, exitR, len, rcsZ, rcsR, engines: [[x, y], …] }, plume: 'hydrolox' | 'kerolox' }
export function makeUpperStage(key) {
  const K = mats(), g = new THREE.Group();
  let place, plume = 'hydrolox';
  if (key === 'icps') {
    // ICPS (Delta IV 5 m ikinci kademesi): 5,1 m çaplı LH2 tankı üstte, altta asılı 3,2 m'lik LOX tankı, uzayan çanlı RL10B-2; toplam 13,7 m (çan açık)
    const s = ROCKETS.SLS1.stage.dims, R = s.D / 2;
    lathe(g, [[R + 0.03, 0], [R + 0.03, -0.45]], K.alu);                                             // Orion kademe adaptörü bağlantı halkası
    lathe(g, [[R, -0.45], [R, -4.6], ...dome(R, -4.6, 1.5).slice(1)], K.paint);                       // LH2 tankı (beyaz boya)
    lathe(g, [[R, -1.9], [R + 0.02, -2.4], [R, -2.9]], K.alu);                                        // ara kuşak
    const zL = -7.45, zE = -(s.L - s.bell.len);                                                   // LOX tankı ekvatoru, motor üstü (çan ucu z = −L)
    lathe(g, [...dome(1.6, zL, 0.95, 10, false).reverse(), ...dome(1.6, zL - 0.1, 1.15).slice(1)], K.sofi);   // LOX tankı (köpük yalıtımlı)
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * Math.PI, rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), K.alu);
      rod.position.set(Math.cos(a) * 2.1, Math.sin(a) * 2.1, -6.9); rod.rotation.x = Math.PI / 2; rod.rotation.y = 0.5 * Math.cos(a); rod.rotation.z = 0; g.add(rod); }     // LOX tankı taşıyıcı kafes
    engine(g, 0, 0, zE, { bell: s.bell }, K, true);
    lathe(g, [[1.05, zE + 0.85], [0.6, zE + 0.3], [0.35, zE - 0.1]], K.dark);                              // itki konisi
    place = { exitZ: zE - s.bell.len, exitR: s.bell.exitD / 2, len: s.L, rcsZ: -4.4, rcsR: R + 0.15, engines: [[0, 0]] };
  } else if (key === 'f9s2') {
    // Falcon 9 ikinci kademesi: 3,66 m çaplı alüminyum-lityum tanklar (beyaz), Merlin 1D Vakum: büyük niyobyum çan uzantısı (çıkış ~3,3 m); boy ~13,8 m
    const s = ROCKETS.F9.stage.dims, R = s.D / 2, zT = -(s.L - s.bell.len - 0.4);
    lathe(g, [[1.3, 0.0], [R, -0.35]], K.dark);                                                 // yük adaptörü (siyah)
    lathe(g, [[R, -0.35], [R, zT], ...dome(R, zT, 0.6).slice(1)], K.white);                           // RP-1/LOX tankları
    lathe(g, [[R + 0.02, -0.35], [R + 0.02, -0.8]], K.dark);                                          // üst bant
    lathe(g, [[R + 0.015, zT + 0.6], [R + 0.015, zT]], K.dark);                                        // alt bant (motor bölümü)
    engine(g, 0, 0, zT - 0.4, { bell: { exitD: s.bell.exitD, len: s.bell.len } }, K, true);
    plume = 'kerolox';
    place = { exitZ: zT - 0.4 - s.bell.len, exitR: s.bell.exitD / 2, len: s.L, rcsZ: -0.6, rcsR: R + 0.1, engines: [[0, 0]] };
  } else if (key === 'centaur') {
    // Centaur V: 5,4 m çaplı paslanmaz çelik balon tanklar (ortak bölme), iki RL10C-1-1 (çıkış ~1,45 m); boy 11,7 m
    const s = ROCKETS.VULCAN.stage.dims, R = s.D / 2, zA = -(s.L - s.bell.len - 1.6);
    lathe(g, [[R + 0.03, 0], [R + 0.03, -0.35]], K.alu);
    lathe(g, [[R, -0.35], [R, zA], ...dome(R, zA, 1.2).slice(1)], K.steel);
    lathe(g, [[R + 0.02, -3.6], [R + 0.02, -3.9]], K.alu);
    lathe(g, [[2.0, zA - 0.9], [1.4, zA - 1.4]], K.dark);                                      // itki yapısı
    const x = 1.05; for (const sx of [x, -x]) engine(g, sx, 0, zA - 1.6, { bell: s.bell }, K, false);
    place = { exitZ: zA - 1.6 - s.bell.len, exitR: s.bell.exitD / 2, len: s.L, rcsZ: -1.0, rcsR: R + 0.12, engines: [[x, 0], [-x, 0]] };
  } else return null;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(1e-3);
  return { group: g, place, plume };
}
