import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDictionary } from '../i18n';
import { getSupabase } from '../supabase/server';
import { AirtableError, deleteRecord, findBySupabaseId, subscriberFields, unsubscriberFields, upsertBySupabaseId, type SubscriberRow } from './airtable';
import { BrevoError, getContact, isActiveMember, requestDoubleOptIn, sendTemplate } from './brevo';
import { airtableSyncConfig, brevoConfig, newsletterConsentVersion, privacyNoticeVersion, publicOrigin, tokenSecret } from './config';
import { signConfirmToken, verifyConfirmToken } from './token';

/**
 * RAINFOREST RADAR — lifecycle of a subscription. Supabase (newsletter_subscribers +
 * newsletter_consent_events) is the single source of truth; Brevo runs the double opt-in,
 * the welcome email and the unsubscriptions; Airtable gets a one-way copy.
 *
 *   form → PENDING (+ CONSENT_GIVEN) → Brevo double opt-in (DOI_REQUESTED)
 *   → click → /api/newsletter/confirm (signed link) + Brevo membership check
 *   → SUBSCRIBED (DOI_CONFIRMED) → welcome once per cycle → Airtable ISCRITTI
 *   Brevo "unsubscribe" webhook → UNSUBSCRIBED → Airtable DISISCRITTI, then out of ISCRITTI
 *
 * Rules: only a verified confirmation makes SUBSCRIBED; nothing reactivates an UNSUBSCRIBED
 * or BLOCKED contact without a new explicit consent AND a new double opt-in; the original
 * consent is never overwritten (every consent is a new history row). Logs carry codes only.
 */

export const T_SUBS = 'newsletter_subscribers';
export const T_EVENTS = 'newsletter_consent_events';

export type SourceForm = 'NEWSLETTER_SIGNUP' | 'DOWNLOAD_REGISTRATION' | 'EMBED_REQUEST' | 'DATABASE_UPDATE_REQUEST';
type Status = SubscriberRow['subscription_status'];
type Sub = SubscriberRow & {
  doi_cycle_id: string | null;
  doi_requested_at: string | null;
  doi_clicked_at: string | null;
  welcome_claimed_at: string | null;
  welcome_sent_at: string | null;
  status_changed_at: string;
  privacy_acknowledged_at: string | null;
  brevo_next_attempt_at: string | null;
  airtable_next_attempt_at: string | null;
  brevo_sync_status: string;
  brevo_sync_attempts: number;
  airtable_subscriber_record_id: string | null;
  airtable_unsubscriber_record_id: string | null;
  airtable_sync_attempts: number;
};

export class NewsletterUnavailable extends Error {}
class DbError extends Error {
  readonly table: string;
  readonly code: string;
  constructor(table: string, code: string) {
    super(`Supabase ${table} failed (${code || 'network'})`);
    this.table = table;
    this.code = code;
  }
}

const now = () => new Date().toISOString();
const sb = () => getSupabase();
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
/** Retry schedule: 5, 20, 80 minutes, … capped at 24 h. */
const backoff = (attempts: number) => minutes(Math.min(5 * 4 ** Math.max(0, attempts - 1), 1440));
const describe = (err: unknown) => (err instanceof Error ? err.message : 'unexpected error');
const log = (scope: string, err: unknown) => console.error(`[newsletter:${scope}]`, describe(err));

async function load(id: string): Promise<Sub | null> {
  const { data, error } = await sb().from(T_SUBS).select('*').eq('id', id).limit(1);
  if (error) throw new DbError(T_SUBS, error.code);
  return (data?.[0] as Sub | undefined) ?? null;
}
async function findByEmail(email: string): Promise<Sub | null> {
  const { data, error } = await sb().from(T_SUBS).select('*').eq('email', email).limit(1);
  if (error) throw new DbError(T_SUBS, error.code);
  return (data?.[0] as Sub | undefined) ?? null;
}
async function patch(id: string, values: Record<string, unknown>, guard: Record<string, string | null> = {}): Promise<boolean> {
  let q = sb().from(T_SUBS).update({ ...values, updated_at: now() }).eq('id', id);
  for (const [k, v] of Object.entries(guard)) q = v === null ? q.is(k, null) : q.eq(k, v);
  const { data, error } = await q.select('id');
  if (error) throw new DbError(T_SUBS, error.code);
  return (data?.length ?? 0) > 0;
}

