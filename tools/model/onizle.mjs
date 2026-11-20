// Yeni eklenen uydu modellerinin önizleme görüntüleri (PR'da gözle denetim için): web/models/sats/<anahtar>.glb, üç açıdan 1×3 şerit PNG.
// Girdi: .model-ara/uydu-yeni.json (tools/model/uydu.mjs yazar). Çıktı: .model-ara/onizleme/<anahtar>.png
// Tarayıcı: Playwright Chromium (CI: npx playwright install --with-deps chromium); başka bir Chromium için CHROMIUM=<yol>.
import fs from 'fs';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';
import { ROOT, ARA } from './ortak.mjs';

const yeni = fs.existsSync(path.join(ARA, 'uydu-yeni.json')) ? JSON.parse(fs.readFileSync(path.join(ARA, 'uydu-yeni.json'), 'utf8')) : [];
if (!yeni.length) { console.log('önizlenecek yeni uydu modeli yok'); process.exit(0); }
const CIK = path.join(ARA, 'onizleme'); fs.mkdirSync(CIK, { recursive: true });

const TUR = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.html': 'text/html' };
const sunucu = http.createServer((q, r) => {
  const p = path.join(ROOT, 'web', decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(path.join(ROOT, 'web')) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TUR[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(0, '127.0.0.1');
await new Promise((r) => sunucu.once('listening', r));
const kok = `http://127.0.0.1:${sunucu.address().port}/`;
fs.writeFileSync(path.join(ROOT, 'web/.onizle.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0b0f17">
<script type="importmap">{ "imports": { "three": "./lib/three.module.js", "three/addons/": "./lib/addons/" } }</script>
<script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.ciz = async (url) => {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(1200, 400); r.setClearColor(0x0b0f17); document.body.replaceChildren(r.domElement);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdde6ff, 0x30343c, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 4, 5); sc.add(d);
  const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url), o = g.scene; sc.add(o);
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), R = b.getSize(new THREE.Vector3()).length() / 2 || 1; o.position.sub(c);
  o.traverse((m) => { if (m.isMesh) for (const x of [].concat(m.material)) x.side = THREE.DoubleSide; });
  const cam = new THREE.PerspectiveCamera(35, 1, R / 100, R * 100), yon = [[1, 0.5, 1], [0, 0, 1], [1, 0, 0]];
  r.setScissorTest(true);
  yon.forEach((v, i) => { cam.position.set(...v).normalize().multiplyScalar(R * 3.2); cam.lookAt(0, 0, 0); r.setViewport(i * 400, 0, 400, 400); r.setScissor(i * 400, 0, 400, 400); r.render(sc, cam); });
  return r.domElement.toDataURL('image/png');
};
window.hazir = true;
</script>`);
const tarayici = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const sayfa = await tarayici.newPage();
await sayfa.goto(kok + '.onizle.html'); await sayfa.waitForFunction(() => window.hazir);
for (const e of yeni) {
  try {
    const url = await sayfa.evaluate((u) => window.ciz(u), kok + `models/sats/${e.anahtar}.glb`);
    fs.writeFileSync(path.join(CIK, e.anahtar + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('önizleme:', e.anahtar);
  } catch (er) { console.log('önizleme yapılamadı:', e.anahtar, er.message); }
}
await tarayici.close(); sunucu.close(); fs.rmSync(path.join(ROOT, 'web/.onizle.html'), { force: true });
