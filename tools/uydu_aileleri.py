# LS19 uydu aileleri: Blender'da betikle üretilen düşük poligonlu temsili uydu modelleri (web/models/fam/*.glb).
# Gerçek bir 3B modeli (NASA 3D Resources) bulunmayan on binlerce uydu için: aile başına tek model, tüm uydular
# InstancedMesh ile çizilir. Boyutlar yayımlanmış yaklaşık değerlerdir (metre); ayrıntılar temsilidir.
#
# Kullanım:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/uydu_aileleri.py -- web/models/fam
#
# Eksenler (Blender, Z yukarı): +Z = başucu (Dünya'dan dışa), -Z = nadir (yük/anten yüzü Dünya'ya),
# uçuş yönü = -Y (glTF'te +Z), güneş paneli ekseni = X (yörünge normali). glTF dışa aktarımı Y yukarıya çevirir;
# web tarafı (satmodels.js ile aynı): Y = başucu, Z = hız, X = yörünge normali.
import bpy, bmesh, sys, os, math
from mathutils import Matrix, Vector, Euler

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'web/models/fam'
os.makedirs(OUT, exist_ok=True)

GOLD = (0.80, 0.60, 0.22); GOLD2 = (0.62, 0.45, 0.14); WHITE = (0.86, 0.86, 0.84); GREY = (0.45, 0.46, 0.49); DARK = (0.12, 0.12, 0.14)
CELL = (0.05, 0.09, 0.27); CELL2 = (0.09, 0.15, 0.38); RIB = (0.55, 0.57, 0.62); BLACK = (0.04, 0.04, 0.05); COPPER = (0.72, 0.42, 0.22)


class M:
    """Tek bmesh'te köşe renkli ilkel yapı kutusu."""
    def __init__(self):
        self.bm = bmesh.new(); self.col = self.bm.loops.layers.color.new('Col')

    def _paint(self, faces, c):
        for f in faces:
            for l in f.loops: l[self.col] = (*c, 1.0)

    def _place(self, geom, c, loc, rot):
        T = Matrix.Translation(loc) @ Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=T, verts=[g for g in geom if isinstance(g, bmesh.types.BMVert)])
        self._paint([g for g in geom if isinstance(g, bmesh.types.BMFace)], c)

    def box(self, size, loc, c, rot=(0, 0, 0)):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        bmesh.ops.scale(self.bm, vec=Vector(size), verts=r['verts'], space=Matrix.Identity(4))
        self._place(r['verts'] + list({f for v in r['verts'] for f in v.link_faces}), c, loc, rot)

    def cyl(self, r1, r2, depth, loc, c, rot=(0, 0, 0), seg=12):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
        self._place(res['verts'] + list({f for v in res['verts'] for f in v.link_faces}), c, loc, rot)

    def dish(self, r, loc, c, rot=(0, 0, 0), seg=14):   # sığ çanak: kesik koni
        self.cyl(r, r * 0.12, r * 0.42, loc, c, rot, seg)

    def panel(self, w, l, loc, rot=(0, 0, 0), t=0.03, cells=0):
        """İnce güneş paneli (w × l, kalınlık t); isteğe bağlı kaburga şeritleri."""
        self.box((w, l, t), loc, CELL, rot)
        if cells:
            R = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix().to_4x4()
            for i in range(cells):
                s = -0.5 + (i + 1) / (cells + 1)
                off = R @ Vector((0, s * l, t * 0.55)); self.box((w * 1.01, l * 0.02, t * 0.2), (loc[0] + off.x, loc[1] + off.y, loc[2] + off.z), RIB, rot)

    def export(self, name, extra_scale=1.0):
        mesh = bpy.data.meshes.new(name); self.bm.to_mesh(mesh); self.bm.free()
        for p in mesh.polygons: p.use_smooth = False
        for ca in list(mesh.color_attributes):                         # tek renk özniteliği: dışa aktarıcı ek bir beyaz COLOR_0 üretmesin
            if ca.name != 'Col': mesh.color_attributes.remove(ca)
        mesh.color_attributes.active_color = mesh.color_attributes['Col']; mesh.color_attributes.render_color_index = mesh.color_attributes.find('Col')
        ob = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(ob)
        mat = bpy.data.materials.new(name + '_mat'); mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Metallic'].default_value = 0.25; bsdf.inputs['Roughness'].default_value = 0.5
        mesh.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        path = os.path.join(OUT, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                                  export_vertex_color='ACTIVE', export_materials='EXPORT', export_cameras=False, export_lights=False)
        n = len(mesh.polygons); bpy.data.objects.remove(ob); bpy.data.meshes.remove(mesh)
        print('%-12s %4d yüz  %5.1f kB' % (name, n, os.path.getsize(path) / 1024))


