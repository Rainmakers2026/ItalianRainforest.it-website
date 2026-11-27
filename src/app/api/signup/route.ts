import { clientKey, deliverLead, isSameOrigin, json, looksAutomated, rateLimited, SignupSchema, sinkConfigured } from '@/lib/leads';
import { recordNewsletter, recordSignup, storeOptional, storeOrFail } from '@/lib/supabase/store';
import { syncUserRequestByRequestId } from '@/lib/supabase/user-requests-sync';

/**
 * One-time sign-up before the first download or embed code (`entry: "registration"`), and
 * the later gated actions with no server request of their own (`entry: "event"`: map PNG,
 * embed code copy). Stored in Supabase — embed → sharing_is_caring_registrations,
 * downloads → download_registrations — before answering: no success if the write failed.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  const body: unknown = await req.json().catch(() => null);
  const event = (body as { entry?: unknown } | null)?.entry === 'event';
  // Events are frequent (each copy / PNG) and come from an already signed-up visitor.
  if (rateLimited(`${event ? 'event' : 'signup'}:${clientKey(req)}`, event ? 30 : 5)) return json({ error: 'rate' }, 429);

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  const data = parsed.data;
  // Pretend success to bots, store nothing.
  if (looksAutomated(data, data.entry === 'event' ? 'action' : 'form')) return json({ ok: true });

  const failed = await storeOrFail('signup', () => recordSignup(data));
  if (failed) return failed;

  if (data.entry === 'registration') {
    // IRF - USERS REQUESTS (Airtable), after the record is safe in Supabase; best effort.
    await syncUserRequestByRequestId(data.reason === 'embed' ? 'sharing_is_caring_registrations' : 'download_registrations', data.requestId);
    if (data.marketing) {
      await storeOptional('signup:newsletter', () =>
        recordNewsletter({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          locale: data.locale,
          sourceForm: data.reason === 'embed' ? 'EMBED_REQUEST' : 'DOWNLOAD_REGISTRATION',
          requestId: data.requestId,
          origin: data.origin,
          utm: data.utm,
        }),
      );
    }
    // Optional extra destination (webhook): best effort, after the record is safe.
    if (sinkConfigured()) await deliverLead({ kind: 'signup', ...data }).catch((err) => console.error('[signup] extra sink', (err as Error).message));
  }
  return json({ ok: true });
}
