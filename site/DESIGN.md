---
name: lookstar19
description: An open, sourced space library published as numbered circulars.
colors:
  paper: "#f2f4f6"
  paper-2: "#e6e9ed"
  ink: "#0e1216"
  ink-2: "#4b545d"
  hairline: "#c3c9d0"
  cobalt: "#1d3fd6"
  cobalt-deep: "#142d9e"
  on-cobalt: "#ffffff"
  on-cobalt-2: "#c7d2ff"
  cobalt-field: "#1d3fd6"
  sheet: "#ffffff"
  ink-3: "#5b646d"
typography:
  wordmark:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(56px, 11.5vw, 168px)"
    fontWeight: 800
    lineHeight: 0.82
    letterSpacing: "-0.03em"
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(48px, 8.4vw, 116px)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.2vw, 44px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  hook:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(32px, 3.9vw, 54px)"
    fontWeight: 750
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
  data:
    fontFamily: "Fragment Mono, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0px"
spacing:
  gutter: "clamp(16px, 3.2vw, 40px)"
  row: "7px"
  block: "26px"
  section: "clamp(36px, 5vw, 64px)"
components:
  button-ink:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  button-ink-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-cobalt:
    backgroundColor: "{colors.cobalt-field}"
    textColor: "{colors.on-cobalt}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  button-cobalt-hover:
    backgroundColor: "{colors.cobalt-deep}"
  button-paper:
    backgroundColor: "{colors.on-cobalt}"
    textColor: "{colors.cobalt-field}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 18px"
  input-lookup:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "13px 14px"
  flag:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "4px 6px"
  flag-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  masthead:
    backgroundColor: "{colors.cobalt-field}"
    textColor: "{colors.on-cobalt}"
  launch-block:
    backgroundColor: "{colors.cobalt-field}"
    textColor: "{colors.on-cobalt}"
  theme-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.on-cobalt}"
    rounded: "{rounded.none}"
  theme-toggle-pressed:
    backgroundColor: "{colors.on-cobalt}"
    textColor: "{colors.cobalt-field}"
---

# Design System: lookstar19

## Overview

**Creative North Star: "The Circular"**

lookstar19 is set like a minor-planet circular: every page is an issue that opens with a masthead (wordmark, issue number, date) and continues as dense, aligned element blocks and fixed-width columns. The page is a working publication, not a poster of one: navigation, the lookup field and the launch block all sit inside the circular's own grammar.

One saturated cobalt owns whole regions (the masthead band, the next-launch block, the shape-model stage, the primary action), and everything else is near-black ink on a cool print white. Depth comes from rules, never from shadows: a heavy 3px ink rule closes the masthead and opens each section; 1px hairlines separate rows.

**Key Characteristics:**
- Masthead band in cobalt with the mark (a telescope on a ruled base, aimed at a square star), a huge, condensed wordmark and the issue line set in monospace.
- Element blocks: symbol, label, value, unit, right-aligned in tabular figures.
- Rules instead of boxes; rectangles instead of cards; no shadow, glow or rounding anywhere.
- Monospace only for data, measurements, dates and identifiers.

## Colors

The palette is ink, paper and one cobalt. Cobalt is committed: it fills regions, it is not sprinkled.

### Primary
- **Cobalt** (`cobalt`): the masthead band, the next-launch block, the 3D shape stage, primary buttons, links on paper, focus rings and selection (regions through `cobalt-field`, see below). **Cobalt Deep** (`cobalt-deep`) is the primary button's hover.
- **On Cobalt** (`on-cobalt`) for text on cobalt; **On Cobalt 2** (`on-cobalt-2`) for secondary text on cobalt (dates, labels, the T− sign). Never gray on cobalt.
- Cobalt has two roles, one value in light and two in dark. **Cobalt** (`cobalt`) is cobalt as ink: links, symbols, the object in diagrams, timeline marks, focus rings, the sorted column. **Cobalt Field** (`cobalt-field`) is cobalt as a region: the masthead, the launch block, the shape stage, the primary button, the active row in a list, text selection, and the cobalt text on a white button or chip sitting on a field. New CSS picks the token by role: a filled region with white text is always `cobalt-field`.

