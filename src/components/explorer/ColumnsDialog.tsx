'use client';

import { useId, useState } from 'react';
import { DEFAULT_DOWNLOAD_FIELDS, DOWNLOAD_FIELDS, REQUIRED_FIELDS, type DownloadField } from '@/lib/download-fields';
import { fmt } from '@/lib/i18n';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';

/** iOS-style switch (button role="switch"), keyboard and screen-reader friendly. */
function Switch({ checked, disabled, onChange, labelledBy }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-savoia focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-savoia' : 'bg-line'}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(20_48_79/0.35)] transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export type ColumnsRequest = { format: string; rows: string; initial: DownloadField[]; onConfirm: (fields: DownloadField[]) => void };

/**
 * "Columns" step shown after the sign-up and before every data download: one switch per
 * database column (public fields only). The choice is applied to CSV, JSON and PDF.
 */
export function ColumnsDialog({ request, onClose }: { request: ColumnsRequest | null; onClose: () => void }) {
  const { t } = useExplorer();
  const c = t.download.columns;
  const titleId = useId();
  const idBase = useId();
  const [fields, setFields] = useState<DownloadField[]>(DEFAULT_DOWNLOAD_FIELDS);
  const [last, setLast] = useState<ColumnsRequest | null>(null);
  // New request: start from the remembered choice (kept while the dialog fades out).
  if (request && request !== last) {
    setLast(request);
    setFields(request.initial);
  }
  const shown = request ?? last;

  const toggle = (f: DownloadField, on: boolean) => setFields((cur) => (on ? DOWNLOAD_FIELDS.filter((x) => x === f || cur.includes(x)) : cur.filter((x) => x !== f)));

  return (
    <Dialog open={!!request} onClose={onClose} closeLabel={c.cancel} labelledBy={titleId} bare>
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-[1.75rem] leading-tight font-extrabold text-navy">
          {c.title}
        </h2>
        <button type="button" onClick={onClose} className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink" aria-label={c.cancel}>
          <Icon name="x" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{c.lead}</p>

      <ul className="mt-5 grid gap-1">
        {DOWNLOAD_FIELDS.map((f) => {
          const required = REQUIRED_FIELDS.includes(f);
          const labelId = `${idBase}-${f}`;
          return (
            <li key={f}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-mist/60">
                <Switch checked={required || fields.includes(f)} disabled={required} onChange={(on) => toggle(f, on)} labelledBy={labelId} />
                <span id={labelId} className="text-[1.0625rem] text-ink">
                  {c.fields[f]}
                  {required && <span className="ml-2 text-xs text-subtle">({c.required})</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <button type="button" className="text-savoia-700 hover:underline" onClick={() => setFields([...DOWNLOAD_FIELDS])}>
          {c.all}
        </button>
        <button type="button" className="text-savoia-700 hover:underline" onClick={() => setFields([...DEFAULT_DOWNLOAD_FIELDS])}>
          {c.reset}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
        <Icon name="info" size={14} className="shrink-0" />
        {c.privacy}
      </p>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
          {c.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const chosen = DOWNLOAD_FIELDS.filter((f) => REQUIRED_FIELDS.includes(f) || fields.includes(f));
            shown?.onConfirm(chosen);
            onClose();
          }}
        >
          <Icon name="download" size={16} />
          {fmt(c.confirm, { format: shown?.format ?? '', n: shown?.rows ?? '' })}
        </button>
      </div>
    </Dialog>
  );
}
