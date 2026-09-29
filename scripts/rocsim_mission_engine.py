"""
ROCSIM - Dünya yörüngesinden Ay yüzeyine tek parça fizik motoru
=================================================================
Birimler: km, s, kg.  Zaman: TDB saniye, JD0 (2026-10-01 00:00 TDB) başlangıçlı.
Çerçeve: ICRF (J2000 ekvatoru). Sadece numpy gerekir (Blender'da da çalışır).

Kuvvet modeli
  - Merkez cisim (Dünya ya da Ay, etki küresine göre otomatik geçiş) noktasal çekimi
  - Dünya J2 (tarihin kutbu, IAU-1976 presesyonu ile)
  - Ay J2 + C22 (GRAIL GL0660B, asal eksen [PA] çerçevesinde)
  - Üçüncü cisimler: Ay / Dünya ve Güneş (DE440 efemerisi, dolaylı terimlerle)
  - Sonlu itki: F = T·û, ṁ = -T/(Isp·g0)
Efemeris / yönelim
  - Ay ve Güneş jeosentrik konumları: JPL DE440s'ten Chebyshev tabloları (hata < 2 cm)
  - Ay yönelimi: DE440 kütüphane açıları (moon_pa_de440_200625) + PA→ME sabit dönüşümü (moon_de440_250416.tf)
  - Dünya yönelimi: IAU-1976 presesyon + GMST (IAU-1982, UT1≈UTC); nütasyon ihmal (≤ 17")
Entegratör
  - Dormand-Prince 5(4) uyarlamalı adım; yakışlarda kontrol her adım başında örneklenir (sıfır dereceli tutma)
"""
import json, math, os
import numpy as np

MU_E = 398600.435507          # km^3/s^2
MU_M = 4902.800118
MU_S = 132712440041.279
R_E = 6378.1363
J2_E = 1.0826267e-3
R_M_REF = 1738.0              # GRAIL referans yarıçapı
R_M = 1737.4                  # ortalama yarıçap (topografya referansı)
J2_M = 2.03213e-4
C22_M = 2.2382e-5
G0 = 9.80665e-3               # km/s^2
SOI_M = 66100.0               # Ay etki küresi [km]
TT_UTC = 69.184               # s (TAI-UTC=37 s, 2017'den beri)
DAY = 86400.0

_EPH = None


def load_ephemeris(data=None, path=None):
    global _EPH
    if data is None:
        data = json.load(open(path))
    from numpy.polynomial import chebyshev as C
    moon = np.array(data["moon"]); sun = np.array(data["sun"]); pa = np.array(data["pa"])
    _EPH = dict(JD0=data["JD0"], ndays=data["ndays"],
                moon=moon, moon_d=np.array([[C.chebder(c) for c in seg] for seg in moon]),
                sun=sun, pa=pa,
                me=[math.radians(a / 3600.0) for a in data["me_from_pa_arcsec_313"]])
    return _EPH


def _tvec(x, n):
    T = [1.0, x]
    for _ in range(n - 2):
        T.append(2 * x * T[-1] - T[-2])
    return np.array(T[:n])


def _cheb(tab, t, span_days):
    d = t / DAY
    s = int(d // span_days)
    s = min(max(s, 0), tab.shape[0] - 1)
    x = 2.0 * (d - s * span_days) / span_days - 1.0
    return tab[s] @ _tvec(x, tab.shape[2]), s, x


def moon_pos(t):
    return _cheb(_EPH["moon"], t, 1.0)[0]


def moon_vel(t):
    v, s, x = _cheb(_EPH["moon_d"], t, 1.0)
    return v * 2.0 / DAY


def sun_pos(t):
    return _cheb(_EPH["sun"], t, 8.0)[0]


def _R1(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def _R2(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])


def _R3(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])


def moon_icrf_to_pa(t):
    phi, theta, psi = _cheb(_EPH["pa"], t, 1.0)[0]
    return _R3(psi) @ _R1(theta) @ _R3(phi)


def moon_icrf_to_me(t):
    a1, a2, a3 = _EPH["me"]
    return _R1(a3) @ _R2(a2) @ _R3(a1) @ moon_icrf_to_pa(t)


def jd_tdb(t):
    return _EPH["JD0"] + t / DAY


def precession(t):
    T = (jd_tdb(t) - 2451545.0) / 36525.0
    as2r = math.pi / 180 / 3600
    zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as2r
    z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as2r
    th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as2r
    return _R3(-z) @ _R2(th) @ _R3(-zeta)


