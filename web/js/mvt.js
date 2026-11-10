// Mapbox Vector Tile (MVT 2.1) çözücüsü — bağımlılıksız, yalnız gereken kadar: katmanlar, özellikler, POLYGON geometrisi (dış/iç halkalar).
// Protobuf tel biçimi: varint, 64-bit, uzunluk ön ekli, 32-bit. Kaynak: https://github.com/mapbox/vector-tile-spec (2.1).
// Kullanım: decodeTile(Uint8Array) → { katmanAdı: { extent, features: [{ type, props, rings: [[[x, y], …], …] }] } } (x, y karo biriminde 0…extent).

function Reader(buf) { this.b = buf; this.p = 0; }
Reader.prototype.varint = function () {
  let r = 0, s = 0, b;
  do { b = this.b[this.p++]; if (s < 28) r |= (b & 0x7f) << s; else r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
  return r >>> 0 === r ? r : r;                                     // 2^32'den küçükler için tamsayı
};
Reader.prototype.svarint = function () { const n = this.varint(); return n % 2 ? -(n + 1) / 2 : n / 2; };
Reader.prototype.skip = function (wt) {
  if (wt === 0) this.varint(); else if (wt === 1) this.p += 8; else if (wt === 2) { const l = this.varint(); this.p += l; } else if (wt === 5) this.p += 4; else throw new Error('MVT: bilinmeyen tel türü ' + wt);
};
Reader.prototype.sub = function () { const l = this.varint(), r = new Reader(this.b.subarray(this.p, this.p + l)); this.p += l; return r; };
Reader.prototype.str = function () { const l = this.varint(), s = new TextDecoder().decode(this.b.subarray(this.p, this.p + l)); this.p += l; return s; };
Reader.prototype.packed = function () { const r = this.sub(), out = []; while (r.p < r.b.length) out.push(r.varint()); return out; };

function value(r) {
  let v = null;
  while (r.p < r.b.length) {
    const t = r.varint(), f = t >> 3, w = t & 7;
    if (f === 1) v = r.str();
    else if (f === 2) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
    else if (f === 3) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) v = r.svarint();
    else if (f === 7) v = !!r.varint();
    else r.skip(w);
  }
  return v;
}
// geometri komutları → halkalar (yalnız MoveTo/LineTo/ClosePath; noktalar ve çizgiler de halka dizisi olarak döner)
export function geomRings(cmds) {
  const rings = []; let x = 0, y = 0, cur = null, i = 0;
  while (i < cmds.length) {
    const c = cmds[i++], id = c & 7, n = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < n; k++) {
        const dx = cmds[i++], dy = cmds[i++]; x += dx % 2 ? -(dx + 1) / 2 : dx / 2; y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
        if (id === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]);
      }
    } else if (id === 7) { /* halka kapanır */ } else break;
  }
  return rings;
}
export function decodeTile(buf) {
  const r = new Reader(buf instanceof Uint8Array ? buf : new Uint8Array(buf)), layers = {};
  while (r.p < r.b.length) {
    const t = r.varint();
    if ((t >> 3) !== 3) { r.skip(t & 7); continue; }
    const L = r.sub(), keys = [], vals = [], feats = []; let name = '', extent = 4096;
    while (L.p < L.b.length) {
      const u = L.varint(), f = u >> 3, w = u & 7;
      if (f === 1) name = L.str();
      else if (f === 2) feats.push(L.sub());
      else if (f === 3) keys.push(L.str());
      else if (f === 4) vals.push(value(L.sub()));
      else if (f === 5) extent = L.varint();
      else L.skip(w);
    }
    layers[name] = { extent, features: feats.map((F) => {
      let type = 0, tags = [], geom = [];
      while (F.p < F.b.length) { const u = F.varint(), f = u >> 3, w = u & 7; if (f === 2) tags = F.packed(); else if (f === 3) type = F.varint(); else if (f === 4) geom = F.packed(); else F.skip(w); }
      const props = {}; for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
      return { type, props, rings: geomRings(geom) };
    }) };
  }
  return layers;
}
