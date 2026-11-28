// roketin ölçülerden 3B çizimi (GCAT: aracın boyu ve çapı, kademelerin boyu, çapı ve çokluğu). Gerçek bir model değil: dönel gövdeler.
// Ana gövde 1. kademeden yukarı istiflenir; çap değişen yerde ara kademe konisi; en üstte burun kaportası (aracın boyundan kalan uzunluk,
// en az 1,2 çap; kaporta çapı aracın çapı ya da üst kademeninki, büyük olan). Çokluğu olan 0. kademe yan iticidir, gövdenin çevresine dizilir.
// Birim metre, eksen +Y, taban y = 0. THREE dışarıdan verilir (bileşen three'yi tembel yükler).
export function rocketLayout(spec) {
  const D = spec.diameter || 3, core = spec.stages.filter((s) => /^[1-9]$/.test(s.no)).sort((a, b) => +a.no - +b.no);
  const boost = spec.stages.find((s) => s.no === '0' && s.mult > 1) || spec.stages.find((s) => s.no === '0');
  const segs = []; let y = 0, known = core.reduce((n, s) => n + (s.length || 0), 0);
  const missing = core.filter((s) => !s.length).length, fill = missing ? Math.max((spec.length - known - 1.5 * D) / missing, D) : 0;
  for (const s of core) {
    const d = s.diameter || D, l = s.length || fill, prev = segs[segs.length - 1];
    if (prev && Math.abs(prev.d - d) > 0.05) { const h = Math.min(Math.abs(prev.d - d) * 0.8, 2.5); segs.push({ kind: 'inter', y, l: h, d0: prev.d, d1: d }); y += h; }
    segs.push({ kind: 'stage', no: s.no, y, l, d }); y += l;
  }
  const top = segs[segs.length - 1].d, fd = Math.max(D, top), rest = (spec.length || y + 2 * fd) - y;
  if (fd - top > 0.05) { const h = Math.min((fd - top) * 0.6, 1.5); segs.push({ kind: 'inter', y, l: h, d0: top, d1: fd }); y += h; }
  const fl = Math.max(rest - (fd - top > 0.05 ? Math.min((fd - top) * 0.6, 1.5) : 0), 1.2 * fd);
  segs.push({ kind: 'fairing', y, l: fl, d: fd }); y += fl;
  const n = boost ? Math.max(boost.mult || 1, 1) : 0, bd = boost ? boost.diameter || D * 0.5 : 0, bl = boost ? boost.length || spec.length * 0.35 : 0;
  const coreR = (core[0] && core[0].diameter ? core[0].diameter : D) / 2;
  const boosters = n && boost ? Array.from({ length: n }, (_, k) => ({ a: (k / n) * Math.PI * 2 + (n === 2 ? 0 : Math.PI / 4), r: coreR + bd / 2 + 0.05, d: bd, l: bl })) : [];
  return { segs, boosters, height: y, engines: core[0] && core[0].neng ? core[0].neng : 1 };
}

