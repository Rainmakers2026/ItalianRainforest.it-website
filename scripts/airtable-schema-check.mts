/**
 * READ-ONLY check of the RAINFOREST RADAR Airtable tables against the PRD schema.
 * Needs AIRTABLE_SYNC_PAT (scope schema.bases:read), AIRTABLE_SYNC_BASE_ID and the two
 * table ids in .env.local. It never changes the schema (the Web API cannot change a
 * field type; see docs/newsletter.md for the manual steps).
 *
 *   npm run airtable:schema-check
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
}
const { airtableSyncConfig } = await import('../src/lib/newsletter/config.ts');
const { checkSchema } = await import('../src/lib/newsletter/airtable.ts');

const cfg = airtableSyncConfig();
if (!cfg) {
  console.error('Missing AIRTABLE_SYNC_PAT / AIRTABLE_SYNC_BASE_ID / AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID / AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID in .env.local');
  console.error('(run `npm run integrations:discover -- --apply` first: it finds the table ids by name)');
  process.exit(2);
}
// IRF - USERS REQUESTS is checked too (by id, or by exact name when the id is not set).
if (!cfg.userRequestsTableId) cfg.userRequestsTableId = null;
const { tables, rows } = await checkSchema(cfg);
console.log('Tables in the base:');
for (const t of tables) console.log(`  ${t.id}  ${t.name}`);
console.log('\n| TABLE | FIELD NAME | FIELD ID | CURRENT TYPE | EXPECTED TYPE | ACTION REQUIRED |\n|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.table} | ${r.field} | ${r.fieldId ?? '—'} | ${r.current} | ${r.expected} | ${r.action} |`);
const todo = rows.filter((r) => r.action !== 'OK' && !r.action.startsWith('extra field'));
console.log(`\n${todo.length} field(s) to fix.`);
process.exit(todo.length ? 1 : 0);
