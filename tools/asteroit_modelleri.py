# LS19 asteroit şekil modelleri: NASA PDS Küçük Cisimler Düğümü OBJ dosyalarından (uzay aracı ve radar şekil modelleri, kamu malı)
# web/models/ast/<anahtar>.glb + web/models/ast/katalog.json üretir. Her model: ~8 bin üçgene sadeleştirilir, hacim eşdeğeri yarıçap 1'e
# ölçeklenir (çalışma anında asteroidin yarıçapıyla çarpılır), +Z = dönme ekseni (glTF'te +Y).
#
# Kaynak OBJ'ler: sbn.psi.edu/pds/shape-models (Hudson/Lawrence radar, NEAR, Dawn, Rosetta, OSIRIS-REx…); kullanım:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/asteroit_modelleri.py -- <obj klasörü> web/models/ast
import bpy, bmesh, sys, os, json, math

SRC, OUT = sys.argv[sys.argv.index('--') + 1: sys.argv.index('--') + 3]
os.makedirs(OUT, exist_ok=True)
MAXF = 8000
# anahtar (obj dosya adı) -> (SBDB 'des', kaynak/atıf)
MODELS = {
    '1998ky26': ('1998 KY26', 'Ostro vd. radar modeli'), 'apophis': ('99942', 'Brozović vd. 2018 radar modeli'),
    'a153591': ('153591', 'Radar modeli'), 'a52760': ('52760', 'Radar modeli'), 'a8567': ('8567', 'Radar modeli'),
    'ceres': ('1', 'Dawn SPC modeli'), 'geographos': ('1620', 'Hudson & Ostro radar modeli'), 'bennu': ('101955', 'Nolan vd. radar modeli'),
    'lutetia': ('21', 'Rosetta OSIRIS modeli'), 'bacchus': ('2063', 'Benner vd. radar modeli'), 'steins': ('2867', 'Rosetta OSIRIS modeli'),
    'itokawa': ('25143', 'Gaskell Hayabusa modeli'), 'vesta': ('4', 'Dawn modeli'), 'eros': ('433', 'Gaskell NEAR modeli'),
    'toutatis': ('4179', 'Hudson vd. radar modeli'), 'castalia': ('4769', 'Hudson & Ostro radar modeli'), 'golevka': ('6489', 'Hudson vd. radar modeli'),
    'kleopatra': ('216', 'Hudson & Ostro radar modeli'), 'rashalom': ('2100', 'Radar modeli'), 'mithra': ('4486', 'Radar modeli'),
    'nereus': ('4660', 'Brozović vd. radar modeli'), 'sk1992': ('10115', 'Radar modeli'), 'da1950r': ('29075', 'Busch vd. radar modeli (geri yönlü)'),
    'wt24': ('33342', 'Radar modeli'), 'yorp': ('54509', 'Radar modeli'), 'kw4a': ('66391', 'Ostro vd. radar modeli (ana gövde)'),
    'cc1994': ('136617', 'Radar modeli'), 'ce26': ('276049', 'Radar modeli'), 'ev5': ('341843', 'Busch vd. radar modeli'),
}
UZAY = {'ceres', 'lutetia', 'steins', 'itokawa', 'vesta', 'eros'}      # uzay aracı görüntülerinden; diğerleri radar
cat = {}
for key, (des, credit) in MODELS.items():
    p = os.path.join(SRC, key + '.obj')
    if not os.path.exists(p): print('YOK', key); continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=p, forward_axis='Y', up_axis='Z')        # eksenleri değiştirme: gövde çerçevesi korunur
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7); bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    vol = abs(bm.calc_volume(signed=True)); bm.to_mesh(ob.data); n0 = len(bm.faces); bm.free()
    if vol <= 0: print('hacim 0', key); continue
    req = (3 * vol / (4 * math.pi)) ** (1 / 3)                                # hacim eşdeğeri yarıçap (OBJ birimi = km)
    if n0 > MAXF:
        m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = MAXF / n0; bpy.ops.object.modifier_apply(modifier='d')
    ob.data.transform(__import__('mathutils').Matrix.Scale(1 / req, 4))
    for p_ in ob.data.polygons: p_.use_smooth = True
    ob.data.materials.clear()
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    out = os.path.join(OUT, key + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_materials='NONE', export_cameras=False, export_lights=False)
    bb = [max(v.co[i] for v in ob.data.vertices) - min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    cat[des] = {'key': key, 'req_km': round(req, 5), 'tris': len(ob.data.polygons), 'dims': [round(x, 3) for x in bb], 'kaynak': credit, 'yontem': 'uzay' if key in UZAY else 'radar'}
    print('%-10s des=%-10s req=%9.4f km  %5d -> %5d üçgen  %6.1f kB' % (key, des, req, n0, len(ob.data.polygons), os.path.getsize(out) / 1024))
json.dump(cat, open(os.path.join(OUT, 'katalog.json'), 'w'), ensure_ascii=False, indent=1)
