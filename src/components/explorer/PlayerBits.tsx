'use client';

import type { PublicPlayer } from '@/lib/data/schema';
import type { Locale } from '@/lib/i18n/config';
import { OutboundLink } from '../OutboundLink';
import { Icon } from '../ui/Icon';
import type { ExplorerStrings } from './ExplorerProvider';
import { categoryColor, categoryName, locationLabel } from './labels';

export function CategoryTags({ p, locale }: { p: PublicPlayer; locale: Locale }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {p.categories.map((c) => (
        <li
          key={c}
          className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-xs font-bold text-navy ring-1 ring-line"
        >
          <span className="size-2 rounded-full" style={{ background: categoryColor(c) }} aria-hidden="true" />
          {categoryName(c, locale)}
        </li>
      ))}
    </ul>
  );
}

export function LocationLine({ p, locale, t }: { p: PublicPlayer; locale: Locale; t: ExplorerStrings }) {
  const loc = locationLabel(p, locale);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <Icon name="pin" size={16} className="shrink-0 text-subtle" />
      <span>{loc ?? t.explorer.locationUnknown}</span>
      {p.location?.source === 'demo' && (
        <span className="rounded bg-[#fff6e0] px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-wide text-[#6b4a00] uppercase">
          {t.explorer.demoBadge}
        </span>
      )}
    </p>
  );
}

export function WebsiteLink({ p, t, className = '' }: { p: PublicPlayer; t: ExplorerStrings; className?: string }) {
  if (!p.website) return null;
  return (
    <OutboundLink
      href={p.website}
      event="outbound_player_website"
      props={{ player: p.id }}
      className={`inline-flex items-center gap-1.5 font-bold text-savoia-700 underline decoration-savoia/30 underline-offset-4 hover:decoration-savoia ${className}`}
    >
      {p.websiteHost ?? t.explorer.website}
      <Icon name="external" size={14} />
      <span className="sr-only">{t.a11y.external}</span>
    </OutboundLink>
  );
}

export function description(p: PublicPlayer, locale: Locale) {
  return p.description[locale] ?? p.description[locale === 'it' ? 'en' : 'it'];
}
