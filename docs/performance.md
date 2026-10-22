# Production performance report — 22/10/2026

Build: `next build` (Next.js 16.4.2, Turbopack), served with `next start`, measured locally with Lighthouse 12 (Node API, system Chrome). Mobile = default Lighthouse mobile preset (Moto G Power emulation, 4× CPU, slow 4G simulation).

## Scores

| Page | Preset | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|---|
| /it | mobile | **97** (3 runs: 94–97) | 100 | 100 | 100 |
| /en | mobile | **96** | 100 | 100 | 100 |
| /it | desktop | **100** | 100 | 100 | 100 |
| /en | desktop | **100** | 100 | 100 | 100 |

One mobile run reported SEO 92 because the `robots.txt` fetch timed out locally; the file is valid and the other runs score 100.

## Core Web Vitals (lab)

| | LCP | CLS | TBT | FCP |
|---|---|---|---|---|
| /it mobile | 2.6–2.7 s | 0 | 50–200 ms | 1.0 s |
| /it desktop | 0.6 s | 0 | 0–10 ms | 0.4 s |

Mobile LCP is the H1 (text, no image). Target LCP < 2.5 s is met on desktop and very close on mobile under simulated slow 4G; on Vercel's edge (brotli, CDN, lower TTFB than local `next start` ≈ 475 ms) it is expected to drop below 2.5 s. Re-measure on the production domain.

## What keeps it fast
- **Static HTML** (SSG + ISR 1 h) for both locales; HTML ≈ 41 KB gzip.
- **Map/database code loaded on demand** (`LazyExplorer`): the explorer, its dialogs and MapLibre are not in the initial bundle and are not hydrated until the user approaches the section (or arrives on `#map`, `#database`, a filter URL or `?player=`). This removed ≈ 300 ms of TBT on mobile.
- **MapLibre** (≈ 300 KB gzip + worker) loads only with the map; WebGL clustering, no DOM markers.
- **Self-hosted cartography** (≈ 265 KB raw, ≈ 80 KB gzip) and glyphs: no tile server, no third-party requests.
- **Dataset** `/api/players`: 30 KB brotli / 37 KB gzip for 464 players, fetched once and shared by map and database. Note: `next start` does not compress route handlers; Vercel does.
- **Fonts**: Manrope variable via `next/font` (self-hosted, `display: swap`, latin + latin-ext, ≈ 40 KB preloaded).
- **Images**: For Whom diagrams via `next/image` (AVIF/WebP, responsive `sizes`, blur placeholder, lazy). WHY/HOW illustrations are static SVG files with internal CSS animation, lazy-loaded.
- **Motion**: CSS transform/opacity/stroke only, IntersectionObserver reveals, `prefers-reduced-motion` honoured everywhere; no infinite animations near the LCP.

## Remaining opportunities (low impact)
- "Legacy JavaScript" (~13 KB) comes from Next's polyfills.
- DOM size ≈ 1,200 elements, mostly the hero SVG, category list and FAQ.
- bf-cache "failures" are due to the headless test flags, not the site.
