// Kalkış rampalarının yapıları (temsilî, gerçek ölçülerle): servis/erişim kuleleri, alev hendeği, yıldırım kuleleri ve telleri, su (ses bastırma) kulesi, entegrasyon binası.
// Rampa çerçevesi padground.js ile aynı: metre; x doğu, y yukarı, z güney; roket ekseni orijinde. Google 3B karolar açıkken bunlar gizlenir (gerçek yapılar karolarda).
// Kaynaklı ölçüler [kaynak]; kaynaksız yerleşim ve ölçüler (v): görünüş için seçilmiş tahminlerdir.
//   [K39]  NASA KSC, "Launch Complex 39" ve LC-39A/B bilgi notları: alev hendeği 450 ft uzunluk, 58 ft genişlik, 42 ft derinlik (137 × 17,7 × 12,8 m);
//          Sabit Servis Kulesi (FSS) 247 ft (75 m), üstündeki yıldırım direğiyle 347 ft (106 m); ses bastırma su kulesi 290 ft (88 m), 300.000 galon.
//   [L39B] NASA, "Pad 39B Lightning Protection System" (2011): üç adet 600 ft (183 m) yıldırım kulesi, aralarında katener teller.
//   [S40]  SpaceX SLC-40 ekip erişim kulesi (2024): ~265 ft (81 m) (v: kamuya açık rakam yuvarlak); dört yıldırım kulesi (v: yükseklik).
//   [S41]  ULA, Vulcan Launch Systems User's Guide (2023): SLC-41 temiz rampa, araç Dikey Entegrasyon Binası'nda (VIF) kurulur ve rampaya taşınır;
//          VIF ~ 292 ft (89 m) (v: rampaya uzaklık ~ 550 m), rampada dört yıldırım kulesi (v: yükseklik).
// Saf yerleşim (padLayout) Node'da sınanır: test/test_padground.js.

