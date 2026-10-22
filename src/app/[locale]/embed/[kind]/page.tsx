import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmbedShell } from '@/components/explorer/EmbedShell';
import { ExplorerProvider } from '@/components/explorer/ExplorerProvider';
import { getDataset } from '@/lib/data/provider';
import { isLocale, LOCALES } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n';
import { downloadRequiresEmail } from '@/lib/leads';
import { alternates } from '@/lib/seo';

export const revalidate = 3600;
export const dynamicParams = false;
const KINDS = ['map', 'database'] as const;
type Kind = (typeof KINDS)[number];

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => KINDS.map((kind) => ({ locale, kind })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/embed/[kind]'>): Promise<Metadata> {
  const { locale, kind } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).meta;
  return {
    title: kind === 'map' ? t.embedMapTitle : t.embedDatabaseTitle,
    // Embeds duplicate the main page: keep them out of the index, point to the canonical.
    robots: { index: false, follow: true },
    alternates: { canonical: alternates(locale).canonical },
  };
}

export default async function EmbedPage({ params }: PageProps<'/[locale]/embed/[kind]'>) {
  const { locale, kind } = await params;
  if (!isLocale(locale) || !(KINDS as readonly string[]).includes(kind)) notFound();
  const t = getDictionary(locale);
  const { updatedAt } = await getDataset();
  return (
    <ExplorerProvider
      locale={locale}
      embed
      initialUpdatedAt={updatedAt}
      downloadRequiresEmail={downloadRequiresEmail()}
      t={{ explorer: t.explorer, map: t.map, database: t.database, download: t.download, lead: t.lead, share: t.share, a11y: t.a11y }}
    >
      <h1 className="sr-only">{kind === 'map' ? t.meta.embedMapTitle : t.meta.embedDatabaseTitle}</h1>
      <EmbedShell kind={kind as Kind} locale={locale} credit={t.footer.embedCredit} />
    </ExplorerProvider>
  );
}
