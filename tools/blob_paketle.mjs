// "Kendi uydum" arşivi için Vercel Blob istemcisini (yalnız upload ve uploadPresigned) tarayıcıya tek dosyalık ESM olarak paketler: web/lib/vercel-blob-client.esm.js (+ LICENSE).
// Kaynak: kökteki package.json'daki @vercel/blob (Apache-2.0; sunucu tarafı api/arsiv.js aynı paketi kullanır). Paket Node'un process.env'ine bakar:
// tarayıcıda boş bir process nesnesi tanımlanır (varsayılan Blob adresi kullanılır). Site bu dosyayı yalnız arşive yüklerken indirir (dinamik import).
// Kullanım:  npm ci && node tools/blob_paketle.mjs        Güncelleme: package.json'da sürümü değiştir, npm i, betiği yeniden çalıştır.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), LIB = path.join(ROOT, 'web', 'lib');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', '@vercel', 'blob', 'package.json'), 'utf8'));
const out = path.join(LIB, 'vercel-blob-client.esm.js');
await build({
  stdin: { contents: "export { upload, uploadPresigned } from '@vercel/blob/client';", resolveDir: ROOT, sourcefile: 'giris.mjs' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true, legalComments: 'none', outfile: out, logLevel: 'warning',
  banner: { js: `// @vercel/blob ${PKG.version} (Apache-2.0) — yalnız upload ve uploadPresigned; tools/blob_paketle.mjs üretir, elle düzenlemeyin.\nconst process = { env: {} };` },
});
const lic = ['license.md', 'LICENSE', 'LICENSE.md'].map((f) => path.join(ROOT, 'node_modules', '@vercel', 'blob', f)).find((f) => fs.existsSync(f));
fs.writeFileSync(path.join(LIB, 'vercel-blob-client.LICENSE.md'), `# @vercel/blob ${PKG.version}\n\n${lic ? fs.readFileSync(lic, 'utf8') : 'Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0)'}\n`);
console.log(`${path.relative(ROOT, out)}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
