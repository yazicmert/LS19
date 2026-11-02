// Uydu iş parçacığı: CelesTrak GP (OMM) kayıtlarından SGP4 ile konum/hız, TEME -> ICRF (IAU 2006/2000A)
import * as S from '../lib/satellite.esm.js';
import * as EO from './earth.js';

let recs = [], eoLoaded = false;

// grup: 0 istasyon, 1 Starlink, 2 OneWeb, 3 GNSS, 4 yer sabit (GEO), 5 diğer
function classify(o) {
  const n = o.OBJECT_NAME || '', mm = +o.MEAN_MOTION;
  if (/^(ISS|CSS|TIANHE|TIANGONG|WENTIAN|MENGTIAN)\b/.test(n)) return 0;
  if (/^STARLINK/.test(n)) return 1;
  if (/^ONEWEB/.test(n)) return 2;
  if (/NAVSTAR|GPS|GLONASS|GALILEO|BEIDOU|QZS|IRNSS|NAVIC/.test(n) || (mm > 1.7 && mm < 2.3 && +o.ECCENTRICITY < 0.05)) return 3;
  if (mm > 0.95 && mm < 1.05 && +o.ECCENTRICITY < 0.05) return 4;
  return 5;
}
// TEME -> GCRS: r = NPBᵀ · R3(−eqeq) · r_TEME (earth.js temeToIcrf; takip listesi ve "Gökte izle" de aynı dönüşümü kullanır)
const temeToIcrf = EO.temeToIcrf;

onmessage = (e) => {
  const d = e.data;
  if (d.cmd === 'load') {
    if (!eoLoaded && d.eo) { EO.loadEarthOrientation(d.eo); eoLoaded = true; }
    recs = []; const groups = [], names = [], ids = [], epochs = [];
    for (const o of d.omm) {
      try {
        const sr = S.json2satrec(o);
        if (!sr || sr.error) continue;
        recs.push(sr); groups.push(classify(o)); names.push(o.OBJECT_NAME); ids.push(o.NORAD_CAT_ID);
        epochs.push(Date.parse(o.EPOCH + 'Z'));
      } catch (err) { /* bozuk kayıt */ }
    }
    epochs.sort((a, b) => a - b);
    postMessage({ type: 'loaded', n: recs.length, groups: Uint8Array.from(groups), names, ids, epochMs: epochs[Math.floor(epochs.length / 2)] || 0,
      epochMin: epochs[0] || 0, epochMax: epochs[epochs.length - 1] || 0 });
    return;
  }
  if (d.cmd === 'prop') {
    const n = recs.length, pos = new Float32Array(3 * n), vel = new Float32Array(3 * n), date = new Date(d.utcMs);
    const M = temeToIcrf(d.jdTT);
    for (let i = 0; i < n; i++) {
      let pv = null;
      try { pv = S.propagate(recs[i], date); } catch (err) { pv = null; }
      const p = pv && pv.position, v = pv && pv.velocity;
      if (!p || !Number.isFinite(p.x)) { pos[3 * i] = pos[3 * i + 1] = pos[3 * i + 2] = NaN; continue; }
      for (let k = 0; k < 3; k++) {
        pos[3 * i + k] = M[k][0] * p.x + M[k][1] * p.y + M[k][2] * p.z;
        vel[3 * i + k] = M[k][0] * v.x + M[k][1] * v.y + M[k][2] * v.z;
      }
    }
    postMessage({ type: 'pos', id: d.id, t: d.t, pos, vel }, [pos.buffer, vel.buffer]);
  }
};
