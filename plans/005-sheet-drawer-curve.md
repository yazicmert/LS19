# 005 — Phone bottom sheet uses the drawer curve

- **Status**: DONE
- **Commit**: 9bb3264
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (web/css/style.css), 1 declaration

## Problem

```css
/* web/css/style.css:614 (inside the phone media query) — current */
#skyPanel.open, #labPanel.open { top: auto; height: var(--sheet-h, 52dvh); ...; transition: height .22s var(--ease); }
```

The sheet settles after a snap on a generic UI curve. Sheets should use the iOS-like drawer curve. The sheet is dragged by changing its height, with `body.sheet-drag` disabling the transition during the drag. Converting it to transform would be a structural change with layout consequences, so this plan keeps `height` and fixes only the curve and duration.

## Target

```css
transition: height .32s var(--ease-drawer);
```

`--ease-drawer` is `cubic-bezier(0.32, 0.72, 0, 1)` (plan 001; use the literal curve if the token is missing). Drawers may run 200–500 ms.

## Steps

1. Replace `transition: height .22s var(--ease);` in that rule with the target.

## Boundaries

- One declaration. Do not touch the drag JS or `body.sheet-drag`.

## Verification

- **Mechanical**: `cd web && npm test` passes.
- **Feel check**: on a phone viewport (390×844), drag the sheet grip and release between snap points. The sheet glides to its snap point and decelerates with no abrupt stop. During the drag it still follows the finger 1:1.
- **Done when**: the declaration matches the target.
