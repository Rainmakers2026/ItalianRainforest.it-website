import { formatDate } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';

/** Server-rendered "last updated" stamp for section headers. */
export function StaticStamp({ updatedAt, template }: { updatedAt: string; template: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted">
      <span className="size-2 rounded-full bg-success" aria-hidden="true" />
      <time dateTime={updatedAt}>{fmt(template, { date: formatDate(updatedAt) })}</time>
    </p>
  );
}
