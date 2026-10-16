// Asteroit / kuyrukluyıldız → Dünya çarpma etkileri (saf hesap; tarayıcı ve Node).
// Model: Collins, Melosh & Marcus (2005) "Earth Impact Effects Program", Meteoritics & Planetary Science 40, 817–840, ve programın
// güncel hava şoku bağıntıları (Mach yansıma bölgesi düzgünleştirmesiyle). Denklem numaraları makaleninkilerdir.
//   • Atmosfere giriş: üstel atmosfer (ρ0 = 1 kg/m³, H = 8 km), sürüklenme katsayısı 2, dayanım Yi = 10^(2.107 + 0.0624 √ρi) Pa (Eq. 10),
//     parçalanma irtifası (Eq. 11–12), "gözleme (pancake)" yayılımı (Eq. 13–16), hava patlaması fp = 7 (Eq. 18). Parçalanma sonrası hız
//     ODE'si sayısal tümlenir (dv/dz = 3 Cd ρ(z) L(z)² v / (4 ρi L0³ sinθ)); kapalı biçimli Eq. 19–20 test ile çapraz denetlenir.
//   • Krater: pi-ölçekleme (Schmidt & Housen 1987): Dtc = C (m/ρt)^(1/3) (1.61 g L / v²)^(−β) sin^(1/3)θ (kaya C = 1.6, β = 0.22 ⇒ Eq. 21),
//     basit/karmaşık geçiş Dc = 3.2 km (Eq. 22, 27), derinlik, breş merceği, ergime hacmi (Eq. 28–29), su katmanı (Eq. 33–36).
//   • Ateş topu ısısı (Eq. 30–33, η = 3·10⁻³, T* = 3000 K, ufuk altında kalan kesir), sismik büyüklük (Eq. 40–41), ejecta (Eq. 47, 52),
//     hava şoku aşırı basıncı ve rüzgâr (Eq. 54–57 + güncel hava patlaması bağıntısı), tsunami genliği sınırları (Ward & Asphaug / Collins).
// Sınırlar: küresel tek cisim, düz atmosfer, parçacık bulutu yerine tek "gözleme"; sonuçlar büyüklük sırası doğruluğundadır (makale §Uyarılar).

export const MT = 4.184e15;                                       // 1 Mt TNT (J)
export const KT = 4.184e12;
const RHO0 = 1, H = 8000, CD = 2, FP = 7, G = 9.81, RE = 6371e3, P0 = 1e5, C0 = 330, SIGMA = 5.670374e-8;
export const CONST = { RHO0, H, CD, FP, G, RE, P0, C0 };
// cisim ve hedef seçenekleri (programın menüleriyle aynı yoğunluklar)
export const PROJECTILES = { buz: { ad: 'Buz (kuyrukluyıldız)', rho: 1000 }, gozenekli: { ad: 'Gözenekli kaya', rho: 1500 }, kaya: { ad: 'Yoğun kaya (taşlı)', rho: 3000 }, demir: { ad: 'Demir', rho: 8000 } };
export const TARGETS = {
  sediman: { ad: 'Sedimanter kaya', rho: 2500, C: 1.6, beta: 0.22 },
  kristal: { ad: 'Kristalen kaya', rho: 2750, C: 1.6, beta: 0.22 },
  su: { ad: 'Su (deniz/okyanus)', rho: 1000, seafloor: 2700, C: 1.6, beta: 0.22 },
};
const DC_COMPLEX = 3200;                                          // basit → karmaşık krater geçiş çapı (m), Dünya

// ---------------------------------------------------------------- yineleme süresi (Bland & Artemieva 2006 kütle bağıntısı + Collins 2005 Eq. 3)
export function recurrenceYears(massKg, E0Mt) {
  const m = massKg;
  const r = m < 3 ? 10 ** -4.568 * m ** 0.480 : m < 1.7e10 ? 10 ** -4.739 * m ** 0.926 : m < 3.3e12 ? 10 ** 0.922 * m ** 0.373 : m < 8.4e14 ? 10 ** -0.086 * m ** 0.454 : 10 ** -3.352 * m ** 0.672;
  return Math.max(r, 110 * E0Mt ** 0.77);
}

