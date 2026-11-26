// lookstar19 derlemesinden önce: 33 asteroidin şekil modelini (GLB) site/public/models/ast/ altına koyar.
// Modeller git'te değil (ağır varlıklar GitHub sürüm paketinde: varliklar.json, docs/varliklar.md). Sırayla denenir:
//   1) zaten yerinde ve özeti tutuyorsa dokunulmaz;  2) depodaki web/models/ast (LS19 varlıkları indirilmişse);
//   3) derleme önbelleği .next/cache/lookstar19-models (Vercel derlemeler arasında .next/cache'i saklar: paket her seferinde inmez);
//   4) "asteroit" paketi sürümden indirilir (zaman aşımı ve üç deneme), yalnız gereken GLB'ler açılır.
// Her dosyanın sha256 özeti varliklar.json'la denetlenir; tutmayan dosya yayına girmez, derleme durur.
// varliklar.json depo kökündedir: Vercel'de kök dizin "site" iken "Include files outside the root directory" açık kalmalı (varsayılan).
// Kullanım: node scripts/modeller.mjs (site/ içinden; npm run build bunu prebuild olarak çalıştırır)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.resolve(SITE, '..');
const OUT = path.join(SITE, 'public/models/ast'), LOCAL = path.join(ROOT, 'web/models/ast'), CACHE = path.join(SITE, '.next/cache/lookstar19-models');
const MAN = path.join(ROOT, 'varliklar.json');
const die = (m) => { console.error(`modeller: ${m}`); process.exit(1); };

if (!fs.existsSync(MAN)) die(`${path.relative(SITE, MAN)} yok. Depo kökü derlemede görünmüyor: Vercel'de Settings → Build → "Include files outside the root directory in the Build Step" açık olmalı.`);
const man = JSON.parse(fs.readFileSync(MAN, 'utf8')), pk = man.paketler && man.paketler.asteroit;
if (!pk || !pk.dosyalar) die('varliklar.json içinde "asteroit" paketi yok');
const objects = JSON.parse(fs.readFileSync(path.join(SITE, 'data/asteroids.json'), 'utf8')).objects;
const want = objects.map((o) => `${o.model.key}.glb`);
const hashOf = (f) => pk.dosyalar[`web/models/ast/${f}`];
const noHash = want.filter((f) => !hashOf(f));
if (noHash.length) die(`sürüm paketinde olmayan model: ${noHash.join(', ')} (data/asteroids.json ile varliklar.json uyuşmuyor)`);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const good = (p, f) => fs.existsSync(p) && sha(p) === hashOf(f);
// geçici adla yazıp yeniden adlandırma: yarıda kalan kopya yayına girmez
const place = (src, f) => { const dst = path.join(OUT, f), tmp = `${dst}.${process.pid}.tmp`; fs.copyFileSync(src, tmp); fs.renameSync(tmp, dst); };

fs.mkdirSync(OUT, { recursive: true });
const from = { yerinde: 0, depo: 0, onbellek: 0, indirme: 0 };
let missing = [];
for (const f of want) {
  if (good(path.join(OUT, f), f)) { from.yerinde++; continue; }
  if (good(path.join(LOCAL, f), f)) { place(path.join(LOCAL, f), f); from.depo++; continue; }
  if (good(path.join(CACHE, f), f)) { place(path.join(CACHE, f), f); from.onbellek++; continue; }
  missing.push(f);
}

async function download(url, dest, tries = 3) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { 'User-Agent': 'lookstar19-build' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1024) throw new Error(`yanıt çok kısa (${buf.length} B)`);           // içerik denetimi: her GLB'nin özeti (aşağıda)
      fs.writeFileSync(dest, buf); return;
    } catch (e) {
      if (k >= tries) throw new Error(`${url}: ${e.message}`);
      console.warn(`modeller: indirme ${k}. denemede olmadı (${e.message}); ${2 * k} sn sonra yeniden`);
      await new Promise((r) => setTimeout(r, 2000 * k));
    }
  }
}

if (missing.length) {
  const url = `https://github.com/${man.depo}/releases/download/${man.etiket}/${pk.ad}`, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-ast-'));
  console.log(`modeller: ${missing.length} GLB eksik, ${pk.ad} indiriliyor`);
  try {
    const tar = path.join(tmp, pk.ad);
    await download(url, tar);
    execFileSync('tar', ['-xf', tar, '-C', tmp, ...missing.map((f) => `web/models/ast/${f}`)]);
    fs.mkdirSync(CACHE, { recursive: true });
    for (const f of missing) {
      const src = path.join(tmp, 'web/models/ast', f);
      if (!good(src, f)) die(`${f}: paketteki dosyanın özeti varliklar.json'la tutmuyor`);
      place(src, f); fs.copyFileSync(src, path.join(CACHE, f)); from.indirme++;
    }
  } catch (e) { die(e.message); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  missing = [];
}
const bad = want.filter((f) => !good(path.join(OUT, f), f));
if (bad.length) die(`özet tutmayan ya da eksik: ${bad.join(', ')}`);
// listede olmayan eski modeller (cisim çıkarıldıysa) yayından kalkar
for (const f of fs.readdirSync(OUT)) if (!want.includes(f)) fs.rmSync(path.join(OUT, f), { force: true });
console.log(`modeller: ${want.length} GLB hazır (${Object.entries(from).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')})`);
