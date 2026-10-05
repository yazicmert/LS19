// Araç modelleri: NASA 3D Resources'tan türetilmiş GLB'ler (web/models/lander.glb, orb.glb, stage.glb; üretim: tools/apollo_modelleri.mjs). Çalıştırma: cd web && node test/test_vehmodels.js
//  1) GLB kapsayıcısı ve JSON: sürüm 2, parça uzunlukları, gerekli uzantılar (meshopt, niceleme, WebP), gömülü dokular
//  2) bütçeler: boyut ve üçgen sayısı (ilk açılışta indirilir)
//  3) sahne extras'ı (yerleşim sayıları: exitZ/exitR motor çanı çıkışı, rcsZ/rcsR iticiler halkası, len kademe boyu) ve modelin gerçek sınırlarıyla tutarlılığı (köşe nicelemesi çözülerek)
//  4) sahne kodu (scene.js) bu sayıları okur
import fs from 'fs';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const f = (x) => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(2));

function readGlb(name) {
  const b = fs.readFileSync(new URL(`../models/${name}.glb`, import.meta.url));
  const magic = b.readUInt32LE(0), version = b.readUInt32LE(4), total = b.readUInt32LE(8);
  const jl = b.readUInt32LE(12), jt = b.readUInt32LE(16);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bl = b.readUInt32LE(20 + jl), bt = b.readUInt32LE(24 + jl);
  return { size: b.length, magic, version, total, jt, bt, binEnd: 28 + jl + bl, json };
}

