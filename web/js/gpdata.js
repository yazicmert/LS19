// CelesTrak GP ve Supplemental GP verisinin tazelik ve birleştirme kuralları (saf; tarayıcı ve Node: test/test_gpdata.js).
//   • Sunucu vekilinden ya da GitHub kopyasından gelen veri 2 saatten eskiyse eldeki veri hemen gösterilir ve tarayıcı CelesTrak'ı arka
//     planda doğrudan dener (GP'de CORS açık; CelesTrak kuralı gereği tarayıcıda da 2 sa önbellek); tazesi gelirse onunla değiştirilir
//     (satlayer.js load).
//   • Yaş, kaynağın bildirdiği değer ile verideki en yeni çağdan çıkan alt sınırın büyüğüdür: kopyanın üst bilgisi alınamadığında ya da
//     yanlış olduğunda bayat veri taze sanılmasın.
//   • Operatör verisi (SupGP) yalnız aynı uydunun normal GP kaydından yeni çağlıysa kullanılır: bayat bir SupGP kopyası taze GP'yi bozmasın.

//   • Vekil listeyi sütunlu da verebilir (api/gp?group=…&fmt=col, { n, cols }: alan adları bir kez; ~%30 küçük); ommFromColumns açar.

export const MAX_COPY_AGE_S = 2 * 3600;
// En yeni çağ ile indirme anı arasındaki olağan gecikme payı. Etkin uydu listesinde en yeni çağ indirme anından birkaç saatten fazla
// geride kalmaz (Starlink kayıtları günde birkaç kez yenilenir); 1 günlük pay, taze veriyi yanlışlıkla bayat saymayı önler.
export const EPOCH_SLACK_S = 86400;

// OMM EPOCH (ör. "2026-09-28T10:44:54.252096", saat dilimi yazılmaz; UTC) -> ms
export function epochMs(o) {
  const s = o && o.EPOCH;
  if (!s) return NaN;
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(s) ? s : s + 'Z');
}

export function newestEpochMs(omm) {
  let m = -Infinity;
  for (const o of omm || []) { const e = epochMs(o); if (e > m) m = e; }
  return m;
}

// verinin yaşı (s): bildirilen yaş ile en yeni çağdan çıkan alt sınırın büyüğü
export function dataAgeS(reportedS, omm, now = Date.now()) {
  const rep = Number.isFinite(+reportedS) && +reportedS > 0 ? +reportedS : 0;
  const ne = newestEpochMs(omm);
  const fromEpoch = Number.isFinite(ne) ? Math.max(0, (now - ne) / 1000 - EPOCH_SLACK_S) : 0;
  return Math.max(rep, fromEpoch);
}

export const isStale = (ageS, max = MAX_COPY_AGE_S) => !(ageS <= max);

// SupGP'yi GP'ye kat: her NORAD için şimdiye en yakın (tercihen geçmişteki) çağlı SupGP kaydı, yalnız GP kaydından yeniyse onun yerine geçer.
//   supByFile: { iss: [...], starlink: [...], … } -> { merged, n: kullanılan, older: GP'den eski olduğu için kullanılmayan }
export function mergeSupGP(gp, supByFile, now = Date.now()) {
  const best = new Map();
  for (const [f, arr] of Object.entries(supByFile || {})) for (const o of arr || []) {
    const id = +o.NORAD_CAT_ID, ep = epochMs(o);
    if (!id || !Number.isFinite(ep)) continue;
    const score = ep <= now + 3600e3 ? now - ep : 1e15 + ep - now, cur = best.get(id);
    if (!cur || score < cur.score) best.set(id, { o, f, ep, score });
  }
  let n = 0, older = 0;
  const merged = (gp || []).map((o) => {
    const b = best.get(+o.NORAD_CAT_ID);
    if (!b) return o;
    const eg = epochMs(o);
    if (Number.isFinite(eg) && !(b.ep > eg)) { older++; return o; }
    n++;
    return { ...b.o, OBJECT_NAME: o.OBJECT_NAME, OBJECT_ID: o.OBJECT_ID || b.o.OBJECT_ID, _sup: { file: b.f, src: b.o.DATA_SOURCE || '', rms: b.o.RMS != null ? +b.o.RMS : null } };
  });
  return { merged, n, older };
}

// sütunlu liste ({ n, cols: { ALAN: [değerler] } }; api/_lib.js ommColumns, sunucu.py omm_columns) -> OMM nesneleri (null alan atlanır).
// Zaten dizi gelirse olduğu gibi döner; biçim tutmazsa hata (çağıran öteki kaynağa geçer).
export function ommFromColumns(d) {
  if (Array.isArray(d)) return d;
  const cols = d && d.cols, n = d && d.n;
  if (!cols || typeof cols !== 'object' || !Number.isInteger(n) || n < 0) throw new Error('beklenmeyen biçim');
  const keys = Object.keys(cols);
  if (!keys.every((k) => Array.isArray(cols[k]) && cols[k].length === n)) throw new Error('sütun uzunlukları tutmuyor');
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = {};
    for (const k of keys) { const v = cols[k][i]; if (v !== null) o[k] = v; }
    out[i] = o;
  }
  return out;
}
