'use client';
// asteroidin gerçek şekil modeli (GLB, hacim eşdeğeri yarıçap 1; +Y dönme ekseni). Kobalt alanda tek Güneş ışığıyla; kendi ekseni çevresinde yavaş
// döner (azaltılmış hareket tercihinde durur), sürükleme ve ok tuşlarıyla döndürülür. three yalnız bu bileşen görününce yüklenir.
import { useEffect, useRef, useState } from 'react';

export default function ModelViewer({ src, label, loading, error, hint, scaleLabel, scaleValue }) {
  const host = useRef(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let disposed = false, raf = 0, ro = null, renderer = null, cleanup = () => {};
    const el = host.current; if (!el) return undefined;
    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
        el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
        const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
        cam.position.set(0, 0, 5.6);
        const sun = new THREE.DirectionalLight(0xfff4e6, 3.1); sun.position.set(3.2, 1.6, 2.4); scene.add(sun);
        scene.add(new THREE.HemisphereLight(0xc9d3ff, 0x0b1660, 0.35));
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(src);
        if (disposed) return;
        const root = gltf.scene;
        root.traverse((o) => {
          if (!o.isMesh) return;
          const m = o.material;
          if (!m || !m.map) o.material = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.92, metalness: 0 });
          else { m.roughness = 0.95; m.metalness = 0; }
        });
        const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
        root.position.sub(c);
        const spin = new THREE.Group(), tilt = new THREE.Group();          // tilt: kullanıcının sürüklemesi; spin: kendi ekseni (+Y)
        spin.add(root); tilt.add(spin); scene.add(tilt);
        tilt.rotation.x = 0.35;
        cam.position.z = r / Math.tan((cam.fov * Math.PI) / 360) * 1.18;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
        ro = new ResizeObserver(size); ro.observe(el); size();
        let drag = null, last = performance.now(), idle = 0;
        const down = (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); idle = 0; };
        const move = (e) => {
          if (!drag) return;
          spin.rotation.y += (e.clientX - drag.x) * 0.008; tilt.rotation.x = Math.max(-1.3, Math.min(1.3, tilt.rotation.x + (e.clientY - drag.y) * 0.008));
          drag = { x: e.clientX, y: e.clientY };
        };
        const up = () => { drag = null; idle = 0; };
        const key = (e) => {
          const d = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
          if (!d) return; e.preventDefault(); spin.rotation.y += d[0]; tilt.rotation.x = Math.max(-1.3, Math.min(1.3, tilt.rotation.x + d[1])); idle = 0;
        };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('keydown', key);
        cleanup = () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('keydown', key); };
        const frame = (now) => {
          const dt = Math.min(0.05, (now - last) / 1000); last = now; idle += dt;
          if (!drag && !reduce.matches && idle > 1.2) spin.rotation.y += dt * 0.22;
          renderer.render(scene, cam); raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        setState('ready');
      } catch (e) {
        if (!disposed) setState('error');
      }
    })();
    return () => {
      disposed = true; cancelAnimationFrame(raf); cleanup(); if (ro) ro.disconnect();
      if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
    };
  }, [src]);
  return (
    <figure className="mv">
      <div className="mv__stage" ref={host} tabIndex={0} role="img" aria-label={label} data-state={state}>
        {state !== 'ready' ? <p className="mv__msg" role="status">{state === 'error' ? error : loading}</p> : null}
      </div>
      <figcaption className="mv__cap">
        <span>{hint}</span>
        <span className="mv__scale">{scaleLabel} <b>{scaleValue}</b></span>
      </figcaption>
    </figure>
  );
}
