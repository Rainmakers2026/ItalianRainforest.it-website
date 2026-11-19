'use client';

import type { PublicContact } from '@/lib/database/types';
import { fmt } from '@/lib/i18n';
import { Dialog, useLingering } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { ContactAvatar, LinkedinMark, TypeBadges } from './Bits';
import type { PreviewCopy } from './copy';

type Nav = { index: number; total: number; onPrev: () => void; onNext: () => void };

const navBtn =
  'inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-white/10';

/**
 * Side drawer (bottom sheet on mobile). Shows only fields present in the API.
 * ← / → (or the arrow buttons) step through the current results.
 */
export function ContactDrawer({ contact: current, onClose, nav, t }: { contact: PublicContact | null; onClose: () => void; nav: Nav; t: PreviewCopy }) {
  const headingId = 'contact-drawer-title';
  const contact = useLingering(current);
  return (
    <Dialog open={!!current} onClose={onClose} closeLabel={t.close} variant="drawer" labelledBy={headingId} bare>
      {contact && (
        <div
          className="-mx-5 -my-5 flex min-h-full flex-col"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && nav.index > 0) nav.onPrev();
            if (e.key === 'ArrowRight' && nav.index < nav.total - 1) nav.onNext();
          }}
        >
          <div className="on-dark relative isolate overflow-hidden px-6 pt-5 pb-8 text-white">
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_90%_0%,rgb(159_227_245/0.35)_0%,transparent_60%),radial-gradient(60%_70%_at_0%_100%,rgb(123_146_232/0.45)_0%,transparent_60%),linear-gradient(160deg,#2c4f9c_0%,#3a5ec4_45%,#1b3a5c_100%)]"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" className={navBtn} onClick={nav.onPrev} disabled={nav.index <= 0} aria-label={t.prevContact}>
                  <Icon name="arrowLeft" size={18} />
                </button>
                <button type="button" className={navBtn} onClick={nav.onNext} disabled={nav.index >= nav.total - 1} aria-label={t.nextContact}>
                  <Icon name="arrowRight" size={18} />
                </button>
                <span className="ml-1 text-[0.8125rem] font-semibold text-white/75 tabular-nums" aria-live="polite">
                  {nav.index >= 0 && fmt(t.position, { i: nav.index + 1, n: nav.total })}
                </span>
              </div>
              <form method="dialog">
                <button
                  type="submit"
                  className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white"
                  aria-label={t.close}
                >
                  <Icon name="x" />
                </button>
              </form>
            </div>
            <div key={contact.id} className="pop-in mt-6 flex items-center gap-4">
              <ContactAvatar contact={contact} size={72} className="ring-4 ring-white/25" />
              <div className="min-w-0">
                <p className="eyebrow text-white/70">{t.detailTitle}</p>
                <h2 id={headingId} className="mt-1 text-[1.75rem] leading-tight font-black tracking-tight">
                  {contact.name}
                </h2>
                <p className="mt-1 text-[0.9375rem] font-semibold text-sky">{contact.jobTitle ?? t.noRole}</p>
              </div>
            </div>
          </div>

          <dl key={contact.id} className="pop-in grid gap-3 px-5 py-6">
            <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
              <dt className="text-[0.6875rem] font-bold tracking-[0.16em] text-subtle uppercase">{t.colCompany}</dt>
              <dd className="mt-1.5 flex items-center gap-2 text-[1.0625rem] font-bold text-navy">
                <Icon name="building" size={18} className="text-savoia" />
                {contact.company ?? <span className="font-normal text-subtle">{t.noCompany}</span>}
              </dd>
            </div>
            <div className="rounded-2xl p-4 ring-1 ring-line">
              <dt className="text-[0.6875rem] font-bold tracking-[0.16em] text-subtle uppercase">{t.colRole}</dt>
              <dd className="mt-1.5 text-ink">{contact.jobTitle ?? <span className="text-subtle">{t.noRole}</span>}</dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl p-4 ring-1 ring-line">
                <dt className="text-[0.6875rem] font-bold tracking-[0.16em] text-subtle uppercase">{t.colType}</dt>
                <dd className="mt-2">
                  <TypeBadges types={contact.contactType} t={t} />
                </dd>
              </div>
              <div className="rounded-2xl p-4 ring-1 ring-line">
                <dt className="text-[0.6875rem] font-bold tracking-[0.16em] text-subtle uppercase">{t.colLinkedin}</dt>
                <dd className="mt-2">
                  <LinkedinMark has={contact.hasLinkedin} t={t} withLabel />
                </dd>
              </div>
            </div>
          </dl>

          <p className="mt-auto flex items-start gap-2 border-t border-line px-6 py-4 text-[0.8125rem] text-subtle">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            {t.demoNote}
          </p>
        </div>
      )}
    </Dialog>
  );
}
