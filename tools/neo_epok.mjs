// Eski dönemli NEO yörüngelerini güncel döneme N-cisim tümlemesiyle taşır ve Dünya'ya çarpmış cisimleri bulur → web/data/neo_epok.json
//
// Neden: JPL SBDB'deki Dünya'ya yakın asteroitlerin ~%27'sinin oskülatör öğelerinin dönemi 1 yıldan eski (çoğu kayıp, U=8–9; Bennu gibi
// iyi belirlenmiş birkaç cisim de var). Canlı katman öğeleri iki cisim Kepler çözümüyle bugüne taşır; gezegen pertürbasyonları yüzünden
// bu, eski dönemlilerde JPL Horizons'a göre milyonlarca km (Dünya'dan bakınca derecelerce) sapma verir. Burada aynı öğeler, saptırma
// motorunun (DE440s: Güneş, gezegenler, Ay, Plüton + 1PN genel görelilik) tümleyicisiyle hedef döneme taşınıp yeni oskülatör öğeler
// yazılır (Horizons'la karşılaştırmada 30 eski dönemli cisimde < 300 km). Yerçekimsel olmayan kuvvetler (Yarkovsky) yok.
// Çarpma: dönemden hedefe kadar Dünya'nın R_E + 100 km'sine giren yörüngeler (atmosfere giriş) çarpmış sayılır ve katmandan çıkarılır;
// MOID'i küçük (< 0,002 AB) tüm NEO'lar dönem yaşından bağımsız denetlenir.
//
// Kullanım: node tools/neo_epok.mjs [--girdi sbdb_query.json] [--cikti web/data/neo_epok.json] [--epok JD] [--esik-gun 365] [--sinir N]
// Girdi verilmezse JPL SBDB Query API'den alınır (https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html); vekil arkasında NODE_USE_ENV_PROXY=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeflectEngine, keplerHelio, oscElements, etFromJd, jdFromEt, AU, R_E } from '../web/js/deflect.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CIKTI = arg('--cikti', path.join(ROOT, 'web/data/neo_epok.json')), ESIK = +arg('--esik-gun', 365), SINIR = +arg('--sinir', 0);
const MOID_CARPMA = 0.002, ATM_KM = 100;
const FIELDS = 'pdes,epoch,a,e,i,om,w,ma,moid,condition_code';

async function veri() {
  const g = arg('--girdi');
  if (g) return JSON.parse(fs.readFileSync(g, 'utf8'));
  const q = new URLSearchParams({ fields: FIELDS, 'sb-group': 'neo', 'sb-kind': 'a', 'full-prec': '1' });
  const r = await fetch('https://ssd-api.jpl.nasa.gov/sbdb_query.api?' + q, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('SBDB HTTP ' + r.status);
  return r.json();
}

// et0'daki öğelerden et1'e: Güneş merkezli öğeler -> BCRS durum -> tümleme (Dünya yakın geçişleri izlenir) -> Güneş merkezli öğeler
export function tasi(eng, el, jd1, opt = {}) {
  const et0 = etFromJd(el.epoch), et1 = etFromJd(jd1), [r, v] = keplerHelio(el, et0), [ps, vs] = eng.sun(et0);
  const y0 = [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]];
  const sc = eng.scan(et0, y0, et1, { maxDist: opt.maxDist ?? 0.002 * AU });
  const carp = sc.list.find((c) => c.dist < R_E + ATM_KM);
  if (carp) return { carpma: { jd: jdFromEt(carp.et), km: carp.dist, vrel: carp.vrel } };
  const y = sc.end.y, [p1, v1] = eng.sun(et1);
  return { el: oscElements([y[0] - p1[0], y[1] - p1[1], y[2] - p1[2]], [y[3] - v1[0], y[4] - v1[1], y[5] - v1[2]]) };
}

async function main() {
  const d = await veri(), F = d.fields, ix = Object.fromEntries(F.map((f, k) => [f, k]));
  const jd1 = arg('--epok') ? +arg('--epok') : Math.floor(Date.now() / 86400000 + 2440587.5 - 0.5) + 0.5;   // bugünün 0h'si (TDB ~ UTC, 69 s fark önemsiz)
  const b = fs.readFileSync(path.join(ROOT, 'web/data/de440s.bsp')), eng = new DeflectEngine(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const satir = d.data.map((x) => ({ des: x[ix.pdes], ep: +x[ix.epoch], a: +x[ix.a], e: +x[ix.e], i: +x[ix.i], om: +x[ix.om], w: +x[ix.w], ma: +x[ix.ma],
    moid: x[ix.moid] == null ? null : +x[ix.moid], u: x[ix.condition_code] }));
  let is = satir.filter((s) => s.e < 1 && s.a > 0 && s.ep < jd1 && (jd1 - s.ep > ESIK || (s.moid != null && s.moid < MOID_CARPMA)));
  if (SINIR) is = is.slice(0, SINIR);
  const o = {}, carpan = [], t0 = Date.now();
  is.forEach((s, k) => {
    const el = { a: s.a, e: s.e, i: s.i, om: s.om, w: s.w, ma: s.ma, epoch: s.ep };
    const r = tasi(eng, el, jd1);
    if (r.carpma) carpan.push({ des: s.des, jd: +r.carpma.jd.toFixed(5), km: Math.round(r.carpma.km), v: +r.carpma.vrel.toFixed(2), ep: s.ep });
    else if (jd1 - s.ep > ESIK) {
      const e = r.el, g = (x, n) => +x.toPrecision(n);
      // kaynak dönemi ve a: istemci, JPL çözümü değişmemişse (aynı dönem ve a) bu öğeleri kullanır
      o[s.des] = [s.ep, s.a, g(e.a, 11), g(e.e, 11), g(e.i, 11), g(e.om, 11), g(e.w, 11), g(e.ma, 11)];
    }
    if ((k + 1) % 500 === 0) console.error(`${k + 1}/${is.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  });
  const out = { aciklama: 'Eski dönemli JPL SBDB NEO öğeleri, N-cisim tümlemesiyle (DE440s) ortak döneme taşınmış; Dünya\'ya çarpmış cisimler ayrı',
    kaynak: 'JPL SBDB (oskülatör öğeler) + LS19 N-cisim tümleyicisi', t: Date.now(), epok: jd1, esikGun: ESIK,
    alanlar: ['kaynakDonem', 'kaynakA', 'a', 'e', 'i', 'om', 'w', 'ma'], n: Object.keys(o).length, o, carpan };
  fs.writeFileSync(CIKTI, JSON.stringify(out));
  console.error(`${is.length} cisim tümlendi (${((Date.now() - t0) / 1000).toFixed(0)} s): ${out.n} yeni dönem, ${carpan.length} çarpma → ${CIKTI}`);
  for (const c of carpan) console.error(`  çarpmış: ${c.des}  JD ${c.jd}  ${c.km} km`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
