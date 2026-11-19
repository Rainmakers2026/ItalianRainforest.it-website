import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { HTML_LANG, isLocale, LOCALES } from '@/lib/i18n/config';
import { SITE } from '@/lib/site';
import '../globals.css';

// Same family as rainmakers.it. Self-hosted at build time by next/font: no runtime request to Google.
const roboto = Roboto({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-roboto',
  display: 'swap',
  weight: 'variable',
});

export const metadata: Metadata = { metadataBase: new URL(SITE.url) };

export const viewport: Viewport = {
  themeColor: '#0e2136',
  width: 'device-width',
  initialScale: 1,
};

export const dynamicParams = false;
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

function Analytics() {
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;
  if (provider === 'plausible' && process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
    return (
      <Script
        defer
        strategy="lazyOnload"
        data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
        src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ?? 'https://plausible.io/js/script.outbound-links.js'}
      />
    );
  }
  if (provider === 'umami' && process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && process.env.NEXT_PUBLIC_UMAMI_SRC) {
    return (
      <Script
        defer
        strategy="lazyOnload"
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
        src={process.env.NEXT_PUBLIC_UMAMI_SRC}
      />
    );
  }
  return null;
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={HTML_LANG[locale]} className={roboto.variable}>
      <body>
        <noscript>
          <style>{'.reveal{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
