# LS19 DAMIT asteroit şekilleri: DAMIT (Database of Asteroid Models from Inversion Techniques, CC BY 4.0) tam dökümünden
# veri kümemizdeki asteroitler için en iyi şekil modelini seçer, ≤ MAXF üçgene sadeleştirir, hacim eşdeğeri yarıçap 1'e ölçekler,
# int16/uint16 nicemleyip parçalara (shard) bölerek gzip'ler: web/models/ast/damit/damit_NNN.bin.gz + damit.json (indeks).
#
# Girdi: DAMIT dökümü (https://damit.cuni.cz/projects/damit/exports → damit-*.tar.gz) şu şekilde açılmış olmalı:
#   tar xzf damit-*.tar.gz --include='*/tables/*.csv' --include='*/shape.txt'
# Kullanım:
#   Blender --background --python tools/damit_paketle.py -- <damit-*/ klasörü> <asteroit listesi.txt (satır başına SBDB des)> web/models/ast
# Kayıt biçimi (shard içinde, indeksteki ofsetten): int16[nv*3] köşe (birim = 1/8000 yarıçap), uint16[nf*3] yüz (saat yönünün tersi, dışa bakar).
import bpy, bmesh, sys, os, csv, json, gzip, math, struct
import numpy as np

A = sys.argv[sys.argv.index('--') + 1:]
SRC, LIST, OUT = A[0], A[1], A[2]
MAXF, SHARD, Q = 800, 60, 8000.0
os.makedirs(os.path.join(OUT, 'damit'), exist_ok=True)

want = {l.strip() for l in open(LIST) if l.strip()}
nasa = set(json.load(open(os.path.join(OUT, 'katalog.json')))) if os.path.exists(os.path.join(OUT, 'katalog.json')) else set()
ast = {r['id']: r for r in csv.DictReader(open(os.path.join(SRC, 'tables/asteroids.csv')))}
models = list(csv.DictReader(open(os.path.join(SRC, 'tables/asteroid_models.csv'))))
fl = lambda s, d=None: float(s) if s not in ('', None) else d
best = {}
for m in models:
    a = ast[m['asteroid_id']]; des = a['number'] or a['designation']
    if des not in want or des in nasa: continue
    p = os.path.join(SRC, f"files/asteroid_{m['asteroid_id']}/model_{m['id']}/shape.txt")
    if not os.path.exists(p) or fl(m['lambda']) is None or fl(m['period']) is None: continue
    score = (int(m['nonconvex'] or 0), fl(m['quality_flag'], 0), int(m['calibrated_size'] or 0), m['created'])
    if des not in best or score > best[des][0]: best[des] = (score, m, p)

def read_shape(p):
    L = open(p).read().split()
    nv, nf = int(L[0]), int(L[1]); x = np.array(L[2:], dtype=np.float64)
    return x[:nv * 3].reshape(nv, 3), x[nv * 3:nv * 3 + nf * 3].reshape(nf, 3).astype(np.int64) - 1

def volume(v, f):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6.0

def decimate(v, f):
    me = bpy.data.meshes.new('m'); me.from_pydata(v.tolist(), [], f.tolist()); me.update()
    ob = bpy.data.objects.new('m', me); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    md = ob.modifiers.new('d', 'DECIMATE'); md.ratio = MAXF / len(f)
    bpy.ops.object.modifier_apply(modifier='d')
    v2 = np.array([list(p.co) for p in ob.data.vertices]); f2 = np.array([list(p.vertices) for p in ob.data.polygons if len(p.vertices) == 3])
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return v2, f2

index, recs, skipped = {}, [], 0
for des in sorted(best, key=lambda d: (len(d), d)):
    score, m, p = best[des]
    try:
        v, f = read_shape(p)
        vol = volume(v, f)
        if vol < 0: f = f[:, ::-1]; vol = -vol                                     # yüzleri dışa baktır
        if vol <= 0 or len(f) < 20: skipped += 1; continue
        if len(f) > MAXF:
            v, f = decimate(v, f)
            if volume(v, f) < 0: f = f[:, ::-1]
        req = (3 * abs(volume(v, f)) / (4 * math.pi)) ** (1 / 3)
        vq = np.clip(np.round(v / req * Q), -32767, 32767).astype('<i2')
        if np.abs(v / req).max() * Q > 32767: print('KIRPILDI', des)
        used = np.unique(f); remap = -np.ones(len(v), dtype=np.int64); remap[used] = np.arange(len(used))
        vq, fq = vq[used], remap[f].astype('<u2')
        rec = vq.tobytes() + fq.tobytes()
        eqd = fl(m['equiv_diameter'])
        recs.append((des, rec, [len(vq), len(fq), fl(m['lambda']), fl(m['beta']), fl(m['period']), fl(m['jd0'], 2451545.0), fl(m['phi0'], 0.0), eqd, int(m['calibrated_size'] or 0), int(m['nonconvex'] or 0)]))
    except Exception as e:
        skipped += 1; print('ATLANDI', des, e)

total = 0
for si in range(0, len(recs), SHARD):
    chunk = recs[si:si + SHARD]; blob = bytearray(); name = f'damit_{si // SHARD:03d}.bin.gz'
    for des, rec, meta in chunk:
        index[des] = [si // SHARD, len(blob)] + meta; blob += rec
    data = gzip.compress(bytes(blob), 9, mtime=0); total += len(data)
    open(os.path.join(OUT, 'damit', name), 'wb').write(data)
json.dump({'q': Q, 'shard': SHARD, 'ref': 'DAMIT (Ďurech, Sidorin & Kaasalainen 2010, A&A 513, A46), CC BY 4.0', 'm': index}, open(os.path.join(OUT, 'damit', 'damit.json'), 'w'), separators=(',', ':'))
print('modeller', len(recs), 'atlanan', skipped, 'shard', (len(recs) + SHARD - 1) // SHARD, 'toplam %.1f MB' % (total / 1048576),
      'ortalama üçgen %.0f' % (sum(r[2][1] for r in recs) / max(1, len(recs))))
