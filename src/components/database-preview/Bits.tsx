import type { PublicContact } from '@/lib/database/types';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import type { PreviewCopy } from './copy';

/**
 * Contact-type palette, built on the Italian Rainforest brand: Savoia for
 * investors, cyan for advisors, navy for anything else. Colour marks the type
 * only; the rest of the UI stays neutral.
 */
type Tone = { badge: string; dot: string; strip: string; avatar: string };
const TONES: Record<string, Tone> = {
  'Investor/BA': {
    badge: 'bg-savoia-50 text-savoia-700 ring-savoia-100',
    dot: 'var(--color-savoia)',
    strip: 'linear-gradient(90deg,#4b61d1 0%,#7b92e8 100%)',
    avatar: 'linear-gradient(140deg,#5a70e0 0%,#4b61d1 55%,#2596be 140%)',
  },
  'Advisor/Mentor': {
    badge: 'bg-[#e6f4f9] text-cyan-700 ring-[#c4e4ef]',
    dot: 'var(--color-cyan)',
    strip: 'linear-gradient(90deg,#2596be 0%,#9fe3f5 100%)',
    avatar: 'linear-gradient(140deg,#2fa6cf 0%,#2596be 45%,#156b8c 120%)',
  },
};
const FALLBACK: Tone = {
  badge: 'bg-mist text-muted ring-line',
  dot: 'var(--color-subtle)',
  strip: 'linear-gradient(90deg,#24497a 0%,#7b92e8 100%)',
  avatar: 'linear-gradient(140deg,#2c4f9c 0%,#24497a 55%,#142d4a 120%)',
};

export const toneOf = (type: string | undefined) => (type && TONES[type]) || FALLBACK;
export const primaryTone = (c: PublicContact) => toneOf(c.contactType[0]);

export function initialsOf(c: Pick<PublicContact, 'firstName' | 'lastName' | 'name'>) {
  const first = c.firstName[0] ?? c.name[0] ?? '';
  const last = c.lastName[0] ?? c.name.split(/\s+/)[1]?.[0] ?? '';
  return (first + last).toUpperCase() || '·';
}

export function ContactAvatar({ contact, size = 40, className = '' }: { contact: PublicContact; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-white shadow-[0_8px_18px_-10px_rgb(20_45_74/0.8)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36, background: primaryTone(contact).avatar }}
    >
      {initialsOf(contact)}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const tone = toneOf(type);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.75rem] leading-5 font-semibold whitespace-nowrap ring-1 ring-inset ${tone.badge}`}
    >
      <span className="size-1.5 rounded-full" style={{ background: tone.dot }} aria-hidden="true" />
      {type}
    </span>
  );
}

export function TypeBadges({ types, t }: { types: string[]; t: PreviewCopy }) {
  if (!types.length) return <span className="text-sm text-subtle">{t.noType}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {types.map((type) => (
        <TypeBadge key={type} type={type} />
      ))}
    </span>
  );
}

export function LinkedinMark({ has, t, withLabel = false }: { has: boolean; t: PreviewCopy; withLabel?: boolean }) {
  const label = has ? t.linkedinAvailable : t.linkedinMissing;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${has ? 'font-semibold text-savoia-700' : 'text-subtle'}`}>
      <span
        aria-hidden="true"
        className={`inline-flex size-6 items-center justify-center rounded-md text-[0.6875rem] font-black ${
          has ? 'bg-[linear-gradient(140deg,#5a70e0,#4b61d1)] text-white shadow-[0_4px_10px_-4px_rgb(75_97_209/0.9)]' : 'bg-mist text-subtle ring-1 ring-line ring-inset'
        }`}
      >
        in
      </span>
      {withLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  );
}

export const countLabel = (n: number, one: string, many: string) => (n === 1 ? one : fmt(many, { n }));

/** Small local glyphs not present in the shared icon set. */
export function ViewGlyph({ name }: { name: 'table' | 'cards' }) {
  if (name === 'table') return <Icon name="list" size={18} />;
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
