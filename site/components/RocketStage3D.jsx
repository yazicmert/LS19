'use client';
// roketin kademeli 3B görünümü (lib/rocket3d.js): bütün yığın, ayrık kademeler (eksen boyunca açılır, yan iticiler dışa kayar) ve seçilen
// kademenin kesiti (tanklar, besleme hattı, motorlar, kaynakta yazan parçalar). Kademeye ya da parçaya dokununca üst bileşene bildirir.
// Geçişler canlandırılır; azaltılmış hareket tercihinde anında. three yalnız bu bileşen açılınca yüklenir (ModelViewer gibi).
import { useEffect, useRef, useState } from 'react';

const CUT = Math.PI * 0.7;                                   // kesit açıklığı (kameraya bakar)
const nearestTurn = (from, to) => to + Math.round((from - to) / (Math.PI * 2)) * Math.PI * 2;

export default function RocketStage3D({ spec, stages, sel, view, part, onStage, onPart, label, loading, error, hint, scaleLabel, scaleValue }) {
  const host = useRef(null), api = useRef(null), [state, setState] = useState('loading');
  const cb = useRef({ onStage, onPart });
  useEffect(() => { cb.current = { onStage, onPart }; }, [onStage, onPart]);
  useEffect(() => {
    let disposed = false, raf = 0, ro = null, renderer = null, cleanup = () => {};
    const el = host.current; if (!el) return undefined;
    (async () => {
      try {
        const THREE = await import('three');
        const R = await import('@/lib/rocket3d');
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
        el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
        const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 3 / 4, 0.05, 2000);
        const sun = new THREE.DirectionalLight(0xfff4e6, 3.1); sun.position.set(3.2, 1.6, 2.4); scene.add(sun);
        const fill = new THREE.DirectionalLight(0xc9d3ff, 0.6); fill.position.set(-2, -0.5, 1.5); scene.add(fill);
        scene.add(new THREE.HemisphereLight(0xc9d3ff, 0x0b1660, 0.45));
        const tilt = new THREE.Group(), spin = new THREE.Group(), root = new THREE.Group();
        spin.add(root); tilt.add(spin); scene.add(tilt); tilt.rotation.x = 0.12;

        // parçalar: kademe ve kaporta yığını, yan iticiler; her kademenin iç parçaları (dış görünenler hep açık, içtekiler yalnız kesitte)
        const L = R.rocketLayout(spec), pieces = R.rocketPieces(L), byKey = new Map(stages.map((s) => [s.key, s]));
        const EXTERNAL = new Set(['engines', 'nozzle', 'verniers', 'gridfins', 'legs', 'fins', 'aerofins', 'interstage']);
        const units = [];                                    // { key, group, shell, cutShell, inner, base: Vector3, booster: a | null, seg }
        const mkInner = (st, seg) => {
          const { group } = R.buildInternals(THREE, st, seg, CUT);
          group.children.forEach((m) => { m.userData.stage = st.key; m.userData.inner = !EXTERNAL.has(m.userData.part); m.visible = !m.userData.inner; });
          return group;
        };
        for (const p of pieces) {
          const g = new THREE.Group(), shell = R.buildPieceShell(THREE, p); g.add(shell.group); g.position.y = p.y0;
          const st = byKey.get(p.key), seg = p.segs[p.segs.length - 1];
          let inner = null;
          if (st && seg.kind === 'stage') { inner = mkInner(st, seg); inner.position.y = seg.y - p.y0; g.add(inner); }
          root.add(g); units.push({ key: p.key, piece: p, group: g, shell, inner, base: new THREE.Vector3(0, p.y0, 0), booster: null, seg });
        }
        const bst = byKey.get('0');
        L.boosters.forEach((b, k) => {
          const g = new THREE.Group(), shell = R.buildBoosterShell(THREE, b); g.add(shell.group);
          g.position.set(Math.cos(b.a) * b.r, 0, Math.sin(b.a) * b.r); g.rotation.y = -b.a;
          let inner = null; if (bst) { inner = mkInner(bst, { l: b.l, d: b.d }); g.add(inner); }
          root.add(g); units.push({ key: '0', idx: k, group: g, shell, inner, base: g.position.clone(), booster: b, seg: { l: b.l, d: b.d, y: 0 } });
        });
        root.traverse((o) => { if (o.isMesh && o.userData.stage == null) o.userData.stage = o.parent?.userData?.stage ?? null; });
        for (const u of units) u.group.traverse((o) => { if (o.isMesh && o.userData.stage == null) o.userData.stage = u.key; });

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        const W = Math.max(L.segs[0].d, ...L.boosters.map((b) => 2 * (b.r + b.d / 2)), ...L.segs.map((s) => s.d || 0));
        // durum ve hedefler (çerçeve: merkez yüksekliği, görünen boy ve genişlik)
        const want = { sel: null, view: 'whole', part: null }, cur = { on: 0, cy: L.height / 2, h: L.height + 2, w: W, spin: 0 };
        let spinLock = null;
        const target = () => {
          const ex = R.explodeOffsets(L, 1), on = want.view === 'whole' ? 0 : 1;
          if (want.view === 'inside' && want.sel) {
            const u = units.find((x) => x.key === want.sel && (x.booster ? x.idx === 0 : true));
            if (u) {
              const bell = Math.max(0.6, u.seg.d * 0.9), y0 = u.booster ? 0 : u.base.y + (ex.pieces.find((p) => p.key === u.key)?.dy || 0) + (u.seg.y - u.piece.y0);
              return { on, cy: y0 + (u.seg.l - bell) / 2, h: u.seg.l + bell, w: u.seg.d * 1.9, spin: u.booster ? u.booster.a : 0 };
            }
          }
          const h = on ? ex.height : L.height;
          return { on, cy: h / 2 - 1, h: h + 3, w: W + (on ? 2 * ex.booster : 0), spin: null };
        };
        const dim = (u, f) => { for (const m of u.shell.materials) { m.color.setHex(m.userData.base ?? (m.userData.base = m.color.getHex())); if (f < 1) m.color.multiplyScalar(f); } };
        const apply = () => {
          const inside = want.view === 'inside' && want.sel;
          for (const u of units) {
            const mine = u.key === want.sel, focus = inside && mine && (!u.booster || u.idx === 0);
            u.group.visible = !inside || focus;
            if (focus && !u.cutShell) {                     // kesit kabuğu ilk girişte yapılır
              u.cutShell = u.booster ? R.buildBoosterShell(THREE, u.booster, CUT) : R.buildPieceShell(THREE, u.piece, CUT);
              u.cutShell.group.traverse((o) => { if (o.isMesh) o.userData.stage = u.key; });
              u.group.add(u.cutShell.group);
            }
            u.shell.group.visible = !focus; if (u.cutShell) u.cutShell.group.visible = focus;
            if (u.inner) u.inner.children.forEach((m) => {
              m.visible = !m.userData.inner || focus;
              const on = focus && want.part && m.userData.part === want.part;
              m.material.emissive?.setHex(on ? 0x4a5a90 : 0x000000);
            });
            dim(u, want.sel && !inside && !mine ? 0.5 : 1);
          }
          if (inside) spinLock = target().spin; else spinLock = null;
        };
        api.current = { set: (s, v, p) => { Object.assign(want, { sel: s, view: v, part: p }); apply(); idle = 0; } };

        const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
        ro = new ResizeObserver(size); ro.observe(el); size();
        // sürükleme döndürür; kısa dokunuş kademe ya da parça seçer
        let drag = null, last = performance.now(), idle = 0, moved = 0;
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
        const pick = (e) => {
          const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(ndc, cam);
          const hit = ray.intersectObject(root, true).find((h) => shown(h.object));
          if (!hit) return;
          const d = hit.object.userData;
          if (want.view === 'inside' && want.sel) { if (d.part) cb.current.onPart(d.part); }
          else if (d.stage && d.stage !== 'F' && byKey.has(d.stage)) cb.current.onStage(d.stage);
        };
        const down = (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; el.setPointerCapture(e.pointerId); idle = 0; };
        const move = (e) => {
          if (!drag) return;
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy);
          spin.rotation.y += dx * 0.008; tilt.rotation.x = Math.max(-1.3, Math.min(1.3, tilt.rotation.x + dy * 0.008));
          drag = { x: e.clientX, y: e.clientY }; if (moved > 6) spinLock = null;
        };
        const up = (e) => { if (drag && moved <= 6) pick(e); drag = null; idle = 0; };
        const cancel = () => { drag = null; };
        const key = (e) => {
          const d = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
          if (!d) return; e.preventDefault(); spinLock = null; spin.rotation.y += d[0]; tilt.rotation.x = Math.max(-1.3, Math.min(1.3, tilt.rotation.x + d[1])); idle = 0;
        };
        el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', cancel); el.addEventListener('keydown', key);
        cleanup = () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); el.removeEventListener('keydown', key); };

        const frame = (now) => {
          const dt = Math.min(0.05, (now - last) / 1000); last = now; idle += dt;
          const t = target(), k = reduce.matches ? 1 : 1 - Math.exp(-dt * 5);
          for (const f of ['on', 'cy', 'h', 'w']) cur[f] += (t[f] - cur[f]) * k;
          if (Math.abs(t.on - cur.on) < 1e-3) cur.on = t.on;
          const ex = R.explodeOffsets(L, cur.on), inside = want.view === 'inside' && want.sel;
          for (const u of units) {
            if (u.booster) {
              const r = u.booster.r + ex.booster, ins = inside && u.key === want.sel && u.idx === 0;
              u.group.position.set(ins ? 0 : Math.cos(u.booster.a) * r, 0, ins ? 0 : Math.sin(u.booster.a) * r);
            } else u.group.position.y = u.base.y + (ex.pieces.find((p) => p.key === u.key)?.dy || 0);
          }
          if (spinLock != null && !drag) {                 // kesitte açıklık kameraya döner
            const to = nearestTurn(spin.rotation.y, spinLock); spin.rotation.y += (to - spin.rotation.y) * k;
            tilt.rotation.x += (0.1 - tilt.rotation.x) * k;
          } else if (!drag && !reduce.matches && idle > 1.2 && !inside) spin.rotation.y += dt * 0.22;
          root.position.y = -cur.cy;
          const vf = (cam.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
          const z = Math.max(cur.h / 2 / Math.tan(vf), cur.w / 2 / Math.tan(hf)) * 1.12;
          cam.position.set(0, 0, z); cam.near = z / 200; cam.far = z * 4 + cur.h; cam.updateProjectionMatrix(); cam.lookAt(0, 0, 0);
          renderer.render(scene, cam); raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        setState('ready');
      } catch (e) {
        if (!disposed) setState('error');
      }
    })();
    return () => {
      disposed = true; cancelAnimationFrame(raf); cleanup(); if (ro) ro.disconnect(); api.current = null;
      if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
    };
  }, [spec, stages]);
  useEffect(() => { if (state === 'ready' && api.current) api.current.set(sel, view, part); }, [sel, view, part, state]);
  return (
    <figure className="mv mv--tall rkx__mv">
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
