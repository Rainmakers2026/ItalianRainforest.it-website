# Second copy / SEO / GEO / QA audit — 22/10/2026

Run on the production build after implementation (PRD §57, §67).

## Copy
| Check | Result |
|---|---|
| Clarity, tone IT (direct, collective voice, short sentences) | ✔ |
| EN natural, not literal (no "valorization", "territory") | ✔ ("organisations", "programmes", "who it's for") |
| CTA consistency | ✔ Esplora la mappa / Explore the map (header + hero), Esplora il database, Richiedi i contatti / Get contact details, Segnala un aggiornamento / Suggest an update, Copia codice / Copy code |
| Duplications | Hero lead and Why definition intentionally overlap (definition is the citable version). |
| IT/EN parity | ✔ Same keys, typed (`Dictionary`), build fails if a key is missing. |
| Invented content | ✔ None: no partners, press, reviews or licence name invented; sections hidden until verified data exists. |

## SEO
| Check | Result |
|---|---|
| Titles | IT 53 chars, EN 60 chars |
| Descriptions | IT 160, EN 146 chars, with live count |
| One H1 per page | ✔ |
| Heading hierarchy | ✔ H1 → H2 per section → H3 inside |
| Canonical + hreflang it / en / x-default | ✔ (from `NEXT_PUBLIC_SITE_URL`) |
| `<html lang>` | it-IT / en |
| sitemap.xml with alternates, robots.txt | ✔ |
| OG / Twitter metadata + generated OG image per locale | ✔ |
| JSON-LD | Organization (Rainmakers), WebSite, Dataset, FAQPage — all matching visible content |
| Alt text | ✔ every image; decorative SVG `aria-hidden` |
| Crawlability without JS | ✔ All editorial content, numbers, categories, FAQ and section headings are server-rendered; the map is not the only source of information. |
| Embeds | `noindex`, canonical to the main page |
| Privacy draft | `noindex` until final |

## GEO (answer engines)
Explicit, server-rendered answers to:
- What is Italian Rainforest? — Why definition + FAQ 1
- Who created it? — definition, Who, FAQ 11, JSON-LD publisher
- What does it map? / Who can be included? — FAQ 2, categories list
- How many organisations? — hero stats, definition, FAQ 1 (live)
- How are they categorised? — What section definitions + FAQ 3 (live list)
- How often is it updated? — "Last updated" stamps + FAQ 5 (real sync date)
- Can the data be reused? — FAQ 6, footer licence line
- Who is it for? — For Whom section

Numbers are never hard-coded: they come from the dataset at build/revalidation time, always next to a date.

## Accessibility (WCAG 2.2 AA target) — Lighthouse 100
Skip link, visible focus, semantic buttons/links, native `<dialog>` (focus containment, Esc, focus restore), labelled form fields with announced errors, `aria-live` result counts, `aria-pressed` toggles, `aria-sort` on table headers, reduced motion, list = keyboard alternative to the map, colour never the only signal (labels + counts).

## Responsive
Checked at 1440, 1000 (embed) and 390 px: header collapses to menu + "Mappa" CTA; map toolbar becomes Search + Filters bottom sheet; Map | List toggle; tapped marker opens a bottom sheet; database becomes cards.

## Security / data exposure
| Check | Result |
|---|---|
| Public payload `/api/players` | 0 emails, 0 phone numbers, 0 Airtable record ids (pseudonymous ids only) |
| CSV/JSON export | Public fields only; demo positions blank |
| Gated contacts | Only `/api/contact-request`, after email + consent, and only if `REVEAL_GATED_CONTACTS=true` |
| Forms | Zod validation server-side, honeypot, time-to-submit check, per-IP rate limit, same-origin/JSON CSRF check |
| Analytics | No PII (emails, phone-like strings and search text are never sent) |
| Headers | `nosniff`, referrer policy, permissions policy, `X-Frame-Options: SAMEORIGIN` on site pages, `frame-ancestors *` only on embeds |
| Secrets | Airtable token server-side only (`server-only` modules) |

## Airtable write paths — explicitly verified: none
- `scripts/check-airtable-readonly.mjs` runs before every build (`prebuild`) and in the test suite: fails if any file other than `src/lib/data/airtable-readonly.ts` references `api.airtable.com`, if that client contains POST/PATCH/PUT/DELETE or a non-GET method, or if the Airtable SDK is imported.
- The client hard-codes `method: 'GET'` and throws otherwise.
- Lead webhooks refuse Airtable hosts at runtime.
- Result on this build: `✔ Airtable read-only policy: no write paths found.`

## Tests
`npm test` — 14/14 passing (read-only policy, sanitisation, export, URL query state, search).

## Open items before go-live
See `docs/audit.md` §6 (Airtable access and geographic fields, sensitive-field list, privacy text, licence, lead destination, analytics provider, verified proof, final domain).
