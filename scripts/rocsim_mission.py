"""
ROCSIM görevi: KSC'den fırlatılan araç 185 km park yörüngesinde -> TLI -> MCC-1/2 -> LOI -> DOI -> PDI -> Apollo 11 bölgesine iniş.
Tüm yakışlar sonlu, tüm fazlar aynı fizik motorunda (rocsim_mission_engine) tek parça entegre edilir.
Kapalı döngü "uçuş bilgisayarı": MCC'ler hedefleme yapar (Newton), LOI/DOI/PDI rehberlikle kesilir.
"""
import math, json
import numpy as np
try:
    import rocsim_mission_engine as E
except ImportError:
    import sys; E = sys.modules["rocsim_mission_engine"]

SITE_LAT, SITE_LON = math.radians(0.67409), math.radians(23.47298)   # Apollo 11 LM (LROC)
R_SITE = 1735.47                                                      # km
H_PARK = 185.0
H_LLO = 110.0
STAGES = [dict(name="TLI kademesi", dry=2300.0, prop=6200.0, T=100.0, isp=450.0, thr_min=1.0),
          dict(name="İniş aracı", dry=1300.0, prop=2300.0, T=16.0, isp=320.0, thr_min=0.10)]
TLI = dict(x=[-0.15432745628064812, 273.08951439591203, -0.022609578742937834, 6.791110181274024e-05],
           t_ign=1093114.4970916419,
           phat=[-0.31173799476035463, 0.8368265989729966, 0.45004518203629357],
           hhat=[0.3302584846107584, -0.34868779448125087, 0.8771237970334669])
ARRIVAL = dict(t_P=1434828.329960779, rP=[-440.0086942362937, -1534.2006163226988, -930.3265974223907],
               uP=234.10913741749823, beta=-10.752796815417604, vp=2.4556636659511857)
LAUNCH = dict(t_launch=1082572.266253084, t_ins=1083172.266253084, az=88.60991672516388,
              site="Kennedy Uzay Merkezi LC-39B (28.5729°K, 80.6490°B)")
TLI_DUR_ERROR = 0.05
PDI_ANGLE = math.radians(9.0)
H_PDI = 15.0
TF_BRAKE = 310.0
GATE_HI = dict(x=-0.700, z=1.500, vx=0.045, vz=-0.035)
TF_APPROACH = 45.0
GATE_LO = dict(x=0.0, z=0.250, vx=0.0, vz=-0.018)
V_TOUCH = -0.001
TILT_MAX_LOW = math.radians(40)
T_L_TARGET = 1453341.4170836865


def site_me():
    return np.array([math.cos(SITE_LAT) * math.cos(SITE_LON), math.cos(SITE_LAT) * math.sin(SITE_LON), math.sin(SITE_LAT)])


def site_icrf(t):
    return E.moon_icrf_to_me(t).T @ site_me() * R_SITE


def omega_moon(t):
    M0 = E.moon_icrf_to_me(t - 5); M1 = E.moon_icrf_to_me(t + 5)
    dM = (M1 - M0) / 10.0
    W = E.moon_icrf_to_me(t).T @ dM
    W = 0.5 * (W - W.T)
    return -np.array([W[2, 1], W[0, 2], W[1, 0]])


