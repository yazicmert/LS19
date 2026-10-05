// LS19 sinematik son işlem hattı (yalnız sinematik kipte kurulur ve çalışır): HDR sahne (MSAA) → bloom → anamorfik çizgi parlama → ton eşleme (OutputPass) → film (vinyet, tane, renk, kromatik sapma).
// three r170 eklentileri (lib/addons/postprocessing) ilk kullanımda içe aktarılır: normal görünümün yüklenmesini yavaşlatmaz.
// Kare süresine göre kalite düşer (yüksek → orta → düşük): MSAA/çizgi parlama kapanır, piksel oranı iner, sonunda son işlem tamamen bırakılır.
import * as THREE from 'three';

const FILM = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, aspect: { value: 1 }, vignette: { value: 0.5 }, grain: { value: 0.045 }, chroma: { value: 0.0016 }, contrast: { value: 0.22 }, fade: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float time, aspect, vignette, grain, chroma, contrast, fade; varying vec2 vUv;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec2 c = vUv - 0.5, ca = c * vec2(aspect, 1.0); float r2 = dot(ca, ca);
      vec2 off = c * chroma * (0.35 + 2.2 * r2);                                    // kromatik sapma: kenara doğru artar
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = mix(col, col * col * (3.0 - 2.0 * col), contrast);                      // hafif S eğrisi (gösterim uzayında)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(1.0), vec3(1.035, 1.0, 0.95), smoothstep(0.45, 1.0, l) * 0.6); // sıcak parlak alanlar
      col *= mix(vec3(1.0), vec3(0.93, 0.985, 1.07), (1.0 - smoothstep(0.0, 0.4, l)) * 0.6);   // soğuk gölgeler
      col *= 1.0 - vignette * smoothstep(0.12, 0.75, r2 * 1.6);
      col += (h21(vUv * res + fract(time * 7.13) * 97.0) - 0.5) * grain * (0.4 + 0.6 * (1.0 - l));     // film tanesi: karanlıkta belirgin
      gl_FragColor = vec4(col * (1.0 - fade), 1.0);
    }`,
};

export class Post {
  static async create(renderer, scene, camera, opts = {}) {
    const [EC, RP, SP, UB, OP, PS, CS] = await Promise.all([import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/Pass.js'), import('three/addons/shaders/CopyShader.js')]);
    return new Post({ EffectComposer: EC.EffectComposer, ShaderPass: SP.ShaderPass, UnrealBloomPass: UB.UnrealBloomPass, OutputPass: OP.OutputPass, Pass: PS.Pass, FullScreenQuad: PS.FullScreenQuad, CopyShader: CS.CopyShader }, renderer, scene, camera, opts);
  }

  constructor(M, renderer, scene, camera, opts) {
    this.M = M; this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.level = opts.level || 'high'; this.prMax = opts.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = 1; this.h = 1; this.t = 0; this.ema = 16; this.slow = 0; this.fast = 0; this.onLevel = opts.onLevel || null;
    this.build();
  }

  build() {
    const M = this.M, r = this.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    const W = Math.max(2, Math.round(size.x * pr)), H = Math.max(2, Math.round(size.y * pr));
    this.dispose(true);
    const composer = this.composer = new M.EffectComposer(r, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }));
    composer.setPixelRatio(1); composer.setSize(W, H);
    // sahne: MSAA'lı ayrı HDR hedef (ortadaki hedefler MSAA'sız: bellek ve süre); sonuç kompozitörün okuma hedefine kopyalanır
    const self = this, high = this.level === 'high';
    class ScenePass extends M.Pass {
      constructor() { super(); this.needsSwap = true; this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: high ? 4 : 0 }); this.quad = new M.FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(M.CopyShader.uniforms), vertexShader: M.CopyShader.vertexShader, fragmentShader: M.CopyShader.fragmentShader, depthTest: false, depthWrite: false })); }
      setSize(w, h) { this.rt.setSize(w, h); }
      render(renderer, writeBuffer) {
        renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(self.scene, self.camera);
        this.quad.material.uniforms.tDiffuse.value = this.rt.texture; renderer.setRenderTarget(writeBuffer); this.quad.render(renderer);
      }
      dispose() { this.rt.dispose(); this.quad.dispose(); }
    }
    this.scenePass = new ScenePass(); composer.addPass(this.scenePass);
    this.bloom = new M.UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.7, 2.0); composer.addPass(this.bloom);
    if (high) {                                                      // anamorfik çizgi parlama: yatay çok geniş, dikey dar; yalnız çok parlak noktalar (Güneş, plüm çekirdeği, ışıltı)
      const sb = this.streak = new M.UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.92, 4.5);
      const stretch = (rx, ry) => { for (let i = 0; i < sb.nMips; i++) { const v = sb.separableBlurMaterials[i].uniforms.invSize.value; v.set(v.x * 3.4, v.y * 0.4); } };
      stretch(); const ss = sb.setSize.bind(sb); sb.setSize = (w, h) => { ss(w, h); stretch(); };
      composer.addPass(sb);
    } else this.streak = null;
    composer.addPass(new M.OutputPass());
    this.film = new M.ShaderPass(FILM); composer.addPass(this.film);
    this.film.uniforms.res.value.set(W, H); this.film.uniforms.aspect.value = W / H;
    this.w = W; this.h = H;
  }

  dispose(keepRenderer) {
    if (!this.composer) return;
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer = null;
  }

  // dış boyut (CSS piksel); piksel oranı renderer'da
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio(), W = Math.max(2, Math.round(w * pr)), H = Math.max(2, Math.round(h * pr));
    if (W === this.w && H === this.h) return;
    this.composer.setSize(W, H); this.film.uniforms.res.value.set(W, H); this.film.uniforms.aspect.value = W / H; this.w = W; this.h = H;
  }

  // kalite: 'high' (MSAA + çizgi parlama) | 'medium' (MSAA yok, çizgi parlama yok) | 'low' (son işlem yok: çağıran düz çizim yapar)
  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    if (level !== 'low') { const sz = this.renderer.getSize(new THREE.Vector2()); this.build(); this.setSize(sz.x, sz.y); }
    if (this.onLevel) this.onLevel(level);
  }
  get active() { return this.level !== 'low'; }

  // ölçüm: kare süresi üssel ortalaması; 2 sn boyunca 30 fps altında kalırsa bir kademe düşer
  render(dt, raw = dt) {
    if (!this.active) return;
    this.t += dt; this.film.uniforms.time.value = this.t;
    this.composer.render(dt);
    const ms = Math.max(1, Math.min(2000, raw * 1000)); this.ema += (ms - this.ema) * 0.1;                 // gerçek kare süresi (kısıtlanmamış)
    if (this.ema > 34 && !this.locked) this.slow += raw; else this.slow = Math.max(0, this.slow - raw * 0.5);
    if (this.slow > 2.5) { this.slow = 0; this.ema = 16; this.setLevel(this.level === 'high' ? 'medium' : 'low'); }
  }
}
