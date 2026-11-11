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
import { sceneSrc } from './scenesrc.js';
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

// ---------------------------------------------------------------- 1b) kalkış açılışı: hız çizelgesi (rockets.js'teki her roketin kalkış olaylarıyla)
{
  const { ROCKETS } = await import('../js/rockets.js');
  const list = Object.values(ROCKETS).filter((r) => r.ascent && r.ascent.events);
  let ok = list.length > 0, why = '', durs = [];
  for (const rk of list) {
    const A = rk.ascent, seps = A.events.filter((e) => (e.cut != null || e.part) && e.t > C.ASC.LIFT && e.t < A.tIns);
    const w = (r) => C.ascentWarp(r, A.events, A.tIns);
    if (!(w(-3) === 1 && w(0) === 1 && w(C.ASC.LIFT - 1) === 1)) { ok = false; why += ` ${rk.name}: kalkış ×1 değil`; }
    for (const e of seps) if (!(w(e.t) <= C.ASC.SLOW + 1e-9 && w(e.t - C.ASC.PRE) <= C.ASC.SLOW + 1e-9 && w(e.t + C.ASC.POST) <= C.ASC.SLOW + 1e-9)) { ok = false; why += ` ${rk.name}: ${e.name} yavaş değil`; }
    let prev = w(C.ASC.FROM), jump = 0; for (let r = C.ASC.FROM; r < A.tIns; r += 0.1) { const v = w(r); jump = Math.max(jump, Math.abs(v - prev)); prev = v; if (!(v >= 1 && v <= C.ASC.LATE)) { ok = false; why += ` ${rk.name}: aralık dışı`; break; } }
    if (jump > 0.1 * C.ASC.RAMP + 1e-9) { ok = false; why += ` ${rk.name}: sıçrama ${jump.toFixed(2)}`; }       // 0,1 s adımda en çok RAMP·0,1
    const d = C.ascentDuration(A.events, A.tIns); durs.push(`${rk.name} ${d.toFixed(0)} s`);
    if (!(d > 20 && d < 60)) { ok = false; why += ` ${rk.name}: süre ${d.toFixed(0)} s`; }
  }
  check('kalkış açılışı: geri sayım ve kalkış ×1, her ayrılma (kademe, itici, kaporta) yavaş (×1,6), hız sürekli (rampa), ekran süresi 20–60 s', ok, (why || durs.join(' · ')).trim());
  const P0 = { INS: 0, TLI: 5000 }, a = C.buildShots(P0, { ascent: true })[0], b = C.buildShots(P0, {})[0];
  check('kalkış açılışı oynanınca açılış çekimi LS19 kartı yerine "YÖRÜNGEDE" bölüm kartı taşır', a.chapter && a.chapter.title === 'YÖRÜNGEDE' && !a.card && b.card && b.card.title === 'LS19' && !b.chapter);
}

