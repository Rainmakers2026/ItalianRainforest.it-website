'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import { saveLeadProfile } from '@/lib/lead-profile';
import { ConsentFields, EMAIL_RE, errorMessage, FieldError, postJson, readCommon, useElapsed, type FormErrors } from '../forms/FormBits';
import { Dialog, useLingering } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { useExplorer, type LeadReason } from './ExplorerProvider';

type Field = 'firstName' | 'lastName' | 'email' | 'company';
const AUTOCOMPLETE: Record<Field, string> = {
  firstName: 'given-name',
  lastName: 'family-name',
  email: 'email',
  company: 'organization',
};

function Input({ name, label, hint, error, required = true, className = '' }: { name: Field; label: string; hint?: string; error?: string; required?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[0.8125rem] font-bold text-navy">
        {label}
        {required && <span aria-hidden="true" className="text-savoia"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={name === 'email' ? 'email' : 'text'}
        inputMode={name === 'email' ? 'email' : undefined}
        required={required}
        maxLength={name === 'email' ? 200 : name === 'company' ? 160 : 100}
        autoComplete={AUTOCOMPLETE[name]}
        // 16px on mobile: no zoom-on-focus in iOS Safari.
        className="field min-h-11 text-base md:text-[0.9375rem]"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

/**
 * One-time sign-up (pay-per-data) shown before the first download (CSV, JSON, PDF,
 * PNG) or embed code. Browsing and filtering map and database stay free. On success the profile is kept in this browser and the pending action
 * (the download, the reveal) runs immediately.
 */
export function LeadGate() {
  const { leadGate, completeLead, t } = useExplorer();
  const shown = useLingering(leadGate);
  return (
    <Dialog open={!!leadGate} onClose={() => completeLead(null)} closeLabel={t.a11y.close} labelledBy="lead-gate-title" bare>
      {shown && <GateBody key={shown} reason={shown} />}
    </Dialog>
  );
}

function GateBody({ reason }: { reason: LeadReason }) {
  const { completeLead, t, locale } = useExplorer();
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const elapsed = useElapsed();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    elapsed.reset();
    track('lead_gate_view', { reason });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { email, consent, marketing, company_url, fd } = readCommon(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? '').trim();
    const errs: FormErrors = {};
    if (!v('firstName')) errs.firstName = t.lead.errors.firstName;
    if (!v('lastName')) errs.lastName = t.lead.errors.lastName;
    if (!EMAIL_RE.test(email)) errs.email = t.lead.errors.email;
    if (!consent) errs.consent = t.lead.errors.consent;
    setErrors(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    const profile = {
      firstName: v('firstName'),
      lastName: v('lastName'),
      email,
      company: '',
    };
    const res = await postJson('/api/signup', {
      ...profile,
      consent: true,
      marketing,
      reason,
      locale,
      utm: getUtm(),
      company_url,
      elapsed: elapsed.get(),
    });
    setBusy(false);
    if (!res.ok) return setErrors({ form: errorMessage(res.status, t.lead) });
    track('lead_signup', { reason });
    saveLeadProfile(profile);
    completeLead({ ...profile, at: new Date().toISOString() });
  };

  return (
    <div className="-mx-5 -my-5">
      <div className="on-dark relative isolate overflow-hidden px-6 pt-6 pb-5 text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_100%_0%,rgb(159_227_245/0.35),transparent_60%),linear-gradient(140deg,#2c4f9c_0%,#3a5ec4_50%,#1b3a5c_100%)]"
        />
        <div className="flex items-start justify-between gap-4">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-savoia shadow-[0_10px_24px_-10px_rgb(10_24_40/0.7)]">
            <Icon name="download" size={22} />
          </span>
          <form method="dialog">
            <button
              type="submit"
              className="-mt-1 -mr-2 inline-flex size-11 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white"
              aria-label={t.a11y.close}
            >
              <Icon name="x" />
            </button>
          </form>
        </div>
        <h2 id="lead-gate-title" className="mt-4 text-xl leading-tight font-black tracking-tight">
          {reason === 'embed' ? t.lead.gateTitleEmbed : t.lead.gateTitle}
        </h2>
        <p className="mt-1.5 text-[0.9375rem] text-white/90">{t.lead.gateLead}</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] font-semibold text-sky">
          {t.lead.gatePerks.map((perk) => (
            <li key={perk} className="flex items-center gap-1.5">
              <Icon name="check" size={14} />
              {perk}
            </li>
          ))}
        </ul>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="relative grid grid-cols-2 gap-3 px-6 pt-5 pb-6">
        <Input name="firstName" label={t.lead.firstName} error={errors.firstName} className="col-span-2 min-[400px]:col-span-1" />
        <Input name="lastName" label={t.lead.lastName} error={errors.lastName} className="col-span-2 min-[400px]:col-span-1" />
        <Input name="email" label={t.lead.email} error={errors.email} className="col-span-2" />
        <div className="col-span-2 text-[0.8125rem]">
          <ConsentFields t={t.lead} locale={locale} error={errors.consent} />
        </div>
        {errors.form && (
          <p role="alert" className="col-span-2 rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {errors.form}
          </p>
        )}
        <button type="submit" className="btn btn-primary col-span-2 w-full" disabled={busy} aria-busy={busy}>
          {busy ? t.lead.sending : t.lead.gateSubmit}
          {!busy && <Icon name="arrowRight" size={18} />}
        </button>
      </form>
    </div>
  );
}