type EventInput = {
  subscriber_id: string;
  event_type: string;
  previous_status?: Status | null;
  new_status?: Status | null;
  occurred_at?: string;
  request_id?: string;
  external_event_id?: string;
  details?: Record<string, unknown>;
} & Partial<Record<'source_form' | 'locale' | 'consent_text' | 'newsletter_consent_version' | 'privacy_notice_version' | 'page_path' | 'page_section' | 'cta' | 'channel' | 'reason', string | null>> &
  Partial<Record<'newsletter_consent' | 'privacy_acknowledged', boolean>> & { utm?: Record<string, string> | null };

/** Appends a history row. Returns false when the same request / provider event was already recorded. */
async function event(e: EventInput): Promise<boolean> {
  const { error } = await sb().from(T_EVENTS).insert(e);
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new DbError(T_EVENTS, error.code);
}

// ---------------------------------------------------------------------------------------
// Subscribe (dedicated form) / opt-in (optional checkbox of the other forms)
// ---------------------------------------------------------------------------------------
export type SubscribeInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  locale: 'it' | 'en';
  sourceForm: SourceForm;
  /** The privacy notice was acknowledged in the same form. */
  privacyAcknowledged: boolean;
  origin?: { page: string; section: string; cta: string };
  utm?: Record<string, string>;
  /** Idempotency key of the submission (same id = same consent, recorded once). */
  requestId: string;
};
export type SubscribeOutcome = 'doi_requested' | 'doi_pending' | 'already_subscribed' | 'blocked' | 'duplicate' | 'stored';

/** The exact consent text the visitor saw (the explorer forms are in English on both home pages). */
function consentText(form: SourceForm, locale: 'it' | 'en'): string {
  if (form === 'NEWSLETTER_SIGNUP') return getDictionary(locale).newsletter.consentNewsletter;
  if (form === 'DATABASE_UPDATE_REQUEST') return getDictionary(locale).lead.marketing;
  return getDictionary('en').lead.marketing;
}

/** True when everything the dedicated form needs is configured (no write otherwise). */
export const signupAvailable = () => !!brevoConfig() && !!tokenSecret() && !!privacyNoticeVersion();

