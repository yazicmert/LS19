// Parçalı JPL çekirdek deposu sınaması (Node): data/eph/v1 parçaları özgün de440s.bsp ve moon_pa_de440_200625.bpc ile BİT DÜZEYİNDE aynı durumu verir;
// yüklenmemiş kayda erişim hata atar (sessiz sıfır yok); canlı efemeris (N-cisim başlangıcı) iki kaynaktan aynı kurulur.
//   node test/test_ephstore.js          (parçalar güncel değilse: node tools/efemeris_parcala.mjs)
import fs from 'fs';
import { SPKKernel, PCKKernel } from '../js/jplkernel.js';
import { EphStore, recordRange, chunkSpan } from '../js/ephstore.js';
import { LiveEphemeris } from '../js/ephem.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const dir = new URL('../data/', import.meta.url), eph = new URL('eph/v1/', dir);
const rd = (u) => { const b = fs.readFileSync(u); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const get = (p, kind) => Promise.resolve(kind === 'json' ? JSON.parse(fs.readFileSync(new URL(p, eph), 'utf8')) : rd(new URL(p, eph)));
const spkF = new SPKKernel(rd(new URL('de440s.bsp', dir))), pckF = new PCKKernel(rd(new URL('moon_pa_de440_200625.bpc', dir)));
const store = await EphStore.open(eph.href, get), ix = store.ix;
const Y = 365.25 * 86400, et = (yr) => (yr - 2000) * Y;
const same = (a, b) => a.length === b.length && a.every((x, i) => (Array.isArray(x) ? same(x, b[i]) : Object.is(x, b[i])));

console.log('düzen');
check(ix.n === 301 && ix.kernels.spk.size === 32726016 && ix.kernels.pck.size === 12863488, `ızgara ${ix.n} yıl; çekirdek boyutları özgün dosyalarla aynı`);
const files = fs.readdirSync(eph).filter((f) => /^y\d+\.bin$/.test(f));
const sizes = files.map((f) => fs.statSync(new URL(f, eph)).size);
check(files.length === ix.n && Math.max(...sizes) < 160 * 1024, `${files.length} parça, en büyüğü ${(Math.max(...sizes) / 1024).toFixed(0)} KB (< 160 KB)`);
let exp = 0; for (let k = 0; k < ix.n; k++) { const [cs, ce] = chunkSpan(ix, k); for (const s of ix.segs) { if (s.inHead) continue; const r = recordRange(s, cs, ce); if (r) exp += (r[1] - r[0] + 1) * s.rsize * 8; } }
check(exp === sizes.reduce((a, b) => a + b, 0), 'parça boyutları dizindeki kayıt düzeniyle tutarlı');

console.log('yüklenmemiş kayıt');
let threw = false; try { store.spk.ssb(399, et(2026.8)); } catch (e) { threw = /yüklenmedi/.test(e.message); }
check(threw, 'yüklenmemiş yılda Dünya durumu istenince hata (sessiz sıfır değil)');
threw = false; try { store.pck.angles(et(2026.8)); } catch (e) { threw = /yüklenmedi/.test(e.message); }
check(threw, 'Ay yönelimi için de aynı');
check(!store.has(et(2026.8)), 'has(): yüklenmedi');

console.log('bit düzeyinde aynılık');
const years = [1850.01, 1899.5, 1969.54, 2000, 2026.78, 2026.999, 2027.001, 2100.3, 2149.9];
await store.ensure(et(years[0]) + 86400, et(years[0]) + 86400);
for (const y of years.slice(1)) await store.ensure(et(y) - 2 * 86400, et(y) + 30 * 86400);
const bodies = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 199, 299, 399, 301];
let n = 0, bad = 0;
const probe = (t) => { for (const b of bodies) { n++; if (!same(store.spk.ssb(b, t), spkF.ssb(b, t))) bad++; } n++; if (!same(store.pck.angles(t), pckF.angles(t))) bad++; };
for (const y of years.slice(1)) for (let d = -2; d <= 30; d += 0.37) probe(et(y) + d * 86400);
probe(et(years[0]) + 86400);
// parça sınırları: sınırın iki yanı ve tam üstü
for (const k of [store.chunkOf(et(2026.999)), store.chunkOf(et(2027.001))]) { const [cs, ce] = chunkSpan(ix, k); for (const t of [cs, cs + 1e-3, ce - 1e-3, ce]) if (store.has(t)) probe(t); }
check(bad === 0 && n > 3000, `${n} durum (14 gövde + Ay yönelimi; 1850–2150, parça sınırları dahil): parçalı depo = tam çekirdek, bit düzeyinde (fark ${bad})`);
check(store.has(et(2026.78), et(2026.78) + 20 * 86400) && store.chunksFor(et(2026.5), et(2027.5)).length === 2, 'has()/chunksFor(): yüklü aralık, yıl sınırını aşan aralık iki parça');
const before = store.loaded.size; await store.ensure(et(2026.78)); check(store.loaded.size === before, 'yüklü parça yeniden indirilmez');

console.log('canlı efemeris');
const et0 = et(2026.78);
const Ls = new LiveEphemeris(store.spk, store.pck, et0), Lf = new LiveEphemeris(spkF, pckF, et0);
const st = (L) => JSON.stringify([Array.from(L.fwd[0].y), Array.from(L.fwd[0].f)]);
check(Ls.fwd[0].y.length > 50 && st(Ls) === st(Lf), 'LiveEphemeris başlangıç durumu (N-cisim tümlemesinin girdisi) iki kaynaktan bayt bayt aynı');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