### Neutral
- **Paper** (`paper`): the page ground, a cool print white. **Paper 2** (`paper-2`): row hover and the footer field.
- **Ink** (`ink`): text, heavy rules, flag fills. **Ink 2** (`ink-2`): secondary text on paper (units, notes, labels).
- **Hairline** (`hairline`): 1px row separators only.
- **Sheet** (`sheet`): the ground of fields and of a box set on the page (lookup field and its list, filter fields, site search, the "Planned next" box): white in light. **Ink 3** (`ink-3`): placeholders.
- On a cobalt field, rules are white at 55% (`--on-cobalt-rule`) and row hairlines white at 28% (`--on-cobalt-hair`).

### Dark theme
The dark theme is a night printing of the same circular, not an inversion: the ground takes the ink's place as a cool near-black, the type becomes cool paper, rules stay "ink" (so they turn light), and cobalt splits in two. It follows the system setting by default; the masthead control (system · light · dark) overrides it and is remembered in the browser (`localStorage` key `ls19-theme`). A script in `<head>` sets `data-theme` on `<html>` before the first paint, so a stored choice never flashes the other theme.

Tokens live in `app/globals.css`: light on `:root` and `:root[data-theme="light"]`; dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under `:root[data-theme="dark"]`. Components only ever read tokens; no colour is written in a component or rule.

| Token | Light | Dark | Dark contrast (WCAG) |
|---|---|---|---|
| `paper` | #f2f4f6 | #0f1318 | ground |
| `paper-2` | #e6e9ed | #181d23 | row hover, footer (one step lighter than the ground) |
| `sheet` | #ffffff | #090c0f | fields (one step darker: the extreme of the scale, as white is in light) |
| `ink` | #0e1216 | #e8ebef | 15.6 on paper, 14.2 on paper-2 |
| `ink-2` | #4b545d | #9aa4ae | 7.4 on paper, 6.7 on paper-2, 7.7 on sheet |
| `ink-3` | #5b646d | #848e99 | 5.9 on sheet (placeholders) |
| `hairline` | #c3c9d0 | #2e353d | 1.5 (separator, not text) |
| `cobalt` | #1d3fd6 | #8ea2ff | 7.8 on paper, 7.1 on paper-2, 8.2 on sheet (links, symbols, focus) |
| `cobalt-field` | #1d3fd6 | #1b39c6 | white on it 8.6; `on-cobalt-2` 5.8 |
| `cobalt-deep` | #142d9e | #2a49e0 | primary-button hover; on a dark ground the hover lightens; white on it 6.7 |
| `on-cobalt` / `on-cobalt-2` | #ffffff / #c7d2ff | same | |

The browser bar (`theme-color`) is the field cobalt in both themes; `color-scheme` follows the theme so native controls, scrollbars and the select popup match. The 3D stages keep their physical light (a warm Sun, a cobalt bounce) and material colours in both themes; only the stage behind them is a token.

### Named Rules
**The One Field Rule.** Cobalt appears as whole fields or as the single primary action in a region; a page never carries scattered cobalt accents on a neutral ground.

**The Paper Is Cool Rule.** The ground stays cool white; warming it toward cream drops the world into the category default.

## Typography

**Display Font:** Archivo (variable width, set condensed for display)
**Body Font:** Archivo at normal width
**Data Font:** Fragment Mono, tabular figures

Archivo's width axis carries the hierarchy: the wordmark is set at width 62, object titles at 64, page titles at 68, section headlines at 70, the hook at 80, labels at 88–90, body at 100. Weight steps are 400 (body), 650–700 (labels, links), 750–800 (display).

### Hierarchy
- **Wordmark** (800, width 62, clamp(56px, 11.5vw, 168px), line-height 0.82): the masthead only; compact pages use clamp(34px, 5vw, 56px).
- **Display** (800, width 64–68, up to 116px): object names and page titles.
- **Hook** (750, width 80, clamp(32px, 3.9vw, 54px), max 17ch): the home page's one-line statement.
- **Headline** (800, width 70, clamp(28px, 3.2vw, 44px)): section titles, always on a 3px ink rule.
- **Body** (400, 17px, line-height 1.55, max 58–80ch).
- **Label** (700, width 90, 15px): element-block captions, field labels, launch-block headings.
- **Data** (Fragment Mono 400, 14–16px; the countdown runs to 64px): values, units, dates, the issue line, flags.

