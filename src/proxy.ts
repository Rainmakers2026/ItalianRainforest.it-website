import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/i18n/config';

/** Redirects locale-less paths to /it or /en based on Accept-Language. */
function preferredLocale(req: NextRequest) {
  const header = req.headers.get('accept-language') ?? '';
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag?.slice(0, 2).toLowerCase() ?? '', q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.find((r) => (LOCALES as readonly string[]).includes(r.lang))?.lang ?? DEFAULT_LOCALE;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;
  const url = req.nextUrl.clone();
  url.pathname = `/${preferredLocale(req)}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Skip API, Next internals and static files.
  matcher: ['/((?!api|_next|geo|glyphs|vendor|visuals|images|favicon|icon|apple-icon|robots.txt|sitemap.xml|.*\\..*).*)'],
};
