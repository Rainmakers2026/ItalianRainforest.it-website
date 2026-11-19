import { formatDate } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';

/** Server-rendered "last updated" stamp for section headers. */
export function StaticStamp({ updatedAt, template, dark = false }: { updatedAt: string; template: string; dark?: boolean }) {
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold ${
        dark ? 'bg-white/10 text-white/90' : 'bg-white text-muted shadow-[var(--shadow-card)]'
      }`}
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#3ccf91] opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-[#3ccf91]" />
      </span>
      <time dateTime={updatedAt}>{fmt(template, { date: formatDate(updatedAt) })}</time>
    </p>
  );
}
