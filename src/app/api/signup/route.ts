import { clientKey, deliverLead, isSameOrigin, json, looksAutomated, rateLimited, SignupSchema, sinkConfigured } from '@/lib/leads';

/**
 * One-time sign-up that unlocks downloads and contact reveals (lead magnet).
 * The lead goes to LEAD_WEBHOOK_URL like every other submission (never Airtable);
 * the browser keeps the profile so the visitor is not asked again.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  if (rateLimited(`signup:${clientKey(req)}`)) return json({ error: 'rate' }, 429);

  const parsed = SignupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  const data = parsed.data;
  // Pretend success to bots, store nothing.
  if (looksAutomated(data)) return json({ ok: true });
  // As for downloads: recording the lead must never block access to open data.
  if (!sinkConfigured()) {
    console.error('[signup] LEAD_WEBHOOK_URL not configured: lead not recorded');
    return json({ ok: true });
  }
  await deliverLead({ kind: 'signup', ...data }).catch((err) => console.error('[signup]', (err as Error).message));
  return json({ ok: true });
}
