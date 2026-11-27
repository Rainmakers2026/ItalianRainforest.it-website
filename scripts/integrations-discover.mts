/**
 * READ-ONLY discovery of the RAINFOREST RADAR integrations, to fill the ids in .env.local:
 *   Brevo   — lists (with folder and size), templates, contact attributes, webhooks
 *   Airtable — tables of the sync base and the field-type check of the two newsletter tables
 * Only GET requests. Prints ids, names and counts — never a key, never a contact.
 *
 *   npm run integrations:discover
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
}
const env = (k: string) => process.env[k]?.trim() ?? '';

// ---------------------------------------------------------------- Brevo (GET only)
async function brevo<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.brevo.com${path}`, { headers: { 'api-key': env('BREVO_API_KEY'), accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.log(`  GET ${path.split('?')[0]} → HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

console.log('=== BREVO ===');
if (!env('BREVO_API_KEY')) console.log('  BREVO_API_KEY missing in .env.local');
else {
  const acct = await brevo<{ companyName?: string; plan?: { type?: string }[] }>('/v3/account');
  if (acct) console.log(`  account: ${acct.companyName ?? '?'} · plan ${acct.plan?.map((p) => p.type).join(', ') ?? '?'}`);
  const folders = await brevo<{ folders?: { id: number; name: string }[] }>('/v3/contacts/folders?limit=50&offset=0');
  const folderName = new Map((folders?.folders ?? []).map((f) => [f.id, f.name]));
  const lists = await brevo<{ lists?: { id: number; name: string; folderId: number; totalSubscribers?: number; uniqueSubscribers?: number }[] }>('/v3/contacts/lists?limit=50&offset=0');
  console.log('  lists (id · name · folder · contacts):');
  for (const l of lists?.lists ?? []) console.log(`    ${l.id} · ${l.name} · ${folderName.get(l.folderId) ?? l.folderId} · ${l.uniqueSubscribers ?? l.totalSubscribers ?? '?'}`);
  const tpl = await brevo<{ templates?: { id: number; name: string; isActive: boolean; tag?: string; subject?: string; htmlContent?: string }[] }>('/v3/smtp/templates?limit=100&offset=0&templateStatus=true');
  const all = await brevo<{ templates?: { id: number; name: string; isActive: boolean; tag?: string; subject?: string; htmlContent?: string }[] }>('/v3/smtp/templates?limit=100&offset=0');
  console.log('  transactional / DOI templates (id · name · active · subject · uses DOIurl):');
  for (const t of all?.templates ?? tpl?.templates ?? []) console.log(`    ${t.id} · ${t.name} · ${t.isActive ? 'active' : 'inactive'} · ${t.subject ?? ''} · ${/params\.DOIurl|doubleoptin/i.test(t.htmlContent ?? '') ? 'yes' : 'no'}`);
  const attrs = await brevo<{ attributes?: { name: string; category: string; type?: string }[] }>('/v3/contacts/attributes');
  const names = (attrs?.attributes ?? []).filter((a) => a.category === 'normal').map((a) => a.name);
  console.log(`  contact attributes (normal): ${names.join(', ') || '—'}`);
  for (const need of ['FIRSTNAME', 'LASTNAME', 'LANGUAGE', 'SUPABASE_ID', 'SOURCE', 'SOURCE_FORM']) console.log(`    ${need}: ${names.includes(need) ? 'present' : 'MISSING'}`);
  const hooks = await brevo<{ webhooks?: { id: number; url: string; events: string[]; type: string; description?: string }[] }>('/v3/webhooks?type=marketing');
  console.log('  marketing webhooks (id · host · events):');
  for (const h of hooks?.webhooks ?? []) console.log(`    ${h.id} · ${(() => { try { return new URL(h.url).host; } catch { return '?'; } })()} · ${h.events.join(', ')}`);
  if (!(hooks?.webhooks ?? []).length) console.log('    —');
}

// ---------------------------------------------------------------- Airtable (GET only)
console.log('\n=== AIRTABLE ===');
if (!env('AIRTABLE_SYNC_PAT') || !env('AIRTABLE_SYNC_BASE_ID')) console.log('  AIRTABLE_SYNC_PAT / AIRTABLE_SYNC_BASE_ID missing in .env.local');
else {
  const { checkSchema } = await import('../src/lib/newsletter/airtable.ts');
  const { airtableApiBase } = await import('../src/lib/newsletter/config.ts');
  // Table ids may not be known yet: the check lists the base's tables anyway.
  const cfg = {
    pat: env('AIRTABLE_SYNC_PAT'),
    baseUrl: airtableApiBase(),
    baseId: env('AIRTABLE_SYNC_BASE_ID'),
    subscribersTableId: env('AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID') || 'tbl-not-set',
    unsubscribersTableId: env('AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID') || 'tbl-not-set',
    userRequestsTableId: null,
  };
  if (cfg.baseId === env('AIRTABLE_BASE_ID')) {
    console.log('  AIRTABLE_SYNC_BASE_ID is the read-only Rainmakers OS base: refused');
  } else {
    try {
      const { tables, rows } = await checkSchema(cfg);
      console.log('  tables of the sync base (id · name):');
      for (const t of tables) console.log(`    ${t.id} · ${t.name}`);
      console.log('\n  | TABLE | FIELD NAME | CURRENT TYPE | EXPECTED TYPE | ACTION REQUIRED |');
      for (const r of rows) console.log(`  | ${r.table} | ${r.field} | ${r.current} | ${r.expected} | ${r.action} |`);
    } catch (err) {
      console.log(`  ${(err as Error).message}`);
    }
  }
}
