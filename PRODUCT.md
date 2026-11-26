# Product

<!-- impeccable:product-schema 1 -->

This record covers **lookstar19** (lookstar19.org), the space library built around the LS19 simulator. LS19 itself (`web/`) is an existing product with its own interface; its facts appear here only where lookstar19 depends on them.

## Platform

web

## Stack

Next.js (App Router), in `site/` of this repository, deployed as its own Vercel project (root directory `site`) on `lookstar19.org`. Chosen by the owner over plain static HTML and Astro. The LS19 simulator stays a separate, framework-free app (`web/`, plain JS + three.js) on its own deployment.

## Users

Space enthusiasts, students and hobbyist engineers who want technical depth: numbers, sources, orbital elements, real shape models, launch details. International audience first: English is the default language; Turkish is complete and equal in content, second in priority. Later phases add authors (who write technical articles) and reviewers.

## Product Purpose

A non-commercial, walking space library ("ayaklı uzay kütüphanesi"): public space data processed into readable pages, community-written technical articles (each one reviewed before publication), launch tracking that redirects to official live streams, a 3D archive of asteroid shape models, and mission patches earned through contribution. Success: a visitor leaves with a correct, sourced understanding they could not get as quickly elsewhere, and can open the same object in the LS19 simulator.

## Positioning

The library is tied to a working physics simulator: every asteroid, launch and mission page can open the same object, orbit or flight in LS19. Data pages show how public datasets were processed, not only the result.

## Operating Context

- Data sources already used by LS19 (`api/`): CelesTrak, JPL SBDB/Sentry/Horizons, GCAT (J. McDowell, CC BY 4.0), Launch Library 2 (The Space Devs), NASA GIBS.
- Live streams are never re-hosted: pages link to, or embed through the official player of, the provider's own stream.
- Roadmap and decisions: `docs/yol_haritasi.md` (phases 0–6).

## Capabilities and Constraints

- Phase 1 (this release) is read-only: home, asteroid library (33 objects with real shape models), launch calendar, sources and licenses.
- Later: data workshop, accounts (GitHub, Google, passwordless email link), articles with mandatory review, points and mission patches (collection + badges), 3D archive with community models.
- Every page names its sources and licenses. Content whose license cannot be verified is not published.
- No ads, paid tiers or sales.
- Must not imply endorsement by NASA or any agency: no agency logos or seals as decoration.

## Brand Commitments

- Name: **lookstar19** (lowercase), sibling of LS19 ("Look Star 19").
- Voice: technical and plain. Numbers and sources first, no hype; the reader is treated as an intelligent enthusiast.
- Mission patches are original lookstar19 designs (historical missions: the real patch only when its license is verified, otherwise an original "inspired" design without agency marks).

## Evidence on Hand

- `web/models/ast/katalog.json`: 33 asteroid shape models (radar, spacecraft, PDS), with source and method per model; GLB files are release assets (`varliklar.json`).
- `web/models/ast/damit/damit.json`: ~3,900 DAMIT lightcurve-inversion models.
- LS19 screenshots in `docs/*.png` (hero, solar view, lab, NRHO, satellites).
- No testimonials, user counts, press or partnerships exist; none may be invented.

## Product Principles

1. Source on every page: data, image and model carry their origin and license.
2. Processed, not raw: explain what was done to public data and let readers download the result.
3. Simulator-linked: pages open the same object in LS19 when it exists there.
4. Earned, not bought: patches and badges come only from reviewed contributions.
5. Non-commercial and non-affiliated: no ads, no implied endorsement.

## Accessibility & Inclusion

Bilingual (EN/TR) with equal content. Long technical pages must stay readable on phones; data presented in tables must also be readable without color.
