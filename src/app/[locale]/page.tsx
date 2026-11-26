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
import { CategoryDonut } from '@/components/sections/CategoryDonut';
import { Faq } from '@/components/sections/Faq';
import { ForWhom } from '@/components/sections/ForWhom';
import { Hero } from '@/components/sections/Hero';
import { How } from '@/components/sections/How';
import { Newsletter } from '@/components/sections/Newsletter';
import { Infographic } from '@/components/sections/Infographic';
import { Partners } from '@/components/sections/Partners';
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
import { categoryList, familyList, homeMetadata, jsonLd } from '@/lib/seo';
import { SITE } from '@/lib/site';

export const revalidate = 3600;

async function load(locale: string) {
  if (!isLocale(locale)) notFound();
  const dataset = await getDataset();
  const stats = computeStats(dataset);
  return { locale: locale as Locale, stats, players: dataset.players, t: getDictionary(locale) };
}

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale, stats } = await load((await params).locale);
  return homeMetadata(locale, stats);
}

export default async function Home({ params }: PageProps<'/[locale]'>) {
  const { locale, stats, players, t } = await load((await params).locale);

  // FAQ answers carry live numbers and the real update date.
  const faqVars = {
    active: stats.total,
    verified: stats.active,
    categories: stats.categories,
    categoryList: categoryList(stats, locale),
    familyList: familyList(stats, locale, t.what.families),
    date: formatDate(stats.updatedAt),
    email: SITE.email,
  };
  const faq = t.faq.items.map((i) => ({ q: i.q, a: fmt(i.a, faqVars) }));
  // Map and database (filters, lists, popups, downloads) are always in English, on both pages.
  const tx = getDictionary('en');
  const explorerStrings: ExplorerStrings = {
    explorer: tx.explorer,
    map: tx.map,
    database: tx.database,
    download: tx.download,
    lead: tx.lead,
    share: tx.share,
    a11y: tx.a11y,
  };

  const stampDark = <StaticStamp updatedAt={stats.updatedAt} template={getDictionary("en").explorer.updated} dark />;

  return (
    <>
      <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-50 rounded-lg bg-navy px-4 py-2 font-bold text-white">
        {t.a11y.skip}
      </a>
      <Header locale={locale} t={{ nav: t.nav, a11y: t.a11y }} />
      <main id="main">
        <Hero locale={locale} t={t.hero} stats={stats} />
        <Why t={t.why} stats={stats} />
        <How t={t.how} players={stats.regionCounts.lombardia ?? 0} locale={locale} />
        <What t={t.what} locale={locale} stats={stats} />
        <ForWhom t={t.forWhom} locale={locale} />
        <Who t={t.who} />
        <Partners t={t.partners} locale={locale} closeLabel={t.a11y.close} />
        <LazyExplorer
          locale="en"
          t={explorerStrings}
          updatedAt={stats.updatedAt}
          downloadRequiresEmail={downloadRequiresEmail()}
          loadingLabel={tx.explorer.loading}
          header={
            <ExplorerHeader
              id="map-title"
              eyebrow={t.map.sectionEyebrow}
              title={t.map.sectionTitle}
              accent={t.map.sectionAccent}
              lead={t.map.sectionLead}
              stamp={stampDark}
            />
          }
        />
        <section id="update" aria-labelledby="update-title" className="section bg-white">
          <div className="container-irf grid gap-10">
            <SectionHeader id="update-title" title={t.update.title} lead={t.update.lead} />
            <UpdateForm t={t.update} lead={t.lead} locale={locale} />
          </div>
        </section>
        <Infographic players={players} locale={locale} t={t.infographic} families={t.what.families} />
        <Faq
          t={t.faq}
          items={faq}
          // Item 6, "how are organisations classified?", gets the category donut.
          visuals={{ 5: <CategoryDonut counts={stats.categoryCounts} active={stats.total} locale={locale} t={t.faq} /> }}
        />
        <Proof t={t.proof} locale={locale} />
        <Contact t={t.contact} />
        <Newsletter t={t.newsletter} lead={t.lead} locale={locale} />
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
