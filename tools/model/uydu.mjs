// NASA 3D Resources (github.com/nasa/NASA-3D-Resources; NASA medya kullanım kurallarıyla serbest) uydu modellerini tarar, yörüngedeki
// uydularla eşleştirir ve LS19 biçimine çevirir. Yalnız kesin eşleşme eklenir; emin olunamayanlar raporda listelenir.
//
// Eşleştirme (GCAT satcat, J. McDowell, CC BY 4.0): klasör adının kendisi ve parantez içindeki kısaltmalar ↔ GCAT Name / PLName
// (büyük harf, yalnız harf ve rakam). Aday: şu an Dünya yörüngesinde olan (CelesTrak SATCAT) bir yük (GCAT Type=P*). Aynı uydunun birden çok
// model sürümü varsa (A/B/C) ilki eklenir. Birden çok nesne eşleşirse
// hepsi aynı adı taşımalı (ör. MMS 1–4); en çok 8. Elle eşleştirme ve dışlama: tools/model/eslesme.json { "<klasör>": [NORAD…] | null }.
// Ölçek: GCAT uzunluk/çap/açıklığın en büyüğü (m); yoksa model eklenmez. Yönelim varsayılan (inceleme sırasında satcatalog_oto.js'e rot eklenebilir).
// Dönüşüm (tools/uydu_modelleri.mjs ile aynı): Draco çöz, tekrarları birleştir, ≥ 80 bin üçgende sadeleştir, dokular ≤ 1024 px WebP,
// meshopt + nicemleme. Sınır: gzip'li ≤ 1,2 MB (aşarsa 40 bin üçgen / 512 px ile yeniden; yine aşarsa eklenmez).
//
//   node tools/model/uydu.mjs [--en-cok N] [--kuru]   (--kuru: yalnız rapor, dosya yazmaz)
// Çıktı: web/models/sats/<anahtar>.glb (varliklar.mjs paketle gzip'ler), web/js/satcatalog_oto.js (otomatik katalog), rapor.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, quantize, flatten, join, reorder, instance } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { ROOT, ARA, UA, arg, var_, getText, csv, rapor } from './ortak.mjs';
import { MODELS, modelFor } from '../../web/js/satcatalog.js';

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const REPO = 'nasa/NASA-3D-Resources', SINIR = 1.2 * 1048576, EN_COK = +arg('--en-cok', 20), KURU = var_('--kuru');
const OTO = path.join(ROOT, 'web/js/satcatalog_oto.js'), ESL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/model/eslesme.json'), 'utf8'));
const norm = (s) => String(s || '').toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]/g, '');

// --- 1) NASA 3D Resources dosya listesi (blob indirmeden: kısmi klon)
const klon = path.join(ARA, 'nasa3d');
if (!fs.existsSync(path.join(klon, '.git'))) execSync(`git clone -q --filter=blob:none --no-checkout --depth 1 https://github.com/${REPO}.git "${klon}"`, { stdio: 'inherit' });
else execSync(`git -C "${klon}" fetch -q --depth 1 origin && git -C "${klon}" reset -q --soft FETCH_HEAD`, { stdio: 'inherit' });
const sha = execSync(`git -C "${klon}" rev-parse --short HEAD`).toString().trim();
const dosyalar = execSync(`git -C "${klon}" ls-tree -r -l HEAD -- "3D Models"`, { maxBuffer: 64 << 20 }).toString().trim().split('\n')
  .map((l) => { const m = l.match(/^\S+ blob \S+\s+(\d+)\t(.+)$/); return m ? { boyut: +m[1], yol: m[2] } : null; }).filter(Boolean);
