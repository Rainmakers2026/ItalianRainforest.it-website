import { clientKey, isSameOrigin, json, looksAutomated, NewsletterSignupSchema, rateLimited } from '@/lib/leads';
import { NewsletterUnavailable, signupAvailable, subscribe } from '@/lib/newsletter/service';
import { storeConfigured } from '@/lib/supabase/store';

/**
 * RAINFOREST RADAR — dedicated sign-up form. Saves the contact (PENDING) and starts the
 * Brevo double opt-in BEFORE answering: "check your inbox" is shown only when Brevo accepted
 * the request. The answer never reveals whether an address is already known: a known,
 * confirmed or blocked address gets the same answer as a new one.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  if (rateLimited(`newsletter:${clientKey(req)}`)) return json({ error: 'rate' }, 429);

  const parsed = NewsletterSignupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  const d = parsed.data;
  if (looksAutomated(d)) return json({ ok: true });
  // Nothing is written when the double opt-in cannot be started.
  if (!storeConfigured() || !signupAvailable()) {
    console.error('[newsletter] RAINFOREST RADAR not configured (Supabase / Brevo / NEWSLETTER_TOKEN_SECRET): signup refused');
    return json({ error: 'unavailable' }, 503);
  }
  try {
    await subscribe(
      { email: d.email, firstName: d.firstName, lastName: d.lastName, locale: d.locale, sourceForm: 'NEWSLETTER_SIGNUP', privacyAcknowledged: true, origin: d.origin, utm: d.utm, requestId: d.requestId },
      'dedicated',
    );
    return json({ ok: true });
  } catch (err) {
    console.error('[newsletter]', err instanceof NewsletterUnavailable ? err.message : (err as Error).message);
    return json({ error: 'unavailable' }, 503);
  }
}
