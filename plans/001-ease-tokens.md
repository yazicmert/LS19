# 001 — Add shared easing tokens and use them for hand-typed curves

- **Status**: DONE
- **Commit**: 9bb3264
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (web/css/style.css), ~8 lines

## Problem

The strong ease-out curve is hand-typed in several places, and one component makes its own private token for it:

```css
/* web/css/style.css:59-60 — current (base button) */
... transition: background-color .18s var(--ease), border-color .18s var(--ease), color .18s var(--ease), transform .16s cubic-bezier(.23, 1, .32, 1); }
/* web/css/style.css:115 */ ... transform .2s cubic-bezier(.23, 1, .32, 1); }
/* web/css/style.css:337 */ .tk { --tk-ease: cubic-bezier(.23, 1, .32, 1); }
/* web/css/style.css:439 */ transition: background-color .16s ease, transform .16s cubic-bezier(.23, 1, .32, 1); }
/* web/css/style.css:504 */ .py-main:active { transform: scale(.985); transition: transform .16s cubic-bezier(.23, 1, .32, 1); }
/* web/css/style.css:506 */ ... transition: transform .16s cubic-bezier(.23, 1, .32, 1), background .15s ease; }
```

Every new rule has to copy the curve by hand, and the drawer and in-out curves don't exist as tokens at all.

## Target

`:root` in web/css/style.css gains three tokens next to the existing `--ease`:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Every literal `cubic-bezier(.23, 1, .32, 1)` in style.css becomes `var(--ease-out)`. `.tk { --tk-ease: ... }` becomes `.tk { --tk-ease: var(--ease-out); }`, so its existing uses keep working.

## Repo conventions to follow

- Tokens live in the `:root` block at the top of web/css/style.css (find `--ease: cubic-bezier(.2,.7,.2,1)` and add the new lines directly after it).
- Keep the existing `--ease` token unchanged; it is used widely.

## Steps

1. In web/css/style.css `:root`, add the three tokens above directly after the `--ease:` declaration.
2. Replace each `cubic-bezier(.23, 1, .32, 1)` in web/css/style.css with `var(--ease-out)`; the `--tk-ease` definition becomes `var(--ease-out)`.
3. `grep -n "cubic-bezier(.23" web/css/style.css` must return nothing.

## Boundaries

- web/css/style.css only. Do not touch cinema.css (`--cine-out` is a documented, scoped token) or producer.css.
- Do not change durations or properties.

## Verification

- **Mechanical**: `cd web && npm test` passes. The grep in step 3 is empty.
- **Feel check**: pressing any button still shrinks to 0.97 and springs back with the same curve as before; nothing visibly changes.
- **Done when**: three tokens exist and no literal strong ease-out curve remains in style.css.
