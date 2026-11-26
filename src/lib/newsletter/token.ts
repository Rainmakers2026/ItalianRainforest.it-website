import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed confirmation links: Brevo redirects the recipient to
 * /api/newsletter/confirm?t=<token> only after the click on its double opt-in email.
 * The token binds the subscriber id, the double opt-in cycle and an expiry (HMAC-SHA256).
 */

const TTL_DAYS = 30;
const b64 = (b: Buffer) => b.toString('base64url');

export function signConfirmToken(secret: string, subscriberId: string, cycleId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TTL_DAYS * 86400;
  const payload = `${subscriberId}.${cycleId}.${exp}`;
  return `${b64(Buffer.from(payload))}.${b64(createHmac('sha256', secret).update(payload).digest())}`;
}

export function verifyConfirmToken(secret: string, token: string, now = Date.now()): { subscriberId: string; cycleId: string } | null {
  const [p, sig] = token.split('.');
  if (!p || !sig || token.length > 400) return null;
  const payload = Buffer.from(p, 'base64url').toString('utf8');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [subscriberId, cycleId, exp] = payload.split('.');
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!subscriberId || !cycleId || !uuid.test(subscriberId) || !uuid.test(cycleId) || !(Number(exp) * 1000 > now)) return null;
  return { subscriberId, cycleId };
}

/** Constant-time comparison of a bearer token (webhooks, cron). */
export function bearerMatches(header: string | null, secret: string | null): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