const klasorler = new Map();                                            // klasör → en küçük .glb
for (const d of dosyalar) {
  if (!d.yol.toLowerCase().endsWith('.glb')) continue;
  const k = d.yol.split('/')[1], o = klasorler.get(k); if (!o || d.boyut < o.boyut) klasorler.set(k, d);
}
const kullanilan = new Set(fs.readFileSync(path.join(ROOT, 'tools/uydu_modelleri.txt'), 'utf8').split('\n').map((l) => l.split('|')[1]).filter(Boolean).map((p) => p.split('/')[0]));
const otoEski = fs.existsSync(OTO) ? JSON.parse(fs.readFileSync(OTO, 'utf8').match(/\/\*VERI\*\/([\s\S]*)\/\*SON\*\//)[1]) : { models: {}, byId: {} };
for (const m of Object.values(otoEski.models)) kullanilan.add(m.kaynak);

// --- 2) Şu an Dünya yörüngesinde olanlar (CelesTrak SATCAT: yörünge merkezi Dünya, düşmemiş); adlar ve boyutlar GCAT'tan
let yorungede = null;                                                   // CelesTrak'a ulaşılamazsa GCAT'ın kendi durumu: Status=O, Primary=Earth (DSO dışarıda)
try {
  yorungede = new Set(csv(await getText('https://celestrak.org/pub/satcat.csv', { timeoutMs: 300000 }))
    .filter((r) => r.ORBIT_CENTER === 'EA' && r.ORBIT_TYPE === 'ORB' && !r.DECAY_DATE).map((r) => +r.NORAD_CAT_ID));
  if (yorungede.size < 10000) throw new Error(`eksik (${yorungede.size})`);
} catch (e) { console.log(`CelesTrak SATCAT alınamadı (${e.cause?.code || e.message}); GCAT durumu kullanılıyor`); yorungede = null; }
const tsv = await getText('https://planet4589.org/space/gcat/tsv/cat/satcat.tsv', { timeoutMs: 300000 });
const satirlar = tsv.split('\n'), bas = satirlar[0].replace(/^#/, '').split('\t').map((s) => s.trim());
const ix = Object.fromEntries(bas.map((b, i) => [b, i]));
const yukler = [];
for (const l of satirlar.slice(1)) {
  if (!l || l[0] === '#') continue;
  const c = l.split('\t').map((s) => s.trim());
  if (!/^P/.test(c[ix.Type]) || !+c[ix.Satcat] || (yorungede ? !yorungede.has(+c[ix.Satcat]) : c[ix.Status] !== 'O' || c[ix.Primary] !== 'Earth')) continue;
  const adlar = [c[ix.Name], c[ix.PLName]].map(norm).filter((s) => s.length >= 3);      // AltNames kullanılmaz: kısaltmalar başka nesnelerle çakışıyor
  const boy = Math.max(+c[ix.Length] || 0, +c[ix.Diameter] || 0, +c[ix.Span] || 0);
  yukler.push({ norad: +c[ix.Satcat], ad: c[ix.Name], adlar: new Set(adlar), boy });
}
const adIndeks = new Map();
for (const y of yukler) for (const a of y.adlar) { if (!adIndeks.has(a)) adIndeks.set(a, []); adIndeks.get(a).push(y); }

// klasör adının adayları: tam ad (sürüm ekleri atılmış) ve parantez içleri (kısaltmalar)
function adaylar(k) {
  const temiz = k.replace(/\s*\((?:[A-E]|\d{4}|IGOAL|A|B|C|D|E)\)\s*/g, ' ').trim();
  const parantez = [...temiz.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  return [...new Set([temiz.replace(/\([^)]*\)/g, ''), temiz, ...parantez].map(norm).filter((s) => s.length >= 3))];
}

// --- 3) eşleştir
const eklenecek = [], rapSatir = { eslesmedi: [], belirsiz: [], var: [], boyutYok: [], disla: [] };
for (const [k, glb] of [...klasorler].sort()) {
  if (kullanilan.has(k)) continue;
  let es;
  if (k in ESL) {
    if (ESL[k] === null) { rapSatir.disla.push(k); continue; }
    es = ESL[k].map((n) => yukler.find((y) => y.norad === n)).filter(Boolean);
    if (!es.length) { rapSatir.eslesmedi.push(`${k} (eslesme.json: yörüngede değil)`); continue; }
  } else {
    const bul = new Map(); for (const a of adaylar(k)) for (const y of adIndeks.get(a) || []) bul.set(y.norad, y);
    es = [...bul.values()];
    if (!es.length) { rapSatir.eslesmedi.push(k); continue; }
    const adSet = new Set(es.map((y) => norm(y.ad).replace(/\d+$/, '')));
    if (es.length > 8 || adSet.size > 1) { rapSatir.belirsiz.push(`${k} → ${es.slice(0, 6).map((y) => `${y.ad} (${y.norad})`).join(', ')}${es.length > 6 ? ' …' : ''}`); continue; }
  }
  if (es.some((y) => eklenecek.some((e) => e.es.some((z) => z.norad === y.norad)))) { rapSatir.var.push(`${k} → aynı uydunun başka sürümü eklendi`); continue; }
  if (es.some((y) => modelFor(y.norad, y.ad))) { rapSatir.var.push(`${k} → ${es.map((y) => y.ad).join(', ')}`); continue; }
  const boy = Math.max(...es.map((y) => y.boy));
  if (!(boy > 0.1)) { rapSatir.boyutYok.push(`${k} → ${es.map((y) => `${y.ad} (${y.norad})`).join(', ')}`); continue; }
  // aynı adlı küçük bir nesne (ör. 0,5 m'lik küp uydu) büyük bir aracın modeliyle eşleşmesin: < 1 m yalnız CubeSat klasörlerinde
  if (boy < 1 && !/cubesat/i.test(k)) { rapSatir.belirsiz.push(`${k} → ${es.map((y) => `${y.ad} (${y.norad})`).join(', ')}: şüpheli boyut (${boy} m)`); continue; }
  let anahtar = norm(adaylar(k).sort((a, b) => a.length - b.length)[0]).toLowerCase().slice(0, 16) || 'uydu';
  while (MODELS[anahtar] || otoEski.models[anahtar] || eklenecek.some((e) => e.anahtar === anahtar)) anahtar += 'x';
  eklenecek.push({ klasor: k, glb, es, boy, anahtar });
}

// --- 4) dönüştür
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
const PX = 'data:image/png;base64,' + (await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 170, g: 170, b: 170 } } }).png().toBuffer()).toString('base64');
function yamaGlb(buf) {                                                 // dış (eksik) doku adresleri → gri piksel
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString());
  let ch = false; for (const im of json.images || []) if (im.uri && !im.uri.startsWith('data:')) { im.uri = PX; ch = true; }
  if (!ch) return buf;
  let s = Buffer.from(JSON.stringify(json)); s = Buffer.concat([s, Buffer.alloc((4 - s.length % 4) % 4, 0x20)]);
  const rest = buf.slice(20 + jl), out = Buffer.alloc(20 + s.length + rest.length);
  buf.copy(out, 0, 0, 12); out.writeUInt32LE(s.length, 12); out.writeUInt32LE(0x4E4F534A, 16); s.copy(out, 20); rest.copy(out, 20 + s.length); out.writeUInt32LE(out.length, 8);
  return out;
}
async function cevir(ham, maxt, px) {
  const doc = await io.readBinary(yamaGlb(ham));
  doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose());
  const say = () => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return t; };
  await doc.transform(dedup(), instance({ min: 3 }), flatten(), join(), weld());
  const t0 = say(); if (t0 > maxt) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: maxt / t0, error: 0.02, lockBorder: false }));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: 80 }), reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return { glb: Buffer.from(await io.writeBinary(doc)), ucgen: Math.round(say()), ucgen0: Math.round(t0) };
}

