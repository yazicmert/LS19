// Destek (Buy Me a Coffee): kullanıcı varsayılandan farklı bir kurguyu dışa aktardığında ya da paylaştığında, engellemeden bir kez sorulur.
// Düzenleme, dışa aktarım ve paylaşım hiçbir zaman buna bağlı değildir. DESTEK_URL boş ya da geçersizse hiç gösterilmez.
// Sıklık: oturumda en çok bir kez; "Şimdi değil" → 30 gün, "Kahve ısmarla" → 180 gün sorulmaz. Kayıt yalnız bu tarayıcıda ('ls19.support'), sunucuya gitmez.
import { isDefault } from './producer.js';
import { translateText } from './i18n.js';

export const DESTEK_URL = 'https://buymeacoffee.com/yazicmert';
export const destekGecerli = (u) => /^https:\/\/(www\.)?buymeacoffee\.com\/[A-Za-z0-9_-]+\/?$/.test(u || '');
export const DESTEK_ARA = { red: 30, destek: 180 };                            // gün
const KEY = 'ls19.support', GUN = 864e5;
let gosterildi = false;                                                         // bu oturumda soruldu mu

const oku = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const yaz = (k) => { try { localStorage.setItem(KEY, JSON.stringify({ k, t: Date.now() })); } catch (e) { /* özel pencere */ } };

// cut varsayılandan farklıysa, adres geçerliyse, bu oturumda sorulmadıysa ve son seçimin süresi dolduysa
export function destekGerekli(cut, { url = DESTEK_URL, now = Date.now(), kayit = oku(), oturum = gosterildi } = {}) {
  if (!destekGecerli(url) || !cut || isDefault(cut) || oturum) return false;
  const gun = DESTEK_ARA[kayit.k];
  return !(gun && Number.isFinite(kayit.t) && now - kayit.t < gun * GUN);
}
export const destekSoruldu = () => { gosterildi = true; };
export const destekReddet = () => yaz('red');
export function destekAc() { yaz('destek'); window.open(DESTEK_URL, '_blank', 'noopener,noreferrer'); }

// her zaman görünen sakin bağlantı (dışa aktarım ayarları): engellemez, kart sıklığından bağımsız; tıklanınca kart 180 gün sorulmaz. Adres geçersizse null
export function destekBaglantisi() {
  if (!destekGecerli(DESTEK_URL)) return null;
  const a = document.createElement('a'); a.className = 'xp-destek'; a.href = DESTEK_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.textContent = translateText('Kahve ısmarla'); a.title = translateText('LS19’u Buy Me a Coffee’den destekle');
  a.onclick = () => yaz('destek');
  return a;
}
export const DESTEK_METIN = 'LS19’u beğendiysen bir kahve ısmarlayarak geliştirilmesine destek olabilirsin.';

// dışa aktarım "Video hazır" ekranı için kart; gerekmiyorsa null
export function destekKarti(cut) {
  if (!destekGerekli(cut)) return null;
  destekSoruldu();
  const k = document.createElement('div'); k.className = 'destek'; k.setAttribute('role', 'note');
  const p = document.createElement('p'); p.textContent = translateText(DESTEK_METIN);
  const a = document.createElement('a'); a.className = 'destek-git'; a.href = DESTEK_URL; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = translateText('Kahve ısmarla');
  const x = document.createElement('button'); x.type = 'button'; x.className = 'destek-x'; x.textContent = translateText('Şimdi değil');
  a.onclick = () => { yaz('destek'); k.replaceChildren(Object.assign(document.createElement('p'), { textContent: translateText('Teşekkürler! Destek sayfası yeni sekmede açıldı.') })); };
  x.onclick = () => { destekReddet(); k.remove(); };
  const b = document.createElement('div'); b.className = 'destek-b'; b.append(a, x);
  k.append(p, b); return k;
}
