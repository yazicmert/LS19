// Kendi uydum: kullanıcının 3B modeli ya da CAD çıktısı (GLB, STL, OBJ) fragmanda park yörüngesinde araçtan ayrılan uydu olur.
//   · Yüklemeden önce kullanım şartı onaylanır (SART_SURUM); onay (sürüm, zaman, metnin SHA-256 özeti) modelle birlikte saklanır.
//   · Model ve onay yalnız bu tarayıcıda, IndexedDB'de durur (localStorage'a sığmaz); paylaşım bağlantısına girmez. Pencereler arası değişiklik BroadcastChannel ile duyurulur.
//   · Fragman (video) üretildiğinde kayda üretim zamanı eklenir (uretim): LS19 arşivine gönderim, sunucusu olan web sitesiyle başlayacak; şart bu izni şimdiden alır.
//   · Model çözme ve sahne: usermodel.js (three.js'e bağlı; yalnız gerekince yüklenir). Bu dosya three.js içe aktarmaz.

export const SART_SURUM = '1 · 20 Kasım 2026';
export const SART_METNI = [
  'Yüklediğin model, CAD çizimi ya da görsel üzerinde gerekli bütün hakların (telif, lisans, izin) sende olduğunu ya da hak sahibinden izin aldığını beyan edersin.',
  'Başkasının hakkını ihlal eden, gizli, ihracat denetimine tabi ya da hukuka aykırı içerik yüklemezsin; bundan doğan sorumluluk sana aittir.',
  'Bu modelle bir fragman ürettiğinde (videoyu dışa aktardığında) model, uydunun adı ve fragman LS19 arşivine alınabilir. LS19’un bunları arşivinde süresiz ve ücretsiz olarak saklamasına ve LS19 kapsamında göstermesine izin verdiğini beyan edersin.',
  'Bu izin münhasır değildir: modelin sahipliği sende kalır, başka yerde dilediğin gibi kullanabilirsin. Arşivden kaldırılmasını LS19’a başvurarak isteyebilirsin.',
  'Fragman bir görselleştirmedir; gerçek bir fırlatma, yörünge ya da uydu kaydı oluşturmaz.',
];
export const SINIR = { bayt: 40e6, ucgen: 1.5e6, boyMin: 0.1, boyMax: 120, ad: 40 };
export const BICIMLER = { glb: 'GLB (glTF ikili)', stl: 'STL', obj: 'OBJ' };
export const bicimOf = (ad) => { const m = /\.([a-z0-9]+)$/i.exec(ad || ''); const e = m ? m[1].toLowerCase() : ''; return e === 'gltf' ? null : BICIMLER[e] ? e : null; };
export const RENKLER = ['#c9ccd2', '#d8b25a', '#e8e4da', '#3b4a63', '#8f2f2f'];

// ---------------------------------------------------------------- saklama (IndexedDB) ve pencereler arası duyuru
const DB = 'ls19-uydum', ST = 'uydu', ANAHTAR = 'aktif';
let meta = null, hazir = null; const dinleyici = new Set();
const kanal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ls19-uydum') : null;
const ac = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const islem = async (mod, f) => { const db = await ac(); try { return await new Promise((res, rej) => { const tx = db.transaction(ST, mod), q = f(tx.objectStore(ST)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); } finally { db.close(); } };
const metaOf = (r) => (r ? { ad: r.ad, boy: r.boy, renk: r.renk, dosyaAdi: r.dosyaAdi, bicim: r.bicim, bayt: r.bayt, ucgen: r.ucgen, ozet: r.ozet, boyanir: !!r.boyanir, onay: r.onay, uretim: r.uretim || [] } : null);
const duyur = (yerel = true) => { for (const f of dinleyici) { try { f(meta); } catch (e) { console.warn(e); } } if (yerel && kanal) kanal.postMessage('degisti'); };
if (kanal) kanal.onmessage = () => { yenile().then(() => duyur(false)); };

const yenile = async () => { try { meta = metaOf(await islem('readonly', (s) => s.get(ANAHTAR))); } catch (e) { meta = null; } return meta; };
// sayfa açılışında bir kez (eşzamansız); uydum() o zamana dek null döner
export function hazirla() { if (!hazir) hazir = typeof indexedDB === 'undefined' ? Promise.resolve(null) : yenile().then((m) => { if (m) duyur(false); return m; }); return hazir; }
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
export async function uydumUretildi(t = Date.now()) { const r = await uydumKayit(); if (!r) return; r.uretim = [...(r.uretim || []), t].slice(-50); await yaz(r); }

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
  const bicim = bicimOf(dosya && dosya.name); if (!bicim) throw new Error('bicim');
  if (dosya.size > SINIR.bayt) throw new Error('boyut');
  const buf = await dosya.arrayBuffer();
  const M = await import('./usermodel.js');                                    // three.js yalnız gerekince (ayrı pencere hafif açılır)
  const g = await M.modelCoz(buf, bicim), ucgen = M.ucgenSay(g), boyanir = !!g.userData.boyanir; M.modelBirak(g);
  if (!ucgen) throw new Error('bos');
  if (ucgen > SINIR.ucgen) throw new Error('ucgen');
  const ozet = hex(await crypto.subtle.digest('SHA-256', buf));
  const a = ayarSuz({ ad: ad || dosya.name.replace(/\.[^.]+$/, ''), boy, renk });
  return yaz({ ...a, dosya: new Blob([buf]), dosyaAdi: String(dosya.name).slice(0, 120), bicim, bayt: dosya.size, ucgen, ozet,
    boyanir, onay: { surum: SART_SURUM, t: Date.now(), metin: await sartOzeti() }, uretim: [] });
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