// ---------------------------------------------------------------- atmosfere giriş
// L0 çap (m), rhoI yoğunluk (kg/m³), v0 giriş hızı (m/s), thetaDeg ufka göre giriş açısı
export function atmosphericEntry({ L0, rhoI, v0, thetaDeg }) {
  const th = thetaDeg * Math.PI / 180, s = Math.sin(th);
  const mass = Math.PI / 6 * rhoI * L0 ** 3, E0 = 0.5 * mass * v0 * v0;
  const Yi = 10 ** (2.107 + 0.0624 * Math.sqrt(rhoI));                                  // Eq. 10
  const av = 3 * RHO0 * CD * H / (4 * rhoI * L0 * s);                                   // Eq. 8 üssü (yüzeyde)
  const rStrength = Yi / (RHO0 * v0 * v0);
  const If = 2.7185 * av * rStrength;                                                     // Eq. 12 (= 4.07 Cd H Yi /(ρi L0 v0² sinθ), Cd = 2)
  const rho = (z) => RHO0 * Math.exp(-z / H);
  const out = { mass, E0, E0Mt: E0 / MT, Yi, If, av, thetaDeg };
  const profile = [];                                                                     // irtifa (m), hız (m/s), çap (m), kalan kinetik enerji (J)
  if (If >= 1) {                                                                          // dayanım yeterli: parçalanmadan yere ulaşır (Eq. 8 + uç hız)
    const vTerm = Math.sqrt(4 * rhoI * L0 * G / (3 * RHO0 * CD));
    const vS = v0 * Math.exp(-av);
    for (let z = 100e3; z >= 0; z -= 1000) profile.push([z, Math.max(v0 * Math.exp(-av * Math.exp(-z / H)), Math.min(vTerm, v0)), L0]);
    const vI = Math.max(vS, Math.min(vTerm, v0));
    return finishEntry({ ...out, regime: 'butun', breakup: false, zStar: 0, vStar: null, zb: 0, vI, Lsurf: L0, terminal: vTerm > vS, profile }, rhoI);
  }
  const zStar = -H * Math.log(rStrength) - H * (1.308 - 0.314 * If - 1.303 * Math.sqrt(1 - If));   // Eq. 11
  const vStar = v0 * Math.exp(-av * Math.exp(-zStar / H));                                          // Eq. 8, z = z*
  const l = L0 * s * Math.sqrt(rhoI / (CD * rho(zStar)));                                            // Eq. 14 (yayılma ölçeği)
  const alpha = Math.sqrt(FP * FP - 1);
  const zbRaw = zStar - 2 * H * Math.log(1 + alpha * l / (2 * H));                                   // Eq. 18
  const Lz = (z) => L0 * Math.sqrt(1 + (2 * H / l) ** 2 * (Math.exp((zStar - z) / (2 * H)) - 1) ** 2);   // Eq. 13
  for (let z = Math.ceil((zStar + 30e3) / 1000) * 1000; z > zStar; z -= 1000) profile.push([z, v0 * Math.exp(-av * Math.exp(-z / H)), L0]);
  // parçalanma sonrası: dv/dz = 3 Cd ρ(z) L(z)² v / (4 ρi L0³ sinθ), z* → max(zb, 0) aşağı doğru (RK4, 2000 adım)
  const zEnd = Math.max(zbRaw, 0), n = 2000, dz = (zStar - zEnd) / n, k = 3 * CD / (4 * rhoI * L0 ** 3 * s);
  const f = (z) => k * rho(z) * Lz(z) ** 2;                                               // d ln v / dz
  let lnv = Math.log(vStar), z = zStar;
  profile.push([zStar, vStar, L0]);
  for (let i = 0; i < n; i++) {
    const k1 = f(z), k2 = f(z - dz / 2), k4 = f(z - dz);
    lnv -= dz * (k1 + 4 * k2 + k4) / 6;                                                    // ∫ f dz (Simpson; f yalnız z'ye bağlı)
    z -= dz;
    if ((i + 1) % 20 === 0) profile.push([z, Math.exp(lnv), Lz(z)]);
  }
  const vEnd = Math.exp(lnv);
  if (zbRaw > 0) return finishEntry({ ...out, regime: 'hava', breakup: true, zStar, vStar, l, zb: zbRaw, vb: vEnd, vI: 0, Lsurf: FP * L0, profile }, rhoI);
  return finishEntry({ ...out, regime: 'carpma', breakup: true, zStar, vStar, l, zb: 0, vI: vEnd, Lsurf: Lz(0), profile }, rhoI);
}
// kapalı biçimli parçalanma sonrası hız (Eq. 17 + 19/20, programdaki düzeltilmiş biçim) — sayısal tümlemenin bağımsız denetimi için
export function closedFormVelocity({ L0, rhoI, thetaDeg }, e) {
  if (!e.breakup) return null;
  const alpha = Math.sqrt(FP * FP - 1), vFac = 0.75 * Math.sqrt(CD * RHO0 / rhoI) * Math.exp(-e.zStar / (2 * H));
  if (e.regime === 'hava') {
    const expfac = alpha / 24 * (24 + 8 * alpha ** 2 + 6 * alpha * e.l / H + 3 * alpha ** 3 * e.l / H);
    return e.vStar * Math.exp(-expfac * vFac);
  }
  const as = H / e.l, x = e.zStar / H;
  const integral = as ** 3 / 3 * (3 * (4 + 1 / as ** 2) * Math.exp(x) + 6 * Math.exp(2 * x) - 16 * Math.exp(1.5 * x) - 3 / as ** 2 - 2);
  return e.vStar * Math.exp(-vFac * integral);
}
function finishEntry(o) {
  const E = (v) => 0.5 * o.mass * v * v;
  if (o.regime === 'hava') { o.Eatm = o.E0 - E(o.vb); o.Esurf = 0; o.Eblast = o.Eatm; }                      // hava patlaması: sürüklenmeyle bırakılan enerji
  else { o.Esurf = E(o.vI); o.Eatm = o.E0 - o.Esurf; o.Eblast = Math.max(o.Eatm, o.Esurf); }
  o.EblastKt = o.Eblast / KT;
  return o;
}