### Named Rules
**The Measured Mono Rule.** Monospace sets only what is measured or identified: numbers, units, dates, designations, the issue line. Prose and class names are never set in mono.

## Layout

A 1280px maximum column with a fluid gutter (clamp(16px, 3.2vw, 40px)). The home lead splits 7/12 (hook, lookup) and 5/12 (next launch); object records split 6/6 (element blocks, shape stage); the launch page splits 5/12 (next launch, sticky) and 7/12 (the list). Below 900px every split stacks; on object pages the shape stage moves above the data. Below 600px the masthead compacts: the language switch moves to the band's top right and the navigation becomes a single scrolling line.

Tables keep their columns and scroll horizontally inside a focusable region rather than reflowing into cards.

### Named Rules
**The Rule Opens The Section Rule.** Every section begins with a 3px ink rule under its heading; nothing else marks a section's start.

## Elevation & Depth

None. The system is flat by conviction: hierarchy comes from rules (3px ink, 2px ink, 1px hairline), from cobalt fields and from type width and weight.

### Named Rules
**The No-Shadow Rule.** No box-shadow, glow or blur anywhere; an element that needs separation gets a rule or an ink border.

## Shapes

Square corners throughout (0px). Borders are 2px ink for controls, fields, the launch block and the shape stage; 1px for flags.

## Components

### Buttons
- **Ink** (`button-ink`): 2px ink border, transparent; fills ink with paper text on hover. Secondary actions such as "Full record".
- **Cobalt** (`button-cobalt`): the primary action on paper ("Open in LS19"); hover deepens to cobalt-deep.
- **Paper** (`button-paper`): the primary action on a cobalt field ("Watch the official stream"); hover turns transparent with white text.
- Icons are drawn SVG arrows and a play triangle (1.6px stroke), placed after the label (before it for play).

### Chips (flags)
- **Flag** (`flag`) / **Flag Ink** (`flag-ink`): small mono labels with a 1px ink border (NEO) or ink fill (Potentially hazardous, PHA).

### Inputs / Fields
- **Lookup** (`input-lookup`): white field, 2px ink border, mono text, cobalt caret; focus turns the border cobalt. Focusing an empty field lists featured objects; typing filters; the active row fills cobalt.

### Navigation
- Text links on the cobalt masthead (600, width 88); the current page and hover are underlined at 2px. The language switch is a bordered mono button that inverts on hover.
- The theme control sits between the site search and the language switch: three square cells in a 1px white frame (system: half-filled circle; light: rayed disc; dark: crescent), each a button with a label in both languages and `aria-pressed`. The chosen cell fills white with a cobalt glyph; it is drawn from `<html data-theme>`, so it is right from the first paint.

### Mark
- A telescope on a tripod standing on a ruled base, aimed along its axis at a star; the tube widens to its hood; the star is a square turned 45° (square corners, like everything else); the base is the circular's section rule. One colour (`currentColor`): white on the cobalt masthead, ink in the footer. Drawn on a 32-unit grid (`components/Mark.jsx`, `public/icon.svg`); legible at 16 px.
- Lockup: the mark sits before the wordmark, its base on the type baseline, its height the wordmark's ascender height (0.74em), 0.16em from the "l". The favicon is the same drawing in white on a cobalt square (the field deepens in a dark browser); `icon-32.png` and the 180 px `apple-touch-icon.png` are rendered from it.

### Element Block (signature)
- Caption in label type on a 2px ink rule, then rows of symbol (mono, cobalt), label (ink-2), value (mono, right-aligned) and unit (ink-2), separated by hairlines. A row whose value is prose rather than a measurement (model method, model source) sets the value in body sans and lets it wrap. On the home lookup the rows print in left to right with a short stagger (clip-path, 0.5s, ease-out-expo); reduced motion shows them at once.

