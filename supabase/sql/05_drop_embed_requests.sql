-- =============================================================================
-- Italian Rainforest — 05 · drop embed_requests (replaced by sharing_is_caring_registrations)
--
-- Verified on 2026-11-26 through MCP (read-only): 0 rows; no foreign key in or out,
-- no view, trigger, policy, publication or function referencing it.
-- The script re-checks both conditions and stops if either is false. No CASCADE:
-- Postgres refuses the drop if anything still depends on the table.
--
-- Run once in Supabase → SQL Editor (project qwdajoztlpisrzieziup), after 01–04.
-- =============================================================================
begin;

do $$
begin
  if exists (select 1 from public.embed_requests) then
    raise exception 'embed_requests is not empty: stop and migrate its rows first';
  end if;
  if exists (select 1 from pg_constraint where confrelid = 'public.embed_requests'::regclass) then
    raise exception 'embed_requests is referenced by a foreign key: stop';
  end if;
end $$;

drop table public.embed_requests;

commit;
