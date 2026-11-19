# 003 — Replace the global reduced-motion kill switch with targeted rules

- **Status**: DONE
- **Commit**: 9bb3264
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 files (web/css/style.css, web/css/producer.css), ~10 lines

## Problem

```css
/* web/css/style.css:619 — current */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

This rule wipes out every transition and keyframe, including opacity and colour feedback that helps comprehension: toast fades, hover colours, the saved tick, the cinema overlay fades. cinema.css:154 has a deliberate reduced-motion design ("kaydırma/silme yok, yalnız sönme": no slides or wipes, fades only), and the `!important` rule silently overrides it. The standard is that reduced motion means fewer and gentler animations, not zero: keep opacity and colour, drop movement.

## Target

Delete style.css:619 and replace it with movement-only overrides for the elements that move:

```css
/* web/css/style.css — replaces line 619 */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .toast.out { transform: none; }
  .step.open .sb { animation: rd-fade .18s ease both; }
  .ays .tab.new .sn { animation: none; }
  #skyPanel.open, #labPanel.open { transition: none; }
}
@keyframes rd-fade { from { opacity: 0; } }
```

In web/css/producer.css, keep the desk's entrance as a fade instead of no entrance:

```css
/* web/css/producer.css:305 — current */
@media (prefers-reduced-motion: reduce) { .pd-box, .pdesk.docked .pd-box,  .pd-chbtn > svg, .pd-ch, .pd-switch, .pd-switch::after, .pd-saved { transition: none; } }
/* target */
@media (prefers-reduced-motion: reduce) {
  .pd-box, .pdesk.docked .pd-box, .pdesk.standalone .pd-box { animation-name: pd-fade; }
  .pd-chbtn > svg, .pd-switch::after { transition: none; }
}
@keyframes pd-fade { from { opacity: 0; } }
```

Also: `.pd-toast` (producer.css:384) keeps its opacity transition but drops its translate. Replace `.pd-toast` in that rule's selector list with a separate `.pd-toast { transition-property: opacity; transform: translate(-50%, 0); }`. Leave the checkbox `transition: none` as is: a toggle knob sliding is movement.

The movement rules that already exist stay as they are: style.css:120, :421, :995 and :1044; cinema.css:154 and :218; producer.css:341.

## Repo conventions to follow

- Exemplar: web/css/cinema.css:154-161 keeps fades and drops `transform`/clip wipes under reduced motion. Imitate that intent.

## Steps

1. Delete web/css/style.css:619 and insert the target block in its place.
2. Replace producer.css:305 with the target block.
3. Edit producer.css:384 as described for `.pd-toast`.

## Boundaries

- CSS only. Do not touch JS. Do not remove the existing per-component reduced-motion rules.
- If line numbers drifted, locate the rules by their exact text. If the text differs, STOP and report.

## Verification

- **Mechanical**: `cd web && npm test` passes; `grep -n "animation: none !important" web/css/style.css` is empty.
- **Feel check**: in DevTools → Rendering, emulate `prefers-reduced-motion: reduce`, then:
  - open the Producer desk: it fades in with no slide or scale;
  - trigger a toast: it fades with no vertical shift;
  - hover buttons: colour changes still transition;
  - pressing a button does not scale (style.css:1044 still applies);
  - play the trailer: overlays fade and nothing slides.
- **Done when**: no global `!important` kill remains and the checks above hold.