export async function subscribe(input: SubscribeInput, mode: 'dedicated' | 'optional'): Promise<SubscribeOutcome> {
  if (mode === 'dedicated' && !signupAvailable()) throw new NewsletterUnavailable('RAINFOREST RADAR signup not configured');
  const consentVersion = newsletterConsentVersion();
  const privacyVersion = privacyNoticeVersion();
  if (!consentVersion || !privacyVersion) throw new NewsletterUnavailable('consent / privacy version not configured');
  const email = input.email.trim().toLowerCase();
  const at = now();
  const origin = input.origin ? { page_path: input.origin.page, page_section: input.origin.section, cta: input.origin.cta } : {};
  const utm = input.utm && Object.keys(input.utm).length ? input.utm : null;

  let sub = await findByEmail(email);
  let created = false;
  if (!sub) {
    const { error } = await sb()
      .from(T_SUBS)
      .insert({
        email,
        first_name: input.firstName || null,
        last_name: input.lastName || null,
        locale: input.locale,
        source_form: input.sourceForm,
        newsletter_consent: true,
        newsletter_consent_at: at,
        newsletter_consent_version: consentVersion,
        privacy_notice_version: privacyVersion,
        privacy_acknowledged: input.privacyAcknowledged,
        privacy_acknowledged_at: input.privacyAcknowledged ? at : null,
        subscription_status: 'PENDING',
        double_opt_in_confirmed: false,
        brevo_sync_status: 'PENDING',
        doi_cycle_id: randomUUID(),
        status_changed_at: at,
        ...origin,
        utm,
      });
    if (error && error.code !== '23505') throw new DbError(T_SUBS, error.code);
    sub = await findByEmail(email);
    created = !error;
    if (!sub) throw new DbError(T_SUBS, 'not_found_after_insert');
  }

  // Consent proof: one history row per submission (idempotent on the request id).
  const resubscribe = sub.subscription_status === 'UNSUBSCRIBED';
  const fresh = await event({
    subscriber_id: sub.id,
    event_type: sub.subscription_status === 'BLOCKED' ? 'BLOCKED_ATTEMPT' : resubscribe ? 'RESUBSCRIBE_REQUESTED' : 'CONSENT_GIVEN',
    previous_status: created ? null : sub.subscription_status,
    new_status: sub.subscription_status,
    source_form: input.sourceForm,
    locale: input.locale,
    newsletter_consent: true,
    consent_text: consentText(input.sourceForm, input.locale),
    newsletter_consent_version: consentVersion,
    privacy_acknowledged: input.privacyAcknowledged,
    privacy_notice_version: privacyVersion,
    ...origin,
    utm,
    request_id: input.requestId,
  });
  if (!fresh) return 'duplicate';

  if (sub.subscription_status === 'BLOCKED') return 'blocked';
  if (sub.subscription_status === 'SUBSCRIBED' && sub.double_opt_in_confirmed) {
    // Fill missing names only; the original consent stays as it is.
    const fill: Record<string, string> = {};
    if (!sub.first_name && input.firstName) fill.first_name = input.firstName;
    if (!sub.last_name && input.lastName) fill.last_name = input.lastName;
    if (Object.keys(fill).length) await patch(sub.id, fill);
    return 'already_subscribed';
  }

  if (!created) {
    const upd: Record<string, unknown> = {};
    if (!sub.first_name && input.firstName) upd.first_name = input.firstName;
    if (!sub.last_name && input.lastName) upd.last_name = input.lastName;
    if (input.privacyAcknowledged && !sub.privacy_acknowledged_at) Object.assign(upd, { privacy_acknowledged: true, privacy_acknowledged_at: at });
    // A voluntary re-subscription opens a NEW double opt-in cycle; the status stays
    // UNSUBSCRIBED until the new confirmation (no reactivation without double opt-in).
    if (resubscribe) Object.assign(upd, { doi_cycle_id: randomUUID(), doi_requested_at: null, doi_clicked_at: null, welcome_claimed_at: null, brevo_sync_status: 'PENDING', brevo_sync_attempts: 0, brevo_next_attempt_at: null });
    else if (!sub.doi_cycle_id) upd.doi_cycle_id = randomUUID();
    if (Object.keys(upd).length) await patch(sub.id, upd);
    sub = (await load(sub.id))!;
  }

  if (!brevoConfig() || !tokenSecret()) return 'stored'; // the reconciliation job will send the double opt-in
  // A PENDING contact asked again within 2 minutes: no second email (anti-flooding).
  if (!resubscribe && sub.doi_requested_at && Date.now() - Date.parse(sub.doi_requested_at) < 120_000) return 'doi_pending';
  const ok = await startDoubleOptIn(sub);
  if (!ok && mode === 'dedicated') throw new NewsletterUnavailable('double opt-in request failed');
  return ok ? 'doi_requested' : 'stored';
}

/** Asks Brevo to send the double opt-in email of the current cycle. */
export async function startDoubleOptIn(sub: Sub): Promise<boolean> {
  const cfg = brevoConfig();
  const secret = tokenSecret();
  if (!cfg || !secret || !sub.doi_cycle_id) return false;
  const locale = sub.locale === 'en' ? 'en' : 'it';
  const link = `${publicOrigin()}/api/newsletter/confirm?l=${locale}&t=${signConfirmToken(secret, sub.id, sub.doi_cycle_id)}`;
  try {
    await requestDoubleOptIn(cfg, {
      email: sub.email,
      redirectionUrl: link,
      attributes: {
        FIRSTNAME: sub.first_name ?? '',
        LASTNAME: sub.last_name ?? '',
        LANGUAGE: locale,
        SUPABASE_ID: sub.id,
        SOURCE: sub.source,
        SOURCE_FORM: sub.source_form,
      },
    });
    await patch(sub.id, { doi_requested_at: now(), brevo_sync_status: 'SYNCED', brevo_synced_at: now(), brevo_sync_error: null, brevo_next_attempt_at: null });
    await event({ subscriber_id: sub.id, event_type: 'DOI_REQUESTED', details: { cycle: sub.doi_cycle_id } });
    return true;
  } catch (err) {
    const code = err instanceof BrevoError ? `${err.status} ${err.code}`.trim() : 'error';
    const attempts = (sub.brevo_sync_attempts ?? 0) + 1;
    await patch(sub.id, { brevo_sync_status: 'ERROR', brevo_sync_error: code.slice(0, 80), brevo_sync_attempts: attempts, brevo_next_attempt_at: backoff(attempts) });
    await event({ subscriber_id: sub.id, event_type: 'DOI_REQUEST_FAILED', details: { code: code.slice(0, 80), attempts } });
    log('doi', err);
    return false;
  }
}

