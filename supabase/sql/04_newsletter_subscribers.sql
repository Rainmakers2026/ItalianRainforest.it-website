-- =============================================================================
-- Italian Rainforest — 04 · newsletter_subscribers (kept as it is)
-- Fed only by the explicit, optional newsletter checkbox of the sign-up and
-- "Suggest an update" forms. No structural change: this script only confirms the
-- permissions the site server needs (insert a new subscriber; on an existing email,
-- read its status and refresh the consent of PENDING / SUBSCRIBED contacts only —
-- UNSUBSCRIBED and BLOCKED contacts are never touched, never reactivated).
--
-- Run once in Supabase → SQL Editor (project qwdajoztlpisrzieziup). Idempotent.
-- =============================================================================
begin;

alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from anon, authenticated;
grant select, insert, update on table public.newsletter_subscribers to service_role;

commit;
