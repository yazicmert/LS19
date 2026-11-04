// Küçük yoğun doğrusal cebir: kısmi pivotlu Gauss yok etmesi (A x = b). Tek kaynak: cr3bp, halo ve design ayrı kopyalar taşıyordu.
// A: satır dizisi (dizi ya da Float64Array), b: dizi; dönüş: Float64Array. Sıfır çarpanlı satır işlemleri atlanır (seyrek Jacobian'larda hızlı).
export function solve(A, b) {
  const n = b.length, M = A.map((r, i) => { const a = new Float64Array(n + 1); for (let k = 0; k < n; k++) a[k] = r[k]; a[n] = b[i]; return a; });
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
