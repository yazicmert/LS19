# Clarabel (WebAssembly)

Konik optimizasyon çözücüsü [Clarabel](https://github.com/oxfordcontrol/Clarabel.rs) (Goulart & Chen, Oxford; Apache-2.0), `cvxjs` 0.1.4 paketinin hazır
"web" derlemesiyle (wasm-bindgen) olduğu gibi dağıtılır; LS19 hiçbir dosyayı değiştirmez. Lisans metni: `LICENSE` (Apache-2.0, paketten).

Kullanım: `web/js/conic.js` bu dosyaları yükler (tarayıcıda `fetch`, Node'da `initSync`). Problem biçimi:
min ½ xᵀPx + qᵀx  koşul  Ax + s = b, s ∈ K  (K: sıfır, negatif olmayan ve ikinci derece koniler).

| Dosya | Bayt | SHA-256 |
|---|---|---|
| `clarabel_wasm.js` | 15719 | `fef0586cf0ed70c767adfcf695e9f9865479ff1b3f46adf5e16945d6f41f175b` |
| `clarabel_wasm_bg.wasm` | 267685 | `cd8a187b2e22e49740da89cafb6970b16b9fedf887733a6a064a437859ca7caf` |
| `LICENSE` | 11357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |

Yeniden üretmek: `node tools/clarabel_paketle.mjs` (npm'den `cvxjs@0.1.4` indirir).
