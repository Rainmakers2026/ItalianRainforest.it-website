# Data schema

## Flow

```
Airtable (READ-ONLY view)  ──GET──▶  AirtableReadOnlyProvider ─┐
data/snapshot/legacy-records.json ─▶ LegacyReadOnlyProvider ───┤
                                                                ▼
                         normalizeRecord() → dedupe() → [applyDemoGeo()]   (server only)
                                                                ▼
                         PublicPlayer[]  ──▶ /api/players (public)  ──▶ map, database, embeds
                         GatedContacts   ──▶ /api/contact-request only (after email + consent)
```

The provider is chosen automatically: Airtable when `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE` are set, otherwise the snapshot. If Airtable fails, the last good copy (or the snapshot) is served and a warning is logged. The browser never receives the raw record or the Airtable record id.

## Source fields (Airtable)

| Airtable field | Exists today | Public | Maps to |
|---|---|---|---|
| Company Name | ✔ | ✔ | `name`, `slug` |
| Account Type (multi) | ✔ | ✔ | `categories` (see taxonomy) |
| Status | ✔ | ✔ | `status` (`active`/`inactive`) |
| Website | ✔ | ✔ | `website`, `websiteHost` (normalised) |
| Hashtags (multi) | ✔ | ✔ | `tags` (synonyms merged, `TBD` dropped) |
| Stage of Investment/Development (multi) | ✔ | ✔ | `stages` |
| Countries of investment (multi) | ✔ | ✔ | `investmentCountries` |
| Created | ✔ | ✔ | `createdAt` |
| Description / Description EN | expected | ✔ | `description.it/en` |
| Logo (attachment) | expected | ✔ | `logo` (thumbnail URL) |
| Country, Region, Province, City | expected | ✔ | `location` (region/province → ISTAT slugs; province accepts name or code, e.g. `MI`) |
| Latitude, Longitude | expected | ✔ | `location.lat/lng` |
| LinkedIn | expected | ✔ | `publicSocial.linkedin` |
| **Email, Phone, Contact Person** | expected | **✘ sensitive** | `GatedContacts` (server only) |

Field names are defined once in `src/lib/data/normalize.ts` (`FIELDS`). Rename there if the base uses different labels.

## PublicPlayer (`src/lib/data/schema.ts`, Zod-validated)

| Field | Type | Notes |
|---|---|---|
| id | string | Pseudonymous: `sha256("irf:" + recordId)` (10 chars). Used in analytics. |
| slug | string | Unique, used in `?player=` deep links. |
| name | string | |
| categories | CategoryKey[] | ≥1; first = primary (marker colour). |
| status | `active` \| `inactive` | Default filter = active. |
| website, websiteHost | string \| null | |
| description | `{ it, en }` | nullable each. |
| logo | url \| null | |
| tags | string[] | |
| stages | StageKey[] | `idea, prototype, early-revenue, scaling, growth, pre-ipo` |
| investmentCountries | string[] | |
| location | `{ country, region, province, city, lat, lng, source }` \| null | `source: 'demo'` = synthetic, never exported. |
| publicSocial | `{ linkedin }` | |
| hasGatedContacts | boolean | Only a flag: the values are never public. |
| createdAt | string \| null | |

## Taxonomy (`src/lib/data/taxonomy.ts`)

| Key | Airtable value | IT | EN |
|---|---|---|---|
| vc | VC | Venture capital | Venture capital |
| incubator | Incubator / Accelerator | Incubatori e acceleratori | Incubators & accelerators |
| cvc | CVC | Corporate venture capital | Corporate venture capital |
| coworking | CoWorking | Coworking | Coworking spaces |
| venture-builder | Startup Studio / Venture Builder | Startup studio e venture builder | Startup studios & venture builders |
| angels | BAN / Club Deal | Business angel e club deal | Business angels & club deals |
| institution | Institution | Istituzioni | Institutions |
| media | Media & Communities | Media e community | Media & communities |
| programs | Empowerment Programs | Programmi di empowerment | Empowerment programmes |
| science-park | PST | Parchi scientifici e tecnologici | Science & technology parks |
| other | Other | Altri abilitatori | Other enablers |
| unclassified | *(empty)* | Da classificare | Not yet classified |

## Geography
Regions (20) and provinces (110, openpolis/ISTAT) with bounding boxes are generated in `src/lib/geo/territories.ts` by `npm run geo:build <source-dir>`. Map shapes are served from `public/geo/*.json` (self-hosted, no tile server).

## Query state (shared by map, database, embeds, CSV)
`?q=&category=vc,cvc&region=lombardia&province=milano&status=active|inactive|all&stage=&tag=&invests=&player=<slug>` — parsed/validated in `src/lib/filters.ts`. Unknown values are ignored; a province outside the selected region is dropped.

## Exports (`/api/download`)
CSV (UTF-8 BOM, formula-injection safe) or JSON, filtered with the same query state. Columns: id, name, categories, status, website, linkedin, description, city, province, region, country, latitude, longitude, focus, stages, investment_countries. **Never** gated contacts, **never** demo positions.
