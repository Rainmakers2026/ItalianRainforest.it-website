import { json } from '@/lib/leads';
import { brevoConfig } from '@/lib/newsletter/config';
import { handleBrevoEvent } from '@/lib/newsletter/service';
import { bearerMatches } from '@/lib/newsletter/token';

/**
 * Brevo marketing webhook (event "unsubscribe"), authenticated with the bearer token set
 * when the webhook is created in Brevo (auth: { type: "bearer", token: BREVO_WEBHOOK_SECRET }).
 * Single or batched payloads. Duplicates and out-of-order events are recognised in the
 * history (newsletter_consent_events); the answer carries counts only.
 */
export async function POST(req: Request) {
  const cfg = brevoConfig();
  if (!cfg?.webhookSecret) return json({ error: 'unavailable' }, 503);
  if (!bearerMatches(req.headers.get('authorization'), cfg.webhookSecret)) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => null)) as unknown;
  const events = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : null;
  if (!events || events.length > 500) return json({ error: 'invalid' }, 400);
  const counts: Record<string, number> = {};
  for (const e of events) {
    try {
      const r = await handleBrevoEvent(e as Parameters<typeof handleBrevoEvent>[0]);
      counts[r] = (counts[r] ?? 0) + 1;
    } catch (err) {
      console.error('[newsletter:webhook]', (err as Error).message);
      // Brevo retries on a non-2xx answer: the history makes the retry idempotent.
      return json({ error: 'retry' }, 500);
    }
  }
  return json({ ok: true, counts });
}