export function buildRocket(THREE, spec) {
  const L = rocketLayout(spec), g = new THREE.Group();
  const M = (color, rough = 0.55, metal = 0.05) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide });
  const white = M(0xeceae4), band = M(0x2c2f34, 0.6, 0.2), boostM = M(0xdedcd5), bell = M(0x3a3d42, 0.45, 0.6);
  const lathe = (pts, mat, x = 0, z = 0, y0 = 0) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-3), y)), 48), mat);
    m.position.set(x, y0, z); g.add(m); return m;
  };
  const ogive = (r, len, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const s = i / n; return [r * Math.sqrt(Math.max(1 - s * s, 0)) * (1 - 0.06 * s), len * s]; });
  for (const s of L.segs) {
    if (s.kind === 'stage') lathe([[s.d / 2, 0], [s.d / 2, s.l]], white, 0, 0, s.y);
    else if (s.kind === 'inter') lathe([[s.d0 / 2, 0], [s.d1 / 2, s.l]], band, 0, 0, s.y);
    else lathe([[s.d / 2, 0], [s.d / 2, s.l * 0.42], ...ogive(s.d / 2, s.l * 0.58).map(([r, y]) => [r, s.l * 0.42 + y])], white, 0, 0, s.y);
  }
  // kademe ayrım çizgileri (ince koyu bant)
  for (const s of L.segs.filter((x) => x.kind === 'stage').slice(1)) lathe([[s.d / 2 + 0.01, 0], [s.d / 2 + 0.01, Math.min(0.35, s.l * 0.05)]], band, 0, 0, s.y);
  // ana motor çanları (sayı: 1. kademe motor sayısı; çok motorda halka)
  const d0 = L.segs[0].d, ne = Math.min(L.engines, 9), br = Math.min(d0 / (ne > 1 ? 4.2 : 2.6), 1.2);
  for (let k = 0; k < ne; k++) {
    const a = (k / Math.max(ne - 1, 1)) * Math.PI * 2, rr = ne > 1 ? (k === 0 ? 0 : d0 * 0.3) : 0;
    lathe([[br * 0.35, 0], [br, -br * 1.4]].reverse().map(([r, y]) => [r, y]), bell, rr * Math.cos(a), rr * Math.sin(a), 0);
  }
  for (const b of L.boosters) {
    const x = Math.cos(b.a) * b.r, z = Math.sin(b.a) * b.r;
    lathe([[b.d / 2, 0], [b.d / 2, b.l * 0.86], ...ogive(b.d / 2, b.l * 0.14).map(([r, y]) => [r, b.l * 0.86 + y])], boostM, x, z, 0);
    lathe([[b.d * 0.18, 0], [b.d * 0.4, -b.d * 0.7]].reverse(), bell, x, z, 0);
  }
  return g;
}

// ——— kademe ayırma ve kesit görünümü (components/RocketExplorer.jsx) ———
// Parçalar: her kademe (çap değişimindeki ara koni üstteki kademeyle gider), kaporta ve yan iticiler. Saf hesaplar Node'da sınanır.
export function rocketPieces(L) {
  const out = []; let pend = [];
  for (const s of L.segs) {
    if (s.kind === 'inter') { pend.push(s); continue; }
    out.push({ key: s.kind === 'fairing' ? 'F' : s.no, segs: [...pend, s], y0: (pend[0] || s).y, y1: s.y + s.l }); pend = [];
  }
  return out;
}
// ayrık görünüm: parça başına dikey kayma (alttan üste artar) ve yan iticilerin dışa kayması; on = 0..1 (canlandırma oranı)
export function explodeOffsets(L, on = 1) {
  const P = rocketPieces(L), D = L.segs[0].d, gap = Math.max(0.06 * L.height, 0.9 * D) * on;
  const bd = L.boosters[0] ? L.boosters[0].d : 0;
  return { pieces: P.map((p, k) => ({ key: p.key, dy: k * gap })), booster: L.boosters.length ? (bd * 1.6 + D * 0.4) * on : 0, height: L.height + (P.length - 1) * gap };
}
// kademenin çizimdeki ölçüsü: yan itici için itici, ötekiler için yığındaki kademe parçası
export function stageSeg(L, key) {
  if (key === '0' && L.boosters.length) return { l: L.boosters[0].l, d: L.boosters[0].d, y: 0 };
  return L.segs.find((s) => s.kind === 'stage' && s.no === key) || null;
}

