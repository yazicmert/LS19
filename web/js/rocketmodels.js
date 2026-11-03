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
  } else if (key === 'generic') {
    // genel (temsilî) TLI kademesi: ~6,2 t LH2/LOX'a yetecek hacim (≈ 17 m³) — 3,0 m çaplı kısa tank, altın MLI kuşağı, tek RL10 sınıfı motor; S-IVB'den ayırt edilsin diye gri-mavi
    const R = 1.5, blue = M({ color: 0x8fa3b8, metalness: 0.2, roughness: 0.5 }), gold = M({ color: 0xc9983a, metalness: 1.0, roughness: 0.32 });
    lathe(g, [[R + 0.03, 0], [R + 0.03, -0.3]], K.alu);
    lathe(g, [[R, -0.3], [R, -4.2], ...dome(R, -4.2, 0.7).slice(1)], blue);
    lathe(g, [[R + 0.02, -1.6], [R + 0.02, -2.6]], gold);
    engine(g, 0, 0, -4.6, { bell: { exitD: 1.2, len: 1.9 } }, K, false);
    place = { exitZ: -6.5, exitR: 0.6, len: 6.5, rcsZ: -0.8, rcsR: R + 0.12, engines: [[0, 0]] };
  } else return null;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(1e-3);
  return { group: g, place, plume };
}

