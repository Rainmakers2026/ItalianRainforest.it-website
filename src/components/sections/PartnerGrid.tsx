'use client';
/* eslint-disable @next/next/no-img-element -- small pre-sized partner logos in public/partners */

import { useCallback, useState } from 'react';
import { track } from '@/lib/analytics';
import type { Dictionary } from '@/lib/i18n';
import { fmt } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/config';
import type { Partner } from '@/lib/partners';
import { OutboundLink } from '../OutboundLink';
import { Dialog, useLingering } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

/**
 * Partner logos: each tile opens a card with the partner's profile (type, active
 * since, description) and a link to its website.
 */
export function PartnerGrid({
  partners,
  locale,
  t,
  closeLabel,
}: {
  partners: Partner[];
  locale: Locale;
  t: Dictionary['partners'];
  closeLabel: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const current = useLingering(partners.find((p) => p.key === openKey));
  const close = useCallback(() => setOpenKey(null), []);

  return (
    <>
      <ul className="reveal mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {partners.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => {
                setOpenKey(p.key);
                track('partner_open', { partner: p.key });
              }}
              aria-haspopup="dialog"
              aria-label={fmt(t.open, { name: p.name })}
              className="lift card group relative flex h-32 w-full flex-col items-center justify-center gap-2 p-5"
            >
              <img src={p.logo} alt="" width={p.w} height={p.h} loading="lazy" decoding="async" className="max-h-14 w-auto max-w-[85%] object-contain" />
              <span className="text-[0.6875rem] font-bold tracking-[0.12em] text-subtle uppercase opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {p.kind[locale]}
              </span>
            </button>
          </li>
        ))}
        <li className="flex h-32 flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-sky-50/60 p-5 text-center">
          <span className="text-sm font-extrabold text-savoia-700">{t.moreTitle}</span>
          <span className="mt-1 text-sm text-subtle">{t.moreText}</span>
        </li>
      </ul>

      <Dialog open={!!openKey} onClose={close} closeLabel={closeLabel} labelledBy="partner-title" bare>
        {current && (
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex w-fit items-center rounded-full bg-savoia-50 px-3 py-1 text-xs font-bold text-savoia-700">
                {current.kind[locale]}
              </span>
              <button
                type="button"
                onClick={close}
                className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
                aria-label={closeLabel}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="flex h-28 items-center justify-center rounded-2xl bg-mist px-6">
              <img src={current.logo} alt={current.name} width={current.w} height={current.h} className="max-h-20 w-auto max-w-full object-contain" />
            </div>
            <div>
              <h3 id="partner-title" className="text-xl font-extrabold text-navy">
                {current.name}
              </h3>
              <p className="mt-2 leading-relaxed text-muted">{current.description[locale]}</p>
            </div>
            <dl className="grid gap-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-subtle">{t.kindLabel}</dt>
                <dd className="text-right font-bold text-ink">{current.kind[locale]}</dd>
              </div>
              {current.since && (
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-subtle">{t.sinceLabel}</dt>
                  <dd className="text-right font-bold text-ink tabular-nums">{current.since}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="font-semibold text-subtle">{t.websiteLabel}</dt>
                <dd className="truncate text-right font-bold text-ink">{new URL(current.url).hostname.replace(/^www\./, '')}</dd>
              </div>
            </dl>
            <OutboundLink
              href={current.url}
              event="partner_outbound"
              props={{ partner: current.key }}
              className="btn btn-primary w-full justify-center"
            >
              {t.visit}
              <Icon name="external" size={16} />
            </OutboundLink>
          </div>
        )}
      </Dialog>
    </>
  );
}
