-- =============================================================================
-- Italian Rainforest — cleanup of the FICTITIOUS records of the authorised QA run
-- (2026-11-26, TEST_IRF_QA, test-irf-qa+…@example.com). 14 records:
--   download_registrations 7 · sharing_is_caring_registrations 4 ·
--   database_update_requests 1 · newsletter_subscribers 2
-- Double safety condition on every DELETE: exact id AND test email address.
-- One transaction. It STOPS (nothing deleted) if the counts are not exactly the
-- expected ones, or if any test-address row is not in the id lists (a new test record:
-- add its id first). No TRUNCATE. Real data cannot match both conditions.
-- Run once in Supabase → SQL Editor (project qwdajoztlpisrzieziup).
-- =============================================================================
begin;

do $$
declare
  dl_ids  uuid[] := array['b387aaac-fc5a-4c1b-b230-847b0e33924e','92c88ea9-5386-4caa-9709-2ab6e6aab165','173db599-4b29-43e4-9945-5f6916c16404','c82f6617-6093-4910-b7ce-67d70b39ef7f','54a62714-f894-46c0-8226-1e069aa7200b','49ad728e-469b-49b8-976b-eab874c898a0','cd74c19d-c4bf-4981-8d01-d12756d57980']::uuid[];
  sic_ids uuid[] := array['a2f7d2bd-692e-4cde-8ff5-17f096c5c836','c58f5ad9-97cf-4c6b-9101-d9631db7ea4c','1910945b-716d-40a1-a2db-67bb6a96689d','514615f9-036a-46e7-a93a-5896a5d5d5f0']::uuid[];
  upd_ids bigint[] := array[1]::bigint[];
  nl_ids  uuid[] := array['faafaad6-9e3a-424c-8869-d0287231ebb1','e0afb4f7-5b3e-4022-aee3-e8cf1ccba2c5']::uuid[];
  pattern constant text := 'test-irf-qa+%@example.com';
  n int;
begin
  -- 1. Preventive check: exactly the expected records match both conditions…
  select count(*) into n from public.download_registrations where id = any(dl_ids) and email like pattern;
  if n <> 7 then raise exception 'download_registrations: % matching records, 7 expected — nothing deleted', n; end if;
  select count(*) into n from public.sharing_is_caring_registrations where id = any(sic_ids) and email like pattern;
  if n <> 4 then raise exception 'sharing_is_caring_registrations: % matching records, 4 expected — nothing deleted', n; end if;
  select count(*) into n from public.database_update_requests where id = any(upd_ids) and email like pattern;
  if n <> 1 then raise exception 'database_update_requests: % matching records, 1 expected — nothing deleted', n; end if;
  select count(*) into n from public.newsletter_subscribers where id = any(nl_ids) and email like pattern;
  if n <> 2 then raise exception 'newsletter_subscribers: % matching records, 2 expected — nothing deleted', n; end if;

  -- …and no other test-address record exists outside the lists (it would be left behind).
  select (select count(*) from public.download_registrations where email like pattern and not id = any(dl_ids))
       + (select count(*) from public.sharing_is_caring_registrations where email like pattern and not id = any(sic_ids))
       + (select count(*) from public.database_update_requests where email like pattern and not id = any(upd_ids))
       + (select count(*) from public.newsletter_subscribers where email like pattern and not id = any(nl_ids)) into n;
  if n <> 0 then raise exception '% test-address record(s) not in the id lists: add their ids first — nothing deleted', n; end if;

  -- 2. Delete: exact id AND test address.
  delete from public.download_registrations where id = any(dl_ids) and email like pattern;
  delete from public.sharing_is_caring_registrations where id = any(sic_ids) and email like pattern;
  delete from public.database_update_requests where id = any(upd_ids) and email like pattern;
  delete from public.newsletter_subscribers where id = any(nl_ids) and email like pattern;

  -- 3. Verify: no test-address record is left.
  select (select count(*) from public.download_registrations where email like pattern)
       + (select count(*) from public.sharing_is_caring_registrations where email like pattern)
       + (select count(*) from public.database_update_requests where email like pattern)
       + (select count(*) from public.newsletter_subscribers where email like pattern) into n;
  if n <> 0 then raise exception 'cleanup incomplete (% left) — rolled back', n; end if;
  raise notice 'QA cleanup: 14 test records deleted (7 + 4 + 1 + 2).';
end $$;

commit;