def gmst(t):
    jd_ut1 = jd_tdb(t) - TT_UTC / DAY
    D = jd_ut1 - 2451545.0; T = D / 36525.0
    g = 280.46061837 + 360.98564736629 * D + 0.000387933 * T * T - T ** 3 / 38710000.0
    return math.radians(g % 360.0)


def earth_icrf_to_itrf(t):
    return _R3(gmst(t)) @ precession(t)


def accel(t, r, central, thrust_acc=None, earth_pole=None, M_pa=None):
    rm = moon_pos(t); rs = sun_pos(t)
    rn = math.sqrt(r @ r)
    if central == 'E':
        a = -MU_E * r / rn ** 3
        p = earth_pole if earth_pole is not None else precession(t)[2]
        z = r @ p; k = 1.5 * J2_E * MU_E * R_E ** 2 / rn ** 5
        a = a + k * ((5 * z * z / (rn * rn) - 1) * r - 2 * z * p)
        d = rm - r; a = a + MU_M * (d / np.linalg.norm(d) ** 3 - rm / np.linalg.norm(rm) ** 3)
        d = rs - r; a = a + MU_S * (d / np.linalg.norm(d) ** 3 - rs / np.linalg.norm(rs) ** 3)
    else:
        a = -MU_M * r / rn ** 3
        M = M_pa if M_pa is not None else moon_icrf_to_pa(t)
        x, y, zz = M @ r
        R2 = R_M_REF ** 2; r5 = rn ** 5; r7 = r5 * rn * rn
        kJ = -1.5 * J2_M * MU_M * R2 / r5; q = 5 * zz * zz / (rn * rn)
        aJ = kJ * np.array([x * (1 - q), y * (1 - q), zz * (3 - q)])
        kC = 3 * MU_M * R2 * C22_M; w = x * x - y * y
        aC = kC * np.array([2 * x / r5 - 5 * w * x / r7, -2 * y / r5 - 5 * w * y / r7, -5 * w * zz / r7])
        a = a + M.T @ (aJ + aC)
        re = -rm
        d = re - r; a = a + MU_E * (d / np.linalg.norm(d) ** 3 - re / np.linalg.norm(re) ** 3)
        rsm = rs - rm
        d = rsm - r; a = a + MU_S * (d / np.linalg.norm(d) ** 3 - rsm / np.linalg.norm(rsm) ** 3)
    if thrust_acc is not None:
        a = a + thrust_acc
    return a


class Vehicle:
    def __init__(self, stages):
        self.stages = [dict(s) for s in stages]
        self.k = 0

    @property
    def active(self):
        return self.stages[self.k]

    def mass(self):
        return sum(s["dry"] + s["prop"] for s in self.stages[self.k:])

    def separate(self):
        self.k += 1


A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9],
     [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
     [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
     [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]]
Cc = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1]
B5 = np.array([35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0])
B4 = np.array([5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40])

ATOL_R = 1e-5      # km  (1 cm)
ATOL_V = 1e-8      # km/s
RTOL = 1e-12


class State:
    def __init__(self, t, r, v, central='E'):
        self.t = float(t); self.r = np.array(r, float); self.v = np.array(v, float); self.central = central

    def copy(self):
        return State(self.t, self.r.copy(), self.v.copy(), self.central)

    def geo(self):
        if self.central == 'E':
            return self.r, self.v
        return self.r + moon_pos(self.t), self.v + moon_vel(self.t)

    def seleno(self):
        if self.central == 'M':
            return self.r, self.v
        return self.r - moon_pos(self.t), self.v - moon_vel(self.t)

    def switch_if_needed(self):
        rs, vs = self.seleno()
        d = math.sqrt(rs @ rs)
        if self.central == 'E' and d < SOI_M * 0.98:
            self.r, self.v, self.central = rs, vs, 'M'; return True
        if self.central == 'M' and d > SOI_M * 1.02:
            self.r, self.v = self.geo(); self.central = 'E'; return True
        return False