// ---------------------------------------------------------------------------------------
// Confirmation (the signed link Brevo redirects to after the click)
// ---------------------------------------------------------------------------------------
export type ConfirmOutcome = 'confirmed' | 'already' | 'pending' | 'invalid';

export async function confirm(token: string): Promise<ConfirmOutcome> {
  const secret = tokenSecret();
  const cfg = brevoConfig();
  if (!secret || !cfg) return 'invalid';
  const t = verifyConfirmToken(secret, token);
  if (!t) return 'invalid';
  const sub = await load(t.subscriberId);
  if (!sub || sub.subscription_status === 'BLOCKED' || sub.doi_cycle_id !== t.cycleId) return 'invalid';
  if (sub.subscription_status === 'SUBSCRIBED' && sub.double_opt_in_confirmed) return 'already';
  if (!sub.doi_clicked_at) {
    await patch(sub.id, { doi_clicked_at: now() });
    await event({ subscriber_id: sub.id, event_type: 'DOI_CLICKED', external_event_id: `click:${t.cycleId}`, details: { cycle: t.cycleId } });
  }
  return (await finalizeIfMember(sub, t.cycleId)) ? 'confirmed' : 'pending';
}

/** SUBSCRIBED only when Brevo confirms the contact is an active member of the RADAR list. */
async function finalizeIfMember(sub: Sub, cycleId: string): Promise<boolean> {
  const cfg = brevoConfig()!;
  let contact;
  try {
    contact = await getContact(cfg, sub.email);
  } catch (err) {
    log('confirm', err);
    return false;
  }
  if (!isActiveMember(cfg, contact)) return false;
  const at = now();
  const won = await patch(
    sub.id,
    { subscription_status: 'SUBSCRIBED', double_opt_in_confirmed: true, double_opt_in_confirmed_at: at, status_changed_at: at, brevo_contact_id: contact!.id, brevo_sync_status: 'SYNCED', brevo_synced_at: at, brevo_sync_error: null, airtable_sync_status: 'PENDING', airtable_next_attempt_at: null },
    { doi_cycle_id: cycleId },
  );
  if (!won) return false;
  await event({ subscriber_id: sub.id, event_type: 'DOI_CONFIRMED', previous_status: sub.subscription_status, new_status: 'SUBSCRIBED', external_event_id: `confirm:${cycleId}`, details: { cycle: cycleId } });
  const fresh = (await load(sub.id))!;
  await sendWelcome(fresh).catch((err) => log('welcome', err));
  await syncAirtable(fresh).catch((err) => log('airtable', err));
  return true;
}

