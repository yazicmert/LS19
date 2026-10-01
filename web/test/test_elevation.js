// 2B yükselti haritası verisi: Dünya (ETOPO 2022) çözme + bilinen noktalar; Ay LOLA kodlaması için sınır kontrolü
import fs from 'fs';
import zlib from 'zlib';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const meta = JSON.parse(fs.readFileSync(new URL('../textures/earth_height.json', import.meta.url)));
const b = zlib.gunzipSync(fs.readFileSync(new URL('../textures/earth_height.bin.gz', import.meta.url)));
const { w, h } = meta, n = w * h, z = new Int16Array(n);
ok(b.length === 2 * n, `ham boyut ${b.length} = 2·${w}·${h}`);
for (let r = 0; r < h; r++) { let v = 0; for (let c = 0; c < w; c++) { const i = r * w + c; v = (v + (((b[i] << 8) | b[n + i]) << 16 >> 16)) << 16 >> 16; z[i] = v; } }
let mn = 1e9, mx = -1e9; for (const v of z) { if (v < mn) mn = v; if (v > mx) mx = v; }
ok(mn === meta.min && mx === meta.max, `min/max meta ile aynı (${mn} … ${mx} m)`);
const at = (lat, lon) => z[Math.min(h - 1, Math.floor((90 - lat) / 180 * h)) * w + Math.min(w - 1, Math.floor((lon + 180) / 360 * w))];
ok(at(28, 87) > 4000, `Himalaya/Tibet yüksek (${at(28, 87)} m)`);
ok(at(11.35, 142.2) < -7000, `Mariana çukuru derin (${at(11.35, 142.2)} m)`);
ok(at(0, -30) < -2000 && at(0, -30) > -6000, `Atlantik ortası deniz tabanı (${at(0, -30)} m)`);
ok(at(41, 29) > -300 && at(41, 29) < 600, `İstanbul çevresi (${at(41, 29)} m)`);
ok(at(-80, 0) > 500, `Antarktika buz yüzeyi (${at(-80, 0)} m)`);
if (fail) process.exit(1);
