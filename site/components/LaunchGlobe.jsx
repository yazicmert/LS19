'use client';
// yaklaşan fırlatmalar küresi: her fırlatmanın rampası (nokta) ve hedef yörüngesi (rampanın üstünden geçen şematik halka; renk yörünge
// grubundan, --series-1…7). Lejant düğmeleri sayılarıyla yörünge grubunu seçer: küre o grubu öne alır, liste o gruba süzülür (üst bileşen).
// Yükseklik sıkıştırılmış ölçekte (lib/orbit-shapes.js). three yalnız görününce yüklenir; azaltılmış harekette kendiliğinden dönmez.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t, num } from '@/lib/i18n';
import { orbitGroup, orbitPath, globeSummary, xyz } from '@/lib/orbit-shapes';

export default function LaunchGlobe({ lang, rows, sel, onPick }) {
  const L = t(lang).launch.globe, host = useRef(null), api = useRef(null), [state, setState] = useState('loading');
  const sum = useMemo(() => globeSummary(rows), [rows]);
  useEffect(() => {
    let disposed = false, raf = 0, renderer = null, ro = null, io = null, mo = null, cleanup = () => {};
    const el = host.current; if (!el) return undefined;
    (async () => {
      try {
        const [THREE, coast] = await Promise.all([import('three'), fetch('/geo/coast-110m.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })]);
        if (disposed) return;
        const tok = (v) => getComputedStyle(el).getPropertyValue(v).trim();
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
        const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40); cam.position.set(0, 0, 7.4);
        const globe = new THREE.Group(); scene.add(globe);
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 48), new THREE.MeshBasicMaterial()); globe.add(sphere);
        const seg = (arr, path) => { for (let k = 1; k < path.length; k++) arr.push(...path[k - 1], ...path[k]); };
        const lineMesh = (pts, opacity = 1) => new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ transparent: true, opacity }));
        const shoreP = []; for (const a of coast.arcs) seg(shoreP, a.map(([lo, la]) => xyz(la, lo, 1.002)));
        const eqP = []; seg(eqP, Array.from({ length: 121 }, (_, k) => xyz(0, k * 3, 1.002)));
        const shore = lineMesh(shoreP, 0.9), eq = lineMesh(eqP, 0.5); globe.add(shore, eq);
        // yörüngeler: her fırlatma bir çizgi; grup kimliği seçime göre saydamlık için
        const orbits = rows.map((r) => {
          const g = orbitGroup(r.orbit); if (!g || r.lat == null || r.lon == null) return null;
          const pts = []; const path = orbitPath(g, r.lat, r.lon); for (let k = 1; k < path.length; k++) pts.push(...path[k - 1], ...path[k]);
          const m = lineMesh(pts, 0.85); m.userData.g = g; globe.add(m); return m;
        }).filter(Boolean);
        const pads = sum.pads.map((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018 + 0.006 * Math.sqrt(p.n), 12, 8), new THREE.MeshBasicMaterial()); m.position.set(...xyz(p.lat, p.lon, 1.01)); globe.add(m); return m; });
        const recolor = () => {
          sphere.material.color.set(tok('--paper-2')); shore.material.color.set(tok('--ink-2')); eq.material.color.set(tok('--hair'));
          for (const m of orbits) m.material.color.set(tok(`--series-${m.userData.g.slot}`));
          for (const m of pads) m.material.color.set(tok('--ink'));
          dirty = true;
        };
        const emph = (id) => { for (const m of orbits) { const on = !id || m.userData.g.id === id; m.material.opacity = on ? 0.9 : 0.08; } dirty = true; };
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let yaw = -((rows.find((r) => r.lon != null) || {}).lon || -80) * Math.PI / 180, pitch = 0.35, drag = null, dirty = true, visible = true, idle = 0, last = performance.now();
        const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.position.z = 7.4 / Math.min(1, cam.aspect * 1.05); cam.updateProjectionMatrix(); dirty = true; };
        const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; el.setPointerCapture?.(e.pointerId); idle = 0; };
        const move = (e) => { if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * 0.008; pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.008)); dirty = true; idle = 0; };
        const up = () => { drag = null; };
        const key = (e) => { const k = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key]; if (!k) return; e.preventDefault(); yaw += k[0]; pitch = Math.max(-1.3, Math.min(1.3, pitch + k[1])); dirty = true; idle = 0; };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('keydown', key);
        mo = new MutationObserver(recolor); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', recolor);
        ro = new ResizeObserver(size); ro.observe(el); size(); recolor();
        io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(el);
        const loop = (now) => {
          raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; idle += dt; if (!visible) return;
          if (!reduce && !drag && idle > 2) { yaw += dt * 0.12; dirty = true; }
          if (!dirty) return; dirty = false; globe.rotation.set(pitch, yaw, 0, 'XYZ'); renderer.render(scene, cam);
        };
        api.current = { emph }; raf = requestAnimationFrame(loop); setState('ready');
        cleanup = () => { mq.removeEventListener('change', recolor); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('keydown', key); };
      } catch { if (!disposed) setState('error'); }
    })();
    return () => { disposed = true; cancelAnimationFrame(raf); cleanup(); ro?.disconnect(); io?.disconnect(); mo?.disconnect(); if (renderer) { renderer.dispose(); renderer.domElement.remove(); } api.current = null; };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.emph(sel || null); }, [sel, state]);
  const total = rows.length, known = sum.groups.filter((g) => g.id !== 'other').reduce((n, g) => n + g.n, 0);
  return (
    <figure className="lg">
      <div className="lg__stage" ref={host} tabIndex={0} role="img" aria-label={L.aria(sum.groups.map((g) => `${L.g[g.id]} ${g.n}`).join(', '))}>
        {state === 'loading' ? <p className="lg__msg">{L.loading}</p> : null}
        {state === 'error' ? <p className="lg__msg">{L.error}</p> : null}
      </div>
      <figcaption className="lg__cap">
        <p className="lg__lead">{L.lead(num(lang, total, 0), num(lang, sum.pads.length, 0))}</p>
        <div className="lg__keys" role="group" aria-label={L.keys}>
          {sum.groups.map((g) => (
            <button key={g.id} type="button" className={`lg__key ser--${g.id === 'other' ? 'o' : g.slot}`} aria-pressed={sel === g.id} disabled={g.id === 'other'} onClick={() => onPick(sel === g.id ? '' : g.id)} title={g.abbrev.join(', ') || undefined}>
              <span className="lg__sw" aria-hidden="true" />{L.g[g.id]}<span className="mono lg__n">{num(lang, g.n, 0)}</span>
            </button>
          ))}
        </div>
        <p className="note">{L.note(num(lang, total - known, 0))}</p>
      </figcaption>
    </figure>
  );
}
