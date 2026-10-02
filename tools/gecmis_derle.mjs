// LS19 geçmiş yörünge özeti: halka açık CelesTrak verisinin git geçmişinden (github.com/jtmiclat/celestrak-historical, 12 saatte bir)
// her uydunun yarı büyük eksen a(t) serisini çıkarır; manevra (yükseltme) sıçramalarını ve bozunma eğimini bulur ->
// web/data/gecmis.json (yalnız türetilmiş özetler ve aday cisimlerin seyreltilmiş a(t) serileri).
// Space-Track kullanılmaz (şartları yeniden dağıtımı kısıtlar); yalnız kamuya açık CelesTrak verisi.
//
// Kullanım (Node 20+):   node tools/gecmis_derle.mjs [--adim-gun 7] [--cikti web/data/gecmis.json] [--onbellek /tmp/gecmis]
// GitHub API hız sınırı için isteğe bağlı: GITHUB_TOKEN ortam değişkeni.
import fs from 'fs';
import path from 'path';
import { analyzeHistory, expectedDecayKmDay, controlFromHistory } from '../web/js/impact.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const STEP = +arg('adim-gun', 7), OUT = arg('cikti', 'web/data/gecmis.json'), CACHE = arg('onbellek', path.join(process.env.TMPDIR || '/tmp', 'ls19-gecmis'));
const REPO = 'jtmiclat/celestrak-historical', FILE = 'raw-data/tle-data.txt', MU = 398600.4418;
const H = { 'User-Agent': 'LS19-gecmis', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) };
fs.mkdirSync(CACHE, { recursive: true });

async function commits() {
  const out = [];
  for (let p = 1; p < 40; p++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=100&page=${p}`, { headers: H });
    if (!r.ok) throw new Error('GitHub API ' + r.status);
    const j = await r.json(); if (!j.length) break;
    for (const c of j) out.push({ sha: c.sha, t: Date.parse(c.commit.committer.date) });
    if (j.length < 100) break;
  }
  return out.sort((a, b) => a.t - b.t);
}
// Alpha-5 katalog numarası (A0001 = 100001 …)
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const catNo = (s) => { s = s.trim(); return /^[A-Z]/.test(s) ? (10 + ALPHA.indexOf(s[0])) * 10000 + +s.slice(1) : +s; };
const expo = (s) => { const m = /^\s*([+-]?)(\d+)([+-]\d)\s*$/.exec(s); return m ? +(m[1] + '0.' + m[2]) * 10 ** +m[3] : 0; };
function parse(txt, snapMs) {
  const L = txt.split(/\r?\n/), out = new Map();
  for (let i = 0; i + 2 < L.length; i++) {
    const l1 = L[i + 1], l2 = L[i + 2];
    if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
    const id = catNo(l1.slice(2, 7)), yy = +l1.slice(18, 20), doy = +l1.slice(20, 32), year = yy < 57 ? 2000 + yy : 1900 + yy;
    const t = Date.UTC(year, 0, 1) + (doy - 1) * 864e5, n = +l2.slice(52, 63), e = +('0.' + l2.slice(26, 33).trim());
    if (!(n > 0)) continue;
    out.set(id, { t, a: Math.cbrt(MU / (n * 2 * Math.PI / 86400) ** 2), e, bstar: expo(l1.slice(53, 61)), n });
    i += 2;
  }
  return out;
}
async function snapshot(c) {
  const f = path.join(CACHE, c.sha.slice(0, 12) + '.txt');
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${c.sha}/${FILE}`, { headers: { 'User-Agent': 'LS19-gecmis' } });
    if (!r.ok) throw new Error(`${c.sha.slice(0, 8)}: HTTP ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return parse(fs.readFileSync(f, 'utf8'), c.t);
}

const all = await commits();
// seçim: her adım günde bir (hedef saate en yakın) + son 6 anlık görüntü (güncel eğim için)
const picks = []; let nextT = all[0].t;
for (const c of all) if (c.t >= nextT) { picks.push(c); nextT = c.t + STEP * 864e5 - 12 * 3600e3; }
for (const c of all.slice(-6)) if (!picks.includes(c)) picks.push(c);
picks.sort((a, b) => a.t - b.t);
console.log(`${all.length} anlık görüntü; ${picks.length} tanesi indirilecek (adım ${STEP} gün)`);

const series = new Map();                                   // id -> [{t,a,e,bstar}]
let done = 0;
async function worker(q) {
  while (q.length) {
    const c = q.shift(); let snap;
    for (let k = 0; k < 3 && !snap; k++) { try { snap = await snapshot(c); } catch (e) { if (k === 2) console.log('ATLANDI', e.message); } }
    if (snap) for (const [id, s] of snap) { let a = series.get(id); if (!a) series.set(id, (a = [])); const last = a[a.length - 1]; if (!last || s.t > last.t) a.push(s); }
    if (++done % 10 === 0) console.log(`  ${done}/${picks.length}`);
  }
}
const q = picks.slice(); await Promise.all(Array.from({ length: 4 }, () => worker(q)));

const sats = {}, seri = {}; let nSeri = 0;
const t0 = picks[0].t, axis = picks.map((c) => Math.round((c.t - t0) / 864e3) / 100), RE = 6378.135;
for (const [id, S] of series) {
  S.sort((a, b) => a.t - b.t);
  const last = S[S.length - 1];
  if (last.a - RE > 1500) continue;                                                       // çok yüksek yörünge: bozunma ihmal edilebilir
  const r = analyzeHistory(S);
  if (r.durum === 'yetersiz') continue;
  const exp = expectedDecayKmDay(last.a, last.e, last.bstar);
  const row = { n: r.n, spanDays: r.spanDays, boostCount: r.boostCount, lastBoostMs: r.lastBoostMs, slopeKmDay: r.slopeKmDay, expKmDay: exp, rms: r.slopeRms };
  sats[id] = [r.n, +r.spanDays.toFixed(1), r.boostCount, r.lastBoostMs ? Math.round(r.lastBoostMs / 864e5) : 0, +r.slopeKmDay.toFixed(5), +r.slopeRms.toFixed(3), +last.a.toFixed(3), Math.round(last.t / 864e5), +exp.toFixed(5), +r.segDays.toFixed(1)];
  // serbest bozunanlar için a(t) (grafik): ortak zaman ekseni, eksik örnekler null
  if (controlFromHistory(row).klass === 'serbest' && r.slopeKmDay < -0.002) {
    const arr = new Array(picks.length).fill(null); let k = 0;
    for (const s of S) { while (k < picks.length - 1 && Math.abs(picks[k + 1].t - s.t) < Math.abs(picks[k].t - s.t)) k++; arr[k] = +s.a.toFixed(2); }
    seri[id] = arr; nSeri++;
  }
}
const meta = { kaynak: 'CelesTrak (halka açık) · github.com/jtmiclat/celestrak-historical git geçmişi', ornek: picks.length, ilk: new Date(picks[0].t).toISOString(), son: new Date(picks[picks.length - 1].t).toISOString(), adimGun: STEP, eksen: axis, t0Gun: Math.round(t0 / 864e5),
  alanlar: ['örnek sayısı', 'kapsanan gün', 'manevra sayısı', 'son manevra (gün, Unix)', 'gözlenen eğim km/gün', 'eğim RMS km', 'son a km', 'son epoch (gün, Unix)', 'B*ten beklenen bozunma km/gün', 'manevrasız dilim (gün)'], uretim: new Date().toISOString() };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ meta, sats, seri }));
console.log(`yazıldı: ${OUT} · ${Object.keys(sats).length} uydu özeti, ${nSeri} seri · ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB`);
