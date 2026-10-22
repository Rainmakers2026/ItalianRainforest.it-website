import type { MetadataRoute } from 'next';
import { getDataset } from '@/lib/data/provider';
import { LOCALES } from '@/lib/i18n/config';
import { absoluteUrl } from '@/lib/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { updatedAt } = await getDataset();
  const languages = Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(`/${l}`)]));
  return LOCALES.map((l) => ({
    url: absoluteUrl(`/${l}`),
    lastModified: updatedAt,
    changeFrequency: 'weekly',
    priority: 1,
    alternates: { languages },
  }));
}
