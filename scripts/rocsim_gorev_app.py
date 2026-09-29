# ROCSIM görev uygulaması (Blender): tek fizik simülasyonundan üç ölçekli sahne + film
#  - ROCSIM_Dunya  : Dünya merkezli ICRF, 1 birim = 1000 km (fırlatma sonrası park -> TLI -> transfer -> Ay'a yaklaşma)
#  - ROCSIM_Yorunge: Ay merkezli ICRF, 1 birim = 1 km, kayan orijin (yaklaşma -> LOI -> Ay yörüngesi -> DOI -> PDI)
#  - ROCSIM        : iniş noktası yerel çerçevesi, 1 birim = 1 m (yüksek kapı -> temas)
# Dünya dönüşü (GMST+presesyon), Ay yönelimi (DE440 kütüphane açıları), Güneş/Ay konumları (DE440) her kare doğrudan motordan.
import bpy, math, os, sys, types
import numpy as np
from mathutils import Matrix, Vector, Quaternion

NS = bpy.app.driver_namespace
FPS = 30
EPH_PATH = os.path.expanduser("~/Documents/ROCSIM/kernels/rocsim_eph_2026Q4.json")
PH_TR = {"PARK": "Park yörüngesi (185 km)", "TLI": "Ay'a transfer yakışı (TLI)", "SUZULME": "Serbest süzülme",
         "MCC-1": "Orta rota düzeltmesi 1", "MCC-2": "Orta rota düzeltmesi 2", "LOI": "Ay yörüngesine giriş yakışı (LOI)",
         "AY_YORUNGESI": "Ay yörüngesi (~114 km)", "DOI": "İniş yörüngesine geçiş (DOI)", "INIS_SUZULME": "15 km'ye alçalış",
         "PDI": "Motorlu iniş: frenleme", "YAKLASMA": "Motorlu iniş: yaklaşma", "SON_INIS": "Son iniş", "INDI": "İNİŞ BAŞARILI"}


def load_mod(name, textname):
    m = types.ModuleType(name); m.__file__ = textname
    sys.modules[name] = m
    exec(bpy.data.texts[textname].as_string(), m.__dict__)
    return m


def engine():
    E = sys.modules.get("rocsim_mission_engine")
    if E is None or E._EPH is None:
        E = load_mod("rocsim_mission_engine", "rocsim_mission_engine.py")
        E.load_ephemeris(path=EPH_PATH)
    return E


def mission():
    D = NS.get("ROCSIM_DATA")
    if D is not None:
        return D
    E = engine()
    RM = sys.modules.get("rocsim_mission") or load_mod("rocsim_mission", "rocsim_mission.py")
    M = RM.Mission(verbose=False); P = M.run()
    L = P.log
    T = np.array([l[0] for l in L]); RG = np.array([l[2:5] for l in L]); VG = np.array([l[5:8] for l in L])
    D = dict(E=E, RM=RM, M=M, T=T, RG=RG, VG=VG, MASS=np.array([l[8] for l in L]), THR=np.array([l[9] for l in L]),
             U=np.array([l[10:13] for l in L]), PH=[l[13] for l in L], K=np.array([l[14] for l in L]),
             ST=np.array([l[0] for l in M.stage_log]), SRG=np.array([l[2:5] for l in M.stage_log]), SVG=np.array([l[5:8] for l in M.stage_log]),
             events=M.events, touchdown=M.touchdown, t_sep=M.t_sep)
    D["DV"] = np.concatenate([[0.0], np.cumsum([s["isp"] * E.G0 * math.log(m0 / m1) if m1 < m0 and k == k1 else 0.0
                                                 for m0, m1, k, k1, s in zip(D["MASS"][:-1], D["MASS"][1:], D["K"][:-1], D["K"][1:],
                                                                             [RM.STAGES[int(k)] for k in D["K"][:-1]])])])
    NS["ROCSIM_DATA"] = D
    return D


def hermite(T, R, V, tq):
    tq = np.atleast_1d(tq)
    i = np.clip(np.searchsorted(T, tq, side='right') - 1, 0, len(T) - 2)
    t0 = T[i]; h = T[i + 1] - t0; s = np.clip((tq - t0) / np.where(h > 0, h, 1), 0, 1)[:, None]
    h = h[:, None]
    h00 = 2 * s ** 3 - 3 * s ** 2 + 1; h10 = s ** 3 - 2 * s ** 2 + s; h01 = -2 * s ** 3 + 3 * s ** 2; h11 = s ** 3 - s ** 2
    r = h00 * R[i] + h10 * h * V[i] + h01 * R[i + 1] + h11 * h * V[i + 1]
    dh00 = 6 * s ** 2 - 6 * s; dh10 = 3 * s ** 2 - 4 * s + 1; dh01 = -6 * s ** 2 + 6 * s; dh11 = 3 * s ** 2 - 2 * s
    v = (dh00 * R[i] + dh01 * R[i + 1]) / np.where(h > 0, h, 1) + dh10 * V[i] + dh11 * V[i + 1]
    return r, v


def held(T, X, tq):
    i = np.clip(np.searchsorted(T, np.atleast_1d(tq), side='right') - 1, 0, len(T) - 1)
    return X[i] if not isinstance(X, list) else [X[j] for j in i]


def timeline(segs):
    out = []
    for t0, t1, w in segs:
        n = max(1, int(round((t1 - t0) / w * FPS)))
        out.append(t0 + (t1 - t0) * np.arange(n) / n)
    out.append([segs[-1][1]])
    return np.concatenate(out)


def unit(x):
    n = np.linalg.norm(x); return x / n if n > 0 else x


def mat_to_quat(Rm):
    return Matrix([list(Rm[0]), list(Rm[1]), list(Rm[2])]).to_quaternion()


def quat_series(mats):
    qs = []; qp = None
    for Rm in mats:
        q = mat_to_quat(Rm)
        if qp is not None and q.dot(qp) < 0: q = -q
        qs.append([q.w, q.x, q.y, q.z]); qp = q
    return np.array(qs)


def body_matrix(z, ref):
    z = unit(z); x = ref - (ref @ z) * z
    if np.linalg.norm(x) < 1e-6: x = np.cross(z, [0, 0, 1.0])
    x = unit(x); y = np.cross(z, x)
    return np.array([x, y, z]).T