// model sınırları (metre): düğüm hiyerarşisi boyunca ötele/ölçekle (niceleme düğümlere ölçek+öteleme olarak yazılır), POSITION erişimcisinin min/max'ı int16 normalleştirilmiş
function bounds(json) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const walk = (i, T, S) => {
    const n = json.nodes[i];
    if (n.rotation && n.rotation.some((x, k) => Math.abs(x - [0, 0, 0, 1][k]) > 1e-9)) throw new Error('düğüm dönmesi beklenmiyordu');
    const t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1], T2 = T.map((v, k) => v + S[k] * t[k]), S2 = S.map((v, k) => v * s[k]);
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      const a = json.accessors[p.attributes.POSITION], norm = a.normalized ? (c) => Math.max(c / 32767, -1) : (c) => c;
      for (let k = 0; k < 3; k++) for (const c of [a.min[k], a.max[k]]) { const w = T2[k] + S2[k] * norm(c); lo[k] = Math.min(lo[k], w); hi[k] = Math.max(hi[k], w); }
    }
    for (const c of n.children || []) walk(c, T2, S2);
  };
  for (const r of json.scenes[0].nodes) walk(r, [0, 0, 0], [1, 1, 1]);
  return { lo, hi };
}
const triangles = (json) => json.meshes.reduce((t, m) => t + m.primitives.reduce((u, p) => u + (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3, 0), 0);

const ALLOWED = new Set(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp', 'KHR_materials_specular']);
const M = {};
for (const name of ['lander', 'orb', 'stage']) {
  const g = M[name] = readGlb(name), j = g.json, req = j.extensionsRequired || [];
  check(`${name}.glb: geçerli GLB 2.0 (parça uzunlukları dosya boyuyla tutarlı, JSON + ikili parça)`, g.magic === 0x46546C67 && g.version === 2 && g.total === g.size && g.jt === 0x4E4F534A && g.bt === 0x004E4942 && g.binEnd === g.size, `${g.size} bayt`);
  check(`${name}.glb: gerekli uzantılar yüklenebilir kümede (meshopt, niceleme, WebP)`, req.length > 0 && req.every((e) => ALLOWED.has(e)) && req.includes('EXT_meshopt_compression') && req.includes('KHR_mesh_quantization'), req.join(', '));
  check(`${name}.glb: dokular gömülü WebP (dış dosya yok); malzemeler var`, (j.images || []).every((im) => im.uri === undefined && im.mimeType === 'image/webp') && (j.buffers || []).every((b) => b.uri === undefined) && j.materials.length > 0, `${(j.images || []).length} doku, ${j.materials.length} malzeme`);
}
const tri = Object.fromEntries(Object.entries(M).map(([k, g]) => [k, triangles(g.json)])), sz = Object.fromEntries(Object.entries(M).map(([k, g]) => [k, g.size]));
check('üçgen bütçesi: iniş aracı ≤ 65.000, hizmet modülü ≤ 15.000, TLI kademesi ≤ 8.000', tri.lander > 20000 && tri.lander <= 65000 && tri.orb > 3000 && tri.orb <= 15000 && tri.stage > 1000 && tri.stage <= 8000, `${Math.round(tri.lander)} / ${Math.round(tri.orb)} / ${Math.round(tri.stage)}`);
check('indirme bütçesi: her model ≤ 700 kB, üçü toplam ≤ 0,8 MB', Math.max(...Object.values(sz)) <= 700e3 && Object.values(sz).reduce((a, b) => a + b, 0) <= 0.8e6, `${(sz.lander / 1e3).toFixed(0)} / ${(sz.orb / 1e3).toFixed(0)} / ${(sz.stage / 1e3).toFixed(0)} kB`);

// yerleşim sayıları ve sınırlar. Araç çerçevesi: y yukarı, motor çanı −y; iniş aracı ayak tabanı y = −2,9 m; Ay yörünge kademesi ve TLI kademesi üst yüzü y = 0
const X = Object.fromEntries(Object.entries(M).map(([k, g]) => [k, g.json.scenes[0].extras || {}])), B = Object.fromEntries(Object.entries(M).map(([k, g]) => [k, bounds(g.json)]));
const num = (o, keys) => keys.every((k) => Number.isFinite(o[k]));
check('extras: tüm kademelerde exitZ, exitR, rcsZ, rcsR sayı; Ay yörünge kademesinde len de var', num(X.lander, ['exitZ', 'exitR', 'rcsZ', 'rcsR']) && num(X.orb, ['exitZ', 'exitR', 'rcsZ', 'rcsR', 'len']) && num(X.stage, ['exitZ', 'exitR', 'rcsZ', 'rcsR']),
  JSON.stringify({ lander: X.lander, orb: X.orb, stage: X.stage }));
{
  const b = B.lander, h = b.hi[1] - b.lo[1];
  check('iniş aracı: ayak tabanı y = −2,9 m, ayaktan tepeye ≈ 4 m (fizik rolü 4,0 m), yarıçap ≤ 2,7 m; çan çıkışı ayak ile motor arasında', Math.abs(b.lo[1] + 2.9) < 0.05 && Math.abs(h - 4.0) < 0.3 && Math.max(b.hi[0], b.hi[2], -b.lo[0], -b.lo[2]) < 2.7 && X.lander.exitZ > -2.9 && X.lander.exitZ < 0 && X.lander.exitR > 0.2 && X.lander.exitR < 1.0,
    `y ${f(b.lo[1])}…${f(b.hi[1])} m (boy ${f(h)}), x ${f(b.lo[0])}…${f(b.hi[0])}, çıkış z ${X.lander.exitZ} m, yarıçap ${X.lander.exitR} m`);
}
{
  const b = B.orb, L = X.orb.len;
  check('Ay yörünge kademesi (hizmet modülü): üst yüz y = 0, motor çanı çıkışı modelin en altında, len ≈ gövde boyu + 0,15 m aralık, yarıçap ≤ 2,5 m', Math.abs(b.hi[1]) < 0.02 && Math.abs(X.orb.exitZ - b.lo[1]) < 0.05 && L > 3 && L < 6 && L < -b.lo[1] && Math.max(b.hi[0], b.hi[2], -b.lo[0], -b.lo[2]) < 2.5 && X.orb.exitR > 0.5 && X.orb.exitR < 1.5,
    `y ${f(b.lo[1])}…${f(b.hi[1])} m, çıkış z ${X.orb.exitZ}, len ${L}, çan yarıçapı ${X.orb.exitR}`);
}
{
  const b = B.stage;
  check('TLI kademesi (S-IVB): üst yüz y = 0, motor çanı çıkışı modelin en altında, yarıçap ≤ 2,5 m, RCS halkası kademenin içinde', Math.abs(b.hi[1]) < 0.05 && Math.abs(X.stage.exitZ - b.lo[1]) < 0.05 && Math.max(b.hi[0], b.hi[2], -b.lo[0], -b.lo[2]) < 2.5 && X.stage.rcsZ < 0 && X.stage.rcsZ > b.lo[1] && X.stage.rcsR > 1 && X.stage.rcsR < 3,
    `y ${f(b.lo[1])}…${f(b.hi[1])} m, çıkış z ${X.stage.exitZ}, RCS z ${X.stage.rcsZ}, yarıçap ${X.stage.rcsR}`);
}
// yığın: iniş aracı ayak tabanı (−2,9) + 0,15 m aralık = −3,05'te hizmet modülü başlar; TLI kademesi onun len'i kadar aşağıda (scene.js: stackTop = 3,05 + len). SPS çanı len'den uzundur: ucu TLI kademesinin içine girer (S-IVB'nin üst yüzü kapalıdır, çan görünmez)
{
  const top = 2.9 + 0.15, tliTop = top + X.orb.len, pen = -B.orb.lo[1] - X.orb.len, total = B.lander.hi[1] + tliTop - B.stage.lo[1];
  check('yığın (üstten alta LM / hizmet modülü / S-IVB): SPS çanı TLI kademesine en çok 3 m girer (kademe boyu içinde); toplam boy makul (12–30 m)', pen >= 0 && pen < 3 && pen < -B.stage.lo[1] && total > 12 && total < 30,
    `hizmet modülü ${top.toFixed(2)}…${(top + X.orb.len).toFixed(2)} m (çan ucu ${(top - B.orb.lo[1]).toFixed(2)} m: TLI kademesine ${pen.toFixed(2)} m girer), TLI kademesi ${tliTop.toFixed(2)}…${(tliTop - B.stage.lo[1]).toFixed(2)} m, toplam boy ${total.toFixed(1)} m`);
}
// sahne kodu bu sayıları okur ve yığını bunlarla kurar
{
  const src = fs.readFileSync(new URL('../js/scene.js', import.meta.url), 'utf8');
  check('scene.js: yerleşim sayıları sahne extras\'ından (userData) okunur; modeller meshopt çözücüyle yüklenir; yığın yerleşimi len\'e bağlı', ['exitZ', 'exitR', 'rcsZ', 'rcsR', 'len'].every((k) => src.includes(`'${k}'`)) && /userData/.test(src) && /setMeshoptDecoder/.test(src) && /this\.place\.orb\.len/.test(src));
  const mis = fs.readFileSync(new URL('../js/mission.js', import.meta.url), 'utf8');
  check('model dosyaları yüklenir: scene.js lander.glb, orb.glb ve stage.glb adlarını kullanır', ['lander.glb', 'orb.glb', 'stage.glb'].every((n) => src.includes(n)) && mis.length > 0);
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
