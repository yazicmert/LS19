// Eski dönemli NEO öğelerinin N-cisim tümlemesiyle güncel döneme taşınması (tools/neo_epok.mjs) ve Dünya'ya çarpmış cisimlerin bulunması;
// canlı katmana birleştirme (asteroids.js applyEpok) ve MPC U belirsizlik açıklaması (astui.js uRunout). Başvurular JPL SBDB + Horizons.
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const D = await import('../js/deflect.js');
const { tasi } = await import('../../tools/neo_epok.mjs');
const { applyEpok } = await import('../js/asteroids.js');
const { uRunout } = await import('../js/astui.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eng = new D.DeflectEngine(ab(new URL('../data/de440s.bsp', import.meta.url)));
const R = JSON.parse(fs.readFileSync(new URL('./fixtures/neo_epok_ref.json', import.meta.url)));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// oscElements, keplerHelio'nun tersi
{ const el = R.bennu.el, et = D.etFromJd(el.epoch + 123.4), [r, v] = D.keplerHelio(el, et), o = D.oscElements(r, v);
  const r2 = D.keplerHelio({ ...o, epoch: el.epoch + 123.4 }, et)[0];
  ok(dist(r, r2) < 1e-3 && Math.abs(o.om - el.om) < 1e-8 && Math.abs(o.w - el.w) < 1e-8, `oscElements gidiş-dönüş ${(dist(r, r2) * 1e3).toFixed(3)} m`); }

// Bennu (JPL dönemi 2011) ve kayıp 2011 BG10: iki cisim Kepler milyonlarca km sapar, N-cisim taşıma Horizons'a birkaç yüz km
for (const [ad, c, kLim] of [['Bennu', R.bennu, 3e6], ['2011 BG10', R.eski, 5e7]]) {
  const h = c.horizons, et = D.etFromJd(h.jd), kep = dist(D.keplerHelio(c.el, et)[0], h.r);
  const t = tasi(eng, c.el, h.jd), nb = dist(D.keplerHelio({ ...t.el, epoch: h.jd }, et)[0], h.r);
  ok(kep > kLim && nb < 1000, `${ad}: ${((h.jd - c.el.epoch) / 365.25).toFixed(1)} yıllık taşıma, Horizons'tan fark: iki cisim ${(kep / 1e6).toFixed(1)} milyon km → N-cisim ${nb.toFixed(0)} km`);
}

// 2024 XA1: atmosfere giriş 2024-12-03 ~16:15 UTC; tümleme çarpmayı bulmalı
{ const t = tasi(eng, R.xa1.el, 2461357.5), jd = Date.parse(R.xa1.carpma_utc) / 86400000 + 2440587.5;
  ok(t.carpma && Math.abs(t.carpma.jd - jd) * 1440 < 15 && t.carpma.km < D.R_E, `2024 XA1 çarpması bulundu (fark ${t.carpma ? ((t.carpma.jd - jd) * 1440).toFixed(1) : '-'} dk, en yakın ${t.carpma ? t.carpma.km.toFixed(0) : '-'} km)`); }

// applyEpok: çarpanı çıkar, aynı JPL çözümündekini değiştir, JPL'in yeni çözümüne dokunma
{ const C = { des: ['A', 'B', 'C', 'X'], a: [1.5, 2.0, 1.1, 1.3], e: [0.1, 0.2, 0.3, 0.4], i: [1, 2, 3, 4], om: [5, 6, 7, 8], w: [9, 10, 11, 12], ma: [13, 14, 15, 16], ep: [2455000.5, 2461000.5, 2457000.5, 2460000.5], name: [null, null, null, null] };
  const ep = { epok: 2461357.5, o: { A: [2455000.5, 1.5, 1.51, 0.11, 1.1, 5.1, 9.1, 99], C: [2457000.5, 1.0999, 1.2, 0.3, 3, 7, 11, 50] }, carpan: [{ des: 'X' }] };
  const s = applyEpok(C, ep);
  ok(s.degisen === 1 && s.cikan === 1 && C.des.join() === 'A,B,C' && C.ep[0] === 2461357.5 && C.ma[0] === 99 && C.ep0[0] === 2455000.5 && C.ep0[1] === null && C.ma[2] === 15 && C.name.length === 3,
    'applyEpok: çarpan çıkarıldı, eski dönemli taşındı, JPL çözümü değişmiş olana dokunulmadı'); }

// MPC U: 10 yılda ortalama anomali belirsizliği sınırları
ok(uRunout(8) === '9,2°–41°' && uRunout(9) === '> 41°' && uRunout(0).startsWith('<') && uRunout(null) === null && uRunout('') === null, `uRunout: U8 ${uRunout(8)}, U9 ${uRunout(9)}, U5 ${uRunout(5)}`);

// üretilmiş veri dosyası (haftalık iş akışı): biçim
{ const f = new URL('../data/neo_epok.json', import.meta.url), j = JSON.parse(fs.readFileSync(f));
  const o = Object.values(j.o);
  ok(j.epok > 2461000 && j.n === o.length && o.length > 5000 && o.every((x) => x.length === 8 && x[0] < j.epok && x[3] < 1) && j.carpan.length >= 11, `neo_epok.json: ${j.n} cisim, ${j.carpan.length} çarpan, dönem JD ${j.epok}`);
  ok(['2008 TC3', '2014 AA', '2018 LA', '2019 MO', '2022 EB5', '2022 WJ1', '2023 CX1', '2024 BX1', '2024 RW1', '2024 UQ', '2024 XA1'].every((d) => j.carpan.some((c) => c.des === d)), 'çarpmadan önce keşfedilmiş bilinen 11 cismin (2008–2024) hepsi çarpan listesinde'); }
if (fail) process.exit(1);
