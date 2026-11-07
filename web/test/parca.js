// Uzun testleri parçalara bölmek için (tools/testler.mjs): node test/test_x.js --parca i/n  → bu süreç yalnız i. parçanın birimlerini koşturur.
// Birimler (bağımsız test bölümleri) ölçülen sürelerine göre en az yüklü parçaya sırayla dağıtılır (en uzun önce): parçalar dengeli olur.
// --parca verilmezse (npm run test:seq, elle çalıştırma) her şey koşar. Kullanım:
//   const P = parca({ temel: 12, gorev: 37, APOLLO: 6, ... });  if (P('gorev')) { … }   …  P.bitir(denetimSayısı)
// Parçada hiç birim yoksa ya da hiç denetim koşmadıysa süreç başarısız sayılır (yanlış yapılandırma sessizce "geçti" demesin).
export function parca(weights, argv = process.argv) {
  const at = argv.indexOf('--parca');
  const [i, n] = at >= 0 ? String(argv[at + 1] || '').split('/').map(Number) : [1, 1];
  if (!(Number.isInteger(i) && Number.isInteger(n) && n >= 1 && i >= 1 && i <= n)) throw new Error('--parca i/n bekleniyor (1 ≤ i ≤ n)');
  const part = {}, load = new Array(n).fill(0);
  for (const [k, w] of Object.entries(weights).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    let j = 0; for (let q = 1; q < n; q++) if (load[q] < load[j]) j = q;
    part[k] = j + 1; load[j] += w;
  }
  const mine = (k) => { if (!(k in part)) throw new Error('parçası tanımsız birim: ' + k); return part[k] === i; };
  mine.label = n > 1 ? ` [parça ${i}/${n}]` : '';
  mine.units = Object.keys(part).filter((k) => part[k] === i);
  mine.bitir = (checks) => { if (!mine.units.length || !checks) { console.log(`HATA  parça ${i}/${n}: koşan birim ya da denetim yok`); return false; } return true; };
  return mine;
}
