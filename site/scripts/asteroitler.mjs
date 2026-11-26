// lookstar19 asteroit verisi: LS19'un gerçek şekil modeli olan 33 asteroidin (web/models/ast/katalog.json) yörünge ve fiziksel
// özellikleri JPL SBDB API'sinden (tam hassasiyet) çekilir, model bilgisiyle birleştirilip site/data/asteroids.json'a yazılır.
// Dosya depoya girer: site derlemesi ağa bağımlı olmaz; veri bu betikle yenilenir (ileride zamanlanmış iş, yol haritası Faz 3).
// Kullanım (depo kökünden): node site/scripts/asteroitler.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KAT = path.join(ROOT, 'web/models/ast/katalog.json'), OUT = path.join(ROOT, 'site/data/asteroids.json');
const UA = { 'User-Agent': 'lookstar19/0.1 (non-commercial space library; +https://github.com/yazicmert/LS19)' };

// katalogdaki Türkçe kaynak satırlarının İngilizcesi (model kaynakları: NASA PDS Küçük Cisimler Düğümü, NASA Eyes)
const EN = [[/ vd\./g, ' et al.'], [/Radar modeli/g, 'Radar shape model'], [/radar modeli/g, 'radar shape model'], [/Dawn SPC modeli/g, 'Dawn SPC shape model'],
  [/Rosetta OSIRIS modeli/g, 'Rosetta OSIRIS shape model'], [/\(geri yönlü\)/g, '(retrograde)'], [/\(ana gövde\)/g, '(primary body)'],
  [/radar \+ uyarlamalı optik şekli; yüzey dokusu temsilî/g, 'radar + adaptive-optics shape; surface texture illustrative']];
const en = (s) => EN.reduce((t, [a, b]) => t.replace(a, b), s);

const num = (v) => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);
const jdToIso = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);

async function sbdb(sstr) {
  const u = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(sstr)}&phys-par=1&full-prec=1`;
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(u, { headers: UA }); if (r.ok) return r.json(); if (r.status < 500) throw new Error(`HTTP ${r.status}`); } catch (e) { if (k === 2) throw e; }
    await new Promise((res) => setTimeout(res, 1500 * (k + 1)));
  }
}

const kat = JSON.parse(fs.readFileSync(KAT, 'utf8')), out = [];
for (const [sstr, m] of Object.entries(kat)) {
  const d = await sbdb(sstr), o = d.object, orb = d.orbit, el = Object.fromEntries(orb.elements.map((e) => [e.name, num(e.value)]));
  const ph = Object.fromEntries((d.phys_par || []).map((p) => [p.name, p.value]));
  // ad: adı olan cisimde yalnız ad (Apophis); adsız numaralıda "276049 (2002 CE26)"; numarasızda geçici gösterim (1998 KY26)
  const full = o.fullname.trim(), bare = full.replace(/^\s*\d+\s+/, '').replace(/\s*\(.*\)\s*$/, '').trim();
  const name = bare && !/^\(/.test(bare) ? bare : full.replace(/^\((.*)\)$/, '$1');
  out.push({
    id: m.key, sstr, des: o.des, fullname: full, name,
    number: o.prefix ? null : num(o.des), neo: !!o.neo, pha: !!o.pha, orbitClass: { code: o.orbit_class.code, name: o.orbit_class.name },
    epoch: { jd: num(orb.epoch), date: jdToIso(num(orb.epoch)) }, elements: { a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, q: el.q, ad: el.ad, per: el.per, n: el.n },
    moid: num(orb.moid), conditionCode: orb.condition_code ?? null, dataArc: num(orb.data_arc),
    phys: { H: num(ph.H), diameter: num(ph.diameter), rotPer: num(ph.rot_per), albedo: num(ph.albedo), specB: ph.spec_B || null, specT: ph.spec_T || null, density: num(ph.density) },
    model: { key: m.key, method: m.yontem === 'uzay' ? 'spacecraft' : 'radar', textured: !!m.tex, tris: m.tris, radiusKm: m.req_km, dims: m.dims.map((x) => +(x * m.req_km).toFixed(4)),
      source: { tr: m.kaynak, en: en(m.kaynak) } },
  });
  process.stdout.write('.');
  await new Promise((res) => setTimeout(res, 250));                        // SBDB'ye nazik: istekler arası kısa bekleme
}
out.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.des.localeCompare(b.des));
fs.writeFileSync(OUT, JSON.stringify({ retrieved: new Date().toISOString().slice(0, 10), source: 'JPL Small-Body Database API (ssd-api.jpl.nasa.gov/sbdb.api)', objects: out }, null, 1) + '\n');
console.log(`\n${out.length} cisim → ${path.relative(ROOT, OUT)}`);