const FT = 0.3048;
// rampa kimliği: LAUNCH.site metninden ("Kennedy Uzay Merkezi LC-39B (…)", "CCSFS SLC-40" …)
export function padKey(site) {
  const s = String(site || '');
  const m = /\b(LC-39A|LC-39B|SLC-40|SLC-41)\b/.exec(s);
  return m ? m[1] : 'generic';
}
// parçalar: { type, ... } — kafes kule (lattice), silindir direk (mast), tel (wire: iki uç), su kulesi (water), kutu (box), sekizgen rampa (octagon), hendek (trench)
export function padLayout(key, { ml = false } = {}) {
  const P = [], trench = { type: 'trench', x: 0, z: 0, len: 450 * FT, w: 58 * FT, depth: 42 * FT, dir: 'ns' };
  const towers = (n, r, h, a0 = 0) => { const out = []; for (let i = 0; i < n; i++) { const a = a0 + (2 * Math.PI * i) / n; out.push({ type: 'mast', x: r * Math.cos(a), z: r * Math.sin(a), h, r0: 1.4, r1: 0.5 }); } return out; };
  const wires = (ts) => ts.map((t, i) => { const u = ts[(i + 1) % ts.length]; return { type: 'wire', a: [t.x, t.h, t.z], b: [u.x, u.h, u.z], sag: 0.12 }; });
  if (key === 'LC-39A') {
    P.push({ type: 'octagon', r: 62, h: 0.6 }, trench);                                        // sekizgen yükseltilmiş rampa (v: ~124 m)
    P.push({ type: 'lattice', x: -24, z: 0, w: 12, d: 12, h: 247 * FT, bay: 6, arm: { y: 70, len: 16, dir: [1, 0] } });   // FSS [K39]; ekip erişim kolu (v: ~70 m)
    P.push({ type: 'mast', x: -24, z: 0, y0: 247 * FT, h: (347 - 247) * FT, r0: 0.5, r1: 0.18 });   // yıldırım direği (FSS üstü, 106 m'ye) [K39]
    P.push({ type: 'water', x: 260, z: -230, h: 290 * FT, tankR: 9, tankH: 14 });              // su kulesi [K39] (v: konum)
  } else if (key === 'LC-39B') {
    P.push({ type: 'octagon', r: 62, h: 0.6 });
    if (!ml) P.push(trench);                                                                   // SLS'te Mobile Launcher (ml.glb) hendeğin üstündedir
    const t3 = towers(3, 125, 600 * FT, Math.PI / 6);                                          // üç yıldırım kulesi [L39B] (v: üçgen yarıçapı)
    P.push(...t3, ...wires(t3));
    P.push({ type: 'water', x: -280, z: -220, h: 290 * FT, tankR: 9, tankH: 14 });             // su kulesi (v: 39A ile aynı; konum)
  } else if (key === 'SLC-40') {
    P.push({ type: 'octagon', r: 40, h: 0.5 }, { ...trench, len: 90, w: 14 });                // (v)
    P.push({ type: 'lattice', x: -20, z: 0, w: 10, d: 10, h: 265 * FT, bay: 6, arm: { y: 66, len: 14, dir: [1, 0] } });  // ekip erişim kulesi [S40]
    const t4 = towers(4, 95, 90, Math.PI / 4);                                                 // dört yıldırım kulesi (v)
    P.push(...t4, ...wires(t4));
    P.push({ type: 'water', x: 220, z: -180, h: 60, tankR: 7, tankH: 11 });                    // (v)
  } else if (key === 'SLC-41') {
    P.push({ type: 'octagon', r: 40, h: 0.5 }, { ...trench, len: 90, w: 14 });                // (v)
    const t4 = towers(4, 80, 85, Math.PI / 4);                                                 // dört yıldırım kulesi [S41] (v: yükseklik, yerleşim)
    P.push(...t4, ...wires(t4));
    P.push({ type: 'box', x: 0, z: 550, w: 50, d: 35, h: 292 * FT, color: 0xd9d7d0 });         // Dikey Entegrasyon Binası (VIF) [S41]
  } else {
    P.push({ type: 'octagon', r: 34, h: 0.5 }, { ...trench, len: 60, w: 12 });                // genel rampa (v)
    P.push(...towers(2, 37, 90, Math.PI / 4));                                                 // iki yıldırım direği (eski temsilî rampa)
  }
  return P;
}

