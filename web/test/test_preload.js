// index.html modulepreload ipuçları ↔ gerçek modül grafiği (Node 20+): cd web && node test/test_preload.js [--print]
//  Tarayıcı modül grafiğini içe aktarma zincirini izleyerek (app.js → … → three.module.js) tek tek keşfeder: her seviye bir ağ gidiş-dönüşü. <link rel="modulepreload"> düz liste olarak
//  HTML ayrıştırılırken hepsini paralel indirir. Liste elle bakımı unutulmasın diye bu test grafiği (app.js + fizik worker'ı worker.js, statik import'lar) yeniden çıkarır ve ipuçlarıyla karşılaştırır.
//  --print: index.html'e konacak <link> satırlarını yazdırır.
import fs from 'fs';
import path from 'path';

const root = new URL('../', import.meta.url).pathname;
const IMPORTMAP = { three: 'lib/three.module.js', 'three/addons/': 'lib/addons/', motion: 'lib/motion.esm.js', 'number-flow': 'lib/number-flow.esm.js', torph: 'lib/torph.esm.js' };
let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

// importmap'i index.html'den oku (tek doğruluk kaynağı)
const html = fs.readFileSync(root + 'index.html', 'utf8');
const im = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const imMap = Object.fromEntries(Object.entries(im).map(([k, v]) => [k, v.replace(/^\.\//, '')]));

const RE = /(?:^|[\n;}])\s*(?:import\s*(?:[\w*{}\s,$]*?\s*from\s*)?|export\s*(?:\*|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\1/g;       // statik import / export-from (dinamik import() hariç)
function deps(file) {
  const src = fs.readFileSync(root + file, 'utf8'), out = [];
  for (const m of src.matchAll(RE)) {
    const spec = m[2];
    let target = null;
    if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    else if (imMap[spec]) target = imMap[spec];
    else { const k = Object.keys(imMap).find((p) => p.endsWith('/') && spec.startsWith(p)); if (k) target = imMap[k] + spec.slice(k.length); }
    if (target) out.push(target);
  }
  return out;
}
function graph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const d of deps(entry)) if (fs.existsSync(root + d)) graph(d, seen);
  return seen;
}
const mainG = graph('js/app.js'), workerG = graph('js/worker.js');
const want = [...new Set([...mainG, ...[...workerG].filter((f) => !mainG.has(f))])];                          // ana grafik + yalnız fizik worker'ının kullandıkları (önbellek ısıtılır)
const hinted = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);

if (process.argv.includes('--print')) { for (const f of want) console.log(`<link rel="modulepreload" href="${f}">`); process.exit(0); }

check(`grafik çıkarıldı: ana ${mainG.size} modül, yalnız worker'da ${want.length - mainG.size}`, mainG.has('js/scene.js') && mainG.has('lib/three.module.js') && workerG.has('js/mission.js'));
check('statik import\'lar dosya sisteminde çözülür (kırık yol yok)', [...mainG, ...workerG].every((f) => fs.existsSync(root + f)));
const miss = want.filter((f) => !hinted.includes(f)), extra = hinted.filter((f) => !want.includes(f));
check('index.html modulepreload listesi modül grafiğini tam kapsar', miss.length === 0, miss.slice(0, 6).join(', ') + (miss.length > 6 ? ` … (+${miss.length - 6})` : ''));
check('modulepreload listesinde grafik dışı/olmayan dosya yok', extra.length === 0 && hinted.every((f) => fs.existsSync(root + f)), extra.join(', '));
check('ipuçları yinelenmez ve importmap\'ten ÖNCE değil (modulepreload yolları importmap sonrası çözülür)', new Set(hinted).size === hinted.length && html.indexOf('<script type="importmap">') < html.indexOf('rel="modulepreload"') || hinted.length === 0);
check('dinamik import (post.js, tembel) ipucu listesinde değil — ilk açılışı şişirmez', !hinted.includes('js/post.js') && /import\('\.\/post\.js'\)/.test(fs.readFileSync(root + 'js/scene.js', 'utf8')));

console.log(fail ? `\n${fail} HATA\n(yeniden üretmek için: node test/test_preload.js --print)` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
