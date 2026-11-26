import { json } from '@/lib/leads';
import { cronSecret } from '@/lib/newsletter/config';
import { reconcile } from '@/lib/newsletter/service';
import { bearerMatches } from '@/lib/newsletter/token';
import { storeConfigured } from '@/lib/supabase/store';

/**
 * RAINFOREST RADAR reconciliation: double opt-in retries, confirmations seen late, missing
 * welcome emails, unsubscriptions missed by the webhook, Airtable retries.
 * `Authorization: Bearer <NEWSLETTER_CRON_SECRET | CRON_SECRET>` (Vercel Cron sends GET).
 */
async function run(req: Request) {
  if (!bearerMatches(req.headers.get('authorization'), cronSecret())) return json({ error: 'unauthorized' }, 401);
  if (!storeConfigured()) return json({ error: 'unavailable' }, 503);
  try {
    return json({ ok: true, report: await reconcile() });
  } catch (err) {
    console.error('[newsletter:reconcile]', (err as Error).message);
    return json({ error: 'failed' }, 500);
  }
}

export const GET = run;
export const POST = run;
export const maxDuration = 60;
