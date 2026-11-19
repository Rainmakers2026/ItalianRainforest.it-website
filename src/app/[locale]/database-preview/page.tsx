import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DatabasePreview } from '@/components/database-preview/DatabasePreview';
import { getPreviewCopy } from '@/components/database-preview/copy';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/ui/Icon';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n';

// Isolated prototype: not linked from the site, not in the sitemap, not indexed.
// The data comes only from GET /api/database (never imported here).
export async function generateMetadata({ params }: PageProps<'/[locale]/database-preview'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getPreviewCopy(locale).metaTitle,
    robots: { index: false, follow: false },
  };
}

export default async function DatabasePreviewPage({ params }: PageProps<'/[locale]/database-preview'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getPreviewCopy(locale);
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="container-irf flex h-16 items-center justify-between gap-4">
          <a href={`/${locale}`} aria-label="Italian Rainforest — home">
            <Logo size={32} tone="blue" />
          </a>
          <a href={`/${locale}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted hover:text-ink">
            <Icon name="arrowLeft" size={16} />
            {t.backHome}
          </a>
        </div>
      </header>
      <main id="main">
        <DatabasePreview t={t} />
      </main>
      <Footer locale={locale} t={getDictionary(locale).footer} />
    </>
  );
}
