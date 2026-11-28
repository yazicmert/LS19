'use client';
// renk teması seçici (künye bandında): sistem · açık · koyu. Üç düğme, basılı olan seçili tema (aria-pressed). Görünen seçim ilk boyamadan
// itibaren <html data-theme>'den CSS ile çizilir; aria-pressed hidrasyondan sonra yazılır, böylece sunucu HTML'i ile fark çıkmaz.
// Başka sekmede değişirse (storage olayı) bu sekme de uyar.
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { THEME_KEY, THEMES, readTheme as read, applyTheme as apply } from '@/lib/theme';

// çizilmiş simgeler (14 px, currentColor): yarısı dolu daire (sistem), ışınlı daire (açık), hilal (koyu)
const GLYPH = {
  system: <><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 2.4a5.6 5.6 0 0 0 0 11.2z" fill="currentColor" /></>,
  light: <><circle cx="8" cy="8" r="3" fill="currentColor" /><path d="M8 .8v2.4M8 12.8v2.4M.8 8h2.4M12.8 8h2.4M2.9 2.9l1.7 1.7M11.4 11.4l1.7 1.7M2.9 13.1l1.7-1.7M11.4 4.6l1.7-1.7" stroke="currentColor" strokeWidth="1.5" /></>,
  dark: <path d="M10.6 1.6a6.4 6.4 0 1 0 3.8 9.6A5.4 5.4 0 0 1 10.6 1.6z" fill="currentColor" />,
};

export default function ThemeToggle({ lang }) {
  const L = t(lang).theme;
  const [cur, setCur] = useState(null);
  useEffect(() => {
    setCur(read());
    const on = (e) => { if (e.key === THEME_KEY) { const v = read(); apply(v); setCur(v); } };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  const pick = (v) => {
    try { if (v === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, v); } catch { /* depolama kapalı: seçim yalnız bu sayfada */ }
    apply(v); setCur(v);
  };
  return (
    <div className="thm" role="group" aria-label={L.label}>
      {THEMES.map((v) => (
        <button key={v} type="button" className="thm__b" data-v={v} aria-pressed={cur === null ? undefined : cur === v} aria-label={L[v]} title={L[v]} onClick={() => pick(v)}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">{GLYPH[v]}</svg>
        </button>
      ))}
    </div>
  );
}
