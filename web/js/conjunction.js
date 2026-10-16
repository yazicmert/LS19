// Uydu ↔ uydu yakın geçiş analizi (saf hesap; tarayıcı ve Node): en yakın yaklaşma anı (TCA), kaçırma mesafesi ve RTN bileşenleri,
// karşılaşma düzlemi, çarpışma olasılığı (Foster 1992 / Chan: 2B Gauss'un birleşik sert cisim dairesi üzerinde tümlevi) ve en kötü durum
// olasılığı (Alfano 2005: kovaryans ölçeği bilinmezken üst sınır).
// Varsayımlar: kısa karşılaşma (doğrusal göreli hareket, TCA'da sabit kovaryans), iki cismin konum hataları bağımsız ve Gauss.
// TLE/GP verisi kovaryans taşımaz: 1σ RTN belirsizlikleri kullanıcı girdisidir (tipik GP hataları: radyal ~0,1–0,5 km, iz boyu 1–5 km, çapraz 0,1–0,5 km).
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]; };

// RTN çerçevesi (satırlar: R radyal, T iz boyu, N yörünge normali) — r (km), v (km/s)
export function rtnFrame(r, v) { const R = unit(r), N = unit(cross(r, v)), T = cross(N, R); return [R, T, N]; }

// prop(t) -> {r, v}; t (s). Kaba örnekleme + altın oran inceltmesiyle mesafenin yerel en küçükleri
export function findTCAs(propA, propB, t0, t1, dt = 30, gateKm = Infinity) {
  const d = (t) => { const a = propA(t), b = propB(t); return a && b ? norm(sub(a.r, b.r)) : NaN; };
  const out = []; let tPrev = t0, dPrev = d(t0), t = t0 + dt, dCur = d(t);
  while (t < t1) {
    const tN = t + dt, dN = d(tN);
    if (dCur <= dPrev && dCur <= dN && Number.isFinite(dCur) && dCur < gateKm + 8 * dt) {      // [tPrev, tN] içinde en küçük
      let a = tPrev, b = tN; const g = (Math.sqrt(5) - 1) / 2;
      let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = d(x1), f2 = d(x2);
      for (let k = 0; k < 60 && b - a > 1e-3; k++) { if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = d(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = d(x2); } }
      const tc = 0.5 * (a + b), dm = d(tc);
      if (dm < gateKm) out.push({ t: tc, miss: dm });
    }
    tPrev = t; dPrev = dCur; t = tN; dCur = dN;
  }
  return out;
}
// kenetli / eş yörüngeli cisim (ör. istasyon modülleri ayrı katalog kaydı, oluşum uçuşu): pencere boyunca hep yakın — yakın geçiş sayılmaz
export function coorbital(propA, propB, t0, t1, n = 25, km = 100) {
  for (let i = 0; i < n; i++) { const t = t0 + (t1 - t0) * i / (n - 1), a = propA(t), b = propB(t); if (!a || !b || norm(sub(a.r, b.r)) > km) return false; }
  return true;
}
// birincile karşı aday listesi tarama: apoje/perije süzgeci sonrası verilen adaylarda gate (km) içindeki yaklaşmalar
export function screen(propA, cands, t0, t1, { dt = 30, gate = 10 } = {}) {
  const ev = [], skipped = [];
  for (const c of cands) {
    if (coorbital(propA, c.prop, t0, t1)) { skipped.push(c); continue; }
    for (const x of findTCAs(propA, c.prop, t0, t1, dt, gate)) ev.push({ ...x, cand: c });
  }
  ev.sort((a, b) => a.miss - b.miss);
  return { events: ev, coorbital: skipped };
}
// TCA'daki geometri: kaçırma vektörünün birincil cismin RTN bileşenleri, göreli hız, karşılaşma düzlemi tabanı
export function encounter(a, b) {
  const dr = sub(b.r, a.r), dv = sub(b.v, a.v), F = rtnFrame(a.r, a.v);
  const vRel = norm(dv), miss = norm(dr);
  const ey = unit(dv), ex = miss > 1e-9 ? unit(sub(dr, ey.map((c) => c * dot(dr, ey)))) : unit(cross(ey, Math.abs(ey[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const ez = cross(ex, ey);                                                                            // düzlem tabanı: ex (kaçırma yönü), ez; ey göreli hız
  const ang = Math.acos(Math.max(-1, Math.min(1, dot(unit(a.v), unit(b.v))))) * 180 / Math.PI;
  return { miss, vRel, rtn: F.map((e) => dot(dr, e)), dr, dv, plane: [ex, ez], approachAngle: ang, frameA: F };
}
// 3×3 kovaryans (km²) RTN köşegeninden ECI'ye: C = Fᵀ diag(σ²) F
export function covFromRtn(F, sR, sT, sN) {
  const s = [sR * sR, sT * sT, sN * sN], C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += F[k][i] * s[k] * F[k][j];
  return C;
}
export function projectCov(C, plane) {
  const [p, q] = plane, Cp = (u) => [dot(C[0], u), dot(C[1], u), dot(C[2], u)];
  return [[dot(p, Cp(p)), dot(p, Cp(q))], [dot(q, Cp(p)), dot(q, Cp(q))]];
}
// Foster: Pc = ∬_{|x| ≤ R} N(x; μ, C) dx, μ = (kaçırma, 0). Kutupsal ızgarada orta nokta kuralı (R ≪ σ için yeterli; büyük R için de yakınsar)
export function pcFoster(missKm, C2, Rkm, nr = 64, nt = 96) {
  const det = C2[0][0] * C2[1][1] - C2[0][1] * C2[1][0];
  if (!(det > 0)) return NaN;
  const i00 = C2[1][1] / det, i11 = C2[0][0] / det, i01 = -C2[0][1] / det, k = 1 / (2 * Math.PI * Math.sqrt(det));
  let s = 0;
  for (let i = 0; i < nr; i++) {
    const r = (i + 0.5) * Rkm / nr, dA = r * (Rkm / nr) * (2 * Math.PI / nt);
    for (let j = 0; j < nt; j++) {
      const th = (j + 0.5) * 2 * Math.PI / nt, x = r * Math.cos(th) - missKm, y = r * Math.sin(th);
      s += Math.exp(-0.5 * (i00 * x * x + 2 * i01 * x * y + i11 * y * y)) * dA;
    }
  }
  return Math.min(1, k * s);
}
// en kötü durum (kovaryans büyüklüğü bilinmez, şekil korunur): Pc'yi ölçek k ile en büyükle (1B altın oran)
export function pcMax(missKm, C2, Rkm) {
  let a = Math.log(1e-6), b = Math.log(1e6); const g = (Math.sqrt(5) - 1) / 2, f = (lk) => -pcFoster(missKm, C2.map((row) => row.map((c) => c * Math.exp(2 * lk))), Rkm, 32, 48);
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < 80; i++) { if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); } }
  const lk = 0.5 * (a + b);
  return { pc: pcFoster(missKm, C2.map((row) => row.map((c) => c * Math.exp(2 * lk))), Rkm), scale: Math.exp(lk) };
}
// risk sınıfı (NASA CARA/ESA uygulaması: 1e-4 üstü manevra değerlendirmesi)
export const pcClass = (pc) => (pc >= 1e-4 ? 'kirmizi' : pc >= 1e-5 ? 'sari' : 'yesil');
// OMM'den yer yükseklik aralığı (km) — apoje/perije süzgeci için
export function perApo(o) {
  const n = +o.MEAN_MOTION * 2 * Math.PI / 86400, e = +o.ECCENTRICITY, a = Math.cbrt(398600.4418 / (n * n));
  return { a, hp: a * (1 - e) - 6378.137, ha: a * (1 + e) - 6378.137, inc: +o.INCLINATION, period: 1440 / +o.MEAN_MOTION };
}
