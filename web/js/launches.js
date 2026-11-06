// Fırlatma kataloğu (tarayıcı): yaklaşan ve son fırlatmalar (biçim: launchdata.js).
// Sıra: 1) sunucu vekili api/launches (yerel sunucu.py ya da bulut; LL2, yedek RocketLaunch.Live) · 2) vekil yoksa ya da yedeğe düştüyse
// Launch Library 2'ye tarayıcıdan doğrudan (CORS açık; anahtarsız IP başına saatte 15 istek: yanıt Cache Storage'da 30 dk tutulur,
// ağ hatasında eski kopya kullanılır). Doğrudan da alınamazsa vekilin yedek verisi (RocketLaunch.Live, sonraki 5 fırlatma) kalır.
import { LL2_UPCOMING, LL2_PREVIOUS, LAUNCH_PERIOD_S, buildCatalog } from './launchdata.js';

const CACHE_NAME = 'ls19-launches';
const valid = (c) => !!(c && Array.isArray(c.yaklasan) && Array.isArray(c.gecmis) && c.kod);
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).hata || ('HTTP ' + r.status));
  return r.json();
}
async function ll2Direct() {
  let cache = null, hit = null;
  try { cache = await caches.open(CACHE_NAME); hit = await cache.match(LL2_UPCOMING); } catch (e) { cache = null; }
  const tHit = hit ? +hit.headers.get('X-LS19-T') : 0;
  if (hit && Date.now() - tHit < LAUNCH_PERIOD_S * 1000) return hit.json();
  try {
    const [u, p] = await Promise.all([getJson(LL2_UPCOMING), getJson(LL2_PREVIOUS).catch(() => ({ results: [] }))]);
    if (!Array.isArray(u.results)) throw new Error('beklenmeyen yanıt');
    const cat = buildCatalog('ll2', u.results, p.results || []);
    if (cache) try { await cache.put(LL2_UPCOMING, new Response(JSON.stringify(cat), { headers: { 'Content-Type': 'application/json', 'X-LS19-T': String(Date.now()) } })); } catch (e) { /* önbellek isteğe bağlı */ }
    return cat;
  } catch (e) {
    if (hit) return hit.json();
    throw e;
  }
}

export class Launches {
  constructor() { this.cat = null; this.err = null; this.loading = false; this.onChange = null; }
  async load(v) {
    this.loading = true;
    const errs = [];
    let cat = null;
    try { cat = await getJson('api/launches' + (v != null ? '?v=' + v : '')); if (!valid(cat)) throw new Error('beklenmeyen yanıt'); } catch (e) { cat = null; errs.push('vekil: ' + e.message); }
    if (!cat || cat.kod !== 'll2') try { const d = await ll2Direct(); if (valid(d)) cat = d; } catch (e) { errs.push('LL2: ' + e.message); }
    if (cat) { this.cat = cat; this.err = null; } else if (!this.cat) this.err = 'Fırlatma takvimi alınamadı (' + errs.join(' · ') + ')';
    this.loading = false;
    if (this.onChange) this.onChange();
  }
}
