import { getDataset, getExportColumns } from '@/lib/data/provider';
import { buildExport, toCsv, toJsonRecords } from '@/lib/export';
import {
  clientKey,
  deliverLead,
  DownloadRequestSchema,
  downloadRequiresEmail,
  isSameOrigin,
  json,
  looksAutomated,
  rateLimited,
  sinkConfigured,
} from '@/lib/leads';
import { SITE } from '@/lib/site';

type Format = 'csv' | 'json' | 'pdf';

/**
 * The only endpoint for data files. Built from the public dataset only (never the master),
 * in the column structure of the Rainmakers OS master: same names, number and order,
 * reserved columns present with empty cells (CLAUDE.md "Downloads").
 * "pdf" returns the same table as JSON for the client-side PDF renderer.
 */
async function buildFile(query: string, format: Format) {
  const [{ players, updatedAt }, schema] = await Promise.all([getDataset(), getExportColumns()]);
  const { scope, columns, rows } = buildExport(players, schema, new URLSearchParams(query));
  const stamp = updatedAt.slice(0, 10);
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'x-row-count': String(rows.length),
    'x-export-scope': scope,
  };
  if (format === 'pdf') {
    return new Response(JSON.stringify({ columns, rows }), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  }
  const attribution = `Italian Rainforest (${SITE.url}) — copyleft, non-commercial use — ${stamp}`;
  const name = `italian-rainforest-${scope === 'all' ? 'full-' : ''}${stamp}.${format}`;
  const body =
    format === 'csv'
      ? toCsv(columns, rows)
      : JSON.stringify({ source: attribution, updatedAt, count: rows.length, columns, data: toJsonRecords(columns, rows) }, null, 2);
  return new Response(body, {
    headers: {
      ...headers,
      'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
    },
  });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  if (rateLimited(`download:${clientKey(req)}`, 20)) return json({ error: 'rate' }, 429);
  const parsed = DownloadRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  const data = parsed.data;
  if (!looksAutomated(data) && sinkConfigured()) {
    // Recording the lead must not block access to open data.
    await deliverLead({ kind: 'download', ...data }).catch((err) => console.error('[download] lead', (err as Error).message));
  }
  return buildFile(data.query, data.format);
}

export async function GET(req: Request) {
  if (downloadRequiresEmail()) return json({ error: 'email_required' }, 405);
  const url = new URL(req.url);
  if (rateLimited(`download:${clientKey(req)}`, 20)) return json({ error: 'rate' }, 429);
  const f = url.searchParams.get('format');
  const format: Format = f === 'json' || f === 'pdf' ? f : 'csv';
  return buildFile(url.searchParams.toString(), format);
}
