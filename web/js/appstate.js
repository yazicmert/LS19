// Uygulamanın ortak durumu (app.js ve ondan ayrılan modüller aynı nesneyi okur/yazar). Tek yerde ve belgeli: hangi modülün neye bağlı olduğu görünür.
// Yazan: app.js (önyükleme, tasarım, worker iletileri, çalışma alanı geçişleri). Okuyanlar: windowscan.js, profilecompare.js, canvasinput.js.
export const S = {
  K: null,              // yüklenen çekirdekler ve efemeris deposu { spk, pck, eo, eph }
  DESIGN: null,         // geçerli görev tasarımı (design.js)
  START_MS: 0,          // tasarımın başlangıç günü (UTC ms)
  MODE: 'mission',      // çalışan motor: 'mission' (Ay görevi: fizik worker'ı, görev saati) | 'sky' (gerçek saat, uydular, asteroitler)
  VIEW: 'lab',          // görünüm: 'lab' (Laboratuvar) | 'sky' (Canlı Gökyüzü)
  latest: null,         // fizik worker'ından gelen son durum iletisi
  designing: false,     // tasarım sürüyor (bu sırada tarama/karşılaştırma/seçme beklemede)
  running: false,       // görev oynuyor
  // Canlı Gökyüzü katmanları (ilk kullanımda kurulur)
  sats: null, asts: null, astui: null, tracker: null, skyui: null,
};
