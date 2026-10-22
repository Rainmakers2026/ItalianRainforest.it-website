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

async function airtableGet(cfg: AirtableConfig, params: URLSearchParams): Promise<ListResponse> {
  const url = `${API}/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(cfg.table)}?${params}`;
  const init = {
    method: 'GET' as const,
    headers: { Authorization: `Bearer ${cfg.token}` },
    next: { revalidate: Number(process.env.DATA_REVALIDATE_SECONDS ?? 3600) },
  };
  if (init.method !== 'GET') throw new Error('Airtable client is read-only');
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Airtable read failed (${res.status})`);
  return (await res.json()) as ListResponse;
}

/** Reads every record of the configured table/view, following pagination. */
export async function readAllRecords(cfg: AirtableConfig) {
  const out: ListResponse['records'] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (cfg.view) params.set('view', cfg.view);
    if (offset) params.set('offset', offset);
    const page = await airtableGet(cfg, params);
    out.push(...page.records);
    offset = page.offset;
  } while (offset);
  return out;
}
