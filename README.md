# Italian Rainforest 2.0

La mappa viva dell'ecosistema italiano dell'innovazione — an initiative by [Rainmakers](https://www.rainmakers.it).

Single-page, bilingual (IT/EN) site with an interactive map and a data explorer of Italy's innovation enablers. Next.js 16 (App Router, TypeScript strict), Tailwind CSS 4, MapLibre GL 6, Zod.

## Quick start

```bash
npm install            # also copies the MapLibre worker to public/vendor/
cp .env.example .env.local
npm run dev            # http://localhost:3000 → redirects to /it or /en
```

Production build:

```bash
npm run build          # runs the Airtable read-only check first
npm start
```

> **OneDrive note:** this folder is synced by OneDrive, which can lock files in `.next/` and make the build fail with `EPERM`. Exclude `.next` and `node_modules` from sync, or delete `.next` and retry.

## Scripts

| Script | What it does |
|---|---|
| `dev`, `build`, `start` | Next.js |
| `test` | Vitest: read-only policy, sanitisation, export, query state |
| `lint`, `typecheck`, `format` | ESLint, `tsc --noEmit`, Prettier |
| `check:airtable-readonly` | Static guard: fails on any Airtable write path |
| `data:import [csv] [logo-dir]` | Imports the IRF database export (CSV) into `data/snapshot/irf-records.json`; with a logo folder (one sub-folder per PLAYER TYPE, `<Company>.webp`) also rebuilds `public/logos/players`. Writes `docs/data-quality.md` |
| `data:geocode` | Geocodes new/changed addresses with OpenStreetMap Nominatim (cached in `data/snapshot/geocode-cache.json`), then re-imports |
| `infographic:build` | Regenerates the downloadable infographic PNGs (`public/infographic/`) from the snapshot |
| `brand:prepare <dir>` | Regenerates logos and favicon from the official artwork (1.webp white, 2.webp blue) |
| `geo:build <dir>` | Rebuilds simplified cartography from openpolis/Natural Earth GeoJSON |
| `visuals:build` | Regenerates the WHY/HOW SVG illustrations |

## Structure

```
src/app/[locale]/page.tsx        single page (IT/EN), SSG + ISR 1h
src/app/[locale]/embed/[kind]    /it|en/embed/map and /embed/database
src/app/api/players              public sanitised dataset
src/app/api/contact-request      gated contact flow (lead)
src/app/api/download             filtered CSV/JSON (light email gate)
src/app/api/suggest              "Suggest an update" (moderation sink)
src/lib/data/                    schema, taxonomy, normalisation, READ-ONLY providers
src/lib/filters.ts               shared query state (URL ⇄ filters)
src/lib/i18n/                    dictionaries IT/EN
src/components/explorer/         map, list, cards, detail, database, embeds
docs/                            audit, data schema, performance, final audit
```

## Data

- **Read-only, always.** No create/update/delete towards Airtable exists in the codebase; `prebuild` and the tests enforce it.
- Without Airtable credentials the site uses `data/snapshot/irf-records.json`, imported from the IRF database export (`data/source/irf-database.csv`) with logos and geocoded positions.
- With `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID` + `AIRTABLE_TABLE` (+ optional `AIRTABLE_VIEW`, `AIRTABLE_FIELD_MAP`) the base **"Rainmakers OS"** is read server-side with GET only, through the same normaliser: map, database, hero numbers, categories and FAQ switch over with no code change. Logos and positions prepared offline are reused by company name when the base lacks them. Use a token with **only** `data.records:read`.
- The only Airtable write is the **lead approval queue** (`src/lib/leads-airtable.ts`): create-only, on a separate staging base (`AIRTABLE_LEADS_*`), guarded by `check:airtable-readonly`.
- Schema and field mapping: [docs/data-schema.md](docs/data-schema.md).

### Positions
Positions come from the database addresses, geocoded with OpenStreetMap Nominatim. An address is used only when its province agrees with the REGION column; otherwise the city (or, failing that, the region) is used and the profile says the position is approximate. Players without a region are listed but not on the map. See [docs/data-quality.md](docs/data-quality.md).

## Leads & analytics
- **Pay-per-data:** browsing and filtering are free; the first download (CSV, JSON, PDF, map PNG/PDF) or embed code asks once for name, surname and email. The profile stays in the browser (`localStorage`), so later visits don't ask again; the sign-up goes to the Airtable approval queue and/or `LEAD_WEBHOOK_URL`.
- Other forms (suggestions, contact requests) go to `LEAD_WEBHOOK_URL`.
- Rate limiting is in-memory per instance (best effort on serverless). For strict limits plug a shared store (e.g. Upstash Redis) into `rateLimited()` in `src/lib/leads.ts`.
- Analytics: `NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible|umami|gtm|none`. Events are listed in `src/lib/analytics.ts`; no PII is ever sent.

## Embeds ("Sharing is caring")
`<iframe src="https://<domain>/it/embed/map" width="100%" height="640" style="border:0" loading="lazy" title="Mappa Italian Rainforest"></iframe>` — also `/en/…` and `/…/embed/database`. Embeds accept the same query parameters as the main page (e.g. `?category=vc&region=lombardia`). Legacy embeds keep pointing to the old host until it is redirected.

## Content that needs the owner
See [docs/audit.md §6](docs/audit.md). Partners, press and testimonials are configured in `src/lib/site.ts` and stay hidden while empty.

## Licences of bundled data
Boundaries: ISTAT via openpolis/geojson-italy (CC BY 4.0) and Natural Earth (public domain). Glyphs: Noto Sans (OFL). Map rendering: MapLibre GL JS (BSD-3).