// ------------------------------------------------------------------ tam fırlatma araçları (bilgi kartı görüntüleyicisi; rocketviewer.js)
// Resmî kamu malı modeli olmayan roketler yayımlanmış ölçülerle çizilir: birim metre, roket ekseni +Y, taban y = 0.
//   Falcon 9: 70 m × 3,66 m; 1. kademe ~41,2 m, ara kademe ~6,7 m (siyah), 2. kademe görünen kısmı, kaporta 13,1 m × 5,2 m; 9 Merlin, 4 ızgara kanat, 4 iniş bacağı
//   Falcon Heavy: üç çekirdek yan yana, toplam genişlik 12,2 m; yan iticiler burun konili
//   SLS Block 1: 98,1 m; çekirdek 8,4 m, SRB 3,71 m (NASA 3D Resources'taki SLS modeli yalnız ayrıntı parçalarını içerir, tank kabukları yoktur)
//   Vulcan VC2S: 61,6 m × 5,4 m; 1. kademe ~33,3 m (turuncu köpük yalıtım), Centaur V, 15,5 m kaporta; 2 × GEM 63XL (1,6 m × 22 m), 2 × BE-4
const latheY = (g, prof, mat, x = 0, z = 0) => { const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), 48), mat); m.position.set(x, 0, z); g.add(m); return m; };
const cylY = (g, r, y0, y1, mat, x = 0, z = 0) => latheY(g, [[0, y0], [r, y0], [r, y1], [0, y1]], mat, x, z);
// ogive burun: taban yarıçapı r, y0'dan L boyunca (teğet ogive)
const ogive = (r, y0, L, n = 16) => { const R = (r * r + L * L) / (2 * r); return Array.from({ length: n + 1 }, (_, i) => { const y = (i / n) * L; return [Math.sqrt(R * R - y * y) - (R - r), y0 + y]; }); };
function f9Core(g0, K, x, top) {                                  // top: 'stack' (2. kademe + kaporta) | 'nose' (yan itici burnu)
  const R = 1.83, g = new THREE.Group(); g0.add(g);
  if (top === 'nose') g.userData.part = 'booster';                // kalkış canlandırması: yan iticiler birlikte ayrılır
  cylY(g, R, 0.9, 41.2, K.white, x);                                                            // 1. kademe
  for (let i = 0; i < 9; i++) {                                                                  // octaweb: 8 çevrede + 1 merkez
    const a = (i / 8) * 2 * Math.PI, rr = i === 8 ? 0 : 1.2, px = x + rr * Math.cos(a), pz = rr * Math.sin(a);
    latheY(g, [[0.25, 0.9], [0.18, 0.65], [0.46, 0]], K.nb, px, pz);
  }
  for (let i = 0; i < 4; i++) {                                                                  // iniş bacakları (katlı) ve ızgara kanatları
    const a = Math.PI / 4 + (i / 4) * 2 * Math.PI, leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9.5, 0.25), K.dark);
    leg.position.set(x + Math.cos(a) * (R + 0.12), 5.4, Math.sin(a) * (R + 0.12)); leg.rotation.y = -a; g.add(leg);
    const b = (i / 4) * 2 * Math.PI, fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.1), K.dark);
    fin.position.set(x + Math.cos(b) * (R + 0.6), top === 'stack' ? 46.6 : 40.4, Math.sin(b) * (R + 0.6)); fin.rotation.y = -b + Math.PI / 2; g.add(fin);
  }
  if (top === 'stack') {
    cylY(g, R, 41.2, 47.9, K.dark, x);                                                          // ara kademe (karbon kompozit, siyah)
    cylY(g, R, 47.9, 57.2, K.white, x);                                                         // 2. kademe
    latheY(g, [[R, 57.2], [2.6, 57.9], [2.6, 63.6], ...ogive(2.6, 63.6, 6.4).slice(1)], K.white, x).userData.part = 'fairing';     // kaporta 5,2 m × 13,1 m (y 57,2 → 70)
  } else {
    cylY(g, R, 41.2, 47.0, K.dark, x);
    latheY(g, ogive(R, 47.0, 5.0), K.white, x);                                                 // yan itici burun konisi (y ~52)
  }
}
export function makeLaunchVehicle(key) {
  const K = mats(), g = new THREE.Group();
  if (key === 'f9') f9Core(g, K, 0, 'stack');
  else if (key === 'fh') {
    const d = (12.2 - 3.66) / 2;
    f9Core(g, K, 0, 'stack'); f9Core(g, K, d, 'nose'); f9Core(g, K, -d, 'nose');
    for (const s of [d, -d]) { const st = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(s) - 3.66, 0.4, 0.4), K.alu); st.position.set(s / 2, 40.0, 0); g.add(st); }   // bağlantı kirişleri
  } else if (key === 'vulcan') {
    const R = 2.7, orange = M({ color: 0xc9773a, metalness: 0, roughness: 0.85 });
    cylY(g, R, 1.6, 33.3, orange);                                                               // 1. kademe (sprey köpük yalıtım)
    cylY(g, R + 0.01, 1.6, 3.0, K.white); cylY(g, R + 0.01, 31.8, 33.3, K.white);
    for (const sx of [1.0, -1.0]) latheY(g, [[0.35, 1.6], [0.3, 1.2], [0.85, 0]], K.nb, sx, 0);    // 2 × BE-4
    cylY(g, R, 33.3, 38.5, K.white);                                                            // ara kademe
    cylY(g, R, 38.5, 46.1, K.steel);                                                            // Centaur V (görünen kısım)
    latheY(g, [[R, 46.1], [R, 52.0], ...ogive(R, 52.0, 9.6).slice(1)], K.white).userData.part = 'fairing';   // 5,4 m kaporta (y 46,1 → 61,6)
    for (const sz of [1, -1]) {                                                                  // 2 × GEM 63XL: 1,6 m × ~22 m
      const z = sz * (R + 0.8);
      latheY(g, [[0, 2.0], [0.8, 2.0], [0.8, 21.5], ...ogive(0.8, 21.5, 2.5).slice(1)], K.white, 0, z).userData.part = 'booster';
      latheY(g, [[0.3, 2.0], [0.55, 0.9]], K.dark, 0, z).userData.part = 'booster';
    }
  } else if (key === 'generic') {
    // genel (temsilî) fırlatma aracı: iki kademeli, 3,4 m çaplı, ~54 m; üstte genel TLI kademesi + iniş aracı kaportanın içinde
    const R = 1.7;
    for (let i = 0; i < 5; i++) { const a = (i / 4) * 2 * Math.PI, rr = i === 4 ? 0 : 1.0; latheY(g, [[0.25, 0.9], [0.18, 0.65], [0.42, 0]], K.nb, rr * Math.cos(a), rr * Math.sin(a)); }
    cylY(g, R, 0.9, 30.5, K.white); cylY(g, R + 0.01, 28.5, 30.5, K.dark);
    cylY(g, R, 30.5, 41.0, K.paint);
    latheY(g, [[R, 41.0], [2.3, 41.8], [2.3, 47.0], ...ogive(2.3, 47.0, 7.0).slice(1)], K.white).userData.part = 'fairing';
  } else if (key === 'sls') {
    // SLS Block 1 (98,1 m): 8,4 m turuncu çekirdek (SOFI) + 4 × RS-25, 2 × 5 segmentli SRB (3,71 m × ~54 m), LVSA konisi, ICPS, Orion kademe adaptörü,
    // hizmet modülü kaportaları, Orion + fırlatma iptal sistemi (LAS). Yükseklikler NASA 3D Resources SLS modelindeki parça konumlarından (ana kabuklar o modelde yok)
    const orange = M({ color: 0xc9773a, metalness: 0, roughness: 0.85 }), R = 4.2;
    for (const [x, z] of [[2.05, 2.05], [-2.05, 2.05], [2.05, -2.05], [-2.05, -2.05]]) latheY(g, [[0.45, 3.4], [0.35, 3.0], [1.15, 0.2]], K.nb, x, z);   // RS-25
    cylY(g, R, 3.2, 66.2, orange); cylY(g, R + 0.02, 3.2, 4.6, K.white); cylY(g, R + 0.02, 41.0, 42.4, K.dark);        // çekirdek; motor bölümü; ara tank
    for (const sx of [1, -1]) {                                                                                     // SRB'ler
      const x = sx * (R + 1.855 + 0.45);
      latheY(g, [[2.6, 0.2], [1.9, 3.2], [1.855, 3.4], [1.855, 50.0], ...ogive(1.855, 50.0, 4.7).slice(1)], K.white, x, 0).userData.part = 'booster';
      latheY(g, [[0.9, 0.2], [1.25, -0.6]], K.dark, x, 0).userData.part = 'booster';
      for (const y of [12.5, 22.5, 32.5]) cylY(g, 1.875, y, y + 0.35, K.alu, x, 0).userData.part = 'booster';      // segment bağlantıları
    }
    latheY(g, [[R, 66.2], [2.55, 74.6]], K.white);                                                                    // LVSA
    cylY(g, 2.55, 74.6, 77.9, K.paint); cylY(g, 2.6, 77.9, 79.4, K.white);                                           // ICPS, Orion kademe adaptörü
    cylY(g, 2.62, 79.4, 84.0, K.white); cylY(g, 2.64, 80.6, 81.0, K.dark);                                           // hizmet modülü kaportaları
    latheY(g, [[2.6, 84.0], [1.0, 88.6], [0.62, 88.8]], K.white);                                                    // Orion üstündeki LAS kaportası
    for (const m of [cylY(g, 0.62, 88.8, 96.4, K.white), cylY(g, 0.66, 91.0, 91.6, K.dark), latheY(g, ogive(0.62, 96.4, 1.7), K.white)]) m.userData.part = 'las';   // LAS kulesi
  } else return null;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
