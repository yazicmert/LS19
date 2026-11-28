// lookstar19 uydu istatistiği: 1957'den bu yana yörüngeye ya da ötesine fırlatılan her yükün (GCAT ana kataloglarında türü P) fırlatma günü,
//   GCAT sınıfı (ticari / sivil / savunma / amatör), görev türü, sahip ülkesi, fırlatma aracı ve işletmecisi; site/data/satstats.json'a sıkıştırılmış
//   olarak (aynı gün ve bileşimdeki yükler tek satır). Sayfa (/[lang]/satellites/stats) yıl, ay ve hafta toplamlarını istemcide bundan çıkarır.
// Kaynak: GCAT, J. McDowell (planet4589.org), CC BY 4.0. Üretim ve doğrulama: lib/satstats-build.js (buildStats, checkStats).
// Toplamlar tutmazsa, tarihi okunamayan yük binde birden çoksa ya da yük sayısı önceki dosyaya göre %1'den fazla düşerse dosyaya dokunulmaz.
// Kullanım (depo kökünden): node site/scripts/uydu_istatistik.mjs [--yerel klasör] [--rapor rapor.md]
//   --yerel: satcat.tsv, satcat100k.tsv, psatcat.tsv, psatcat100k.tsv, launch.tsv, orgs.tsv önceden indirilmişse o klasörden okunur
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTsv, indexBy } from '../lib/sat.js';
import { buildStats, checkStats } from '../lib/satstats-build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(ROOT, 'site/data/satstats.json');
const GCAT = 'https://planet4589.org/space/gcat/tsv', UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null), YEREL = arg('--yerel'), RAPOR = arg('--rapor');

async function get(f) {
  if (YEREL) return fs.readFileSync(path.join(YEREL, path.basename(f)), 'utf8');
  for (let k = 1; ; k++) {
    try { const r = await fetch(`${GCAT}/${f}`, { headers: UA, signal: AbortSignal.timeout(180_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
    catch (e) { if (k >= 3) throw new Error(`${f}: ${e.message}`); await new Promise((res) => setTimeout(res, 3000 * k)); }
  }
}
const FILES = ['cat/satcat.tsv', 'cat/satcat100k.tsv', 'cat/psatcat.tsv', 'cat/psatcat100k.tsv', 'launch/launch.tsv', 'tables/orgs.tsv'];
const [satTxt, sat100Txt, psatTxt, psat100Txt, launchTxt, orgsTxt] = await Promise.all(FILES.map(get));
const updated = (/# Updated (\d{4} \w{3} +\d{1,2})/.exec(satTxt) || [])[1]?.replace(/ +/g, ' ') || null;
const sat = [...parseTsv(satTxt), ...parseTsv(sat100Txt)], psat = indexBy([...parseTsv(psatTxt), ...parseTsv(psat100Txt)], 'JCAT');
const launches = indexBy(parseTsv(launchTxt), 'Launch_Tag'), orgs = indexBy(parseTsv(orgsTxt), 'Code');
if (sat.length < 60000 || psat.size < 20000 || launches.size < 50000 || orgs.size < 1000) throw new Error('GCAT tabloları eksik');

const { data, info } = buildStats({ sat, psat, launches, orgs, updated, retrieved: new Date().toISOString().slice(0, 10) });
let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* ilk çalıştırma */ }
const errors = checkStats(data, prev);
// yük kataloğunda (psatcat) satırı olmayan yük sınıfsız kalır: birkaç taneden fazlası kaynağın eksik indiğini gösterir
if (info.noPayloadRow > Math.max(20, data.total * 0.005)) errors.push(`yük kataloğunda satırı olmayan ${info.noPayloadRow} yük`);
if (info.noLaunch > 20) errors.push(`fırlatma kaydı bulunamayan ${info.noLaunch} yük`);
if (errors.length) { console.error(`veri yazılmadı:\n${errors.map((x) => `  - ${x}`).join('\n')}`); process.exit(1); }
const json = JSON.stringify(data) + '\n';
fs.writeFileSync(OUT, json);
const summary = `${data.total} yük (1957–${data.asOf.slice(0, 4)}), ${info.groups} satır, ${(json.length / 1024).toFixed(0)} KB; GCAT ${updated}.${prev ? ` Önceki: ${prev.total}.` : ''}`;
console.log(summary);
if (RAPOR) fs.writeFileSync(RAPOR, `### Uydu istatistiği\n\n${summary}\n`);
