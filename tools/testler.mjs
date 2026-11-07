// Tüm Node testlerini (web/test/test_*.js) paralel koşturur: çekirdek sayısı kadar iş (LS19_TEST_JOBS ile değiştirilebilir; GitHub'ın
// ubuntu-latest makinesinde 4). Uzun sürenler önce başlar ki toplam süre en uzun teste yaklaşsın (sıralı ~5 dk → ~2 dk).
// Her test ayrı süreçte koşar (testler ortak dosya yazmaz; test_profiles yalnız kendi anahtarlı geçici dosyasını yazar). Başarısız testin
// çıktısının son 30 satırı yazılır; hepsi bitince başarısızlar sayılır ve çıkış kodu 1 olur. Kullanım: npm test  ya da  node tools/testler.mjs [süzgeç]
// En uzun iki test parçalara bölünür (PARCA; test/parca.js birimleri ölçülen sürelerine göre dengeler): tek süreçte twostage 136 sn, pdg 85 sn
// idi ve toplam süreyi tek başlarına belirliyordu; parçalarla en uzun iş ~37 sn. Parçaların denetimleri birlikte tam testle aynıdır (test_parca.js).
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const WEB = new URL('../web/', import.meta.url).pathname;
// yerelde ölçülen en uzunlar (sn): twostage 136 (4 parça), pdg 85 (3 parça), rockets 27, raise 26, dynamics6 22, profiles 18, attitude 12, pads 10, nominalby 7
const PARCA = { 'test_twostage.js': 4, 'test_pdg.js': 3 };
const SLOW = ['test_twostage.js', 'test_pdg.js', 'test_rockets.js', 'test_raise.js', 'test_dynamics6.js', 'test_profiles.js', 'test_attitude.js', 'test_pads.js', 'test_nominalby.js', 'test_telemetry.js'];
const rank = (f) => { const i = SLOW.indexOf(f); return i < 0 ? SLOW.length : i; };
const only = process.argv[2] || '';
const tests = fs.readdirSync(path.join(WEB, 'test')).filter((f) => /^test_.*\.js$/.test(f) && f.includes(only)).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
// iş listesi: parçalı testler her parça için ayrı iş ([dosya, ek argümanlar, ad])
const files = tests.flatMap((f) => (PARCA[f] ? Array.from({ length: PARCA[f] }, (_, i) => [f, ['--parca', `${i + 1}/${PARCA[f]}`], `${f} [${i + 1}/${PARCA[f]}]`]) : [[f, [], f]]));
const jobs = Math.max(1, Number(process.env.LS19_TEST_JOBS) || (os.availableParallelism ? os.availableParallelism() : os.cpus().length));
const t0 = Date.now(), failed = [];

function run([f, args, name]) {
  return new Promise((res) => {
    const t = Date.now(), p = spawn(process.execPath, [path.join('test', f), ...args], { cwd: WEB, env: process.env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const s = ((Date.now() - t) / 1000).toFixed(1);
      if (code === 0) console.log(`== test/${name} (${s} sn)`);
      else {
        failed.push(name);
        console.log(`== test/${name} BAŞARISIZ (${s} sn, çıkış ${code})\n` + out.split('\n').filter((l) => !/^TAMAM/.test(l)).slice(-30).join('\n'));
      }
      res();
    });
  });
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, async () => { while (next < files.length) await run(files[next++]); }));
const total = ((Date.now() - t0) / 1000).toFixed(0);
if (failed.length) { console.log(`\n${failed.length} test başarısız: ${failed.join(', ')} (${tests.length} test, ${files.length} iş, ${jobs} paralel, ${total} sn)`); process.exit(1); }
console.log(`Tüm testler geçti (${tests.length} test, ${files.length} iş, ${jobs} paralel, ${total} sn)`);
