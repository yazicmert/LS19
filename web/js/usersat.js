// Kendi uydum: kullanıcının 3B modeli ya da CAD çıktısı (GLB, STL, OBJ) fragmanda park yörüngesinde araçtan ayrılan uydu olur.
//   · Yüklemeden önce kullanım şartı onaylanır (SART_SURUM); onay (sürüm, zaman, metnin SHA-256 özeti) modelle birlikte saklanır.
//   · Model ve onay bu tarayıcıda, IndexedDB'de durur (localStorage'a sığmaz). Pencereler arası değişiklik BroadcastChannel ile duyurulur.
//   · Arşiv (api/arsiv.js, Vercel Blob): fragman üretilince (video dışa aktarımı) ya da uydulu bir bağlantı paylaşılınca model ve kayıt (ad, boy, onay, kurgu) yüklenir.
//     Arşiv kapalıysa ya da ağ yoksa kayıt bekler; sonraki açılışta yeniden denenir. Paylaşım bağlantısı arşivdeki model adresini taşır (uydu=…).
//   · Biçimler ve şart metni usersart.js'te (sunucuyla ortak).
//   · Model çözme ve sahne: usermodel.js (three.js'e bağlı; yalnız gerekince yüklenir). Bu dosya three.js içe aktarmaz.

export { SART_SURUM, SART_METNI, SINIR, BICIMLER, bicimOf, zipMi, catiaMi, KALDIRMA } from './usersart.js';
import { SART_SURUM, SART_METNI, SINIR, BICIMLER, bicimOf, zipMi, catiaMi, arsivAdresi } from './usersart.js';
export const RENKLER = ['#c9ccd2', '#d8b25a', '#e8e4da', '#3b4a63', '#8f2f2f'];

