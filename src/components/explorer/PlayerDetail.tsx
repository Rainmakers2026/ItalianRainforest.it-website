'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicPlayer } from '@/lib/data/schema';
import { Dialog, useLingering } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { Avatar } from './Avatar';
import { useExplorer } from './ExplorerProvider';
import { CategoryTags, description, StatusBadge, WebsiteLink } from './PlayerBits';
import { locationLabel } from './labels';

/** The player's profile ("scheda anagrafica"). Shared by the map-panel popup and the left popup dialog. */
export function PlayerProfile({
  p,
  onClose,
  headingId,
  showHeader = true,
}: {
  p: PublicPlayer;
  onClose: () => void;
  headingId: string;
  showHeader?: boolean;
}) {
  const { locale, t, setFilters, embed, closePlayer } = useExplorer();
  const [copied, setCopied] = useState(false);
  const desc = description(p, locale);
  const loc = locationLabel(p, locale);
  const coords = p.location?.source === 'data' && p.location.lat != null ? p.location : null;

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('player', p.slug);
    url.hash = 'map';
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const suggestEdit = () => {
    closePlayer();
    window.dispatchEvent(new CustomEvent('irf:suggest', { detail: { type: 'correction', organization: p.name } }));
    document.getElementById('update')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <article aria-labelledby={headingId} className="grid gap-4">
      {showHeader && (
        <header className="-mx-1 flex items-start gap-4 rounded-2xl bg-[linear-gradient(135deg,var(--color-sky-50),#ffffff_70%)] p-3 ring-1 ring-sky-100">
          <Avatar player={p} size={52} wide={!!p.logo} />
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-lg leading-tight font-black tracking-[-0.01em] text-ink sm:text-xl">
              {p.name}
            </h3>
            <p className="mt-1.5">
              <StatusBadge p={p} t={t} />
            </p>
            <div className="mt-2">
              <CategoryTags p={p} locale={locale} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sky-50 hover:text-ink"
            aria-label={t.explorer.backToList}
          >
            <Icon name="x" />
          </button>
        </header>
      )}

      <p className="text-[0.9375rem] leading-relaxed text-ink">{desc ?? <span className="text-subtle">{t.explorer.noDescription}</span>}</p>

      <dl className="grid gap-2.5 rounded-2xl bg-sky-50 p-3.5 text-sm">
        <div className="flex gap-3">
          <dt className="sr-only">{t.explorer.location}</dt>
          <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-savoia" />
          <dd className="text-ink">
            {p.location?.address && <span className="block font-semibold">{p.location.address}</span>}
            <span className={p.location?.address ? 'text-muted' : ''}>{loc ?? t.explorer.locationUnknown}</span>
            {p.location?.precision && p.location.precision !== 'address' && (
              <span className="block text-[0.75rem] text-subtle">{t.explorer.precision[p.location.precision]}</span>
            )}
            {p.location?.source === 'demo' && (
              <span className="ml-2 rounded bg-[#fff6e0] px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-wide text-[#6b4a00] uppercase">
                {t.explorer.demoBadge}
              </span>
            )}
            {coords && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`}
                target="_blank"
                rel="noopener"
                className="mt-1 block text-[0.8125rem] font-bold text-savoia-700 underline underline-offset-2"
              >
                {t.explorer.directions}
              </a>
            )}
          </dd>
        </div>
        {p.website && (
          <div className="flex gap-3">
            <dt className="sr-only">{t.explorer.website}</dt>
            <Icon name="globe" size={18} className="mt-0.5 shrink-0 text-savoia" />
            <dd>
              <WebsiteLink p={p} t={t} />
            </dd>
          </div>
        )}
      </dl>

      {p.industries.length > 0 && (
        <dl className="text-sm">
          <dt className="font-bold text-ink">{t.explorer.industries}</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {p.industries.map((industry) =>
              embed ? (
                <span key={industry} className="rounded-full bg-savoia-50 px-2.5 py-1 text-xs font-semibold text-savoia-700">
                  {industry}
                </span>
              ) : (
                <button
                  key={industry}
                  type="button"
                  onClick={() => {
                    setFilters({ industry }, 'database');
                    closePlayer();
                    window.location.hash = 'database';
                  }}
                  className="rounded-full bg-savoia-50 px-2.5 py-1 text-xs font-semibold text-savoia-700 transition-colors hover:bg-savoia hover:text-white"
                >
                  {industry}
                </button>
              ),
            )}
          </dd>
        </dl>
      )}

      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-sm">
        <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 font-bold text-muted hover:text-ink">
          <Icon name={copied ? 'check' : 'link'} size={16} />
          {copied ? t.explorer.linkCopied : t.explorer.copyLink}
        </button>
        {!embed && (
          <button type="button" onClick={suggestEdit} className="inline-flex items-center gap-1.5 font-bold text-muted hover:text-ink">
            <Icon name="mail" size={16} />
            {t.explorer.suggestEdit}
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Profile popup that takes the place of the player list in the map's left panel.
 * Escape or the close button returns to the list; focus moves into the popup.
 */
export function PlayerPanelPopup() {
  const { openId, openInPanel, byId, closePlayer } = useExplorer();
  const ref = useRef<HTMLDivElement>(null);
  const p = openId && openInPanel ? byId.get(openId) : undefined;

  useEffect(() => {
    if (!p) return;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePlayer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, closePlayer]);

  if (!p) return null;
  return (
    <div
      ref={ref}
      key={p.id}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="panel-player-title"
      className="fade-pop scrollbar-thin absolute inset-2 z-20 overflow-y-auto overscroll-contain rounded-3xl border border-sky-200 bg-white p-5 shadow-[0_24px_60px_-24px_rgb(27_58_92/0.55)] outline-none"
    >
      <PlayerProfile p={p} onClose={closePlayer} headingId="panel-player-title" />
    </div>
  );
}

/** Same profile as a popup anchored on the left of the screen (database, deep links, mobile). */
export function PlayerDetail() {
  const { openId, openInPanel, closePlayer, byId, t } = useExplorer();
  const p = openId && !openInPanel ? byId.get(openId) : undefined;
  const shown = useLingering(p);
  return (
    <Dialog open={!!p} onClose={closePlayer} closeLabel={t.a11y.close} variant="left" labelledBy="player-detail-title" bare>
      {shown && (
        <div key={shown.id} className="fade-pop">
          <PlayerProfile p={shown} onClose={closePlayer} headingId="player-detail-title" />
        </div>
      )}
    </Dialog>
  );
}
