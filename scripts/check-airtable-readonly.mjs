// Static guard for the READ-ONLY Airtable policy (PRD §30, §61).
// The data base ("Rainmakers OS") is read-only. The only write path allowed is the
// create-only lead approval queue in src/lib/leads-airtable.ts, on a separate base.
// Fails (exit 1) when:
//   1. any file other than the two dedicated clients references the Airtable API host;
//   2. the dedicated client contains a write verb (POST/PATCH/PUT/DELETE) or a non-GET method;
//   3. Airtable write endpoints/SDK helpers appear anywhere in the source.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIRS = ['src', 'scripts'];
const CLIENT = path.join('src', 'lib', 'data', 'airtable-readonly.ts');
const SELF = path.join('scripts', 'check-airtable-readonly.mjs');
const LEADS = path.join('src', 'lib', 'leads-airtable.ts');
// RAINFOREST RADAR one-way sync (Supabase → the dedicated base "IRF push da Supabase").
const SYNC_CLIENT = path.join('src', 'lib', 'newsletter', 'airtable.ts');
const SYNC_CONFIG = path.join('src', 'lib', 'newsletter', 'config.ts');

const API_HOST = /api\.airtable\.com/i;
const WRITE_VERB = /\b(POST|PATCH|PUT|DELETE)\b/;
const SDK_WRITES = /\b(createRecords?|updateRecords?|replaceRecords?|destroyRecords?|\.create\(|\.update\(|\.replace\(|\.destroy\()/;
const AIRTABLE_PKG = /from\s+['"]airtable['"]|require\(['"]airtable['"]\)/;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(m?[jt]sx?|cjs)$/.test(e.name)) yield p;
  }
}

export async function findViolations() {
  const violations = [];
  for (const d of SRC_DIRS) {
    for await (const abs of walk(path.join(root, d))) {
      const rel = path.relative(root, abs);
      if (rel === SELF) continue;
      const code = await readFile(abs, 'utf8');
      if (AIRTABLE_PKG.test(code)) violations.push(`${rel}: imports the Airtable SDK (use the read-only REST client)`);
      if (rel === CLIENT) {
        // Strip comments, then forbid write verbs and any method other than GET.
        const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        if (WRITE_VERB.test(body)) violations.push(`${rel}: contains a write HTTP verb`);
        for (const m of body.matchAll(/method\s*:\s*['"`](\w+)['"`]/g)) if (m[1] !== 'GET') violations.push(`${rel}: method ${m[1]}`);
        if (SDK_WRITES.test(body)) violations.push(`${rel}: contains an Airtable write helper`);
      } else if (rel === LEADS) {
        // Create-only: POST is the single verb, it must use the AIRTABLE_LEADS_* credentials
        // and must guard against the data base id.
        const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        for (const m of body.matchAll(/method\s*:\s*['"`](\w+)['"`]/g)) if (m[1] !== 'POST') violations.push(`${rel}: method ${m[1]}`);
        if (/\b(PATCH|PUT|DELETE)\b/.test(body)) violations.push(`${rel}: contains an update/delete verb`);
        if (/process\.env\.AIRTABLE_(TOKEN|TABLE|VIEW)\b/.test(body)) violations.push(`${rel}: uses the data-base credentials`);
        if (!/baseId === process\.env\.AIRTABLE_BASE_ID/.test(body)) violations.push(`${rel}: missing the data-base guard`);
      } else if (rel === SYNC_CLIENT || rel === SYNC_CONFIG) {
        // Sync base only: its own credentials, never the data-base token / table / view,
        // and an explicit guard against the read-only data base id.
        const body = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        if (/process\.env\.AIRTABLE_(TABLE|VIEW)\b/.test(body)) violations.push(`${rel}: uses the data-base table / view`);
        if (/process\.env\.AIRTABLE_TOKEN\b/.test(body) && !/pat === process\.env\.AIRTABLE_TOKEN/.test(body)) violations.push(`${rel}: uses the data-base token`);
        if (!/baseId === process\.env\.AIRTABLE_BASE_ID/.test(body)) violations.push(`${rel}: missing the data-base guard`);
        if (rel === SYNC_CONFIG && !/AIRTABLE_SYNC_PAT/.test(body)) violations.push(`${rel}: must read AIRTABLE_SYNC_PAT`);
        if (/\bPUT\b/.test(body)) violations.push(`${rel}: PUT (destructive replace) is not allowed`);
      } else if (API_HOST.test(code)) {
        violations.push(`${rel}: references api.airtable.com outside ${CLIENT} / ${LEADS}`);
      }
    }
  }
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = await findViolations();
  if (v.length) {
    console.error('✖ Airtable read-only policy violated:\n  - ' + v.join('\n  - '));
    process.exit(1);
  }
  console.log('✔ Airtable policy: data base read-only, leads create-only on the staging base.');
}
