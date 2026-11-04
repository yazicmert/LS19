// Tuval girdisi (app.js'ten ayrıldı): sürükleyerek kamerayı döndürme, tekerlekle yakınlaşma (kipe göre sınırlar), üzerine gelince ad ipucu,
// kısa tıklamayla seçme (gezegen, uydu, asteroit, Ay uydusu) ve seçilen cismin bilgi kartı ile eylemleri.
import * as E from './engine.js';
import { MODELS, MOON_MODELS } from './satmodels.js';

const $ = (s) => document.querySelector(s);

// ctx: { world, ui, curT, focusOn, followSat, lookAtSat, setCam, setSkyCam } ve anlık durum için getter'lar:
//      MODE, latest, designing, sats, asts, astui, tracker, skyui (katmanlar sonradan kurulur)
export function attachCanvasInput(canvas, ctx) {
  let drag = null, press = null;
  canvas.addEventListener('pointerdown', (e) => { $('#hoverTip').hidden = true; drag = { x: e.clientX, y: e.clientY }; press = { x: e.clientX, y: e.clientY, t: performance.now() }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', (e) => {
    drag = null;
    // sürüklemeden kısa tıklama: gezegen / uydu seçimi
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5 && performance.now() - press.t < 450) handleClick(e);
    press = null;
  });
  function pickAt(e) {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cands = [];
    const pp = ctx.world.pickPlanet(mx, my); if (pp) cands.push({ ...pp, d2: pp.d * pp.d });
    if (ctx.MODE === 'sky') {
      if (ctx.sats && ctx.world.eye) { const sp = ctx.sats.pick(mx, my, ctx.world.camera, ctx.world.eye, canvas, ctx.curT()); if (sp) cands.push(sp); }
      if (ctx.asts && ctx.world.eye) { const ap = ctx.asts.pick(mx, my, ctx.world.camera, ctx.world.eye, canvas, ctx.curT()); if (ap) cands.push(ap); }
    }
    cands.sort((a, b) => a.d2 - b.d2);
    return cands[0] ? { ...cands[0], mx, my } : null;
  }
  // fareyle üzerine gelince: imleç ve ad ipucu
  let hoverT = 0;
  function hover(e) {
    const tip = $('#hoverTip');
    const c = (ctx.MODE === 'sky' || ctx.latest) && !ctx.designing ? pickAt(e) : null;
    canvas.style.cursor = c ? 'pointer' : '';
    if (!c) { tip.hidden = true; return; }
    tip.textContent = c.kind === 'sat' ? ctx.sats.names[c.i] : c.kind === 'msat' ? c.m.name : c.kind === 'ast' ? ctx.asts.label(c.i) : c.i === 3 ? 'Dünya–Ay' : ctx.world.planetName(c.i);
    tip.hidden = false; tip.style.transform = `translate(${c.mx + 12}px, ${c.my - 22}px)`;
  }
  function handleClick(e) {
    if (ctx.MODE !== 'sky' && !ctx.latest) return;
    const c = pickAt(e), t = ctx.curT();
    if (!c) { ctx.ui.hidePick(); return; }
    const mx = c.mx, my = c.my;
    if (c.kind === 'planet' && c.i === 3) { ctx.ui.hidePick(); if (ctx.MODE === 'sky') ctx.setSkyCam('SYSTEM'); else ctx.setCam('SYSTEM'); return; }
    if (c.kind === 'planet') {
      const R = ctx.world.planetInfo(c.i, t).R;
      ctx.ui.showPick({ kind: 'planet', refresh: (tt) => ctx.world.planetInfo(c.i, tt),
        actions: [{ label: 'Yakınlaş', fn: () => ctx.focusOn({ kind: 'planet', i: c.i }, 6 * R) }] }, mx, my, t);
    } else if (c.kind === 'sat') {
      const id = +ctx.sats.ids[c.i];
      const watchAct = () => (ctx.tracker.has(id) ? { label: 'Takipten çıkar', fn: () => { ctx.tracker.remove(id); ctx.ui.hidePick(); } } : { label: 'Takibe al', fn: () => { ctx.tracker.add(id); ctx.tracker.computePasses(true); ctx.ui.hidePick(); ctx.skyui.toast(`${ctx.sats.names[c.i]} takip listesine eklendi (Takip sekmesi).`); } });
      const mdl = ctx.sats.modelOf(id);
      ctx.ui.showPick({ kind: 'sat', refresh: (tt) => {
        const d = ctx.sats.satDetails(c.i, tt); if (!d) return d;
        const s = ctx.tracker.state(id, E.utcMsFromT(tt)); if (s) { d.obsName = ctx.tracker.observer.name; d.obsEl = s.el; d.obsAz = s.az; d.obsRange = s.range; }
        const np = ctx.tracker.passes.find((p) => p.id === id && p.rise && p.set.ms > Date.now()); if (np) d.nextPass = np;
        return d; },
      actions: [watchAct(), { label: 'Yörüngesini göster', fn: () => ctx.sats.select(c.i) }, { label: 'Kamerayla izle', fn: () => ctx.followSat(id) },
        { label: '3B modeli yakından gör', fn: () => ctx.followSat(id, (mdl ? mdl.size : ctx.sats.familySizeM(id) || 10) * 2.4 / 1000) },
        { label: 'Gökte izle', fn: () => ctx.lookAtSat(id) }] }, mx, my, t);
    } else if (c.kind === 'ast') {
      const i = c.i; ctx.asts.fetchDetail(i);
      ctx.ui.showPick({ kind: 'ast', refresh: (tt) => ctx.asts.details(i, tt), card: (d) => ctx.astui.card(d),
        actions: [{ label: 'Yörüngesini göster', fn: () => ctx.asts.select(i) }, { label: 'Kamerayla izle', fn: () => ctx.astui.follow(i) },
          { label: 'Laboratuvarda dene', fn: () => { ctx.ui.hidePick(); ctx.astui.openLab(i); } }] }, mx, my, t);
    } else if (c.kind === 'msat') {
      const m = c.m;
      ctx.ui.showPick({ kind: 'msat', refresh: (tt) => ctx.sats.moonSatDetails(m, tt),
        actions: [{ label: 'Kamerayla izle', fn: () => ctx.focusOn({ kind: 'msat', fn: (tt) => { const r = ctx.sats.moonState(m, tt); return r ? E.add(E.moonPos(tt), r) : null; } }, 300) },
          ...(MOON_MODELS[m.name] ? [{ label: '3B modeli yakından gör', fn: () => ctx.focusOn({ kind: 'msat', fn: (tt) => { const r = ctx.sats.moonState(m, tt); return r ? E.add(E.moonPos(tt), r) : null; } }, MODELS[MOON_MODELS[m.name]].size * 2.4 / 1000) }] : [])] }, mx, my, t);
    }
  }
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { const now = performance.now(); if (now - hoverT > 120) { hoverT = now; hover(e); } return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    if (ctx.world.cam.mode === 'SITE') return;
    if (ctx.world.cam.mode === 'OBS') {                               // gözlemci: bakış yönü (sürükleyince hedef izleme bırakılır)
      ctx.world.cam.lookFn = null; ctx.world.cam.az -= dx * 0.004 * (ctx.world.camera.fov / 70); ctx.world.cam.el = Math.max(-0.25, Math.min(1.56, ctx.world.cam.el + dy * 0.004 * (ctx.world.camera.fov / 70))); return;
    }
    if (ctx.world.cam.auto) { ctx.world.cam.auto = false; document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === ctx.world.cam.mode)); }
    ctx.world.cam.az -= dx * 0.005; ctx.world.cam.el = Math.max(-1.5, Math.min(1.5, ctx.world.cam.el + dy * 0.005));
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (ctx.world.cam.mode === 'SITE' || ctx.world.cam.mode === 'OBS') { ctx.world.cam.userFov = true; ctx.world.camera.fov = Math.max(2, Math.min(ctx.world.cam.mode === 'OBS' ? 100 : 70, ctx.world.camera.fov * Math.exp(e.deltaY * 0.001))); ctx.world.camera.updateProjectionMatrix(); return; }
    const f = ctx.world.cam.focus;
    const minD = ctx.world.cam.mode === 'FOCUS' ? (f && f.kind === 'planet' ? ctx.world.planetInfo(f.i, ctx.curT()).R * 1.15 : f && (f.kind === 'ast' || f.R) ? Math.max(0.004, f.R * 1.3) : 0.004)
      : { VEHICLE: 0.012, LAUNCH: 0.03, EARTH: E.R_E * 1.05, MOON: E.R_M * 1.03, SYSTEM: 50000, EMB: 9000, SOLAR: 2e6 }[ctx.world.cam.mode] || 0.01;
    const maxD = ctx.world.cam.mode === 'SOLAR' || ctx.world.cam.mode === 'FOCUS' ? 1e10 : 3e6;
    ctx.world.cam.dist = Math.max(minD, Math.min(maxD, ctx.world.cam.dist * Math.exp(e.deltaY * 0.0012)));
  }, { passive: false });
}