def starlink_v1():
    m = M()
    m.box((2.8, 1.4, 0.16), (0, 0, 0), WHITE)                       # düz panel gövde (anten dizisi nadir yüzde)
    m.box((2.6, 1.25, 0.03), (0, 0, -0.095), DARK)
    m.box((0.5, 0.35, 0.5), (0.0, 0.0, 0.3), GOLD2)                  # itki/aviyonik kutusu (arka)
    m.cyl(0.05, 0.05, 1.0, (0.0, 0.0, 0.15), GREY, (0, 90, 0), 6)    # kol
    m.box((0.16, 0.12, 0.12), (1.5, 0, 0), GREY)
    m.panel(2.8, 8.1, (1.4 + 4.05, 0, 0.05), (0, 0, 90), 0.03, 6)  # tek büyük dizi, X ekseni boyunca (köşede 4,05 m ofset)
    m.export('starlink_v1')


def starlink_v2():
    m = M()
    m.box((4.1, 2.7, 0.2), (0, 0, 0), WHITE)
    m.box((3.8, 2.4, 0.04), (0, 0, -0.12), DARK)
    m.box((0.8, 0.6, 0.7), (0, 0, 0.45), GOLD2)
    for s in (-1, 1):
        m.panel(4.1, 12.8, (s * (2.05 + 6.4), 0, 0.05), (0, 0, 90), 0.04, 8)
        m.box((0.2, 0.2, 0.2), (s * 2.1, 0, 0), GREY)
    m.export('starlink_v2')


def oneweb():
    m = M()
    m.box((1.1, 1.1, 1.3), (0, 0, 0), GOLD)                          # küp gövde, altın folyo
    m.box((1.0, 1.0, 0.04), (0, 0, -0.66), DARK)
    m.cyl(0.35, 0.35, 0.05, (0, 0, 0.67), WHITE)
    for s in (-1, 1):
        m.cyl(0.03, 0.03, 0.6, (s * 0.85, 0, 0.1), GREY, (0, 90, 0), 6)
        m.panel(1.2, 2.2, (s * (0.55 + 0.6 + 1.1), 0, 0.1), (0, 0, 90), 0.025, 3)
    m.export('oneweb')


def kuiper():
    m = M()
    m.box((1.4, 1.4, 0.9), (0, 0, 0), WHITE)
    m.box((1.2, 1.2, 0.04), (0, 0, -0.47), DARK)
    m.box((0.3, 0.3, 0.3), (0, 0, 0.6), GOLD2)
    m.cyl(0.04, 0.04, 0.8, (1.1, 0, 0.1), GREY, (0, 90, 0), 6)
    m.panel(2.6, 5.5, (0.7 + 0.4 + 2.75, 0, 0.1), (0, 0, 90), 0.03, 5)
    m.export('kuiper')


def flatsat():                                                        # Qianfan / Guowang / Hulianwang… düz panelli megakonstelasyon uydusu (temsili)
    m = M()
    m.box((2.2, 1.6, 0.35), (0, 0, 0), GOLD2)
    m.box((2.0, 1.4, 0.04), (0, 0, -0.2), DARK)
    m.box((0.5, 0.4, 0.4), (0, 0, 0.35), WHITE)
    for s in (-1, 1):
        m.cyl(0.04, 0.04, 0.5, (s * 1.35, 0, 0), GREY, (0, 90, 0), 6)
        m.panel(1.6, 4.0, (s * (1.1 + 0.25 + 2.0), 0, 0), (0, 0, 90), 0.03, 4)
    m.export('flatsat')


def cubesat():                                                        # 3U (10×10×34 cm) + iki açılmış panel
    m = M()
    m.box((0.1, 0.1, 0.34), (0, 0, 0), GREY)
    m.box((0.095, 0.095, 0.34), (0, 0, 0), CELL2)
    m.box((0.101, 0.101, 0.02), (0, 0, 0.17), GOLD2)
    for s in (-1, 1):
        m.panel(0.1, 0.34, (s * (0.05 + 0.17), 0, 0), (0, 0, 90), 0.006, 0)
    m.cyl(0.004, 0.004, 0.5, (0.0, 0.0, 0.42), GREY, (0, 0, 0), 4)    # monopol anten
    m.export('cubesat')


def microsat():                                                       # genel küçük uydu (~100-300 kg): küp + iki panel
    m = M()
    m.box((0.7, 0.7, 0.8), (0, 0, 0), GOLD)
    m.box((0.6, 0.6, 0.03), (0, 0, -0.41), DARK)
    m.cyl(0.18, 0.18, 0.04, (0, 0, 0.42), WHITE)
    for s in (-1, 1):
        m.cyl(0.015, 0.015, 0.3, (s * 0.5, 0, 0.1), GREY, (0, 90, 0), 6)
        m.panel(0.8, 1.2, (s * (0.35 + 0.3 + 0.6), 0, 0.1), (0, 0, 90), 0.02, 2)
    m.export('microsat')