// ---------------------------------------------------------------- krater (yalnız yüzeye ulaşan çarpmada)
export function crater(e, { L0, rhoI, thetaDeg }, tKey, waterDepth = 0) {
  if (e.regime === 'hava') return null;
  const T = TARGETS[tKey] || TARGETS.sediman, s = Math.sin(thetaDeg * Math.PI / 180), anglefac = Math.cbrt(s);
  let v = e.vI, rhoT = T.rho, water = null;
  if (tKey === 'su' && waterDepth > 0) {                                                       // su katmanı: deniz tabanına hız (Eq. 33), su "krateri"
    const vSea = v * Math.exp(-(3 * 1000 * 0.877 * waterDepth) / (2 * rhoI * L0 * s));
    const wD = 1.88 * Math.cbrt(e.mass / 1000) * ((1.61 * G * L0) / (v * v)) ** -0.22 * anglefac;
    water = { vSea, Dwater: wD, Esea: 0.5 * e.mass * vSea * vSea };
    v = vSea; rhoT = T.seafloor;
  }
  let Dtc = T.C * Math.cbrt(e.mass / rhoT) * ((1.61 * G * L0) / (v * v)) ** -T.beta * anglefac;
  const field = e.Lsurf >= Dtc;                                                                  // parçalar ayrı kraterler açar: en büyük parça (L0/2)
  if (field) Dtc /= 2;
  const dtc = Dtc / 2.828;
  const complex = Dtc * 1.25 >= DC_COMPLEX;
  const Dfr = complex ? 1.17 * Dtc ** 1.13 / DC_COMPLEX ** 0.13 : 1.25 * Dtc;
  const rim = 0.07 * Dtc ** 4 / Dfr ** 3;
  let dfr, breccia = 0;
  if (complex) dfr = 37 * Dfr ** 0.301;
  else { const Vbr = 0.032 * Dfr ** 3; breccia = 2.8 * Vbr * ((dtc + rim) / (dtc * Dfr * Dfr)); dfr = dtc + rim - breccia; }
  const Eimp = water ? water.Esea : e.Esurf;
  const Vtc = Math.PI / 24 * (Dtc / 1000) ** 3;                                                   // km³
  const Vmelt = v >= 12e3 ? Math.min(8.9e-21 * Eimp * s, 1.1e12) : 0;                            // km³ (Eq. 28; < 12 km/s ergime yok)
  return { Dtc, dtc, Dfr, dfr, rim, breccia, complex, field, Vtc, Vmelt, meltFrac: Vtc > 0 ? Vmelt / Vtc : 0, vImpact: v, Eimp, water };
}

