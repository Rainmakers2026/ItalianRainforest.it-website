-- =============================================================================
-- Italian Rainforest — 06 · RAINFOREST RADAR (newsletter)
-- ADDITIVE and non-destructive: new nullable / defaulted columns on
-- public.newsletter_subscribers, one new append-only history table, indexes, grants.
-- No column is dropped or renamed; no row is deleted. Existing rows keep their values
-- (only newsletter_name moves from 'ITALIAN RAINFOREST' to 'RAINFOREST RADAR', the one
-- newsletter every form subscribes to).
--
-- Run once in Supabase → SQL Editor (project qwdajoztlpisrzieziup), after 01–05.
-- The site keeps working without it, but the RAINFOREST RADAR flows need it.
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. newsletter_subscribers: one row per normalised email (unique index exists)
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers
  -- privacy notice acknowledgment (separate from the newsletter consent)
  add column if not exists privacy_acknowledged boolean not null default false,
  add column if not exists privacy_acknowledged_at timestamptz,
  -- first-touch provenance of the subscription (every later consent is in the history table)
  add column if not exists page_path text,
  add column if not exists page_section text,
  add column if not exists cta text,
  add column if not exists utm jsonb,
  -- double opt-in cycle: a new cycle id for every new or voluntary re-subscription
  add column if not exists doi_cycle_id uuid,
  add column if not exists doi_requested_at timestamptz,
  add column if not exists doi_clicked_at timestamptz,
  -- welcome email: claimed once per confirmed cycle (reset when a new cycle starts)
  add column if not exists welcome_claimed_at timestamptz,
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists welcome_message_id text,
  -- consolidated status transitions (out-of-order events older than this are ignored)
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists unsubscribe_channel text,
  add column if not exists unsubscribe_reason text,
  -- Brevo retry scheduling (brevo_sync_* already exist)
  add column if not exists brevo_next_attempt_at timestamptz,
  -- Airtable sync: the two tables have distinct record ids
  add column if not exists airtable_subscriber_record_id text,
  add column if not exists airtable_unsubscriber_record_id text,
  add column if not exists airtable_sync_status text not null default 'PENDING',
  add column if not exists airtable_synced_at timestamptz,
  add column if not exists airtable_sync_error text,
  add column if not exists airtable_sync_attempts integer not null default 0,
  add column if not exists airtable_next_attempt_at timestamptz;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_unsubscribe_channel_check check (unsubscribe_channel is null or unsubscribe_channel in ('BREVO', 'WEBSITE', 'MANUAL')),
  add constraint newsletter_subscribers_airtable_sync_status_check check (airtable_sync_status in ('PENDING', 'SYNCED', 'ERROR', 'SKIPPED')),
  add constraint newsletter_subscribers_origin_check check ((page_path is null or length(page_path) <= 200) and (page_section is null or length(page_section) <= 60) and (cta is null or length(cta) <= 60));

-- One newsletter: RAINFOREST RADAR (every form subscribes to the same list).
alter table public.newsletter_subscribers alter column newsletter_name set default 'RAINFOREST RADAR';
update public.newsletter_subscribers set newsletter_name = 'RAINFOREST RADAR' where newsletter_name = 'ITALIAN RAINFOREST';
alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_newsletter_name_check check (newsletter_name = 'RAINFOREST RADAR');

create index if not exists newsletter_subscribers_brevo_queue_idx on public.newsletter_subscribers (subscription_status, brevo_sync_status, brevo_next_attempt_at);
create index if not exists newsletter_subscribers_airtable_queue_idx on public.newsletter_subscribers (airtable_sync_status, airtable_next_attempt_at);
create index if not exists newsletter_subscribers_doi_cycle_idx on public.newsletter_subscribers (doi_cycle_id);

-- ---------------------------------------------------------------------------
-- 2. newsletter_consent_events: append-only proof of consent and state history
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_consent_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- when the fact happened (e.g. the Brevo event time); defaults to the insert time
  occurred_at timestamptz not null default now(),
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  -- consent proof (CONSENT_GIVEN / RESUBSCRIBE_REQUESTED)
  source_form text,
  locale text,
  newsletter_consent boolean,
  consent_text text,
  newsletter_consent_version text,
  privacy_acknowledged boolean,
  privacy_notice_version text,
  page_path text,
  page_section text,
  cta text,
  utm jsonb,
  -- revocation (UNSUBSCRIBED)
  channel text,
  reason text,
  -- idempotency: browser request id (forms) / provider event id (webhooks)
  request_id uuid unique,
  external_event_id text unique,
  -- technical details only, never personal data
  details jsonb,

  constraint newsletter_consent_events_type_check check (event_type in (
    'CONSENT_GIVEN', 'RESUBSCRIBE_REQUESTED', 'DOI_REQUESTED', 'DOI_REQUEST_FAILED', 'DOI_CLICKED',
    'DOI_CONFIRMED', 'WELCOME_SENT', 'WELCOME_FAILED', 'UNSUBSCRIBED', 'EVENT_IGNORED', 'BLOCKED_ATTEMPT')),
  constraint newsletter_consent_events_status_check check (
    (previous_status is null or previous_status in ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED')) and
    (new_status is null or new_status in ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'BLOCKED'))),
  constraint newsletter_consent_events_source_form_check check (source_form is null or source_form in ('NEWSLETTER_SIGNUP', 'DOWNLOAD_REGISTRATION', 'EMBED_REQUEST', 'DATABASE_UPDATE_REQUEST')),
  constraint newsletter_consent_events_locale_check check (locale is null or locale in ('it', 'en')),
  constraint newsletter_consent_events_channel_check check (channel is null or channel in ('BREVO', 'WEBSITE', 'MANUAL')),
  constraint newsletter_consent_events_origin_check check ((page_path is null or length(page_path) <= 200) and (page_section is null or length(page_section) <= 60) and (cta is null or length(cta) <= 60))
);

create index if not exists newsletter_consent_events_subscriber_idx on public.newsletter_consent_events (subscriber_id, occurred_at);

-- ---------------------------------------------------------------------------
-- 3. Security: RLS on, no policy; only the server role (secret key) reads/writes.
--    The history is append-only for the server: no UPDATE / DELETE grant.
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from anon, authenticated;
grant select, insert, update on table public.newsletter_subscribers to service_role;

alter table public.newsletter_consent_events enable row level security;
revoke all on table public.newsletter_consent_events from anon, authenticated;
grant select, insert on table public.newsletter_consent_events to service_role;

commit;
