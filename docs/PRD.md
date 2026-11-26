# Italian Rainforest — PRD (repository copy)

The product requirements ("Italian Rainforest 2.0", see `docs/audit.md`) are kept by
Rainmakers. This file holds the requirements that are permanent rules of the codebase.
It consolidates the six P0 updates on public data and downloads (1/6 two download modes,
2/6 master column structure, 3/6 export pipeline, 4/6 formats and dialog, 5/6 consolidated
rules, 6/6 validation). In case of conflict with earlier implementations or instructions,
"Consolidated public data rules" prevails, then the sections below; every earlier,
incompatible requirement (per-user column choice, JSON / PDF database files, contact
details returned after a request, SECONDARY TYPE in public aggregations) is superseded.
Any exposure of a startup or of reserved information is a blocking error for deploy.

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
chart, search or public APIs; never used for classification, filters, counts or exports.
In the CSV / XLSX files only its header is present, with completely empty cells (the
structural exception). It stays in the master database for internal use.

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
database) and to both data formats, CSV and XLSX, and any future one.

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
The database section has one "Scarica database" button (label from the dictionaries:
"Scarica database" in Italian, "Download database" in English — the explorer of the home
pages is shown in English on both locales by an earlier decision, the embeds follow the
page language). It opens a dialog where the user
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

## Validation — P0 (update 6/6)

Overall validation of updates 1–5. Build, lint, typecheck, unit, integration and end-to-end
tests must all pass before a push; any exposure of a startup or of reserved information is
a blocking error for deploy.

| Requirement | Guarded by |
|---|---|
| Complete and filtered download working | `download-scope`, `api-integration`, e2e §2–3 |
| All filters applied at once | `download-scope`, `api-integration` (9 combinations), e2e §2–3 |
| Filtered results = exported records | `download-scope`, `api-integration`, e2e §2 (HTTP) and §3 (dialog count = file rows) |
| Export independent of pagination | `download-scope`, `api-integration` and e2e (page / pageSize ignored) |
| Master schema = exported schema | `export-pipeline`, `api-integration`, e2e (CSV and XLSX headers) |
| Reserved columns present, cells completely empty | `public-rules`, `download-formats`, `api-integration`, e2e |
| No reserved information in files and metadata | `public-rules`, `api-integration` (XLSX parts, no docProps, fixed zip dates), e2e |
| STARTUP excluded | `public-data`, `export-pipeline`, `api-integration` (live update), e2e (no master startup on any surface) |
| Publishable VENTURE BUILDER/STARTUP STUDIO included | `public-data`, `api-integration`, e2e |
| No duplicates | `export-pipeline`, `api-integration`, e2e |
| MAIN TYPE the only public classification | `public-data`, `api-integration`, e2e |
| No reserved field in the public APIs | `public-rules`, `api-integration` (`/api/players`, `/api/download`, `/api/contact-request`), e2e (pages, RSC payload, JS chunks) |
| CSV ↔ XLSX consistency | `download-formats`, `api-integration`, e2e (cell by cell) |
| New columns handled safely | `public-rules`, `api-integration` (live source with new columns) |
| CSV / formula injection | `public-rules`, `api-integration` (live record `=HYPERLINK(…)`) |
| Rules persist after Rainmakers OS updates | `api-integration` (simulated Airtable update: new startups, columns, reserved values, duplicates, INACTIVE) |
| Master integrity | `public-rules`, `export-pipeline`, e2e (`data/source` byte-identical) |
| Same public dataset for every component | `single-dataset` (`getDataset()` = `buildPublicDataset()`, every surface, no component filtering, infographic build) |

**Commands.** `npm run lint`, `npm run typecheck`, `npm test` (unit + integration, vitest),
`npm run build` then `npm run test:e2e` (`scripts/e2e.mts`: production server, real HTTP,
headless Chrome, real downloads through the "Scarica database" dialog with the
production default of email-gated downloads; test leads are never sent anywhere).

## Form submissions → Supabase — P0 (approved 2026-11-26)

Supabase (project `qwdajoztlpisrzieziup`) is the system of record of every public form.
Airtable and Brevo integrations are out of scope for now (the `airtable_*` / `brevo_*`
columns stay unused).

