import 'server-only';

/**
 * The ONLY module allowed to talk to Airtable.
 *
 * Italian Rainforest is READ-ONLY towards Airtable: this client exposes a single
 * `airtableGet` function, hard-codes `method: 'GET'` and rejects anything else at
 * runtime. scripts/check-airtable-readonly.mjs fails the build if any other file
 * references the Airtable API or if a write verb appears next to it.
 */

const API = 'https://api.airtable.com/v0';

export type AirtableConfig = { token: string; baseId: string; table: string; view?: string };

export function airtableConfigFromEnv(): AirtableConfig | null {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE;
  if (!token || !baseId || !table) return null;
  return { token, baseId, table, view: process.env.AIRTABLE_VIEW || undefined };
}

type ListResponse = { records: { id: string; createdTime: string; fields: Record<string, unknown> }[]; offset?: string };

async function airtableGet<T = ListResponse>(cfg: AirtableConfig, url: string): Promise<T> {
  const init = {
    method: 'GET' as const,
    headers: { Authorization: `Bearer ${cfg.token}` },
    next: { revalidate: Number(process.env.DATA_REVALIDATE_SECONDS ?? 3600) },
  };
  if (init.method !== 'GET') throw new Error('Airtable client is read-only');
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Airtable read failed (${res.status})`);
  return (await res.json()) as T;
}

/**
 * Column names of the configured table, in order, from the Airtable Metadata API: names
 * only, never values. Shapes the downloadable files (new master columns appear as empty
 * headers). Null when unavailable (e.g. token without the schema.bases:read scope).
 */
export async function readTableColumns(cfg: AirtableConfig): Promise<string[] | null> {
  try {
    const meta = await airtableGet<{ tables: { id: string; name: string; fields: { name: string }[] }[] }>(
      cfg,
      `${API}/meta/bases/${encodeURIComponent(cfg.baseId)}/tables`,
    );
    const table = meta.tables.find((t) => t.id === cfg.table || t.name === cfg.table);
    return table ? table.fields.map((f) => f.name) : null;
  } catch {
    return null;
  }
}

/**
 * Reads every record of the configured table/view, following pagination. `fields` is the
 * public allowlist: only those columns are requested, so reserved values (REFERENCE,
 * INFORMATION SOURCE, SECONDARY TYPE, PHONE, EMAIL) are never even fetched.
 */
export async function readAllRecords(cfg: AirtableConfig, fields: readonly string[]) {
  const out: ListResponse['records'] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    for (const f of fields) params.append('fields[]', f);
    if (cfg.view) params.set('view', cfg.view);
    if (offset) params.set('offset', offset);
    const page = await airtableGet(cfg, `${API}/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(cfg.table)}?${params}`);
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}
