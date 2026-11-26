---
version: 1
slug: "site"
primary_target: "site"
related_targets: []
---

# lookstar19 site (site/)

Scope: the lookstar19.org Next.js site, phase 1 (read-only): home, asteroid index + 33 object pages with 3D shape viewer, launch calendar, sources & licenses. EN default, TR complete. Home is Persuade; index/object/launch pages are Read inside the same world.

Audience and job: international space enthusiasts and students who want sourced numbers: look up an object, check the next launch and go to its official stream, open the object in LS19.

Constraints: every page names sources and licenses; no agency logos; no invented claims, users or press; live streams are linked or embedded through the official player, never re-hosted. Code-led (no image generation in this environment); concept roll ran degraded (roll service unreachable, no challengers).

## Direction contract

THESIS: lookstar19 publishes numbered circulars. Every page is an issue: a masthead with issue number and date, then dense element blocks set in fixed-width columns. Refuses the category default: starfield hero with glowing render over a row of feature cards.

OWN-WORLD: cool print white ground, near-black ink, one cobalt blue that owns whole regions (masthead band, primary action, the launch block). Fixed-width numerals and aligned key/value element blocks; heavy 3px ink rule under the masthead, 1px ink rules between rows; rectangular controls with ink borders, no shadows, no glow, no rounded cards. Display: a variable-width grotesk set condensed and bold for numbers and headlines; data in a monospace with tabular figures.

STORY: the visitor understands this is an open, sourced space library tied to a working simulator; believes it because live numbers, real shape models and source lines are on the page; does: looks up an object, follows the next launch to its official stream, opens the object in LS19.

FIRST VIEWPORT: full-width cobalt masthead band (~30% of a desktop viewport; compact on phones, navigation on one scrolling line) with the wordmark set huge and condensed on the left, "Circular No. / date" right, navigation as a text line. Below on white: left 7/12 the one-line hook and the working "find an object" field (focus lists featured objects; typing filters) whose element block prints live; right 5/12 the next-launch ephemeris block on a cobalt field (large T− countdown, vehicle, pad, NET UTC, "Watch the official stream"). The shape-model table starts directly below the lookup record; at 1440×900 the record reaches the fold (the live record is kept whole rather than trimmed to show the next heading).

FORM: Minor Planet Circular / ephemeris typography, candidate 5 of 7 on the grounded list; seed:b9847de2f06bc64e. Signature interaction: the lookup field filters the 33 objects and prints the chosen object's element block instantly, with "Open in LS19". Motion grammar: element rows print in with a short stagger on first paint (reduced-motion: none); the countdown ticks each second in tabular figures.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
