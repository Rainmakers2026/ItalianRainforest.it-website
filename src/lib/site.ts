/**
 * Site-wide facts. Anything marked TODO(owner) must be confirmed by Rainmakers
 * before go-live — see docs/audit.md §Blockers. Empty arrays hide their section.
 */
export const SITE = {
  name: 'Italian Rainforest',
  // TODO(owner): confirm the production domain.
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.italianrainforest.it').replace(/\/$/, ''),
  email: 'italianrainforest@rainmakers.it',
  // TODO(owner): community channels. Telegram is a placeholder until the channel exists
  // (set NEXT_PUBLIC_TELEGRAM_URL). No WhatsApp references any more.
  community: {
    telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || 'https://t.me/',
    telegramIsPlaceholder: !process.env.NEXT_PUBLIC_TELEGRAM_URL,
  },
  rainmakers: {
    name: 'Rainmakers',
    url: 'https://www.rainmakers.it',
    foundingYear: 2011,
    city: 'Milano',
  },
  // Kept so existing third-party embeds keep working; they point at the legacy host.
  legacyEmbedHosts: ['italian-innovation-map-o62c.vercel.app', 'italian-innovation-map.vercel.app'],
  // TODO(owner): verified partners/supporters only. Each needs { name, url, logo }.
  partners: [] as { name: string; url: string; logo: string }[],
  // TODO(owner): verified press coverage only. Each needs a link to the article.
  press: [] as { outlet: string; title: string; url: string; date: string; logo?: string }[],
  // TODO(owner): verified quotes only, with written consent of the person quoted.
  testimonials: [] as { quote: { it: string; en: string }; name: string; role: string; org?: string }[],
} as const;

export const absoluteUrl = (path = '/') => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;
