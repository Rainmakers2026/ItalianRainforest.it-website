'use client';

import { useId, useRef, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/config';
import { fmt, type Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';

export type LeadStrings = Dictionary['lead'];
export type FormErrors = Partial<Record<'email' | 'consent' | 'org' | 'details' | 'form' | 'firstName' | 'lastName' | 'company', string>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Milliseconds since the form was shown — used server-side as a bot signal. */
export function useElapsed() {
  const start = useRef(0);
  return {
    reset: () => (start.current = Date.now()),
    get: () => (start.current ? Date.now() - start.current : 0),
  };
}

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    return { ok: res.ok, status: res.status, data: isJson ? await res.json() : {} };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

export function errorMessage(status: number, t: LeadStrings) {
  if (status === 429) return t.errors.rate;
  if (status === 503) return fmt(t.errors.unavailable, { email: SITE.email });
  return fmt(t.errors.generic, { email: SITE.email });
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-sm font-semibold text-danger">
      {children}
    </p>
  );
}

export function EmailField({ t, error, defaultValue, label }: { t: LeadStrings; error?: string; defaultValue?: string; label?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-navy">
        {label ?? t.email}
      </label>
      <input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={200}
        defaultValue={defaultValue}
        placeholder={t.emailPlaceholder}
        className="field"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

/** Required processing consent + optional marketing consent + honeypot. */
export function ConsentFields({
  t,
  locale,
  error,
  marketing = true,
}: {
  t: LeadStrings;
  locale: Locale;
  error?: string;
  /** Optional newsletter opt-in (off for forms that collect no email). */
  marketing?: boolean;
}) {
  const id = useId();
  const [before, after] = t.consent.split('{privacy}');
  return (
    <div className="grid gap-3 text-sm">
      <div>
        <label className="flex items-start gap-2.5 text-ink">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 size-[18px] shrink-0 accent-savoia"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
          />
          <span>
            {before}
            <a
              href={`/${locale}/privacy`}
              target="_blank"
              rel="noopener"
              className="font-bold text-savoia-700 underline underline-offset-2"
            >
              {t.privacyLink}
            </a>
            {after}
          </span>
        </label>
        <FieldError id={`${id}-err`}>{error}</FieldError>
      </div>
      {marketing && (
        <label className="flex items-start gap-2.5 text-muted">
          <input type="checkbox" name="marketing" className="mt-0.5 size-[18px] shrink-0 accent-savoia" />
          <span>{t.marketing}</span>
        </label>
      )}
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company URL
          <input type="text" name="company_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
    </div>
  );
}

export function readCommon(form: HTMLFormElement) {
  const fd = new FormData(form);
  return {
    email: String(fd.get('email') ?? '').trim(),
    consent: fd.get('consent') === 'on',
    marketing: fd.get('marketing') === 'on',
    company_url: String(fd.get('company_url') ?? ''),
    fd,
  };
}
