# Italian Rainforest — PRD (repository copy)

The product requirements ("Italian Rainforest 2.0", see `docs/audit.md`) are kept by
Rainmakers. This file holds the requirements that are permanent rules of the codebase.
In case of conflict with earlier implementations or instructions, "Consolidated public
data rules" (update 5/6) prevails, then the sections below.

## Consolidated public data rules — P0 (update 5/6, prevailing)

| Surface | Startups | Reserved fields (REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE, EMAIL) |
|---|---|---|
| Rainmakers OS master | preserved | every field, value and record preserved (never modified or deleted) |
| Public dataset | excluded | fields and values absent |
| Public interface | excluded | fields hidden, values absent |
| Public APIs | excluded | fields and values absent |
| CSV and XLSX files | excluded | headers present, cells completely empty |

**Single structural exception.** The presence of the reserved headers in the CSV and XLSX
files is the only exception to the exclusion of reserved fields. It must not be possible
to retrieve reserved information through APIs, JSON, payloads, metadata or any other public
asset. Consequences applied in the codebase:
- `/api/contact-request` records the visitor's request for Rainmakers and never returns
  contact details (the former `REVEAL_GATED_CONTACTS` option is removed); EMAIL is no
  longer read at all, and the `hasGatedContacts` flag (metadata derived from EMAIL) is
  removed from the public player.
- The JSON list used to draw the map PDF contains the public columns only.
- Live sources (Airtable) are read through the public allowlist only (`fields[]`): reserved
  values are never fetched; the column names come from the Metadata API (names only).

**Automatic updates.** Every update of Rainmakers OS is reflected automatically in the
public dataset and in the downloadable files: `npm run data:import` for the CSV export (then
`npm run infographic:build` and `npm test`), or the live read of the Airtable source.

**New master columns — private by default.**
1. The export schema is updated automatically (importer → `data/snapshot/export-schema.json`;
   Airtable → Metadata API).
2. The new headers are included in the CSV / XLSX files.
3. Their cells stay completely empty until the field is explicitly approved for
   publication.
4. New fields are never added to the public allowlist automatically: publishing one is an
   explicit code change to `PUBLIC_VALUES` in `src/lib/export.ts`, whose list is frozen by
   `tests/public-rules.test.ts`. The importer matches its columns by exact name first, so a
   new column (e.g. "REGION NOTES") can never be read in place of a public one.
5. `AIRTABLE_FIELD_MAP` overrides that point a public field at a reserved column are ignored.

**CSV and formula injection.** CSV: any cell starting with `=`, `+`, `-`, `@` (also their
full-width forms, also after leading spaces) or with tab / CR / LF is prefixed with an
apostrophe. XLSX: every cell is an inline text string with the Text number format and
quotePrefix; formulas are never written.

**Tests.** `tests/public-rules.test.ts` checks the whole matrix on the real master export:
master preserved, allowlist frozen, new columns empty in CSV and XLSX, allowlisted reads,
field-map guard, injection payloads, no reserved key or value in payload, files, map list,
APIs and public assets.

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
(EMAIL) are never read and never sent to the browser (API, JSON, payloads, metadata,
assets). Implemented with an explicit allowlist of publishable fields. CSV / XLSX files are
the only, structural, exception: they carry these column names as headers with empty cells
(see "Consolidated public data rules"); their values never appear anywhere.

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

## Public database download — P0 (updates 1/6, 2/6 and 4/6)

Prevails over earlier implementations. Applies to every download entry point (map and
database, CSV / JSON / PDF and any future format).

### 1. Two modes
- **Complete database** ("Scarica database completo"): every publishable player — the
  public dataset after all the rules above (no STARTUP, no INACTIVE, no template rows,
  deduplicated).
- **Filtered database** ("Scarica database filtrato"): only the players matching the
  active filters and search at the moment of the download.

### 2. Filters honoured
The filtered file applies, at the same time, MAIN TYPE (PLAYER TYPE in the interface),
region, every other geographic filter (city, …), the text search and any other public
filter, present or future. There is one filter definition (`Filters`, `applyFilters`)
shared by map, database and download: a new public filter is added there and reaches the
download automatically.

### 3. No pagination, exact count
The file contains every matching result, regardless of the table page. Exported rows =
total filtered results shown on screen. With no active filter the two modes produce the
same rows. With zero results the filtered download is disabled (never falls back to the
complete database).

### 4. Public data layer only
Files are built server-side from `getDataset()` (the public dataset) — never from the
Rainmakers OS master export. The master (`data/source/`) is never served, copied to
`public/`, read by an API route or offered as a download. Reserved fields stay out (see
§ 5 above).

### 5. Master column structure (update 2/6)
Every downloadable data file (CSV, XLSX) keeps exactly the structure of the Rainmakers OS
master: same number of columns, same original names, same order, same meaning of each
field. No column is added, removed, renamed or merged. MAIN TYPE keeps its master name and
value in the file, even though the interface calls it PLAYER TYPE. The export schema is
aligned automatically: the importer records the master header (names and order only) in
`data/snapshot/export-schema.json`. This supersedes the earlier "Columns" dialog (per-user
column choice), which has been removed.

