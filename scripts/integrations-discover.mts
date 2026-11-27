/**
 * READ-ONLY discovery of the RAINFOREST RADAR integrations, to fill the ids in .env.local:
 *   Brevo   — lists (with folder and size), senders, templates (sender, reply-to),
 *             contact attributes, marketing webhooks
 *   Airtable — tables of the sync base, their ids by exact name, and the field-type check
 *             of IRF - USERS REQUESTS, ISCRITTI and DISISCRITTI
 * Only GET requests to the services. Prints ids, names and counts — never a key, never a
 * contact. `--apply` writes the MISSING Airtable table ids (not secrets) to .env.local.
 *
 *   npm run integrations:discover [-- --apply]
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
  const senders = await brevo<{ senders?: { id: number; name: string; email: string; active: boolean }[] }>('/v3/senders');
  console.log('  senders (id · name · email · active):');
  for (const s of senders?.senders ?? []) console.log(`    ${s.id} · ${s.name} · ${s.email} · ${s.active ? 'active' : 'NOT active'}`);
  const radarSender = (senders?.senders ?? []).find((s) => s.email.toLowerCase() === 'italianrainforest@rainmakers.it');
  console.log(`  required sender italianrainforest@rainmakers.it: ${radarSender ? (radarSender.active ? `present and active (name "${radarSender.name}")` : 'present but NOT active') : 'MISSING'}`);
  type Tpl = { id: number; name: string; isActive: boolean; tag?: string; subject?: string; htmlContent?: string; sender?: { name?: string; email?: string }; replyTo?: string };
  const all = await brevo<{ templates?: Tpl[] }>('/v3/smtp/templates?limit=100&offset=0');
  console.log('  templates (id · name · active · subject · sender · reply-to · uses DOIurl):');
  for (const t of all?.templates ?? [])
    console.log(`    ${t.id} · ${t.name} · ${t.isActive ? 'active' : 'inactive'} · ${t.subject ?? ''} · ${t.sender?.email ?? '?'} · ${t.replyTo || '—'} · ${/params\.DOIurl|doubleoptin/i.test(t.htmlContent ?? '') ? 'yes' : 'no'}`);
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
    // Unknown ids → the check finds the tables by their exact names.
    subscribersTableId: env('AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID') || undefined,
    unsubscribersTableId: env('AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID') || undefined,
    userRequestsTableId: env('AIRTABLE_USER_REQUESTS_TABLE_ID') || undefined,
  };
  if (cfg.baseId === env('AIRTABLE_BASE_ID')) {
    console.log('  AIRTABLE_SYNC_BASE_ID is the read-only Rainmakers OS base: refused');
  } else {
    try {
      const { TABLE_NAMES } = await import('../src/lib/newsletter/airtable.ts');
      const { tables, rows } = await checkSchema(cfg);
      console.log('  tables of the sync base (id · name):');
      for (const t of tables) console.log(`    ${t.id} · ${t.name}`);
      // Table ids by exact name (not secret): printed, and with --apply written to .env.local
      // when missing (an existing value is never overwritten).
      const ids: Record<string, string | undefined> = {
        AIRTABLE_USER_REQUESTS_TABLE_ID: tables.find((t) => t.name === TABLE_NAMES.userRequests)?.id,
        AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID: tables.find((t) => t.name === TABLE_NAMES.subscribers)?.id,
        AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID: tables.find((t) => t.name === TABLE_NAMES.unsubscribers)?.id,
      };
      console.log('\n  table ids by exact name:');
      for (const [k, v] of Object.entries(ids)) console.log(`    ${k}=${v ?? 'NOT FOUND'}${env(k) && env(k) !== v ? `  (current .env.local value differs: ${env(k)})` : ''}`);
      if (process.argv.includes('--apply')) {
        const { appendFileSync } = await import('node:fs');
        const add = Object.entries(ids).filter(([k, v]) => v && !env(k));
        if (add.length) appendFileSync('.env.local', `\n# Airtable table ids (by exact name, ${new Date().toISOString().slice(0, 10)})\n${add.map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
        console.log(`  --apply: ${add.length ? `written ${add.map(([k]) => k).join(', ')}` : 'nothing to write'}`);
      }
      console.log('\n  | TABLE | FIELD NAME | CURRENT TYPE | EXPECTED TYPE | ACTION REQUIRED |');
      for (const r of rows) console.log(`  | ${r.table} | ${r.field} | ${r.current} | ${r.expected} | ${r.action} |`);
    } catch (err) {
      console.log(`  ${(err as Error).message}`);
    }
  }
}
