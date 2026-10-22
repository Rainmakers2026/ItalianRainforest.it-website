'use client';

import { formatDate } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';

export function UpdatedStamp({ className = '' }: { className?: string }) {
  const { t, updatedAt } = useExplorer();
  return (
    <p className={`inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-muted ${className}`}>
      <span className="size-2 rounded-full bg-success" aria-hidden="true" />
      <time dateTime={updatedAt}>{fmt(t.explorer.updated, { date: formatDate(updatedAt) })}</time>
    </p>
  );
}

export function DemoGeoBanner() {
  const { t, hasDemoGeo } = useExplorer();
  if (!hasDemoGeo) return null;
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-xl bg-[#fff6e0] px-4 py-3 text-sm font-semibold text-[#6b4a00] ring-1 ring-[#f2d48a]"
    >
      <Icon name="info" size={18} className="mt-px shrink-0" />
      {t.explorer.demoGeo}
    </p>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useExplorer();
  return (
    <div role="status" className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-muted">
      <span
        className="size-7 animate-spin rounded-full border-[3px] border-savoia-100 border-t-savoia motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-sm font-semibold">{label ?? t.explorer.loading}</span>
    </div>
  );
}

export function ErrorState() {
  const { t, ensureLoaded } = useExplorer();
  return (
    <div role="alert" className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-semibold text-navy">{t.explorer.error}</p>
      <button type="button" className="btn btn-outline btn-sm" onClick={ensureLoaded}>
        <Icon name="reset" size={16} />
        {t.explorer.retry}
      </button>
    </div>
  );
}

export function EmptyState({ onReset }: { onReset: () => void }) {
  const { t } = useExplorer();
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-bold text-navy">{t.explorer.noResults}</p>
      <p className="max-w-xs text-sm text-muted">{t.explorer.noResultsHint}</p>
      <button type="button" className="btn btn-outline btn-sm mt-2" onClick={onReset}>
        {t.explorer.reset}
      </button>
    </div>
  );
}
