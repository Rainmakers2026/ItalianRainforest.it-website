import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ExplorerStrings } from '@/components/explorer/ExplorerProvider';
import { ExplorerHeader } from '@/components/explorer/ExplorerShell';
import { LazyExplorer } from '@/components/explorer/LazyExplorer';
import { StaticStamp } from '@/components/explorer/StaticStamp';
import { Footer } from '@/components/Footer';
import { UpdateForm } from '@/components/forms/UpdateForm';
import { Header } from '@/components/Header';
import { RevealObserver } from '@/components/RevealObserver';
import { Contact } from '@/components/sections/Contact';
import { Faq } from '@/components/sections/Faq';
import { ForWhom } from '@/components/sections/ForWhom';
import { Hero } from '@/components/sections/Hero';
import { How } from '@/components/sections/How';
import { Proof } from '@/components/sections/Proof';
import { SectionHeader } from '@/components/sections/SectionHeader';
import { What } from '@/components/sections/What';
import { Who } from '@/components/sections/Who';
import { Why } from '@/components/sections/Why';
import { getDataset } from '@/lib/data/provider';
import { computeStats } from '@/lib/data/stats';
import { formatDate, isLocale, type Locale } from '@/lib/i18n/config';
import { fmt, getDictionary } from '@/lib/i18n';
import { downloadRequiresEmail } from '@/lib/leads';
import { categoryList, homeMetadata, jsonLd } from '@/lib/seo';
import { SITE } from '@/lib/site';

export const revalidate = 3600;

async function load(locale: string) {
  if (!isLocale(locale)) notFound();
  const stats = computeStats(await getDataset());
  return { locale: locale as Locale, stats, t: getDictionary(locale) };
}

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale, stats } = await load((await params).locale);
  return homeMetadata(locale, stats);
}

export default async function Home({ params }: PageProps<'/[locale]'>) {
  const { locale, stats, t } = await load((await params).locale);

  // FAQ answers carry live numbers and the real update date.
  const faqVars = {
    active: stats.active,
    categories: stats.categories,
    categoryList: categoryList(stats, locale),
    date: formatDate(stats.updatedAt),
    email: SITE.email,
  };
  const faq = t.faq.items.map((i) => ({ q: i.q, a: fmt(i.a, faqVars) }));
  const explorerStrings: ExplorerStrings = {
    explorer: t.explorer,
    map: t.map,
    database: t.database,
    download: t.download,
    lead: t.lead,
    share: t.share,
    a11y: t.a11y,
  };

  const stamp = <StaticStamp updatedAt={stats.updatedAt} template={t.explorer.updated} />;

  return (
    <>
      <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-50 rounded-lg bg-navy px-4 py-2 font-bold text-white">
        {t.a11y.skip}
      </a>
      <Header locale={locale} t={{ nav: t.nav, a11y: t.a11y }} />
      <main id="main">
        <Hero locale={locale} t={t.hero} stats={stats} />
        <Why t={t.why} stats={stats} />
        <How t={t.how} />
        <What t={t.what} locale={locale} stats={stats} />
        <ForWhom t={t.forWhom} locale={locale} />
        <Who t={t.who} />
        <LazyExplorer
          locale={locale}
          t={explorerStrings}
          updatedAt={stats.updatedAt}
          downloadRequiresEmail={downloadRequiresEmail()}
          loadingLabel={t.explorer.loading}
          mapHeader={<ExplorerHeader id="map-title" eyebrow={t.map.eyebrow} title={t.map.title} lead={t.map.lead} stamp={stamp} />}
          databaseHeader={
            <ExplorerHeader
              id="database-title"
              eyebrow={t.database.eyebrow}
              title={t.database.title}
              lead={t.database.lead}
              stamp={stamp}
            />
          }
        />
        <section id="update" aria-labelledby="update-title" className="section bg-mist">
          <div className="container-irf grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <SectionHeader id="update-title" eyebrow={t.update.eyebrow} title={t.update.title} lead={t.update.lead} />
            <UpdateForm t={t.update} lead={t.lead} locale={locale} />
          </div>
        </section>
        <Faq t={t.faq} items={faq} />
        <Proof t={t.proof} locale={locale} />
        <Contact t={t.contact} />
      </main>
      <Footer locale={locale} t={t.footer} />
      <RevealObserver />
      <script
        type="application/ld+json"
        // Static, server-generated JSON; "<" is escaped to prevent script injection.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(locale, stats, faq)).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
