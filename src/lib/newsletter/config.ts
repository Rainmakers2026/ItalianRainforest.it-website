import 'server-only';

/**
 * RAINFOREST RADAR configuration (server env only — never NEXT_PUBLIC_). Every integration
 * is OFF until its variables are set: nothing is simulated, no default ids are invented.
 * See .env.example and docs/newsletter.md.
 */

const env = (k: string) => process.env[k]?.trim() ?? '';
const posInt = (k: string) => {
  const n = Number(env(k));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * API base URL. Production hosts are fixed; an override is accepted only towards a local
 * mock (tests / e2e), never towards another remote host.
 */
function apiBase(overrideKey: string, fixed: string): string {
  const o = env(overrideKey);
  if (!o) return fixed;
  const u = new URL(o);
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') throw new Error(`${overrideKey} may only point to a local mock`);
  return o.replace(/\/$/, '');
}

export type BrevoConfig = {
  apiKey: string;
  baseUrl: string;
  listId: number;
  doiTemplateId: number;
  welcomeTemplateId: { it: number | null; en: number | null };
  webhookSecret: string | null;
  /** Contact attributes that exist in the Brevo account (BREVO_CONTACT_ATTRIBUTES). */
  attributes: string[];
};

export function brevoConfig(): BrevoConfig | null {
  const apiKey = env('BREVO_API_KEY');
  const listId = posInt('BREVO_LIST_ID');
  const doiTemplateId = posInt('BREVO_DOI_TEMPLATE_ID');
  if (!apiKey || !listId || !doiTemplateId) return null;
  return {
    apiKey,
    baseUrl: apiBase('BREVO_API_BASE', 'https://api.brevo.com'),
    listId,
    doiTemplateId,
    welcomeTemplateId: { it: posInt('BREVO_WELCOME_TEMPLATE_ID_IT'), en: posInt('BREVO_WELCOME_TEMPLATE_ID_EN') },
    webhookSecret: env('BREVO_WEBHOOK_SECRET').length >= 24 ? env('BREVO_WEBHOOK_SECRET') : null,
    attributes: (env('BREVO_CONTACT_ATTRIBUTES') || 'FIRSTNAME,LASTNAME')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((a) => /^[A-Z][A-Z0-9_]{0,49}$/.test(a)),
  };
}

export type AirtableSyncConfig = {
  pat: string;
  baseUrl: string;
  baseId: string;
  subscribersTableId: string;
  unsubscribersTableId: string;
  userRequestsTableId: string | null;
};

const BASE_ID = /^app[A-Za-z0-9]{14}$/;
const TABLE_ID = /^tbl[A-Za-z0-9]{14}$/;

/**
 * Sync base ("IRF push da Supabase"), identified by id — never the read-only Rainmakers OS
 * data base (AIRTABLE_BASE_ID) nor its credentials.
 */
export function airtableSyncConfig(): AirtableSyncConfig | null {
  const pat = env('AIRTABLE_SYNC_PAT');
  const baseId = env('AIRTABLE_SYNC_BASE_ID');
  const subscribersTableId = env('AIRTABLE_NEWSLETTER_SUBSCRIBERS_TABLE_ID');
  const unsubscribersTableId = env('AIRTABLE_NEWSLETTER_UNSUBSCRIBERS_TABLE_ID');
  if (!pat || !baseId || !subscribersTableId || !unsubscribersTableId) return null;
  if (!BASE_ID.test(baseId) || !TABLE_ID.test(subscribersTableId) || !TABLE_ID.test(unsubscribersTableId)) throw new Error('Airtable sync ids are not valid ids (app… / tbl…)');
  if (baseId === process.env.AIRTABLE_BASE_ID) throw new Error('AIRTABLE_SYNC_BASE_ID must not be the read-only Rainmakers OS data base');
  if (pat === process.env.AIRTABLE_TOKEN) throw new Error('AIRTABLE_SYNC_PAT must not be the read-only data token');
  const userRequests = env('AIRTABLE_USER_REQUESTS_TABLE_ID');
  return {
    pat,
    baseUrl: apiBase('AIRTABLE_API_BASE', 'https://api.airtable.com'),
    baseId,
    subscribersTableId,
    unsubscribersTableId,
    userRequestsTableId: TABLE_ID.test(userRequests) ? userRequests : null,
  };
}

/** HMAC secret of the confirmation links (≥ 32 characters). */
export function tokenSecret(): string | null {
  const s = env('NEWSLETTER_TOKEN_SECRET');
  return s.length >= 32 ? s : null;
}

/** Secret of the reconciliation endpoint (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export function cronSecret(): string | null {
  const s = env('NEWSLETTER_CRON_SECRET') || env('CRON_SECRET');
  return s.length >= 24 ? s : null;
}

/**
 * Public origin used in the confirmation link sent by Brevo. Never derived from the request
 * Host header. Preview: the branch URL exposed by Vercel.
 */
export function publicOrigin(): string {
  const explicit = env('NEWSLETTER_PUBLIC_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  if (env('VERCEL_ENV') === 'preview' && env('VERCEL_BRANCH_URL')) return `https://${env('VERCEL_BRANCH_URL')}`;
  return (env('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
}

export function newsletterConsentVersion(): string | null {
  return env('NEWSLETTER_CONSENT_VERSION') || env('PRIVACY_POLICY_VERSION') || null;
}
export function privacyNoticeVersion(): string | null {
  return env('PRIVACY_POLICY_VERSION') || null;
}
