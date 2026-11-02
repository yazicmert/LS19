// JPL çekirdeklerini yıllık parçalara böler (web/js/ephstore.js'in okuduğu biçim): web/data/eph/v1/{index.json, head.bin, y<k>.bin}
//   node tools/efemeris_parcala.mjs            (web/data/de440s.bsp + web/data/moon_pa_de440_200625.bpc → web/data/eph/v1/)
// Katsayılar dönüştürülmez: özgün dosyanın baytları kopyalanır. Biçim değişirse klasör adı (v1) da değişmeli: dosyalar "immutable" önbelleklenir (vercel.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAF } from '../web/js/jplkernel.js';
import { recordRange, chunkSpan } from '../web/js/ephstore.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'web/data/eph/v1');
const Y = 365.25 * 86400;
const read = (f) => { const b = fs.readFileSync(path.join(root, 'web/data', f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const K = { spk: { file: 'de440s.bsp', buf: read('de440s.bsp') }, pck: { file: 'moon_pa_de440_200625.bpc', buf: read('moon_pa_de440_200625.bpc') } };

const segs = []; let E0 = Infinity, E1 = -Infinity;
for (const [name, k] of Object.entries(K)) {
  const daf = new DAF(k.buf), dv = new DataView(k.buf);
  // başlık: dosya kaydı (1) + özet kayıtları zinciri ve her birinin ad kaydı (DAF: özet kaydının ardındaki kayıt)
  const head = [[0, 1024]];
  for (let rec = dv.getInt32(76, true); rec > 0; rec = dv.getFloat64((rec - 1) * 1024, true)) head.push([(rec - 1) * 1024, 1024], [rec * 1024, 1024]);
  for (const s of daf.segments) {
    const n = s.n, start = n[n.length - 2], end = n[n.length - 1];
    const tr = new Float64Array(k.buf, (end - 4) * 8, 4), [init, intlen, rsize, nrec] = tr;
    const inHead = nrec <= 2;                                     // tek/iki kayıtlı segment (Merkür, Venüs barisentri): tümü başlıkta
    head.push(inHead ? [(start - 1) * 8, (end - start + 1) * 8] : [(end - 4) * 8, 32]);
    segs.push({ kernel: name, ids: n.slice(0, -2), start, end, init, intlen, rsize, nrec, et0: s.d[0], et1: s.d[1], inHead });
    if (name === 'spk') { E0 = Math.min(E0, s.d[0]); E1 = Math.max(E1, s.d[1]); }
  }
  head.sort((a, b) => a[0] - b[0]);
  k.head = head.filter((h, i) => i === 0 || h[0] !== head[i - 1][0]);         // yinelenen kayıt yok
  k.size = k.buf.byteLength;
}
const n = Math.ceil((E1 - E0) / Y);
const ix = { v: 1, about: 'LS19 parçalı JPL çekirdekleri (tools/efemeris_parcala.mjs; okuyucu web/js/ephstore.js)', E0, E1, Y, n,
  kernels: Object.fromEntries(Object.entries(K).map(([name, k]) => [name, { file: k.file, size: k.size, head: k.head }])), segs };

fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const headBytes = Buffer.concat(Object.values(K).flatMap((k) => k.head.map(([o, l]) => Buffer.from(k.buf, o, l))));
fs.writeFileSync(path.join(out, 'head.bin'), headBytes);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(ix));
let total = 0;
for (let c = 0; c < n; c++) {
  const [cs, ce] = chunkSpan(ix, c), parts = [];
  for (const s of segs) {
    if (s.inHead) continue;
    const r = recordRange(s, cs, ce); if (!r) continue;
    parts.push(Buffer.from(K[s.kernel].buf, (s.start - 1 + r[0] * s.rsize) * 8, (r[1] - r[0] + 1) * s.rsize * 8));
  }
  const b = Buffer.concat(parts); total += b.length;
  fs.writeFileSync(path.join(out, `y${c}.bin`), b);
}
console.log(`${n} yıllık parça, toplam ${(total / 1e6).toFixed(1)} MB (ortalama ${(total / n / 1024).toFixed(0)} KB), başlık ${(headBytes.length / 1024).toFixed(1)} KB → ${path.relative(root, out)}`);
