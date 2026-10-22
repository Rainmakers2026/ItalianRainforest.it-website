'use client';

import type { PublicPlayer } from '@/lib/data/schema';
import { Icon } from '../ui/Icon';
import { Avatar } from './Avatar';
import { useExplorer } from './ExplorerProvider';
import { CategoryTags, description, LocationLine, WebsiteLink } from './PlayerBits';

/** Preview shown in the side panel on marker hover (desktop) or in a bottom sheet on tap (mobile). */
export function PlayerPreviewCard({ p, onClose, compact = false }: { p: PublicPlayer; onClose: () => void; compact?: boolean }) {
  const { locale, t, openPlayer, requestContact } = useExplorer();
  const desc = description(p, locale);
  return (
    <article aria-labelledby={`pv-${p.id}`} className="flex h-full flex-col">
      <button
        type="button"
        onClick={onClose}
        className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-[0.8125rem] font-bold text-muted hover:bg-mist hover:text-ink"
      >
        <Icon name={compact ? 'x' : 'arrowLeft'} size={16} />
        {compact ? t.a11y.close : t.explorer.backToList}
      </button>
      <div className="flex items-start gap-3">
        <Avatar player={p} size={compact ? 44 : 52} />
        <div className="min-w-0">
          <h3 id={`pv-${p.id}`} className="text-lg leading-tight font-extrabold text-navy">
            {p.name}
          </h3>
          {p.status === 'inactive' && <p className="mt-0.5 text-xs font-bold text-danger uppercase">{t.explorer.inactive}</p>}
        </div>
      </div>
      <div className="mt-3 grid gap-2.5">
        <CategoryTags p={p} locale={locale} />
        <LocationLine p={p} locale={locale} t={t} />
        {!compact && (
          <p className="line-clamp-4 text-[0.9375rem] leading-relaxed text-ink">
            {desc ?? <span className="text-subtle">{t.explorer.noDescription}</span>}
          </p>
        )}
        {p.tags.length > 0 && !compact && (
          <p className="text-[0.8125rem] text-muted">
            <span className="font-bold text-navy">{t.explorer.focus}: </span>
            {p.tags.slice(0, 6).join(' · ')}
            {p.tags.length > 6 && ` +${p.tags.length - 6}`}
          </p>
        )}
        <WebsiteLink p={p} t={t} className="text-sm" />
      </div>
      <div className={`mt-auto flex flex-wrap gap-2 pt-4 ${compact ? '' : 'border-t border-line'}`}>
        <button
          type="button"
          className="btn btn-primary btn-sm flex-1"
          onClick={() => openPlayer(p.id, compact ? 'map_sheet' : 'map_card')}
        >
          {t.explorer.details}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          onClick={() => requestContact(p.id, compact ? 'map_sheet' : 'map_card')}
        >
          <Icon name="lock" size={15} />
          {t.explorer.requestContacts}
        </button>
      </div>
    </article>
  );
}
