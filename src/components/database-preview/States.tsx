import { Icon } from '../ui/Icon';
import type { PreviewCopy } from './copy';

const Bone = ({ className = '' }: { className?: string }) => (
  <span className={`block animate-pulse rounded-md bg-line/70 motion-reduce:animate-none ${className}`} aria-hidden="true" />
);

export function ResultsSkeleton({ t }: { t: PreviewCopy }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t.loading}</span>
      <div className="card divide-y divide-line overflow-hidden">
        <div className="flex gap-6 bg-mist/70 px-5 py-3.5">
          <Bone className="h-3 w-24" />
          <Bone className="hidden h-3 w-20 md:block" />
          <Bone className="hidden h-3 w-20 lg:block" />
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Bone className="size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Bone className="h-3.5 w-2/5 max-w-48" />
              <Bone className="h-3 w-3/5 max-w-64 lg:hidden" />
            </div>
            <Bone className="hidden h-3.5 w-28 md:block" />
            <Bone className="hidden h-3.5 w-40 lg:block" />
            <Bone className="hidden h-5 w-20 rounded-full sm:block" />
            <Bone className="size-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorPanel({ onRetry, t }: { onRetry: () => void; t: PreviewCopy }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[#fdecea] text-danger">
        <Icon name="info" size={22} />
      </span>
      <p className="text-lg font-bold text-navy">{t.errorTitle}</p>
      <p className="max-w-sm text-sm text-muted">{t.errorHint}</p>
      <button type="button" className="btn btn-primary btn-sm mt-2" onClick={onRetry}>
        <Icon name="reset" size={16} />
        {t.retry}
      </button>
    </div>
  );
}

export function EmptyPanel({ onReset, t }: { onReset: () => void; t: PreviewCopy }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-dashed px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-savoia-50 text-savoia">
        <Icon name="search" size={22} />
      </span>
      <p className="text-lg font-bold text-navy">{t.emptyTitle}</p>
      <p className="max-w-xs text-sm text-muted">{t.emptyHint}</p>
      <button type="button" className="btn btn-outline btn-sm mt-2" onClick={onReset}>
        <Icon name="reset" size={16} />
        {t.resetFilters}
      </button>
    </div>
  );
}