// görsel varsayım (şematik): iki sıvılı kademede oksitleyici tankının boy payı yoğunluk farkını kabaca yansıtır; ölçek değildir
const OX_SHARE = { 'LOX/LH2': 0.36, 'LOX/Methane': 0.55, 'LOX/Kero': 0.58, 'LOX/Propane': 0.55 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ringAng = (k, n) => (k / n) * Math.PI * 2 + Math.PI / 4;
// kademenin iç parçaları, kademenin kendi ekseninde (taban y = 0, tepe y = l, yarıçap R). Çanlar ve dış parçalar (kanat, bacak) dışarıda olabilir;
// tanklar, yakıt bloğu ve besleme hattı kademe gövdesinin içinde kalır (test_site.js denetler).
export function stageInternals(st, seg) {
  const l = seg.l, R = seg.d / 2, P = [], has = (id) => st.parts.find((p) => p.id === id);
  const inter = has('interstage') ? Math.min(0.15 * l, 2 * seg.d) : 0;
  const hb = clamp(0.1 * l, 0.25 * R, 1.2 * R), ht = clamp(0.05 * l, 0.12 * R, 0.8 * R);
  const yb = Math.min(hb, l * 0.3), yt = Math.max(l - ht - inter, yb + Math.min(0.4 * R, l * 0.4));
  if (inter) P.push({ id: 'interstage', kind: 'band', y0: l - inter, y1: l, r: R * 1.004 });
  if (st.cls === 'liquid' || st.cls === 'mono' || st.cls === 'hybrid') {
    const center = st.feed.kind === 'center', rt = (center ? 0.95 : 0.86) * R;
    const span = yt - yb, dh = Math.min(0.5 * rt, span * 0.14);
    const oxTop = st.tanks.order !== 'fuel-top';
    const share = st.cls === 'mono' ? 1 : st.cls === 'hybrid' ? 0.4 : (OX_SHARE[st.eng && st.eng.group] ?? 0.55);
    const topShare = oxTop ? share : 1 - share, topId = oxTop ? 'tank-ox' : 'tank-fuel', botId = oxTop ? 'tank-fuel' : 'tank-ox';
    if (st.cls === 'mono') P.push({ id: 'tank-fuel', kind: 'tank', y0: yb + dh, y1: yt - dh, r: rt, dBot: dh, dTop: dh });
    else if (st.cls === 'hybrid') {
      const ym = yt - span * share;
      P.push({ id: 'tank-ox', kind: 'tank', y0: ym + dh, y1: yt - dh, r: rt, dBot: dh, dTop: dh });
      P.push({ id: 'grain', kind: 'grain', y0: yb, y1: ym - dh * 0.4, r: rt, rIn: 0.32 * R });
    } else if (st.tanks.kind === 'common') {
      const cyl0 = yb + dh, cyl1 = yt - dh, ym = cyl1 - (cyl1 - cyl0) * topShare;
      P.push({ id: topId, kind: 'tank', y0: ym, y1: cyl1, r: rt, dBot: dh, dTop: dh });
      P.push({ id: botId, kind: 'tank', y0: cyl0, y1: ym, r: rt, dBot: dh, dTop: -dh });
      P.push({ id: 'bulkhead', kind: 'dome', y: ym, r: rt * 1.001, h: -dh });
    } else {
      const g = Math.max(0.5 * dh, 0.05 * span), avail = Math.max(span - 4 * dh - g, 0), ym = yb + 2 * dh + avail * (1 - topShare);
      P.push({ id: botId, kind: 'tank', y0: yb + dh, y1: ym, r: rt, dBot: dh, dTop: dh });
      P.push({ id: topId, kind: 'tank', y0: ym + g + 2 * dh, y1: Math.max(yt - dh, ym + g + 2 * dh), r: rt, dBot: dh, dTop: dh });
      if (st.tanks.kind === 'separate') P.push({ id: 'intertank', kind: 'band', y0: ym, y1: ym + g + 2 * dh, r: R * 1.004 });
    }
    if (st.cls !== 'mono') {
      const upper = P.find((p) => p.id === (st.cls === 'hybrid' ? 'tank-ox' : topId)), top = upper.y0 - Math.abs(upper.dBot) * 0.5;
      const rf = center ? 0 : (rt + R) / 2;                // yandaki hat kesit açıklığından görünsün diye kameraya dönük yanda
      P.push({ id: 'feed', kind: 'pipe', x: rf * Math.sin(0.6), z: rf * Math.cos(0.6), y0: yb * 0.45, y1: top, r: Math.max(0.035 * R, 0.02) });
    }
  }
  if (st.cls === 'solid') {
    P.push({ id: 'case', kind: 'band', y0: 0.02 * l, y1: 0.98 * l, r: R * 1.004 });
    P.push({ id: 'grain', kind: 'grain', y0: Math.min(0.06 * l, R), y1: l - Math.min(0.08 * l, 1.2 * R), r: 0.93 * R, rIn: 0.3 * R });
  }
  // motorlar: halkalar içten dışa; çan yarıçapı en dış halkaya ve iç halkaların aralığına sığacak biçimde
  const bells = [], vac = st.no !== '0' && st.no !== '1';
  if (st.cls === 'solid') bells.push({ x: 0, z: 0, r: 0.38 * R, len: 0.95 * R, vac: false });
  else {
    const rings = st.rings, Rb = 0.93 * R, nr = rings.length, outer = rings[nr - 1];
    const s1 = (c) => Math.sin(Math.PI / Math.max(c, 2));
    let b = outer === 1 ? (vac ? 0.55 : 0.42) * R : Math.min(((Rb * s1(outer)) / (1 + s1(outer))) * 0.94, 0.45 * R);
    const ro = outer === 1 ? 0 : Rb - b;
    const rad = rings.map((c, j) => (rings[0] === 1 ? (nr === 1 ? 0 : (ro * j) / (nr - 1)) : (ro * (j + 1)) / nr));
    rings.forEach((c, j) => { if (c > 1 && rad[j] > 0) b = Math.min(b, rad[j] * s1(c) * 0.94); });
    rings.forEach((c, j) => {
      const v = st.ringsVac ? !!st.ringsVac[j] : vac;
      // vakum çanı (kaynakta ayrı halka olarak verilmişse) daha geniş ve uzun; halka aralığını aşmaz
      const bb = st.ringsVac && v ? Math.min(b * 1.5, rad[j] ? rad[j] * s1(c) * 0.98 : b * 1.5) : b;
      for (let k = 0; k < c; k++) {
        const a = (k / c) * Math.PI * 2 + (j % 2 ? Math.PI / c : 0);
        bells.push({ x: rad[j] * Math.cos(a), z: rad[j] * Math.sin(a), r: bb, len: (v ? 3.1 : 2.2) * bb, vac: v });
      }
    });
  }
  P.push({ id: st.cls === 'solid' ? 'nozzle' : 'engines', kind: 'bells', items: bells });
  const gf = has('gridfins'); if (gf && gf.n) P.push({ id: 'gridfins', kind: 'panels', n: gf.n, y: (inter ? l - inter : l * 0.94) - 0.35 * R, w: 0.55 * R, h: 0.6 * R, out: R * 1.28, grid: true });
  const fn = has('fins'); if (fn && fn.n) P.push({ id: 'fins', kind: 'panels', n: fn.n, y: l * 0.92 - 0.5 * R, w: 0.5 * R, h: 0.9 * R, out: R * 1.25, grid: false });
  const lg = has('legs'); if (lg && lg.n) P.push({ id: 'legs', kind: 'legs', n: lg.n, y0: -0.1 * R, y1: Math.min(0.24 * l, 4.5 * R), r: R * 1.06 });
  if (has('apu')) P.push({ id: 'apu', kind: 'box', x: 0.55 * R, z: -0.25 * R, y: yb * 0.55, s: 0.28 * R });
  const rc = has('rcs'); if (rc && rc.n) P.push({ id: 'rcs', kind: 'pods', n: rc.n, y: l * 0.5, r: R * 0.97, s: Math.min(0.18 * R, l * 0.3) });
  const vn = has('verniers'); if (vn && vn.n) P.push({ id: 'verniers', kind: 'bells', items: Array.from({ length: vn.n }, (_, k) => ({ x: 0.72 * R * Math.cos(Math.PI / 2 + (k * 2 * Math.PI) / vn.n), z: 0.72 * R * Math.sin(Math.PI / 2 + (k * 2 * Math.PI) / vn.n), r: 0.12 * R, len: 0.3 * R, vac: false })) });
  const af = has('aerofins'); if (af && af.n) P.push({ id: 'aerofins', kind: 'fin', n: af.n, y0: 0.02 * l, y1: Math.min(0.2 * l, 3 * R), r: R, span: 0.7 * R });
  return P;
}

// ——— three.js yapımı (THREE dışarıdan verilir) ———
export const RK_COLORS = { shell: 0xeceae4, band: 0x2c2f34, ox: 0x8fb4e3, fuel: 0xe0b25c, solid: 0xc49a66, metal: 0x3a3d42, pipe: 0x9aa0a8, part: 0x5b6068, bulk: 0xb07a4a };
export const PART_COLOR = { 'tank-ox': 'ox', 'tank-fuel': 'fuel', grain: 'solid', bulkhead: 'bulk', feed: 'pipe', engines: 'metal', nozzle: 'metal', verniers: 'metal', interstage: 'band', intertank: 'band', case: 'band', gridfins: 'part', fins: 'part', legs: 'part', apu: 'part', rcs: 'part', aerofins: 'part', strakes: 'part' };
const ellipse = (r, h, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = ((i / n) * Math.PI) / 2; return [r * Math.cos(t), h * Math.sin(t)]; }); // (r,0) → (0,h)
const ogive = (r, len, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const s = i / n; return [r * Math.sqrt(Math.max(1 - s * s, 0)) * (1 - 0.06 * s), len * s]; });

