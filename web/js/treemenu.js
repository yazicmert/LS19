// Açılır ağaç menüler (alt çubuklar için): ikincil / duruma bağlı denetimler bir düğmenin arkasında, katlanabilir gruplar hâlinde.
//   <div class="tm"> <button class="tm-btn">…<span class="tm-val" data-empty="…"></span></button>
//     <div class="tm-pop" role="menu" hidden> <details open><summary>Grup</summary><div class="tm-sub"> öğeler </div></details> … </div> </div>
// Öğeler sayfadaki mevcut düğme/onay kutularıdır (bağlamalar değişmez). Seçili öğe (.on) tetikleyicideki .tm-val'a yazılır;
// sınıf değişiklikleri MutationObserver ile izlenir, böylece klavye kısayolu ya da kod ile yapılan değişiklikler de yansır.
const FOCUSABLE = 'button:not([disabled]), summary, input:not([disabled])';

function visibleItems(pop) {
  return [...pop.querySelectorAll(FOCUSABLE)].filter((el) => {
    const d = el.closest('details'); if (!d) return true;
    return el.tagName === 'SUMMARY' ? (!d.parentElement.closest('details') || d.parentElement.closest('details').open) : d.open;
  });
}

let openTm = null;
function close(tm, focusBtn = false) {
  if (!tm) return;
  const btn = tm.querySelector('.tm-btn'), pop = tm.querySelector('.tm-pop');
  pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); tm.classList.remove('open');
  if (openTm === tm) openTm = null;
  if (focusBtn) btn.focus();
}
function open(tm, focusFirst = false) {
  if (openTm && openTm !== tm) close(openTm);
  const btn = tm.querySelector('.tm-btn'), pop = tm.querySelector('.tm-pop');
  pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); tm.classList.add('open'); openTm = tm;
  // ekrandan taşmasın: sağ kenara yakınsa sağa hizala
  pop.classList.remove('right'); const r = pop.getBoundingClientRect();
  if (r.right > window.innerWidth - 8) pop.classList.add('right');
  if (focusFirst) { const cur = pop.querySelector('.on') || visibleItems(pop)[0]; if (cur) cur.focus(); }
}

function syncVal(tm) {
  const val = tm.querySelector('.tm-val'); if (!val) return;
  const src = val.dataset.from ? document.querySelector(val.dataset.from) : null;
  if (src) { val.textContent = src.checked ? val.dataset.on : val.dataset.off; tm.classList.toggle('warn', !src.checked); return; }
  const on = tm.querySelector('.tm-pop .on');
  val.textContent = on ? (on.dataset.short || on.textContent.trim()) : (val.dataset.empty || '—');
  tm.querySelectorAll('.tm-pop [role=menuitemradio]').forEach((b) => b.setAttribute('aria-checked', b.classList.contains('on') ? 'true' : 'false'));
}

export function initTreeMenus(root = document) {
  root.querySelectorAll('.tm').forEach((tm) => {
    const btn = tm.querySelector('.tm-btn'), pop = tm.querySelector('.tm-pop');
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => (pop.hidden ? open(tm) : close(tm)));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); open(tm, true); } });
    // seçim yapan öğeler (radyo gibi) menüyü kapatır; aç/kapa anahtarları ve gruplar açık bırakır
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !pop.contains(b)) return;
      if (!b.hasAttribute('data-keep')) setTimeout(() => close(tm), 0);
    });
    pop.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => syncVal(tm)));
    pop.addEventListener('keydown', (e) => {
      const items = visibleItems(pop), i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(tm, true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && document.activeElement.tagName === 'SUMMARY') {
        e.preventDefault(); document.activeElement.parentElement.open = e.key === 'ArrowRight';
      }
    });
    new MutationObserver(() => syncVal(tm)).observe(pop, { subtree: true, attributes: true, attributeFilter: ['class'] });
    const src = tm.querySelector('.tm-val[data-from]'); if (src) document.querySelector(src.dataset.from).addEventListener('change', () => syncVal(tm));
    syncVal(tm);
  });
  document.addEventListener('pointerdown', (e) => { if (openTm && !openTm.contains(e.target)) close(openTm); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openTm) close(openTm, true); });
}
// kodla değiştirilen onay kutuları (ör. G kısayolu) change olayı üretmez: dışarıdan tazele
export function refreshTreeMenus() { document.querySelectorAll('.tm').forEach(syncVal); }
