'use client';

import { useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import { serializeFilters } from '@/lib/filters';
import { formatNumber } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n';
import { ConsentFields, EMAIL_RE, EmailField, errorMessage, readCommon, useElapsed, type FormErrors } from '../forms/FormBits';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download buttons + light email gate. The file always respects the active filters. */
export function DownloadButtons() {
  const { t, filters, results, locale, downloadRequiresEmail, state } = useExplorer();
  const [format, setFormat] = useState<'csv' | 'json' | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const elapsed = useElapsed();
  const formRef = useRef<HTMLFormElement>(null);

  const query = () => {
    const sp = serializeFilters(filters);
    sp.set('locale', locale);
    return sp;
  };

  const start = (f: 'csv' | 'json') => {
    track('database_download_click', { format: f, rows: results.length });
    if (downloadRequiresEmail) {
      setErrors({});
      setOk(false);
      elapsed.reset();
      return setFormat(f);
    }
    const sp = query();
    sp.set('format', f);
    track('database_download_success', { format: f, rows: results.length });
    const a = document.createElement('a');
    a.href = `/api/download?${sp}`;
    a.download = '';
    a.click();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!format) return;
    const { email, consent, marketing, company_url } = readCommon(e.currentTarget);
    const errs: FormErrors = {};
    if (!EMAIL_RE.test(email)) errs.email = t.lead.errors.email;
    if (!consent) errs.consent = t.lead.errors.consent;
    setErrors(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          consent: true,
          marketing,
          format,
          query: query().toString(),
          locale,
          utm: getUtm(),
          company_url,
          elapsed: elapsed.get(),
        }),
      });
      if (!res.ok) {
        setErrors({ form: res.status === 429 ? t.lead.errors.rate : t.download.error });
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `italian-rainforest.${format}`;
      saveBlob(await res.blob(), name);
      track('database_download_success', { format, rows: Number(res.headers.get('x-row-count') ?? results.length) });
      setOk(true);
    } catch {
      setErrors({ form: errorMessage(0, t.lead) });
    } finally {
      setBusy(false);
    }
  };

  const disabled = state !== 'ready' || results.length === 0;
  return (
    <>
      <div className="flex items-center gap-2" role="group" aria-label={t.database.download}>
        <span className="hidden text-sm font-bold text-muted sm:inline">{t.database.download}</span>
        {(['csv', 'json'] as const).map((f) => (
          <button key={f} type="button" className="btn btn-outline btn-sm" onClick={() => start(f)} disabled={disabled}>
            <Icon name="download" size={16} />
            {f === 'csv' ? t.database.downloadCsv : t.database.downloadJson}
          </button>
        ))}
      </div>
      <Dialog
        open={!!format}
        onClose={() => setFormat(null)}
        closeLabel={t.a11y.close}
        title={t.download.title}
        labelledBy="download-title"
      >
        {ok ? (
          <div role="status" className="grid gap-3">
            <p className="flex items-center gap-2 font-extrabold text-success">
              <Icon name="check" /> {t.download.success}
            </p>
            <p className="text-sm text-muted">{t.download.license}</p>
            <button type="button" className="btn btn-outline justify-self-start" onClick={() => setFormat(null)}>
              {t.a11y.close}
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={submit} noValidate className="relative grid gap-4">
            <p className="text-[0.9375rem] leading-relaxed text-muted">
              {fmt(t.download.lead, { format: (format ?? 'csv').toUpperCase(), n: formatNumber(results.length, locale) })}
            </p>
            <p className="text-sm text-muted">{t.download.emailWhy}</p>
            <EmailField t={t.lead} error={errors.email} />
            <ConsentFields t={t.lead} locale={locale} error={errors.consent} />
            <p className="text-xs text-subtle">{t.download.license}</p>
            {errors.form && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                {errors.form}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              <Icon name="download" size={18} />
              {fmt(t.download.submit, { format: (format ?? 'csv').toUpperCase() })}
            </button>
          </form>
        )}
      </Dialog>
    </>
  );
}
