// "Kendi uydum" STEP/IGES desteği: occt-import-js'in (OpenCascade, WebAssembly; LGPL-2.1) dağıtım dosyalarını web/lib/occt/ altına kopyalar.
// Dosyalar git'e girmez (7,6 MB wasm): kökteki package.json'da sabit sürümlü bağımlılık, npm ci sonrası (postinstall) burada kopyalanır —
// Vercel derlemesi, CI ve yerel kurulum aynı, lockfile'da doğrulanan dosyayı kullanır. Site bunları yalnız STEP/IGES yüklenince indirir (web/js/stepworker.js).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), KAYNAK = path.join(ROOT, 'node_modules', 'occt-import-js', 'dist'), HEDEF = path.join(ROOT, 'web', 'lib', 'occt');
const DOSYALAR = ['occt-import-js.js', 'occt-import-js.wasm', 'license.occt-import-js.txt', 'license.occt.txt'];
if (!fs.existsSync(KAYNAK)) { console.log('occt-import-js kurulu değil: STEP/IGES desteği atlandı'); process.exit(0); }
fs.mkdirSync(HEDEF, { recursive: true });
for (const f of DOSYALAR) fs.copyFileSync(path.join(KAYNAK, f), path.join(HEDEF, f));
const v = JSON.parse(fs.readFileSync(path.join(KAYNAK, '..', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(HEDEF, 'SURUM.txt'), `occt-import-js ${v} (LGPL-2.1) — tools/occt_kopyala.mjs kopyalar, elle düzenlemeyin\n`);
console.log(`web/lib/occt: occt-import-js ${v} kopyalandı`);
