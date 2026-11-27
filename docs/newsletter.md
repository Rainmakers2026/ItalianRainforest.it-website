# RAINFOREST RADAR — newsletter integration

Website → Supabase → Brevo → Airtable. Supabase is the single source of truth (identity,
consents, provenance, status, history, sync state). Brevo runs the double opt-in, the
welcome email, the campaigns and the unsubscriptions. Airtable gets a one-way copy for
consultation. Nothing is ever read back from Airtable into Supabase.

> Status (2026-11-26): code, migration and tests are ready; the integration is **not
> active**. Missing: migration 06 applied, Brevo and Airtable credentials / ids, the Brevo
> list-level unsubscription check (see "Blocking check: GOCCE isolation").

## 1. Entry points

| Entry point | Form | `source_form` | Newsletter consent |
|---|---|---|---|
| `#newsletter` section (IT / EN home) | `NewsletterForm` → `POST /api/newsletter` | `NEWSLETTER_SIGNUP` | **mandatory** (+ mandatory privacy acknowledgment) |
| Download database / map (sign-up gate) | `LeadGate` → `POST /api/signup` | `DOWNLOAD_REGISTRATION` | optional box |
| Sharing is caring — map / database embed | `LeadGate` → `POST /api/signup` | `EMBED_REQUEST` | optional box |
| Database update request | `UpdateForm` → `POST /api/suggest` | `DATABASE_UPDATE_REQUEST` | optional box |

The optional box never blocks the download, the embed code or the request. Later
downloads / embed copies (EVENT rows) never create or change a subscription.

## 2. Lifecycle

```
form ──► Supabase newsletter_subscribers: PENDING (+ CONSENT_GIVEN in the history)
     ──► Brevo POST /v3/contacts/doubleOptinConfirmation (RADAR list only) ── DOI_REQUESTED
          redirectionUrl = /api/newsletter/confirm?l=<it|en>&t=<HMAC(subscriber, cycle, expiry)>
click ──► Brevo adds the contact to the list and redirects to the signed link ── DOI_CLICKED
     ──► server checks GET /v3/contacts/{email}: in the RADAR list, not blocklisted
     ──► SUBSCRIBED, double_opt_in_confirmed ── DOI_CONFIRMED
     ──► welcome email (POST /v3/smtp/email, IT / EN template) once per cycle ── WELCOME_SENT
     ──► Airtable ISCRITTI ALLA NEWSLETTER (upsert on SUPABASE ID)
Brevo "unsubscribe" webhook (bearer token) ──► UNSUBSCRIBED (channel BREVO) ── UNSUBSCRIBED
     ──► Airtable DISISCRITTI DALLA NEWSLETTER (upsert, verified) ──► removed from ISCRITTI
```

Why a signed link: the Brevo docs do not state that a double opt-in confirmation fires the
`listAddition` webhook, nor when the contact joins the list. The signed `redirectionUrl`
(documented, per request) plus the documented contact API give a verifiable confirmation.
If the contact is not visible in the list at click time, the subscription stays PENDING and
the reconciliation confirms it later (it never confirms without a click on that cycle).

### Rules (deduplication, re-subscription)

- One row per normalised email (unique `lower(trim(email))`); Airtable key = `SUPABASE ID`.
- New contact → PENDING. Only a verified confirmation → SUBSCRIBED.
- A known PENDING address: same answer, no second email within 2 minutes.
- A SUBSCRIBED address submitting again: same answer, no email, no welcome; the new consent
  is recorded in the history, the original one is never overwritten.
- UNSUBSCRIBED + a new explicit consent (dedicated form or optional box) = voluntary
  re-subscription REQUEST: a new double opt-in cycle, the status stays UNSUBSCRIBED until
  the new confirmation; old links stop working. After the confirmation: ISCRITTI upsert,
  then removal from DISISCRITTI, new welcome (new cycle).
- BLOCKED: never reactivated; same answer, no email (BLOCKED_ATTEMPT in the history).
- The answer never reveals whether an address is known. Trade-off to confirm: for an
  already subscribed or blocked address "check your inbox" is shown although no email is
  sent (alternative: a neutral message for everyone, which reveals nothing either).
- A manual edit in Airtable can never reactivate a contact (one-way sync).

### Idempotency, retries, ordering

