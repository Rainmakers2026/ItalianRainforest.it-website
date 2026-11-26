@AGENTS.md

# Italian Rainforest — permanent project rules

The six P0 updates on public data and downloads (1/6–6/6) are consolidated below and in
`docs/PRD.md`; they supersede every earlier, incompatible requirement (per-user column
choice, JSON / PDF database files, contact details returned after a request, SECONDARY
TYPE in public aggregations). **Any exposure of a startup or of reserved information is a
blocking error for deploy.**

## Consolidated rules (P0 — update 5/6, prevail over every earlier incompatible instruction)

Full text: `docs/PRD.md` § "Consolidated public data rules".

| Surface | Startups | Reserved fields (REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE, EMAIL) |
|---|---|---|
| Rainmakers OS master | preserved | every field, value and record preserved (never modified or deleted) |
| Public dataset | excluded | fields and values absent |
| Public interface | excluded | fields hidden, values absent |
| Public APIs | excluded | fields and values absent |
| CSV and XLSX files | excluded | headers present, cells completely empty |

- **The only structural exception** to the exclusion of reserved fields is the presence of
  their headers in the CSV / XLSX files. Nothing else — API, JSON (also the map PDF list),
  payload, metadata (no flags such as "has an email"), static assets — can expose a
  reserved field, its name outside those files, or its values. `/api/contact-request`
  records the request and never returns contact details.
- **Every Rainmakers OS update flows through automatically** (`npm run data:import`, or the
  live Airtable source): public dataset, counts and files follow it.
- **New master columns: private by default.** The export schema follows the master
  automatically (import → `data/snapshot/export-schema.json`; Airtable → Metadata API,
  names only) and the files show the new headers with completely empty cells. A field is
  published only after explicit approval, by adding it to the allowlist in
  `src/lib/export.ts` (`PUBLIC_VALUES`, frozen by `tests/public-rules.test.ts`) — never
  automatically. Live sources are read through the allowlist only (`readFields()`);
  `AIRTABLE_FIELD_MAP` can never point a public field at a reserved column.
- **CSV / formula injection.** CSV cells starting with = + - @ (also full-width, also after
  spaces) or tab / CR / LF get a leading apostrophe; XLSX cells are inline text with text
  format and quotePrefix, never formulas.

## Public data rules (P0)

Full text: `docs/PRD.md` § "Public data visibility & player type classification".

1. **Startups are never public.** Every record whose MAIN TYPE (called PLAYER TYPE in older
   exports) is exactly `STARTUP`, after normalising spaces and case, is left out of every
   public output: database, map, markers, popups, search, filters, ring chart, KPIs and
   counters, infographic (page, PNG, PDF), scrolling banner, legends, directory, APIs,
   downloads. Startups stay untouched in the master database (Rainmakers OS).
2. **Exact match only.** `VENTURE BUILDER/STARTUP STUDIO`, `BANCHE PER STARTUP`, and every
   other type containing the word are enablers. SECONDARY TYPE and the description never
   cause an exclusion.
3. **MAIN TYPE is the only public classification.** One type per player, one tag, one
   colour, counted once. Never combine MAIN and SECONDARY TYPE, never hybrid categories.
   `data/source/player-type-overrides.json` only maps/refines MAIN TYPE into the site
   taxonomy (one value, never for startups).
4. **Reserved fields never reach the browser** (API, JSON, page payload, metadata, static
   assets): REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE, EMAIL — never read at
   all, not even server-side. Use allowlists, never blocklists. Only exception, structural
   and limited to CSV / XLSX files: their column *names* appear as headers with empty cells.
5. **One pipeline, one public dataset.** See "Export pipeline" below. The rules live only in
   `scripts/import-irf-csv.mjs` (snapshot) and `src/lib/data/normalize.ts`
   (`buildPublicDataset()`, snapshot and Airtable); every consumer — site, APIs, downloads,
   infographic build — uses that one public dataset. Components never filter on their own
   and never hide data with CSS.
6. **No hardcoded numbers.** KPIs come from `computeStats()` on the public dataset; the
   per-type counts always add up to the total.
7. **Tests guard it** (see "Validation" below). After every database update run
   `npm run data:import`, `npm run infographic:build` and `npm test`; never ship with a
   failing test.

## Downloads (P0 — updates 1–4/6, full text: `docs/PRD.md` § "Public database download")

1. **Two modes.** "Scarica database completo" = every publishable player; "Scarica database
   filtrato" = only the players matching the active filters and search.
2. **All filters at once.** The filtered file honours MAIN TYPE (PLAYER TYPE in the UI),
   region, city and other geographic filters, text search and every public filter, present
   or future, through the one shared `Filters` / `applyFilters` (never a separate filter
   logic for downloads).
3. **No pagination, exact count.** Every matching result, regardless of the table page;
   exported rows = filtered results on screen; with no filters the two modes coincide; zero
   results never fall back to the full database.
4. **Public data layer only.** Files come from `getDataset()` via `buildExport()` in
   `src/lib/export.ts` (the only data-file endpoint is `/api/download`; PDF is rendered in the
   browser from the rows that endpoint returns). The Rainmakers OS master (`data/source/`) is
   never served, copied to `public/` or downloadable.
5. **Master structure.** Every downloadable data file (CSV, XLSX) has exactly the columns of
   the master: same number, original names, same order, same meaning — nothing added,
   removed, renamed or merged. The file says `MAIN TYPE` (master name, with the master
   value) even though the interface says PLAYER TYPE. The structure is read from the import
   (`data/snapshot/export-schema.json`, column names only) and follows the master
   automatically. No per-user column picking.
