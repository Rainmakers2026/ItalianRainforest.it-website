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
| `data:snapshot` | Re-reads the public dataset from the legacy site (single GET) into `data/snapshot/` |
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
- Without Airtable credentials the site uses `data/snapshot/legacy-records.json` (public data of the legacy site).
- With `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID` + `AIRTABLE_TABLE` (+ optional `AIRTABLE_VIEW`) the Airtable REST API is read server-side with GET only. Use a token with **only** `data.records:read`, ideally on a dedicated sanitised view.
- Schema and field mapping: [docs/data-schema.md](docs/data-schema.md).

### Demo positions
The current public data has no location fields. With `IRF_GEO_DEMO=true` players investing in Italy get a **synthetic** position so the map can be reviewed. These positions are labelled "dimostrativa / illustrative" in the UI, shown in italics with `*` in the table, and never exported. Set `IRF_GEO_DEMO=false` as soon as Airtable provides Region/Province/City/Latitude/Longitude.

## Leads & analytics
- Forms post to our own API, which forwards to `LEAD_WEBHOOK_URL` (CRM, n8n/Make, email workflow). In production, without a webhook the API answers 503 and the UI suggests email. Airtable hosts are refused as destinations.
- Rate limiting is in-memory per instance (best effort on serverless). For strict limits plug a shared store (e.g. Upstash Redis) into `rateLimited()` in `src/lib/leads.ts`.
- Analytics: `NEXT_PUBLIC_ANALYTICS_PROVIDER=plausible|umami|gtm|none`. Events are listed in `src/lib/analytics.ts`; no PII is ever sent.

## Embeds ("Sharing is caring")
`<iframe src="https://<domain>/it/embed/map" width="100%" height="640" style="border:0" loading="lazy" title="Mappa Italian Rainforest"></iframe>` — also `/en/…` and `/…/embed/database`. Embeds accept the same query parameters as the main page (e.g. `?category=vc&region=lombardia`). Legacy embeds keep pointing to the old host until it is redirected.

## Content that needs the owner
See [docs/audit.md §6](docs/audit.md). Partners, press and testimonials are configured in `src/lib/site.ts` and stay hidden while empty.

## Licences of bundled data
Boundaries: ISTAT via openpolis/geojson-italy (CC BY 4.0) and Natural Earth (public domain). Glyphs: Noto Sans (OFL). Map rendering: MapLibre GL JS (BSD-3).
