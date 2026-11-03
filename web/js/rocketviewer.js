// Roket bilgi kartının 3B görüntüleyicisi (tembel yüklenir: kart açılınca dinamik import). Kendi WebGL bağlamı yalnız kart açıkken yaşar; kapanınca serbest bırakılır.
// Resmî NASA modelleri (Saturn V, SLS Block 1) GLB olarak, diğerleri ölçüden çizim (rocketmodels.js makeLaunchVehicle). Model birimi metre, roket ekseni +Y, taban y = 0.
// Etkileşim: sürükle → döndür, tekerlek / iki parmak → yakınlaş; dokunulmazsa yavaşça kendi ekseninde döner. Yanında ölçek için 1,8 m'lik insan silueti.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeLaunchVehicle } from './rocketmodels.js';

export class RocketViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(40, 80, 60); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xaec3ff, 0.6); fill.position.set(-50, 20, -40); this.scene.add(fill);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
    this.az = 0.6; this.el = 0.12; this.dist = 1; this.h = 100; this.obj = null; this.idle = 0; this.loader = null;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; this.ground = ground; this.scene.add(ground);
    this.person = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.3, 4, 8), new THREE.MeshStandardMaterial({ color: 0xffb36b, roughness: 0.6 }));
    this.scene.add(this.person);
    // sürükle / tekerlek / kıstır
    const pts = new Map(); let pinch0 = null;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); this.idle = 0; });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const [x0, y0] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) this.zoom(pinch0 / d); pinch0 = d; return; }
      this.az -= (e.clientX - x0) * 0.008; this.el = Math.max(-0.2, Math.min(1.2, this.el + (e.clientY - y0) * 0.006)); this.idle = 0;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0015)); this.idle = 0; }, { passive: false });
    this.reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._t = performance.now();
    const loop = (t) => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }
  zoom(k) { this.dist = Math.max(0.12, Math.min(2.2, this.dist * k)); }
  // model: { kind: 'glb', file } | { kind: 'proc', key }; onState(metin) yükleme durumu
  async show(model, onState = () => {}) {
    const id = (this.loadId = (this.loadId || 0) + 1);
    if (this.obj) { this.scene.remove(this.obj); this.obj = null; }
    let o = null;
    try {
      if (model.kind === 'glb') {
        onState('Model yükleniyor…');
        this.loader = this.loader || new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        o = (await this.loader.loadAsync(model.file)).scene;
      } else o = makeLaunchVehicle(model.key);
    } catch (e) { if (id === this.loadId) onState('Model yüklenemedi'); return; }
    if (id !== this.loadId || !o || this.disposed) return;
    this.obj = o; this.scene.add(o);
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    this.h = s.y; this.w = Math.max(s.x, s.z);
    this.ground.scale.setScalar(Math.max(this.w * 1.6, this.h * 0.35));
    this.person.position.set(this.w / 2 + 3, 0.9, 0);
    this.dist = 1; this.el = 0.12; onState('');
  }
  frame(t) {
    const dt = Math.min(0.1, (t - this._t) / 1000); this._t = t; this.idle += dt;
    if (!this.reduce && this.idle > 2.5) this.az += dt * 0.25;                              // dokunulmazsa yavaş dönüş
    const c = this.canvas, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * this.r.getPixelRatio()) || c.height !== Math.round(h * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    const H = this.h, fov = this.cam.fov * Math.PI / 180, D = (H * 0.62) / Math.tan(fov / 2) * this.dist / Math.min(1, this.cam.aspect * 1.4);
    const tgt = new THREE.Vector3(0, H * 0.48, 0);
    this.cam.position.set(tgt.x + D * Math.cos(this.el) * Math.sin(this.az), tgt.y + D * Math.sin(this.el), tgt.z + D * Math.cos(this.el) * Math.cos(this.az));
    this.cam.near = Math.max(0.1, D / 200); this.cam.far = D * 10; this.cam.updateProjectionMatrix();
    this.cam.lookAt(tgt);
    this.r.render(this.scene, this.cam);
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { for (const k in x) if (x[k] && x[k].isTexture) x[k].dispose(); x.dispose(); }); });
    this.r.dispose(); this.r.forceContextLoss();
  }
}