6. **Reserved columns: headers only.** REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE,
   EMAIL and any master column not in the public allowlist (also future ones) are present
   with completely empty cells — no values, placeholders, formulas, comments or metadata.
   This exception is structural and for CSV / XLSX only; interface, public dataset, APIs,
   payloads (also the map PDF list) and metadata never contain reserved fields (names or
   values).
7. **Formats: CSV UTF-8 and XLSX only**, both for Excel and Google Sheets, with the same
   publishability, structure, privacy and filtering rules. CSV: UTF-8 with BOM, CRLF,
   formula-injection guard. XLSX: `src/lib/xlsx.ts` (no dependency), text cells only — no
   formulas, numbers or dates — and no cell at all for empty values. JSON and the database
   PDF table are no longer offered; the map keeps its PNG and map + list PDF.
8. **File names**, date = generation date (Europe/Rome), not the database date:
   `Italian_Rainforest_Database_YYYY-MM-DD.{csv,xlsx}` (complete) and
   `Italian_Rainforest_Database_Filtered_YYYY-MM-DD.{csv,xlsx}` (filtered) — `exportFilename()`.
9. **Database section UI.** One "Scarica database" button ("Download database" in the
   English explorer, which the home pages show on both locales) opens a dialog: complete database
   or filtered results, each with its number of exportable players; CSV or Excel. With
   active filters the filtered download is preselected; with zero results it is disabled
   and a message explains why. Same design system (`Dialog`, `btn`), no change to other
   components beyond the download menus of the map (CSV / Excel instead of JSON / PDF).
Guarded by `tests/download-scope.test.ts`, `tests/download-formats.test.ts`,
`tests/export-pipeline.test.ts` and `tests/public-rules.test.ts`.

## Export pipeline (P0 — update 3/6, full text: `docs/PRD.md` § "Export pipeline")

1. import/update Rainmakers OS (read-only: the master is never modified or deleted) →
2. validate, normalise, deduplicate → 3. exclude MAIN TYPE exactly `STARTUP` (spaces and
   case normalised; `VENTURE BUILDER/STARTUP STUDIO` and every other type containing the word
   stay) → 4. other publishability rules → 5. public field allowlist → 6. public dataset
   (`buildPublicDataset()`) → 7. user filters (`applyFilters`) → 8. rebuild the master columns
   → 9. public values only → 10. reserved columns as empty cells → 11. validate and
   generate the file (`buildExport()`: schema check, row count, width, empty reserved cells).
- File generation never fetches reserved values: its only inputs are the public dataset and
  the authorised schema metadata (column names).
- MAIN TYPE is the only public classification; SECONDARY TYPE affects no classification,
  filter or export. The master never reaches the browser.

## Validation (P0 — update 6/6, full text: `docs/PRD.md` § "Validation")

Before every push, all of these pass (fix the cause, never weaken a test):
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.
- Unit: `public-data`, `download-scope`, `download-formats`, `export-pipeline`,
  `public-rules` (real master export and snapshot), `leads`, `forms-supabase` (form → table
  mapping on a simulated Supabase).
- Integration: `tests/api-integration.test.ts` — the real route handlers (`/api/players`,
  `/api/download` GET / POST / table, `/api/contact-request`) on the snapshot, and on a
  simulated Airtable update (new startups, new columns, reserved values, duplicates,
  INACTIVE, formula payloads); `tests/single-dataset.test.ts` — one public dataset for every
  surface, no filtering in components.
- End-to-end: `scripts/e2e.mts` — production server, every public page, RSC payload and JS
  chunk scanned for startups and reserved names / values; CSV and XLSX downloads (complete,
  filtered, combined filters, zero results) compared with the filtered results; the
  dialog in headless Chrome with real downloads; master byte-identical. Test leads are never
  sent anywhere.

## Form submissions → Supabase (P0, full text: `docs/PRD.md` § "Form submissions → Supabase")

- **Mapping.** `/api/signup` reason `embed` → `sharing_is_caring_registrations`; `/api/signup`
  download reasons and `/api/download` (POST) → `download_registrations`; `/api/suggest` →
  `database_update_requests`; explicit newsletter checkbox → `newsletter_subscribers`.
  `/api/contact-request` is not connected; no newsletter form. Airtable / Brevo: not yet.
- **REGISTRATION vs EVENT.** The one-time sign-up is a REGISTRATION; every later download /
  embed copy is an EVENT with `registration_id`. Each row has a browser `request_id`
  (unique): retries never duplicate.
- **Provenance** on every row: `page_path`, `page_section`, `cta`, real page `locale` (not the
  explorer's), `utm`, request type, change type.
- **No success without the record**: mandatory writes happen before the answer, failure or
  missing config in production → 503. Only the optional newsletter write may fail silently.
- **Newsletter**: separate, optional; UNSUBSCRIBED / BLOCKED contacts are never reactivated.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVACY_POLICY_VERSION` in server
  env only (never `NEXT_PUBLIC_`, never committed); `src/lib/supabase/*` is `server-only`;
  logs carry table + error code only. RLS on, no policy, only `service_role` writes.
- **Schema changes** go in `supabase/sql/` and in `tests/support/supabase-mock.ts` (the mock
  enforces the schema). Tests and e2e use the mock only — never the real project.
- `draft-2026-11` is the privacy version for tests / preview only, until legal validation.

## Working rules

- No production deploy without explicit approval: publish only on the preview branch
  (`preview/italianrainforest`), never on `main`, never force-push.
- Privacy page: draft awaiting legal validation. Do not present it as approved, do not
  invent company name, VAT number, processors or retention periods.
- Fix only unambiguous typos in the source data; no editorial markers on the site.
