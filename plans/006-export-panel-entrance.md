# 006 — Export panel gets the same entrance as the Producer desk

- **Status**: TODO
- **Commit**: 9bb3264
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (web/css/producer.css), 2 lines

## Problem

The 4K export dialog (`.xpanel` / `.xp-box`, web/css/producer.css:308+) appears with no transition at all. The Producer desk, which opens it, uses:

```css
/* web/css/producer.css:7-8 */
.pd-box { ... animation: pd-in .22s var(--ease) both; }
@keyframes pd-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
```

Because the export dialog appears abruptly, the two dialogs feel like they belong to different products.

## Target

```css
.xpanel:not(.running) .xp-box { animation: pd-in .22s var(--ease) both; }
.xpanel.running .xp-box { animation: none; }
@media (prefers-reduced-motion: reduce) { .xpanel:not(.running) .xp-box { animation-name: pd-fade; } }
```

`pd-fade` comes from plan 003. If it is missing, add `@keyframes pd-fade { from { opacity: 0; } }`. A modal scales from center, which is correct here, so no transform-origin is needed.

## Steps

1. Add the three rules after `.xpanel.running .xp-box { ... }` (producer.css:331).

## Boundaries

- CSS only. Do not change exportui.js.

## Verification

- **Mechanical**: `cd web && npm test` passes.
- **Feel check**: open the desk, then open "4K dışa aktar". The panel rises 8 px and fades in over about 220 ms, identical to the desk. When an export starts, the panel switches to its bottom bar with no re-animation.
- **Done when**: the rules are present and the checks hold.
