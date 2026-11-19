import type { ReactNode } from 'react';
import { rich } from '@/lib/i18n/rich';

/** H2 (+ optional gradient accent and lead), in the rainmakers.it typographic style. */
export function SectionHeader({
  id,
  title,
  accent,
  lead,
  dark = false,
  align = 'left',
  caps = false,
  children,
}: {
  id: string;
  title: string;
  /** Words highlighted with the brand gradient, appended to the title. */
  accent?: string;
  lead?: string;
  dark?: boolean;
  align?: 'left' | 'center';
  /** Section title in capitals: first words in black (white on dark), accent in the brand gradient. */
  caps?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`reveal max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <h2 id={id} className={`h2 ${caps ? 'uppercase' : ''} ${dark ? 'text-white' : caps ? 'text-black' : 'text-ink'}`}>
        {title}
        {accent && (
          <>
            {' '}
            <span
              className={
                dark
                  ? 'bg-[linear-gradient(120deg,#c9d7ff_0%,#9fe3f5_100%)] bg-clip-text text-transparent'
                  : 'bg-[linear-gradient(120deg,#4b61d1_0%,#2596be_100%)] bg-clip-text text-transparent'
              }
            >
              {accent}
            </span>
          </>
        )}
      </h2>
      {lead && <p className={`lead mt-5 ${dark ? 'text-white/85' : 'text-muted'}`}>{rich(lead)}</p>}
      {children}
    </div>
  );
}
