// lookstar19 derlemesinden önce: 33 asteroidin şekil modelini (GLB) site/public/models/ast/ altına koyar.
// Modeller git'te değil (ağır varlıklar GitHub sürüm paketinde: varliklar.json, docs/varliklar.md). Yerelde web/models/ast'ta varsa
// oradan kopyalanır; yoksa "asteroit" paketi sürümden indirilip yalnız gereken GLB'ler açılır. Kullanım: node scripts/modeller.mjs (site/ içinden)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.resolve(SITE, '..');
const OUT = path.join(SITE, 'public/models/ast'), LOCAL = path.join(ROOT, 'web/models/ast');
const objects = JSON.parse(fs.readFileSync(path.join(SITE, 'data/asteroids.json'), 'utf8')).objects;
const want = objects.map((o) => `${o.model.key}.glb`);
fs.mkdirSync(OUT, { recursive: true });

const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'varliklar.json'), 'utf8')), pk = man.paketler.asteroit;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const okFile = (f) => { const p = path.join(OUT, f), h = pk.dosyalar[`web/models/ast/${f}`]; return fs.existsSync(p) && (!h || sha(fs.readFileSync(p)) === h); };

let missing = want.filter((f) => !okFile(f));
for (const f of missing) { const src = path.join(LOCAL, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f)); }
missing = want.filter((f) => !okFile(f));
if (missing.length) {
  const url = `https://github.com/${man.depo}/releases/download/${man.etiket}/${pk.ad}`, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-ast-'));
  console.log(`modeller: ${missing.length} GLB eksik, ${pk.ad} indiriliyor (${(pk.bayt / 1048576).toFixed(1)} MB)`);
  const r = await fetch(url); if (!r.ok) throw new Error(`modeller: ${url} → HTTP ${r.status}`);
  const tar = path.join(tmp, pk.ad); fs.writeFileSync(tar, Buffer.from(await r.arrayBuffer()));
  execFileSync('tar', ['-xf', tar, '-C', tmp, ...missing.map((f) => `web/models/ast/${f}`)]);
  for (const f of missing) fs.copyFileSync(path.join(tmp, 'web/models/ast', f), path.join(OUT, f));
  fs.rmSync(tmp, { recursive: true, force: true });
}
const bad = want.filter((f) => !okFile(f));
if (bad.length) throw new Error(`modeller: özet tutmayan ya da eksik: ${bad.join(', ')}`);
console.log(`modeller: ${want.length} GLB hazır (${path.relative(ROOT, OUT)})`);