- Form submissions: browser `requestId` → `newsletter_consent_events.request_id` (unique).
- Webhook events: `external_event_id` (unique) — duplicates are ignored.
- Out of order: an event older than `status_changed_at` is recorded as `EVENT_IGNORED`.
- Welcome: atomic claim on `welcome_claimed_at` (reset only when a new cycle starts).
- Brevo / Airtable failures: `*_sync_status = ERROR`, error code, attempts, next attempt
  (5, 20, 80 min … 24 h). Short in-request retries on 429 / 5xx.
- Logs: service + table + HTTP / error code only — never an email, a name or a key.

## 3. Supabase

Migration `supabase/sql/06_rainforest_radar.sql` (additive, not applied automatically).

`newsletter_subscribers` — existing columns kept; added: `privacy_acknowledged`,
`privacy_acknowledged_at`, `page_path`, `page_section`, `cta`, `utm` (first-touch
provenance), `doi_cycle_id`, `doi_requested_at`, `doi_clicked_at`, `welcome_claimed_at`,
`welcome_sent_at`, `welcome_message_id`, `status_changed_at`, `unsubscribe_channel`
(BREVO / WEBSITE / MANUAL), `unsubscribe_reason`, `brevo_next_attempt_at`,
`airtable_subscriber_record_id`, `airtable_unsubscriber_record_id`, `airtable_sync_status`,
`airtable_synced_at`, `airtable_sync_error`, `airtable_sync_attempts`,
`airtable_next_attempt_at`. `newsletter_name` → `RAINFOREST RADAR` (one newsletter).

`newsletter_consent_events` (new, append-only): every consent (text shown, versions,
privacy acknowledgment, provenance, UTM), every double opt-in step, welcome, revocation
(channel, reason), ignored / stale events. RLS on, no policy, `service_role` SELECT + INSERT
only. Erasure of a person: deleting the subscriber row cascades to its history.

New form values: `source = ITALIAN RAINFOREST WEBSITE`, `source_form = NEWSLETTER_SIGNUP`,
`locale` it / en, `newsletter_consent = true`, `newsletter_consent_at` server time,
`subscription_status = PENDING`, `double_opt_in_confirmed = false`, `brevo_sync_status =
PENDING`.

## 4. Brevo

Variables: `BREVO_API_KEY`, `BREVO_LIST_ID`, `BREVO_DOI_TEMPLATE_ID`,
`BREVO_WELCOME_TEMPLATE_ID_IT`, `BREVO_WELCOME_TEMPLATE_ID_EN`, `BREVO_WEBHOOK_SECRET`,
`BREVO_CONTACT_ATTRIBUTES` (attributes that exist in the account: FIRSTNAME and LASTNAME are
standard; LANGUAGE, SUPABASE_ID, SOURCE, SOURCE_FORM must be created in Brevo first).

Setup (Brevo UI, by the owner):
1. Use the existing Italian Rainforest list if it is the right one; otherwise create one
   RADAR list. Never reuse a GOCCE list, template, sender or automation.
2. Double opt-in template: a "double opt-in" template whose confirmation button links to
   `{{ params.DOIurl }}`.
3. Welcome templates IT / EN: adapt the existing Italian welcome (do not replace it
   without approval) with the PRD copy; `{{ contact.FIRSTNAME | default : "…" }}` as the
   first-name fallback; unsubscribe link, privacy reference and sender details required.
4. Marketing webhook: event `unsubscribed`, URL `https://<site>/api/newsletter/brevo-webhook`,
   `auth: { type: "bearer", token: <BREVO_WEBHOOK_SECRET> }`.

### Blocking check: GOCCE isolation

The Brevo developer docs reached do not state whether the default campaign unsubscribe link
blocklists the contact for the whole account (`emailBlacklisted`) or only removes them from
the list (`listUnsubscribed`). If it blocklists account-wide, a RADAR unsubscription would
also stop GOCCE (same Brevo account). **Do not activate the integration until this is
verified** in the Brevo account (unsubscription page / list-level unsubscription settings,
or a test contact). The code handles both: a list unsubscription of the RADAR list, or an
account-level blocklist, both mean UNSUBSCRIBED for RADAR; a removal from another list is
ignored.

## 5. Airtable

