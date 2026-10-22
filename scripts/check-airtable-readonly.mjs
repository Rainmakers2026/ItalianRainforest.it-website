// Static guard for the READ-ONLY Airtable policy (PRD §30, §61).
// Fails (exit 1) when:
//   1. any file other than the dedicated client references the Airtable API host;
//   2. the dedicated client contains a write verb (POST/PATCH/PUT/DELETE) or a non-GET method;
//   3. Airtable write endpoints/SDK helpers appear anywhere in the source.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIRS = ['src', 'scripts'];
const CLIENT = path.join('src', 'lib', 'data', 'airtable-readonly.ts');
const SELF = path.join('scripts', 'check-airtable-readonly.mjs');

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
      } else if (API_HOST.test(code)) {
        violations.push(`${rel}: references api.airtable.com outside ${CLIENT}`);
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
  console.log('✔ Airtable read-only policy: no write paths found.');
}
