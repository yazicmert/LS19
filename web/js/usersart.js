// Kendi uydum: kullanım şartı, biçimler ve arşiv kuralları — tarayıcı (usersat.js, usersatui.js) ve sunucu (api/arsiv.js) aynı metni ve sınırları kullanır.
// Yan etkisi yoktur (DOM, IndexedDB, three.js yok). Metin değişirse SART_SURUM artırılır: arşiv yalnız güncel sürümle onaylanmış modelleri kabul eder.
export const SART_SURUM = '1 · 20 Kasım 2026';
export const KALDIRMA = 'github.com/yazicmert/LS19/issues';
export const SART_METNI = [
  'Yüklediğin CAD çizimi ya da 3B model üzerinde gerekli bütün hakların (telif, lisans, izin) sende olduğunu ya da hak sahibinden izin aldığını beyan edersin.',
  'Başkasının hakkını ihlal eden, gizli, ihracat denetimine tabi ya da hukuka aykırı içerik yüklemezsin; bundan doğan sorumluluk sana aittir.',
  'Bu modelle bir fragman ürettiğinde (videoyu dışa aktardığında) ya da uydunu içeren bir paylaşım bağlantısı oluşturduğunda model, uydunun adı, bu onay ve fragmanın kurgusu LS19 arşivine yüklenir. LS19’un bunları arşivinde süresiz ve ücretsiz olarak saklamasına ve LS19 kapsamında göstermesine izin verdiğini beyan edersin.',
  'Arşivdeki model herkese açık bir adreste durur: paylaşım bağlantısını alan herkes uydunu fragmanda görebilir ve dosyayı indirebilir.',
  `Bu izin münhasır değildir: modelin sahipliği sende kalır, başka yerde dilediğin gibi kullanabilirsin. Arşivden kaldırılmasını ${KALDIRMA} adresinden arşiv kimliğini yazarak isteyebilirsin.`,
  'Fragman bir görselleştirmedir; gerçek bir fırlatma, yörünge ya da uydu kaydı oluşturmaz.',
];
export const SINIR = { bayt: 40e6, zip: 120e6, kayit: 64e3, ucgen: 1.5e6, boyMin: 0.1, boyMax: 120, ad: 40 };
// uzantı → { ad, tür (arşivde içerik türü), cad (STEP/IGES: occt-import-js ile üçgenlenir, web/js/stepworker.js) }. Sıra: zip içinde tercih sırası.
export const BICIMLER = {
  step: { ad: 'STEP', tur: 'model/step', cad: true },
  iges: { ad: 'IGES', tur: 'model/iges', cad: true },
  glb: { ad: 'GLB (glTF ikili)', tur: 'model/gltf-binary' },
  stl: { ad: 'STL', tur: 'model/stl' },
  obj: { ad: 'OBJ', tur: 'model/obj' },
};
const EK = { stp: 'step', igs: 'iges' };
const uzanti = (ad) => { const m = /\.([a-z0-9]+)$/i.exec(ad || ''); return m ? m[1].toLowerCase() : ''; };
export const bicimOf = (ad) => { const e = uzanti(ad), b = EK[e] || e; return Object.hasOwn(BICIMLER, b) ? b : null; };
export const zipMi = (ad) => uzanti(ad) === 'zip';
// CATIA'nın kendi (kapalı) biçimleri: okunamaz; kullanıcıya STEP'e dışa aktarması söylenir
export const catiaMi = (ad) => /^cat(part|product|drawing|shape|analysis|process)$/.test(uzanti(ad)) || uzanti(ad) === 'cgr';
// arşiv yolu: arsiv/<model özeti, 16 onaltılık>/model.<uzantı> ya da meta.json (sunucu rastgele sonek ekler)
export const ARSIV_YOL = /^arsiv\/[0-9a-f]{16}\/(model\.(step|iges|glb|stl|obj)|meta\.json)$/;          // uzantılar BICIMLER ile aynı (test_producer denetler)
// paylaşım bağlantısındaki model adresi yalnız Vercel Blob'un herkese açık deposundan ve arşiv yolundan olabilir
export const arsivAdresi = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(x.hostname) && /^\/arsiv\/[0-9a-f]{16}\/model[^/]*\.(step|iges|glb|stl|obj)$/.test(x.pathname); } catch (e) { return false; } };
