// Sinematik gösterim (fragman) ve görsel efekt doğrulaması (Node 20+): cd web && node test/test_cinema.js
//  1) pchip (gerçek süre → benzetim zamanı eğrisi): düğümlerden geçer, monoton, türev ≥ 0
//  2) çekim listesi (cinema.js buildShots): altı profil × tek/iki kademe — plan olaylarına bağlı, sıralı, kimlikler tekil, zaman eğrileri monoton, süreler makul; bölüm sayısı
//  3) kamera yardımcıları: lightCam (Güneş'e bakan yüz), limbCam (araç kıyıda), iniş irtifası → zaman hızı tablosu (monoton, yavaş çekimle biter)
//  4) efektler (fx.js): plüm geometrisi (çıkıştan uca s, genişleyen yarıçap, birim normaller), Particles (balistik, yer çarpması, sıkıştırma, üst sınır)
//  5) bindirmeler: css/cinema.css kuralları (transition: all yok, scale(0) yok, yalnız transform/opacity/clip-path/visibility/background-color geçişleri, azaltılmış hareket bloğu),
//     cinemaui.js sınıflarının CSS'te tanımı, index.html ve app.js bağlantıları
//  6) scene.js: PBR tablosundaki malzeme adları GLB'lerde var; CINE kipi ve sinematik kip yöntemleri; post.js bileşenleri
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const E = await import('../js/engine.js');
const EO = await import('../js/earth.js');
const { makeLive } = await import('../js/live.js');
const MI = await import('../js/mission.js');
const C = await import('../js/cinema.js');
const FX = await import('../js/fx.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 1) pchip
{
  const xs = [0, 0.2, 0.55, 0.8, 1], ys = [0, 10, 12, 400, 420], f = C.pchip(xs, ys);
  const knots = xs.every((x, i) => Math.abs(f(x)[0] - ys[i]) < 1e-9);
  let mono = true, dOk = true, prev = -1, maxJump = 0;
  for (let i = 0; i <= 1000; i++) { const [y, d] = f(i / 1000); if (y < prev - 1e-9) mono = false; if (d < -1e-9) dOk = false; maxJump = Math.max(maxJump, y - prev); prev = y; }
  check('pchip: düğümlerden geçer, monoton ve türev ≥ 0 (fazla salınım yok: düz parçada aşma yok)', knots && mono && dOk && f(0.3)[0] < 12 + 1e-9 && f(0.3)[0] > 10 - 1e-9, `f(0,3)=${f(0.3)[0].toFixed(2)}`);
  const g = C.pchip([0, 1], [100, 100]);
  check('pchip: sabit veri (aralık 0) sabit kalır, türevi 0', g(0.4)[0] === 100 && g(0.4)[1] === 0);
}

// ---------------------------------------------------------------- 2) çekim listesi
const ab = (f) => { const b = fs.readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab('../data/de440s.bsp'), PCK = ab('../data/moon_pa_de440_200625.bpc');
const eo = JSON.parse(rd('../data/earth_orient.json')); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(rd('../data/designs_default.json'));
const planOf = (D) => { E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart); const M = new MI.Mission({ design: D, landing: 'zem' }); return Object.fromEntries(M.plan.map((p) => [p.key, p.t])); };
let apollo2 = null;
for (const [name, entry] of Object.entries(ALL.profiles)) {
  for (const veh of ['one', 'two']) {
    const D = veh === 'two' ? MI.twoStageDesign(entry.design) : entry.design, P = planOf(D), S = C.buildShots(P, { landing: 'opt' }), ids = S.map((s) => s.id);
    const has = (k) => P[k] != null;
    let ok = new Set(ids).size === ids.length && ids[0] === 'open' && ids[ids.length - 1] === 'outro';
    let why = '';
    // zaman eğrileri: τ düğümleri 0 → 1 artan, benzetim zamanı azalmaz; zaman hedefli çekimler (wf yok) birbirini izler (başlangıç ≥ öncekinin bitişi − 1 s)
    let prevEnd = -Infinity, effSum = 0, nomSum = 0, chap = 0;
    for (const s of S) {
      const T = s.T(P), tau = T.map((k) => k[0]), ts = T.map((k) => k[1]);
      const mono = tau[0] === 0 && tau[tau.length - 1] === 1 && tau.every((v, i) => i === 0 || v > tau[i - 1]) && ts.every((v, i) => i === 0 || v >= ts[i - 1]) && ts.every(Number.isFinite);
      if (!mono) { ok = false; why += ` ${s.id}: eğri`; }
      if (!s.wf) { if (T[0][1] < prevEnd - 1) { ok = false; why += ` ${s.id}: önceki çekimin bitişinden önce başlıyor`; } prevEnd = T[T.length - 1][1]; }
      const span = ts[ts.length - 1] - ts[0], de = Math.max(s.dur, span / ((s.wmax || 20000) * 0.85));
      effSum += de; nomSum += s.dur; if (s.chapter) chap++;
      if (!(s.rig || s.rigs)) { ok = false; why += ` ${s.id}: kamera yok`; }
      if (s.rigs) { let lo = 0; for (const r of s.rigs) { if (!(r.to > lo)) { ok = false; why += ` ${s.id}: rigs sırası`; } lo = r.to; } if (s.rigs[s.rigs.length - 1].to !== 1) { ok = false; why += ` ${s.id}: son rig 1 değil`; } }
    }
    const need = [['TLI', ['park-wide', 'park-close', 'tli-ignite', 'tli-burn']], ['SEP', ['sep', 'coast-a', 'coast-b', 'coast-c']], ['LOI', ['loi-approach', 'loi-burn', 'llo']], ['SEP2', ['sep2']], ['PDI', ['pdi', 'approach', 'touchdown']]];
    for (const [k, list] of need) if (has(k) !== list.every((i) => ids.includes(i)) ) { ok = false; why += ` ${k}: çekimler plan olayıyla uyumsuz`; }
    check(`çekim listesi ${name} / ${veh === 'two' ? 'iki kademe' : 'tek kademe'}: ${S.length} çekim, kimlikler tekil, eğriler monoton, plan olaylarıyla uyumlu; bölüm ${chap}; süre ≈ ${effSum.toFixed(0)} s (anma ${nomSum.toFixed(0)} s)`,
      ok && chap >= 7 && chap <= 9 && effSum > 80 && effSum < 330, why);
    if (name === 'APOLLO' && veh === 'two') apollo2 = { S, P, nomSum, chap };
  }
}
check('Apollo iki kademe: dokuz bölüm, anma süre 110–150 s, açılış INS\'te başlar, kapanış temas sonrası', apollo2 && apollo2.chap === 9 && apollo2.nomSum > 110 && apollo2.nomSum < 150 && apollo2.S[0].T(apollo2.P)[0][1] === apollo2.P.INS, `bölüm ${apollo2 && apollo2.chap}, ${apollo2 && apollo2.nomSum} s`);

// ---------------------------------------------------------------- 3) kamera yardımcıları ve iniş zaman hızı
{
  const t = apollo2.P.INS + 100, x = { t, r: E.scale(E.unit([0.3, 0.8, 0.52]), E.R_E + 185) };
  const sun = E.unit(E.sunPos(t)), sph = (c) => [Math.cos(c.el) * Math.cos(c.az), Math.cos(c.el) * Math.sin(c.az), Math.sin(c.el)];
  const lc = C.lightCam(x, 15000, 0.85, 0.35), ev = sph(lc);
  check('lightCam: göz yönü Güneş tarafında (Dünya aydınlık yüzüyle kameraya bakar), mod EARTH, uzaklık verilen', E.dot(ev, sun) > 0.5 && lc.mode === 'EARTH' && lc.dist === 15000, `Güneş·göz = ${E.dot(ev, sun).toFixed(2)}`);
  const th = 1.0, lm = C.limbCam(x, 20000, th), ev2 = sph(lm), ang = Math.acos(E.dot(ev2, E.unit(x.r)));
  check('limbCam: göz yönü araç yönünden tam θ açıda ve Güneş yarımküresinde (araç görünen diskin kıyısına yakın, aydınlık yüz kameraya dönük)', Math.abs(ang - th) < 1e-6 && E.dot(ev2, sun) > 0, `açı ${ang.toFixed(3)} rad`);
  const td = apollo2.S.find((s) => s.id === 'touchdown'), at = (a) => td.wf({ local: { p: [0, 0, a] } }), pdi = apollo2.S.find((s) => s.id === 'pdi');
  let nonInc = true, prev = Infinity; for (const a of [20, 12, 8, 4, 2, 1.6, 1, 0.6, 0.3, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001, 0]) { const w = at(a); if (w > prev + 1e-9) nonInc = false; prev = w; }
  check('iniş zaman hızı (irtifa → ×): irtifa azaldıkça azalır, 12 km üstünde ×60, temasta ×1 (yavaş çekim değil, ama gerçek zaman); yerel veri yokken (sonsuz irtifa) ×60', nonInc && at(20) === 60 && at(0) === 1 && at(0.05) > 1.5 && at(0.05) < 8 && td.wf({}) === 60, `×${at(1.6).toFixed(0)} @1,6 km, ×${at(0.25).toFixed(1)} @250 m, ×${at(0.025).toFixed(1)} @25 m`);
  const pre = (kalan) => pdi.wf({ t: apollo2.P.PDI + 16 - kalan }, { burnT: -1 });                // ateşlemeye (PDI + 16 s) kalan benzetim süresi → ×
  let preMono = true, pp = Infinity; for (const k of [1000, 200, 66, 30, 11, 5, 3.3, 1, 0]) { const w = pre(k); if (w > pp + 1e-9) preMono = false; pp = w; }
  check('pdi çekimi: ateşlemeye kalan süre/2,2 s (×40 … ×1,5; azalan), ateşlemeden sonra ilk 2,4 s ×1,2, sonra irtifaya göre',
    preMono && pre(1000) === 40 && Math.abs(pre(66) - 30) < 1e-9 && pre(0) === 1.5 && pdi.wf({}, { burnT: 1 }) === 1.2 && pdi.wf({ local: { p: [0, 0, 5] } }, { burnT: 5 }) > 20,
    `×${pre(66).toFixed(0)} @66 s, ×${pre(11).toFixed(1)} @11 s, ×${pre(2).toFixed(1)} @2 s`);
  const apr = apollo2.S.find((s) => s.id === 'approach'), lowAlt = (km) => apr.until({ local: { p: [0, 0, km] } });
  check('temas çekimi: sabit yer kamerası (iniş noktasına bakar, araç kadraja iner); yaklaşma çekimi aracı kadraja alacak irtifada (≤ 40 m) biter',
    td.rig.type === 'ground' && td.rig.fixed === true && Array.isArray(td.rig.aimUp) && lowAlt(0.03) === true && lowAlt(0.05) === false, `yaklaşma 30 m'de ${lowAlt(0.03) ? 'biter' : 'bitmez'}, 50 m'de ${lowAlt(0.05) ? 'biter' : 'bitmez'}`);
}

// ---------------------------------------------------------------- 4) efektler (fx.js)
{
  const g = FX.plumeGeometry(0.4, 10, 2.8), pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal, nA = 32, nS = 36;
  let ok = pos.count === (nS + 1) * (nA + 1) && g.index.count === nS * nA * 6, why = '';
  const ring = (j) => { let r = 0; for (let k = 0; k <= nA; k++) r = Math.max(r, Math.hypot(pos.getX(j * (nA + 1) + k), pos.getY(j * (nA + 1) + k))); return r; };
  const zOf = (j) => pos.getZ(j * (nA + 1));
  if (Math.abs(ring(0) - 0.4) > 1e-6 || zOf(0) !== 0) { ok = false; why += ' çıkış yarıçapı/z'; }
  if (Math.abs(zOf(nS) + 10) > 1e-6 || uv.getY(nS * (nA + 1)) !== 1 || uv.getY(0) !== 0) { ok = false; why += ' uç/uv'; }
  let incr = true; for (let j = 1; j <= nS; j++) if (!(uv.getY(j * (nA + 1)) > uv.getY((j - 1) * (nA + 1)) && zOf(j) < zOf(j - 1))) incr = false;
  if (!incr) { ok = false; why += ' s artışı'; }
  const rmax = Math.max(...Array.from({ length: nS + 1 }, (_, j) => ring(j)));
  if (!(rmax > 0.4 * 2.0 && rmax < 0.4 * 4.2)) { ok = false; why += ' genişleme'; }
  let unit = true; for (let i = 0; i < nor.count; i++) if (Math.abs(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) - 1) > 1e-5) unit = false;
  let idxOk = true; for (let i = 0; i < g.index.count; i++) if (g.index.getX(i) >= pos.count) idxOk = false;
  check('plüm geometrisi: çıkıştan (z=0, s=0) uca (z=−uzunluk, s=1) artan s, yarıçap çıkışta r0 ve açıldıktan sonra 2–4 r0, normaller birim, indisler geçerli', ok && unit && idxOk, why || `r_maks = ${(rmax / 0.4).toFixed(2)}·r0`);
  // parçacıklar
  const P = new FX.Particles(4, { additive: false });
  P.spawn(0, 0, 5, 2, 0, 0, 0.5, 5, 0.5); P.spawn(0, 0, 0.1, 0, 0, 0, 0.5, 5, 0.5); P.spawn(0, 0, 50, 0, 0, 20, 0.5, 0.3, 0.5); P.spawn(0, 0, 9, 0, 0, 0, 0.5, 5, 0.5); P.spawn(1, 1, 1, 0, 0, 0, 1, 1, 1);
  check('Particles: en çok max parçacık (taşan spawn yok sayılır)', P.n === 4);
  for (let i = 0; i < 4; i++) P.update(0.25, [0, 0, -4], 0);                       // 1 s, g = −4 m/s²
  // B (z=0,1 m) yere çarpıp ölür; C ömrü (0,3 s) bitip ölür; A (z=5, vx=2) ve D (z=9) yaşar
  const xs = Array.from({ length: P.n }, (_, i) => P.pos[i * 3]), zs = Array.from({ length: P.n }, (_, i) => P.pos[i * 3 + 2]);
  check('Particles: yer çarpması (killZ) ve ömür sonu parçacığı kaldırır, kalanlar sıkıştırılır ve hâlâ balistik; opaklık ∈ [0, başlangıç]', P.n === 2 && xs.some((x) => Math.abs(x - 2.0) < 1e-6) && zs.every((z) => z > 0) && Array.from({ length: P.n }, (_, i) => P.alpha[i]).every((a) => a >= 0 && a <= 0.5 + 1e-9),
    `n=${P.n}, x=[${xs.map((x) => x.toFixed(2))}], z=[${zs.map((z) => z.toFixed(2))}]`);
  // serbest düşme: z(t) ≈ z0 + ½ g t² (yarı örtük Euler, dt küçükse): 3 m yükseklikten g = −1,62 ile
  const Q = new FX.Particles(2); Q.spawn(0, 0, 3, 0, 0, 0, 0.5, 10, 1); for (let i = 0; i < 100; i++) Q.update(0.01, [0, 0, -1.62], null);
  check('Particles: balistik hareket Ay çekimiyle (1 s sonra z ≈ 3 − ½·1,62 = 2,19 m; ≤ %2 sapma)', Math.abs(Q.pos[2] - (3 - 0.81)) < 0.05, `z = ${Q.pos[2].toFixed(3)}`);
}

