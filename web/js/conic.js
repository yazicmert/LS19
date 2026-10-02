// LS19 konik optimizasyon arayüzü: Clarabel (WebAssembly, web/lib/clarabel/) üzerinde küçük bir problem kurucu.
// Biçim:  min ½xᵀPx + qᵀx   koşul   s = e(x) ∈ K   (e afin ifade; K: sıfır, negatif olmayan ve ikinci derece koniler)
// İfade: c0 + Σ v_j x_j, "terimler" [[j, v], ...] olarak verilir. Koşullar:
//   eq(c0, terimler)           c0 + a·x = 0
//   geq(c0, terimler)          c0 + a·x ≥ 0
//   soc(ifadeT, [ifade1, ...]) t ≥ ‖(e1, e2, …)‖  (her ifade [c0, terimler])
// Yükleme: tarayıcıda/Worker'da fetch, Node'da diskten (initConic ilk çağrıda ortamı kendisi seçer); initConicSync(bytes) eşzamanlı yükler.
import * as W from '../lib/clarabel/clarabel_wasm.js';

let ready = false, loading = null;
const WASM_URL = new URL('../lib/clarabel/clarabel_wasm_bg.wasm', import.meta.url);
export const conicReady = () => ready;
export function initConicSync(bytes) { if (!ready) { W.initSync({ module: bytes }); ready = true; } }
export async function initConic() {
  if (ready) return;
  if (!loading) loading = (async () => {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const [{ readFileSync }, { fileURLToPath }] = await Promise.all([import('node:fs'), import('node:url')]);
      initConicSync(readFileSync(fileURLToPath(WASM_URL)));
    } else { await W.default({ module_or_path: WASM_URL }); ready = true; }
  })();
  await loading;
}

export class Conic {
  constructor(n) { this.n = n; this.q = new Float64Array(n); this.pd = new Float64Array(n); this.eqs = []; this.geqs = []; this.socs = []; }
  cost(j, v) { this.q[j] += v; }
  quad(j, w, ref = 0) { this.pd[j] += w; this.q[j] -= w * ref; }          // + ½ w (x_j − ref)²  (köşegen P)
  eq(c0, terms) { this.eqs.push([c0, terms]); }
  geq(c0, terms) { this.geqs.push([c0, terms]); }
  soc(t, comps) { this.socs.push([t, ...comps]); }
  // satır sırası: sıfır, negatif olmayan, ikinci derece koniler (Clarabel'in beklediği sıra)
  assemble() {
    const rows = [];
    for (const e of this.eqs) rows.push(e);
    for (const e of this.geqs) rows.push(e);
    const dims = []; for (const s of this.socs) { dims.push(s.length); for (const e of s) rows.push(e); }
    const m = rows.length, cols = Array.from({ length: this.n }, () => new Map()), b = new Float64Array(m);
    rows.forEach(([c0, terms], i) => {
      b[i] = c0;                                              // s = e(x) = c0 + a·x  ⇒  A = −a, b = c0
      for (const [j, v] of terms) cols[j].set(i, (cols[j].get(i) || 0) - v);
    });
    const colPtr = new Uint32Array(this.n + 1), rowIdx = [], vals = [];
    for (let j = 0; j < this.n; j++) {
      const ents = [...cols[j].entries()].filter((e) => e[1] !== 0).sort((a, c) => a[0] - c[0]);
      for (const [i, v] of ents) { rowIdx.push(i); vals.push(v); }
      colPtr[j + 1] = rowIdx.length;
    }
    return { m, b, colPtr, rowIdx: Uint32Array.from(rowIdx), vals: Float64Array.from(vals), cone: { zero: this.eqs.length, nonneg: this.geqs.length, soc: dims, exp: 0, power: [] } };
  }
  solve({ maxIter = 200, tol = 1e-9, verbose = false } = {}) {
    if (!ready) throw new Error('Konik çözücü yüklenmedi (initConic)');
    const a = this.assemble();
    const pPtr = new Uint32Array(this.n + 1), pRow = [], pVal = [];
    for (let j = 0; j < this.n; j++) { if (this.pd[j] !== 0) { pRow.push(j); pVal.push(this.pd[j]); } pPtr[j + 1] = pRow.length; }
    const r = W.solve(pPtr, Uint32Array.from(pRow), Float64Array.from(pVal), this.q, a.colPtr, a.rowIdx, a.vals, a.b, this.n, a.m,
      JSON.stringify(a.cone), JSON.stringify({ verbose, max_iter: maxIter, time_limit: 1e10, tol_gap_abs: tol, tol_gap_rel: tol }));
    const status = String(r.status);
    return { status, ok: status === 'optimal', x: r.x ? Float64Array.from(r.x) : null, obj: r.obj_val, iters: r.iterations, ms: r.solve_time * 1000, m: a.m, nnz: a.vals.length };
  }
}
