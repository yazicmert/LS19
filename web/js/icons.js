// Basit çizgi simgeleri (SVG, 24x24, currentColor). HTML'de <i data-icon="ad"></i> olarak kullanılır.
const P = {
  play: '<path d="M7 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  rocket: '<path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2.5 3.5M15 16l2.5 3.5M12 16v4"/>',
  satellite: '<path d="M9.5 9.5l5 5"/><rect x="10" y="10" width="4" height="4" transform="rotate(45 12 12)"/><path d="M5 5l3 3-3 3-3-3zM19 13l3 3-3 3-3-3z"/><path d="M16.5 4.5a5 5 0 013 3M16 7a2 2 0 011 1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 3 2.7 15 0 18M12 3c-2.7 3-2.7 15 0 18"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  orbit: '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-20 12 12)"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  back: '<path d="M11 7l-5 5 5 5M18 7l-5 5 5 5"/>',
  fwd: '<path d="M13 7l5 5-5 5M6 7l5 5-5 5"/>',
  now: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9" opacity=".45"/>',
  restart: '<path d="M4 12a8 8 0 108-8H7"/><path d="M8 1L5 4l3 3"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
  shake: '<path d="M3 12h3l2-5 4 10 3-7 2 2h4"/>',
  telescope: '<path d="M4 15l12-6 2 4-12 6z"/><path d="M10 17l-2 5M12 16l2 6"/><path d="M16 9l3-1.5 1.5 3L18 12"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}
export function applyIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.className || ''); });
}
// düğmenin simgesini ve yazısını birlikte değiştir: <button><svg/><span>yazı</span></button>
export function setBtn(btn, name, text) {
  const svg = btn.querySelector('svg.ico'); if (svg) svg.outerHTML = icon(name); else btn.insertAdjacentHTML('afterbegin', icon(name));
  let sp = btn.querySelector('span'); if (!sp) { sp = document.createElement('span'); btn.appendChild(sp); } sp.textContent = text;
}
