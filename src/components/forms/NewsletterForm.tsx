'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { newRequestId, originOf } from '@/lib/submission';
import { Icon } from '../ui/Icon';
import { EMAIL_RE, errorMessage, FieldError, postJson, useElapsed } from './FormBits';

type Field = 'firstName' | 'lastName' | 'email' | 'privacy' | 'newsletter' | 'form';
type Errors = Partial<Record<Field, string>>;
type Status = keyof Dictionary['newsletter']['status'];

/**
 * RAINFOREST RADAR sign-up (POST /api/newsletter). Both checkboxes are required and never
 * preselected. "Check your inbox" is shown only when the server confirms that the double
 * opt-in was started. After the confirmation click, Brevo brings the visitor back with
 * ?newsletter=<status>, shown here.
 */
export function NewsletterForm({ t, lead, locale }: { t: Dictionary['newsletter']; lead: Dictionary['lead']; locale: Locale }) {
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const elapsed = useElapsed();
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRef('');
  const id = useId();

  useEffect(() => {
    elapsed.reset();
    const s = new URLSearchParams(window.location.search).get('newsletter');
    if (s && s in t.status) {
      setStatus(s as Status);
      track('newsletter_confirm_landing', { status: s });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return; // one submission at a time
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? '').trim();
    const errs: Errors = {};
    if (!v('firstName')) errs.firstName = t.errors.firstName;
    if (!v('lastName')) errs.lastName = t.errors.lastName;
    if (!EMAIL_RE.test(v('email'))) errs.email = t.errors.email;
    if (fd.get('privacy') !== 'on') errs.privacy = t.errors.privacy;
    if (fd.get('newsletter') !== 'on') errs.newsletter = t.errors.newsletter;
    setErrors(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSending(true);
    track('newsletter_submit', {});
    requestId.current ||= newRequestId();
    const res = await postJson('/api/newsletter', {
      firstName: v('firstName'),
      lastName: v('lastName'),
      email: v('email'),
      privacy: true,
      newsletter: true,
      locale,
      requestId: requestId.current,
      origin: originOf('newsletter', 'newsletter_form'),
      utm: getUtm(),
      company_url: String(fd.get('company_url') ?? ''),
      elapsed: elapsed.get(),
    });
    setSending(false);
    if (!res.ok) return setErrors({ form: errorMessage(res.status, lead) });
    track('newsletter_success', {});
    requestId.current = '';
    setDone(true);
    formRef.current?.reset();
  };

  const statusBox = status && (
    <div role="status" className={`mb-5 rounded-2xl px-4 py-3 text-sm ${status === 'invalid' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-ink'}`}>
      <p className="font-extrabold">{t.status[status].title}</p>
      <p className="mt-0.5">{fmt(t.status[status].text, { email: SITE.email })}</p>
    </div>
  );

  if (done) {
    return (
      <div className="card p-6 md:p-8" role="status" aria-live="polite">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-savoia-50 text-savoia-700">
          <Icon name="mail" size={24} />
        </span>
        <p className="mt-4 text-xl font-extrabold text-navy">{t.successTitle}</p>
        <p className="mt-2 text-muted">{t.successText}</p>
      </div>
    );
  }

  const input = (name: 'firstName' | 'lastName' | 'email', label: string, extra: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className={name === 'email' ? 'sm:col-span-2' : ''}>
      <label htmlFor={`${id}-${name}`} className="mb-1 block text-sm font-bold text-navy">
        {label}
        <span aria-hidden="true" className="text-savoia">
          {' '}
          *
        </span>
        <span className="sr-only"> ({t.required})</span>
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        required
        className="field min-h-11 text-base md:text-[0.9375rem]"
        aria-invalid={errors[name] ? 'true' : undefined}
        aria-describedby={errors[name] ? `${id}-${name}-err` : undefined}
        {...extra}
      />
      <FieldError id={`${id}-${name}-err`}>{errors[name]}</FieldError>
    </div>
  );
  const [before, after] = t.consentPrivacy.split('{privacy}');
  const check = (name: 'privacy' | 'newsletter', children: React.ReactNode) => (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name={name}
          required
          className="mt-0.5 size-[18px] shrink-0 accent-savoia"
          aria-invalid={errors[name] ? 'true' : undefined}
          aria-describedby={errors[name] ? `${id}-${name}-err` : undefined}
        />
        <span>
          {children}
          <span aria-hidden="true" className="text-savoia">
            {' '}
            *
          </span>
        </span>
      </label>
      <FieldError id={`${id}-${name}-err`}>{errors[name]}</FieldError>
    </div>
  );

  return (
    <div>
      {statusBox}
      <form ref={formRef} onSubmit={submit} noValidate aria-label={t.formLabel} className="card relative grid gap-4 p-5 shadow-[var(--shadow-card)] sm:grid-cols-2 md:p-7">
        {input('firstName', t.firstName, { type: 'text', autoComplete: 'given-name', maxLength: 100 })}
        {input('lastName', t.lastName, { type: 'text', autoComplete: 'family-name', maxLength: 100 })}
        {input('email', t.email, { type: 'email', inputMode: 'email', autoComplete: 'email', maxLength: 200, placeholder: t.emailPlaceholder })}
        <div className="grid gap-3 sm:col-span-2">
          {check(
            'privacy',
            <>
              {before}
              <a href={`/${locale}/privacy`} target="_blank" rel="noopener" className="font-bold text-savoia-700 underline underline-offset-2">
                {t.privacyLink}
              </a>
              {after}
            </>,
          )}
          {check('newsletter', t.consentNewsletter)}
        </div>
        {/* Honeypot: hidden from people and assistive tech. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Company URL
            <input type="text" name="company_url" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {errors.form && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger sm:col-span-2">
            {errors.form}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <button type="submit" className="btn btn-primary w-full sm:w-auto sm:justify-self-start" disabled={sending} aria-busy={sending}>
            {sending ? t.sending : t.cta}
            {!sending && <Icon name="arrowRight" size={18} />}
          </button>
          <p className="text-xs text-subtle">{t.microcopy}</p>
        </div>
      </form>
    </div>
  );
}
