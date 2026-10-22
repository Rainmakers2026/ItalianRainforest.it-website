'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { Icon } from '../ui/Icon';
import {
  ConsentFields,
  EMAIL_RE,
  EmailField,
  errorMessage,
  FieldError,
  postJson,
  readCommon,
  useElapsed,
  type FormErrors,
} from './FormBits';

type Kind = 'new' | 'correction' | 'other';
export type SuggestDetail = { type?: Kind; organization?: string };

/** Opens/prefills the update form from anywhere on the page. */
export function openSuggest(detail: SuggestDetail) {
  window.dispatchEvent(new CustomEvent<SuggestDetail>('irf:suggest', { detail }));
}

/**
 * "Segnala un aggiornamento / Suggest an update". Submissions go to the moderation
 * sink (/api/suggest) and are reviewed before publication. Nothing is written to Airtable.
 */
export function UpdateForm({ t, lead, locale }: { t: Dictionary['update']; lead: Dictionary['lead']; locale: Locale }) {
  const [kind, setKind] = useState<Kind>('new');
  const [org, setOrg] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const elapsed = useElapsed();
  const formRef = useRef<HTMLFormElement>(null);
  const ids = { org: useId(), web: useId(), det: useId(), type: useId() };

  useEffect(() => {
    elapsed.reset();
    const onSuggest = (e: Event) => {
      const d = (e as CustomEvent<SuggestDetail>).detail ?? {};
      if (d.type) setKind(d.type);
      if (d.organization !== undefined) setOrg(d.organization);
      setDone(false);
      setTimeout(
        () =>
          formRef.current?.querySelector<HTMLElement>(d.organization ? 'textarea' : 'input[type="text"]')?.focus({ preventScroll: true }),
        450,
      );
    };
    window.addEventListener('irf:suggest', onSuggest);
    return () => window.removeEventListener('irf:suggest', onSuggest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { email, consent, marketing, company_url, fd } = readCommon(e.currentTarget);
    const details = String(fd.get('details') ?? '').trim();
    const errs: FormErrors = {};
    if (!org.trim()) errs.org = t.errors.org;
    if (details.length < 10) errs.details = t.errors.details;
    if (!EMAIL_RE.test(email)) errs.email = lead.errors.email;
    if (!consent) errs.consent = lead.errors.consent;
    setErrors(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSending(true);
    track('update_form_submit', { type: kind });
    const res = await postJson('/api/suggest', {
      type: kind,
      organization: org.trim(),
      website: String(fd.get('website') ?? '').trim(),
      details,
      email,
      consent: true,
      marketing,
      locale,
      utm: getUtm(),
      company_url,
      elapsed: elapsed.get(),
    });
    setSending(false);
    if (!res.ok) return setErrors({ form: errorMessage(res.status, lead) });
    track('update_form_success', { type: kind });
    setDone(true);
    setOrg('');
    formRef.current?.reset();
  };

  if (done) {
    return (
      <div role="status" className="card flex flex-col items-start gap-3 p-6 md:p-8">
        <p className="flex items-center gap-2 text-lg font-extrabold text-success">
          <Icon name="check" /> {t.success}
        </p>
        <button type="button" className="btn btn-outline" onClick={() => setDone(false)}>
          {t.cta}
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="card relative grid gap-4 p-5 shadow-[var(--shadow-card)] md:p-7">
      <h3 className="text-lg font-extrabold text-navy">{t.formTitle}</h3>
      <fieldset>
        <legend id={ids.type} className="mb-2 text-sm font-bold text-navy">
          {t.type}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(t.types) as Kind[]).map((k) => (
            <label
              key={k}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                kind === k ? 'border-savoia bg-savoia-50 text-savoia-700' : 'border-line-strong text-ink hover:border-subtle'
              }`}
            >
              <input type="radio" name="type" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-savoia" />
              {t.types[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.org} className="mb-1 block text-sm font-bold text-navy">
            {t.org}
          </label>
          <input
            id={ids.org}
            type="text"
            name="organization"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            maxLength={200}
            required
            className="field"
            aria-invalid={errors.org ? 'true' : undefined}
            aria-describedby={errors.org ? `${ids.org}-err` : undefined}
          />
          <FieldError id={`${ids.org}-err`}>{errors.org}</FieldError>
        </div>
        <div>
          <label htmlFor={ids.web} className="mb-1 block text-sm font-bold text-navy">
            {t.website}
          </label>
          <input id={ids.web} type="url" name="website" inputMode="url" maxLength={300} placeholder="https://" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={ids.det} className="mb-1 block text-sm font-bold text-navy">
          {t.details}
        </label>
        <textarea
          id={ids.det}
          name="details"
          rows={4}
          maxLength={3000}
          required
          placeholder={t.detailsPlaceholder}
          className="field resize-y"
          aria-invalid={errors.details ? 'true' : undefined}
          aria-describedby={errors.details ? `${ids.det}-err` : undefined}
        />
        <FieldError id={`${ids.det}-err`}>{errors.details}</FieldError>
      </div>
      <EmailField t={lead} error={errors.email} label={t.email} />
      <ConsentFields t={lead} locale={locale} error={errors.consent} />
      {errors.form && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {errors.form}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={sending} aria-busy={sending}>
          {sending ? lead.sending : t.submit}
        </button>
        <a href={`mailto:${SITE.email}`} className="text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink">
          {fmt(t.orEmail, { email: SITE.email })}
        </a>
      </div>
    </form>
  );
}

/** Link that scrolls to the form and preselects a type. */
export function SuggestLink({ type, className, children }: { type: Kind; className?: string; children: React.ReactNode }) {
  return (
    <a href="#update" className={className} onClick={() => openSuggest({ type, organization: '' })}>
      {children}
    </a>
  );
}