// ---------------------------------------------------------------------------------------
// Welcome email: once per confirmed cycle (atomic claim on welcome_claimed_at)
// ---------------------------------------------------------------------------------------
export async function sendWelcome(sub: Sub): Promise<'sent' | 'skipped'> {
  const cfg = brevoConfig();
  if (!cfg || sub.subscription_status !== 'SUBSCRIBED' || !sub.double_opt_in_confirmed) return 'skipped';
  const locale = sub.locale === 'en' ? 'en' : 'it';
  const templateId = cfg.welcomeTemplateId[locale];
  if (!templateId) return 'skipped'; // configured later → the reconciliation job sends it
  const claimed = await patch(sub.id, { welcome_claimed_at: now() }, { welcome_claimed_at: null, subscription_status: 'SUBSCRIBED' });
  if (!claimed) return 'skipped';
  try {
    const messageId = await sendTemplate(cfg, {
      templateId,
      email: sub.email,
      name: [sub.first_name, sub.last_name].filter(Boolean).join(' '),
      params: { FIRSTNAME: sub.first_name ?? '' },
    });
    await patch(sub.id, { welcome_sent_at: now(), welcome_message_id: messageId || null });
    await event({ subscriber_id: sub.id, event_type: 'WELCOME_SENT', details: { cycle: sub.doi_cycle_id, template: templateId } });
    return 'sent';
  } catch (err) {
    // Definitely refused (4xx, incl. 429): released for a retry. No answer / 5xx: Brevo may
    // have sent it — kept claimed (at most ONE welcome per cycle), flagged for a manual check.
    const definite = err instanceof BrevoError && err.status >= 400 && err.status < 500;
    if (definite) await patch(sub.id, { welcome_claimed_at: null });
    await event({ subscriber_id: sub.id, event_type: 'WELCOME_FAILED', details: { code: err instanceof BrevoError ? `${err.status} ${err.code}` : 'error', retry: definite, ambiguous: !definite } });
    throw err;
  }
}

// ---------------------------------------------------------------------------------------
// Brevo webhook (marketing "unsubscribe")
// ---------------------------------------------------------------------------------------
type BrevoEvent = { event?: string; email?: string; id?: number | string; list_id?: number[] | number; ts?: number; ts_event?: number; date?: string; key?: string };

export async function handleBrevoEvent(e: BrevoEvent): Promise<'unsubscribed' | 'ignored' | 'duplicate' | 'stale' | 'unknown_contact'> {
  const cfg = brevoConfig();
  if (!cfg || e.event !== 'unsubscribe' || typeof e.email !== 'string') return 'ignored';
  const lists = Array.isArray(e.list_id) ? e.list_id : typeof e.list_id === 'number' ? [e.list_id] : [];
  // A list unsubscription concerns RADAR only when it lists the RADAR list; an empty list
  // (account-level blocklist) also stops RADAR.
  if (lists.length && !lists.includes(cfg.listId)) return 'ignored';
  const sub = await findByEmail(e.email.trim().toLowerCase());
  if (!sub) return 'unknown_contact';
  const tsSec = Number(e.ts_event ?? e.ts);
  const occurredAt = Number.isFinite(tsSec) && tsSec > 0 ? new Date(tsSec * 1000).toISOString() : now();
  const externalId = `brevo:unsubscribe:${e.id ?? ''}:${sub.id}:${Number.isFinite(tsSec) ? tsSec : occurredAt}`;
  if (sub.subscription_status === 'UNSUBSCRIBED' || sub.subscription_status === 'BLOCKED') {
    return (await event({ subscriber_id: sub.id, event_type: 'EVENT_IGNORED', external_event_id: externalId, occurred_at: occurredAt, details: { reason: 'already_inactive' } })) ? 'ignored' : 'duplicate';
  }
  // Out of order: an event older than the last status change (e.g. a re-confirmation) is stale.
  if (Date.parse(occurredAt) < Date.parse(sub.status_changed_at)) {
    return (await event({ subscriber_id: sub.id, event_type: 'EVENT_IGNORED', external_event_id: externalId, occurred_at: occurredAt, details: { reason: 'stale' } })) ? 'stale' : 'duplicate';
  }
  const fresh = await event({ subscriber_id: sub.id, event_type: 'UNSUBSCRIBED', previous_status: sub.subscription_status, new_status: 'UNSUBSCRIBED', channel: 'BREVO', reason: null, occurred_at: occurredAt, external_event_id: externalId, details: { lists } });
  if (!fresh) return 'duplicate';
  await markUnsubscribed(sub, occurredAt, 'BREVO', null);
  return 'unsubscribed';
}

