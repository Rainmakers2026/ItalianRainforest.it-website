'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { getUtm, track } from '@/lib/analytics';
import type { GatedContacts, PublicPlayer } from '@/lib/data/schema';
import { fmt } from '@/lib/i18n';
import { ConsentFields, EMAIL_RE, EmailField, errorMessage, postJson, readCommon, useElapsed, type FormErrors } from '../forms/FormBits';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';

/** "Richiedi i contatti / Get contact details" — the discreet lead-generation step. */
export function ContactDialog() {
  const { contactId, closeContact, byId, t } = useExplorer();
  const p = contactId ? byId.get(contactId) : undefined;
  return (
    <Dialog
      open={!!p}
      onClose={closeContact}
      closeLabel={t.a11y.close}
      title={p ? fmt(t.lead.contactTitle, { name: p.name }) : ''}
      labelledBy="contact-dialog-title"
    >
      {/* Keyed by player: state starts fresh for every request. */}
      {p && <ContactBody key={p.id} p={p} />}
    </Dialog>
  );
}

function ContactBody({ p }: { p: PublicPlayer }) {
  const { closeContact, t, locale } = useExplorer();
  const [errors, setErrors] = useState<FormErrors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ contacts: GatedContacts | null } | null>(null);
  const elapsed = useElapsed();
  const msgId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    elapsed.reset();
    track('contact_unlock_form_view', { player: p.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { email, consent, marketing, company_url, fd } = readCommon(e.currentTarget);
    const errs: FormErrors = {};
    if (!EMAIL_RE.test(email)) errs.email = t.lead.errors.email;
    if (!consent) errs.consent = t.lead.errors.consent;
    setErrors(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSending(true);
    track('contact_unlock_submit', { player: p.id });
    const res = await postJson('/api/contact-request', {
      playerId: p.id,
      email,
      consent: true,
      marketing,
      message: String(fd.get('message') ?? '').slice(0, 1000),
      locale,
      utm: getUtm(),
      company_url,
      elapsed: elapsed.get(),
    });
    setSending(false);
    if (!res.ok) return setErrors({ form: errorMessage(res.status, t.lead) });
    track('contact_unlock_success', { player: p.id, revealed: !!res.data.contacts });
    setDone({ contacts: (res.data.contacts as GatedContacts | null) ?? null });
  };

  const c = done?.contacts;
  return done ? (
    <div role="status" className="grid gap-3">
      <p className="flex items-center gap-2 text-lg font-extrabold text-success">
        <Icon name="check" /> {t.lead.successTitle}
      </p>
      {c && (c.email || c.phone || c.contactPerson) ? (
        <>
          <p className="text-muted">{t.lead.revealed}</p>
          <ul className="grid gap-1 rounded-xl bg-mist p-4 font-semibold text-navy">
            {c.contactPerson && <li>{c.contactPerson}</li>}
            {c.email && (
              <li>
                <a className="text-savoia-700 underline" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              </li>
            )}
            {c.phone && (
              <li>
                <a className="text-savoia-700 underline" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                  {c.phone}
                </a>
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="text-muted">{t.lead.success}</p>
      )}
      <button type="button" className="btn btn-outline mt-2 justify-self-start" onClick={closeContact}>
        {t.a11y.close}
      </button>
    </div>
  ) : (
    <form ref={formRef} onSubmit={submit} noValidate className="relative grid gap-4">
      <p className="text-[0.9375rem] leading-relaxed text-muted">{t.lead.contactLead}</p>
      <EmailField t={t.lead} error={errors.email} />
      <div>
        <label htmlFor={msgId} className="mb-1 block text-sm font-bold text-navy">
          {t.lead.message}
        </label>
        <textarea id={msgId} name="message" rows={3} maxLength={1000} className="field resize-y" />
      </div>
      <ConsentFields t={t.lead} locale={locale} error={errors.consent} />
      {errors.form && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {errors.form}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={sending} aria-busy={sending}>
        {sending ? t.lead.sending : t.lead.submit}
      </button>
    </form>
  );
}
