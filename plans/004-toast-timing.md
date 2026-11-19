# 004 — Toasts: 400 ms `ease`, and the telemetry flash enters with ease-out

- **Status**: TODO
- **Commit**: 9bb3264
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (web/css/style.css), 2 rules

## Problem

```css
/* web/css/style.css:554 — current */
.toast { ... transition: opacity .5s var(--ease), transform .5s var(--ease); }
/* web/css/style.css:961 — current (ascent telemetry flash, an entrance) */
.asctele .at-flash { ... transition: opacity .35s ease, transform .35s ease;
```

The app toast runs 500 ms, over the 400 ms toast standard. The telemetry flash is an entrance on a bare `ease` curve, so it starts slowly.

## Target

```css
.toast { ... transition: opacity 400ms ease, transform 400ms ease; }
.asctele .at-flash { ... transition: opacity .25s var(--ease-out), transform .25s var(--ease-out);
```

`--ease-out` is `cubic-bezier(0.23, 1, 0.32, 1)` (plan 001; use the literal curve if the token is missing).

## Steps

1. Edit the `transition` in `.toast` (style.css:554) to the target.
2. Edit the `transition` in `.asctele .at-flash` (style.css:961) to the target. Leave the rest of the declaration unchanged.

## Boundaries

- These two declarations only. Do not change the JS timing that adds or removes `.out`.

## Verification

- **Mechanical**: `cd web && npm test` passes.
- **Feel check**: trigger a toast (for example, copy a share link). It fades out in about 0.4 s with no lingering. During the Moon-mission launch, telemetry flashes pop in crisply rather than drifting.
- **Done when**: both declarations match the target.