async function markUnsubscribed(sub: Sub, at: string, channel: 'BREVO' | 'WEBSITE' | 'MANUAL', reason: string | null) {
  await patch(sub.id, { subscription_status: 'UNSUBSCRIBED', unsubscribed_at: at, status_changed_at: at, unsubscribe_channel: channel, unsubscribe_reason: reason, brevo_synced_at: now(), airtable_sync_status: 'PENDING', airtable_next_attempt_at: null });
  await syncAirtable((await load(sub.id))!).catch((err) => log('airtable', err));
}

// ---------------------------------------------------------------------------------------
// Airtable (one-way). ISCRITTI only for confirmed subscribers; DISISCRITTI verified before
// the removal from ISCRITTI.
// ---------------------------------------------------------------------------------------
async function originalConsentAt(id: string): Promise<string | null> {
  const { data, error } = await sb().from(T_EVENTS).select('occurred_at').eq('subscriber_id', id).eq('event_type', 'CONSENT_GIVEN').order('occurred_at', { ascending: true }).limit(1);
  if (error) throw new DbError(T_EVENTS, error.code);
  return (data?.[0] as { occurred_at?: string } | undefined)?.occurred_at ?? null;
}

export async function syncAirtable(sub: Sub): Promise<'synced' | 'skipped' | 'error'> {
  let cfg;
  try {
    cfg = airtableSyncConfig();
  } catch (err) {
    // Misconfiguration (invalid ids, data base / token reused): recorded, nothing sent.
    log('airtable-config', err);
    await patch(sub.id, { airtable_sync_status: 'ERROR', airtable_sync_error: 'configuration' });
    return 'error';
  }
  if (!cfg) return 'skipped';
  try {
    if (sub.subscription_status === 'SUBSCRIBED' && sub.double_opt_in_confirmed && sub.newsletter_consent) {
      const recId = await upsertBySupabaseId(cfg, cfg.subscribersTableId, subscriberFields(sub));
      // Re-subscription: out of DISISCRITTI only after ISCRITTI is verified.
      const oldUnsub = sub.airtable_unsubscriber_record_id ?? (await findBySupabaseId(cfg, cfg.unsubscribersTableId, sub.id));
      if (oldUnsub) await deleteRecord(cfg, cfg.unsubscribersTableId, oldUnsub);
      await patch(sub.id, { airtable_subscriber_record_id: recId, airtable_unsubscriber_record_id: null, airtable_sync_status: 'SYNCED', airtable_synced_at: now(), airtable_sync_error: null, airtable_sync_attempts: 0, airtable_next_attempt_at: null });
      return 'synced';
    }
    if (sub.subscription_status === 'UNSUBSCRIBED') {
      const recId = await upsertBySupabaseId(cfg, cfg.unsubscribersTableId, unsubscriberFields(sub, await originalConsentAt(sub.id)));
      // Verified (the upsert returned the record with this SUPABASE ID): now out of ISCRITTI.
      const oldSub = sub.airtable_subscriber_record_id ?? (await findBySupabaseId(cfg, cfg.subscribersTableId, sub.id));
      if (oldSub) await deleteRecord(cfg, cfg.subscribersTableId, oldSub);
      await patch(sub.id, { airtable_unsubscriber_record_id: recId, airtable_subscriber_record_id: null, airtable_sync_status: 'SYNCED', airtable_synced_at: now(), airtable_sync_error: null, airtable_sync_attempts: 0, airtable_next_attempt_at: null });
      return 'synced';
    }
    if (sub.subscription_status === 'BLOCKED') {
      const oldSub = sub.airtable_subscriber_record_id ?? (await findBySupabaseId(cfg, cfg.subscribersTableId, sub.id));
      if (oldSub) await deleteRecord(cfg, cfg.subscribersTableId, oldSub);
    }
    // PENDING (not confirmed yet) / BLOCKED: nothing in ISCRITTI.
    await patch(sub.id, { airtable_sync_status: 'SKIPPED', airtable_subscriber_record_id: null, airtable_sync_error: null, airtable_next_attempt_at: null });
    return 'skipped';
  } catch (err) {
    const code = err instanceof AirtableError ? `${err.status} ${err.code}`.trim() : 'error';
    const attempts = (sub.airtable_sync_attempts ?? 0) + 1;
    await patch(sub.id, { airtable_sync_status: 'ERROR', airtable_sync_error: code.slice(0, 80), airtable_sync_attempts: attempts, airtable_next_attempt_at: backoff(attempts) });
    log('airtable', err);
    return 'error';
  }
}

