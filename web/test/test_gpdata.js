// CelesTrak verisinin tazelik ve SupGP birleştirme kuralları (js/gpdata.js): 2 saatten eski kopya doğrudan CelesTrak'ı tetikler,
// bildirilen yaş eksik/yanlışsa verinin en yeni çağı alt sınır olur, operatör kaydı yalnız normal GP kaydından yeniyse kullanılır.
import fs from 'fs';
import { MAX_COPY_AGE_S, EPOCH_SLACK_S, epochMs, newestEpochMs, dataAgeS, isStale, mergeSupGP, ommFromColumns } from '../js/gpdata.js';
import { ommColumns } from '../../api/_lib.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const fx = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'));
const iso = (ms) => new Date(ms).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000');   // OMM biçimi: saat dilimsiz, 6 hane

ok(epochMs({ EPOCH: '2026-09-28T10:44:54.252096' }) === Date.UTC(2026, 8, 28, 10, 44, 54, 252), 'EPOCH saat dilimsiz UTC okunur (mikrosaniye kırpılır)');
ok(epochMs({ EPOCH: '2026-09-28T10:44:54Z' }) === Date.UTC(2026, 8, 28, 10, 44, 54) && Number.isNaN(epochMs({})), 'Z ekli çağ ve eksik çağ');
ok(MAX_COPY_AGE_S === 7200, 'kopya için en çok 2 saat');

const now = Date.UTC(2026, 10, 6, 18, 0, 0);
const fresh = [{ EPOCH: iso(now - 3 * 3600e3) }, { EPOCH: iso(now - 40 * 86400e3) }];
const old = [{ EPOCH: iso(now - 38 * 86400e3) }, { EPOCH: iso(now - 39 * 86400e3) }];
ok(newestEpochMs(fresh) === now - 3 * 3600e3, 'en yeni çağ');
ok(dataAgeS(0, fresh, now) === 0 && !isStale(dataAgeS(0, fresh, now)), 'taze veri: yaş 0, bayat değil');
ok(dataAgeS('5400', fresh, now) === 5400 && !isStale(5400), 'bildirilen 1,5 sa: bayat değil');
ok(isStale(dataAgeS('9000', fresh, now)), 'bildirilen 2,5 sa: bayat (doğrudan CelesTrak denenir)');
const a38 = dataAgeS(0, old, now);
ok(Math.abs(a38 - (38 * 86400 - EPOCH_SLACK_S)) < 1 && isStale(a38), `bildirilen yaş 0 ama çağlar 38 günlük: ${(a38 / 86400).toFixed(1)} gün, bayat`);
ok(dataAgeS(null, [], now) === 0 && isStale(NaN) && isStale(undefined), 'boş veri; bilinmeyen yaş bayat sayılır');

