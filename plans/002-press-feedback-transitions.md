# 002 — Make press feedback animate on cards and tabs that override `transition`

- **Status**: TODO
- **Commit**: 9bb3264
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Interruptibility
- **Estimated scope**: 1 file (web/css/style.css), 6 rules

## Problem

The global press rule `button:active:not(:disabled) { transform: scale(.97); }` (web/css/style.css:62) relies on the base button transition including `transform .16s`. These button classes redeclare `transition` without `transform`, so on press the element **snaps** to 0.97 and snaps back:

```css
/* web/css/style.css:113 */ #skyPanel > .tabs .tab { ... transition: color .16s ease; }
/* web/css/style.css:680 */ .optcard { ... transition: border-color .15s var(--ease), background-color .15s var(--ease); }
/* web/css/style.css:745 */ .exp { ... transition: border-color .15s var(--ease), background-color .15s var(--ease); }
/* web/css/style.css:789 */ .cacard { ... transition: border-color .15s var(--ease), background-color .15s var(--ease); }
/* web/css/style.css:800 */ .mcard { ... transition: border-color .15s var(--ease), background-color .15s var(--ease); }
/* web/css/style.css:489 */ .py-main { ... transition: background .15s ease; }
/* web/css/style.css:504 */ .py-main:active { transform: scale(.985); transition: transform .16s cubic-bezier(.23, 1, .32, 1); }
```

`.py-main` is the worst: the transform transition exists only while `:active`, so the press animates in but the release snaps back.

## Target

Press feedback is `transform 160ms var(--ease-out)` with `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. The token comes from plan 001; if it is missing, use the literal curve.

```css
#skyPanel > .tabs .tab { ... transition: color .16s ease, transform .16s var(--ease-out); }
.optcard, .exp, .cacard, .mcard { ... transition: border-color .15s var(--ease), background-color .15s var(--ease), transform .16s var(--ease-out); }
.py-main { ... transition: background .15s ease, transform .16s var(--ease-out); }
.py-main:active { transform: scale(.985); }   /* transition moved to the base rule */
```

## Repo conventions to follow

- Exemplar: `.tk button` at web/css/style.css:339 already lists `transform .16s var(--tk-ease)` alongside its color transitions.
- `.mcard` is a `<label>`, not a button, so it gets no press scale today. Add the transform transition anyway: it is harmless and keeps the set consistent. Do not add a new `:active` rule.

## Steps

1. Append `, transform .16s var(--ease-out)` to the `transition` list of each of the six rules listed in Problem.
2. In `.py-main:active`, delete the `transition: ...;` declaration and keep `transform: scale(.985);`.

## Boundaries

- web/css/style.css only. Motion properties only. Do not change scale values.

## Verification

- **Mechanical**: `cd web && npm test` passes.
- **Feel check**: in DevTools, set animation playback to 10%, then press and release a Sky-panel tab, an option card (Ay görevi profile cards), a launch-sequence card and a planner row (`.py-main`). Each one eases down and eases back; none jumps. Pressing the same element rapidly retargets smoothly and never restarts from zero.
- **Done when**: every rule above transitions transform, and `.py-main` animates the release.