Base "IRF push da Supabase" (verify the current name; use the `app…` id), separate from the
read-only Rainmakers OS data base. Variables: `AIRTABLE_SYNC_PAT`, `AIRTABLE_SYNC_BASE_ID`,
`AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID` → ISCRITTI ALLA NEWSLETTER,
`AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID` → DISISCRITTI DALLA NEWSLETTER,
`AIRTABLE_USER_REQUESTS_TABLE_ID` → IRF - USERS REQUESTS (§5b).
The PRD's `AIRTABLE_PAT` / `AIRTABLE_BASE_ID` names are NOT used: `AIRTABLE_BASE_ID` is
already the read-only master base.

Sync rules: ISCRITTI only when SUBSCRIBED + double opt-in + consent; upsert on
`SUPABASE ID`, `typecast: false` (a wrong type fails, never converted); booleans as booleans,
dates as ISO 8601 UTC, `BREVO CONTACT ID` as a string, null → empty (never invented).
DISISCRITTI: upsert, verify the returned record, then delete from ISCRITTI.

| ISCRITTI ALLA NEWSLETTER | Supabase | Type |
|---|---|---|
| SUPABASE ID (primary) | id | Single line text |
| FIRST NAME / LAST NAME | first_name / last_name | Single line text |
| EMAIL | email | Email |
| REGISTRATION DATE | created_at | Date + time |
| SOURCE | source | Single line text |
| SOURCE FORM | source_form | Single select (4 options) |
| LANGUAGE | locale | Single select (it, en) |
| NEWSLETTER CONSENT | newsletter_consent | Checkbox |
| CONSENT DATE | newsletter_consent_at | Date + time |
| CONSENT VERSION | newsletter_consent_version | Single line text |
| PRIVACY VERSION | privacy_notice_version | Single line text |
| DOUBLE OPT-IN | double_opt_in_confirmed | Checkbox |
| DOUBLE OPT-IN CONFIRMATION DATE | double_opt_in_confirmed_at | Date + time |
| STATUS | subscription_status | Single select (4 options) |
| BREVO CONTACT ID | brevo_contact_id (string) | Single line text |
| LAST BREVO SYNC | brevo_synced_at | Date + time |

DISISCRITTI DALLA NEWSLETTER: same identity fields + ORIGINAL CONSENT DATE (first
CONSENT_GIVEN in the history), CONSENT VERSION, PRIVACY VERSION, UNSUBSCRIBE DATE
(`unsubscribed_at`), UNSUBSCRIBE CHANNEL (BREVO / WEBSITE / MANUAL), UNSUBSCRIBE REASON
(long text, empty when unknown), STATUS (UNSUBSCRIBED), BREVO CONTACT ID, LAST BREVO SYNC.

### Field types

`npm run airtable:schema-check` (PAT with `schema.bases:read`) prints, per field: id,
current type, expected type, action. The Web API **cannot change a field type** (Update
field changes name / description only), so type fixes are manual, in the Airtable UI, for
each field: column header → Edit field → field type → (Date: "Include time", European
D/M/YYYY, 24 hour, time zone Europe/Rome; Single select: add the exact options) → Save.
Converting text to a date / checkbox / select converts the existing cell values; check
them afterwards. Never delete and recreate fields, never rename, never add duplicates.

## 5b. Airtable — IRF - USERS REQUESTS (operational requests)

Migration `supabase/sql/07_airtable_user_requests_sync.sql` (additive). Module
`src/lib/supabase/user-requests-sync.ts`. Same base and PAT (`AIRTABLE_SYNC_*`), table
`AIRTABLE_USER_REQUESTS_TABLE_ID`. Separate from the newsletter: a RADAR-only sign-up never
creates a user request.

| Supabase source | Synced rows | SOURCE |
|---|---|---|
| `download_registrations` | REGISTRATION only (the sign-up) | `MAP DOWNLOAD` (started in the map section) / `DATABASE DOWNLOAD` |
| `sharing_is_caring_registrations` | REGISTRATION only | `EMBED MAP` / `EMBED DATABASE` |
| `database_update_requests` | every request | `DATABASE UPDATE REQUEST` |

Later EVENT rows (each download, map file, embed copy) are analytics: `airtable_sync_status =
SKIPPED` at insert, never synced. The QA test records are marked SKIPPED by migration 07.