// three.js nesneleri: { group, parts } — parts: Google 3B karolar açılınca gizlenecek nesneler
export function buildPad(THREE, mergeGeometries, key, opts = {}) {
  const group = new THREE.Group(), parts = [], L = padLayout(key, opts);
  const steel = new THREE.MeshLambertMaterial({ color: 0x8e9196 }), conc = new THREE.MeshLambertMaterial({ color: 0x9a978f }), dark = new THREE.MeshLambertMaterial({ color: 0x3a3936 });
  const white = new THREE.MeshLambertMaterial({ color: 0xe6e4de }), red = new THREE.MeshLambertMaterial({ color: 0xb8432f });
  const add = (m) => { group.add(m); parts.push(m); return m; };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  for (const p of L) {
    if (p.type === 'octagon') {
      const g = new THREE.CylinderGeometry(p.r, p.r, p.h + 1.6, 8); g.rotateY(Math.PI / 8); g.translate(0, p.h / 2 - 0.8, 0); add(new THREE.Mesh(g, conc));
    } else if (p.type === 'trench') {                                                          // hendek: koyu taban ve iki duvar (rampa yüzeyinin hemen üstünde; derinlik görünmez)
      const ns = p.dir === 'ns', len = p.len, w = p.w;
      const g = [box(ns ? w : len, 0.4, ns ? len : w, p.x, 0.3, p.z + (ns ? len / 2 - 8 : 0))];
      add(new THREE.Mesh(mergeGeometries(g), dark));
    } else if (p.type === 'lattice') {                                                         // kafes kule: dört köşe direği, her bölmede yatay kuşak ve çapraz
      const g = [], hw = p.w / 2, hd = p.d / 2, s = 0.45, nB = Math.max(1, Math.round(p.h / p.bay)), bay = p.h / nB;
      for (const [cx, cz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) g.push(box(s * 1.6, p.h, s * 1.6, p.x + cx, p.h / 2, p.z + cz));
      for (let i = 0; i <= nB; i++) {
        const y = i * bay; g.push(box(p.w, s, s, p.x, y, p.z - hd), box(p.w, s, s, p.x, y, p.z + hd), box(s, s, p.d, p.x - hw, y, p.z), box(s, s, p.d, p.x + hw, y, p.z));
        if (i < nB) {                                                                          // çapraz (dört yüz): yatık ince kutu
          const dg = Math.hypot(p.w, bay), ang = Math.atan2(bay, p.w);
          for (const zz of [-hd, hd]) { const b = new THREE.BoxGeometry(dg, s * 0.7, s * 0.7); b.rotateZ((i % 2 ? 1 : -1) * ang); b.translate(p.x, y + bay / 2, p.z + zz); g.push(b); }
          const dd = Math.hypot(p.d, bay), an2 = Math.atan2(bay, p.d);
          for (const xx of [-hw, hw]) { const b = new THREE.BoxGeometry(s * 0.7, s * 0.7, dd); b.rotateX((i % 2 ? -1 : 1) * an2); b.translate(p.x + xx, y + bay / 2, p.z); g.push(b); }
        }
      }
      if (p.arm) { const [dx, dz] = p.arm.dir; g.push(box(Math.abs(dx) * p.arm.len + 2, 2.4, Math.abs(dz) * p.arm.len + 2, p.x + dx * (hw + p.arm.len / 2), p.arm.y, p.z + dz * (hd + p.arm.len / 2))); }
      add(new THREE.Mesh(mergeGeometries(g), steel));
    } else if (p.type === 'mast') {                                                           // yıldırım kulesi / direk: daralan silindir, tepesi kırmızı-beyaz (uçuş engeli boyası)
      const y0 = p.y0 || 0, g = new THREE.CylinderGeometry(p.r1, p.r0, p.h, 10); g.translate(p.x, y0 + p.h / 2, p.z); add(new THREE.Mesh(g, white));
      const c = new THREE.CylinderGeometry(p.r1 * 1.15, p.r1 * 1.4, Math.min(12, p.h * 0.1), 10); c.translate(p.x, y0 + p.h - Math.min(6, p.h * 0.05), p.z); add(new THREE.Mesh(c, red));
    } else if (p.type === 'wire') {                                                           // katener tel: iki tepe arasında sarkan eğri (çizgi)
      const pts = []; const [ax, ay, az] = p.a, [bx, by, bz] = p.b, span = Math.hypot(bx - ax, bz - az);
      for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(ax + (bx - ax) * t, ay + (by - ay) * t - p.sag * span * 4 * t * (1 - t), az + (bz - az) * t)); }
      add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4a4c50 })));
    } else if (p.type === 'water') {                                                          // su kulesi: dört ayak + orta boru + tank
      const legH = p.h - p.tankH, g = [];
      for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const c = new THREE.CylinderGeometry(0.5, 0.7, legH, 8); c.translate(p.x + cx * p.tankR * 0.7, legH / 2, p.z + cz * p.tankR * 0.7); g.push(c); }
      const pipe = new THREE.CylinderGeometry(1.2, 1.2, legH, 10); pipe.translate(p.x, legH / 2, p.z); g.push(pipe);
      add(new THREE.Mesh(mergeGeometries(g), steel));
      const t = new THREE.CylinderGeometry(p.tankR, p.tankR * 0.85, p.tankH, 20); t.translate(p.x, legH + p.tankH / 2, p.z); add(new THREE.Mesh(t, white));
    } else if (p.type === 'box') {
      add(new THREE.Mesh(box(p.w, p.h, p.d, p.x, p.h / 2, p.z), new THREE.MeshLambertMaterial({ color: p.color || 0xcccccc })));
    }
  }
  return { group, parts };
}
