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
                        GatedContacts  ──▶ /api/contact-request only
```

The provider is chosen automatically: Airtable when `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE` are set, otherwise the snapshot. If Airtable fails, the last good copy (or the snapshot) is served. The browser never receives the raw record or the Airtable record id.

Logos and geocoded positions are keyed by **company name** (`nameKey()`), so they are reused when the site switches to Airtable and a record has no LOGO attachment or coordinates.

## Columns (CSV export = Airtable "Rainmakers OS")

| Column | Public | Maps to |
|---|---|---|
| COMPANY NAME (`Map` in the CSV) | ✔ | `name`, `slug` |
| WEBSITE | ✔ | `website`, `websiteHost` (normalised, tracking params removed) |
| SHORT DESCRIPTION | ✔ | `description` (cookie/404 boilerplate dropped by the importer) |
| PLAYER TYPE (multi, `;`-separated in the CSV) | ✔ | `categories` — STARTUP rows are excluded |
| ADDRESS | ✔ | `location.address` — hidden when it contradicts REGION |
| REGION | ✔ | `location.region` (slug) |
| CITY | ✔ | `location.city` (normalised: Turin → Torino, …) |
| INDUSTRY | ✔ | `industries` |
| STATUS | ✔ | `status`: ACTIVE → `active`, INACTIVE → `inactive`, DA VERIFICARE/empty → `unverified` |
| LOGO (attachment in Airtable; SI/NO in the CSV) | ✔ | `logo` {src, w, h, tone} |
| OPEN STREET MAP | ✔ | `location.lat/lng` when the link carries coordinates |
| EMAIL, PHONE, REFERENCE | ✖ gated | `GatedContacts` (never public, never exported) |
| REFERENCE, INFORMATION SOURCE | ✖ | not used |

Other names can be mapped without code changes: `AIRTABLE_FIELD_MAP='{"name":"Company"}'` (keys in `src/lib/data/normalize.ts`).

"DA VERIFICARE", "Not Answered" and empty cells are treated as missing values.

## Player types → categories → families

| PLAYER TYPE | Category key | Family |
|---|---|---|
| EMPOWERMENT PROGRAM | `programs` | personal |
| CORSI DI FORMAZIONE | `training` | personal |
| INCUBATOR/ACCELERATOR | `incubator` | business |
| VENTURE BUILDER/STARTUP STUDIO | `venture-builder` | business |
| PST | `science-park` | business |
| VC | `vc` | financial |
| CVC | `cvc` | financial |
| BAN/CLUB DEAL | `angels` | financial |
| CROWDFUNDING PLATFORM | `crowdfunding` | financial |
| FAMILY OFFICE | `family-office` | financial |
| INSTITUTIONS | `institution` | environmental |
| ASSOCIATIONS | `associations` | environmental |
| MEDIA | `media` | environmental |
| COWORKING | `coworking` | environmental |
| Altri abilitatori | `other` | — |
| STARTUP | excluded | — |

Labels, short labels, definitions and colours live in `src/lib/data/taxonomy.ts` (colours: one hue per family).

## Positions

`scripts/geocode-irf.mjs` asks Nominatim (1 request/second, generic user agent, results cached) in this order:
1. the street address, only when its province belongs to the REGION of the row → `precision: address`;
2. CITY + REGION → `precision: city`;
3. REGION → `precision: region`.

Rows without a region are not placed. Players sharing a point are fanned out on the map so each stays clickable. The profile states when a position is approximate.

## Public schema (`PublicPlayer`)

`id, slug, name, categories[], status, website, websiteHost, description, logo, industries[], location {country, region, province, city, address, lat, lng, precision, source}, hasGatedContacts` — see `src/lib/data/schema.ts` (zod).

## Leads (approval queue)

The one-time sign-up (name, surname, email, consent) asked before downloads and embed codes is appended, create-only, to an Airtable table on a **separate staging base** (`AIRTABLE_LEADS_*`, `src/lib/leads-airtable.ts`). Columns: Nome, Cognome, Email, Referente, Organizzazione, Motivo, Dettaglio, Lingua, Consenso marketing, UTM, Ricevuto il, Stato (= "Da approvare"). The team approves contacts there before moving them into Rainmakers OS. The build fails if this module uses the data-base credentials, any verb other than POST, or lacks the guard against the data base id.

## Updating the data

```
npm run data:import -- data/source/irf-database.csv "<path>/LOGHI PLAYER"   # CSV + logos
npm run data:geocode                                                      # new addresses only
npm run infographic:build                                                 # downloadable PNGs
```

Every import rewrites `docs/data-quality.md` with what needs fixing in the source.
