'use client';

import { Icon } from '../ui/Icon';

export type ExplorerView = 'map' | 'database';

/**
 * Map | Database switch with a sliding indicator (tabs pattern, ← → to switch).
 * Light on purpose: also rendered by the lazy placeholder before the explorer loads.
 */
export function ViewSwitch({
  view,
  onChange,
  labels,
  ariaLabel,
  count,
  ids,
}: {
  view: ExplorerView;
  onChange?: (v: ExplorerView) => void;
  labels: Record<ExplorerView, string>;
  ariaLabel: string;
  /** Results count shown on both tabs (same filtered set). */
  count?: string;
  ids?: Record<ExplorerView, string>;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative grid w-full grid-cols-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15 backdrop-blur-sm sm:w-auto"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange?.(view === 'map' ? 'database' : 'map');
        }
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] rounded-xl bg-white shadow-[0_12px_28px_-12px_rgb(10_24_40/0.8)] transition-transform duration-300 ease-[var(--ease-out-soft)]"
        style={{ transform: view === 'database' ? 'translateX(100%)' : undefined }}
      />
      {(['map', 'database'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          id={ids ? `${ids[v]}-tab` : undefined}
          aria-controls={ids?.[v]}
          aria-selected={view === v}
          tabIndex={view === v ? 0 : -1}
          onClick={() => onChange?.(v)}
          className={`relative z-10 inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-5 text-[0.9875rem] font-bold transition-colors duration-200 sm:min-w-44 sm:px-6 ${
            view === v ? 'text-navy' : 'text-white/85 hover:text-white'
          }`}
        >
          <Icon name={v === 'map' ? 'map' : 'list'} size={19} className={view === v ? 'text-savoia' : ''} />
          {labels[v]}
          {count && (
            <span
              className={`rounded-full px-2 py-0.5 text-[0.75rem] tabular-nums transition-colors ${
                view === v ? 'bg-savoia-50 text-savoia-700' : 'bg-white/10 text-white/80'
              }`}
            >
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
