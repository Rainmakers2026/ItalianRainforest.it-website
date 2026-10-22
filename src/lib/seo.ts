import type { Metadata } from 'next';
import type { DatasetStats } from '@/lib/data/stats';
import { CATEGORY_BY_KEY } from '@/lib/data/taxonomy';
import { LOCALES, OG_LOCALE, type Locale } from '@/lib/i18n/config';
import { fmt, getDictionary } from '@/lib/i18n';
import { absoluteUrl, SITE } from '@/lib/site';

export function alternates(locale: Locale, path = '') {
  return {
    canonical: absoluteUrl(`/${locale}${path}`),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(`/${l}${path}`)])),
      'x-default': absoluteUrl(`/it${path}`),
    },
  };
}

export function homeMetadata(locale: Locale, stats: DatasetStats): Metadata {
  const t = getDictionary(locale).meta;
  const description = fmt(t.description, { active: stats.active });
  return {
    metadataBase: new URL(SITE.url),
    title: t.title,
    description,
    alternates: alternates(locale),
    applicationName: SITE.name,
    authors: [{ name: SITE.rainmakers.name, url: SITE.rainmakers.url }],
    publisher: SITE.rainmakers.name,
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      title: t.title,
      description,
      url: absoluteUrl(`/${locale}`),
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: 'summary_large_image', title: t.title, description },
    robots: { index: true, follow: true },
  };
}

export function categoryList(stats: DatasetStats, locale: Locale) {
  return stats.categoryCounts
    .filter((c) => c.key !== 'unclassified')
    .map((c) => CATEGORY_BY_KEY[c.key].label[locale].toLowerCase())
    .join(', ');
}

/** JSON-LD graph: WebSite + Organization (Rainmakers) + Dataset + FAQPage, all matching visible content. */
export function jsonLd(locale: Locale, stats: DatasetStats, faq: { q: string; a: string }[]) {
  const t = getDictionary(locale);
  const home = absoluteUrl(`/${locale}`);
  const orgId = `${SITE.rainmakers.url}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: SITE.rainmakers.name,
        url: SITE.rainmakers.url,
        foundingDate: String(SITE.rainmakers.foundingYear),
        address: { '@type': 'PostalAddress', addressLocality: 'Milano', addressCountry: 'IT' },
        slogan: 'meaningful innovation',
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE.url}/#website`,
        url: home,
        name: SITE.name,
        description: fmt(t.meta.description, { active: stats.active }),
        inLanguage: locale,
        publisher: { '@id': orgId },
      },
      {
        '@type': 'Dataset',
        '@id': `${SITE.url}/#dataset`,
        name:
          locale === 'it'
            ? 'Italian Rainforest — database dell’ecosistema italiano dell’innovazione'
            : 'Italian Rainforest — Italian innovation ecosystem database',
        description: fmt(t.why.definition, { active: stats.active, categories: stats.categories }),
        url: `${home}#database`,
        creator: { '@id': orgId },
        publisher: { '@id': orgId },
        isAccessibleForFree: true,
        inLanguage: ['it', 'en'],
        spatialCoverage: { '@type': 'Place', name: 'Italia / Italy' },
        dateModified: stats.updatedAt,
        keywords: [
          locale === 'it' ? 'ecosistema italiano dell’innovazione' : 'Italian innovation ecosystem',
          'venture capital Italia',
          locale === 'it' ? 'incubatori e acceleratori' : 'incubators and accelerators',
          'startup ecosystem Italy',
        ],
        variableMeasured: stats.categoryCounts.map((c) => CATEGORY_BY_KEY[c.key].label[locale]),
        size: `${stats.active} ${locale === 'it' ? 'organizzazioni attive' : 'active organisations'}`,
      },
      {
        '@type': 'FAQPage',
        '@id': `${home}#faq`,
        inLanguage: locale,
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };
}