// ---------------------------------------------------------------- 5) bindirmeler
{
  const css = rd('../css/cinema.css'), ui = rd('../js/cinemaui.js'), html = rd('../index.html'), app = rd('../js/app.js');
  const trans = [...css.matchAll(/transition:\s*([^;}]+)[;}]/g)].map((m) => m[1]);
  const props = new Set(), durs = [];
  for (const t of trans) for (const part of t.split(/,(?![^(]*\))/)) { const m = /^\s*([a-z-]+)\s+([\d.]+)(m?s)/.exec(part); if (m) { props.add(m[1]); durs.push(+m[2] * (m[3] === 's' ? 1000 : 1)); } }
  const allowed = new Set(['opacity', 'transform', 'clip-path', 'visibility', 'background-color']);
  check('cinema.css: transition: all yok, scale(0) yok; geçişler yalnız transform/opacity/clip-path (+ visibility, background-color); süreler ≤ 1 s', !/transition:\s*all/.test(css) && !/scale\(0\)/.test(css) && [...props].every((p) => allowed.has(p)) && Math.max(...durs) <= 1000, `özellikler: ${[...props].join(', ')}; en uzun ${Math.max(...durs)} ms`);
  const rm = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css);
  check('cinema.css: prefers-reduced-motion bloğu var ve açılış kaydırmasını/silmesini söndürür (letterbox geçişi, clip-path, ayrılma parlaması)', !!rm && /\.cine-bar \{ transition: none/.test(rm[1]) && /clip-path: none/.test(rm[1]) && /cine-flash\.go \{ animation: none/.test(rm[1]));
  check('cinema.css: eğriler tanımlı (--cine-out güçlü ease-out, --cine-io ease-in-out) ve yalnız onlar kullanılır', /--cine-out: cubic-bezier\(0\.23, 1, 0\.32, 1\)/.test(css) && /--cine-io: cubic-bezier\(0\.77, 0, 0\.175, 1\)/.test(css) && !/ease-in[^-o]/.test(css.replace(/ease-in-out/g, '')));
  check('cinema.css: dar/dikey ve kısa ekran (telefon) düzenleri var; letterbox çubuğu dikey ekranda en çok %15; alt karartma yalnız opacity ile belirir',
    /@media \(max-width: 700px\), \(max-aspect-ratio: 1\/1\)/.test(css) && /@media \(max-height: 520px\)/.test(css) && /--bar: clamp\(0px, calc\(\(100vh - 100vw \/ 2\.39\) \/ 2\), 15vh\)/.test(css)
    && /\.cine-scrim \{[^}]*transition: opacity/.test(css) && !/\.cine-scrim \{[^}]*transform/.test(css));
  // cinemaui.js sınıfları CSS'te tanımlı
  const cls = new Set([...ui.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /^(cine|cs-|ct-|cc-)/.test(c)));
  for (const c of ['cine-card', 'live', 'on', 'in', 'out', 'open', 'close', 'chapter', 'active', 'nostrip', 'paused']) cls.add(c);
  const missing = [...cls].filter((c) => !new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '\\b').test(css));
  check('cinemaui.js: kullanılan tüm sınıflar cinema.css\'te tanımlı', missing.length === 0 || missing.every((c) => ['chapter', 'paused'].includes(c)), missing.join(', '));
  check('index.html: cinema.css bağlı, #btnCine düğmesi (simge + erişilebilir ad); app.js: Cinema içe aktarılır, düğme ve C kısayolu, ?cine= adresi, çalışma alanı değişince durur',
    /css\/cinema\.css/.test(html) && /id="btnCine"[^>]*aria-label=/.test(html) && /import \{ Cinema \} from '\.\/cinema\.js'/.test(app) && /btnCine/.test(app) && /k === 'c'/.test(app) && /get\('cine'\)/.test(app) && /cinema\.on\) cinema\.stop\(\)/.test(app));
  check('worker.js: yavaş çekim için warp alt sınırı 1\'in altında (0,05); arayüzün kendi düğmeleri ≥ 1 gönderir', /Math\.max\(0\.05, Math\.min\(100000, d\.value\)\)/.test(rd('../js/worker.js')) && /warp = Math\.max\(1, Math\.min\(100000, w\)\)/.test(app));
}

