// Dünyadaki yörüngesel fırlatma rampalarını The Space Devs Launch Library 2'den derler: web/data/pads.json
// Kaynak: https://ll.thespacedevs.com/2.3.0/pads/ (kimliksiz kullanım saatte 15 istek: 3 sayfa yeter). Sayfalama kayıtları yineleyebilir: kimliğe göre tekilleştirilir.
// Yalnız en az bir yörüngesel fırlatma denemesi olan rampalar alınır. Kullanım (depo kökünden):
//   node tools/rampa_derle.mjs                      LL2'den indirir
//   node tools/rampa_derle.mjs s0.json s1.json …    önceden indirilmiş sayfalardan (curl "<BASE>0" -o s0.json; vekilli ortamlarda)
import fs from 'fs';
const BASE = 'https://ll.thespacedevs.com/2.3.0/pads/?format=json&ordering=id&limit=100&offset=';       // ordering=id: kararlı sayfalama
const all = new Map(), files = process.argv.slice(2);
for (const f of files) for (const p of JSON.parse(fs.readFileSync(f, 'utf8')).results) all.set(p.id, p);
for (let off = 0, total = files.length ? 0 : Infinity; off < total; off += 100) {
  const r = await fetch(BASE + off, { headers: { 'User-Agent': 'LS19 egitim simulasyonu (rampa derleme)' } });
  if (!r.ok) throw new Error(`LL2 ${r.status}`);
  const d = await r.json(); total = d.count;
  for (const p of d.results) all.set(p.id, p);
  await new Promise((res) => setTimeout(res, 1500));
}
const pads = [...all.values()].filter((p) => (p.orbital_launch_attempt_count || 0) > 0 && Number.isFinite(+p.latitude) && Number.isFinite(+p.longitude))
  .map((p) => ({ id: p.id, name: p.name, loc: p.location ? p.location.name : '', locId: p.location ? p.location.id : null,
    cc: p.country ? p.country.alpha_2_code : '', country: p.country ? p.country.name : '', lat: +(+p.latitude).toFixed(5), lon: +(+p.longitude).toFixed(5),
    n: p.orbital_launch_attempt_count, active: !!p.active, wiki: p.wiki_url || null }))
  .sort((a, b) => a.country.localeCompare(b.country) || a.loc.localeCompare(b.loc) || b.n - a.n);
const out = { kaynak: 'The Space Devs — Launch Library 2 (ll.thespacedevs.com/2.3.0/pads)', derlendi: new Date().toISOString().slice(0, 10), pads };
fs.writeFileSync(new URL('../web/data/pads.json', import.meta.url), JSON.stringify(out));
console.log(pads.length, 'yörüngesel rampa;', pads.filter((p) => p.active).length, 'etkin');
