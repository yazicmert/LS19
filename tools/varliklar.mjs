// LS19 ağır varlıkları (dokular, efemeris parçaları, 3B modeller, JPL çekirdekleri) git'te değil, GitHub Release'te durur.
// Depoda yalnız küçük bir bildirim kalır (varliklar.json): her paketin adı ve içindeki her dosyanın SHA-256 özeti.
// Paket adı içeriğin özetinden türetilir (doku-<12 hane>.tar): bir kez yayımlanan paket hiç değişmez; içerik değişirse yeni ad alır.
// Uygulama kodu dosyaları eski yollarından okur (web/textures/…, web/models/…): paketler açılınca dosyalar yerlerine konur.
//
//   node tools/varliklar.mjs indir [--site]   paketleri indirip açar (yerelde eşleşen dosyalar varsa indirmez). --site: yalnız siteye gidenler
//                                            (Vercel derlemesi). Önce github.com indirme adresi, olmazsa GitHub API (GITHUB_TOKEN varsa onunla).
//   node tools/varliklar.mjs denetle [--site] yerel dosyalar bildirimle aynı mı (eksik / farklı dosyaları sayar; değilse çıkış kodu 1)
//   node tools/varliklar.mjs paketle         yerel dosyalardan bildirimi yeniden yazar ve paketleri .varliklar/ içine üretir.
//                                            Uydu modelleri önce gzip'lenir (.glb → .glb.gz; tarayıcı DecompressionStream ile açar).
//   node tools/varliklar.mjs yukle           Release'te olmayan paketleri yükler (GITHUB_TOKEN gerekir; .github/workflows/varliklar.yml).
//                                            Yerel dosyalar bildirimle aynı olmalı; değilse yükleme yapılmaz.
// Gereken: Node ≥ 20 (fetch), tar. Bağımlılık yok.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BILDIRIM = path.join(ROOT, 'varliklar.json');
const ARA = path.join(ROOT, '.varliklar');                    // üretilen paketler (git dışı)
const DEPO = process.env.LS19_VARLIK_DEPO || 'yazicmert/LS19', ETIKET = 'varliklar';

// Gruplar: kök klasör + dosya deseni. site: false → yalnız testler ve araçlar (Vercel'e gitmez).
export const GRUPLAR = [
  { ad: 'doku', site: true, kok: 'web/textures', desen: /\.(jpg|png|webp|ktx2)$/ },
  { ad: 'efemeris', site: true, kok: 'web/data/eph', desen: /\.bin$/ },
  { ad: 'uydu', site: true, kok: 'web/models/sats', desen: /\.glb\.gz$/ },
  { ad: 'asteroit', site: true, kok: 'web/models/ast', desen: /\.(glb|bin\.gz)$/ },
  { ad: 'cekirdek', site: false, kok: 'web/data', desen: /^(de440s\.bsp|moon_pa_de440_200625\.bpc)$/, derin: false },
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

function tara(g) {
  const out = [], kok = path.join(ROOT, g.kok);
  const gez = (d, derin) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (derin) gez(p, true); } else if (g.desen.test(e.name)) out.push(rel(p));
    }
  };
  gez(kok, g.derin !== false);
  return out.sort();
}
// paket adı: dosya yolları ve özetlerinden (tar baytlarından değil: tar sürümüne bağlı olmasın)
const paketAdi = (g, dosyalar) => `${g.ad}-${sha(Object.entries(dosyalar).map(([p, h]) => `${p}\0${h}\n`).join('')).slice(0, 12)}.tar`;

export function oku() { return JSON.parse(fs.readFileSync(BILDIRIM, 'utf8')); }
const secili = (b, site) => Object.entries(b.paketler).filter(([, pk]) => !site || pk.site);

// yerel dosyaların bildirimle karşılaştırması: { eksik: [...], farkli: [...] }
function karsilastir(pk) {
  const eksik = [], farkli = [];
  for (const [p, h] of Object.entries(pk.dosyalar)) {
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f)) eksik.push(p); else if (sha(fs.readFileSync(f)) !== h) farkli.push(p);
  }
  return { eksik, farkli };
}

