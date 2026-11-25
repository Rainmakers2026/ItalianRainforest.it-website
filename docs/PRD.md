# Italian Rainforest — PRD (repository copy)

The product requirements ("Italian Rainforest 2.0", see `docs/audit.md`) are kept by
Rainmakers. This file holds the requirements that are permanent rules of the codebase.
In case of conflict with earlier implementations or instructions, the section below
prevails for record publishability and player classification.

## Public data visibility & player type classification — P0

**Scope:** database, interactive map, data layer, filters, KPIs, ring chart, infographic,
scrolling banner, public API, downloads.

### 1. Startup exclusion
The Rainmakers OS master database holds both startups and enablers; the site shows
enablers only. Every record whose MAIN TYPE (PLAYER TYPE in older exports) is exactly
`STARTUP` is excluded from: database interface, map, markers and popups, search results,
type and geographic filters, ring chart, KPIs and counters, infographic, scrolling banner,
legends, public directory, public APIs, downloadable files. Startups stay in the master
database: never deleted, modified or reclassified. The exclusion is applied in the central
data layer, before data reaches the frontend — never by hiding rows with CSS.

### 2. Exact match
Only the exact value `STARTUP` (after normalising spaces and case) is excluded.
`VENTURE BUILDER/STARTUP STUDIO`, `INCUBATOR/ACCELERATOR`, `VC`, `CVC` and every other type
are included. A player whose MAIN TYPE is not STARTUP is never excluded because of its
SECONDARY TYPE or description.

### 3. SECONDARY TYPE is hidden
Not shown in tables, cards, popups, tooltips, tags, filters, legends, infographic, ring
chart, search, public APIs or downloads; never used for classification or counts. It stays
in the master database for internal use.

### 4. MAIN TYPE is the only public classification
The UI label may read "Player type", but the value comes only from MAIN TYPE. Each player
belongs to one public type, has one tag and its colour, is counted once and is filterable
by it. No MAIN + SECONDARY combinations, no hybrid categories, no duplicates. This
overrides any earlier use of SECONDARY TYPE in public aggregations.

### 5. Reserved fields
REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE and every field already hidden
(EMAIL) are never sent to the browser (API, JSON, payloads, assets). Implemented with an
explicit allowlist of publishable fields.

### 6. Pipeline
1. Import the master database. 2. Validate and normalise. 3. Deduplicate. 4. Exclude
MAIN TYPE = STARTUP. 5. Apply the other approved publishability rules. 6. Strip reserved
fields. 7. Build the public dataset. 8. Compute the numbers. 9. Distribute the same
dataset to every component — no per-component exclusion rules.

### 7. KPIs
Recomputed from the public dataset, never hardcoded. Total = unique publishable enablers;
the per-MAIN TYPE counts add up to the total; startups never contribute.

### 8. Acceptance criteria
No STARTUP in the public dataset; all startups still in the master; no VENTURE
BUILDER/STARTUP STUDIO wrongly excluded; SECONDARY TYPE neither visible nor accessible;
MAIN TYPE the only public classification; each player counted once; database and map on
the same perimeter; region and MAIN TYPE filters work together; KPIs, ring chart,
infographic and banner follow the same rules; reserved fields stay hidden; no loss of
information in the master; every future Rainmakers OS update applies these rules
automatically.

### Implementation (codebase)
- `scripts/import-irf-csv.mjs` — CSV → `data/snapshot/irf-records.json`, steps 1–7, column
  allowlist and a final allowlist gate on the written fields.
- `src/lib/data/normalize.ts` — same rules for the snapshot and the Airtable provider
  (`isStartup`, `mainTypeOf`, one category, `RESERVED_FIELDS`); `src/lib/data/schema.ts`
  enforces exactly one category and strips any key outside the public schema.
- `src/lib/data/stats.ts` — every number on the site.
- Other approved publishability rules: template rows dropped; organisations marked
  INACTIVE are not public (they were already excluded from counts and the infographic).
- `tests/public-data.test.ts` — automated checks of all the above against the real master
  export and snapshot; runs with `npm test`.
- Open point to validate with Rainmakers: `data/source/player-type-overrides.json`
  `byName` refines ~40 organisations into the types the export has no MAIN TYPE value for
  (startup studio, regional finance, banks, universities, mentors).
