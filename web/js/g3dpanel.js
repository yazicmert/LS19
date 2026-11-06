// Google 3B karolar ayar paneli (kalkış çubuğundaki "3B şehir" düğmesi): kullanıcının kendi Google Maps Platform anahtarı, aç/kapa, durum.
// Ayarlar google3d.js'te (localStorage); kalkış sürüyorsa değişiklik hemen uygulanır (AscentView.setGoogle3D).
import { g3dSettings, saveG3dSettings, g3dUsable, G3D_ENABLED } from './google3d.js';
import { t } from './i18n.js';

export function initG3dPanel(world) {
  const btn = document.querySelector('[data-g3d]'), P = document.getElementById('g3dPanel');
  if (!btn || !P) return;
  if (!G3D_ENABLED) return;                                                       // pasif: düğme gizli kalır (index.html'de hidden)
  btn.closest('.ascbtns').hidden = false;
  const key = P.querySelector('#g3dKey'), on = P.querySelector('#g3dOn'), st = P.querySelector('#g3dStatus');
  const sync = () => { const s = g3dSettings(); key.value = s.key; on.checked = s.on; btn.classList.toggle('on', g3dUsable(s)); };
  const say = (msg) => { st.textContent = t(msg); };
  const open = (v) => { P.hidden = !v; btn.setAttribute('aria-expanded', v ? 'true' : 'false'); if (v) { sync(); status(world.asc && world.asc.g3d); } };
  const status = (g) => {
    if (!g) return say(world.asc ? (g3dUsable() ? 'Hazırlanıyor…' : 'Kapalı') : 'Kalkış canlandırmasında kullanılır.');
    if (g.status === 'ready') return say('Google 3B karoları çiziliyor.');
    if (g.status === 'error') return say(g.msg || 'Google 3B karoları alınamadı');
    if (g.status === 'loading') return say('Google 3B karoları yükleniyor…');
    return say('Kapalı');
  };
  world.onG3dStatus = status;
  btn.addEventListener('click', () => open(P.hidden));
  P.querySelector('#g3dClose').addEventListener('click', () => open(false));
  P.querySelector('#g3dSave').addEventListener('click', () => {
    const s = saveG3dSettings({ key: key.value, on: on.checked && !!key.value.trim() });
    sync(); if (world.asc) world.setGoogle3D(g3dUsable(s)); status(world.asc && world.asc.g3d);
    if (!key.value.trim() && on.checked) say('Önce API anahtarını girin.');
  });
  P.querySelector('#g3dDel').addEventListener('click', () => { saveG3dSettings({ key: '', on: false }); sync(); if (world.asc) world.setGoogle3D(false); say('Anahtar silindi.'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !P.hidden) { open(false); e.stopPropagation(); } });   // uygulamanın Esc'si (Laboratuvar'a dön) çalışmasın
  sync();
}