function uyduGz() {                                                  // uydu modelleri gzip'li saklanır ve sunulur (meshopt verisi ~%60 küçülür)
  const d = path.join(ROOT, 'web/models/sats'); if (!fs.existsSync(d)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.glb'))) {
    const p = path.join(d, f);
    fs.writeFileSync(p + '.gz', zlib.gzipSync(fs.readFileSync(p), { level: 9 })); fs.rmSync(p); n++;
  }
  return n;
}

function paketle() {
  const gz = uyduGz(); if (gz) console.log(`uydu: ${gz} model gzip'lendi (.glb.gz)`);
  const b = { surum: 1, depo: DEPO, etiket: ETIKET, aciklama: 'Ağır varlıklar GitHub Release\'te; indir: node tools/varliklar.mjs indir', paketler: {} };
  fs.mkdirSync(ARA, { recursive: true });
  for (const g of GRUPLAR) {
    const liste = tara(g); if (!liste.length) { console.log(`${g.ad}: dosya yok, atlandı`); continue; }
    const dosyalar = {}; let bayt = 0;
    for (const p of liste) { const buf = fs.readFileSync(path.join(ROOT, p)); dosyalar[p] = sha(buf); bayt += buf.length; }
    const ad = paketAdi(g, dosyalar);
    b.paketler[g.ad] = { ad, site: g.site, bayt, dosyalar };
    const hedef = path.join(ARA, ad);
    if (!fs.existsSync(hedef)) { const lst = path.join(ARA, g.ad + '.liste'); fs.writeFileSync(lst, liste.join('\n') + '\n'); execFileSync('tar', ['-cf', hedef, '-C', ROOT, '-T', lst]); fs.rmSync(lst); }
    console.log(`${g.ad}: ${liste.length} dosya, ${mb(bayt)} → ${ad}`);
  }
  fs.writeFileSync(BILDIRIM, JSON.stringify(b, null, 1) + '\n');
  console.log('bildirim yazıldı: varliklar.json');
}