const eklendi = [], olmadi = [];
if (KURU) rapor('Uydu adayları (kuru çalıştırma)', eklenecek.map((e) => `- ${e.klasor} → ${e.es.map((y) => `${y.ad} (${y.norad})`).join(', ')}, ${e.boy} m, anahtar \`${e.anahtar}\``).join('\n') || '- yok');
for (const e of KURU ? [] : eklenecek.slice(0, EN_COK)) {
  try {
    const url = `https://raw.githubusercontent.com/${REPO}/master/${e.glb.yol.split('/').map(encodeURIComponent).join('/')}`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(300000) }); if (!r.ok) throw new Error(`indirilemedi (${r.status})`);
    const ham = Buffer.from(await r.arrayBuffer());
    let c = await cevir(ham, 80000, 1024), gz = zlib.gzipSync(c.glb, { level: 9 }).length;
    if (gz > SINIR) { c = await cevir(ham, 40000, 512); gz = zlib.gzipSync(c.glb, { level: 9 }).length; }
    if (gz > SINIR) throw new Error(`sınırı aşıyor (${(gz / 1048576).toFixed(2)} MB gzip'li)`);
    if (!KURU) fs.writeFileSync(path.join(ROOT, 'web/models/sats', e.anahtar + '.glb'), c.glb);
    eklendi.push({ ...e, kb: Math.round(gz / 1024), ucgen: c.ucgen, ucgen0: c.ucgen0, hamKb: Math.round(ham.length / 1024) });
  } catch (er) { olmadi.push(`${e.klasor}: ${er.message}`); }
}