// SupGP birleştirme
const gp = [
  { NORAD_CAT_ID: 25544, OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', EPOCH: iso(now - 6 * 3600e3), MEAN_MOTION: 15.5 },
  { NORAD_CAT_ID: 44713, OBJECT_NAME: 'STARLINK-1007', OBJECT_ID: '2019-074A', EPOCH: iso(now - 2 * 3600e3), MEAN_MOTION: 15.06 },
  { NORAD_CAT_ID: 99999, OBJECT_NAME: 'DIGER', OBJECT_ID: '2020-001A', EPOCH: iso(now - 3600e3), MEAN_MOTION: 14 },
];
const sup = {
  iss: [{ NORAD_CAT_ID: 25544, OBJECT_NAME: 'ISS', EPOCH: iso(now - 3600e3), MEAN_MOTION: 15.51, DATA_SOURCE: 'NASA', RMS: '0.1' },
    { NORAD_CAT_ID: 25544, OBJECT_NAME: 'ISS', EPOCH: iso(now - 8 * 3600e3), MEAN_MOTION: 15.49, DATA_SOURCE: 'NASA' }],
  starlink: [{ NORAD_CAT_ID: 44713, OBJECT_NAME: 'STARLINK-1007', EPOCH: iso(now - 38 * 86400e3), MEAN_MOTION: 15.0, DATA_SOURCE: 'SpaceX' }],
};
const r = mergeSupGP(gp, sup, now);
ok(r.n === 1 && r.older === 1, `yeni SupGP kullanıldı (${r.n}), eski olan elendi (${r.older})`);
ok(r.merged[0]._sup && r.merged[0].MEAN_MOTION === 15.51 && r.merged[0].OBJECT_NAME === 'ISS (ZARYA)' && r.merged[0].OBJECT_ID === '1998-067A' && r.merged[0]._sup.rms === 0.1,
  'ISS: en yakın çağlı operatör kaydı, GP adı ve kimliği korunur');
ok(!r.merged[1]._sup && r.merged[1].MEAN_MOTION === 15.06, 'Starlink: 38 günlük SupGP taze GP kaydını bozmaz');
ok(r.merged[2] === gp[2], 'SupGP kaydı olmayan uydu aynen kalır');
const eq = mergeSupGP([gp[0]], { iss: [{ ...sup.iss[0], EPOCH: gp[0].EPOCH }] }, now);
ok(eq.n === 0 && eq.older === 1, 'aynı çağlı SupGP kullanılmaz (yalnız daha yeniyse)');

// gerçek örnek kayıtlarla: ISS GP (2026-09-28 11:09) ve SupGP dosyası
const g = fx('gp_active.json'), s = fx('sup_iss.json'), nowFx = Date.UTC(2026, 8, 28, 20, 0, 0);
const m = mergeSupGP(g, { iss: s }, nowFx), iss = m.merged.find((o) => +o.NORAD_CAT_ID === 25544);
ok(m.merged.length === g.length && iss._sup && epochMs(iss) > epochMs(g.find((o) => +o.NORAD_CAT_ID === 25544)), `örnek veri: ISS SupGP (çağ ${iss.EPOCH}) GP'den yeni, kullanıldı`);
const shifted = g.map((o) => ({ ...o, EPOCH: iso(nowFx + 40 * 86400e3) }));
const m2 = mergeSupGP(shifted, { iss: s }, nowFx + 40 * 86400e3);
ok(m2.n === 0 && m2.older > 0, `örnek veri: GP 40 gün yenilenince eski SupGP kopyası elenir (${m2.older} uydu)`);


// sütunlu biçim (api/gp?group=…&fmt=col): kayıpsız gidiş-dönüş, eksik alan, dizi aynen geçer, bozuk biçim hata
{
  const arr = fx('gp_active.json'), c = ommColumns(arr), back = ommFromColumns(JSON.parse(JSON.stringify(c)));
  ok(c.n === arr.length && back.length === arr.length && JSON.stringify(back) === JSON.stringify(arr), `sütunlu biçim kayıpsız: ${arr.length} uydu, alan sırası dahil aynı`);
  const plain = JSON.stringify(arr).length, col = JSON.stringify(c).length;
  ok(col < 0.5 * plain, `sütunlu biçim ham boyutu yarıdan az: ${(plain / 1e6).toFixed(2)} → ${(col / 1e6).toFixed(2)} MB`);
  const mixed = [{ A: 1, B: 'x' }, { A: 2 }, { C: 0, B: '' }], mb = ommFromColumns(ommColumns(mixed));
  ok(JSON.stringify(mb) === JSON.stringify([{ A: 1, B: 'x' }, { A: 2 }, { B: '', C: 0 }]), 'eksik alan null yazılır, açılırken atlanır; 0 ve boş metin korunur');
  ok(ommFromColumns(arr) === arr, 'dizi gelirse (kopya, doğrudan CelesTrak) olduğu gibi döner');
  const bad = [{}, { n: 2, cols: { A: [1] } }, { n: -1, cols: {} }, null].map((d) => { try { ommFromColumns(d); return false; } catch (e) { return true; } });
  ok(bad.every(Boolean), 'bozuk sütunlu biçim hata verir (çağıran öteki kaynağa geçer)');
}

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
