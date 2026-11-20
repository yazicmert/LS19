// Yapımcı masası, ayrı pencere (yapimci.html): masa bütün pencerede; bölümler, tahmini süre ve oynayan bölüm LS19 sekmesinden gelir (producersync.js PopLink).
// Her düzenleme kaydedilir (localStorage, aynı köken) ve LS19 sekmesine anında gider: fragman oynuyorsa canlı yansır. "Oynat" ve "Önizle" LS19 sekmesinde çalışır.
// LS19 sekmesi yoksa ya da kapanırsa masa yine çalışır (kayıt bu tarayıcıda); bant bunu söyler ve LS19'u açmayı önerir.
import { ProducerDesk } from './producerui.js';
import { PopLink, hasChannel } from './producersync.js';
import { GROUPS, loadCut } from './producer.js';
import { uydum } from './usersat.js';

const mainId = new URLSearchParams(location.search).get('ana');
// LS19 bağlanmadan önce (ya da hiç bağlanmazsa) bölüm listesi: bütün bölümler, yönetmenin başlıkları olmadan
const fallbackChapters = () => GROUPS.map((g) => ({ k: g.k, name: g.name, title: g.title || '', sub: '', live: true }));
let link = null, opened = false;
// kullanıcının uydusu bu pencerede eklenip kaldırılabilir: LS19 sekmesinin listesi gecikebilir, "Uydum" bölümü buradaki kayda göre eklenir ya da çıkarılır
const satFix = (list) => {
  const m = uydum(), has = list.some((c) => c.k === 'uydu'), title = m ? m.ad.toLocaleUpperCase(document.documentElement.lang === 'en' ? 'en' : 'tr') : '';
  if (!m) return has ? list.filter((c) => c.k !== 'uydu') : list;
  if (has) return list.map((c) => (c.k === 'uydu' ? { ...c, title } : c));
  const i = list.findIndex((c) => c.k === 'open'), e = { k: 'uydu', name: 'Uydum', title, sub: '', live: true };
  return [...list.slice(0, i + 1), e, ...list.slice(i + 1)];
};
const proxy = { chapterInfo: () => satFix((link && link.chapters) || fallbackChapters()), estimate: (cut, parts) => (link ? link.estimate(cut, parts) : null) };
const send = (t, o) => { if (link) link.send(t, o); };
const openLS19 = () => { const u = new URL('./', location.href); u.searchParams.set('mode', 'lab'); u.searchParams.set('exp', 'ay'); window.open(u.href, '_blank'); };
const lostBanner = () => desk.setBanner('LS19 penceresi bulunamadı: düzenlemelerin bu tarayıcıya kaydediliyor; oynatmak ve önizlemek için LS19 açık olmalı.', [['LS19’u aç', openLS19]], 'warn');

const desk = new ProducerDesk({
  cinema: proxy, standalone: true,
  onPlay: (cut) => send('play', { cut }),
  onPreview: (cut, k) => send('preview', { cut, k }),
  onChange: (cut) => send('cut', { cut }),
  onExport: (cut) => { send('export', { cut }); desk.say('Video dışa aktarımı LS19 penceresinde açıldı.'); },
});
const open = (cut) => { desk.open(cut || loadCut()); opened = true; };

if (!hasChannel()) { open(); desk.setBanner('Bu tarayıcı pencereler arası bağlantıyı desteklemiyor: düzenlemeler kaydedilir, LS19 sekmesini yenileyince geçerli olur.', [], 'warn'); }
else {
  link = new PopLink(mainId, {
    onInfo: (info) => {
      if (!opened) open(info.cut);                                            // LS19'un kurgusu (paylaşılan bağlantıdan gelmiş olabilir)
      else { desk.chapters = info.chapters; desk.buildChapters(); desk.fill(); }
      desk.setBanner('LS19 penceresine bağlı: değişiklikler anında yansır.', [], 'ok'); setTimeout(() => { if (!link.lost) desk.setBanner(''); }, 3500);
      if (info.state) desk.setNowPlaying(info.state.grp, info.state.on);
    },
    onCut: (cut) => desk.load(cut),
    onEst: () => desk.buildStrip(),
    onState: (st) => desk.setNowPlaying(st.grp, st.on),
    onLost: () => { if (!opened) open(); lostBanner(); desk.setNowPlaying(null, false); },
    onBack: () => { desk.setBanner('LS19 penceresine yeniden bağlandı.', [], 'ok'); send('chapters'); setTimeout(() => { if (!link.lost) desk.setBanner(''); }, 3000); },
  });
  setTimeout(() => { if (!opened) { open(); lostBanner(); } }, 2500);            // LS19 yanıt vermediyse masa yine açılır
}
window.LS19desk = desk;