// ---------------------------------------------------------------------------------------
// Reconciliation (cron / manual): retries, missed webhooks, missing welcome, Airtable.
// ---------------------------------------------------------------------------------------
export type ReconcileReport = Record<'doiSent' | 'doiFailed' | 'confirmed' | 'welcomeSent' | 'unsubscribedFromBrevo' | 'airtableSynced' | 'airtableErrors', number>;

async function queue(build: (q: any) => any, limit: number): Promise<Sub[]> {
  const { data, error } = await build(sb().from(T_SUBS).select('*')).limit(limit);
  if (error) throw new DbError(T_SUBS, error.code);
  return (data as Sub[]) ?? [];
}

export async function reconcile(limit = 25): Promise<ReconcileReport> {
  const r: ReconcileReport = { doiSent: 0, doiFailed: 0, confirmed: 0, welcomeSent: 0, unsubscribedFromBrevo: 0, airtableSynced: 0, airtableErrors: 0 };
  const cfg = brevoConfig();
  const at = now();
  if (cfg && tokenSecret()) {
    // 1. Double opt-in not (yet) requested, or failed and due for a retry.
    const due = (await queue((q) => q.in('subscription_status', ['PENDING', 'UNSUBSCRIBED']).in('brevo_sync_status', ['PENDING', 'ERROR']).not('doi_cycle_id', 'is', null), limit)).filter(
      (s) => !s.doi_requested_at && (!s.brevo_next_attempt_at || s.brevo_next_attempt_at <= at) && (s.brevo_sync_attempts ?? 0) < 8,
    );
    for (const s of due) (await startDoubleOptIn(s)) ? r.doiSent++ : r.doiFailed++;
    // 2. Clicked but Brevo membership not visible yet at click time.
    for (const s of await queue((q) => q.not('doi_clicked_at', 'is', null).eq('double_opt_in_confirmed', false), limit)) if (await finalizeIfMember(s, s.doi_cycle_id!)) r.confirmed++;
    // 3. Confirmed without welcome (template configured later, or a failed send).
    for (const s of await queue((q) => q.eq('subscription_status', 'SUBSCRIBED').is('welcome_claimed_at', null), limit)) if ((await sendWelcome(s).catch(() => 'skipped')) === 'sent') r.welcomeSent++;
    // 4. Missed unsubscribe webhook: Brevo is the reference for list membership.
    for (const s of await queue((q) => q.eq('subscription_status', 'SUBSCRIBED').order('brevo_synced_at', { ascending: true }), limit)) {
      const c = await getContact(cfg, s.email).catch(() => undefined);
      if (c === undefined) continue;
      if (c && isActiveMember(cfg, c)) {
        await patch(s.id, { brevo_synced_at: now() });
        continue;
      }
      if (c && (c.emailBlacklisted || c.listUnsubscribed.includes(cfg.listId))) {
        const ok = await event({ subscriber_id: s.id, event_type: 'UNSUBSCRIBED', previous_status: 'SUBSCRIBED', new_status: 'UNSUBSCRIBED', channel: 'BREVO', details: { via: 'reconciliation', blacklisted: c.emailBlacklisted } });
        if (ok) {
          await markUnsubscribed(s, now(), 'BREVO', null);
          r.unsubscribedFromBrevo++;
        }
      }
    }
  }
  // 5. Airtable sync pending / due for a retry.
  for (const s of (await queue((q) => q.in('airtable_sync_status', ['PENDING', 'ERROR']).in('subscription_status', ['SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED']), limit)).filter(
    (s) => !s.airtable_next_attempt_at || s.airtable_next_attempt_at <= at,
  )) {
    const res = await syncAirtable(s);
    if (res === 'synced') r.airtableSynced++;
    if (res === 'error') r.airtableErrors++;
  }
  return r;
}
