'use client';

import { useState } from 'react';
import { STAGE_BY_KEY } from '@/lib/data/taxonomy';
import { OutboundLink } from '../OutboundLink';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { Avatar } from './Avatar';
import { useExplorer } from './ExplorerProvider';
import { CategoryTags, description, LocationLine, WebsiteLink } from './PlayerBits';

/** Player detail: right drawer on desktop, tall bottom sheet on mobile. */
export function PlayerDetail() {
  const { openId, closePlayer, byId, locale, t, requestContact, setFilters, embed } = useExplorer();
  const [copied, setCopied] = useState(false);
  const p = openId ? byId.get(openId) : undefined;
  const desc = p ? description(p, locale) : null;

  const copyLink = async () => {
    if (!p) return;
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
    if (!p) return;
    closePlayer();
    window.dispatchEvent(new CustomEvent('irf:suggest', { detail: { type: 'correction', organization: p.name } }));
    document.getElementById('update')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Dialog open={!!p} onClose={closePlayer} closeLabel={t.a11y.close} variant="drawer" labelledBy="player-detail-title" title={p?.name}>
      {p && (
        <div className="grid gap-6">
          <div className="flex items-center gap-4">
            <Avatar player={p} size={64} />
            <div className="grid gap-2">
              <CategoryTags p={p} locale={locale} />
              {p.status === 'inactive' && <p className="text-xs font-bold text-danger uppercase">{t.explorer.inactive}</p>}
            </div>
          </div>

          <div className="grid gap-3">
            <LocationLine p={p} locale={locale} t={t} />
            <p className="leading-relaxed text-ink">{desc ?? <span className="text-subtle">{t.explorer.noDescription}</span>}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <WebsiteLink p={p} t={t} />
              {p.publicSocial.linkedin && (
                <OutboundLink
                  href={p.publicSocial.linkedin}
                  event="outbound_player_website"
                  props={{ player: p.id, kind: 'linkedin' }}
                  className="inline-flex items-center gap-1.5 font-bold text-savoia-700 underline decoration-savoia/30 underline-offset-4"
                >
                  {t.explorer.linkedin}
                  <Icon name="external" size={14} />
                </OutboundLink>
              )}
            </div>
          </div>

          <dl className="grid gap-4 text-sm">
            {p.tags.length > 0 && (
              <div>
                <dt className="font-extrabold text-navy">{t.explorer.focus}</dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {p.tags.map((tag) =>
                    embed ? (
                      <span key={tag} className="rounded-full bg-savoia-50 px-2.5 py-1 text-xs font-semibold text-savoia-700">
                        {tag}
                      </span>
                    ) : (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setFilters({ tag }, 'database');
                          closePlayer();
                          document.getElementById('database')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="rounded-full bg-savoia-50 px-2.5 py-1 text-xs font-semibold text-savoia-700 hover:bg-savoia-100"
                      >
                        {tag}
                      </button>
                    ),
                  )}
                </dd>
              </div>
            )}
            {p.stages.length > 0 && (
              <div>
                <dt className="font-extrabold text-navy">{t.explorer.stages}</dt>
                <dd className="mt-1 text-muted">{p.stages.map((s) => STAGE_BY_KEY[s].label[locale]).join(' · ')}</dd>
              </div>
            )}
            {p.investmentCountries.length > 0 && (
              <div>
                <dt className="font-extrabold text-navy">{t.explorer.investmentCountries}</dt>
                <dd className="mt-1 text-muted">{p.investmentCountries.join(', ')}</dd>
              </div>
            )}
          </dl>

          <section aria-labelledby="gated-title" className="rounded-2xl bg-mist p-4 ring-1 ring-line">
            <h3 id="gated-title" className="flex items-center gap-2 font-extrabold text-navy">
              <Icon name="lock" size={18} />
              {t.explorer.contacts}
            </h3>
            <p className="mt-1 text-sm text-muted">{t.explorer.requestContactsHint}</p>
            <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => requestContact(p.id, 'detail')}>
              {t.explorer.requestContacts}
            </button>
          </section>

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
        </div>
      )}
    </Dialog>
  );
}
