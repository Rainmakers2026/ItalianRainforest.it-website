import { getDataset } from '@/lib/data/provider';
import { parseDownloadFields } from '@/lib/download-fields';
import { exportRows, selectForExport, toCsv } from '@/lib/export';
import type { Locale } from '@/lib/i18n/config';
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

async function buildFile(query: string, format: 'csv' | 'json', locale: Locale) {
  const { players, updatedAt } = await getDataset();
  // Only the public dataset, never the master file. "filtered": same filters + search as on
  // screen (map or database), every result, no pagination. "all": every publishable player.
  const sp = new URLSearchParams(query);
  const { scope, list } = selectForExport(players, sp);
  const rows = exportRows(list, locale, parseDownloadFields(sp.get('fields')));
  const stamp = updatedAt.slice(0, 10);
  const attribution = `Italian Rainforest (${SITE.url}) — copyleft, non-commercial use — ${stamp}`;
  const name = `italian-rainforest-${scope === 'all' ? 'full-' : ''}${stamp}.${format}`;
  const body =
    format === 'csv'
      ? toCsv(rows, attribution)
      : JSON.stringify({ source: attribution, updatedAt, count: rows.length, data: rows }, null, 2);
  return new Response(body, {
    headers: {
      'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
      'x-row-count': String(rows.length),
      'x-export-scope': scope,
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
  return buildFile(data.query, data.format, data.locale);
}

export async function GET(req: Request) {
  if (downloadRequiresEmail()) return json({ error: 'email_required' }, 405);
  const url = new URL(req.url);
  if (rateLimited(`download:${clientKey(req)}`, 20)) return json({ error: 'rate' }, 429);
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'it';
  return buildFile(url.searchParams.toString(), format, locale);
}
