// Küçük 3B vektör ve 3×3 matris yardımcıları (dizi tabanlı: [x, y, z], matris satır dizisi [[..],[..],[..]]).
// Tek kaynak: önceden engine, ascent, attctl, attitude, deflect, pdg, rigidbody, ephem ve ui kendi kopyalarını tanımlıyordu (bkz. docs/kod_denetimi.md).
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
// birim vektör; sıfır vektörde fb verilirse onun kopyası (ör. [0, 0, 1]), yoksa girdinin kopyası
export const unit = (a, fb = null) => { const n = norm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : (fb || a).slice(); };
export const Z_UP = Object.freeze([0, 0, 1]);
export const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
                             M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
                             M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
export const mtv = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2],     // Mᵀ·v
                              M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2],
                              M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
export function mm(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}
export const mT = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
export const D2R = Math.PI / 180;
