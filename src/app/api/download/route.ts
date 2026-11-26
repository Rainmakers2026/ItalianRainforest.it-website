import { getDataset, getExportColumns } from '@/lib/data/provider';
import { buildExport, exportFilename, publicColumnsOnly, toCsv } from '@/lib/export';
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
import { toXlsx, XLSX_MIME } from '@/lib/xlsx';

/**
 * "csv" and "xlsx" are the files (master structure, reserved headers with empty cells);
 * "table" is the list for the map PDF, as JSON, with the public columns only.
 */
type Format = 'csv' | 'xlsx' | 'table';

/**
 * The only endpoint for data files (CLAUDE.md "Downloads", "Export pipeline"). Built from
 * the public dataset only (never the master), in the column structure of the Rainmakers OS
 * master: same names, number and order, reserved columns present with empty cells.
 */
async function buildFile(query: string, format: Format) {
  const [{ players }, schema] = await Promise.all([getDataset(), getExportColumns()]);
  const { scope, columns, rows } = buildExport(players, schema, new URLSearchParams(query));
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'x-row-count': String(rows.length),
    'x-export-scope': scope,
  };
  if (format === 'table') {
    return new Response(JSON.stringify(publicColumnsOnly(columns, rows)), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  }
  const name = exportFilename(scope, format);
  const body = format === 'csv' ? toCsv(columns, rows) : new Uint8Array(toXlsx(columns, rows));
  return new Response(body, {
    headers: {
      ...headers,
      'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : XLSX_MIME,
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
  const format: Format = f === 'xlsx' || f === 'table' ? f : 'csv';
  return buildFile(url.searchParams.toString(), format);
}