### Uncertainty and provenance
- A measured value's 1σ uncertainty sits on a second line under it (`el__sub`: mono 13px, ink-2, "± 2.0 × 10⁻¹⁰"), never in a tooltip.
- Close approaches are a table (date TDB, au, km, lunar distances, 3σ ±, v rel, time 3σ) with row groups set in label type; impact risk is an element block under a section rule. Every block names its API and retrieval date in the record's source list.
- Launch times appear only as precisely as the source states them (month, quarter, hour, minute); the countdown runs only for a launch whose time is known.

### History timeline (signature)
- A vertical ink line; each entry is date (mono, at the source's precision) · a 9px square · the event in body type with its source in 13px ink-2 below. Mission events (spacecraft, launches, servicing) are cobalt squares and semibold; data events (discovery, observations, solutions, close approaches, Sentry) are ink squares; planned events are hollow cobalt squares with a "planned" flag.
- A ruled "Data as of" row separates the past from what is scheduled or predicted. On phones the date moves above the text and the line runs at the left edge.

### Rocket view
- Rockets are drawn from GCAT dimensions in the same cobalt stage as shape models, but taller (3:4): stacked stage cylinders, cones where the diameter changes, an ogive fairing, boosters around the core, dark engine bells. Neutral colours; the page says "drawn from dimensions".
- The launch record is grouped by year in disclosure rows (newest two open); failures carry an ink flag.
- The Stages block is a list of buttons (`aria-expanded`): the selected stage fills ink with paper text, the stack pulls apart along its axis in the 3D stage (boosters slide outward; others dim to half) and an info panel opens under it on a 2px ink left rule. An ink tool bar under the stage holds "Separate stages / Reassemble" and "Go inside / Back to the stack" (`aria-pressed`); a status line announces the view. State lives in the address (`?stage=1&view=inside&part=engines`). Transitions ease out over about half a second; reduced motion jumps.
- "Go inside" opens a cutaway (a 126° slice facing the viewer) of the selected stage: oxidizer tank pale blue, fuel tank ochre, solid grain tan, common bulkhead copper, lines grey, engines dark metal. Component buttons (1px ink, swatch, pressed = ink fill) and taps in 3D select a part, which glows faintly. The panel carries everything the 3D shows as text.
- Every value row in the panel has a source mark in the symbol column: G for GCAT, 1, 2… for the manufacturer or agency documents listed at the panel's foot with their retrieval date. Where no source describes the layout, the panel says so and the drawing is a generic, labelled schematic.

### Full catalogue
- The 33 shape-model objects stay the curated collection; a ruled banner on their index links to the full JPL catalogue (`/asteroids/all`). The catalogue uses the same filter bar and table, plus a pager (ink buttons, mono "Page n of N"); a text query switches to a two-column list of matches.
- A catalogue object's record is the same record as a shape-model object; where no shape model exists, the right column holds the orbit plan (paper panel, 2px ink border): the orbit projected on the ecliptic with the planets' orbits to scale.
- Satellites follow the same pattern: the 67 with NASA 3D models stay the curated library, a ruled banner links to every satellite in CelesTrak's active set (`/satellites/all`). Text and filters combine there (orbit, country, operator, programme, sun-synchronous, 3D model); model satellites carry a small "3D" flag and open their full page. A catalogue satellite's record (`/sat/[norad]`) is the same record minus the model; the right column holds the Earth orbit plan: the orbit in its own plane, Earth to scale at the focus, a dashed line toward the ascending node, dashed reference rings (2,000 km, GPS, GEO) only where they fit the scale.

### Filter bar
- Sits between a list page's lead and its table, opened by a 2px ink rule. Labelled fields in a wrapping row: a mono search field and native selects (2px ink border, white, drawn chevron; options show counts) and toggle buttons (1px ink border; pressed = ink fill, paper text). Below: the mono "n of total shown" and a cobalt "Clear filters" link only when something is set.
- State lives in the address (`?cls=APO&pha=1`, `?q=falcon`), so a filtered view can be shared; the first render matches the server's unfiltered HTML.
- Sortable column headers are buttons with a drawn chevron and `aria-sort`; the sorted column turns cobalt.

### Site search
- In the masthead's navigation row: a white field with a drawn magnifier and mono text; on phones it takes its own full-width row. The index (`/search.json`) loads on first focus.
- Results open on paper under the field (2px ink border) in groups (asteroids, satellites, pages) with mono numbers and class or orbit codes; the active row fills cobalt. The last row sends the query to the launch list's filter. Arrow keys, Enter and Esc work as in the lookup.

### Variable diagrams (signature)
- Every measured row's label is a button (dotted underline in ink-2, solid cobalt when open). Hover (120 ms intent), focus or tap opens a paper panel under the row: 2px ink border, no shadow, no radius, opened with a 0.18s clip-path reveal (none under reduced motion).
- Inside: a 300 × 150 SVG drawn from the record's own values and to scale (orbits against Earth's orbit or a to-scale Earth, angles against their reference plane, durations against a year or a day, sizes and masses against familiar references), then one plain sentence. The value sits top-left in cobalt mono; symbol keys sit along the bottom; no text is drawn over geometry.
- Ink for references (Sun, Earth, ecliptic, equator, Moon), cobalt for the object. The SVG is aria-hidden; the sentence is the button's description. Esc closes and returns focus; only one panel is open at a time.