def attitude_series(D, tf, frame_of):
    """yakıştan 10 dk önce yakış yönüne döner, süzülmede 1.5°/s ile sınırlı dönüş"""
    E = D["E"]
    rg, vg = hermite(D["T"], D["RG"], D["VG"], tf)
    thr = held(D["T"], D["THR"], tf); U = held(D["T"], D["U"], tf)
    burn_idx = np.nonzero(D["THR"] > 0)[0]
    starts = [burn_idx[0]] + [burn_idx[k] for k in range(1, len(burn_idx)) if burn_idx[k] != burn_idx[k - 1] + 1] if len(burn_idx) else []
    b_t = np.array([D["T"][i] for i in starts]); b_u = np.array([D["U"][i] for i in starts])
    mats = []; zprev = None; tprev = None
    for k, t in enumerate(tf):
        if thr[k] > 0:
            z = U[k]
        else:
            j = np.searchsorted(b_t, t)
            if j < len(b_t) and b_t[j] - t < 600.0:
                z = b_u[j]
            else:
                z = frame_of(t, rg[k], vg[k])
        z = unit(np.asarray(z, float))
        if zprev is not None:
            ang = math.acos(max(-1, min(1, z @ zprev)))
            lim = math.radians(1.5) * abs(t - tprev) + 1e-9
            if ang > lim and thr[k] == 0:
                ax = unit(np.cross(zprev, z))
                if np.linalg.norm(ax) > 0:
                    z = np.array(Matrix.Rotation(lim, 3, Vector(ax)) @ Vector(zprev))
        zprev = z; tprev = t
        mats.append(body_matrix(z, unit(rg[k])))
    return mats, thr


def keys(idb, path, frames, vals, index=0, interp=1):
    ad = idb.animation_data or idb.animation_data_create()
    if ad.action is None: ad.action = bpy.data.actions.new(idb.name + "_Anim")
    fc = ad.action.fcurve_ensure_for_datablock(idb, path, index=index)
    fc.keyframe_points.clear(); fc.keyframe_points.add(len(frames))
    co = np.empty(2 * len(frames), np.float32); co[0::2] = frames; co[1::2] = vals
    fc.keyframe_points.foreach_set("co", co)
    fc.keyframe_points.foreach_set("interpolation", np.full(len(frames), interp, np.int32))
    fc.update()
    a_ = ad.action; s_ = ad.action_slot; ad.action = None; ad.action = a_
    if ad.action_slot is None and s_ is not None: ad.action_slot = s_


def key_loc(ob, fr, P):
    for k in range(3): keys(ob, "location", fr, P[:, k], k)


def key_quat(ob, fr, Q):
    ob.rotation_mode = 'QUATERNION'
    for k in range(4): keys(ob, "rotation_quaternion", fr, Q[:, k], k)


def key_scale(ob, fr, S, interp=1):
    for k in range(3): keys(ob, "scale", fr, S[:, k] if S.ndim == 2 else S, k, interp)


def clear_anim(*obs):
    for o in obs:
        if o is not None and o.animation_data: o.animation_data_clear()


def set_curve(obj, pts, scale):
    sp = obj.data.splines[0]; n = len(sp.points); P = np.asarray(pts, float)
    if len(P) != n:
        idx = np.linspace(0, len(P) - 1, n); P = np.stack([np.interp(idx, np.arange(len(P)), P[:, k]) for k in range(3)], 1)
    co = np.ones((n, 4), np.float32); co[:, :3] = P * scale
    sp.points.foreach_set("co", co.ravel()); obj.data.update_tag()


def conic(r, v, mu, n=361, r_max=2.0e6):
    E = engine(); el = E.elements(r, v, mu); e, p = el["e"], el["p"]
    W = unit(el["h"]); Pv = el["evec"] / e if e > 1e-8 else unit(r); Qv = np.cross(W, Pv)
    if e < 1:
        nu = np.linspace(0, 2 * math.pi, n) if p / (1 - e) <= r_max else np.linspace(-math.acos(max(-1, min(1, (p / r_max - 1) / e))), math.acos(max(-1, min(1, (p / r_max - 1) / e))), n)
    else:
        lim = min(math.acos(-1 / e) - 1e-3, math.acos(max(-1, min(1, (p / r_max - 1) / e))))
        nu = np.linspace(-lim, lim, n)
    rr = p / (1 + e * np.cos(nu))
    pts = rr[:, None] * (np.cos(nu)[:, None] * Pv + np.sin(nu)[:, None] * Qv)
    apo = -el["ra"] * Pv if (e < 1 and el["ra"] <= r_max) else None
    return pts, el["rp"] * Pv, apo, el


