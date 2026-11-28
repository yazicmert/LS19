// lookstar19 roket verisi: 2020'den bu yana yörüngeye ya da derin uzaya fırlatma yapmış her araç (GCAT LV_Type) için
//   ölçüler: GCAT lv.tsv (boy, çap, kütle, taşıma kapasitesi, kalkış itkisi) ve lvs.tsv + stages.tsv (kademeler: boy, çap, çokluk = yan itici sayısı)
//   kademe ayrıntısı: stages.tsv (dolu kütle t, kuru kütle kg, vakum ve deniz seviyesi itkisi kN, yanma süresi s) ve engines.tsv (oksitleyici,
//   yakıt, motor itkisi, Isp, yanma süresi, yanma odası sayısı; katılarda dolu kütle). GCAT'in "?" işaretli değerleri q listesinde belirtilir.
//   Elle derlenen ayrıntı (tank düzeni, parçalar, üretici kaynakları) ayrı dosyada: data/rocket-detail.json; bu betik ona dokunmaz.
//   tarihçe: GCAT launch.tsv'deki bütün yörünge/derin uzay fırlatmaları (tarih, uçuş, görev, yer, sonuç)
// Kaynak: GCAT, J. McDowell (planet4589.org), CC BY 4.0. Füzeler ve sondaj roketleri (LaunchCode O/D dışı) alınmaz.
// Model çizimi bu ölçülerden yapılır (components/RocketModel.jsx): "ölçülerden çizim", gerçek bir 3B model değil.
// Kullanım (depo kökünden): node site/scripts/roketler.mjs [--rapor rapor.md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTsv, gcatDate } from '../lib/sat.js';
import { rocketSlug } from '../lib/rockets-match.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(ROOT, 'site/data/rockets.json');
const GCAT = 'https://planet4589.org/space/gcat/tsv', UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
const RAPOR = process.argv.includes('--rapor') ? process.argv[process.argv.indexOf('--rapor') + 1] : null;
const SINCE = '2020';
const num = (v) => { const s = String(v ?? '').trim().replace(/[?~]$/, ''); return s && s !== '-' && Number.isFinite(+s) ? +s : null; };
const txt = (v) => { const s = String(v ?? '').trim(); return s && s !== '-' ? s : null; };
const unsure = (v, flag) => /\?/.test(String(v ?? '')) || /\?/.test(String(flag ?? ''));
// GCAT değeri ve belirsizlik işareti: { alan: sayı } ve "?" ise q'ya alan adı
// GCAT'te 0 "bilinmiyor" yerine de kullanılır (Isp 0, kuru kütle 0): sıfır alınmaz
const pick = (o, q, k, v, flag) => { const n = num(v); if (n == null || n === 0) return; o[k] = n; if (unsure(v, flag)) q.push(k); };