// ---------------------------------------------------------------- 6) sahne, modeller ve son işlem
{
  const sc = rd('../js/scene.js'), post = rd('../js/post.js');
  const m = /const PBR = \{([\s\S]*?)\n\};/.exec(sc);
  const kinds = {}; for (const k of ['lander', 'orb', 'stage']) { const mm = new RegExp(k + ': \\{([^}]*)\\}').exec(m[1]); kinds[k] = [...mm[1].matchAll(/'([^']+)':/g)].map((x) => x[1]); }
  const names = (n) => { const b = fs.readFileSync(new URL(`../models/${n}.glb`, import.meta.url)), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')); return j.materials.map((x) => x.name); };
  const bad = []; for (const [k, list] of Object.entries(kinds)) { const have = new Set(names(k)); for (const n of list) if (!have.has(n)) bad.push(`${k}:${n}`); }
  check('scene.js PBR tablosu: her malzeme adı ilgili GLB\'de var; değerler [metalik, pürüzlülük] ∈ [0,1]', bad.length === 0 && Object.values(kinds).every((l) => l.length > 0) && [...m[1].matchAll(/\[(\d\.?\d*), (\d\.?\d*)\]/g)].every((x) => +x[1] <= 1 && +x[2] <= 1 && +x[2] >= 0.2), bad.join(', ') || `${Object.values(kinds).flat().length} malzeme`);
  check('scene.js: CINE kamera kipi (cine.rig), setCinematic (son işlem tembel yüklenir, piksel oranı sınırlı), işaretçi/çizgi gizleme, sinematik dolgu ışığı, IBL ortamı (updateEnv), parçacık efektleri (updateFx)',
    /c\.mode === 'CINE' && this\.cine\.rig/.test(sc) && /async setCinematic\(on/.test(sc) && /import\('\.\/post\.js'\)/.test(sc) && /applyCineVis\(\)/.test(sc) && /cineFill/.test(sc) && /updateEnv\(vehPos/.test(sc) && /updateFx\(/.test(sc) && /scene\.environmentRotation/.test(sc));
  {
    // dar/dikey pencerede sinematik görüş açısı genişler: dikey fov', yatay görüş alanı en-boy oranı 1,4'ün altında sabit kalacak biçimde büyütülür (scene.js cineFov ile aynı formül)
    const m = /cineFov\(fov\) \{([\s\S]*?)\n  \}/.exec(sc), f = m && new Function('fov', 'camera', `const self = { camera }; return (function(fov){ ${m[1].replace(/this\./g, 'self.')} }).call(null, fov)`);
    const hfov = (v, a) => 2 * Math.atan(Math.tan(v * Math.PI / 360) * a) * 180 / Math.PI;
    const wide = f && f(40, { aspect: 2.39 }), phone = f && f(40, { aspect: 390 / 844 }), land = f && f(40, { aspect: 844 / 390 });
    check('scene.js cineFov: geniş pencerede (en-boy ≥ 1,4) görüş açısı değişmez; dikey telefonda dikey açı büyür ve yatay görüş alanı korunur (≥ 1,4 en-boy eşdeğeri), sınırlı (≤ 2,2×)',
      !!m && Math.abs(wide - 40) < 1e-9 && Math.abs(land - 40) < 1e-9 && phone > 40 && phone < 170 && hfov(phone, 390 / 844) > hfov(40, 1.0) && Math.tan(phone * Math.PI / 360) / Math.tan(40 * Math.PI / 360) <= 2.2 + 1e-9, `dikey: 40° → ${phone && phone.toFixed(1)}°`);
  }
  check('post.js: MSAA\'lı HDR sahne → bloom → çizgi parlama → OutputPass → film geçişi; kalite kademeleri (yüksek/orta/düşük) ve gerçek kare süresiyle düşürme',
    /UnrealBloomPass/.test(post) && /OutputPass/.test(post) && /samples: high \? 4 : 0/.test(post) && /setLevel\(/.test(post) && /'medium'/.test(post) && /raw \* 1000/.test(post) && /vignette/.test(post) && /grain/.test(post));
  for (const f of ['EffectComposer', 'RenderPass', 'ShaderPass', 'UnrealBloomPass', 'OutputPass', 'MaskPass', 'Pass']) if (!fs.existsSync(new URL(`../lib/addons/postprocessing/${f}.js`, import.meta.url))) { check(`lib/addons/postprocessing/${f}.js var`, false); }
  check('lib/addons: son işlem eklentileri (three r170, MIT) ve gölgelendiriciler yerel', ['CopyShader', 'LuminosityHighPassShader', 'OutputShader'].every((f) => fs.existsSync(new URL(`../lib/addons/shaders/${f}.js`, import.meta.url))));
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