const api = (u, o = {}) => fetch(u.startsWith('http') ? u : `https://api.github.com${u}`, { ...o, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ls19-varliklar', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}), ...(o.headers || {}) } });

async function release(b, olustur = false) {
  let r = await api(`/repos/${b.depo}/releases/tags/${b.etiket}`);
  if (r.status === 404 && olustur) {
    r = await api(`/repos/${b.depo}/releases`, { method: 'POST', body: JSON.stringify({ tag_name: b.etiket, name: 'LS19 varlıkları', make_latest: 'false',
      body: 'Dokular, efemeris parçaları, 3B modeller ve JPL çekirdekleri. Paketler içerik özetiyle adlandırılır ve değişmez; hangilerinin kullanıldığını depodaki varliklar.json söyler. İndirmek için: `node tools/varliklar.mjs indir`.' }) });
  }
  if (!r.ok) throw new Error(`Release alınamadı (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function indirPaket(b, pk, rel_) {
  const adresler = [`https://github.com/${b.depo}/releases/download/${b.etiket}/${pk.ad}`];
  let son = '';
  for (const u of adresler) {
    try { const r = await fetch(u, { headers: { 'User-Agent': 'ls19-varliklar' } }); if (r.ok) return Buffer.from(await r.arrayBuffer()); son = `${u}: ${r.status}`; } catch (e) { son = `${u}: ${e.message}`; }
  }
  // yedek: GitHub API (vekil ya da güvenlik duvarı github.com'u engelliyorsa)
  try {
    const rr = rel_ || await release(b), a = rr.assets.find((x) => x.name === pk.ad);
    if (!a) throw new Error('Release\'te yok');
    const r = await api(a.url, { headers: { Accept: 'application/octet-stream' } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    son += `; API: ${r.status}`;
  } catch (e) { son += `; API: ${e.message}`; }
  throw new Error(`${pk.ad} indirilemedi (${son})`);
}

async function indir(site) {
  const b = oku(); let rel_ = null, n = 0;
  for (const [g, pk] of secili(b, site)) {
    const k = karsilastir(pk);
    if (!k.eksik.length && !k.farkli.length) { console.log(`${g}: güncel (${Object.keys(pk.dosyalar).length} dosya)`); continue; }
    const t0 = Date.now(), buf = await indirPaket(b, pk, rel_);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ls19v-')), pk.ad);
    fs.writeFileSync(tmp, buf);
    execFileSync('tar', ['-xf', tmp, '-C', ROOT]);
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    const s = karsilastir(pk);
    if (s.eksik.length || s.farkli.length) throw new Error(`${g}: paket açıldı ama ${s.eksik.length} dosya eksik, ${s.farkli.length} dosya farklı (ör. ${[...s.eksik, ...s.farkli][0]})`);
    console.log(`${g}: ${pk.ad} indirildi ve doğrulandı (${mb(buf.length)}, ${((Date.now() - t0) / 1000).toFixed(1)} sn)`); n++;
  }
  console.log(n ? `${n} paket indirildi` : 'tüm varlıklar güncel');
}

function denetle(site, sessiz = false) {
  const b = oku(); let kotu = 0;
  for (const [g, pk] of secili(b, site)) {
    const k = karsilastir(pk), n = k.eksik.length + k.farkli.length; kotu += n;
    if (!sessiz) console.log(`${g}: ${n ? `${k.eksik.length} eksik, ${k.farkli.length} farklı` : 'tamam'} (${Object.keys(pk.dosyalar).length} dosya, ${pk.ad})`);
  }
  return kotu === 0;
}

async function yukle() {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN gerekli');
  const gz = uyduGz(); if (gz) console.log(`uydu: ${gz} model gzip'lendi (.glb.gz)`);    // dosyalar git'te .glb olarak duruyorsa (ilk taşıma)
  const b = oku(), rr = await release(b, true), var_ = new Set(rr.assets.map((a) => a.name));
  for (const [g, pk] of Object.entries(b.paketler)) {
    if (var_.has(pk.ad)) { console.log(`${g}: ${pk.ad} zaten Release'te`); continue; }
    const k = karsilastir(pk);
    if (k.eksik.length || k.farkli.length) throw new Error(`${g}: ${pk.ad} Release'te yok ve yerel dosyalar bildirimle aynı değil (${k.eksik.length} eksik, ${k.farkli.length} farklı): önce paketle`);
    let dosya = path.join(ARA, pk.ad);
    if (!fs.existsSync(dosya)) {
      fs.mkdirSync(ARA, { recursive: true }); const lst = path.join(ARA, g + '.liste');
      fs.writeFileSync(lst, Object.keys(pk.dosyalar).join('\n') + '\n'); execFileSync('tar', ['-cf', dosya, '-C', ROOT, '-T', lst]); fs.rmSync(lst);
    }
    const buf = fs.readFileSync(dosya);
    const u = rr.upload_url.replace(/\{.*\}$/, '') + `?name=${encodeURIComponent(pk.ad)}`;
    const r = await api(u, { method: 'POST', body: buf, headers: { 'Content-Type': 'application/x-tar', 'Content-Length': String(buf.length) } });
    if (!r.ok) throw new Error(`${pk.ad} yüklenemedi (${r.status}): ${(await r.text()).slice(0, 200)}`);
    console.log(`${g}: ${pk.ad} yüklendi (${mb(buf.length)})`);
  }
}

const [kmt, ...arg] = process.argv.slice(2), site = arg.includes('--site');
const isler = { paketle: async () => paketle(), indir: () => indir(site), yukle, denetle: async () => { if (!denetle(site, arg.includes('--sessiz'))) process.exitCode = 1; } };
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!isler[kmt]) { console.log('kullanım: node tools/varliklar.mjs indir [--site] | denetle [--site] | paketle | yukle'); process.exit(2); }
  isler[kmt]().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
}
