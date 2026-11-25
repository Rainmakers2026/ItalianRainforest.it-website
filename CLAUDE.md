@AGENTS.md

# Italian Rainforest — permanent project rules

## Public data rules (P0 — prevail over any earlier implementation or instruction)

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
4. **Reserved fields never reach the browser** (API, JSON, page payload, static assets,
   downloads): REFERENCE, INFORMATION SOURCE, SECONDARY TYPE, PHONE — plus EMAIL, read
   only server-side for the gated contact request. Use allowlists, never blocklists.
5. **One pipeline, one public dataset.** import → validate/normalise → dedupe → exclude
   STARTUP → other publishability rules (template rows, INACTIVE) → strip reserved fields →
   public dataset → counts computed from it → every component. The rules live only in
   `scripts/import-irf-csv.mjs` (snapshot) and `src/lib/data/normalize.ts` (snapshot and
   Airtable); components never filter on their own and never hide data with CSS.
6. **No hardcoded numbers.** KPIs come from `computeStats()` on the public dataset; the
   per-type counts always add up to the total.
7. **Tests guard it.** `tests/public-data.test.ts` reads the real master export and the
   snapshot. After every database update run `npm run data:import`, `npm run
   infographic:build` and `npm test`; never ship with a failing test.

## Working rules

- No production deploy without explicit approval: publish only on the preview branch
  (`preview/italianrainforest`), never on `main`, never force-push.
- Privacy page: draft awaiting legal validation. Do not present it as approved, do not
  invent company name, VAT number, processors or retention periods.
- Fix only unambiguous typos in the source data; no editorial markers on the site.
