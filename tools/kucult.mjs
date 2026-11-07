// Yayın öncesi küçültme (esbuild): web/js/**/*.js, web/lib/addons/**/*.js ve web/css/*.css yorum, boşluk ve yerel adlardan arındırılır.
// Kaynak depoda okunur hâliyle kalır; küçültme yalnız Vercel'in derleme makinesinde, yayımlanacak kopyada yapılır (vercel.json buildCommand).
//   node tools/kucult.mjs <çıktı klasörü>   küçültülmüş kopyaları klasöre yazar (yollar web/'e göre; denetim ve ölçüm için)
//   node tools/kucult.mjs --yerinde         dosyaları yerinde değiştirir: YALNIZ Vercel derlemesinde (VERCEL=1), yoksa reddeder
// Kurallar:
//   - modül biçimi ve sözdizimi korunur (format esm, target esnext: yalnız küçültme, dönüştürme yok); lisans yorumları kalır (legalComments inline)
//   - her dosya için kaynak haritası (<dosya>.map, kaynak metni içinde): tarayıcı hata yığınları ve geliştirici araçları özgün satırları gösterir
//   - kendi kaynağını metin olarak okuyup işçiye gönderen kütüphaneler (Function.toString) küçültülmez: KTX2Loader, DRACOLoader, meshopt
//     çözücüsü; Basis ve Draco çeviricileri zaten küçük (Emscripten çıktısı). three.module.js zaten küçültülmüş geliyor (web/lib/, kapsam dışı).
//   - güvenlik ağı: her JS dosyasında küçültme öncesi ve sonrası dışa aktarılan adlar ve içe aktarılan modüller (statik ve dinamik) karşılaştırılır
//     (espree ile ayrıştırılır); bir fark ya da ayrıştırma hatası olursa hiçbir dosya yazılmaz, çıkış kodu 1 (Vercel yayını durur).
// Ölçüm (2026-11): web/js gzip 0,55 → 0,38 MB, lib/addons 78 → 60 KB, css 19 → 15 KB. test/test_kucult.js denetler.
import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';
import * as espree from 'espree';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WEB = path.join(ROOT, 'web');
export const SKIP = [/lib\/addons\/loaders\/KTX2Loader\.js$/, /lib\/addons\/loaders\/DRACOLoader\.js$/, /lib\/addons\/libs\/meshopt_decoder\.module\.js$/, /lib\/addons\/libs\/(basis|draco)\//];

const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
// küçültülecek dosyalar (web/'e göre göreli yollar)
export function targets(web = WEB) {
  const rel = (f) => path.relative(web, f).split(path.sep).join('/');
  const js = [...walk(path.join(web, 'js')), ...walk(path.join(web, 'lib', 'addons'))].filter((f) => f.endsWith('.js')).map(rel).filter((f) => !SKIP.some((r) => r.test(f)));
  const css = walk(path.join(web, 'css')).filter((f) => f.endsWith('.css')).map(rel);
  return { js: js.sort(), css: css.sort() };
}

// modülün dış yüzü: dışa aktarılan adlar ve içe aktarılan modül yolları (dinamik import() dahil, yalnız düz metin yollar)
export function surface(code) {
  const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const exp = new Set(), imp = new Set();
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ImportExpression' && n.source.type === 'Literal') imp.add(String(n.source.value));
    if (n.type === 'ImportExpression' && n.source.type === 'TemplateLiteral' && !n.source.expressions.length) imp.add(n.source.quasis[0].value.cooked);
    for (const k of Object.keys(n)) { const v = n[k]; if (k === 'parent') continue; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  };
  for (const s of ast.body) {
    if (s.type === 'ImportDeclaration') imp.add(s.source.value);
    else if (s.type === 'ExportAllDeclaration') { imp.add(s.source.value); exp.add('*' + (s.exported ? ':' + (s.exported.name ?? s.exported.value) : '')); }
    else if (s.type === 'ExportDefaultDeclaration') exp.add('default');
    else if (s.type === 'ExportNamedDeclaration') {
      if (s.source) imp.add(s.source.value);
      if (s.declaration) {
        const d = s.declaration;
        if (d.id) exp.add(d.id.name);
        for (const v of d.declarations || []) { const names = []; const pat = (p) => { if (!p) return; if (p.type === 'Identifier') names.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => pat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(pat); else if (p.type === 'AssignmentPattern') pat(p.left); else if (p.type === 'RestElement') pat(p.argument); }; pat(v.id); names.forEach((x) => exp.add(x)); }
      }
      for (const sp of s.specifiers || []) exp.add(sp.exported.name ?? sp.exported.value);
    }
    visit(s);
  }
  return { exp: [...exp].sort(), imp: [...imp].sort() };
}

// tek dosya: { code, map } (küçültülmüş metin sonunda harita bağı)
export async function minifyOne(src, rel) {
  const css = rel.endsWith('.css'), base = path.posix.basename(rel);
  const r = await transform(src, { loader: css ? 'css' : 'js', ...(css ? {} : { format: 'esm' }), minify: true, target: 'esnext', legalComments: 'inline', charset: 'utf8', sourcemap: 'external', sourcefile: base, sourcesContent: true });
  const link = css ? `\n/*# sourceMappingURL=${base}.map */\n` : `\n//# sourceMappingURL=${base}.map\n`;
  return { code: r.code.replace(/\n$/, '') + link, map: r.map };
}

// hepsini küçült ve denetle; yazma işlemi yalnız hepsi geçerse. out: hedef kök (yerinde: WEB)
export async function run({ web = WEB, out, log = console.log } = {}) {
  const { js, css } = targets(web), res = [], errs = [];
  let a = 0, b = 0;
  for (const rel of [...js, ...css]) {
    const src = fs.readFileSync(path.join(web, rel), 'utf8');
    let m;
    try { m = await minifyOne(src, rel); } catch (e) { errs.push(`${rel}: esbuild: ${e.message.split('\n')[0]}`); continue; }
    if (rel.endsWith('.js')) {
      try {
        const s0 = surface(src), s1 = surface(m.code);
        if (JSON.stringify(s0) !== JSON.stringify(s1)) errs.push(`${rel}: dış yüz değişti (önce ${JSON.stringify(s0)}, sonra ${JSON.stringify(s1)})`);
      } catch (e) { errs.push(`${rel}: ayrıştırılamadı: ${e.message}`); continue; }
    }
    a += Buffer.byteLength(src); b += Buffer.byteLength(m.code);
    res.push({ rel, ...m });
  }
  if (errs.length) { errs.forEach((e) => log('HATA ' + e)); return { ok: false, errs }; }
  for (const r of res) {
    const f = path.join(out, r.rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, r.code); fs.writeFileSync(f + '.map', r.map);
  }
  log(`küçültüldü: ${js.length} JS + ${css.length} CSS dosyası, ${(a / 1e6).toFixed(2)} → ${(b / 1e6).toFixed(2)} MB (gzip öncesi)`);
  return { ok: true, files: res.map((r) => r.rel), before: a, after: b };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const arg = process.argv[2];
  if (!arg) { console.log('kullanım: node tools/kucult.mjs <çıktı klasörü> | --yerinde (yalnız Vercel derlemesinde)'); process.exit(2); }
  if (arg === '--yerinde' && process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) { console.log('--yerinde yalnız Vercel derlemesinde (VERCEL=1) çalışır: depodaki kaynaklar okunur kalmalı. Denemek için bir çıktı klasörü verin.'); process.exit(2); }
  const r = await run({ out: arg === '--yerinde' ? WEB : path.resolve(arg) });
  process.exit(r.ok ? 0 : 1);
}