// ---------------------------------------------------------------- saklama (IndexedDB) ve pencereler arası duyuru
const DB = 'ls19-uydum', ST = 'uydu', ANAHTAR = 'aktif';
let meta = null, hazir = null; const dinleyici = new Set();
const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ls19-uydum') : null;
const ac = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const islem = async (mod, f) => { const db = await ac(); try { return await new Promise((res, rej) => { const tx = db.transaction(ST, mod), q = f(tx.objectStore(ST)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); } finally { db.close(); } };
const metaOf = (r) => (r ? { ad: r.ad, boy: r.boy, renk: r.renk, dosyaAdi: r.dosyaAdi, bicim: r.bicim, bayt: r.bayt, ucgen: r.ucgen, ozet: r.ozet, boyanir: !!r.boyanir, onay: r.onay, uretim: r.uretim || [], arsiv: r.arsiv || null } : null);
const duyur = (yerel = true) => { for (const f of dinleyici) { try { f(meta); } catch (e) { console.warn(e); } } if (yerel && kanal) kanal.postMessage('degisti'); };
if (kanal) kanal.onmessage = () => { yenile().then(() => duyur(false)); };

const yenile = async () => { try { meta = metaOf(await islem('readonly', (s) => s.get(ANAHTAR))); } catch (e) { meta = null; } return meta; };
// sayfa açılışında bir kez (eşzamansız); uydum() o zamana dek null döner
export function hazirla() {
  if (!hazir) hazir = typeof indexedDB === 'undefined' ? Promise.resolve(null) : yenile().then((m) => {
    if (m) duyur(false);
    if (m && m.uretim.length && !m.arsiv) setTimeout(() => uydumArsivle().catch(() => {}), 8000);      // bekleyen arşiv kaydı: açılıştan biraz sonra yeniden dene
    return m;
  });
  return hazir;
}
export const uydum = () => meta;                                               // { ad, boy, renk, dosyaAdi, bicim, bayt, ucgen, ozet, onay, uretim } | null
export const uydumDinle = (f) => { dinleyici.add(f); return () => dinleyici.delete(f); };
export async function uydumKayit() { return islem('readonly', (s) => s.get(ANAHTAR)); }
async function yaz(r) { await islem('readwrite', (s) => s.put(r, ANAHTAR)); meta = metaOf(r); duyur(); return meta; }
export async function uydumSil() { await islem('readwrite', (s) => s.delete(ANAHTAR)); meta = null; duyur(); }
// ad, boy, renk değişikliği (model aynı)
export async function uydumGuncelle(degis) {
  const r = await uydumKayit(); if (!r) return null;
  const n = { ...r, ...ayarSuz({ ad: degis.ad ?? r.ad, boy: degis.boy ?? r.boy, renk: degis.renk ?? r.renk }) };
  return yaz(n);
}
// fragman üretildi (video dışa aktarımı): arşiv kaydı için zaman
export async function uydumUretildi(t = Date.now(), kurgu = null) { const r = await uydumKayit(); if (!r) return; r.uretim = [...(r.uretim || []), t].slice(-50); if (kurgu) r.kurgu = kurgu; await yaz(r); }

// ---------------------------------------------------------------- arşiv (api/arsiv.js) ve paylaşım
const ARSIV_UC = ['', 'api', 'arsiv'].join('/');                               // api/arsiv.js
let arsivAcik = null, arsivKip = null;
export async function arsivDurumu() {
  if (arsivAcik !== null) return arsivAcik;
  try { const r = await fetch(ARSIV_UC, { cache: 'no-store' }); const j = r.ok ? await r.json() : {}; arsivAcik = !!j.acik; arsivKip = j.kip || null; } catch (e) { arsivAcik = false; }
  return arsivAcik;
}
let arsivSuruyor = null;
// model + kayıt (ad, boy, renk, onay, kurgu) arşive; zaten arşivdeyse var olanı döndürür. Arşiv kapalıysa 'arsiv-kapali' hatası.
export function uydumArsivle(kurgu = null) {
  if (!arsivSuruyor) arsivSuruyor = arsivle(kurgu).finally(() => { arsivSuruyor = null; });
  return arsivSuruyor;
}
async function arsivle(kurgu) {
  const r = await uydumKayit(); if (!r) throw new Error('yok');
  if (r.arsiv) return r.arsiv;
  if (r.onay.surum !== SART_SURUM) throw new Error('sart-eski');
  if (!(await arsivDurumu())) throw new Error('arsiv-kapali');
  const B = await import('../lib/vercel-blob-client.esm.js'), upload = arsivKip === 'oidc' ? B.uploadPresigned : B.upload;      // oidc: sunucu imzalı adres üretir (api/arsiv.js)
  const id = r.ozet.slice(0, 16), kok = ['arsiv', id, ''].join('/'), opt = { access: 'public', handleUploadUrl: ARSIV_UC, clientPayload: JSON.stringify({ surum: r.onay.surum, onay: r.onay.t }) };
  const m = await upload(kok + 'model.' + r.bicim, r.dosya, { ...opt, contentType: BICIMLER[r.bicim].tur, multipart: r.bayt > 8e6 });
  const kayit = { id, ad: r.ad, boy: r.boy, renk: r.renk, bicim: r.bicim, dosyaAdi: r.dosyaAdi, bayt: r.bayt, ucgen: r.ucgen, ozet: r.ozet, onay: r.onay, uretim: r.uretim || [], kurgu: kurgu || r.kurgu || null, model: m.url, t: Date.now() };
  const k = await upload(kok + 'meta.json', new Blob([JSON.stringify(kayit)], { type: 'application/json' }), { ...opt, contentType: 'application/json' });
  const n = await uydumKayit(); if (!n || n.ozet !== r.ozet) return null;          // bu arada model değişti
  n.arsiv = { id, model: m.url, kayit: k.url, t: Date.now() }; await yaz(n); return n.arsiv;
}
// paylaşım bağlantısı: #…&uydu=<base64url JSON { u: model adresi, a: ad, b: boy, r: renk, f: biçim }>
const b64u = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (t) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
export const paylasimParam = (m, arsiv) => b64u(JSON.stringify({ u: arsiv.model, a: m.ad, b: m.boy, r: m.renk, f: m.bicim }));
export function paylasimCoz(s) {
  if (!s || s.length > 1200) return null;
  try {
    const o = JSON.parse(unb64u(s)); if (!o || !arsivAdresi(o.u) || !Object.hasOwn(BICIMLER, o.f)) return null;
    return { ...ayarSuz({ ad: o.a, boy: o.b, renk: o.r }), bicim: o.f, url: o.u, paylasilan: true, boyanir: o.f !== 'glb' };
  } catch (e) { return null; }
}
// bağlantıyla gelen uydu (bu oturum): fragmanda yerel modelin yerine gösterilir
let paylasilan = null;
export const uydumPaylasilanAyarla = (p) => { paylasilan = p || null; duyur(false); };
export const uydumPaylasilan = () => paylasilan;
export const uydumEtkin = () => paylasilan || meta;

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sartOzeti = async () => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SART_SURUM + '\n' + SART_METNI.join('\n'))));
// ad, boy, renk süzgeci (kullanıcı metni: denetim ve yön karakterleri atılır)
export function ayarSuz(o) {
  const ad = String(o.ad || '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, SINIR.ad) || 'Uydum';
  const b = Number(o.boy), boy = Number.isFinite(b) ? Math.min(SINIR.boyMax, Math.max(SINIR.boyMin, b)) : 3;
  const renk = RENKLER.includes(o.renk) ? o.renk : RENKLER[0];
  return { ad, boy, renk };
}

// yeni model: şart onayı zorunlu; dosya okunur, çözülür (bozuksa ya da sınır aşılırsa hata), sonra saklanır
export async function uydumYukle(dosya, { ad, boy, renk, onay } = {}) {
  if (!onay) throw new Error('sart');
  let adi = String((dosya && dosya.name) || ''), buf;
  if (catiaMi(adi)) throw new Error('catia');                                    // CATIA'nın kapalı biçimi: STEP'e dışa aktarılmalı
  if (zipMi(adi)) {                                                              // zip: içindeki en uygun CAD/3B dosyası (STEP > IGES > GLB > STL > OBJ)
    if (dosya.size > SINIR.zip) throw new Error('boyut');
    const z = await zipAc(await dosya.arrayBuffer()); adi = z.ad; buf = z.buf;
  } else {
    if (!bicimOf(adi)) throw new Error('bicim');
    if (dosya.size > SINIR.bayt) throw new Error('boyut');
    buf = await dosya.arrayBuffer();
  }
  const bicim = bicimOf(adi); if (!bicim) throw new Error('bicim');
  if (buf.byteLength > SINIR.bayt) throw new Error('boyut');
  const M = await import('./usermodel.js');                                    // three.js yalnız gerekince (ayrı pencere hafif açılır)
  const g = await M.modelCoz(buf, bicim), ucgen = M.ucgenSay(g), boyanir = !!g.userData.boyanir; M.modelBirak(g);
  if (!ucgen) throw new Error('bos');
  if (ucgen > SINIR.ucgen) throw new Error('ucgen');
  const ozet = hex(await crypto.subtle.digest('SHA-256', buf));
  const a = ayarSuz({ ad: ad || adi.replace(/\.[^.]+$/, ''), boy, renk });
  return yaz({ ...a, dosya: new Blob([buf]), dosyaAdi: adi.slice(0, 120), bicim, bayt: buf.byteLength, ucgen, ozet,
    boyanir, onay: { surum: SART_SURUM, t: Date.now(), metin: await sartOzeti() }, uretim: [] });
}

// ---------------------------------------------------------------- zip (CAD programlarının paylaştığı klasör): yalnız okunur, hiçbir şey çalıştırılmaz
// Merkezi dizinden girdiler okunur; __MACOSX ve ._ dosyaları atlanır; en uygun biçimin en büyük dosyası açılır (saklanmış ya da deflate).
// Açılan boyut sınırı akış sırasında da denetlenir (zip bombası); şifreli ya da ZIP64 desteklenmez. Desteklenen dosya yoksa: CATIA dosyaları → 'catia', yoksa 'zip-bos'.
export async function zipAc(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), n0 = buf.byteLength;
  let e = -1; for (let i = n0 - 22; i >= Math.max(0, n0 - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip');
  const say = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  if (p === 0xffffffff || p >= n0) throw new Error('zip');
  const girdi = [], td = new TextDecoder();
  for (let k = 0; k < say; k++) {
    if (p + 46 > n0 || v.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    girdi.push({ ad: td.decode(u8.subarray(p + 46, p + 46 + nl)), bayrak: v.getUint16(p + 8, true), yontem: v.getUint16(p + 10, true), csz: v.getUint32(p + 20, true), usz: v.getUint32(p + 24, true), off: v.getUint32(p + 42, true) });
    p += 46 + nl + xl + cl;
  }
  const temiz = girdi.filter((g) => !g.ad.endsWith('/') && !/(^|\/)__MACOSX\//.test(g.ad) && !/(^|\/)\._/.test(g.ad));
  const sira = Object.keys(BICIMLER);
  const aday = temiz.filter((g) => bicimOf(g.ad)).sort((a, b) => sira.indexOf(bicimOf(a.ad)) - sira.indexOf(bicimOf(b.ad)) || b.usz - a.usz)[0];
  if (!aday) throw new Error(temiz.some((g) => catiaMi(g.ad)) ? 'catia' : 'zip-bos');
  if (aday.bayrak & 1 || aday.csz === 0xffffffff || aday.usz === 0xffffffff) throw new Error('zip');
  if (aday.usz > SINIR.bayt) throw new Error('boyut');
  const L = aday.off; if (L + 30 > n0 || v.getUint32(L, true) !== 0x04034b50) throw new Error('zip');
  const bas = L + 30 + v.getUint16(L + 26, true) + v.getUint16(L + 28, true), ham = u8.subarray(bas, bas + aday.csz);
  if (ham.length !== aday.csz) throw new Error('zip');
  let cikti;
  if (aday.yontem === 0) cikti = ham.slice();
  else if (aday.yontem === 8) {
    const r = new Blob([ham]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parca = []; let top = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; top += value.length; if (top > SINIR.bayt) { r.cancel(); throw new Error('boyut'); } parca.push(value); }
    cikti = new Uint8Array(top); let o = 0; for (const c of parca) { cikti.set(c, o); o += c.length; }
  } else throw new Error('zip');
  if (cikti.length !== aday.usz) throw new Error('zip');
  return { ad: aday.ad.split('/').pop(), buf: cikti.buffer };
}

// ---------------------------------------------------------------- göreli hareket (Clohessy–Wiltshire), LVLH: x radyal dış, y yörünge yönü, z yörünge normali
// n: ortalama hareket (rad/s), dt (s), r0 (km), v0 (km/s) → konum (km)
export function cw(n, dt, r0, v0) {
  const c = Math.cos(n * dt), s = Math.sin(n * dt), nt = n * dt;
  const [x0, y0, z0] = r0, [u, v, w] = v0;
  return [
    (4 - 3 * c) * x0 + (s / n) * u + (2 / n) * (1 - c) * v,
    6 * (s - nt) * x0 + y0 - (2 / n) * (1 - c) * u + ((4 * s - 3 * nt) / n) * v,
    c * z0 + (s / n) * w,
  ];
}
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unt = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function lvlh(r, v) { const R = unt(r), W = unt(crs(r, v)), S = crs(W, R); return { R, S, W }; }