Fields written: SUPABASE ID (`<table>:<id>`, unique across the three tables), REQUEST DATE,
SOURCE, REQUEST TYPE (DATABASE UPDATE ONLY) — NEW / CORRECTION / OTHER, update requests only —,
FIRST NAME, LAST NAME, EMAIL, ORGANIZATION CONCERNED, WEBSITE, UPDATE DETAILS (update requests
only), PRIVACY ACKNOWLEDGMENT, NEWSLETTER CONSENT. **Never written**: REVIEW STATUS, STATUS,
INTERNAL NOTES (operative, edited by the team: the PATCH upsert leaves them untouched; they are
not initialised either, so no value is invented). Missing data (e.g. no name on an update
request) stays empty.

Mechanism: right after the record is stored in Supabase the route syncs it (best effort,
never blocking the visitor); a row is SYNCED only when Airtable returned the record
(`airtable_record_id`). Failures → ERROR, `airtable_sync_attempts`, `airtable_next_attempt_at`
(5, 20, 80 min … 24 h, max 10 attempts); the reconciliation retries due rows. Supabase stays the
source when Airtable is down. Airtable allows 5 requests / second per base: one request per
submission, the reconciliation processes at most 25 rows per table per run.

## 5c. Brevo responses lost (at most once)

POSTs to Brevo (double opt-in, welcome) are retried in-request only after a 429 (refused for
sure). No answer / 5xx = possibly processed: the welcome stays claimed and is NOT resent
automatically (WELCOME_FAILED with `ambiguous: true` — check in Brevo's transactional logs and
release `welcome_claimed_at` by hand only if it was not delivered). A refused welcome (4xx) is
retried by the reconciliation. A lost double opt-in answer → retried by the reconciliation: at
worst the visitor receives a second confirmation email for the same cycle (same valid link).

## 5d. Setup commands

- `npm run integrations:discover` — read-only: Brevo lists, senders (checks
  italianrainforest@rainmakers.it), templates (sender, reply-to, `{{ params.DOIurl }}`),
  attributes, webhooks; Airtable tables, their ids by exact name, field-type check of the three
  tables. `-- --apply` writes the MISSING Airtable table ids to `.env.local` (never overwrites).
- `npm run airtable:schema-check` — the field table of the three tables (exit 1 if fixes needed).
- Sync base: **`appUNDILcUVMhC31V`** ("IRF push da Supabase"), already in `.env.local` and Vercel
  Preview as `AIRTABLE_SYNC_BASE_ID`.

## 6. Reconciliation and error handling

`GET|POST /api/newsletter/reconcile` with `Authorization: Bearer <NEWSLETTER_CRON_SECRET>`:
1. double opt-in not requested / failed and due → request it;
2. clicked links whose Brevo membership appeared later → confirm;
3. confirmed without welcome → send it (once);
4. SUBSCRIBED contacts no longer active in the Brevo list (missed webhook) → UNSUBSCRIBED;
5. Airtable PENDING / ERROR and due → sync (newsletter tables);
6. IRF - USERS REQUESTS: PENDING / ERROR registrations and update requests, due → sync.
Returns counts only. Manual run on Preview (no Vercel Cron there):
`curl -H "Authorization: Bearer $NEWSLETTER_CRON_SECRET" https://<preview>/api/newsletter/reconcile`. Vercel Cron runs on Production deployments only (Hobby: once a day):
schedule it at Production time; on Preview call it manually.

## 7. Before Production (checklist)

- [ ] Migration 06 applied and verified (MCP read-only).
- [ ] GOCCE isolation verified in Brevo (section 4).
- [ ] RADAR list, DOI template, IT / EN welcome templates, contact attributes, marketing
      webhook created in Brevo; ids in the env (Preview first).
- [ ] Airtable PAT (records read/write + schema read on the sync base only), base and table
      ids; `npm run airtable:schema-check` returns 0 fields to fix.
- [ ] Privacy notice legally validated; `PRIVACY_POLICY_VERSION` / `NEWSLETTER_CONSENT_VERSION`
      set to the approved versions (`draft-2026-11` is not approved for Production).
- [ ] Authorised real test on Preview: sign-up, DOI email, confirmation, welcome, Airtable,
      unsubscription, re-subscription.
- [ ] Vercel Cron for the reconciliation; deploy from Git restored (Production branch
      protected).
- [ ] Legal review of retention, access and erasure procedures (not claimed by this code).