fs.writeFileSync(path.join(ARA, 'uydu-yeni.json'), JSON.stringify(KURU ? [] : eklendi.map((e) => ({ anahtar: e.anahtar, klasor: e.klasor }))));

// --- 5) otomatik katalog (satcatalog.js birleştirir)
const yeni = { models: { ...otoEski.models }, byId: { ...otoEski.byId } };
for (const e of eklendi) {
  yeni.models[e.anahtar] = { title: e.es[0].ad, size: +e.boy.toFixed(2), src: 'nasa3d', oto: true, kaynak: e.klasor, nasa3d: sha };
  for (const y of e.es) yeni.byId[y.norad] = e.anahtar;
}
if (!KURU) fs.writeFileSync(OTO, `// OTOMATİK ÜRETİLİR (tools/model/uydu.mjs): NASA 3D Resources'tan eklenen uydu modelleri. Elle düzenlenebilir alanlar: title, size, rot.
// models: anahtar → { title, size (m, GCAT uzunluk/çap/açıklığın en büyüğü), src, kaynak (NASA 3D Resources klasörü) }; byId: NORAD → anahtar
export const OTO = /*VERI*/${JSON.stringify(yeni, null, 1)}/*SON*/;
`);

const liste = (a, n = 40) => a.length ? a.slice(0, n).map((s) => `  - ${s}`).join('\n') + (a.length > n ? `\n  - … (+${a.length - n})` : '') : '  - yok';
rapor('Uydu modelleri (NASA 3D Resources)', `Kaynak işlemesi \`${sha}\`; yörüngedeki ${yukler.length} yük (${yorungede ? 'CelesTrak SATCAT' : 'GCAT durumu; CelesTrak alınamadı'}), ${klasorler.size} GLB klasörü tarandı.

**Eklenen (${eklendi.length})** — ölçek GCAT'tan, yönelim varsayılan: inceleyip gerekirse \`web/js/satcatalog_oto.js\` içinde \`rot\` ekleyin.
${eklendi.length ? '| Anahtar | Uydu (NORAD) | Boyut | Kaynak klasör | Üçgen | Dosya |\n| --- | --- | --- | --- | --- | --- |\n' + eklendi.map((e) => `| \`${e.anahtar}\` | ${e.es.map((y) => `${y.ad} (${y.norad})`).join(', ')} | ${e.boy.toFixed(1)} m | ${e.klasor} | ${e.ucgen0} → ${e.ucgen} | ${e.hamKb} → ${e.kb} KB (gzip) |`).join('\n') : '- yok'}
${eklenecek.length > EN_COK ? `\nBu çalıştırmada ${EN_COK} ile sınırlandı; kalan ${eklenecek.length - EN_COK} aday sonraki çalıştırmada.\n` : ''}
<details><summary>Eklenemeyenler ve eşleşmeyenler</summary>

- Dönüştürülemedi:
${liste(olmadi)}
- Belirsiz: birden çok farklı nesne ya da şüpheli boyut (elle karar: tools/model/eslesme.json):
${liste(rapSatir.belirsiz)}
- GCAT'ta boyut yok:
${liste(rapSatir.boyutYok)}
- Uydunun zaten modeli var:
${liste(rapSatir.var)}
- Yörüngedeki bir uyduyla eşleşmedi (yer aracı, gezegen sondası, roket ya da adı farklı):
${liste(rapSatir.eslesmedi, 400)}
- Dışlanan (eslesme.json: null):
${liste(rapSatir.disla)}
</details>`);