### 1. Mapping

| Form / action (IT + EN, every place it appears) | Endpoint | Table | Row |
|---|---|---|---|
| One-time sign-up before the first download (explorer map and database on `/it` and `/en`, embed pages) | `/api/signup`, download reason | `download_registrations` | `REGISTRATION` |
| Every download of a signed-up visitor: CSV, Excel, complete database, map PDF list | `/api/download` (POST) | `download_registrations` | `EVENT` |
| Map PNG (drawn in the browser) | `/api/signup`, `entry: "event"` | `download_registrations` | `EVENT` |
| One-time sign-up before the first embed code ("Sharing is caring", map / database) | `/api/signup`, reason `embed` | `sharing_is_caring_registrations` | `REGISTRATION` |
| Every embed code copy of a signed-up visitor | `/api/signup`, `entry: "event"` | `sharing_is_caring_registrations` | `EVENT` |
| "Segnala un aggiornamento / Suggest an update" (home `#update`, opened also from the Contact section) | `/api/suggest` | `database_update_requests` | `review_status PENDING` |
| Newsletter checkbox ticked in one of the forms above (explicit, optional, separate) | same endpoints | `newsletter_subscribers` | `source_form` = `DOWNLOAD_REGISTRATION` / `EMBED_REQUEST` / `DATABASE_UPDATE_REQUEST` |

Not connected: `/api/contact-request` (no form uses it). No newsletter form exists (the
footer "Scrivici / Write to us" is a mailto link). `embed_requests` is dropped (replaced by
`sharing_is_caring_registrations`, verified empty and without dependencies).

### 2. Provenance

Every row stores the real provenance: `page_path` (the page, e.g. `/it`, `/en/embed/map`),
`page_section` (`map`, `database`, `share_map`, `share_database`, `update`), `cta` (the
button or menu item, e.g. `dialog_all_csv`, `toolbar_filtered_map_png`, `copy_button`,
`contact_correction`), `locale` = the language of the page (not of the explorer, which is in
English on both home pages), `utm` (first-touch UTM of the session), the request type
(`request_type` / `embed_kind`) and, for update requests, the change type (`change_type`
`NEW` / `CORRECTION` / `OTHER`).

### 3. Registrations, events, no duplicates

- The sign-up is a `REGISTRATION`; each later gated action is an `EVENT` carrying
  `registration_id` = the `request_id` of the sign-up (kept in the visitor's browser
  profile). The first gated action therefore produces one REGISTRATION and one EVENT.
- Every row has a browser-generated `request_id` (UUID, unique): a retry or a double
  submission of the same action is ignored by the database (`ON CONFLICT DO NOTHING`).
  Embed copies are serialised in the browser (one in flight).
- Later events never imply a newsletter consent (`newsletter_consent = false`).

### 4. Privacy and security

- Privacy consent is mandatory and stored with `privacy_policy_version`
  (`PRIVACY_POLICY_VERSION`; `draft-2026-11` is for tests and preview only, until the
  notice is legally validated — no version is hardcoded). The newsletter consent is
  separate and optional (`NEWSLETTER_CONSENT_VERSION`, defaults to the privacy version).
- Newsletter: a new email → `PENDING` (double opt-in happens later, outside the site); an
  existing `PENDING` / `SUBSCRIBED` contact → consent refreshed, status untouched; an
  `UNSUBSCRIBED` / `BLOCKED` contact → nothing changes, never reactivated.
- Server-side validation (zod: email normalised, names, lengths, enums, UUIDs, provenance
  slugs and path), same-origin JSON only, honeypot + time-to-submit (bots get a fake
  success and nothing is stored), per-client rate limits (sign-up 5 / 10 min, events 30,
  downloads 20, suggestions 5).
- **No success without the record.** The mandatory write (registration, event, update
  request) happens before the answer; if it fails — or Supabase is not configured in
  production — the API answers 503 (no file for downloads, the copy is not done for
  embeds, the form shows its error). Only the optional newsletter write may fail without
  failing the submission (logged).