### 6. Reserved columns in the files
The headers of REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE and every other hidden
field (EMAIL) are included; their cells are completely empty — no values, placeholders,
formulas, comments or metadata with reserved information. The same applies to any master
column not in the public allowlist, including future ones (private by default). This is a
structural exception for downloadable files only: in the interface, the public dataset,
the APIs and the payloads reserved fields remain completely absent.

Public values per column: COMPANY NAME, WEBSITE, SHORT DESCRIPTION, MAIN TYPE (master
value), ADDRESS, REGION, CITY, INDUSTRY, STATUS (ACTIVE, empty when not verified), GOOGLE
MAPS LINK (built from the public position), LOGO (SI/NO, public logo present).

### 7. Formats and file names (update 4/6)
The database is downloadable as **CSV (UTF-8)** and **XLSX**, both compatible with Excel
and Google Sheets and subject to the same publishability, structure, privacy and filtering
rules. File names, where the date is the generation date of the file (Italian time):
- `Italian_Rainforest_Database_YYYY-MM-DD.csv` / `.xlsx` — complete database;
- `Italian_Rainforest_Database_Filtered_YYYY-MM-DD.csv` / `.xlsx` — filtered results.
JSON and the database PDF table, offered earlier, are replaced by these two formats. The
map keeps its image exports (PNG, map + list PDF), which are renderings, not data files.

### 8. "Scarica database" (update 4/6)
The database section has one "Scarica database" button. It opens a dialog where the user
chooses: complete database or filtered results, each showing the number of exportable
players; CSV or Excel. With active filters the filtered download is the default; with no
results it is disabled and an informative message is shown. The dialog uses the existing
design system; other site components are unchanged (the map menus only swap JSON / PDF for
CSV / Excel).

### Implementation (codebase)
- `src/lib/export.ts` — `selectForExport()` (modes), `exportTable()` (column allowlist,
  reserved/unknown columns empty), `buildExport()` (pipeline steps 7–11), `toCsv()` (UTF-8
  BOM, CRLF, formula-injection guard), `exportFilename()` / `generationDate()`.
- `src/lib/xlsx.ts` — minimal OOXML writer, no dependency: one sheet, bold frozen header
  with autofilter, text-only cells (never formulas, numbers or dates), no cell for empty
  values.
- `src/lib/data/provider.ts` — `getExportColumns()`: validated schema metadata, with the
  documented 16-column structure as fallback.
- `src/app/api/download/route.ts` — the only data-file endpoint (CSV, XLSX, and the table
  as JSON for the map PDF); `x-row-count` and `x-export-scope` headers.
- `src/components/explorer/Downloads.tsx` — `DatabaseDownload` (button + dialog),
  `MapDownloads` (menus); both send `serializeFilters` + `scope`. `pdfExport.ts` renders the
  map PDF (A3) from the rows returned by the endpoint.
- `tests/download-formats.test.ts` — file names and generation date, CSV UTF-8, XLSX
  container, header, values equal to the CSV, empty reserved columns, text-only cells.
- `tests/download-scope.test.ts` — modes, combined filters, no pagination, count, filter
  round trip, empty result, master structure, empty reserved columns, master never reachable.

## Export pipeline — P0 (update 3/6)

The export runs through one centralised flow:
1. Import and update from Rainmakers OS (read-only: no record of the master is ever
   modified or deleted).
2. Validation, normalisation and deduplication.
3. Exclusion of MAIN TYPE exactly equal to `STARTUP`, after normalising spaces and case.
   `VENTURE BUILDER/STARTUP STUDIO` and every other admissible type containing the word are
   never excluded.
4. The other publishability rules (template rows, INACTIVE).
5. The allowlist of public fields.
6. The public dataset — the same one used by every component of the site.
7. The filters selected by the user.
8. Reconstruction of the original column structure.
9. Publishable values only.
10. Reserved columns with empty cells.
11. Validation and generation of the file.

MAIN TYPE remains the only public classification; SECONDARY TYPE influences no
classification, filter or export. Reserved values are never fetched while generating a
file: only the public dataset and the authorised schema metadata (column names) are used.
The master database is never transmitted to the browser.

### Implementation (codebase)
- Steps 1–5: `scripts/import-irf-csv.mjs` (CSV snapshot, column allowlist, writes only
  `data/snapshot/`, `docs/` and public logos) and `src/lib/data/normalize.ts`
  (`normalizeRecord`, also for Airtable, read-only client).
- Step 6: `buildPublicDataset()` in `normalize.ts`, used by `getDataset()` (pages, APIs,
  downloads) and by `scripts/build-infographic.mts` (run with `scripts/register-ts.mjs`, so
  the script imports the same TypeScript module as the site).
- Steps 7–11: `buildExport()` in `src/lib/export.ts` — filters, master columns, public
  values, empty reserved columns, then checks (valid schema, row count = selection, row
  width = schema, reserved cells empty); it throws rather than produce a non-compliant file.
- `tests/export-pipeline.test.ts` — exact STARTUP match, SECONDARY TYPE without effect,
  dedupe, filters, structure, schema validation, importer never writing the master, one
  dataset builder for every consumer.
