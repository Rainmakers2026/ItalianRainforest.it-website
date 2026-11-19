'use client';

import { memo } from 'react';
import type { PublicContact } from '@/lib/database/types';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { ContactAvatar, LinkedinMark, primaryTone, TypeBadges } from './Bits';
import type { PreviewCopy } from './copy';

type Props = { contacts: PublicContact[]; onOpen: (id: string) => void; selectedId: string | null; t: PreviewCopy };

const Missing = ({ children }: { children: string }) => <span className="text-subtle">{children}</span>;

/** Short staggered entrance for the first rows only (CSS `pop-in`, disabled under reduced motion). */
const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 12) * 28}ms` });

/**
 * Table view. Secondary columns collapse into the name cell on narrow screens,
 * so there is never a forced horizontal scroll.
 */
export const ContactTable = memo(function ContactTable({ contacts, onOpen, selectedId, t }: Props) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-line">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[linear-gradient(120deg,#1b3a5c_0%,#24497a_60%,#2c4f9c_100%)] text-[0.6875rem] font-bold tracking-[0.16em] text-white/75 uppercase">
          <tr>
            <th scope="col" className="py-3.5 pr-3 pl-5 font-bold">
              {t.colName}
            </th>
            <th scope="col" className="hidden px-3 py-3.5 font-bold md:table-cell">
              {t.colCompany}
            </th>
            <th scope="col" className="hidden px-3 py-3.5 font-bold lg:table-cell">
              {t.colRole}
            </th>
            <th scope="col" className="hidden px-3 py-3.5 font-bold sm:table-cell">
              {t.colType}
            </th>
            <th scope="col" className="py-3.5 pr-5 pl-3 text-right font-bold">
              <span className="sr-only sm:not-sr-only">{t.colLinkedin}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {contacts.map((c, i) => (
            <tr
              key={c.id}
              onClick={() => onOpen(c.id)}
              style={stagger(i)}
              className={`pop-in group cursor-pointer transition-[background-color,box-shadow] duration-150 hover:bg-sky-50 hover:shadow-[inset_3px_0_0_var(--color-savoia)] ${
                selectedId === c.id ? 'bg-savoia-50 shadow-[inset_3px_0_0_var(--color-savoia)]' : ''
              }`}
            >
              <td className="py-4 pr-3 pl-5">
                <div className="flex items-center gap-3.5">
                  <ContactAvatar contact={c} size={42} className="transition-transform duration-200 group-hover:scale-105" />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(c.id);
                      }}
                      className="text-left font-bold text-navy group-hover:text-savoia-700"
                      aria-label={fmt(t.openDetail, { name: c.name })}
                    >
                      {c.name}
                    </button>
                    <p className="truncate text-sm text-muted lg:hidden">{c.jobTitle ?? t.noRole}</p>
                    {c.company && <p className="truncate text-sm font-medium text-ink md:hidden">{c.company}</p>}
                  </div>
                </div>
              </td>
              <td className="hidden px-3 py-4 text-[0.9375rem] font-semibold text-ink md:table-cell">
                {c.company ?? <Missing>{t.noValue}</Missing>}
              </td>
              <td className="hidden px-3 py-4 text-[0.9375rem] text-muted lg:table-cell">
                {c.jobTitle ?? <Missing>{t.noValue}</Missing>}
              </td>
              <td className="hidden px-3 py-4 sm:table-cell">
                <TypeBadges types={c.contactType} t={t} />
              </td>
              <td className="py-4 pr-5 pl-3 text-right">
                <span className="inline-flex items-center gap-2">
                  <LinkedinMark has={c.hasLinkedin} t={t} />
                  <Icon
                    name="arrowRight"
                    size={16}
                    className="hidden text-savoia opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 md:block"
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export const ContactCards = memo(function ContactCards({ contacts, onOpen, selectedId, t }: Props) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {contacts.map((c, i) => (
        <li key={c.id} className="pop-in" style={stagger(i)}>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            aria-label={fmt(t.openDetail, { name: c.name })}
            className={`lift group relative flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-white text-left shadow-[0_1px_2px_rgb(14_33_54/0.06)] ring-1 ring-line hover:ring-savoia-100 ${
              selectedId === c.id ? 'ring-2 ring-savoia' : ''
            }`}
          >
            <span className="block h-1.5 w-full" style={{ background: primaryTone(c).strip }} aria-hidden="true" />
            <span className="flex flex-1 flex-col gap-4 p-5">
              <span className="flex items-start gap-3.5">
                <ContactAvatar contact={c} size={52} className="transition-transform duration-300 group-hover:scale-105" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.0625rem] leading-snug font-bold text-navy group-hover:text-savoia-700">
                    {c.name}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{c.jobTitle ?? t.noRole}</span>
                </span>
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-ink">
                <Icon name="building" size={16} className="shrink-0 text-savoia" />
                <span className="truncate">{c.company ?? <Missing>{t.noCompany}</Missing>}</span>
              </span>
              <span className="mt-auto flex items-end justify-between gap-3">
                <TypeBadges types={c.contactType} t={t} />
                <span className="flex shrink-0 items-center gap-1.5">
                  <LinkedinMark has={c.hasLinkedin} t={t} />
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-mist text-subtle transition-colors duration-200 group-hover:bg-savoia group-hover:text-white">
                    <Icon name="arrowRight" size={16} />
                  </span>
                </span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
});
