import { clientKey, rateLimited } from '@/lib/leads';
import { confirm } from '@/lib/newsletter/service';

/**
 * Landing of the double opt-in: Brevo redirects the recipient here (redirectionUrl) after
 * the click on the confirmation email. The signed token identifies the subscriber and the
 * opt-in cycle; the subscription becomes SUBSCRIBED only when Brevo also reports the contact
 * as an active member of the RAINFOREST RADAR list. Then back to the newsletter section.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get('l') === 'en' ? 'en' : 'it';
  const back = (status: string) => new Response(null, { status: 303, headers: { location: `/${locale}?newsletter=${status}#newsletter`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  if (rateLimited(`newsletter-confirm:${clientKey(req)}`, 30)) return back('invalid');
  const token = url.searchParams.get('t') ?? '';
  try {
    return back(await confirm(token));
  } catch (err) {
    console.error('[newsletter:confirm]', (err as Error).message);
    return back('pending');
  }
}
