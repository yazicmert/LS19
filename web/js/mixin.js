// sınıf yöntemlerini (getter/async dahil) hedef sınıfın prototipine kopyalar: büyük sınıfları (World, UI) dosyalara bölmek için
export function mixin(Target, ...Srcs) {
  for (const S of Srcs) for (const k of Object.getOwnPropertyNames(S.prototype)) if (k !== 'constructor') Object.defineProperty(Target.prototype, k, Object.getOwnPropertyDescriptor(S.prototype, k));
}