// dönel gövde; cut > 0 ise kesit açıklığı (radyan) +Z yönüne bakar (LatheGeometry'de açı 0 = +Z)
function latheGeo(THREE, pts, cut = 0, seg = 48) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, cut / 2, Math.PI * 2 - cut);
}
// iç parçalar: her ağ userData.part taşır (tıklama ve vurgulama için)
export function buildInternals(THREE, st, seg, cut = Math.PI * 0.7) {
  const g = new THREE.Group(), P = stageInternals(st, seg), mats = {};
  const mat = (id) => {
    if (!mats[id]) mats[id] = new THREE.MeshStandardMaterial({ color: RK_COLORS[PART_COLOR[id] || 'part'], roughness: 0.6, metalness: ['engines', 'nozzle', 'verniers', 'feed'].includes(id) ? 0.55 : 0.08, side: THREE.DoubleSide });
    return mats[id];
  };
  const add = (geo, id, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat(id)); m.position.set(x, y, z); m.userData.part = id; g.add(m); return m; };
  for (const p of P) {
    if (p.kind === 'tank') {
      const bot = (p.dBot >= 0 ? ellipse(p.r, p.dBot).map(([r, y]) => [r, p.y0 - y]) : ellipse(p.r, -p.dBot).map(([r, y]) => [r, p.y0 + y])).reverse();
      const top = p.dTop >= 0 ? ellipse(p.r, p.dTop).map(([r, y]) => [r, p.y1 + y]) : ellipse(p.r, -p.dTop).map(([r, y]) => [r, p.y1 - y]);
      add(latheGeo(THREE, [...bot, ...top], cut), p.id);
    } else if (p.kind === 'dome') add(latheGeo(THREE, ellipse(p.r, Math.abs(p.h)).map(([r, y]) => [r, p.y + Math.sign(p.h) * y]), cut), p.id);
    else if (p.kind === 'band') { if (p.id !== 'case') add(latheGeo(THREE, [[p.r, p.y0], [p.r, p.y1]], p.id === 'interstage' ? 0 : cut), p.id); } // ara kademe dışarıdan da görünür: tam halka
    else if (p.kind === 'pipe') add(new THREE.CylinderGeometry(p.r, p.r, p.y1 - p.y0, 12), p.id, p.x, (p.y0 + p.y1) / 2, p.z);
    else if (p.kind === 'grain') {
      add(latheGeo(THREE, [[p.rIn, p.y0], [p.r, p.y0], [p.r, p.y1], [p.rIn, p.y1], [p.rIn, p.y0]], cut), p.id);
      for (const a of [cut / 2, -cut / 2]) {            // kesit yüzleri: yakıt bloğunun kesiti görünsün
        const rm = (p.r + p.rIn) / 2, cap = add(new THREE.PlaneGeometry(p.r - p.rIn, p.y1 - p.y0), p.id, rm * Math.sin(a), (p.y0 + p.y1) / 2, rm * Math.cos(a));
        cap.rotation.y = a + Math.PI / 2;
      }
    } else if (p.kind === 'bells') {
      for (const b of p.items) {
        const prof = [[b.r * 0.4, b.r * 0.55], [b.r * 0.42, 0.02], [b.r * 0.3, -b.len * 0.12], ...Array.from({ length: 6 }, (_, i) => { const s = (i + 1) / 6; return [b.r * (0.3 + 0.7 * Math.sqrt(s)), -b.len * (0.12 + 0.88 * s)]; })];
        add(latheGeo(THREE, prof, 0, 24), p.id, b.x, 0, b.z);
      }
    } else if (p.kind === 'panels') {
      for (let k = 0; k < p.n; k++) {
        const a = ringAng(k, p.n), m = add(new THREE.BoxGeometry(p.w, p.h, p.grid ? p.w * 0.12 : p.w * 0.06), p.id, Math.cos(a) * p.out, p.y, Math.sin(a) * p.out);
        m.rotation.y = -a + Math.PI / 2;
      }
    } else if (p.kind === 'legs') {
      for (let k = 0; k < p.n; k++) {
        const a = ringAng(k, p.n), len = p.y1 - p.y0, m = add(new THREE.BoxGeometry(seg.d * 0.08, len, seg.d * 0.05), p.id, Math.cos(a) * p.r, p.y0 + len / 2, Math.sin(a) * p.r);
        m.rotation.y = -a;
      }
    } else if (p.kind === 'box') add(new THREE.BoxGeometry(p.s, p.s * 0.7, p.s), p.id, p.x, p.y, p.z);
    else if (p.kind === 'pods') for (let k = 0; k < p.n; k++) { const a = Math.PI / 2 + (k / p.n) * Math.PI * 2; add(new THREE.BoxGeometry(p.s, p.s * 1.4, p.s), p.id, Math.cos(a) * p.r, p.y, Math.sin(a) * p.r); }
    else if (p.kind === 'fin') {
      const sh = new THREE.Shape(); sh.moveTo(0, p.y0); sh.lineTo(p.span, p.y0); sh.lineTo(p.span * 0.35, p.y1); sh.lineTo(0, p.y1); sh.closePath();
      add(new THREE.ExtrudeGeometry(sh, { depth: seg.d * 0.04, bevelEnabled: false }), p.id, p.r * 0.98, 0, -seg.d * 0.02);
    }
  }
  return { group: g, prims: P };
}
// dış kabuk: kademe, ara koni ya da kaporta (parçanın tabanı y = 0); kesit açıklığıyla da çizilir. Her parçanın kendi malzemesi (vurgu için)
export function buildPieceShell(THREE, piece, cut = 0) {
  const g = new THREE.Group(), base = piece.y0;
  const shell = new THREE.MeshStandardMaterial({ color: RK_COLORS.shell, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const band = new THREE.MeshStandardMaterial({ color: RK_COLORS.band, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  for (const s of piece.segs) {
    let m;
    if (s.kind === 'stage') m = new THREE.Mesh(latheGeo(THREE, [[s.d / 2, 0], [s.d / 2, s.l]], cut), shell);
    else if (s.kind === 'inter') m = new THREE.Mesh(latheGeo(THREE, [[s.d0 / 2, 0], [s.d1 / 2, s.l]], cut), band);
    else m = new THREE.Mesh(latheGeo(THREE, [[s.d / 2, 0], [s.d / 2, s.l * 0.42], ...ogive(s.d / 2, s.l * 0.58).map(([r, y]) => [r, s.l * 0.42 + y])], cut), shell);
    m.position.y = s.y - base; m.userData.stage = piece.key; g.add(m);
    if (s.kind === 'stage' && s.no !== '1' && !cut) {
      const b = new THREE.Mesh(latheGeo(THREE, [[s.d / 2 + 0.01, 0], [s.d / 2 + 0.01, Math.min(0.35, s.l * 0.05)]]), band);
      b.position.y = s.y - base; b.userData.stage = piece.key; g.add(b);
    }
  }
  return { group: g, materials: [shell, band] };
}
export function buildBoosterShell(THREE, b, cut = 0) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xdedcd5, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const m = new THREE.Mesh(latheGeo(THREE, [[b.d / 2, 0], [b.d / 2, b.l * 0.86], ...ogive(b.d / 2, b.l * 0.14).map(([r, y]) => [r, b.l * 0.86 + y])], cut), mat);
  m.userData.stage = '0'; g.add(m);
  return { group: g, materials: [mat] };
}
