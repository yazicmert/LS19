// lookstar19 derlemesinden önce: asteroit ve uydu şekil modellerini (GLB) site/public/models/{ast,sat}/ altına koyar.
// Modeller git'te değil (ağır varlıklar GitHub sürüm paketinde: varliklar.json, docs/varliklar.md). Her kaynak dosya sha256 özetiyle
// denetlenir ve sırayla şuradan alınır:
//   1) depodaki web/models/... (LS19 varlıkları indirilmişse);  2) derleme önbelleği .next/cache/lookstar19-models (Vercel derlemeler
//   arasında .next/cache'i saklar: paket her seferinde inmez);  3) paket sürümden indirilir (zaman aşımı, üç deneme), gerekenler açılır.
// Asteroit modelleri olduğu gibi kopyalanır; uydu modelleri pakette .glb.gz: açılarak yazılır. Özeti tutmayan dosya yayına girmez.
// varliklar.json depo kökündedir: Vercel'de kök dizin "site" iken "Include files outside the root directory" açık kalmalı (varsayılan).
// Kullanım: node scripts/modeller.mjs (site/ içinden; npm run build bunu prebuild olarak çalıştırır)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.resolve(SITE, '..');
const CACHE = path.join(SITE, '.next/cache/lookstar19-models'), MAN = path.join(ROOT, 'varliklar.json');
const die = (m) => { console.error(`modeller: ${m}`); process.exit(1); };
if (!fs.existsSync(MAN)) die(`${path.relative(SITE, MAN)} yok. Depo kökü derlemede görünmüyor: Vercel'de Settings → Build → "Include files outside the root directory in the Build Step" açık olmalı.`);
const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const readData = (f) => JSON.parse(fs.readFileSync(path.join(SITE, 'data', f), 'utf8')).objects;

// küme: paket, kaynak yolu (depoda ve pakette), çıktı yolu, açma
const SETS = [
  { pk: 'asteroit', out: 'ast', keys: readData('asteroids.json').map((o) => o.model.key), src: (k) => `web/models/ast/${k}.glb`, gz: false },
  { pk: 'uydu', out: 'sat', keys: [...new Set(readData('satellites.json').map((o) => o.model.key))], src: (k) => `web/models/sats/${k}.glb.gz`, gz: true },
];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function download(url, dest, tries = 3) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { 'User-Agent': 'lookstar19-build' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1024) throw new Error(`yanıt çok kısa (${buf.length} B)`);           // içerik denetimi: her dosyanın özeti (aşağıda)
      fs.writeFileSync(dest, buf); return;
    } catch (e) {
      if (k >= tries) throw new Error(`${url}: ${e.message}`);
      console.warn(`modeller: indirme ${k}. denemede olmadı (${e.message}); ${2 * k} sn sonra yeniden`);
      await new Promise((r) => setTimeout(r, 2000 * k));
    }
  }
}

for (const S of SETS) {
  const pk = man.paketler && man.paketler[S.pk];
  if (!pk || !pk.dosyalar) die(`varliklar.json içinde "${S.pk}" paketi yok`);
  const hashOf = (k) => pk.dosyalar[S.src(k)], good = (p, k) => fs.existsSync(p) && sha(p) === hashOf(k);
  const noHash = S.keys.filter((k) => !hashOf(k));
  if (noHash.length) die(`"${S.pk}" paketinde olmayan model: ${noHash.join(', ')} (site/data ile varliklar.json uyuşmuyor)`);
  const OUT = path.join(SITE, 'public/models', S.out), cdir = path.join(CACHE, S.out);
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(cdir, { recursive: true });
  const cacheOf = (k) => path.join(cdir, path.basename(S.src(k)));
  // doğrulanmış kaynağı çıktıya yaz (geçici adla yazıp yeniden adlandırma: yarıda kalan dosya yayına girmez)
  const place = (src, k) => {
    const dst = path.join(OUT, `${k}.glb`), tmp = `${dst}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, S.gz ? zlib.gunzipSync(fs.readFileSync(src)) : fs.readFileSync(src)); fs.renameSync(tmp, dst);
  };
  const from = { depo: 0, onbellek: 0, indirme: 0 }, missing = [];
  for (const k of S.keys) {
    const local = path.join(ROOT, S.src(k));
    if (good(local, k)) { place(local, k); fs.copyFileSync(local, cacheOf(k)); from.depo++; continue; }
    if (good(cacheOf(k), k)) { place(cacheOf(k), k); from.onbellek++; continue; }
    missing.push(k);
  }
  if (missing.length) {
    const url = `https://github.com/${man.depo}/releases/download/${man.etiket}/${pk.ad}`, tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ls19-${S.out}-`));
    console.log(`modeller: ${S.pk}: ${missing.length} model eksik, ${pk.ad} indiriliyor`);
    try {
      const tar = path.join(tmp, pk.ad);
      await download(url, tar);
      execFileSync('tar', ['-xf', tar, '-C', tmp, ...missing.map(S.src)]);
      for (const k of missing) {
        const src = path.join(tmp, S.src(k));
        if (!good(src, k)) die(`${S.src(k)}: paketteki dosyanın özeti varliklar.json'la tutmuyor`);
        place(src, k); fs.copyFileSync(src, cacheOf(k)); from.indirme++;
      }
    } catch (e) { die(e.message); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // listede olmayan eski modeller (cisim çıkarıldıysa) yayından kalkar
  const want = new Set(S.keys.map((k) => `${k}.glb`));
  for (const f of fs.readdirSync(OUT)) if (!want.has(f)) fs.rmSync(path.join(OUT, f), { force: true });
  console.log(`modeller: ${S.pk}: ${S.keys.length} GLB hazır (${Object.entries(from).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')})`);
}