class Mission:
    def __init__(self, record_every=0.0, verbose=True):
        self.veh = E.Vehicle(STAGES)
        self.events = []
        self.verbose = verbose
        self.stage_log = []
        self.phase = "PARK"

    def log(self, P, msg):
        g, _ = P.s.geo()
        self.events.append(dict(t=P.s.t, utc=E.utc_string(P.s.t), phase=P.phase, msg=msg, m=self.veh.mass(), dv=P.dv_used))
        if self.verbose:
            print(f"[{E.utc_string(P.s.t)}] {P.phase:10s} {msg}   m={self.veh.mass():8.1f} kg  Δv_top={P.dv_used * 1000:7.1f} m/s", flush=True)

    def park_state_at_ign(self):
        phi, dur, pitch, psi = TLI["x"]
        phat = np.array(TLI["phat"]); hhat = np.array(TLI["hhat"])
        h = E.unit(math.cos(psi) * hhat + math.sin(psi) * np.cross(phat, hhat))
        p = E.unit(phat - (phat @ h) * h); q = np.cross(h, p)
        rp = E.R_E + H_PARK; vc = math.sqrt(E.MU_E / rp)
        r = rp * (math.cos(phi) * p + math.sin(phi) * q)
        v = vc * (-math.sin(phi) * p + math.cos(phi) * q)
        return E.State(TLI["t_ign"], r, v, 'E')

    def run(self):
        st_ign = self.park_state_at_ign()
        Pb = E.Propagator(st_ign.copy(), E.Vehicle([dict(name="x", dry=1, prop=0, T=0, isp=1)]), h_max_coast=30.0)
        Pb.run_until(LAUNCH["t_ins"], record=False)
        self.t0 = Pb.s.t
        P = E.Propagator(Pb.s.copy(), self.veh, h_max_coast=30.0, h_max_burn=1.0)
        self.P = P
        P.phase = "PARK"; self.log(P, f"Yörüngeye giriş (fırlatma {E.utc_string(LAUNCH['t_launch'])}, KSC, azimut {LAUNCH['az']:.1f}°) — 185 km park yörüngesi")
        P.run_until(TLI["t_ign"])
        phi, dur, pitch, psi = TLI["x"]
        P.phase = "TLI"; self.log(P, "TLI ateşleme")

        def tli_ctrl(Pp):
            r, v = Pp.s.r, Pp.s.v
            vh = E.unit(v); nh = E.unit(np.cross(r, v)); rh = np.cross(nh, vh)
            return 1.0, math.cos(pitch) * vh + math.sin(pitch) * rh
        P.run_until(TLI["t_ign"] + dur + TLI_DUR_ERROR, control=tli_ctrl)
        self.log(P, "TLI motor kesme")
        P.phase = "SUZULME"; P.h_max_coast = 120.0
        P.run_until(P.s.t + 1800.0)
        stg_state = P.s.copy(); stg_state.v = stg_state.v - 0.0005 * E.unit(stg_state.v)
        self.stage_state = stg_state; self.t_sep = P.s.t
        self.veh.separate(); self.log(P, "TLI kademesi ayrıldı")
        P.h_max_coast = 1800.0
        ref = self.reference_trajectory()
        self.mcc(P, t_burn=self.t_sep + 20 * 3600, t_target=ARRIVAL["t_P"] - 8 * 3600, ref=ref, name="MCC-1")
        self.mcc(P, t_burn=ARRIVAL["t_P"] - 22 * 3600, t_target=ARRIVAL["t_P"] - 1 * 3600, ref=ref, name="MCC-2", mode="peri")
        self.loi(P)
        self.lunar_ops(P)
        S = E.Propagator(self.stage_state.copy(), E.Vehicle([dict(name="kademe", dry=2300.0, prop=0.0, T=0.0, isp=1.0)]), h_max_coast=1800.0)
        S.phase = "KADEME"
        S.run_until(P.s.t)
        self.stage_log = S.log
        return P

    def reference_trajectory(self):
        t_L = T_L_TARGET
        s = site_icrf(t_L) / R_SITE
        zp = E.moon_icrf_to_me(t_L).T @ np.array([0, 0, 1.0])
        n0 = E.unit(zp - (zp @ s) * s)
        b = math.radians(ARRIVAL["beta"])
        n = math.cos(b) * n0 + math.sin(b) * np.cross(s, n0)
        h = -n
        rP = np.array(ARRIVAL["rP"])
        return E.State(ARRIVAL["t_P"], rP, ARRIVAL["vp"] * E.unit(np.cross(h, E.unit(rP))), 'M')

    def ref_at(self, ref, t):
        P = E.Propagator(ref.copy(), E.Vehicle([dict(name="x", dry=1, prop=0, T=0, isp=1)]), h_max_coast=1800.0)
        P.run_until(t, record=False)
        return P.s.geo()

    def fly_burn(self, st, veh, dv_vec, t_target, record=False, phase=None):
        P = E.Propagator(st.copy(), veh, h_max_coast=1800.0, h_max_burn=0.5)
        if phase: P.phase = phase
        dvm = np.linalg.norm(dv_vec)
        if dvm > 1e-9:
            stg = veh.active; m0 = veh.mass(); mdot = stg["T"] / (stg["isp"] * E.G0)
            tb = m0 * (1 - math.exp(-dvm / (stg["isp"] * E.G0))) / mdot
            u = dv_vec / dvm
            P.run_until(st.t + tb, control=lambda Pp: (1.0, u), record=record)
        return P

    def mcc(self, P, t_burn, t_target, ref, name, mode="pos"):
        P.phase = "SUZULME"
        P.run_until(t_burn)
        r_ref, v_ref = self.ref_at(ref, t_target)
        import copy
        zM = E.moon_icrf_to_me(ARRIVAL["t_P"]).T @ np.array([0, 0, 1.0])

        def peri_targets(rs, vs, t):
            el = E.elements(rs, vs, E.MU_M); e = el["e"]; a = abs(el["a"])
            cnu = max(-1.0, min(1.0, (el["p"] / np.linalg.norm(rs) - 1) / e)); nu = math.copysign(math.acos(cnu), rs @ vs)
            F_ = 2 * math.atanh(math.sqrt((e - 1) / (e + 1)) * math.tan(nu / 2))
            t_peri = t - (e * math.sinh(F_) - F_) * math.sqrt(a ** 3 / E.MU_M)
            return np.array([el["rp"], 100.0 * (E.unit(el["h"]) @ zM), (t_peri - ARRIVAL["t_P"]) / 10.0])
        if mode == "peri":
            rm, vm = E.moon_pos(t_target), E.moon_vel(t_target)
            T0 = peri_targets(r_ref - rm, v_ref - vm, t_target)

        def miss(dv):
            vcopy = copy.deepcopy(self.veh)
            Q = self.fly_burn(P.s, vcopy, dv, t_target)
            Q.run_until(t_target, record=False)
            if mode == "pos":
                return Q.s.geo()[0] - r_ref
            rs, vs = Q.s.seleno()
            return peri_targets(rs, vs, t_target) - T0
        dv = np.zeros(3)
        for it in range(12):
            F = miss(dv)
            if np.linalg.norm(F) < 0.05:
                break
            J = np.zeros((3, 3)); h = 1e-5
            for k in range(3):
                d = dv.copy(); d[k] += h; J[:, k] = (miss(d) - F) / h
            step = -np.linalg.solve(J, F)
            if np.linalg.norm(step) > 0.05: step *= 0.05 / np.linalg.norm(step)
            dv = dv + step
        P.phase = name
        self.log(P, f"{name}: Δv={np.linalg.norm(dv) * 1000:.2f} m/s, kalan hedef hatası {np.linalg.norm(F):.4f}")
        dvm = np.linalg.norm(dv)
        if dvm > 1e-6:
            stg = self.veh.active; m0 = self.veh.mass(); mdot = stg["T"] / (stg["isp"] * E.G0)
            tb = m0 * (1 - math.exp(-dvm / (stg["isp"] * E.G0))) / mdot
            u = dv / dvm; P.h_max_burn = 0.5
            P.run_until(P.s.t + tb, control=lambda Pp: (1.0, u))
        P.phase = "SUZULME"

    def loi(self, P):
        P.phase = "SUZULME"
        stg = self.veh.active

        def t_to_peri(Pp):
            rs, vs = Pp.s.seleno()
            return -(rs @ vs) / (vs @ vs)
        while True:
            P.step(1e9, None)
            if P.s.central == 'M':
                rs, vs = P.s.seleno()
                m0 = self.veh.mass(); mdot = stg["T"] / (stg["isp"] * E.G0)
                dv_est = np.linalg.norm(vs) - math.sqrt(E.MU_M / np.linalg.norm(rs)) if np.linalg.norm(rs) < 3000 else 0.9
                tb = m0 * (1 - math.exp(-max(dv_est, 0.5) / (stg["isp"] * E.G0))) / mdot
                if np.linalg.norm(rs) < 20000:
                    P.h_max_coast = 20.0
                if t_to_peri(P) <= tb / 2 and (rs @ vs) < 0:
                    break
        P.phase = "LOI"; P.h_max_burn = 0.5
        hdir = E.unit(np.cross(*P.s.seleno()))
        self.log(P, f"LOI ateşleme (periselen irtifası ~{self.peri_alt(P):.1f} km)")

        def loi_ctrl(Pp):
            rs, vs = Pp.s.seleno()
            vt = math.sqrt(E.MU_M / np.linalg.norm(rs)) * E.unit(np.cross(hdir, rs))
            dv = vt - vs
            amax = stg["T"] / self.veh.mass()
            thr = min(1.0, max(stg["thr_min"], np.linalg.norm(dv) / (amax * 2.0)))
            return thr, E.unit(dv)

        def loi_stop(Pp):
            rs, vs = Pp.s.seleno()
            vt = math.sqrt(E.MU_M / np.linalg.norm(rs)) * E.unit(np.cross(hdir, rs))
            return np.linalg.norm(vt - vs) < 0.0004
        P.h_max_burn = 0.2
        P.run_until(P.s.t + 2000, control=loi_ctrl, stop=loi_stop)
        rs, vs = P.s.seleno(); el = E.elements(rs, vs, E.MU_M)
        self.log(P, f"LOI tamam: periselen {el['rp'] - E.R_M:.1f} km, aposelen {el['ra'] - E.R_M:.1f} km")
        P.phase = "AY_YORUNGESI"; P.h_max_coast = 60.0

    def peri_alt(self, P):
        rs, vs = P.s.seleno(); el = E.elements(rs, vs, E.MU_M)
        return el["rp"] - E.R_M

    def angle_to_site(self, P, t_land_guess=None):
        rs, vs = P.s.seleno()
        h = E.unit(np.cross(rs, vs)); s = site_icrf(P.s.t if t_land_guess is None else t_land_guess)
        s_p = E.unit(s - (s @ h) * h); r_h = E.unit(rs)
        ang = math.atan2(np.cross(r_h, s_p) @ h, r_h @ s_p)
        return ang % (2 * math.pi)

    def lunar_ops(self, P):
        stg = self.veh.active
        n = math.sqrt(E.MU_M / (E.R_M + H_LLO) ** 3); Tp = 2 * math.pi / n
        t_min_doi = P.s.t + 1.5 * Tp
        doi_ang = math.pi + PDI_ANGLE
        P.h_max_coast = 60.0
        P.run_until(t_min_doi)
        while True:
            t_land = P.s.t + (doi_ang - PDI_ANGLE) / n + 700.0
            rem = (self.angle_to_site(P, t_land) - doi_ang) % (2 * math.pi)
            if rem < 2e-4 or rem > 2 * math.pi - 0.02:
                break
            P.h_max_coast = max(0.2, min(60.0, rem / n * 0.5))
            P.step(1e9, None)
        P.phase = "DOI"; P.h_max_burn = 0.05
        self.log(P, "DOI ateşleme")

        def doi_ctrl(Pp):
            rs, vs = Pp.s.seleno(); el = E.elements(rs, vs, E.MU_M)
            thr = min(1.0, max(stg["thr_min"], (el["rp"] - (R_SITE + H_PDI)) / 20.0))
            return thr, -E.unit(vs)

        def doi_stop(Pp):
            rs, vs = Pp.s.seleno(); el = E.elements(rs, vs, E.MU_M)
            return el["rp"] <= R_SITE + H_PDI
        P.run_until(P.s.t + 300, control=doi_ctrl, stop=doi_stop)
        rs, vs = P.s.seleno(); el = E.elements(rs, vs, E.MU_M)
        self.log(P, f"DOI tamam: periselen {el['rp'] - R_SITE:.2f} km (site'a göre)")
        P.phase = "INIS_SUZULME"
        while True:
            rem = (self.angle_to_site(P, P.s.t + 650.0) - PDI_ANGLE) % (2 * math.pi)
            if rem < 2e-5 or rem > 2 * math.pi - 0.02:
                break
            P.h_max_coast = max(0.1, min(60.0, rem / n * 0.5))
            P.step(1e9, None)
        self.descent(P)

    def site_frame(self, t, vs_hint):
        s = site_icrf(t); up = E.unit(s)
        dr = E.unit(vs_hint - (vs_hint @ up) * up)
        y = np.cross(up, dr)
        return s, np.array([dr, y, up])

    def descent(self, P):
        stg = self.veh.active
        rs, vs = P.s.seleno()
        _, Rf = self.site_frame(P.s.t, vs)
        self.dr_axis = Rf[0].copy()
        t_ph = P.s.t
        P.phase = "PDI"; P.h_max_burn = 0.2
        self.log(P, f"PDI ateşleme (irtifa {np.linalg.norm(rs) - R_SITE:.2f} km)")
        gate_hi = np.array([GATE_HI["x"], 0, GATE_HI["z"]]); vgate_hi = np.array([GATE_HI["vx"], 0, GATE_HI["vz"]])
        gate_lo = np.array([GATE_LO["x"], 0, GATE_LO["z"]]); vgate_lo = np.array([GATE_LO["vx"], 0, GATE_LO["vz"]])
        state = dict(phase="BRAKE", t_ph=t_ph)

        def local(Pp):
            rs, vs = Pp.s.seleno(); t = Pp.s.t
            s = site_icrf(t); up = E.unit(s)
            x = E.unit(self.dr_axis - (self.dr_axis @ up) * up); y = np.cross(up, x)
            Rf = np.array([x, y, up])
            w = omega_moon(t)
            rel = rs - s
            vrel = vs - np.cross(w, rs)
            p = Rf @ rel; v = Rf @ vrel
            p[2] = np.linalg.norm(rs) - R_SITE
            g = Rf @ (-E.MU_M * rs / np.linalg.norm(rs) ** 3)
            return p, v, g, Rf
        self.local = local

        def zem(p, v, g, pf, vf, tgo):
            return 6 * (pf - (p + v * tgo + 0.5 * g * tgo ** 2)) / tgo ** 2 - 2 * (vf - (v + g * tgo)) / tgo

        def ctrl(Pp):
            p, v, g, Rf = local(Pp); t = Pp.s.t; ph = state["phase"]
            if ph == "BRAKE":
                tgo = max(TF_BRAKE - (t - state["t_ph"]), 3.0)
                a_cmd = zem(p, v, g, gate_hi, vgate_hi, tgo)
                if t - state["t_ph"] >= TF_BRAKE:
                    state["phase"] = "APPROACH"; state["t_ph"] = t; Pp.phase = "YAKLASMA"
            elif ph == "APPROACH":
                tgo = max(TF_APPROACH - (t - state["t_ph"]), 2.0)
                a_cmd = zem(p, v, g, gate_lo, vgate_lo, tgo)
                if p[2] <= GATE_LO["z"] + 0.0005 or t - state["t_ph"] >= TF_APPROACH:
                    state["phase"] = "TERMINAL"; state["t_ph"] = t; Pp.phase = "SON_INIS"
            else:
                vz_ref = V_TOUCH - 0.07 * max(p[2], 0.0)
                a_cmd = np.array([-0.15 * p[0] - 0.8 * v[0], -0.15 * p[1] - 0.8 * v[1], 1.2 * (vz_ref - v[2])])
            a_thr = a_cmd - g
            if state["phase"] in ("APPROACH", "TERMINAL"):
                hz = math.hypot(a_thr[0], a_thr[1]); tilt = math.atan2(hz, a_thr[2])
                if tilt > TILT_MAX_LOW:
                    s_ = math.tan(TILT_MAX_LOW) * a_thr[2] / hz; a_thr[0] *= s_; a_thr[1] *= s_
                if state["phase"] == "TERMINAL" and p[2] < 0.003:
                    a_thr[0] = a_thr[1] = 0.0
            m = self.veh.mass(); T = m * np.linalg.norm(a_thr)
            thr = min(1.0, max(stg["thr_min"], T / stg["T"]))
            u_icrf = Rf.T @ E.unit(a_thr)
            self.last_local = (p, v)
            return thr, u_icrf

        def stop(Pp):
            rs, _ = Pp.s.seleno()
            return np.linalg.norm(rs) - R_SITE <= 0.0
        P.run_until(P.s.t + 1500, control=ctrl, stop=stop)
        p, v, g, Rf = local(P)
        P.phase = "INDI"
        self.touchdown = dict(t=P.s.t, utc=E.utc_string(P.s.t), pos_err_m=(p[:2] * 1000).tolist(), v_mps=(v * 1000).tolist(),
                              prop_left=self.veh.active["prop"])
        self.log(P, f"TEMAS: konum hatası {np.linalg.norm(p[:2]) * 1000:.1f} m, dikey hız {v[2] * 1000:.2f} m/s, yatay {np.hypot(v[0], v[1]) * 1000:.2f} m/s, kalan yakıt {self.veh.active['prop']:.0f} kg")
        P.record(0.0, np.zeros(3))
