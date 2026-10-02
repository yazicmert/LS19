// LS19'un dışbükey (konik) çözücüsünü web/lib/clarabel/ altına koyar: Clarabel (Oxford, Apache-2.0) WebAssembly derlemesi.
// İniş güdümü (web/js/pdg.js) ikinci derece koni programı (SOCP) çözer; çözücü tarayıcıda (Web Worker) ve Node testlerinde aynı ikili dosyayla koşar.
// Site bundler kullanmaz: bu betik cvxjs paketinin hazır "web" hedefini (wasm-bindgen; clarabel_wasm.js + clarabel_wasm_bg.wasm) npm'den indirip olduğu gibi kopyalar,
// lisansı ve SHA-256 özetlerini yanına yazar. Hiçbir dosya değiştirilmez.
// Kullanım:  node tools/clarabel_paketle.mjs        (npm kayıt defterine erişim gerekir)
// Çıktı:     web/lib/clarabel/clarabel_wasm.js · clarabel_wasm_bg.wasm · LICENSE · README.md
// Güncelleme: aşağıdaki sürümü değiştirip betiği yeniden çalıştır, ardından node web/test/test_pdg.js ile doğrula.
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'web', 'lib', 'clarabel');
const CVXJS = '0.1.4';
const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-clarabel-'));
try {
  execFileSync('npm', ['pack', `cvxjs@${CVXJS}`, '--silent'], { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] });
  execFileSync('tar', ['xzf', `cvxjs-${CVXJS}.tgz`], { cwd: tmp });
  const pkg = path.join(tmp, 'package'), web = path.join(pkg, 'wasm', 'pkg', 'web');
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const [src, dst] of [[path.join(web, 'clarabel_wasm.js'), 'clarabel_wasm.js'], [path.join(web, 'clarabel_wasm_bg.wasm'), 'clarabel_wasm_bg.wasm'], [path.join(pkg, 'LICENSE'), 'LICENSE']]) {
    fs.copyFileSync(src, path.join(OUT, dst));
    rows.push(`| \`${dst}\` | ${fs.statSync(src).size} | \`${sha(src)}\` |`);
  }
  const readme = `# Clarabel (WebAssembly)

Konik optimizasyon çözücüsü [Clarabel](https://github.com/oxfordcontrol/Clarabel.rs) (Goulart & Chen, Oxford; Apache-2.0), \`cvxjs\` ${CVXJS} paketinin hazır
"web" derlemesiyle (wasm-bindgen) olduğu gibi dağıtılır; LS19 hiçbir dosyayı değiştirmez. Lisans metni: \`LICENSE\` (Apache-2.0, paketten).

Kullanım: \`web/js/conic.js\` bu dosyaları yükler (tarayıcıda \`fetch\`, Node'da \`initSync\`). Problem biçimi:
min ½ xᵀPx + qᵀx  koşul  Ax + s = b, s ∈ K  (K: sıfır, negatif olmayan ve ikinci derece koniler).

| Dosya | Bayt | SHA-256 |
|---|---|---|
${rows.join('\n')}

Yeniden üretmek: \`node tools/clarabel_paketle.mjs\` (npm'den \`cvxjs@${CVXJS}\` indirir).
`;
  fs.writeFileSync(path.join(OUT, 'README.md'), readme);
  console.log(readme);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
