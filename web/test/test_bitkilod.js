// Kalkış sahnesi bitkileri: uzak biçimler ve kümeleme (js/osmnature.js farTreeGeo, splitByPx, OsmNature.lod) — Node 20+: cd web && node test/test_bitkilod.js
//  farTreeGeo: üçgen sayısı, dışa bakan yüzler, boyut tam biçime yakın, öznitelikler aynı (tek gölgelendirici programı);
//  splitByPx: ekrandaki boy eşiği, görüş alanı dışı (payıyla), değişmeyince 0; OsmNature.lod: tele ve geniş kamerada kümeler, ağlara doğru yazım.
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const THREE = await import('three');
const { farTreeGeo, treeGeo, splitByPx, FAR_PX, OsmNature } = await import('../js/osmnature.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

// 1) uzak biçimler
for (const [k, nt] of [['conifer', 4], ['broadleaf', 20], ['bush', 20]]) {
  const g = farTreeGeo(THREE, k), f = treeGeo(THREE, k), P = g.attributes.position.array; g.computeBoundingBox(); f.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3()); let inward = 0;
  for (let i = 0; i < P.length; i += 9) {
    const a = new THREE.Vector3(...P.slice(i, i + 3)), b = new THREE.Vector3(...P.slice(i + 3, i + 6)), d = new THREE.Vector3(...P.slice(i + 6, i + 9));
    if (b.clone().sub(a).cross(d.clone().sub(a)).dot(a.clone().add(b).add(d).multiplyScalar(1 / 3).sub(c)) <= 0) inward++;
  }
  const sg = g.boundingBox.getSize(new THREE.Vector3()), sf = f.boundingBox.getSize(new THREE.Vector3()), ratio = Math.max(sg.x / sf.x, sg.z / sf.z, sf.x / sg.x, sf.z / sg.z);
  const ft = f.attributes.position.count / 3;
  check(`${k}: uzak biçim ${nt} üçgen (tam ${ft}), yüzler dışa bakar, eni tam biçimin %${Math.round(100 / ratio)}–${Math.round(100 * ratio)}'i, tepesi aynı`, P.length / 9 === nt && nt < ft && inward === 0 && ratio < 1.6 && Math.abs(g.boundingBox.max.y - f.boundingBox.max.y) < 0.1);
  check(`${k}: öznitelikler tam biçimle aynı (konum, normal, renk)`, ['position', 'normal', 'color'].every((a) => g.attributes[a] && g.attributes[a].itemSize === f.attributes[a].itemSize) && Object.keys(g.attributes).length === Object.keys(f.attributes).length);
}

// 2) splitByPx
{
  const n = 5, S = { n, pos: new Float32Array([0, 5, 100, 0, 5, 1000, 0, 5, 5000, -300, 5, 1000, 3, 5, 1000]), h: new Float32Array([10, 10, 10, 10, 10]), st: new Uint8Array(n) };
  const K = 1000;                                                                    // 10 m ağaç: 100 m'de 100 px, 1 km'de 10 px, 5 km'de 2 px
  const ch = splitByPx(S, [0, 5, 0], K, null);
  check('splitByPx: ekrandaki boy eşiğin altındaysa uzak (100 m: 100 px yakın, 5 km: 2 px uzak)', S.st[0] === 0 && S.st[1] === 0 && S.st[2] === 1 && ch === 1, Array.from(S.st).join(''));
  check('splitByPx: değişmeyince 0 döner (ekran kartına yeniden yükleme yok)', splitByPx(S, [0, 5, 0], K, null) === 0);
  const planes = [{ x: 1, y: 0, z: 0, w: 0 }];                                       // görüş alanı x ≥ 0
  splitByPx(S, [0, 5, 0], K, planes, 0, 0);
  check('splitByPx: görüş alanı dışı çizilmez (x = −300), sınırdaki ve içteki kalır', S.st[3] === 2 && S.st[1] === 0 && S.st[4] === 0);
  const T = { n: 1, pos: new Float32Array([-12, 5, 1000]), h: new Float32Array([10]), st: new Uint8Array(1) };
  splitByPx(T, [0, 5, 0], K, planes, 0, 0); const out = T.st[0];
  splitByPx(T, [0, 5, 0], K, planes, 5, 0); const mv = T.st[0];
  splitByPx(T, [0, 5, 0], K, planes, 0, 0.01); const an = T.st[0];
  check('splitByPx: pay — taç yarıçapı (0,8 boy) yetmezse dışarıda; yer değiştirme (5 m) ya da dönme (0,01 rad × 1 km) payıyla kalır', out === 2 && mv === 0 && an === 0);
}

// 3) OsmNature: kurulum + lod (gerçek kamera)
{
  const pad = new THREE.Group(); pad.updateMatrixWorld(true);
  const N = new OsmNature(THREE, pad, { lat: 28.6, lon: -80.6 });
  const plants = []; let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) { const a = rnd() * 2 * Math.PI, r = 50 + rnd() * 4000; plants.push({ x: r * Math.cos(a), z: r * Math.sin(a), s: rnd(), v: rnd(), kind: i % 3 ? 'wood' : 'scrub', cone: i % 2 === 0 }); }
  N.plants = plants; N.build(null);
  const total = N.sets.reduce((a, S) => a + S.n, 0);
  check('kurulum: her tür iki ağ (yakın + uzak), aynı malzeme; başta hepsi yakın', N.sets.length === 3 && N.sets.every((S) => S.near.material === S.farM.material && S.near.count === S.n && S.farM.count === 0) && total === 3000);
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1e6); cam.position.set(0, 2, 0); cam.lookAt(0, 2, -1); cam.updateMatrixWorld(true);
  N.lod(cam, 800);
  const cnt = () => N.sets.reduce((a, S) => [a[0] + S.near.count, a[1] + S.farM.count, a[2] + S.st.reduce((x, v) => x + (v === 2), 0)], [0, 0, 0]);
  const [nw, fw, hw] = cnt();
  check('geniş kamera (50°): arkadakiler çizilmez, uzaktakiler uzak biçimde', hw > 1500 && fw > nw && nw + fw + hw === 3000, `yakın ${nw}, uzak ${fw}, çizilmeyen ${hw}`);
  // ağlara yazım: yakın ağın ilk örneği, kümesi 0 olan ilk bitkinin matrisi
  const S0 = N.sets.find((S) => S.near.count > 0), i0 = S0.st.indexOf(0);
  check('yakın ağa yazılan matris ve renk, bitkinin kendi verisi', Array.from(S0.near.instanceMatrix.array.slice(0, 16)).every((v, k) => v === S0.mat[16 * i0 + k]) && Array.from(S0.near.instanceColor.array.slice(0, 3)).every((v, k) => v === S0.col[3 * i0 + k]));
  const key = N.lodKey; N.lod(cam, 800);
  check('kamera kıpırdamazsa yeniden dağıtılmaz', N.lodKey === key);
  cam.fov = 4.5; cam.updateProjectionMatrix(); N.lod(cam, 800);
  const [nt, ft, ht] = cnt();
  check('tele kamera (4,5°): bitkilerin çoğu kadraj dışında, kadrajdakiler büyük görünür (yakın)', ht > 2700 && nt >= ft, `yakın ${nt}, uzak ${ft}, çizilmeyen ${ht}`);
  check('eşik FAR_PX = 8 piksel', FAR_PX === 8);
}

if (fail) { console.log(`\n${fail} hata`); process.exit(1); }
console.log('\nTüm bitki ayrıntı düzeyi denetimleri geçti');
