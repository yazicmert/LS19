// LS19'un hareket (animasyon) kütüphanelerini tek dosyalık ESM olarak web/lib/ altına üretir: motion, number-flow, torph.
// Site bundler kullanmaz (Three.js ve satellite.js gibi kütüphaneler web/lib/ içinde durur, web/index.html'deki importmap ile adlandırılır);
// bu betik paketleri npm'den geçici bir klasöre kurar, esbuild ile tek dosyaya paketler ve lisanslarıyla birlikte web/lib/'e yazar.
// Kullanım:  node tools/motion_paketle.mjs        (npm kayıt defterine erişim gerekir; depoya yalnız çıktı dosyaları yazılır)
// Çıktı:     web/lib/motion.esm.js · number-flow.esm.js · torph.esm.js ve her biri için <ad>.LICENSE.md
// Güncelleme: aşağıdaki sürümleri değiştirip betiği yeniden çalıştır; testlerden önce tarayıcıda importmap adlarıyla yüklendiğini denetle.
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { gzipSync } from 'zlib';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), LIB = path.join(ROOT, 'web', 'lib');
const VERSIONS = { motion: '14.0.0', 'number-flow': '0.6.2', torph: '0.1.3', esbuild: '0.28.2' };

// motion: belgelenmiş vanilla (DOM) API. React sürümü ve düşük düzey iç parçalar dışarıda (tüm paket 141 KB, bu liste ~64 KB).
// Başka bir isim gerekirse buraya ekleyip betiği yeniden çalıştır.
const MOTION_API = ['animate', 'animateMini', 'animateView', 'stagger', 'spring', 'springValue', 'inView', 'scroll', 'scrollInfo', 'hover', 'press', 'resize',
  'cubicBezier', 'easeIn', 'easeOut', 'easeInOut', 'circIn', 'circOut', 'circInOut', 'backIn', 'backOut', 'backInOut', 'anticipate', 'steps',
  'mix', 'interpolate', 'clamp', 'wrap', 'progress', 'delay', 'frame', 'cancelFrame', 'frameData', 'MotionValue', 'motionValue', 'mapValue', 'transformValue',
  'styleEffect', 'attrEffect', 'propEffect', 'svgEffect', 'transform'];

const ENTRIES = {
  motion: { site: 'https://motion.dev', licenses: ['motion/LICENSE.md'],
    note: 'motion, framer-motion, motion-dom ve motion-utils paketleri aynı MIT lisansı altındadır (Motion B.V.).',
    contents: `export { ${MOTION_API.join(', ')} } from 'motion';` },
  'number-flow': { site: 'https://number-flow.barvian.me', licenses: ['number-flow/LICENSE.md', 'esm-env/LICENSE'],
    note: 'number-flow ve içine paketlenen esm-env lisansları.',
    contents: "export * from 'number-flow'; export { default } from 'number-flow';" },
  torph: { site: 'https://torph.lochie.me', licenses: ['torph/LICENSE'], note: 'torph lisansı.', contents: "export * from 'torph';" },
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-motion-'));
try {
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync('npm', ['i', '--save-exact', '--no-audit', '--no-fund', ...Object.entries(VERSIONS).map(([k, v]) => `${k}@${v}`)], { cwd: tmp, stdio: 'inherit' });
  const { build } = createRequire(path.join(tmp, 'package.json'))('esbuild');
  fs.mkdirSync(LIB, { recursive: true });
  for (const [name, e] of Object.entries(ENTRIES)) {
    const banner = `/*! ${name} ${VERSIONS[name]} (MIT) — ${e.site} — LS19: tools/motion_paketle.mjs ile paketlendi, lisans: ${name}.LICENSE.md */`;
    const r = await build({ stdin: { contents: e.contents, resolveDir: tmp, loader: 'js' }, bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'none',
      define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: banner }, write: false, logLevel: 'error' });
    const code = r.outputFiles[0].contents;
    fs.writeFileSync(path.join(LIB, `${name}.esm.js`), code);
    const lic = e.licenses.map((f) => `# ${f.split('/')[0]}\n\n${fs.readFileSync(path.join(tmp, 'node_modules', f), 'utf8').trim()}\n`).join('\n');
    fs.writeFileSync(path.join(LIB, `${name}.LICENSE.md`), `${e.note}\n\n${lic}`);
    console.log(`${name}.esm.js ${(code.length / 1024).toFixed(1)} KB (gzip ${(gzipSync(code).length / 1024).toFixed(1)} KB)`);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
