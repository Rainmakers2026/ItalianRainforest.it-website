-- =============================================================================
-- Italian Rainforest — 07 · Airtable sync of the user requests (IRF - USERS REQUESTS)
-- ADDITIVE and non-destructive. Run once in Supabase → SQL Editor, after 06.
--
-- Synced to Airtable: the initial REGISTRATIONS (download / embed) and every database
-- update request. Not synced (SKIPPED): later EVENT rows (analytics stay in Supabase) and
-- the fictitious QA records (test-irf-qa+…@example.com), which must never reach Airtable.
-- No column is dropped, renamed or duplicated; no row is deleted.
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. download_registrations / sharing_is_caring_registrations: they already have
--    airtable_record_id (unique), airtable_sync_status, airtable_synced_at,
--    airtable_sync_error. Added: attempts, next attempt, and the SKIPPED status.
-- ---------------------------------------------------------------------------
alter table public.download_registrations
  add column if not exists airtable_sync_attempts integer not null default 0,
  add column if not exists airtable_next_attempt_at timestamptz;
alter table public.download_registrations drop constraint if exists download_registrations_airtable_sync_status_check;
alter table public.download_registrations
  add constraint download_registrations_airtable_sync_status_check check (airtable_sync_status in ('PENDING', 'SYNCED', 'ERROR', 'SKIPPED'));

alter table public.sharing_is_caring_registrations
  add column if not exists airtable_sync_attempts integer not null default 0,
  add column if not exists airtable_next_attempt_at timestamptz;
alter table public.sharing_is_caring_registrations drop constraint if exists sharing_is_caring_registrations_airtable_sync_status_check;
alter table public.sharing_is_caring_registrations
  add constraint sharing_is_caring_registrations_airtable_sync_status_check check (airtable_sync_status in ('PENDING', 'SYNCED', 'ERROR', 'SKIPPED'));

-- ---------------------------------------------------------------------------
-- 2. database_update_requests: no Airtable column yet.
-- ---------------------------------------------------------------------------
alter table public.database_update_requests
  add column if not exists airtable_record_id text,
  add column if not exists airtable_sync_status text not null default 'PENDING',
  add column if not exists airtable_synced_at timestamptz,
  add column if not exists airtable_sync_error text,
  add column if not exists airtable_sync_attempts integer not null default 0,
  add column if not exists airtable_next_attempt_at timestamptz;
alter table public.database_update_requests
  add constraint database_update_requests_airtable_record_id_key unique (airtable_record_id),
  add constraint database_update_requests_airtable_sync_status_check check (airtable_sync_status in ('PENDING', 'SYNCED', 'ERROR', 'SKIPPED'));

-- ---------------------------------------------------------------------------
-- 3. What is never synced: later events, and the QA test records.
-- ---------------------------------------------------------------------------
update public.download_registrations set airtable_sync_status = 'SKIPPED' where entry_type = 'EVENT' and airtable_sync_status = 'PENDING';
update public.sharing_is_caring_registrations set airtable_sync_status = 'SKIPPED' where entry_type = 'EVENT' and airtable_sync_status = 'PENDING';
update public.download_registrations set airtable_sync_status = 'SKIPPED', airtable_sync_error = 'qa test record' where email like 'test-irf-qa+%@example.com';
update public.sharing_is_caring_registrations set airtable_sync_status = 'SKIPPED', airtable_sync_error = 'qa test record' where email like 'test-irf-qa+%@example.com';
update public.database_update_requests set airtable_sync_status = 'SKIPPED', airtable_sync_error = 'qa test record' where email like 'test-irf-qa+%@example.com';

create index if not exists download_registrations_airtable_queue_idx on public.download_registrations (airtable_sync_status, airtable_next_attempt_at);
create index if not exists sharing_is_caring_registrations_airtable_queue_idx on public.sharing_is_caring_registrations (airtable_sync_status, airtable_next_attempt_at);
create index if not exists database_update_requests_airtable_queue_idx on public.database_update_requests (airtable_sync_status, airtable_next_attempt_at);

-- ---------------------------------------------------------------------------
-- 4. The server must record the sync state of the update requests (UPDATE grant).
--    RLS stays on, no policy, no access for anon / authenticated.
-- ---------------------------------------------------------------------------
alter table public.database_update_requests enable row level security;
revoke all on table public.database_update_requests from anon, authenticated;
grant select, insert, update on table public.database_update_requests to service_role;

commit;
