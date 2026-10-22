import { clientKey, deliverLead, isSameOrigin, json, looksAutomated, rateLimited, sinkConfigured, SuggestionSchema } from '@/lib/leads';

// "Suggest an update": goes to the moderation sink, never to Airtable.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  if (rateLimited(`suggest:${clientKey(req)}`)) return json({ error: 'rate' }, 429);

  const parsed = SuggestionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  if (looksAutomated(parsed.data)) return json({ ok: true });
  if (!sinkConfigured()) return json({ error: 'unavailable' }, 503);

  try {
    await deliverLead({ kind: 'suggestion', ...parsed.data });
    return json({ ok: true });
  } catch (err) {
    console.error('[suggest]', (err as Error).message);
    return json({ error: 'unavailable' }, 503);
  }
}