// ---------------------------------------------------------------- 1c) olay alt yazıları (cueOf): gerçek görev olayları ve gösterim olayları
{
  const ab0 = (f) => { const b = fs.readFileSync(new URL(f, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const eo0 = JSON.parse(rd('../data/earth_orient.json')); EO.loadEarthOrientation(eo0);
  const D0 = JSON.parse(rd('../data/designs_default.json'));
  E.setMoonZone(E.SOI_M); makeLive(ab0('../data/de440s.bsp'), ab0('../data/moon_pa_de440_200625.bpc'), eo0, D0.tStart);
  const M = new MI.Mission({ design: D0.profiles.APOLLO.design, landing: 'zem' }); M.P.tLimit = Infinity; for (;;) { if (M.gen.next().done) break; }
  const want = ['SEP-SPRING', 'SEP-TURN', 'SEP-CCAM', 'SEP-CCAM_END', 'SEP-EOM', 'MCC-1', 'LOI-1_END', 'LOI_END', 'DOI', 'CALL', 'DUST', 'CONTACT', 'ENGINE_STOP', 'TOUCH_ENV'];
  const got = new Map(); for (const e of M.events) { const c = C.cueOf(e); if (c) got.set(e.key, c.text); }
  const bad = [...got.values()].filter((t) => /undefined|NaN|null/.test(t)), miss = want.filter((k) => !got.has(k));
  const numOk = /\d/.test(got.get('SEP-CCAM_END') || '') && /\d.*×.*\d/.test(got.get('LOI_END') || '') && /\d/.test(got.get('SEP-SPRING') || '');
  { const TD = await import('../js/touchdown.js'), post = TD.POST_LANDING.map((e) => C.cueOf({ ...e, msg: e.key === 'TILT' ? 'Yüzeyde duruş: araç dikeyden 1.2° eğik (temasta 0.9°, zemin eğimi 0.4°), kalkışa uygun' : e.msg }));
    check('yüzey evresi: motor emniyeti, duruş raporu (eğim iletiden), tank tahliyesi ve kalış kararı alt yazıları; kapanış çekimi temastan +96 s\'ye dek sürer (son olay +89 s)',
      post.every((c) => c && c.pri === 3) && /1,2°|1\.2°/.test(post[1].text) && Math.max(...TD.POST_LANDING.map((e) => e.dt)) < 96 - 5, post.map((c) => (c ? c.text : '—')).join(' | ')); }
  check('olay alt yazıları: APOLLO görevinin ayrılma/CCAM, MCC, LOI, DOI, irtifa çağrıları, toz, temas ışığı ve motor kesme olayları kısa metne döner; sayılar iletiden okunur', !miss.length && !bad.length && numOk,
    miss.length ? `eksik: ${miss.join(', ')}` : bad.length ? `bozuk: ${bad.join(' | ')}` : [...got].map(([k, t]) => `${k}: ${t}`).slice(0, 4).join(' | '));
  { // İngilizce arayüz: alt yazılar (DOM çevirmeniyle) ve anonslar (translateText) sözlükle tamamen İngilizce olmalı
    const I = await import('../js/i18n.js'), EN = (await import('../js/i18n/en.js')).default;
    I.useDictionary(EN);
    const texts = [...got.values(), ...Object.values(C.SAY), 'Ateşleme… kalkış!'], left = texts.map((t) => I.translateText(t)).filter((t) => I.isTurkish(t) || /[çğıöşüİĞŞÇÖÜ]/.test(t));
    I.useDictionary(null);
    check('İngilizce arayüzde görev alt yazıları ve görev kontrol anonsları tamamen İngilizce (sözlükte karşılıksız Türkçe kalmaz)', !left.length, left.length ? left.join(' | ') : `${texts.length} metin`);
  }
  const disp = [{ key: 'LOS', cause: 'moon' }, { key: 'AOS', dur: 2760 }, { key: 'NET', net: 'DSN' }, { key: 'ECL_IN', by: 'Ay' }, { key: 'HANDOVER' }, { key: 'LOS', cause: 'horizon' }, { key: 'AOS', dur: 35 }].map((e) => C.cueOf(e));
  check("gösterim olayları: LOS (Ay'ın arkası), AOS (sessizlik süresi), ağ devri ve gölge alt yazıları; istasyon devri, ufuk LOS'u ve kısa AOS gösterilmez",
    disp[0] && /Ay'ın arkasında/.test(disp[0].text) && disp[1] && /46 dk/.test(disp[1].text) && disp[2] && /Derin Uzay/.test(disp[2].text) && disp[3] && disp[3].pri === 1 && disp[4] === null && disp[5] === null && disp[6] === null, disp.map((c) => (c ? c.text : '—')).join(' | '));
}

// ---------------------------------------------------------------- 1d) ses (cineaudio.js): motor düzeyi ve akorlar (Web Audio tarayıcıda; burada saf işlevler)
{
  const AU = await import('../js/cineaudio.js');
  const off = AU.engineLevel(0, 1, true), lift = AU.engineLevel(1, 1, true), vac = AU.engineLevel(1, 1, false), low = AU.engineLevel(0.2, 1, false), fast = AU.engineLevel(1, 300, false), mid = AU.engineLevel(1, 130, false);
  check('ses: motor gaz 0\'da sessiz; kalkışta (atmosfer) uzaydakinden güçlü, parlak ve çatırtılı; uzayda gazla artar; ×60 üstünde söner, ×200\'de sessiz',
    off.gain === 0 && lift.gain > 2 * vac.gain && lift.cutoff > vac.cutoff && lift.crackle > 0 && vac.crackle === 0 && low.gain < vac.gain && fast.gain === 0 && mid.gain > 0 && mid.gain < vac.gain,
    `kalkış ${lift.gain.toFixed(2)} / uzay ${vac.gain.toFixed(2)} / ×130 ${mid.gain.toFixed(2)}`);
  const ok = AU.CHORDS.every((_, i) => { const f = AU.chordFreqs(i); return f.length === 4 && f.every((x, k) => x > 50 && x < 700 && (k === 0 || x > f[k - 1])); });
  check('ses: akorlar dört sesli, artan, 50–700 Hz; bölüm numarası döngüsel (negatif ve büyük değerler)', ok && Math.abs(AU.midiHz(69) - 440) < 1e-9 && AU.chordFreqs(-1)[0] === AU.chordFreqs(AU.CHORDS.length - 1)[0] && AU.chordFreqs(99).length === 4);
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
  const sc = sceneSrc(), post = rd('../js/post.js');
  const m = /const PBR = \{([\s\S]*?\})\s*\};/.exec(sc);
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
    /UnrealBloomPass/.test(post) && /OutputPass/.test(post) && /samples: high \? \(ultra \? 2 : 4\) : 0/.test(post) && /setLevel\(/.test(post) && /'medium'/.test(post) && /raw \* 1000/.test(post) && /vignette/.test(post) && /grain/.test(post));
  for (const f of ['EffectComposer', 'RenderPass', 'ShaderPass', 'UnrealBloomPass', 'OutputPass', 'MaskPass', 'Pass']) if (!fs.existsSync(new URL(`../lib/addons/postprocessing/${f}.js`, import.meta.url))) { check(`lib/addons/postprocessing/${f}.js var`, false); }
  check('lib/addons: son işlem eklentileri (three r170, MIT) ve gölgelendiriciler yerel', ['CopyShader', 'LuminosityHighPassShader', 'OutputShader'].every((f) => fs.existsSync(new URL(`../lib/addons/shaders/${f}.js`, import.meta.url))));
}
{ const cin = fs.readFileSync(new URL('../js/cinema.js', import.meta.url), 'utf8');
  check('kalkıştan sonraki açılış çekiminde karartma kalkar (post-asc → fade 0): "YÖRÜNGEDE" çekimi siyah kalmaz', /this\.state === 'wait' \|\| this\.state === 'post-asc'\) ui\.fade\(0, 900\)/.test(cin)); }
// 4K çizim (post.js): ultra kademede tampon 3840 × 2160'a sığan en büyük boyut; küçük pencerede üst örnekleme (en çok 4×), 4K ekranda birebir; dokunmatik/az bellekte 4K ile başlanmaz
{
  const PM = { ...(await (async () => { const src = fs.readFileSync(new URL('../js/post.js', import.meta.url), 'utf8'); const m = src.slice(src.indexOf('export const LEVELS'), src.indexOf('export class Post')).replace(/export /g, ''); return new Function(m + '; return { LEVELS, UHD, targetPixelRatio, wantsUltra };')(); })()) };
  const pr = PM.targetPixelRatio, a = pr('ultra', 1920, 1080, 1), b = pr('ultra', 1280, 720, 2), c = pr('ultra', 3840, 2160, 1), d = pr('ultra', 2560, 1080, 1), e = pr('ultra', 800, 450, 1), f = pr('ultra', 1920, 1080, 1, 2048);
  check('4K çizim: 1080p pencerede 2× (3840 × 2160), 720p\'de 3×, 4K ekranda 1×, ultra geniş 2560 × 1080\'de 1,5× (genişlik sınırı), küçük pencerede en çok 4×, doku sınırına uyar; öbür kademeler min(cihaz, 1,5)',
    a === 2 && b === 3 && c === 1 && Math.abs(d - 1.5) < 1e-9 && e === 4 && Math.abs(f - 2048 / 1920) < 1e-9 && pr('high', 1920, 1080, 2) === 1.5 && pr('medium', 1920, 1080, 1) === 1 && pr('low', 1920, 1080, 2) === 2,
    `1080p ${a}×, 720p ${b}×, 4K ${c}×, 2560×1080 ${d}×`);
  check('4K ile başlama: masaüstü evet; dokunmatik, 4 GB bellek ya da 4096 doku sınırı hayır; kademe sırası ultra → high → medium → low',
    PM.wantsUltra({}) && !PM.wantsUltra({ touch: true }) && !PM.wantsUltra({ memGB: 4 }) && !PM.wantsUltra({ maxTex: 4096 }) && PM.LEVELS.join() === 'ultra,high,medium,low' && /LEVELS\.indexOf\(this\.level\) \+ 1/.test(fs.readFileSync(new URL('../js/post.js', import.meta.url), 'utf8')));
}
{ const ca = fs.readFileSync(new URL('../js/cineaudio.js', import.meta.url), 'utf8'), cin = fs.readFileSync(new URL('../js/cinema.js', import.meta.url), 'utf8');
  check('geri sayım sesi: gösterim boyunca tek ses (bir kez seçilir), sayılar ölçülen konuşma gecikmesi kadar erken söyletilir, tık tam saniyede',
    /if \(this\.voiceSet\) return this\.voice;/.test(ca) && /this\.voiceSet = true;/.test(ca) && /u\.onstart = /.test(ca) && /get lead\(\)/.test(ca) && !/getVoices\(\)\.find\(\(x\) => x\.lang[^;]*; if \(v\) u\.voice = v;\s*S\.speak/.test(ca)
    && /const ld = au\.lead, pl = prev \+ ld, rl = real \+ ld;/.test(cin) && /if \(prev < -n && real >= -n\) au\.tick\(\);/.test(cin)); }
// ---------------------------------------------------------------- Dünya–Ay görünümü: iz Ay'la dönen çerçevede (pointstore.js synodicBasis)
{
  const PS = await import('../js/pointstore.js'), E2 = await import('../js/engine.js');
  const t1 = ALL.tStart + 5 * 86400, B1 = PS.synodicBasis(E2.moonPos(t1), E2.moonVel(t1)); let worst = 0, rt = 0, orth = 0;
  for (let k = 0; k <= 12; k++) {
    const tp = t1 - k * 21600, rm = E2.moonPos(tp), B = PS.synodicBasis(rm, E2.moonVel(tp)), p = PS.fromSynodic(PS.toSynodic(rm, B), B1), n = Math.hypot(...p);
    worst = Math.max(worst, Math.acos(Math.min(1, (p[0] * B1[0][0] + p[1] * B1[0][1] + p[2] * B1[0][2]) / n)));
    const q = [1234, -567, 89], back = PS.fromSynodic(PS.toSynodic(q, B), B); rt = Math.max(rt, Math.hypot(...back.map((v, i) => v - q[i])));
    orth = Math.max(orth, Math.abs(B[0][0] * B[1][0] + B[0][1] * B[1][1] + B[0][2] * B[1][2]), Math.abs(Math.hypot(...B[2]) - 1));
  }
  const cin = fs.readFileSync(new URL('../js/cinema.js', import.meta.url), 'utf8'), rig = fs.readFileSync(new URL('../js/camerarig.js', import.meta.url), 'utf8');
  check("Dünya–Ay görünümü: Ay'ın geçmiş konumları dönen çerçevede şimdiki Dünya→Ay eksenine düşer (iz Ay'da biter), eksenler dik, gidiş-dönüş birebir; fragmanın yolculuk çekimi bu çerçevede",
    worst < 1e-6 && rt < 1e-9 && orth < 1e-12 && /syn: true/.test(cin) && /c\.mode === 'SYSTEM' \? unit\(rm\)/.test(rig) && /cine\.syn/.test(sceneSrc()), `eksen sapması ${worst.toExponential(1)} rad`);
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