def dopri_step(st, h, acc_thrust):
    t, r, v, c = st.t, st.r, st.v, st.central
    pole = precession(t)[2] if c == 'E' else None
    Mpa = moon_icrf_to_pa(t + h / 2) if c == 'M' else None
    kr = []; kv = []
    for i in range(7):
        ri = r.copy(); vi = v.copy()
        for j, aij in enumerate(A[i]):
            if aij:
                ri = ri + h * aij * kr[j]; vi = vi + h * aij * kv[j]
        kr.append(vi)
        kv.append(accel(t + Cc[i] * h, ri, c, acc_thrust, pole, Mpa))
    kr = np.array(kr); kv = np.array(kv)
    r5 = r + h * (B5 @ kr); v5 = v + h * (B5 @ kv)
    r4 = r + h * (B4 @ kr); v4 = v + h * (B4 @ kv)
    sc_r = ATOL_R + RTOL * max(np.abs(r).max(), np.abs(r5).max())
    sc_v = ATOL_V + RTOL * max(np.abs(v).max(), np.abs(v5).max())
    err = max(np.abs(r5 - r4).max() / sc_r, np.abs(v5 - v4).max() / sc_v)
    return r5, v5, err


class Propagator:
    def __init__(self, state, vehicle, rtol=1.0, h_max_coast=900.0, h_max_burn=1.0):
        self.s = state; self.veh = vehicle
        self.h = 10.0; self.h_max_coast = h_max_coast; self.h_max_burn = h_max_burn
        self.log = []
        self.phase = ""
        self.dv_used = 0.0

    def record(self, thr, u):
        g, gv = self.s.geo()
        self.log.append((self.s.t, self.s.central, *g, *gv, self.veh.mass(), thr, *u, self.phase, self.veh.k))

    def step(self, h_req, control=None, record=True):
        thr, u = (0.0, np.zeros(3))
        if control is not None:
            c = control(self)
            if c is not None:
                thr, u = c
        st = self.veh.active
        T = thr * st["T"] if (thr > 0 and st["prop"] > 0) else 0.0
        m = self.veh.mass()
        acc = (T / m) * np.asarray(u) if T > 0 else None
        hmax = self.h_max_burn if T > 0 else self.h_max_coast
        h = math.copysign(min(abs(h_req), hmax, abs(self.h)), h_req)
        while True:
            r5, v5, err = dopri_step(self.s, h, acc)
            if err <= 1.0:
                break
            h *= max(0.2, 0.9 * err ** -0.2)
        if record:
            self.record(thr, u)
        self.s.r, self.s.v = r5, v5; self.s.t += h
        if T > 0:
            dm = min(T / (st["isp"] * G0) * abs(h), st["prop"])
            self.dv_used += st["isp"] * G0 * math.log(m / (m - dm))
            st["prop"] -= dm
        fac = 5.0 if err < 1e-10 else min(5.0, 0.9 * err ** -0.2)
        self.h = min(abs(h) * fac, self.h_max_coast)
        self.s.switch_if_needed()
        return h

    def run_until(self, t_end, control=None, stop=None, record=True):
        sign = 1.0 if t_end >= self.s.t else -1.0
        while sign * (t_end - self.s.t) > 1e-9:
            if stop is not None and stop(self):
                return True
            self.step(sign * min(abs(t_end - self.s.t), 1e9), control, record)
        return False


def elements(r, v, mu):
    rn = np.linalg.norm(r); vn = np.linalg.norm(v)
    h = np.cross(r, v); hn = np.linalg.norm(h)
    E = 0.5 * vn * vn - mu / rn
    a = -mu / (2 * E) if abs(E) > 1e-14 else math.inf
    ev = ((vn * vn - mu / rn) * r - (r @ v) * v) / mu
    e = np.linalg.norm(ev)
    p = hn * hn / mu
    return dict(a=a, e=e, h=h, evec=ev, p=p, rp=p / (1 + e), ra=(p / (1 - e) if e < 1 else math.inf), energy=E)


def unit(x):
    n = np.linalg.norm(x); return x / n if n > 0 else x


def utc_string(t):
    jd = jd_tdb(t) - TT_UTC / DAY + 0.5
    Z = int(jd); F = jd - Z
    alpha = int((Z - 1867216.25) / 36524.25); A_ = Z + 1 + alpha - alpha // 4
    B = A_ + 1524; C_ = int((B - 122.1) / 365.25); D_ = int(365.25 * C_); E_ = int((B - D_) / 30.6001)
    day = B - D_ - int(30.6001 * E_) + F
    month = E_ - 1 if E_ < 14 else E_ - 13; year = C_ - 4716 if month > 2 else C_ - 4715
    d = int(day); s = (day - d) * 86400.0; hh = int(s // 3600); mm = int((s % 3600) // 60); ss = s % 60
    return f"{year:04d}-{month:02d}-{d:02d} {hh:02d}:{mm:02d}:{ss:04.1f} UTC"
