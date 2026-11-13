// Görev iptali (abort.js, aytext.js › abortSummary): Apollo profili görevinin çeşitli anlarından Dünya'ya dönüş için en küçük tek yakış.
//   1) çeviri yolculuğu (TLI'dan sonra): dönüş birkaç on m/s; çözüm hedef perijeyi (40 km) tutturur
//   2) Ay yörüngesi (LLO 110 km): şimdi yakmak çoğu zaman olanaksız; bir yörünge periyodunda en iyi an bulunur ve Δv yamalı konik sınırlar içindedir:
//      Ay'dan kaçış alt sınırı (v_kaçış − v_dairesel ≈ 680 m/s) < Δv < Apollo 11 TEI'si (1.000,6 m/s, daha hızlı ~60 saatlik dönüş için)
//   3) metin: yeter / yetmez / serbest dönüş
import fs from 'fs';
import * as EO from '../js/earth.js';
import * as E from '../js/engine.js';
import { makeLive } from '../js/live.js';
import { Mission, twoStageDesign } from '../js/mission.js';
import { solveReturn, solveReturnWindow, returnPerigee } from '../js/abort.js';
import { abortSummary } from '../js/aytext.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url));
const ab = (f) => { const b = rd(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const defs = JSON.parse(rd('data/designs_default.json')), SPK = ab('data/de440s.bsp'), PCK = ab('data/moon_pa_de440_200625.bpc'), eo = JSON.parse(rd('data/earth_orient.json'));
EO.loadEarthOrientation(eo); makeLive(SPK, PCK, eo, defs.tStart); E.setMoonZone(E.SOI_M);
// görevi uçur, anları kaydet
const M = new Mission({ design: twoStageDesign(defs.profiles.APOLLO.design), landing: 'zem' }); M.P.tLimit = Infinity;
const snap = {}, seen = new Set();
for (;;) { const r = M.gen.next(); if (r.done) break; for (const e of M.events) if (!seen.has(e)) { seen.add(e); const s = M.P.s.toFrame('N'); snap[e.key] ||= { t: s.t, r: s.r, v: s.v }; } if (snap.LOI_END && snap['SEP-EOM'] && snap['MCC-2']) break; }
const hp = (x) => x.hp;

// 1) çeviri yolculuğu
for (const k of ['SEP-EOM', 'MCC-2']) {
  const s = snap[k], t0 = performance.now(), sol = solveReturn(s.t, s.r, s.v), chk = returnPerigee(s.t, s.r, s.v.map((x, i) => x + sol.dv[i]));
  console.log(`  ${k}: Δv ${sol.dvMag.toFixed(1)} m/s, perije ${sol.hp.toFixed(1)} km, giriş ${((sol.tEntry - s.t) / 86400).toFixed(2)} gün sonra (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  check(sol.ok && !sol.free && sol.dvMag > 1 && sol.dvMag < 200 && Math.abs(hp(chk) - 40) < 1 && sol.tEntry > s.t + 86400, `${k}: çeviri yolculuğundan dönüş birkaç on m/s, 40 km boşluk perijesi bağımsız süzülmeyle doğrulanır`);
}
// 2) Ay yörüngesi
{
  const s = snap.LOI_END, rs = E.sub(s.r, E.moonPos(s.t)), vs = E.sub(s.v, E.moonVel(s.t)), rn = E.norm(rs), vc = Math.sqrt(E.MU_M / rn), vesc = Math.sqrt(2 * E.MU_M / rn);
  const t0 = performance.now(), w = solveReturnWindow(s.t, s.r, s.v), chk = returnPerigee(w.tBurn, ...(() => { const P = new E.Propagator(new E.State(s.t, s.r, s.v, 'N'), E.dummyVehicle(), 60, 1, { nbody: true }); P.runUntil(w.tBurn); return [P.s.r, P.s.v.map((x, i) => x + w.dv[i])]; })());
  console.log(`  LLO (${(rn - E.R_M).toFixed(0)} km, |v| ${E.norm(vs).toFixed(3)} km/s): en iyi an +${((w.tBurn - s.t) / 60).toFixed(0)} dk / periyot ${(w.period / 60).toFixed(0)} dk, Δv ${w.dvMag.toFixed(1)} m/s, giriş ${((w.tEntry - w.tBurn) / 86400).toFixed(2)} gün sonra (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  check(w.ok && w.period > 100 * 60 && w.period < 130 * 60 && w.tBurn >= s.t && w.tBurn <= s.t + w.period, 'LLO: bir yörünge periyodu (~2 saat) içinde yakış anı bulunur');
  check(w.dvMag > (vesc - vc) * 1000 && w.dvMag < 1000.6, `LLO: Δv kaçış alt sınırının (${((vesc - vc) * 1000).toFixed(0)} m/s) üstünde, Apollo 11 TEI'sinin (1.000,6 m/s) altında`);
  check(Math.abs(hp(chk) - 40) < 1, 'LLO dönüşü 40 km boşluk perijesini tutturur (bağımsız süzülme)');
}
// 3) metin
{
  const utc = (t) => `T${t}`, base = { t: 0, utc };
  const good = abortSummary({ ...base, now: { ok: true, dvMag: 40, tEntry: 8e5, tBurn: 0 }, win: { ok: true, dvMag: 35, tEntry: 9e5, tBurn: 600, period: 21600 }, dvLeft: 2500 });
  const bad = abortSummary({ ...base, now: { ok: false }, win: { ok: true, dvMag: 802, tEntry: 5e5, tBurn: 2340, period: 7140 }, dvLeft: 300 });
  const free = abortSummary({ ...base, now: { ok: true, free: true, hp: 13, tEntry: 7e5 }, dvLeft: 100 });
  check(good.kind === 'good' && /35 m\/s gerekli/.test(good.title) && good.rows.length === 3 && /\+10 dk/.test(good.rows[1][1]), 'yeter: en küçük (en iyi an) Δv ile karşılaştırılır');
  check(bad.kind === 'bad' && /yetmez/.test(bad.title) && /tek yakışla dönüş yok/.test(bad.rows[0][1]), 'yetmez; şimdi olanaksızsa söylenir');
  check(free.kind === 'good' && /Serbest dönüş/.test(free.title), 'serbest dönüş: yakış gerekmez');
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
