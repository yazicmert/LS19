// Yayın öncesi küçültme (tools/kucult.mjs, esbuild) doğrulaması (Node 20+): cd web && node test/test_kucult.js
//  1) tüm hedefler küçültülür; her JS dosyasının dış yüzü (dışa aktarılan adlar, içe aktarılan modüller) aynı kalır; boyut ve gzip kazancı
//  2) kendi kaynağını metin olarak işçiye gönderen kütüphaneler (Function.toString) hedef dışı
//  3) kaynak haritası bağı ve kaynak metni; --yerinde Vercel dışında reddedilir, depo dosyaları değişmez
//  4) surface() doğruluk tablosu; vercel.json kurulum/derleme komutları
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { spawnSync } from 'child_process';
import { run, targets, surface, SKIP } from '../../tools/kucult.mjs';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const WEB = new URL('../', import.meta.url).pathname, ROOT = new URL('../../', import.meta.url).pathname;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-kucult-'));
try {
  // ---------------------------------------------------------------- 1) küçültme + dış yüz denetimi (run içinde; fark varsa ok=false)
  const t = targets(WEB), logs = [], r = await run({ web: WEB, out, log: (m) => logs.push(m) });
  check(`küçültme: ${t.js.length} JS + ${t.css.length} CSS, her JS dosyasında dışa aktarılan adlar ve içe aktarılan modüller (dinamik dahil) aynı`, r.ok && r.files.length === t.js.length + t.css.length && t.js.length > 100, (r.errs || []).slice(0, 2).join(' | ') || logs.join(' '));
  check('hedefler: web/js tümü, lib/addons (istisnalar dışında), css; three.module.js (zaten küçük) ve worker/çevirici kodu dışarıda',
    t.js.includes('js/app.js') && t.js.includes('js/i18n/en.js') && t.js.includes('lib/addons/loaders/GLTFLoader.js') && t.css.includes('css/style.css') && !t.js.some((f) => /three\.module|KTX2Loader|DRACOLoader|meshopt|basis\/|draco\//.test(f)));
  let ga = 0, gb = 0;
  for (const f of r.files || []) { ga += zlib.gzipSync(fs.readFileSync(path.join(WEB, f)), { level: 9 }).length; gb += zlib.gzipSync(fs.readFileSync(path.join(out, f)), { level: 9 }).length; }
  check('kazanç: ham en az %30, gzip en az %25 küçük', r.after <= 0.7 * r.before && gb <= 0.75 * ga, `ham ${(r.before / 1e6).toFixed(2)} → ${(r.after / 1e6).toFixed(2)} MB, gzip ${(ga / 1e3).toFixed(0)} → ${(gb / 1e3).toFixed(0)} KB`);
  // ---------------------------------------------------------------- 2) Function.toString kullanan kütüphaneler hedef dışı
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const risky = walk(path.join(WEB, 'lib', 'addons')).filter((f) => f.endsWith('.js') && /\.toString\(\)/.test(fs.readFileSync(f, 'utf8')) && /new Blob\(/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(WEB, f));
  check('işçi kodunu kendi metninden kuran kütüphaneler (toString + new Blob) küçültülmez', risky.length >= 3 && risky.every((f) => SKIP.some((x) => x.test(f)) && !t.js.includes(f)), risky.join(','));
  const ownRisk = t.js.filter((f) => /\.toString\(\)/.test(fs.readFileSync(path.join(WEB, f), 'utf8')) && /new Blob\(/.test(fs.readFileSync(path.join(WEB, f), 'utf8')));
  check('küçültülen dosyalarda işçi kodu metinden kurulmuyor', ownRisk.length === 0, ownRisk.join(','));
  // ---------------------------------------------------------------- 3) kaynak haritası, --yerinde koruması
  const app = fs.readFileSync(path.join(out, 'js/app.js'), 'utf8'), map = JSON.parse(fs.readFileSync(path.join(out, 'js/app.js.map'), 'utf8')), css = fs.readFileSync(path.join(out, 'css/style.css'), 'utf8');
  check('kaynak haritası: JS ve CSS sonunda bağ, harita özgün metni içerir (tarayıcı hatası özgün satırı gösterir)', /\/\/# sourceMappingURL=app\.js\.map\n$/.test(app) && /\/\*# sourceMappingURL=style\.css\.map \*\/\n$/.test(css) && map.sources[0] === 'app.js' && map.sourcesContent[0] === fs.readFileSync(path.join(WEB, 'js/app.js'), 'utf8'));
  const before = fs.readFileSync(path.join(WEB, 'js/app.js'), 'utf8'), env = { ...process.env }; delete env.VERCEL; delete env.VERCEL_ENV;
  const p = spawnSync(process.execPath, [path.join(ROOT, 'tools/kucult.mjs'), '--yerinde'], { env, encoding: 'utf8' });
  check('--yerinde Vercel dışında reddedilir (çıkış 2), depodaki kaynak değişmez', p.status === 2 && fs.readFileSync(path.join(WEB, 'js/app.js'), 'utf8') === before && !fs.existsSync(path.join(WEB, 'js/app.js.map')));
  // ---------------------------------------------------------------- 4) surface() ve vercel.json
  const s = surface(`import a from './a.js'; import * as b from "./b.js"; export * from './c.js'; export * as ns from './d.js'; export { x as y } from './e.js';
    export const { p, q: [r1, ...r2] } = o, z = 1; export function f() { return import('./dyn.js'); } export class K {} export default 3; const u = 1; export { u as 'uu' };`);
  check('surface: içe aktarma (statik, dinamik, yeniden dışa aktarma) ve dışa aktarılan adlar (yapı bozumu, varsayılan, yeniden adlandırma)',
    JSON.stringify(s) === JSON.stringify({ exp: ['*', '*:ns', 'K', 'default', 'f', 'p', 'r1', 'r2', 'uu', 'y', 'z'].sort(), imp: ['./a.js', './b.js', './c.js', './d.js', './dyn.js', './e.js'] }), JSON.stringify(s));
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')), pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('vercel.json: npm ci (esbuild, espree) + yayın kopyasında yerinde küçültme; web/ yayımlanır; esbuild sürümü sabit',
    v.installCommand === 'npm ci' && v.buildCommand === 'node tools/kucult.mjs --yerinde' && v.outputDirectory === 'web' && /^\d+\.\d+\.\d+$/.test(pkg.devDependencies.esbuild || '') && !!pkg.devDependencies.espree);
} finally { fs.rmSync(out, { recursive: true, force: true }); }

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