def iridium():                                                        # Iridium NEXT: üçgen kesitli gövde, 3 ana misyon anteni, 2 panel
    m = M()
    m.cyl(1.0, 1.0, 3.1, (0, 0, 0), GOLD, (90, 0, 0), 3)             # üçgen prizma
    m.box((2.0, 0.1, 0.8), (0, -1.0, -0.2), WHITE)                    # anten dizisi (uçuş yönü yanları)
    m.box((2.0, 0.1, 0.8), (0, 1.0, -0.2), WHITE)
    m.box((1.0, 1.0, 0.06), (0, 0, -0.9), DARK)
    for s in (-1, 1):
        m.cyl(0.03, 0.03, 0.5, (s * 1.1, 0, 0.3), GREY, (0, 90, 0), 6)
        m.panel(1.1, 3.3, (s * (1.0 + 0.25 + 1.65), 0, 0.3), (0, 0, 90), 0.025, 4)
    m.export('iridium')


def globalstar():                                                     # Globalstar: kutu gövde, 2 panel, nadir anten tablası
    m = M()
    m.box((1.5, 1.2, 0.8), (0, 0, 0), GOLD)
    m.box((1.4, 1.1, 0.04), (0, 0, -0.42), DARK)
    m.box((1.0, 0.8, 0.03), (0, 0, -0.46), WHITE)
    for s in (-1, 1):
        m.cyl(0.025, 0.025, 0.5, (s * 1.0, 0, 0.1), GREY, (0, 90, 0), 6)
        m.panel(1.2, 3.5, (s * (0.75 + 0.5 + 1.7), 0, 0.1), (0, 0, 90), 0.025, 4)
    m.export('globalstar')


def gnss():                                                           # GPS III / BeiDou / Galileo / GLONASS-K sınıfı: dikdörtgen gövde, 2 uzun dizi, nadir L-bant dizisi
    m = M()
    m.box((2.5, 1.8, 3.4), (0, 0, 0), GOLD, (0, 0, 0))
    m.box((2.2, 1.5, 0.05), (0, 0, -1.72), DARK)
    m.cyl(0.9, 0.9, 0.12, (0, 0, -1.8), WHITE, (0, 0, 0), 12)        # L-bant anten tablası
    m.cyl(0.3, 0.3, 0.12, (0.0, 0.0, 1.75), GREY)
    for s in (-1, 1):
        m.cyl(0.04, 0.04, 0.9, (s * 1.7, 0, 0.3), GREY, (0, 90, 0), 6)
        m.panel(2.0, 7.2, (s * (1.25 + 0.9 + 3.6), 0, 0.3), (0, 0, 90), 0.03, 6)
    m.export('gnss')


def bus():                                                            # genel yer gözlem / bilimsel uydu (varsayılan aile)
    m = M()
    m.box((1.6, 1.4, 2.0), (0, 0, 0), GOLD)
    m.box((1.4, 1.2, 0.05), (0, 0, -1.03), DARK)
    m.dish(0.45, (0, 0.7, 0.9), WHITE, (-90, 0, 0))
    m.cyl(0.25, 0.25, 0.3, (0, -0.2, 1.1), GREY)
    for s in (-1, 1):
        m.cyl(0.03, 0.03, 0.6, (s * 1.1, 0, 0.2), GREY, (0, 90, 0), 6)
        m.panel(1.8, 4.2, (s * (0.8 + 0.6 + 2.1), 0, 0.2), (0, 0, 90), 0.03, 5)
    m.export('bus')


def geo():                                                            # yer eşzamanlı haberleşme uydusu: kutu gövde, 2 uzun dizi, 2 yan reflektör, nadir besleme boynuzları
    m = M()
    m.box((2.4, 2.0, 3.2), (0, 0, 0), GOLD)
    m.box((2.2, 1.8, 0.05), (0, 0, -1.62), DARK)
    for s in (-1, 1):
        m.cyl(0.05, 0.05, 1.2, (s * 1.8, 0, 0.2), GREY, (0, 90, 0), 6)
        m.panel(2.6, 9.0, (s * (1.2 + 1.2 + 4.5), 0, 0.2), (0, 0, 90), 0.03, 6)
        m.dish(1.1, (0, s * 1.6, 0.3), WHITE, (-90 * s, 0, 0), 16)
    m.cyl(0.18, 0.5, 0.7, (0, 0, -2.0), WHITE, (0, 0, 0), 8)
    m.export('geo')


for f in (geo, starlink_v1, starlink_v2, oneweb, kuiper, flatsat, cubesat, microsat, iridium, globalstar, gnss, bus):
    f()