- RLS stays on with no policy on every table: `anon` / `authenticated` have no
  privilege; only `service_role` (server) writes. The key lives in server env only
  (`SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_`), the client module is `server-only`;
  logs carry the table and the Postgres code only — never a key or a submitted value.

### 4b. Corrections after the authorised QA (approved 2026-11-26)

1. **Map PDF recorded only when generated.** The map image is produced first, then the
   list of the filtered players (`/api/download` format `table`, never recorded by itself),
   then the PDF; the EVENT `MAP_PDF` (with `row_count`, `filter_query`, `download_scope`) is
   sent only once the PDF exists, before it is handed over — as for the PNG. A failure
   anywhere: no event, no file, the error is shown.
2. **Status in the compact mobile toolbar.** Preparing / done / error are shown there too
   (live region); a newer download cancels the timer that clears the "done" note, so it can
   never hide a newer error.
3. **Embed code language = page language** (IT on `/it`, EN on `/en`), IT / EN still
   selectable; the event stores the chosen code language (`embed_locale`) and the page
   language (`locale`).
4. **Text lengths in characters, as PostgreSQL counts them** (Unicode code points: an emoji
   is one character), aligned with the SQL CHECK constraints; U+0000 refused up front (400,
   never a database error). The update form counts the same way in the browser.
- Found by the new regression tests and fixed: the time-to-submit bot check applied to the
  clicks of signed-up visitors, so a copy within 1.5 s of the page load was answered "ok"
  and not recorded. Events and later downloads now use the honeypot only (forms unchanged).

### 5. Implementation (codebase)

- `supabase/sql/01–05` — the schema (run in the Supabase SQL Editor; the MCP connection is
  read-only).
- `src/lib/supabase/server.ts` (client), `src/lib/supabase/store.ts` (mapping, idempotent
  inserts, newsletter rules, `storeOrFail` / `storeOptional`), `src/lib/leads.ts`
  (validation), `src/lib/submission.ts` (browser: request id, page language, provenance,
  events).
- Guarded by `tests/forms-supabase.test.ts` (route handlers on a simulated Supabase that
  enforces the SQL schema) and e2e §2b–3 (production server + headless Chrome against a
  local Supabase mock: sign-up, events, update form, newsletter, failures, no secret in
  pages / chunks / logs).

## RAINFOREST RADAR newsletter — P0 (2026-11-26)

Full specification and operations: `docs/newsletter.md`.

- **One newsletter, one table.** Every entry point (the `#newsletter` section on the IT / EN
  home, the download and embed sign-ups, the update request) subscribes to RAINFOREST RADAR
  in `public.newsletter_subscribers` (`newsletter_name = RAINFOREST RADAR`). Consent is
  mandatory in the dedicated form, optional elsewhere (never blocking the service).
- **Double opt-in.** PENDING until a verified confirmation: signed `redirectionUrl` of the
  Brevo double opt-in + Brevo contact-list check. "Check your inbox" only when Brevo accepted
  the request. Welcome email once per confirmed cycle, in the subscriber's language.
- **History.** `newsletter_consent_events` (append-only): every consent with the text shown,
  versions, privacy acknowledgment and provenance; every opt-in step, revocation and ignored
  event. The original consent is never overwritten.
- **No reactivation.** UNSUBSCRIBED / BLOCKED never return to SUBSCRIBED without a new
  explicit consent and a new double opt-in. Duplicate and out-of-order webhook events are
  ignored. Answers never reveal whether an address is known.
- **Airtable (one-way).** ISCRITTI ALLA NEWSLETTER only for confirmed subscribers (17 fields,
  upsert on SUPABASE ID, no typecast); DISISCRITTI DALLA NEWSLETTER on unsubscription, verified
  before the removal from ISCRITTI. IRF - USERS REQUESTS stays a separate flow (not synced yet).
  Sync credentials `AIRTABLE_SYNC_*`, never the read-only data base.
- **Activation gate.** Off until migration 06, Brevo / Airtable ids and secrets are set and
  the Brevo list-level unsubscription (GOCCE isolation) is verified.
- Guarded by `tests/newsletter.test.ts` and e2e §3g / §5 (simulated Supabase, Brevo, Airtable).
