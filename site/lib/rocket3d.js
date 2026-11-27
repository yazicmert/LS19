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
