# Production release plan — italianrainforest.it

**Not executed.** Every step below needs the owner's explicit approval. Preview first, always.

## 0. Preconditions (all on Preview, verified)

- Migrations 06 and 07 applied (MCP read-only check: columns, constraints, RLS, grants).
- QA test records deleted (`supabase/sql/maintenance/cleanup_qa_test_records_2026-11-26.sql`).
- Brevo: RADAR list (separate from GOCCE), double opt-in template, IT / EN welcome templates,
  sender italianrainforest@rainmakers.it authenticated, attributes, marketing webhook (bearer).
- **GOCCE isolation verified** with a test contact subscribed to both lists: RADAR unsubscribe
  leaves GOCCE subscribed; a RADAR re-subscription does not clear a GOCCE unsubscription / block.
- Airtable: `npm run airtable:schema-check` → 0 fields to fix (three tables).
- Authorised real end-to-end test on Preview passed (download / embed / update → Airtable,
  newsletter IT / EN, DOI, welcome IT / EN, unsubscribe, re-subscribe, reconciliation).
- Privacy notice legally approved; final `PRIVACY_POLICY_VERSION` and
  `NEWSLETTER_CONSENT_VERSION` (draft-2026-11 is NOT approved for Production).
- Vercel deploy from GitHub restored, with Production deploys from `main` only after approval.
- The custom domain `italianrainforest.it` is not attached to the Vercel project yet (only
  `italian-rainforest-it-website.vercel.app`): domain / DNS work is a separate, approved step.

## 1. Backup

- Supabase: export of the four tables (+ `newsletter_consent_events`) before the release
  (Dashboard → Database → Backups, or a CSV export per table).
- Airtable: CSV export of the three tables.
- Git: the release commit tagged (`release-YYYY-MM-DD`).

## 2. Environment variables (Production target, set only at release time)

SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secret key), PRIVACY_POLICY_VERSION,
NEWSLETTER_CONSENT_VERSION, NEWSLETTER_TOKEN_SECRET, NEWSLETTER_CRON_SECRET **and** CRON_SECRET
(same value: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`), NEWSLETTER_PUBLIC_URL =
https://italianrainforest.it, BREVO_API_KEY, BREVO_LIST_ID, BREVO_DOI_TEMPLATE_ID,
BREVO_WELCOME_TEMPLATE_ID_IT / _EN, BREVO_CONTACT_ATTRIBUTES, BREVO_WEBHOOK_SECRET,
AIRTABLE_SYNC_PAT, AIRTABLE_SYNC_BASE_ID, AIRTABLE_USER_REQUESTS_TABLE_ID,
AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID, AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID.
Production secrets are NEW values (not the Preview ones).

## 3. Webhook and cron

- A second Brevo marketing webhook (event `unsubscribed`) to
  `https://italianrainforest.it/api/newsletter/brevo-webhook` with the Production bearer token.
- `vercel.json` cron for `/api/newsletter/reconcile` (Hobby plan: at most once a day; a higher
  frequency needs Pro or an external scheduler).

## 4. Release

1. Merge `preview/italianrainforest` → `main` (PR, review; no force-push).
2. Production deploy from `main`; verify the deployment sha = the merge commit.
3. Smoke test: `/it`, `/en`, embeds, `/api/players`, downloads with a test sign-up (fictitious
   data, deleted afterwards), RADAR form → DOI email received, reconciliation 200.

## 5. Monitoring

- Vercel runtime logs: `[newsletter:*]`, `[airtable:user-requests]`, `[signup]`, `[suggest]`,
  `[download]` (codes only, no personal data).
- Supabase: rows with `brevo_sync_status = ERROR`, `airtable_sync_status = ERROR`,
  `WELCOME_FAILED` events with `ambiguous: true` (manual check in Brevo).
- Supabase security advisors after the release.

## 6. Rollback

- Vercel: promote the previous Production deployment (instant, no rebuild).
- Brevo: disable the Production webhook if needed; the site keeps storing in Supabase.
- Database: migrations 06 / 07 are additive — no schema rollback needed; data stays.