### Launch Block (signature)
- A cobalt field with a 2px ink border: heading on a white hairline, a large mono countdown (T− in on-cobalt-2), the mission name, a key/value list, the paper button, and a link to all launches.

### Launch record
- Each upcoming launch has its own record (`/launches/[id]`) set like an object record: display title (the mission, or "<vehicle> launch" when the payload is not public), status and orbit flags, then element blocks (mission, window, status) beside a launch block for this launch.
- Sections under 3px rules: who is behind it (agency rows in the mission-list grid, with role, type and country flags), target orbit, vehicle with boosters and landings, spacecraft and crew, launch site, programmes, the vehicle's earlier flights (GCAT), objects in orbit after launch (CelesTrak), the source's updates on the timeline, the countdown timeline and links.
- An unannounced payload is said plainly in a 2px ink panel under the title; inferences sit in their own list, each with an ink-bordered "inferred" flag and its source. Nothing guesses the payload. List rows link to the record and carry type, orbit, customer, booster and landing on extra meta lines.

### Statistics (satellite counts)
- `/satellites/stats` opens with stat tiles (label on a 2px ink rule, large mono value, ink-2 line under it) and two tall segmented bars (28px, 2px paper gaps, square ends) for the class shares, each with its table twin.
- The explorer sits under one control row (time step, break down by, series count, chart/table as pressed toggles) and the standard filter bar (year range, country, class, mission, rocket, operator). State lives in the address (`?res=month&by=lv&cc=TR`).
- Stacked bars, at most 24px wide, 2px paper gap between segments, square ends, hairline grid, ink-2 baseline; an incomplete last period is drawn at 45% opacity and flagged. Hover, tap or the arrow keys select a period: a paper band marks it and a sheet tooltip (2px ink border, no shadow) lists every series, value first, with a short line key.
- Categorical series colours are the only place a second hue appears, and only as data: `--series-1` … `--series-7` and a grey `--series-other` in `globals.css`, light and dark steps validated against the paper (adjacent CVD ΔE ≥ 10, normal-vision ΔE ≥ 20). Slot 1 is cobalt. Colour follows the entity (class is fixed: commercial 1, defence 2, civil 3, amateur 4); a ninth series folds into "Other". Text never takes a series colour; a legend is always present and every number is also in a table.

## Do's and Don'ts

### Do:
- **Do** put every measured value in an element block or a table column, right-aligned, with its unit.
- **Do** keep cobalt as whole fields or one primary action per region.
- **Do** close the masthead and open each section with a 3px ink rule.
- **Do** write a source line under every dataset or model.

### Don't:
- **Don't** add shadows, glows, gradients or rounded cards.
- **Don't** set prose, headings or class names in monospace.
- **Don't** warm the paper toward cream or add a second accent color.
- **Don't** place a small label above a heading; the heading carries itself.
- **Don't** use agency logos, seals or insignia as decoration.