// ---------------------------------------------------------------- uzaklığa bağlı etkiler
const epicentral = (rM) => rM / RE;                                                              // rad
// ateş topu ısısı (yalnız yüzeye çarpma ve v ≥ 15 km/s: daha yavaşta buharlaşma yetersiz, belirgin ateş topu oluşmaz)
export function thermal(e, cr, rM) {
  if (e.regime === 'hava' || !cr || cr.vImpact < 15e3) return null;
  const E = cr.Eimp, eta = 3e-3, Tstar = 3000, Rf = 2e-3 * Math.cbrt(E);                          // Rf (m)
  const delta = epicentral(rM), h = (1 - Math.cos(delta)) * RE;                                    // ateş topunun ufkun altında kalan yüksekliği
  const base = { Rf, tMax: Rf / cr.vImpact, tau: eta * E / (2 * Math.PI * Rf * Rf * SIGMA * Tstar ** 4), EMt: E / MT };
  if (h >= Rf) return { ...base, phi: 0, visible: 0, below: true };
  const D = Math.acos(h / Rf), visible = (2 / Math.PI) * (D - (h / Rf) * Math.sin(D));
  const phi = visible * eta * E / (2 * Math.PI * rM * rM);                                         // J/m²
  return { ...base, phi, visible, below: false, flux: phi / base.tau, solar: phi / base.tau / 1361 };
}
// ısı eşikleri (1 Mt için J/m², E^(1/6) ile ölçeklenir; Glasstone & Dolan 1977 / Collins vd. 2005 Tablo 3)
export const THERMAL_THRESH = [['Üçüncü derece yanık', 4.2e5], ['İkinci derece yanık', 2.5e5], ['Birinci derece yanık', 1.3e5]];
export function seismic(e, cr, rM) {
  if (e.regime === 'hava' || !cr) return null;
  const M = 0.67 * Math.log10(cr.Eimp) - 5.87;                                                     // Eq. 40 (Gutenberg–Richter enerji–büyüklük)
  const rKm = rM / 1000, dDeg = epicentral(rM) * 180 / Math.PI;
  // Eq. 41: etkin büyüklük; 60 km altı katsayı 60 km'de süreklilik veren makale değeri (0.0238), 700 km üstü Båth yüzey dalgası bağıntısı (T = 20 s)
  const Meff = rKm < 60 ? M - 0.0238 * rKm : rKm < 700 ? M - 0.0048 * rKm - 1.1644 : M - 1.66 * Math.log10(dDeg) - 3.599;
  return { M, Meff, arrival: rKm / 5, mmi: mmiOf(Meff) };
}
// USGS: büyüklüğe göre tipik en yüksek Değiştirilmiş Mercalli şiddeti
export function mmiOf(M) { return M < 1 ? '—' : M < 3 ? 'I' : M < 4 ? 'II–III' : M < 5 ? 'IV–V' : M < 6 ? 'VI–VII' : M < 7 ? 'VII–IX' : 'VIII ve üstü'; }
export function ejecta(e, cr, rM) {
  if (e.regime === 'hava' || !cr) return null;
  const R = cr.Dfr / 2;
  if (rM <= R) return { inside: true };
  const t = cr.Dtc ** 4 / (112 * rM ** 3);                                                          // Eq. 47 (m)
  const phi = rM / (2 * RE), X = 2 * Math.tan(phi) / (1 + Math.tan(phi)), ec = -Math.sqrt(0.5 * (X - 1) ** 2 + 0.5), a = X * RE / (2 * (1 - ec * ec));
  const arrival = 2 * a ** 1.5 / Math.sqrt(G * RE * RE) * (2 * Math.atan(Math.sqrt((1 - ec) / (1 + ec)) * Math.tan(phi / 2)) - ec * Math.sqrt(1 - ec * ec) * Math.sin(phi) / (1 + ec * Math.cos(phi)));
  const halfKm = R / 1000, dc = 2400 * halfKm ** -1.62, dFrag = dc * (halfKm / (rM / 1000)) ** 2.65;   // ortalama parça (m), Eq. 52
  return { inside: false, thickness: t, arrival, dFrag };
}
// hava şoku: aşırı basınç (Pa) — 1 kt'ye ölçeklenmiş mesafe ve patlama yüksekliğiyle, Mach yansıma bölgesi düzgünleştirmeli
export function overpressure(EktBlast, zb, rM) {
  if (!(EktBlast > 0)) return 0;
  const sf = Math.cbrt(EktBlast), d = rM / sf, zs = zb / sf, pxCross = 75000;
  const rCross = 290 + 0.65 * zs;
  let rMach = zs >= 550 ? 1e30 : 550 * zs / (1.2 * (550 - zs)), dS = 0, pMach = 0, pReg = 0;
  const surface = (x) => (rCross * pxCross / 4) * (1 / x) * (1 + 3 * (rCross / x) ** 1.3);
  const regular = (x) => 3.14e11 * (x * x + zs * zs) ** -1.3 + 1.8e7 * (x * x + zs * zs) ** -0.565;
  if (zb > 0) { dS = zs * zs * 0.00328; pMach = surface(rMach + dS); pReg = regular(rMach - dS); } else rMach = 0;
  if (d >= rMach + dS) return surface(d);
  if (d <= rMach - dS) return regular(d);
  return pReg - (d - rMach + dS) * 0.5 * (pReg - pMach) / dS;
}
export const windSpeed = (p) => (5 * p / (7 * P0)) * C0 / Math.sqrt(1 + 6 * p / (7 * P0));     // Eq. 57 (m/s)
export const splDb = (p) => (p > 0 ? 20 * Math.log10(p / 2e-5) : 0);                              // ses basınç düzeyi (dB, 20 µPa'ya göre)
// Glasstone & Dolan (1977) eşikleri (programın tablosu): [Pa ya da m/s, açıklama, tür]
export const BLAST_DAMAGE = [
  [426000, 'Arabalar ve kamyonlar büyük ölçüde savrulur, ağır biçimde ezilir', 'p'], [379000, 'Kiriş köprüler çöker', 'p'],
  [297000, 'Arabalar ve kamyonlar devrilir, savrulur', 'p'], [273000, 'Çok katlı çelik çerçeveli binalarda aşırı çerçeve bozulması, çökme başlangıcı', 'p'],
  [121000, 'Kafes kirişli karayolu köprüleri çöker', 'p'], [100000, 'Kafes kirişli köprülerde ağır çapraz bozulması', 'p'],
  [42600, 'Çok katlı yığma (taşıyıcı duvarlı) binalar çöker', 'p'], [38500, 'Yığma binalarda ağır çatlaklar, iç bölmeler yıkılır', 'p'],
  [26800, 'Ahşap çerçeveli binalar neredeyse tamamen çöker', 'p'], [22900, 'Ahşap binaların iç bölmeleri yıkılır, çatı ağır hasar görür', 'p'],
  [6900, 'Cam pencereler kırılır', 'p'], [690, 'Cam pencereler kırılabilir', 'p'],
  [62, 'Ağaçların %90\'a kadarı devrilir', 'w'], [40, 'Ağaçların ~%30\'u devrilir', 'w'],
];
export function blast(e, rM) {
  const zb = e.regime === 'hava' ? e.zb : 0, p = overpressure(e.EblastKt, zb, rM), w = windSpeed(p);
  const slant = Math.hypot(rM, zb);
  const effects = BLAST_DAMAGE.filter(([th, , k]) => (k === 'p' ? p >= th : w >= th)).map(([, t]) => t);
  return { p, wind: w, db: splDb(p), arrival: slant / C0, effects };
}
// tsunami (yalnız su hedefi): dalga genliği alt/üst sınırı ve varış süresi (doğrusal dalga kuramı)
export function tsunami(cr, rM, depth, L0) {
  if (!cr || !cr.water) return null;
  const wD = cr.water.Dwater, lam = 2 * wD, c = Math.sqrt(0.5 * G * lam / Math.PI * Math.tanh(2 * Math.PI * depth / lam));
  const Amax = Math.min(0.07 * wD, depth), rK = rM / 1000;
  const upper = Amax * (0.001 * wD / rK);
  let lower = Amax * (0.0005 * wD / rK);
  const sh = L0 / depth;
  if (sh < 0.5) {                                                                                  // derin suda çökme dalgası düzeltmesi
    const ex = 3 * Math.exp(-0.8 * sh), Ac = 0.06 * Math.min(wD / 2.828, depth);
    lower = Math.min(lower, Ac * ((0.0025 * wD) / rK) ** ex);
  }
  return { upper: Math.min(upper, Amax), lower: Math.min(lower, Amax), arrival: rM / c, speed: c };
}

