// GRAIL Ay çekim alanı katsayılarını (PDS SHADR tablosu) istenen dereceye kesip web/js/moongrav_data.js olarak yazar.
// Kaynak: NASA PDS Geosciences, GRAIL LGRS RDR — grail_1001/shadr/gggrx_1200a_sha.tab (GRGM1200A, Goossens vd. 2016;
//   tam normalleştirilmiş (geodezi 4π), R = 1738,0 km, GM = 4902,80011526323 km³/s², Ay ana eksen (PA) çerçevesi).
//   https://pds-geosciences.wustl.edu/grail/grail-l-lgrs-5-rdr-v1/grail_1001/shadr/
// Kullanım: node tools/grail_kes.mjs <gggrx_1200a_sha.tab> [derece=100]
// Çıktı: düz diziler C, S; (n, m) katsayısı n(n+1)/2 + m sırasında (n = 0..N, m = 0..n). Katsayılar 10 anlamlı basamakla yazılır
// (100. derecede katsayı belirsizliği ~1e-9 göreli değil mutlak, katsayıların kendisi ~1e-7; 10 basamak belirsizliğin çok altında).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [src, degArg] = process.argv.slice(2);
if (!src) { console.error('kullanım: node tools/grail_kes.mjs <gggrx_1200a_sha.tab> [derece]'); process.exit(1); }
const N = Number(degArg || 100);
const buf = fs.readFileSync(src);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
const lines = buf.toString('latin1').split('\n').filter((l) => l.trim());
const head = lines[0].split(',').map((s) => s.trim());
const R = Number(head[0]), GM = Number(head[1]), deg = Number(head[3]), norm = Number(head[5]);
if (norm !== 1) throw new Error('katsayılar normalleştirilmiş değil');
if (N > deg) throw new Error(`model derecesi ${deg} < ${N}`);
const K = ((N + 1) * (N + 2)) / 2, C = new Float64Array(K), S = new Float64Array(K);
C[0] = 1;                                                           // C00 (tabloda yok)
for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split(',');
  const n = Number(f[0]), m = Number(f[1]);
  if (n > N) break;                                                 // tablo dereceye göre sıralı
  const k = (n * (n + 1)) / 2 + m;
  C[k] = Number(f[2]); S[k] = Number(f[3]);
}
const fmt = (a) => Array.from(a, (x) => (x === 0 ? '0' : Number(x.toPrecision(10)).toString())).join(',');
const out = `// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Üreten: tools/grail_kes.mjs
// GRAIL GRGM1200A Ay çekim alanı (Goossens vd. 2016), ${N}. derece/mertebeye kesilmiş, tam normalleştirilmiş, Ay PA çerçevesi.
// Kaynak: NASA PDS Geosciences, grail_1001/shadr/${path.basename(src)} (sha256 ${sha})
// Dizilim: (n, m) katsayısı n(n+1)/2 + m sırasında; C00 = 1, birinci derece (kütle merkezi) sıfır.
export const GRGM = { model: 'GRGM1200A', R: ${R}, GM: ${GM}, N: ${N},
  C: [${fmt(C)}],
  S: [${fmt(S)}] };
`;
const dst = new URL('../web/js/moongrav_data.js', import.meta.url);
fs.writeFileSync(dst, out);
console.log(`yazıldı: web/js/moongrav_data.js — ${N}. derece, ${K} katsayı çifti, ${(out.length / 1024).toFixed(0)} KB`);
