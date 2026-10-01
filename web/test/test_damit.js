// DAMIT asteroit şekilleri: tüm parçaları aç, her kaydı doğrula (indeks sınırı, hacim eşdeğeri yarıçap 1, pozitif hacim, dönme verisi)
import fs from 'fs';
import zlib from 'zlib';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const dir = new URL('../models/ast/damit/', import.meta.url);
const idx = JSON.parse(fs.readFileSync(new URL('damit.json', dir))), Q = idx.q, ents = Object.entries(idx.m);
ok(ents.length > 4000, `${ents.length} DAMIT asteroidi`);
const shards = new Map(); let bad = 0, badVol = 0, badRot = 0, maxExt = 0;
const cat = JSON.parse(fs.readFileSync(new URL('../models/ast/katalog.json', import.meta.url)));
ok(!ents.some(([d]) => cat[d]), 'NASA PDS modeli olan asteroit DAMIT\'te yinelenmiyor');
for (const [des, m] of ents) {
  const [sh, off, nv, nf, lam, bet, P, jd0, phi0] = m;
  if (!shards.has(sh)) shards.set(sh, zlib.gunzipSync(fs.readFileSync(new URL(`damit_${String(sh).padStart(3, '0')}.bin.gz`, dir))));
  const b = shards.get(sh), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  const v = new Int16Array(buf, off, nv * 3), f = new Uint16Array(buf, off + nv * 6, nf * 3);
  let vol = 0, mx = 0, badIdx = false;
  for (let k = 0; k < nf; k++) {
    const [a, c, d] = [f[3 * k], f[3 * k + 1], f[3 * k + 2]]; if (a >= nv || c >= nv || d >= nv) { badIdx = true; break; }
    const A = [v[3 * a], v[3 * a + 1], v[3 * a + 2]], B = [v[3 * c], v[3 * c + 1], v[3 * c + 2]], C = [v[3 * d], v[3 * d + 1], v[3 * d + 2]];
    vol += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
  }
  for (let k = 0; k < v.length; k++) mx = Math.max(mx, Math.abs(v[k]));
  maxExt = Math.max(maxExt, mx / Q);
  const req = Math.cbrt(3 * vol / (4 * Math.PI)) / Q;
  if (badIdx || nf > 800 || nv < 4) bad++;
  if (!(vol > 0) || Math.abs(req - 1) > 0.03) badVol++;
  if (!(P > 0) || Math.abs(bet) > 90 || lam < -1 || lam > 361 || !Number.isFinite(jd0) || !Number.isFinite(phi0)) badRot++;
}
ok(bad === 0, `tüm kayıtlarda indeksler geçerli, ≤ 800 üçgen (${bad} hatalı)`);
ok(badVol === 0, `hacim pozitif ve eşdeğer yarıçap 1 ±%3 (${badVol} hatalı)`);
ok(badRot === 0, `dönme verisi (λ, β, P, JD0, φ0) geçerli (${badRot} hatalı)`);
ok(maxExt < 4, `en uzak köşe ${maxExt.toFixed(2)} birim (nicemleme sınırı içinde)`);
const p = idx.m['2']; ok(p && Math.abs(p[4] - 35) < 15 && Math.abs(p[5] + 12) < 10, 'Pallas kutbu ~(35°, −12°)');
if (fail) process.exit(1);