def bake_earth():
    D = mission(); E = D["E"]; sc = bpy.data.scenes["ROCSIM_Dunya"]; KM = 1e-3
    T = D["T"]; ph = D["PH"]
    t_ins = T[0]; t_ign = next(T[i] for i in range(len(T)) if ph[i] == "TLI"); t_cut = next(T[i] for i in range(len(T)) if ph[i] == "TLI" and D["THR"][i] > 0 and (i + 1 == len(T) or D["THR"][i + 1] == 0)) + 1
    dm = np.linalg.norm(D["RG"] - np.array([E.moon_pos(t) for t in T]), axis=1)
    t_end = T[np.argmax((dm < 15000) & (T > t_ign))]
    t_mcc1 = next(T[i] for i in range(len(T)) if ph[i] == "MCC-1")
    segs = [(t_ins, t_ign - 90, 800.0), (t_ign - 90, t_cut + 90, 15.0), (t_cut + 90, D["t_sep"] + 300, 150.0),
            (D["t_sep"] + 300, t_mcc1 - 600, 12000.0), (t_mcc1 - 600, t_mcc1 + 600, 400.0), (t_mcc1 + 600, t_end, 16000.0)]
    tf = timeline(segs); N = len(tf); fr = np.arange(1, N + 1, dtype=np.float32)
    NS["ROCSIM_TF_EARTH"] = tf
    sc.frame_start, sc.frame_end, sc.render.fps = 1, N, FPS
    Ed = bpy.data.objects["Dunya_E"]; clear_anim(Ed)
    key_quat(Ed, fr, quat_series([E.earth_icrf_to_itrf(t).T for t in tf]))
    Ay = bpy.data.objects["Ay_E"]; clear_anim(Ay)
    key_loc(Ay, fr, np.array([E.moon_pos(t) for t in tf]) * KM)
    key_quat(Ay, fr, quat_series([E.moon_icrf_to_me(t).T for t in tf]))
    S = np.array([unit(E.sun_pos(t)) for t in tf])
    sun = bpy.data.objects["Gunes_E"]; clear_anim(sun)
    key_quat(sun, fr, quat_series([body_matrix(s, np.array([0, 0, 1.0])) for s in S]))
    for mn in ("Dunya_Yuzeyi_E", "Atmosfer_E"):
        nd = bpy.data.materials[mn].node_tree.nodes.get("GunesYonu")
        if nd is not None:
            for k in range(3): keys(bpy.data.materials[mn].node_tree, f'nodes["GunesYonu"].inputs[{k}].default_value', fr, S[:, k])
    rg, vg = hermite(T, D["RG"], D["VG"], tf)
    Ar = bpy.data.objects["Arac"]; clear_anim(Ar); key_loc(Ar, fr, rg * KM)

    def coast_dir(t, r, v):
        rm = E.moon_pos(t); vm = E.moon_vel(t)
        if np.linalg.norm(r - rm) < E.SOI_M: return v - vm
        return v
    mats, thr = attitude_series(D, tf, coast_dir)
    key_quat(Ar, fr, quat_series(mats))
    K = held(T, D["K"], tf)
    fl_k = np.where((thr > 0) & (K == 0), 1.0, 0.001); fl_l = np.where((thr > 0) & (K >= 1), 0.5 + 0.5 * thr, 0.001)
    key_scale(bpy.data.objects["Kademe_Alev"], fr, fl_k, 0)
    if "Lander_E_Alev" in bpy.data.objects: key_scale(bpy.data.objects["Lander_E_Alev"], fr, fl_l, 0)
    stg = bpy.data.objects["Ust_Kademe"]; clear_anim(stg); stg.parent = None; stg.scale = (0.02,) * 3
    sp, sv = hermite(D["ST"], D["SRG"], D["SVG"], np.maximum(tf, D["ST"][0]))
    pos = np.where((tf < D["t_sep"])[:, None], rg, sp)
    key_loc(stg, fr, pos * KM)
    Q = quat_series(mats); i_sep = np.searchsorted(tf, D["t_sep"]); Q[i_sep:] = Q[i_sep]
    key_quat(stg, fr, Q)
    tr = bpy.data.objects["Gecmis_Iz"]; cu = tr.data; cu.splines.clear(); spl = cu.splines.new('POLY')
    P = rg; spl.points.add(len(P) - 1); co = np.ones((len(P), 4), np.float32); co[:, :3] = P * KM; spl.points.foreach_set("co", co.ravel())
    cu.bevel_factor_mapping_end = 'SPLINE'; clear_anim(cu)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); keys(cu, "bevel_factor_end", fr, cum / cum[-1])
    ay_yol = bpy.data.objects.get("Ay_Yolu")
    if ay_yol is None:
        c2 = bpy.data.curves.new("Ay_Yolu", 'CURVE'); c2.dimensions = '3D'; c2.splines.new('POLY'); c2.bevel_depth = 0.25
        ay_yol = bpy.data.objects.new("Ay_Yolu", c2); bpy.data.collections["Yorunge_Cizimleri"].objects.link(ay_yol)
        c2.materials.append(bpy.data.materials["Yorunge_Hedef"]); ay_yol.visible_shadow = False
    tt = np.linspace(t_ins - 86400, t_end + 86400, 400)
    ay_yol.data.splines.clear(); s2 = ay_yol.data.splines.new('POLY'); s2.points.add(len(tt) - 1)
    co = np.ones((len(tt), 4), np.float32); co[:, :3] = np.array([E.moon_pos(t) for t in tt]) * KM; s2.points.foreach_set("co", co.ravel())
    bpy.data.objects["Hedef_GEO"].hide_viewport = bpy.data.objects["Hedef_GEO"].hide_render = True
    th = bpy.data.objects["Takip_Tasiyici"]; clear_anim(th); key_loc(th, fr, rg * KM)
    lv = []
    for k in range(N):
        z = unit(rg[k]); x = unit(vg[k] - (vg[k] @ z) * z); lv.append(np.array([x, np.cross(z, x), z]).T)
    key_quat(th, fr, quat_series(lv))
    i_mid = np.searchsorted(T, D["t_sep"] + 3600)
    hn = unit(np.cross(D["RG"][i_mid], D["VG"][i_mid])); r_arr = E.moon_pos(t_end)
    tc = bpy.data.objects.get("Transfer_Kamera")
    if tc is None:
        tc = bpy.data.objects.new("Transfer_Kamera", bpy.data.cameras.new("Transfer_Kamera")); sc.collection.objects.link(tc)
    tc.data.lens = 30; tc.data.clip_start = 1.0; tc.data.clip_end = 20000
    # Dünya solda, varış anındaki Ay sağda; transfer düzlemine ~20° eğik bakış
    mid = 0.5 * r_arr * KM; zc = unit(0.94 * hn + 0.34 * unit(np.cross(hn, r_arr)))
    loc = mid + zc * 470.0; xc = unit(r_arr - (r_arr @ zc) * zc); yc_ = np.cross(zc, xc)
    tc.location = Vector(loc); tc.rotation_mode = 'QUATERNION'
    tc.rotation_quaternion = mat_to_quat(np.array([xc, yc_, zc]).T)
    tg = bpy.data.objects.get("Yaklasma_Hedef") or bpy.data.objects.new("Yaklasma_Hedef", None)
    if tg.name not in sc.collection.objects: sc.collection.objects.link(tg)
    yk = bpy.data.objects.get("Yaklasma_Kamera")
    if yk is None:
        yk = bpy.data.objects.new("Yaklasma_Kamera", bpy.data.cameras.new("Yaklasma_Kamera")); sc.collection.objects.link(yk)
    yk.data.lens = 35; yk.data.clip_start = 0.01; yk.data.clip_end = 20000
    for c in list(yk.constraints): yk.constraints.remove(c)
    cl = yk.constraints.new('COPY_LOCATION'); cl.target = Ay; cl.use_offset = True
    yk.location = Vector(-hn * 60 + unit(r_arr) * 25)
    tt_ = yk.constraints.new('TRACK_TO'); tt_.target = Ay; tt_.track_axis = 'TRACK_NEGATIVE_Z'; tt_.up_axis = 'UP_Y'
    cams = bpy.data.objects
    sc.timeline_markers.clear()
    f_of = lambda t: int(np.searchsorted(tf, t)) + 1
    for f, c in ((1, cams["Takip_Kamera_E"]), (f_of(t_ign - 60), cams["Takip_Kamera_E"]), (f_of(t_cut + 90), cams["Dunya_Kamera"]),
                 (f_of(D["t_sep"] + 300), tc), (f_of(t_mcc1 - 600), cams["Takip_Kamera_E"]), (f_of(t_mcc1 + 600), tc),
                 (f_of(t_end - 10 * 3600), yk)):
        m = sc.timeline_markers.new(c.name, frame=f); m.camera = c
    sc.camera = cams["Takip_Kamera_E"]
    return dict(frames=N, t0=E.utc_string(tf[0]), t1=E.utc_string(tf[-1]))


