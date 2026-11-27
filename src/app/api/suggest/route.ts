import { clientKey, deliverLead, isSameOrigin, json, looksAutomated, rateLimited, sinkConfigured, SuggestionSchema } from '@/lib/leads';
import { recordNewsletter, recordSuggestion, storeOptional, storeOrFail } from '@/lib/supabase/store';
import { syncUserRequestByRequestId } from '@/lib/supabase/user-requests-sync';

/**
 * "Segnala un aggiornamento / Suggest an update" → Supabase database_update_requests
 * (moderation queue, review_status PENDING). Never written to Airtable. No success if the
 * record could not be saved.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  if (rateLimited(`suggest:${clientKey(req)}`)) return json({ error: 'rate' }, 429);

  const parsed = SuggestionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  const data = parsed.data;
  if (looksAutomated(data)) return json({ ok: true });

  const failed = await storeOrFail('suggest', () => recordSuggestion(data));
  if (failed) return failed;
  // IRF - USERS REQUESTS (Airtable), after the record is safe in Supabase; best effort.
  await syncUserRequestByRequestId('database_update_requests', data.requestId);

  if (data.marketing) {
    await storeOptional('suggest:newsletter', () =>
      recordNewsletter({ email: data.email, locale: data.locale, sourceForm: 'DATABASE_UPDATE_REQUEST', requestId: data.requestId, origin: data.origin, utm: data.utm }),
    );
  }
  if (sinkConfigured()) await deliverLead({ kind: 'suggestion', ...data }).catch((err) => console.error('[suggest] extra sink', (err as Error).message));
  return json({ ok: true });
}
