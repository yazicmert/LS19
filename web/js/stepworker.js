// Kendi uydum: STEP / IGES (CAD) → üçgen ağ. Ayrı iş parçacığında (klasik worker) çalışır: büyük montajlar sayfayı dondurmasın.
// Dönüştürücü: occt-import-js (OpenCascade, WebAssembly; LGPL-2.1) — web/lib/occt/ (tools/occt_kopyala.mjs). Yalnız bu worker açılınca indirilir.
// Giriş: { bicim: 'step' | 'iges', buf: ArrayBuffer }. Çıkış: { ok, meshes: [{ ad, renk, konum, normal, indis, yuzler: [{ ilk, son, renk }] }] } ya da { ok: false, hata }.
// İnceltme: sınır kutusuna göre (model birimi önemsiz; sahnede gerçek boya ölçeklenir).
const KOK = new URL('../lib/occt/', self.location.href).href;
let occt = null;
self.onmessage = async (ev) => {
  try {
    if (!occt) {
      self.importScripts(KOK + 'occt-import-js.js');
      occt = await self.occtimportjs({ locateFile: (p) => KOK + p });
    }
    const { bicim, buf } = ev.data;
    const r = occt.ReadFile(bicim === 'iges' ? 'iges' : 'step', new Uint8Array(buf), { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.0015, angularDeflection: 0.35 });
    if (!r || !r.success) { self.postMessage({ ok: false, hata: 'cad' }); return; }
    const meshes = [], aktar = [];
    for (const m of r.meshes || []) {
      const konum = new Float32Array(m.attributes.position.array), normal = m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null, indis = new Uint32Array(m.index.array);
      meshes.push({ ad: m.name || '', renk: m.color || null, konum, normal, indis, yuzler: (m.brep_faces || []).filter((f) => f.color).map((f) => ({ ilk: f.first, son: f.last, renk: f.color })) });
      aktar.push(konum.buffer, indis.buffer); if (normal) aktar.push(normal.buffer);
    }
    self.postMessage({ ok: true, meshes }, aktar);
  } catch (e) {
    self.postMessage({ ok: false, hata: String((e && e.message) || e).includes('occtimportjs') ? 'occt' : 'cad' });
  }
};
