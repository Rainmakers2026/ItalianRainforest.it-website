import { getDataset, getGatedContacts } from '@/lib/data/provider';
import { clientKey, ContactRequestSchema, deliverLead, isSameOrigin, json, looksAutomated, rateLimited, sinkConfigured } from '@/lib/leads';

/**
 * Gated contact flow. The public payload never contains contact details; they are
 * returned only here, after a valid request (email + consent) has been recorded.
 * REVEAL_GATED_CONTACTS=false keeps the flow in "request only" mode.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403);
  if (rateLimited(`contact:${clientKey(req)}`)) return json({ error: 'rate' }, 429);

  const parsed = ContactRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid', fields: parsed.error.issues.map((i) => i.path.join('.')) }, 400);
  const data = parsed.data;
  // Pretend success to bots, store nothing.
  if (looksAutomated(data)) return json({ ok: true, contacts: null });
  if (!sinkConfigured()) return json({ error: 'unavailable' }, 503);

  const { players } = await getDataset();
  const player = players.find((p) => p.id === data.playerId);
  if (!player) return json({ error: 'not_found' }, 404);

  try {
    await deliverLead({ kind: 'contact_request', ...data });
  } catch (err) {
    console.error('[contact-request]', (err as Error).message);
    return json({ error: 'unavailable' }, 503);
  }

  const reveal = process.env.REVEAL_GATED_CONTACTS === 'true';
  const contacts = reveal && player.hasGatedContacts ? await getGatedContacts(player.id) : null;
  return json({ ok: true, contacts });
}
