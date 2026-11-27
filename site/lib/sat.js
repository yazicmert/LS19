// Uydu kayıtları: CelesTrak GP (OMM JSON; ortalama elementler, SGP4) ve GCAT (J. McDowell, CC BY 4.0: kütle, boyut, sahip, üretici,
// fırlatma) birleştirilir. scripts/uydular.mjs bunlarla data/satellites.json'u üretir; web/test/test_site.js aynı işlevleri denetler.
// Türetilen değerler (yarı büyük eksen, yükseklikler, dönem, yörünge bölgesi, Güneş eşzamanlılığı) GP ortalama hareketinden hesaplanır
// ve sayfada "türetilmiş" diye yazılır.
export const MU = 398600.4418;                                               // Dünya kütleçekim parametresi (km³/s²)
export const RE = 6378.137;                                                  // Dünya ekvator yarıçapı (km, WGS-84)
export const J2 = 1.08262668e-3;
const D2R = Math.PI / 180;
const num = (v) => { if (v == null) return null; const s = String(v).trim().replace(/[?~]$/, ''); return s === '' || s === '-' || !Number.isFinite(+s) ? null : +s; };
const txt = (v) => { const s = v == null ? '' : String(v).trim(); return s && s !== '-' ? s : null; };
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
// GCAT tarihi "1990 Apr 24 1233:52" ya da "2017 Nov 18" (UTC; "?" belirsiz) → { iso: "1990-04-24", time: "12:33", uncertain }
export function gcatDate(s) {
  const t = txt(s); if (!t) return null;
  const m = /^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{2})(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (!m || !MON[m[2]]) return null;
  return { iso: `${m[1]}-${MON[m[2]]}-${m[3].padStart(2, '0')}`, time: m[4] ? `${m[4]}:${m[5]}` : null, uncertain: /\?/.test(t) };
}
// TSV (ilk satır "#" ile başlayan başlık; "#" ile başlayan diğer satırlar yorum) → nesne dizisi
export function parseTsv(text) {
  const lines = text.split('\n'), head = lines[0].replace(/^#/, '').split('\t').map((h) => h.trim()), out = [];
  for (let k = 1; k < lines.length; k++) {
    const l = lines[k]; if (!l || l[0] === '#') continue;
    const c = l.split('\t'), o = {}; head.forEach((h, i) => { o[h] = c[i] == null ? '' : c[i].trim(); }); out.push(o);
  }
  return out;
}
// zaman aralıklı tablo (orgs, sites): aynı koddan birden çok satır olabilir; sonuncusu (en güncel ad) alınır
export const indexBy = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], r); return m; };

// GP ortalama elementleri + türetilmiş yörünge
export function mapGp(g) {
  const n = num(g.MEAN_MOTION), e = num(g.ECCENTRICITY), i = num(g.INCLINATION);
  const nRad = (n * 2 * Math.PI) / 86400, a = Math.cbrt(MU / (nRad * nRad));
  const perigee = a * (1 - e) - RE, apogee = a * (1 + e) - RE, period = 1440 / n;
  // J2 düğüm kayması (°/gün): Güneş eşzamanlı yörüngede +0,9856 °/gün (Dünya'nın Güneş çevresindeki ortalama açısal hızı)
  const p = a * (1 - e * e), nodal = -1.5 * nRad * J2 * (RE / p) ** 2 * Math.cos(i * D2R) * (86400 / D2R);
  return {
    name: txt(g.OBJECT_NAME), cospar: txt(g.OBJECT_ID), norad: num(g.NORAD_CAT_ID),
    epoch: String(g.EPOCH).replace(/(\.\d{3})\d*$/, '$1') + 'Z',
    elements: { n, e, i, om: num(g.RA_OF_ASC_NODE), w: num(g.ARG_OF_PERICENTER), ma: num(g.MEAN_ANOMALY), bstar: num(g.BSTAR), ndot: num(g.MEAN_MOTION_DOT), rev: num(g.REV_AT_EPOCH) },
    derived: { a: +a.toFixed(3), perigee: +perigee.toFixed(1), apogee: +apogee.toFixed(1), period: +period.toFixed(3), nodal: +nodal.toFixed(4), regime: regimeOf(perigee, apogee, e, period), sso: Math.abs(nodal - 0.9856) < 0.05 && apogee < 6000 },
  };
}
// yörünge bölgesi: LEO (yerberi ve yeröte < 2000 km), GEO (≈ 1 yıldız günü, neredeyse dairesel), HEO (e ≥ 0,25), MEO (arada), yüksek (öbürleri)
export function regimeOf(perigee, apogee, e, period) {
  if (e >= 0.25) return 'HEO';
  if (apogee < 2000) return 'LEO';
  if (Math.abs(period - 1436.07) < 30 && e < 0.05) return 'GEO';
  if (apogee < 35786 - 500) return 'MEO';
  return 'HIGH';
}