// ---------------------------------------------------------------- küresel etkiler ve tam senaryo
export function globalEffects(e, cr, thetaDeg) {
  const v = cr ? cr.vImpact : e.vI, m = e.mass, th = thetaDeg * Math.PI / 180;
  const pEarth = 1.794e32, lEarth = 5.86e33, mEarth = 5.972e24;
  return { linMomRatio: m * v / pEarth, angMomRatio: m * v * Math.cos(th) * RE / lEarth, dayChangeS: (1.25 / Math.PI) * (m / mEarth) * Math.cos(th) / (RE / 1000) * (v / 1000) * 86400 ** 2 };
}
// p: { L0 (m), rhoI, v0 (m/s), thetaDeg, target ('sediman'|'kristal'|'su'), depth (m, su), rKm }
export function scenario(p) {
  const e = atmosphericEntry(p), cr = crater(e, p, p.target, p.target === 'su' ? p.depth : 0), rM = p.rKm * 1000;
  return {
    entry: e, crater: cr, thermal: thermal(e, cr, rM), seismic: seismic(e, cr, rM), ejecta: ejecta(e, cr, rM), blast: blast(e, rM),
    tsunami: p.target === 'su' ? tsunami(cr, rM, p.depth, p.L0) : null, global: globalEffects(e, cr, p.thetaDeg), recurrence: recurrenceYears(e.mass, e.E0Mt),
  };
}
// eşik yarıçapı: f(r) azalan, f(r) = eşik (ikiye bölme, log ölçekte). Sınır dışında null.
export function radiusWhere(f, thr, rMin = 10, rMax = 2e7) {
  if (!(f(rMin) >= thr)) return null; if (f(rMax) >= thr) return rMax;
  let a = Math.log(rMin), b = Math.log(rMax);
  for (let i = 0; i < 80; i++) { const m = 0.5 * (a + b); if (f(Math.exp(m)) >= thr) a = m; else b = m; }
  return Math.exp(0.5 * (a + b));
}
// hasar yarıçapları (m): hava şoku ve ısı eşikleri, sismik etkin büyüklük
export function damageRadii(s, p) {
  const e = s.entry, zb = e.regime === 'hava' ? e.zb : 0, P = (r) => overpressure(e.EblastKt, zb, r), out = [];
  for (const [th, txt, k] of BLAST_DAMAGE) out.push({ kind: k === 'p' ? 'şok' : 'rüzgâr', txt, r: radiusWhere(k === 'p' ? P : (r) => windSpeed(P(r)), th) });
  if (s.crater && s.crater.vImpact >= 15e3) {
    const sc = (s.crater.Eimp / MT) ** (1 / 6);
    for (const [txt, j] of THERMAL_THRESH) out.push({ kind: 'ısı', txt, r: radiusWhere((r) => { const t = thermal(e, s.crater, r); return t ? t.phi : 0; }, j * sc, 100) });
  }
  if (s.crater) for (const m of [7, 6, 5]) out.push({ kind: 'sismik', txt: `Etkin büyüklük ≥ ${m} (tipik ${mmiOf(m)} şiddet)`, r: radiusWhere((r) => seismic(e, s.crater, r).Meff, m, 1000) });
  return out;
}
