'use client';
// fırlatma üsleri küresi: Natural Earth kıyı çizgileri (public/geo/coast-110m.json), 30°'lik ağ, ekvator; her üs fırlatma sayısının kareköküyle
// ölçekli bir nokta. Sürükleyerek ya da ok tuşlarıyla döner; noktaya tıklayınca (ya da aşağıdaki listeden) üs seçilir ve küre ona döner.
// Azaltılmış hareket tercihinde kendiliğinden dönmez. three yalnız bu bileşen görününce yüklenir. Küre süstür: aynı bilgi sayfadaki tabloda var.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { t } from '@/lib/i18n';

const D2R = Math.PI / 180;
const xyz = (lat, lon, r = 1) => [r * Math.cos(lat * D2R) * Math.sin(lon * D2R), r * Math.sin(lat * D2R), r * Math.cos(lat * D2R) * Math.cos(lon * D2R)];
export default function SiteGlobe({ sites, focus = null, lang, height = 440 }) {
  const L = t(lang).ls;
  const host = useRef(null), api = useRef(null);
  const [state, setState] = useState('loading'), [sel, setSel] = useState(focus), [tip, setTip] = useState(null);
  const bySlug = Object.fromEntries(sites.map((s) => [s.slug, s]));
  useEffect(() => {
    let disposed = false, raf = 0, renderer = null, ro = null, io = null, cleanup = () => {};
    const el = host.current; if (!el) return undefined;
    (async () => {
      try {
        const [THREE, coast] = await Promise.all([import('three'), fetch('/geo/coast-110m.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })]);
        if (disposed) return;
        const tok = (v) => getComputedStyle(el).getPropertyValue(v).trim(), col = (v) => new THREE.Color(tok(v));   // renkler tema değişkenlerinden
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
        const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 0, 4.1);
        const globe = new THREE.Group(); scene.add(globe);
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 48), new THREE.MeshBasicMaterial({ color: col('--cobalt-deep') })); globe.add(sphere);
        const line = (pts, color, opacity) => { const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })); };
        const seg = (arr, path) => { for (let k = 1; k < path.length; k++) arr.push(...path[k - 1], ...path[k]); };
        const grid = [], eq = [];
        for (let lat = -60; lat <= 60; lat += 30) { const p = []; for (let lon = -180; lon <= 180; lon += 3) p.push(xyz(lat, lon, 1.001)); seg(lat ? grid : eq, p); }
        for (let lon = -180; lon < 180; lon += 30) { const p = []; for (let lat = -90; lat <= 90; lat += 3) p.push(xyz(lat, lon, 1.001)); seg(grid, p); }
        const shore = []; for (const a of coast.arcs) seg(shore, a.map(([lo, la]) => xyz(la, lo, 1.002)));
        const ink = col('--on-cobalt-2');
        const lines = [line(grid, ink, 0.16), line(eq, ink, 0.55), line(shore, ink, 0.95)]; globe.add(...lines);
        // üs noktaları: yüzeye yatık diskler
        const white = col('--on-cobalt'), dots = sites.map((s) => {
          const r = 0.009 + 0.00105 * Math.sqrt(s.total), m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: white.clone(), transparent: true, opacity: 0.92 }));
          const p = new THREE.Vector3(...xyz(s.lat, s.lon, 1.004)); m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2)); globe.add(m); return { s, m, p, r };
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.35, 32), new THREE.MeshBasicMaterial({ color: white.clone(), side: THREE.DoubleSide })); ring.visible = false; globe.add(ring);
        // yönelim: yaw (boylam) ve pitch (enlem); hedefe yumuşak geçiş
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let yaw = 0, pitch = 0.35, ty = null, tp = null, auto = !reduce && !focus, drag = null, dirty = true, visible = true;
        const lookAt = (s) => { ty = -s.lon * D2R; tp = Math.max(-1.2, Math.min(1.2, s.lat * D2R)); while (ty - yaw > Math.PI) ty -= 2 * Math.PI; while (yaw - ty > Math.PI) ty += 2 * Math.PI; if (reduce) { yaw = ty; pitch = tp; ty = tp = null; } dirty = true; };
        const select = (slug) => {
          const d = dots.find((x) => x.s.slug === slug); if (!d) { ring.visible = false; dirty = true; return; }
          ring.visible = true; ring.position.copy(d.p.clone().multiplyScalar(1.0005)); ring.scale.setScalar(d.r * 1.25); ring.quaternion.copy(d.m.quaternion); auto = false; lookAt(d.s);   // yönelim noktanınki (küre dönükken lookAt dünya koordinatında yanlış olur)
        };
        const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); dirty = true; };
        // ekrandaki en yakın görünür nokta (tıklama ve üzerine gelme)
        const pick = (cx, cy) => {
          const rect = el.getBoundingClientRect(), v = new THREE.Vector3(); let best = null, bd = 18;
          for (const d of dots) {
            v.copy(d.p).applyMatrix4(globe.matrixWorld); if (v.z < 0.15) continue;
            v.project(cam); const x = ((v.x + 1) / 2) * rect.width, y = ((1 - v.y) / 2) * rect.height, dd = Math.hypot(x - (cx - rect.left), y - (cy - rect.top));
            if (dd < bd) { bd = dd; best = { d, x, y }; }
          }
          return best;
        };
        const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; auto = false; ty = tp = null; el.setPointerCapture?.(e.pointerId); };
        const move = (e) => {
          if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true; yaw = drag.yaw + dx * 0.008; pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + dy * 0.008)); dirty = true; return; }
          if (e.pointerType !== 'mouse') return;
          const b = pick(e.clientX, e.clientY); setTip(b ? { slug: b.d.s.slug, x: b.x, y: b.y } : null); el.style.cursor = b ? 'pointer' : 'grab';
        };
        const up = (e) => { const was = drag; drag = null; if (was && !was.moved) { const b = pick(e.clientX, e.clientY); if (b) setSel(b.d.s.slug); } };
        const key = (e) => {
          const k = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key]; if (!k) return;
          e.preventDefault(); auto = false; ty = tp = null; yaw += k[0]; pitch = Math.max(-1.3, Math.min(1.3, pitch + k[1])); dirty = true;
        };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('keydown', key);
        el.addEventListener('pointerleave', () => setTip(null));
        ro = new ResizeObserver(size); ro.observe(el); size();
        io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(el);
        const loop = () => {
          raf = requestAnimationFrame(loop); if (!visible) return;
          if (auto) { yaw += 0.0016; dirty = true; }
          if (ty != null) { yaw += (ty - yaw) * 0.12; pitch += (tp - pitch) * 0.12; if (Math.abs(ty - yaw) < 1e-3 && Math.abs(tp - pitch) < 1e-3) { yaw = ty; pitch = tp; ty = tp = null; } dirty = true; }
          if (!dirty) return; dirty = false;
          globe.rotation.set(pitch, yaw, 0, 'XYZ'); globe.updateMatrixWorld(); renderer.render(scene, cam);
        };
        // tema değişince (data-theme ya da işletim sistemi tercihi) renkleri değişkenlerden yeniden oku
        const recolor = () => { sphere.material.color.set(tok('--cobalt-deep')); for (const l of lines) l.material.color.set(tok('--on-cobalt-2')); const w = tok('--on-cobalt'); for (const d of dots) d.m.material.color.set(w); ring.material.color.set(w); dirty = true; };
        const mo = new MutationObserver(recolor); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', recolor);
        api.current = { select };
        if (focus) select(focus); else { const s0 = sites[0]; if (s0) { yaw = -s0.lon * D2R; } }
        loop(); setState('ready');
        cleanup = () => { mo.disconnect(); mq.removeEventListener('change', recolor); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('keydown', key); };
      } catch {
        if (!disposed) setState('error');
      }
    })();
    return () => { disposed = true; cancelAnimationFrame(raf); cleanup(); ro?.disconnect(); io?.disconnect(); if (renderer) { renderer.dispose(); renderer.domElement.remove(); } api.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.current?.select(sel); }, [sel, state]);
  const S = sel ? bySlug[sel] : null, T = tip ? bySlug[tip.slug] : null;
  return (
    <div className="glb">
      <div className="glb__stage" ref={host} style={{ height }} tabIndex={0} role="img" aria-label={L.globe}>
        {state === 'loading' ? <p className="glb__msg">{L.loading}</p> : null}
        {state === 'error' ? <p className="glb__msg">{L.error}</p> : null}
        {T ? <span className="glb__tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">{T.name} · {T.totalLabel}</span> : null}
        <span className="glb__hint" aria-hidden="true">{L.hint}</span>
      </div>
      {focus ? null : (
        <div className="glb__panel" aria-live="polite">
          {S ? (
            <p><b>{S.name}</b> <span className="glb__meta">{S.country} · {S.totalLabel} · {S.years}</span> <Link className="lnk" href={S.href}>{L.open}</Link></p>
          ) : <p className="glb__meta">{L.pick}</p>}
          <div className="glb__chips" role="group" aria-label={L.pickList}>
            {sites.slice(0, 12).map((s) => <button key={s.slug} type="button" className="chip" aria-pressed={sel === s.slug} onClick={() => setSel(s.slug)}>{s.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
