# Data schema

## Flow

```
data/source/irf-database.csv ──▶ scripts/import-irf-csv.mjs ──▶ data/snapshot/irf-records.json ─▶ SnapshotProvider ─┐
  + logo folder (LOGHI PLAYER) ──▶ public/logos/players/<hash>.webp + data/snapshot/logos.json                      │
  + scripts/geocode-irf.mjs    ──▶ data/snapshot/geocode-cache.json (OpenStreetMap Nominatim)                       │
Airtable "Rainmakers OS" (READ-ONLY) ──GET──▶ AirtableReadOnlyProvider ────────────────────────────────────────────┤
                                                                                                                    ▼
                        normalizeRecord(record, {logos, geo}) → dedupe()          (server only)
                                                                                                                    ▼
                        PublicPlayer[] ──▶ /api/players ──▶ map, database, embeds, hero numbers, categories, FAQ, infographic
                        (no contact detail is ever returned: /api/contact-request only records the request)
```

The provider is chosen automatically: Airtable when `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE` are set, otherwise the snapshot. If Airtable fails, the last good copy (or the snapshot) is served. The browser never receives the raw record or the Airtable record id.

Logos and geocoded positions are keyed by **company name** (`nameKey()`), so they are reused when the site switches to Airtable and a record has no LOGO attachment or coordinates.

## Columns (CSV export = Airtable "Rainmakers OS")

Public data rules (P0, also in `CLAUDE.md` and `docs/PRD.md`): the importer and the normaliser read an **explicit allowlist** of columns; everything else is never read, so it cannot reach the snapshot, the API, the page payload or the downloads.

| Column | Public | Maps to |
|---|---|---|
| COMPANY NAME (`Map` in old CSVs) | ✔ | `name`, `slug` |
| WEBSITE | ✔ | `website`, `websiteHost` (normalised, tracking params removed) |
| SHORT DESCRIPTION | ✔ | `description` (cookie/404 boilerplate and CRM notes dropped by the importer) |
| MAIN TYPE (`PLAYER TYPE` in older exports) | ✔ | `categories` — **exactly one** per player. `STARTUP` (exact match, spaces/case normalised) is excluded. `mainType` keeps the master value, used only as the MAIN TYPE cell of the downloads |
| ADDRESS | ✔ | `location.address` — hidden when it contradicts REGION |
| REGION | ✔ | `location.region` (slug) |
| CITY | ✔ | `location.city` (normalised: Turin → Torino, …) |
| INDUSTRY | ✔ | `industries` (CRM notes after "\|" dropped) |
| STATUS | ✔ | `status`: ACTIVE… → `active`, DA VERIFICARE/empty → `unverified`. **INACTIVE → not public** |
| LOGO (attachment in Airtable; SI/NO in the CSV) | ✔ | `logo` {src, w, h, tone} |
| OPEN STREET MAP | ✔ | `location.lat/lng` when the link carries coordinates |
| EMAIL | ✖ reserved | never read (not even requested from Airtable); empty column in CSV / XLSX |
| SECONDARY TYPE | ✖ reserved | never read, never used for classification or counts |
| REFERENCE, INFORMATION SOURCE, PHONE | ✖ reserved | never read; empty columns in CSV / XLSX |
| any new master column | ✖ private by default | empty header in CSV / XLSX until added to the allowlist in `src/lib/export.ts` |
| GOOGLE MAPS LINK | ✖ | not used |

The export is upper-case: names, websites, descriptions and industries take the mixed-case spelling of `data/source/display-text.json` when it is equal ignoring case, otherwise a conservative case conversion (listed in `docs/data-quality.md`).

Other names can be mapped without code changes: `AIRTABLE_FIELD_MAP='{"name":"Company"}'` (keys in `src/lib/data/normalize.ts`).

"DA VERIFICARE", "Not Answered" and empty cells are treated as missing values.

## MAIN TYPE → player type → kind of enabler

One type per player. `rename` in `data/source/player-type-overrides.json` maps the export value; `byName` refines single organisations into the types the export has no value for (startup studio, regional finance, banks, universities, mentors) — never for startups, never more than one type.

| MAIN TYPE | Player type | Kind |
|---|---|---|
| VC | `vc` | financial |
| BAN/CLUB DEAL | `angels` | financial |
| CVC | `cvc` | financial |
| CROWDFUNDING PLATFORM | `crowdfunding` | financial |
| FAMILY OFFICE | `family-office` | financial |
| BANCHE PER STARTUP | `banks` | financial |
| (byName) FINANZIARIE REGIONALI | `regional-finance` | financial |
| PERCORSI FORMATIVI PRIVATI, CORSI DI FORMAZIONE | `training` | personal |
| (byName) CORSI UNIVERSITARI PUBBLICI | `university` | personal |
| (byName) GRUPPI DI MENTOR | `mentors` | personal |
| INSTITUTIONS | `institution` | environmental |
| ASSOCIATIONS | `associations` | environmental |
| MEDIA | `media` | environmental |
| INCUBATOR / ACCELERATOR, PST, COWORKING | `incubator` | business |
| VENTURE BUILDER/STARTUP STUDIO | `venture-builder` | business |
| (byName) STARTUP STUDIO | `startup-studio` | business |
| STARTUP | **excluded** (kept in the master) | — |

Labels, short labels, definitions and colours live in `src/lib/data/taxonomy.ts` (colours: one hue per family).

## Positions

`scripts/geocode-irf.mjs` asks Nominatim (1 request/second, generic user agent, results cached) in this order:
1. the street address, only when its province belongs to the REGION of the row → `precision: address`;
2. CITY + REGION → `precision: city`;
3. REGION → `precision: region`.

Rows without a region are not placed. Players sharing a point are fanned out on the map so each stays clickable. The profile states when a position is approximate.

## Public schema (`PublicPlayer`)

`id, slug, name, categories[], status, website, websiteHost, description, logo, industries[], location {country, region, province, city, address, lat, lng, precision, source}, mainType` — see `src/lib/data/schema.ts` (zod).

## Leads (approval queue)

The one-time sign-up (name, surname, email, consent) asked before downloads and embed codes is appended, create-only, to an Airtable table on a **separate staging base** (`AIRTABLE_LEADS_*`, `src/lib/leads-airtable.ts`). Columns: Nome, Cognome, Email, Referente, Organizzazione, Motivo, Dettaglio, Lingua, Consenso marketing, UTM, Ricevuto il, Stato (= "Da approvare"). The team approves contacts there before moving them into Rainmakers OS. The build fails if this module uses the data-base credentials, any verb other than POST, or lacks the guard against the data base id.

## Updating the data

```
npm run data:import -- data/source/irf-database.csv "<path>/LOGHI PLAYER"   # CSV + logos
npm run data:geocode                                                      # new addresses only
npm run infographic:build                                                 # downloadable PNGs
```

Every import rewrites `docs/data-quality.md` with what needs fixing in the source.