// GCAT uydu kaydı (+ fırlatma, kurum ve fırlatma yeri tabloları) → gövde ve fırlatma bilgisi
export function mapGcat(row, { launches, orgs, sites }) {
  if (!row) return null;
  const orgNames = (codes, field = 'Name') => (txt(codes) ? codes.split('/').map((c) => { const o = orgs.get(c.trim()); return o ? txt(o[field]) || c : c; }) : []);
  const L = launches.get(txt(row.Launch_Tag)) || null, site = L ? sites.get(txt(L.Launch_Site)) : null;
  return {
    jcat: txt(row.JCAT), name: txt(row.Name), plName: txt(row.PLName), type: txt(row.Type), state: txt(row.State),
    owner: orgNames(row.Owner), ownerShort: orgNames(row.Owner, 'ShortName'), manufacturer: orgNames(row.Manufacturer), bus: txt(row.Bus), shape: txt(row.Shape),
    sdate: gcatDate(row.SDate), odate: gcatDate(row.ODate), ddate: gcatDate(row.DDate), status: txt(row.Status),
    mass: num(row.Mass), dryMass: num(row.DryMass), length: num(row.Length), diameter: num(row.Diameter), span: num(row.Span),
    launch: {
      date: gcatDate(L ? L.Launch_Date : row.LDate), tag: txt(row.Launch_Tag), vehicle: L ? txt(L.LV_Type) : null, flight: L ? txt(L.Flight) : null,
      site: site ? txt(site.Name) : L ? txt(L.Launch_Site) : null, siteShort: site ? txt(site.ShortName) : null, pad: L ? txt(L.Launch_Pad) : null,
    },
  };
}

// tek kaydın iç tutarlılığı (boşsa geçerli)
export function checkSat(s, retrievedIso) {
  const err = [], p = (m) => err.push(`${s.id}: ${m}`), E = s.elements, D = s.derived;
  if (!(E.n > 0 && E.e >= 0 && E.e < 1 && E.i >= 0 && E.i <= 180)) p('GP elementleri geçersiz');
  if (!(D.perigee > 80)) p(`yerberi ${D.perigee} km: yörüngeden düşmüş olabilir`);
  if (!(Math.abs(D.period - 1440 / E.n) < 1e-2)) p('dönem ortalama hareketle tutmuyor');
  const age = (Date.parse(`${retrievedIso}T00:00:00Z`) - Date.parse(s.epoch)) / 86400000;
  if (!(age < 30)) p(`GP epoku ${Math.round(age)} gün eski`);
  if (!s.norad || !/^\d{4}-\d{3}[A-Z]{1,3}$/.test(s.cospar || '')) p('NORAD ya da COSPAR kimliği yok');
  if (!s.gcat) p('GCAT kaydı yok');
  else {
    if (s.gcat.mass != null && !(s.gcat.mass > 0)) p('kütle geçersiz');
    if (!s.gcat.launch.date) p('fırlatma tarihi yok');
  }
  if (!s.model || !s.model.key) p('model yok');
  return err;
}
// önceki dosyaya göre: düşen/eklenen uydular, büyük yörünge değişimleri (manevra), kuşkulu toplu kayıp (yazmayı durdurur)
export function compareSats(prev, next) {
  const notes = [], stop = [], P = new Map((prev ? prev.objects : []).map((o) => [o.id, o])), N = new Set(next.objects.map((o) => o.id));
  const gone = [...P.keys()].filter((k) => !N.has(k));
  if (prev && gone.length > Math.max(3, prev.objects.length * 0.2)) stop.push(`${gone.length} uydu birden kayboldu (kaynak eksik olabilir)`);
  for (const k of gone) notes.push(`${P.get(k).name}: listeden çıktı (etkin uydular grubunda yok)`);
  for (const o of next.objects) {
    const p = P.get(o.id); if (!p) { notes.push(`${o.name}: yeni`); continue; }
    if (Math.abs(o.derived.perigee - p.derived.perigee) > 25 || Math.abs(o.derived.apogee - p.derived.apogee) > 25) notes.push(`${o.name}: yükseklik değişti (${Math.round(p.derived.perigee)}×${Math.round(p.derived.apogee)} → ${Math.round(o.derived.perigee)}×${Math.round(o.derived.apogee)} km)`);
  }
  return { notes, stop };
}
