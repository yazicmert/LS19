// Geçmiş yörünge özeti (web/data/gecmis.json; tools/gecmis_derle.mjs) ve onunla kalibre edilmiş yeniden giriş tahmini.
// Çarpma sekmesi (impactui.js) ile uydu bilgi kartı (satlayer.js) aynı işlevi kullanır: aynı uydu için iki yerde aynı tarih çıkar.
// Dosya (~1,7 MB) ilk gerektiğinde bir kez indirilir; inene kadar (ya da inemezse) tahmin geçmişsiz, yalnız B* / MEAN_MOTION_DOT ile yapılır.
// Aynı anda aylık F10.7 tablosu da (web/data/f107.json, ~6 kB; tools/uzay_havasi.mjs) yüklenir: Güneş aktivitesi gözlenen ve CelesTrak'ın tahmin ettiği
// değerlerle hesaplanır; inemezse impact.js ortalama çevrim biçimini kullanır.
import { assessSat, histRow, calibHist, setSolarTable } from './impact.js';

let data = null, pending = null, rows = new Map(), version = 0;
const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export function loadHist() {
  return pending || (pending = Promise.all([getJson('data/gecmis.json'), getJson('data/f107.json')]).then(([j, f]) => {
    data = j && j.sats ? j : null; rows = new Map(); setSolarTable(f); version++; return data;
  }));
}
// yüklenen veri değiştikçe artar (bilgi kartı önbelleği için)
export const dataVersion = () => version;
export const histData = () => data;
// NORAD no -> geçmiş özeti (+ sınıf); veri yoksa null
export function histOf(id) {
  if (!data) return null;
  let h = rows.get(+id);
  if (h === undefined) { const r = data.sats[id]; h = r ? histRow(r) : null; rows.set(+id, h); }
  return h;
}
// o: GP kaydı -> { h, r }: geçmiş özeti ve (serbest bozunuyorsa geçmiş eğimiyle kalibre edilmiş) tahmin
export function decayOf(o, nowMs = Date.now(), withCurve = false) {
  const h = histOf(+o.NORAD_CAT_ID);
  return { h, r: assessSat(o, nowMs, withCurve, calibHist(h)) };
}
