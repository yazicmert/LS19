// Arayüz modüllerinin ortak küçük yardımcıları ($ seçici, mk öğe oluşturucu, değişmeyen değeri yeniden yazmayan setText/setWidth, kısa UTC). Tek kaynak:
// $ on, mk beş dosyada aynen yeniden tanımlıydı.
import * as E from './engine.js';

export const $ = (s) => document.querySelector(s);
export const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };   // öğe oluştur: etiket, sınıf, metin
// aynı değeri yeniden yazma: textContent / style atamak, değer aynı olsa da düğümü yeniler ve stil/düzen geçersiz kılar (HUD saniyede 10 kez güncellenir)
export const setText = (el, t) => { if (el._t !== t) { el._t = t; el.textContent = t; } };
export const setWidth = (el, w) => { if (el._w !== w) { el._w = w; el.style.width = w; } };
export const utcShort = (t) => E.utcString(t).slice(0, 16) + ' UTC';
