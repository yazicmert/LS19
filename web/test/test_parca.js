// Parçalı test yardımcısı (test/parca.js) ve koşturucu yapılandırması (tools/testler.mjs PARCA) doğrulaması: cd web && node test/test_parca.js
import fs from 'fs';
import { parca } from './parca.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const W = { a: 37, b: 12, p1: 6, p2: 6, p3: 6, p4: 6, p5: 6, p6: 6 };
const parts = (n) => Array.from({ length: n }, (_, i) => parca(W, ['node', 'x', '--parca', `${i + 1}/${n}`]));

for (const n of [1, 2, 3, 4]) {
  const ps = parts(n), all = ps.flatMap((p) => p.units), loads = ps.map((p) => p.units.reduce((s, k) => s + W[k], 0));
  check(`${n} parça: her birim tam bir parçada, her parçada en az bir birim`, all.length === Object.keys(W).length && new Set(all).size === all.length && ps.every((p) => p.units.length > 0), ps.map((p) => p.units.join('+')).join(' | '));
  const total = Object.values(W).reduce((s, w) => s + w, 0), ideal = Math.max(total / n, Math.max(...Object.values(W)));
  check(`${n} parça: en yüklü parça ideale yakın (≤ 1,35 × max(toplam/n, en büyük birim))`, Math.max(...loads) <= 1.35 * ideal, `yükler ${loads.join(', ')}, ideal ${ideal.toFixed(1)}`);
}
const solo = parca(W, ['node', 'x']);
check('--parca yoksa her birim koşar (elle çalıştırma, test:seq)', Object.keys(W).every((k) => solo(k)) && solo.label === '');
check('aynı girdi aynı dağılımı verir (koşturucu ile parçalar uyuşur)', JSON.stringify(parts(3).map((p) => p.units)) === JSON.stringify(parts(3).map((p) => p.units)));
const bad = ['0/3', '4/3', 'x', '1/0', ''].map((a) => { try { parca(W, ['node', 'x', '--parca', a]); return false; } catch (e) { return true; } });
check('geçersiz --parca reddedilir', bad.every(Boolean), bad.join(','));
let threw = false; try { solo('tanimsiz'); } catch (e) { threw = true; }
check('tanımsız birim sorulursa hata (yanlış adla birim sessizce atlanmaz)', threw);
const logs = []; const orig = console.log; console.log = (m) => logs.push(m);
const empty = parca({ a: 1 }, ['node', 'x', '--parca', '2/2']), r1 = empty.bitir(0), r2 = solo.bitir(5);
console.log = orig;
check('boş parça ya da denetimsiz parça başarısız sayılır', r1 === false && r2 === true && /koşan birim ya da denetim yok/.test(logs.join()));

// koşturucu: parçalı testler var ve parca() kullanıyor
const runner = fs.readFileSync(new URL('../../tools/testler.mjs', import.meta.url), 'utf8'), m = /const PARCA = (\{[^}]*\})/.exec(runner);
const cfg = m ? JSON.parse(m[1].replace(/'/g, '"')) : {};
const okFiles = Object.entries(cfg).every(([f, n]) => n >= 2 && fs.existsSync(new URL('./' + f, import.meta.url)) && /import \{ parca \} from '\.\/parca\.js'/.test(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8')) && /P\.bitir\(nCheck\)/.test(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8')));
check('testler.mjs PARCA: dosyalar var, parca() ile bölünür ve parça sonunda denetim sayısı denetlenir', Object.keys(cfg).length >= 2 && okFiles, JSON.stringify(cfg));

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