async function get(url) {
  for (let k = 1; ; k++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
    catch (e) { if (k >= 3) throw new Error(`${url}: ${e.message}`); await new Promise((res) => setTimeout(res, 3000 * k)); }
  }
}
const [launchTxt, lvTxt, lvsTxt, stagesTxt, orgsTxt, sitesTxt, enginesTxt] = await Promise.all(['launch/launch.tsv', 'tables/lv.tsv', 'tables/lvs.tsv', 'tables/stages.tsv', 'tables/orgs.tsv', 'tables/sites.tsv', 'tables/engines.tsv'].map((f) => get(`${GCAT}/${f}`)));
const updated = (/# Updated (\d{4} \w{3} +\d{1,2})/.exec(launchTxt) || [])[1] || null;
const launches = parseTsv(launchTxt), lv = parseTsv(lvTxt), lvs = parseTsv(lvsTxt), stages = new Map(parseTsv(stagesTxt).map((r) => [r.Stage_Name, r]));
const orgs = new Map(parseTsv(orgsTxt).map((r) => [r.Code, r])), sites = new Map(parseTsv(sitesTxt).map((r) => [r.Site, r]));
const engines = new Map(parseTsv(enginesTxt).map((r) => [String(r.Name || '').trim(), r]));
if (launches.length < 50000 || lv.length < 1000 || stages.size < 1000 || engines.size < 500) throw new Error('GCAT tabloları eksik');
// motor kaydı (engines.tsv): itki kN (tipik; varsa vakum), Isp s (varsa vakum; IspFlag "s" deniz seviyesi), süre s, oda sayısı, katılarda dolu kütle kg
const engineRec = (name) => {
  const e = engines.get(txt(name) || ''); if (!e) return null;
  const q = [], o = { ox: txt(e.Oxidizer)?.replace(/\?$/, '') || null, fuel: txt(e.Fuel)?.replace(/\?$/, '') || null, group: txt(e.Group) };
  if (unsure(e.Oxidizer) || unsure(e.Fuel)) q.push('prop');
  pick(o, q, 'thrust', e.Thrust, e.TFlag); pick(o, q, 'isp', e.Isp, e.IspFlag && e.IspFlag.trim() !== 's' ? e.IspFlag : ''); pick(o, q, 'dur', e.Duration, e.DurFlag);
  pick(o, q, 'mass', e.Mass, e.MFlag); pick(o, q, 'impulse', e.Impulse, e.ImpFlag);
  if (String(e.IspFlag || '').trim() === 's' && o.isp != null) o.ispSL = true;
  o.chambers = num(e.Chambers) || 1;
  if (q.length) o.q = q;
  return o;
};

const orbital = launches.filter((l) => /^[OD]/.test(l.LaunchCode || ''));
const active = new Set(orbital.filter((l) => (l.Launch_Date || '') >= SINCE).map((l) => l.LV_Type));
const orgName = (codes) => (txt(codes) ? codes.split('/').map((c) => { const o = orgs.get(c.trim()); return o ? txt(o.ShortName) || txt(o.Name) || c : c; }) : []);
const outcome = (code) => { const c = String(code || '').trim()[1]; return c === 'S' ? 'S' : c === 'F' ? 'F' : c === 'E' ? 'E' : 'U'; };

const vehicles = [];
for (const name of active) {
  const hist = orbital.filter((l) => l.LV_Type === name).sort((a, b) => num(a.Launch_JD) - num(b.Launch_JD));
  // çizim için varyant: son iki yılda en sık uçan (yoksa son uçuşunki); lv.tsv'de o varyantın satırı yoksa adın ilk satırı
  const recent = hist.slice(-Math.max(5, Math.ceil(hist.length / 4))), freq = new Map();
  for (const l of recent) { const v = txt(l.Variant) || '-'; freq.set(v, (freq.get(v) || 0) + 1); }
  const variant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const rows = lv.filter((r) => r.LV_Name === name), row = rows.find((r) => (txt(r.LV_Variant) || '-') === variant) || rows.find((r) => !txt(r.LV_Variant)) || rows[0];
  if (!row) continue;
  const stRows = lvs.filter((r) => r.LV_Name === name && (txt(r.LV_Variant) || '-') === (txt(row.LV_Variant) || '-'));
  const st = stRows.filter((r) => r.Dummy !== 'D' && r.Dummy !== 'Y').map((r) => {
    const s = stages.get(r.Stage_Name) || {};
    const o = { no: String(r.Stage_No).trim(), name: txt(r.Stage_Name), mult: num(r.Multiplicity) || 1, length: num(s.Length), diameter: num(s.Diameter),
      mass: num(s.Launch_Mass), thrust: num(s.Thrust), engine: txt(s.Engine), neng: num(s.NEng) };
    if (!/^[0-9]$/.test(o.no)) return o;                                // kaporta, uçak, ara parça: ayrıntı yok
    const q = [];
    pick(o, q, 'dry', s.Dry_Mass, s.Dry_Mass_Flag); pick(o, q, 'thrustSL', s.ThrustSL, s.ThrustSL_Flag); pick(o, q, 'dur', s.Duration);
    for (const [k, f] of [['length', s.Length_Flag], ['diameter', s.Diameter_Flag], ['mass', s.Launch_Mass_Flag], ['thrust', s.Thrust_Flag]]) if (o[k] != null && unsure('', f)) q.push(k);
    if (q.length) o.q = q;
    const e = engineRec(s.Engine); if (e) o.eng = e;
    return o;
  });
  const site = (code) => { const s = sites.get(txt(code)); return s ? txt(s.ShortName) || txt(s.Name) : txt(code); };
  const L = hist.map((l) => {
    const d = gcatDate(l.Launch_Date);
    return { tag: txt(l.Launch_Tag), date: d && d.iso, time: d && d.time, variant: txt(l.Variant), flight: txt(l.Flight_ID), mission: txt(l.Mission) || txt(l.Flight), site: site(l.Launch_Site), pad: txt(l.Launch_Pad), outcome: outcome(l.LaunchCode) };
  }).filter((l) => l.date);
  const ok = L.filter((l) => l.outcome === 'S').length, bad = L.filter((l) => l.outcome === 'F').length;
  vehicles.push({
    slug: rocketSlug(name), name, family: txt(row.LV_Family), manufacturer: orgName(row.LV_Manufacturer), variant: txt(row.LV_Variant),
    spec: { length: num(row.Length), diameter: num(row.Diameter), launchMass: num(row.Launch_Mass), leo: num(row.LEO_Capacity), gto: num(row.GTO_Capacity), thrust: num(row.TO_Thrust),
      minStage: num(row.LV_Min_Stage), maxStage: num(row.LV_Max_Stage), stages: st },
    stats: { total: L.length, success: ok, failure: bad, first: L[0] && L[0].date, last: L[L.length - 1] && L[L.length - 1].date },
    launches: L,
  });
}
vehicles.sort((a, b) => b.stats.total - a.stats.total || a.name.localeCompare(b.name));
// doğrulama: tekil adres, ölçüler, kademeler; tutmazsa yazılmaz
const errors = [], slugs = new Set();
for (const v of vehicles) {
  if (slugs.has(v.slug)) errors.push(`${v.name}: adres çakışması (${v.slug})`); slugs.add(v.slug);
  if (!(v.spec.length > 0 && v.spec.diameter > 0)) errors.push(`${v.name}: boy/çap yok`);
  if (!v.spec.stages.some((s) => /^[1-9]$/.test(s.no))) errors.push(`${v.name}: kademe yok`);
  for (const s of v.spec.stages.filter((x) => /^[0-9]$/.test(x.no))) if (s.dry != null && s.mass != null && s.dry > s.mass * 1000) errors.push(`${v.name} ${s.name}: kuru kütle dolu kütleden büyük`);
  if (!(v.stats.total > 0)) errors.push(`${v.name}: uçuş yok`);
}
const drop = vehicles.filter((v) => !(v.spec.length > 0 && v.spec.diameter > 0) || !v.spec.stages.some((s) => /^[1-9]$/.test(s.no)));
const keep = vehicles.filter((v) => !drop.includes(v));
if (keep.length < 60 || errors.filter((e) => /çakışma|uçuş yok/.test(e)).length) { console.error(`veri yazılmadı:\n${errors.map((x) => `  - ${x}`).join('\n')}`); process.exit(1); }
const next = { retrieved: new Date().toISOString().slice(0, 10), source: 'GCAT, J. McDowell, planet4589.org (CC BY 4.0)', updated, since: SINCE, vehicles: keep };
fs.writeFileSync(OUT, JSON.stringify(next) + '\n');
const stN = keep.flatMap((v) => v.spec.stages.filter((x) => /^[0-9]$/.test(x.no))), engN = stN.filter((x) => x.eng && (x.eng.fuel || x.eng.ox)).length;
const summary = `${keep.length} roket (${SINCE}'den bu yana yörünge fırlatması yapmış); ${keep.reduce((n, v) => n + v.stats.total, 0)} fırlatma; GCAT motor kaydı olan kademe ${engN}/${stN.length}; ölçüsü eksik olduğu için çizilmeyen ${drop.length}: ${drop.map((v) => v.name).join(', ') || '—'}. GCAT ${updated}.`;
console.log(`${summary}\n→ ${path.relative(ROOT, OUT)}`);
if (RAPOR) fs.writeFileSync(RAPOR, `${summary}\n`);