def bake_moon():
    D = mission(); E = D["E"]; RM = D["RM"]; sc = bpy.data.scenes["ROCSIM_Yorunge"]
    T = D["T"]; ph = D["PH"]
    dm = np.linalg.norm(D["RG"] - np.array([E.moon_pos(t) for t in T]), axis=1)
    i0 = np.argmax((dm < 15000) & (np.array([p in ("SUZULME",) for p in ph])) & (T > D["t_sep"]))
    t0 = T[i0]
    idx = lambda name: [i for i in range(len(T)) if ph[i] == name]
    t_loi0 = T[idx("LOI")[0]]; t_loi1 = T[idx("LOI")[-1]] + 1
    t_doi0 = T[idx("DOI")[0]]; t_doi1 = T[idx("DOI")[-1]] + 1
    t_pdi = T[idx("PDI")[0]]
    RS = D["RG"] - np.array([E.moon_pos(t) for t in T]); alt = np.linalg.norm(RS, axis=1) - RM.R_SITE
    t_hand = T[np.argmax((T > t_pdi) & (alt < 1.0))]
    segs = [(t0, t_loi0 - 900, 900.0), (t_loi0 - 900, t_loi0 - 60, 60.0), (t_loi0 - 60, t_loi1 + 60, 15.0),
            (t_loi1 + 60, t_doi0 - 300, 900.0), (t_doi0 - 300, t_doi1 + 60, 20.0), (t_doi1 + 60, t_pdi - 120, 180.0),
            (t_pdi - 120, t_hand, 10.0)]
    tf = timeline(segs); N = len(tf); fr = np.arange(1, N + 1, dtype=np.float32)
    NS["ROCSIM_TF_MOON"] = tf
    sc.frame_start, sc.frame_end, sc.render.fps = 1, N, FPS
    rg, vg = hermite(T, D["RG"], D["VG"], tf)
    Mp = np.array([E.moon_pos(t) for t in tf]); Mv = np.array([E.moon_vel(t) for t in tf])
    rs = rg - Mp; vs = vg - Mv
    ev = bpy.data.objects["Evren"]; clear_anim(ev); ev.rotation_mode = 'QUATERNION'; ev.rotation_quaternion = (1, 0, 0, 0)
    key_loc(ev, fr, -rs)
    ay = bpy.data.objects["Ay"]; clear_anim(ay); ay.location = (0, 0, 0)
    key_quat(ay, fr, quat_series([E.moon_icrf_to_me(t).T for t in tf]))
    dn = bpy.data.objects["Dunya"]; clear_anim(dn)
    key_loc(dn, fr, np.array([unit(-m) * 40000.0 for m in Mp]))
    key_quat(dn, fr, quat_series([E.earth_icrf_to_itrf(t).T for t in tf]))
    S = np.array([unit(E.sun_pos(t) - m) for t, m in zip(tf, Mp)])
    for ln in ("Gunes_Y",):
        L = bpy.data.objects[ln]; clear_anim(L); key_quat(L, fr, quat_series([body_matrix(s, np.array([0, 0, 1.0])) for s in S]))
    el_ = bpy.data.objects.get("Dunya_Isigi")
    if el_:
        clear_anim(el_); key_quat(el_, fr, quat_series([body_matrix(unit(-m), np.array([0, 0, 1.0])) for m in Mp]))
    for mn in ("Dunya_Yuzeyi", "Atmosfer"):
        nd = bpy.data.materials[mn].node_tree.nodes.get("GunesYonu")
        if nd is not None:
            nd.inputs[0].default_value, nd.inputs[1].default_value, nd.inputs[2].default_value = S[N // 2]

    def coast_dir(t, r, v):
        return v - E.moon_vel(t)
    mats, thr = attitude_series(D, tf, coast_dir)
    LY = bpy.data.objects["Lander_Y"]; clear_anim(LY); LY.location = (0, 0, 0); LY.scale = (0.001,) * 3
    key_quat(LY, fr, quat_series(mats))
    GY = bpy.data.objects["Gimbal_Y"]; clear_anim(GY); GY.rotation_euler = (0, 0, 0)
    sm = np.convolve(np.pad(thr, (3, 3), mode='edge'), np.ones(7) / 7, 'valid')
    keys(bpy.data.materials["Vakum_Alevi_Y"].node_tree, 'nodes["AlevYogunluk"].inputs[1].default_value', fr, 0.55 * sm)
    keys(bpy.data.materials["Alev_Cekirdek_Y"].node_tree, 'nodes["AlevYogunluk"].inputs[1].default_value', fr, 0.8 * sm)
    heat = np.convolve(np.pad(sm, (40, 0), mode='edge'), np.ones(41) / 41, 'valid')
    keys(bpy.data.materials["Nozul_Niyobyum_Y"].node_tree, 'nodes["IsiGucu"].inputs[1].default_value', fr, 4.0 * heat)
    pl = bpy.data.objects["Alev_Y"]; clear_anim(pl)
    keys(pl, "scale", fr, 0.6 + 0.9 * sm, 2); keys(pl, "scale", fr, 0.8 + 0.6 * sm, 0); keys(pl, "scale", fr, 0.8 + 0.6 * sm, 1)
    yc = bpy.data.objects["Yerel_Cerceve"]; clear_anim(yc); yc.location = (0, 0, 0)
    lv = []
    for k in range(N):
        z = unit(rs[k]); x = unit(vs[k] - (vs[k] @ z) * z); lv.append(np.array([x, np.cross(z, x), z]).T)
    key_quat(yc, fr, quat_series(lv))
    iz = bpy.data.objects["Yorunge_Izi"]; cu = iz.data; cu.splines.clear(); spl = cu.splines.new('POLY'); spl.points.add(N - 1)
    co = np.ones((N, 4), np.float32); co[:, :3] = rs; spl.points.foreach_set("co", co.ravel())
    cu.bevel_factor_mapping_end = 'SPLINE'; clear_anim(cu)
    seg = np.linalg.norm(np.diff(rs, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); keys(cu, "bevel_factor_end", fr, cum / cum[-1])
    cu.bevel_depth = 1.5; clear_anim(iz); iz.hide_viewport = iz.hide_render = False
    for n in ("Baslangic_Yorungesi",):
        o = bpy.data.objects.get(n)
        if o: clear_anim(o); o.hide_viewport = o.hide_render = True
    mk = bpy.data.objects.get("Arac_Isaretci")
    if mk: clear_anim(mk); mk.hide_viewport = mk.hide_render = False; mk.scale = (4.0,) * 3
    osc = bpy.data.objects.get("Anlik_Yorunge_Ay")
    if osc is None:
        c3 = bpy.data.curves.new("Anlik_Yorunge_Ay", 'CURVE'); c3.dimensions = '3D'; s3 = c3.splines.new('POLY'); s3.points.add(360)
        c3.bevel_depth = 1.0; osc = bpy.data.objects.new("Anlik_Yorunge_Ay", c3); bpy.data.collections["Uzay_Cisimleri"].objects.link(osc)
        c3.materials.append(bpy.data.materials["Yorunge_Anlik"]); osc.visible_shadow = False; osc.parent = ev
    cams = bpy.data.objects; sc.timeline_markers.clear()
    f_of = lambda t: int(np.searchsorted(tf, t)) + 1
    plan = [(1, "Y_Kam_C_Uzak"), (f_of(t_loi0 - 900), "Y_Kam_B_Takip"), (f_of(t_loi1 + 60), "Y_Kam_A_Genel"),
            (f_of(t_loi1 + 60) + 150, "Y_Kam_C_Uzak"), (f_of(t_doi0 - 300), "Y_Kam_B_Takip"), (f_of(t_doi1 + 60), "Y_Kam_A_Genel"),
            (f_of(t_pdi - 120), "Y_Kam_D_Fren"), (f_of(t_pdi + 250), "Y_Kam_E_Son")]
    for f, cn in plan:
        m = sc.timeline_markers.new(cn, frame=f); m.camera = cams[cn]
    C = cams["Y_Kam_C_Uzak"]; C.parent = ev; C.location = (0, -9000, 2500); C.data.lens = 35; C.data.clip_start = 50.0
    tgc = cams["Y_Hedef_C"]; tgc.parent = ev; tgc.location = (0, 0, 0)
    for n in ("Y_Kam_B_Takip", "Y_Kam_A_Genel", "Y_Kam_D_Fren", "Y_Kam_E_Son"):
        cams[n].parent = yc
    cams["Y_Kam_A_Genel"].location = (60, -90, 30); cams["Y_Kam_A_Genel"].data.lens = 24
    sc.camera = C
    return dict(frames=N, t0=E.utc_string(tf[0]), t1=E.utc_string(tf[-1]))


def bake_landing():
    D = mission(); E = D["E"]; RM = D["RM"]; M = D["M"]; sc = bpy.data.scenes["ROCSIM"]
    T = D["T"]; ph = D["PH"]
    RS = D["RG"] - np.array([E.moon_pos(t) for t in T]); alt = np.linalg.norm(RS, axis=1) - RM.R_SITE
    i_pdi = ph.index("PDI")
    t_hand = T[np.argmax((np.arange(len(T)) > i_pdi) & (alt < 1.0))]
    t_td = D["touchdown"]["t"]
    tf = np.concatenate([np.arange(t_hand, t_td, 1.0 / FPS), [t_td]]); HOLD = 5 * FPS
    tf = np.concatenate([tf, np.full(HOLD, t_td)]); N = len(tf); fr = np.arange(1, N + 1, dtype=np.float32)
    NS["ROCSIM_TF_LAND"] = tf
    sc.frame_start, sc.frame_end, sc.render.fps = 1, N, FPS
    rg, vg = hermite(T, D["RG"], D["VG"], tf)
    loc = []; Rf_l = []
    for k, t in enumerate(tf):
        s = RM.site_icrf(t); up = unit(s); x = unit(M.dr_axis - (M.dr_axis @ up) * up); y = np.cross(up, x)
        Rf = np.array([x, y, up]); r_s = rg[k] - E.moon_pos(t)
        p = Rf @ (r_s - s); p[2] = np.linalg.norm(r_s) - RM.R_SITE
        loc.append(p * 1000.0); Rf_l.append(Rf)
    loc = np.array(loc)
    H_CG = 2.9
    Ld = bpy.data.objects["Lander"]; clear_anim(Ld); Ld.rotation_mode = 'QUATERNION'
    P = loc.copy(); P[:, 2] += H_CG
    key_loc(Ld, fr, P)
    thr = held(T, D["THR"], tf); U = held(T, D["U"], tf)
    mats = []
    for k in range(N):
        z = Rf_l[k] @ U[k] if thr[k] > 0 else np.array([0, 0, 1.0])
        mats.append(body_matrix(z, np.array([1.0, 0, 0])))
    thr[-HOLD:] = 0
    key_quat(Ld, fr, quat_series(mats))
    Gm = bpy.data.objects["Gimbal"]; clear_anim(Gm); Gm.rotation_euler = (0, 0, 0)
    sm = np.convolve(np.pad(thr, (6, 6), mode='edge'), np.ones(13) / 13, 'valid'); sm[-HOLD:] = 0
    Ld["throttle"] = 0.0; keys(Ld, '["throttle"]', fr, sm)
    keys(bpy.data.materials["Vakum_Alevi"].node_tree, 'nodes["AlevYogunluk"].inputs[1].default_value', fr, 0.55 * sm)
    keys(bpy.data.materials["Alev_Cekirdek"].node_tree, 'nodes["AlevYogunluk"].inputs[1].default_value', fr, 0.8 * sm)
    heat = np.convolve(np.pad(sm, (60, 0), mode='edge'), np.ones(61) / 61, 'valid')
    keys(bpy.data.materials["Nozul_Niyobyum"].node_tree, 'nodes["IsiGucu"].inputs[1].default_value', fr, 4.0 * heat)
    keys(bpy.data.lights["Motor_Isigi"], "energy", fr, 6000 * sm)
    pl = bpy.data.objects["Alev"]; clear_anim(pl)
    keys(pl, "scale", fr, 0.6 + 0.6 * sm, 2); keys(pl, "scale", fr, 0.8 + 0.3 * sm, 0); keys(pl, "scale", fr, 0.8 + 0.3 * sm, 1)
    dust = sm * np.clip((22 - loc[:, 2]) / 18, 0, 1)
    ntd = bpy.data.materials["Regolit_Tozu"].node_tree
    keys(ntd, 'nodes["TozYogunluk"].inputs[1].default_value', fr, np.clip(1.3 * dust, 0, 1))
    keys(ntd, 'nodes["Zaman"].outputs[0].default_value', fr, -fr / FPS * 1.2)
    dz = bpy.data.objects["Toz_Tabakasi"]; clear_anim(dz); key_loc(dz, fr, np.column_stack([loc[:, 0], loc[:, 1], np.zeros(N)]))
    t_mid = t_td
    Rf = Rf_l[-1]; Mp = E.moon_pos(t_mid)
    s_loc = unit(Rf @ (E.sun_pos(t_mid) - Mp)); e_loc = unit(Rf @ (-Mp))
    sun = bpy.data.objects["Gunes"]; clear_anim(sun); sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = mat_to_quat(body_matrix(s_loc, np.array([0, 0, 1.0])))
    eg = bpy.data.objects["Dunya_Gokyuzu"]; clear_anim(eg); eg.location = Vector(e_loc * 50000.0)
    eg.rotation_mode = 'QUATERNION'; eg.rotation_quaternion = mat_to_quat(Rf @ E.earth_icrf_to_itrf(t_mid).T)
    for mn, base in (("Dunya_Yuzeyi_L", "Dunya_Yuzeyi"), ("Atmosfer_L", "Atmosfer")):
        m = bpy.data.materials.get(mn)
        if m is None:
            m = bpy.data.materials[base].copy(); m.name = mn
        nd = m.node_tree.nodes.get("GunesYonu")
        if nd is not None: nd.inputs[0].default_value, nd.inputs[1].default_value, nd.inputs[2].default_value = s_loc
    eg.material_slots[0].link = 'OBJECT'; eg.material_slots[0].material = bpy.data.materials["Dunya_Yuzeyi_L"]
    ea = bpy.data.objects["Dunya_Gokyuzu_Atmosfer"]; ea.material_slots[0].link = 'OBJECT'; ea.material_slots[0].material = bpy.data.materials["Atmosfer_L"]
    cams = bpy.data.objects; sc.timeline_markers.clear()
    # yer kamerası Güneş tarafında (güneyde-batıda): iniş aracı önden aydınlanır, gölgesi kameradan uzağa düşer
    cams["Yer_Kamera"].location = (-72.8, -61.1, 1.2); cams["Yer_Kamera"].data.lens = 50
    cams["Yer_Hedef"].constraints[0].influence = 0.85   # teleobjektif aracı izler
    n_touch = N - HOLD
    for f, cn in ((1, "Takip_Kamera"), (max(2, n_touch - 40 * FPS), "Yer_Kamera"), (max(3, n_touch - 7 * FPS), "Yakin_Kamera")):
        m = sc.timeline_markers.new(cn, frame=f); m.camera = cams[cn]
    sc.camera = cams["Takip_Kamera"]
    sun_el = math.degrees(math.asin(s_loc[2])); earth_el = math.degrees(math.asin(e_loc[2]))
    return dict(frames=N, sun_el=round(sun_el, 2), earth_el=round(earth_el, 2))


def t_of_frame(scene):
    key = {"ROCSIM_Dunya": "ROCSIM_TF_EARTH", "ROCSIM_Yorunge": "ROCSIM_TF_MOON", "ROCSIM": "ROCSIM_TF_LAND"}.get(scene.name)
    tf = NS.get(key) if key else None
    if tf is None: return None
    return float(tf[min(max(scene.frame_current - 1, 0), len(tf) - 1)])


def state_at(t):
    D = mission(); r, v = hermite(D["T"], D["RG"], D["VG"], t)
    i = int(np.clip(np.searchsorted(D["T"], t, side='right') - 1, 0, len(D["T"]) - 1))
    return r[0], v[0], i


def hud_text(t, scene_name):
    D = mission(); E = D["E"]; RM = D["RM"]
    r, v, i = state_at(t); ph = D["PH"][i]
    rm, vm = E.moon_pos(t), E.moon_vel(t); rs = r - rm; vs = v - vm
    near_moon = np.linalg.norm(rs) < E.SOI_M
    if near_moon:
        alt = np.linalg.norm(rs) - (RM.R_SITE if ph in ("PDI", "YAKLASMA", "SON_INIS", "INDI") else E.R_M)
        w = RM.omega_moon(t); vrel = vs - np.cross(w, rs); ref = "Ay"
        el = E.elements(rs, vs, E.MU_M)
    else:
        alt = np.linalg.norm(r) - E.R_E; vrel = v; ref = "Dünya"; el = E.elements(r, v, E.MU_E)
    alt_s = f"{alt:,.1f} km".replace(",", " ") if alt > 5 else f"{alt * 1000:,.0f} m".replace(",", " ")
    m = D["MASS"][i]; thr = D["THR"][i]
    dv = D["DV"][i]
    last = [e for e in D["events"] if e["t"] <= t + 1e-6]
    ev = last[-1]["msg"] if last else ""
    typ = "elips" if el["e"] < 1 else "hiperbol"
    orb = f"a={el['a']:,.0f} km  e={el['e']:.4f}  perij/periselen={el['rp'] - (E.R_M if near_moon else E.R_E):,.0f} km".replace(",", " ")
    lines = [f"ROCSIM  {E.utc_string(t)}",
             f"Faz: {PH_TR.get(ph, ph)}",
             f"{ref}: irtifa {alt_s}   hız {np.linalg.norm(vrel):.3f} km/s",
             f"Anlık yörünge ({ref}, {typ}): {orb}",
             f"Kütle {m:,.0f} kg   itki %{thr * 100:.0f}   toplam Δv {dv * 1000:,.0f} m/s".replace(",", " "),
             f"Son olay: {ev[:80]}"]
    return "\n".join(lines)


def active_camera(sc):
    best = None
    for m in sc.timeline_markers:
        if m.camera is not None and m.frame <= sc.frame_current and (best is None or m.frame > best.frame):
            best = m
    return best.camera if best else sc.camera


def redraw(scene):
    t = t_of_frame(scene)
    if t is None: return
    D = mission(); E = D["E"]
    r, v, i = state_at(t)
    if scene.name == "ROCSIM_Dunya":
        rm, vm = E.moon_pos(t), E.moon_vel(t)
        osc = bpy.data.objects["Anlik_Yorunge"]; mat = bpy.data.materials["Yorunge_Anlik"].node_tree.nodes["Isik"]
        if np.linalg.norm(r - rm) < E.SOI_M:
            pts, peri, apo, el = conic(r - rm, v - vm, E.MU_M, r_max=60000.0); pts = pts + rm; peri = peri + rm
            apo = apo + rm if apo is not None else None; mat.inputs["Color"].default_value = (0.85, 0.4, 1.0, 1); Rb = E.R_M
        else:
            pts, peri, apo, el = conic(r, v, E.MU_E, r_max=1.2e6)
            mat.inputs["Color"].default_value = (0.2, 0.8, 1.0, 1) if el["e"] < 1 else (1.0, 0.45, 0.1, 1); Rb = E.R_E
        set_curve(osc, pts, 1e-3)
        ap = bpy.data.objects["Apoje_Isaret"]; pe = bpy.data.objects["Perije_Isaret"]
        pe.location = Vector(peri * 1e-3); bpy.data.objects["Perije_Yazi"].data.body = f"Pe {(el['rp'] - Rb):,.0f} km".replace(",", " ")
        if apo is not None:
            ap.hide_viewport = ap.hide_render = False; ap.location = Vector(apo * 1e-3)
            bpy.data.objects["Apoje_Yazi"].data.body = f"Ap {(el['ra'] - Rb):,.0f} km".replace(",", " ")
        else:
            ap.hide_viewport = ap.hide_render = True
        bpy.data.objects["Apoje_Yazi"].hide_viewport = bpy.data.objects["Apoje_Yazi"].hide_render = ap.hide_render
        cam = active_camera(scene)
        # takip kamerası araca bağlı: frame_change_pre'de matrix_world bir kare geride kalır, ebeveynden karar ver
        close = cam is not None and ((cam.parent is not None and cam.parent.name == "Takip_Tasiyici")
                                     or (cam.matrix_world.translation - Vector(r * 1e-3)).length < 5.0)
        osc.data.bevel_depth = 0.006 if close else 0.12
        bpy.data.objects["Gecmis_Iz"].data.bevel_depth = 0.004 if close else 0.25
        mk = bpy.data.objects.get("Arac_Isaret")
        if mk is not None:
            mk.hide_viewport = mk.hide_render = close
            if cam is not None and not close:
                # işaretçi: kameraya uzaklıkla ölçeklenir (ekranda ~0.4°), fiziksel boyut değil
                dcam = (cam.matrix_world.translation - Vector(r * 1e-3)).length
                ps = mk.parent.matrix_world.to_scale()[0] if mk.parent else 1.0
                mk.scale = (max(3.0, 0.0035 * dcam / (0.24 * ps)),) * 3
        ks = bpy.data.objects["Kademe_Yorunge"]
        if t > D["t_sep"] and not close:
            sp, sv = hermite(D["ST"], D["SRG"], D["SVG"], t)
            set_curve(ks, conic(sp[0], sv[0], E.MU_E, r_max=1.2e6)[0], 1e-3); ks.hide_viewport = ks.hide_render = False
        else:
            ks.hide_viewport = ks.hide_render = True
        earth_labels(scene, cam, r, rm, close, osc, ks, pe, ap)
        hud = bpy.data.objects.get("HUD_E")
    elif scene.name == "ROCSIM_Yorunge":
        rm, vm = E.moon_pos(t), E.moon_vel(t)
        pts, peri, apo, el = conic(r - rm, v - vm, E.MU_M, r_max=40000.0)
        osc = bpy.data.objects.get("Anlik_Yorunge_Ay")
        if osc: set_curve(osc, pts, 1.0)
        cam = active_camera(scene)
        near = cam is not None and cam.matrix_world.translation.length < 50.0
        for n_ in ("Yorunge_Izi", "Anlik_Yorunge_Ay", "Arac_Isaretci"):
            o_ = bpy.data.objects.get(n_)
            if o_: o_.hide_viewport = o_.hide_render = near
        if cam is not None and not near:
            dc = cam.matrix_world.translation.length
            if osc: osc.data.bevel_depth = 0.0010 * dc
            iz_ = bpy.data.objects.get("Yorunge_Izi")
            if iz_: iz_.data.bevel_depth = 0.0014 * dc
            mk_ = bpy.data.objects.get("Arac_Isaretci")
            if mk_: mk_.scale = (0.0025 * dc,) * 3
        hud = bpy.data.objects.get("HUD_Y")
    else:
        hud = bpy.data.objects.get("HUD_L")
    if hud is not None:
        hud.data.body = hud_text(t, scene.name)
        cam = active_camera(scene)
        if cam is not None:
            if hud.parent != cam: hud.parent = cam
            f_ = 0.5 * cam.data.sensor_width / cam.data.lens
            k_ = max(0.5, 3.0 * cam.data.clip_start) / 0.5   # yakın kırpma düzleminin önünde kalsın
            hud.location = (-0.45 * f_ * k_, 0.242 * f_ * k_, -0.5 * k_); hud.data.size = 0.0085 * (f_ / 0.5625) * k_
            hud.rotation_euler = (0, 0, 0); hud.scale = (1, 1, 1)



def earth_labels(scene, cam, r, rm, close, osc, ks, pe, ap):
    """Dünya sahnesi: çizgi kalınlıkları ve etiketler kameraya uzaklıkla ölçeklenir (ekranda sabit boyut)."""
    ob = bpy.data.objects
    if cam is None: return
    cp = cam.matrix_world.translation; up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    dv = (cp - Vector(r * 1e-3)).length
    gi = ob["Gecmis_Iz"]
    far_chase = bool(close and np.linalg.norm(r) > 2.0e4)      # transferde takip kamerası: çizgiler kameranın dibinden geçer, gizle
    for o_ in (osc, gi): o_.hide_viewport = o_.hide_render = far_chase
    if not close:
        osc.data.bevel_depth = max(0.12, 0.0011 * dv); gi.data.bevel_depth = max(0.25, (0.0016 if dv > 150 else 0.0007) * dv)
        ks.data.bevel_depth = max(0.03, 0.0006 * dv)
    ay_yol = ob.get("Ay_Yolu")
    if ay_yol: ay_yol.data.bevel_depth = min(0.25, max(0.03, 0.0009 * (cp - Vector(rm * 1e-3)).length))
    for mk_, yz in ((pe, ob["Perije_Yazi"]), (ap, ob["Apoje_Yazi"])):
        vis = (not close) and not (mk_ is ap and ap.hide_render)
        mk_.hide_viewport = mk_.hide_render = yz.hide_viewport = yz.hide_render = not vis
        if vis:
            d_ = (cp - mk_.matrix_world.translation).length
            mk_.scale = (max(0.2, 0.004 * d_ / 0.5),) * 3
            yz.scale = (0.012 * d_ / mk_.scale[0],) * 3
            for c in yz.constraints:
                if c.type == 'COPY_ROTATION': c.target = cam
    for name, body, cen, R in (("Etiket_Dunya", "Dünya", np.zeros(3), 6.3781), ("Etiket_Ay", "Ay", rm * 1e-3, 1.7374)):
        lb = ob.get(name)
        if lb is None:
            cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.align_x = 'CENTER'; cu.materials.append(bpy.data.materials["Yazi_E"])
            lb = ob.new(name, cu); bpy.data.collections["Yorunge_Cizimleri"].objects.link(lb); lb.visible_shadow = False
        d_ = (cp - Vector(cen)).length
        vis = d_ > 30.0 * R
        lb.hide_viewport = lb.hide_render = not vis
        if vis:
            H = 0.022 * d_
            lb.rotation_mode = 'QUATERNION'; lb.rotation_quaternion = cam.matrix_world.to_quaternion()
            lb.location = Vector(cen) + up * (R + 0.6 * H + 0.012 * d_); lb.scale = (H,) * 3

def rocsim_gorev_handler(scene, depsgraph=None):
    if scene.name in ("ROCSIM_Dunya", "ROCSIM_Yorunge", "ROCSIM"):
        try:
            redraw(scene)
        except Exception as ex:
            print("ROCSIM redraw:", ex)


def setup():
    D = bpy.data
    for tn in ("rocsim_dunya_app.py", "rocsim_hud.py"):
        if tn in D.texts: D.texts[tn].use_module = False
    if "rocsim_gorev_app.py" in D.texts: D.texts["rocsim_gorev_app.py"].use_module = True
    for o in [D.objects["Uydu"]] + list(D.objects["Uydu"].children_recursive):
        o.hide_viewport = o.hide_render = True
    CE = D.collections["Arac_E"]
    if "Lander_E" not in D.objects:
        src = D.objects["Lander_Y"]
        mats = {}
        for mn in ("Vakum_Alevi_Y", "Alev_Cekirdek_Y", "Nozul_Niyobyum_Y"):
            m = D.materials[mn].copy(); m.name = mn.replace("_Y", "_E")
            if m.node_tree.animation_data: m.node_tree.animation_data_clear()
            for nd in m.node_tree.nodes:
                if nd.name == "AlevYogunluk": nd.inputs[1].default_value = 0.6
                if nd.name == "IsiGucu": nd.inputs[1].default_value = 2.5
            mats[mn] = m
        omap = {}
        hier = [src] + list(src.children_recursive)
        for o in hier:
            c = o.copy()
            if c.animation_data: c.animation_data_clear()
            c.name = o.name[:-2] + "_E" if o.name.endswith("_Y") else o.name + "_E"
            CE.objects.link(c); omap[o.name] = c
            for i, sl in enumerate(o.material_slots):
                if sl.material and sl.material.name in mats:
                    c.material_slots[i].link = 'OBJECT'; c.material_slots[i].material = mats[sl.material.name]
        for o in hier:
            if o is not src:
                c = omap[o.name]; c.parent = omap[o.parent.name]; c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        root = omap[src.name]; root.name = "Lander_E"; root.parent = D.objects["Arac_Model"]
        root.matrix_parent_inverse = Matrix.Identity(4); root.location = (0, 0, 3.05); root.rotation_mode = 'QUATERNION'
        root.rotation_quaternion = (1, 0, 0, 0); root.scale = (1, 1, 1)
        omap["Alev_Y"].name = "Lander_E_Alev"
    src = D.objects["HUD_E"]
    for sn, hn in (("ROCSIM_Yorunge", "HUD_Y"), ("ROCSIM", "HUD_L")):
        if hn not in D.objects:
            h = src.copy(); h.data = src.data.copy(); h.name = hn; h.parent = None
            D.scenes[sn].collection.objects.link(h)
    return True


def build_film():
    D = bpy.data; F = D.scenes["ROCSIM_Film"]
    se = F.sequence_editor or F.sequence_editor_create()
    coll = se.strips if hasattr(se, "strips") else se.sequences
    for s_ in sorted(list(coll), key=lambda x: 0 if x.type in ('CROSS', 'TEXT') else 1):
        try:
            coll.remove(s_)
        except Exception:
            pass
    XF = 20; f = 1; prev = None; spans = []
    for i, sn in enumerate(("ROCSIM_Dunya", "ROCSIM_Yorunge", "ROCSIM")):
        sc = D.scenes[sn]; n = sc.frame_end - sc.frame_start + 1
        start = f if prev is None else prev.frame_final_end - XF
        st = coll.new_scene(sn, sc, 1 + i % 2, start); st.frame_final_end = start + n
        if prev is not None:
            try:
                coll.new_effect("Gecis_" + sn, 'CROSS', 3, st.frame_final_start, length=XF, input1=prev, input2=st)
            except TypeError:
                coll.new_effect(name="Gecis_" + sn, type='CROSS', channel=3, frame_start=st.frame_final_start, frame_end=prev.frame_final_end, seq1=prev, seq2=st)
        spans.append((sn, st.frame_final_start, st.frame_final_end)); prev = st
    F.frame_start = 1; F.frame_end = prev.frame_final_end - 1
    return dict(frames=F.frame_end, spans=spans, seconds=round(F.frame_end / FPS, 1))


def bake_all():
    setup()
    out = dict(earth=bake_earth(), moon=bake_moon(), landing=bake_landing())
    out["film"] = build_film()
    return out


def register():
    for lst in (bpy.app.handlers.frame_change_pre, bpy.app.handlers.frame_change_post):
        for h in list(lst):
            if getattr(h, "__name__", "") in ("frame_handler", "rocsim_hud", "rocsim_gorev_handler"):
                lst.remove(h)
    bpy.app.handlers.frame_change_pre.append(rocsim_gorev_handler)


register()
