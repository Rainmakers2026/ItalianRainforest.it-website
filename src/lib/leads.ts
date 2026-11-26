import 'server-only';
import { z } from 'zod';
import { airtableLeadsConfigured, stageLead } from './leads-airtable';

/**
 * Lead / submission validation (server side, zod) and the optional extra destinations
 * (LEAD_WEBHOOK_URL, the legacy Airtable approval queue). The system of record for every
 * form is Supabase: src/lib/supabase/store.ts (CLAUDE.md "Form submissions → Supabase").
 */

/** Trimmed and lower-cased before validation: one address, one spelling, everywhere. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(200));
const consent = z.literal(true);
const utm = z
  .record(z.string().regex(/^[a-z_]{1,40}$/), z.string().max(80))
  .refine((u) => Object.keys(u).length <= 10)
  .optional();
const slug = z.string().regex(/^[a-z0-9_]{1,60}$/);
/** Where the submission comes from: the real page, the section and the CTA that opened it. */
export const OriginSchema = z.object({
  page: z.string().max(200).regex(/^\/[A-Za-z0-9/_.%-]*$/),
  section: slug,
  cta: slug,
});
/** Browser-generated idempotency key: a retry of the same action never creates a second row. */
const tracking = { requestId: z.uuid(), origin: OriginSchema };
const common = {
  email: emailSchema,
  consent,
  marketing: z.boolean().optional().default(false),
  locale: z.enum(['it', 'en']),
  utm,
  // Honeypot: real users never fill it in. Accepted here so a bot that fills it gets the
  // same fake success as a person (looksAutomated) and learns nothing; nothing is stored.
  company_url: z.string().max(500).optional().default(''),
  // Time-to-submit check, ms since the form was rendered.
  elapsed: z.number().int().min(0),
};

const personName = z.string().trim().min(1).max(100);
const company = z.string().trim().max(160).optional().default('');
/** Who the visitor is: collected once by the sign-up gate, then sent with every gated action. */
const person = { firstName: personName, lastName: personName, referent: personName.optional(), company };

/** Gated actions: the downloads offered by the explorer, and the embed code. */
export const DOWNLOAD_REASONS = ['download_csv', 'download_xlsx', 'download_bulk', 'map_csv', 'map_png', 'map_pdf'] as const;
export const LEAD_REASONS = [...DOWNLOAD_REASONS, 'embed'] as const;
export type DownloadReason = (typeof DOWNLOAD_REASONS)[number];

/**
 * POST /api/signup. `entry: "registration"` = the one-time sign-up form (before the first
 * download or embed code); `entry: "event"` = a later gated action by a signed-up visitor
 * that has no server request of its own (map PNG, embed code copy), sent with the stored
 * profile and the request id of the sign-up (`registrationId`).
 */
export const SignupSchema = z
  .object({
    ...common,
    ...person,
    ...tracking,
    reason: z.enum(LEAD_REASONS),
    entry: z.enum(['registration', 'event']).default('registration'),
    registrationId: z.uuid().optional(),
    embedKind: z.enum(['map', 'database']).optional(),
    embedLocale: z.enum(['it', 'en']).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.reason === 'embed' && !v.embedKind) ctx.addIssue({ code: 'custom', path: ['embedKind'], message: 'required for the embed code' });
    if (v.reason !== 'embed' && (v.embedKind || v.embedLocale)) ctx.addIssue({ code: 'custom', path: ['embedKind'], message: 'embed only' });
    if (v.entry === 'registration' && v.registrationId) ctx.addIssue({ code: 'custom', path: ['registrationId'], message: 'events only' });
  });
/** Contact reveal from the player profile, for a signed-up visitor. */
export const ContactRequestSchema = z.object({
  ...common,
  ...person,
  playerId: z.string().min(4).max(20),
  message: z.string().max(1000).optional().default(''),
});
/** POST /api/suggest — "Segnala un aggiornamento / Suggest an update". */
export const SuggestionSchema = z.object({
  ...common,
  ...tracking,
  type: z.enum(['new', 'correction', 'other']),
  organization: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300).optional().default(''),
  details: z.string().trim().min(10).max(3000),
});
/** POST /api/download — a download by a signed-up visitor (the profile stored at sign-up). */
export const DownloadRequestSchema = z.object({
  ...common,
  ...tracking,
  firstName: personName,
  lastName: personName,
  referent: personName.optional(),
  company,
  format: z.enum(['csv', 'xlsx', 'table']),
  query: z.string().max(1000),
  reason: z.enum(DOWNLOAD_REASONS).optional(),
  registrationId: z.uuid().optional(),
});

/**
 * POST /api/newsletter — the dedicated RAINFOREST RADAR form. Both checkboxes are
 * mandatory here (privacy acknowledgment + newsletter consent), unlike the optional
 * newsletter box of the other forms.
 */
export const NewsletterSignupSchema = z.object({
  firstName: personName,
  lastName: personName,
  email: emailSchema,
  privacy: z.literal(true),
  newsletter: z.literal(true),
  locale: z.enum(['it', 'en']),
  utm,
  ...tracking,
  company_url: z.string().max(500).optional().default(''),
  elapsed: z.number().int().min(0),
});

export type Lead =
  | ({ kind: 'signup' } & z.infer<typeof SignupSchema>)
  | ({ kind: 'contact_request' } & z.infer<typeof ContactRequestSchema>)
  | ({ kind: 'suggestion' } & z.infer<typeof SuggestionSchema>)
  | ({ kind: 'download' } & z.infer<typeof DownloadRequestSchema>);

const MIN_ELAPSED_MS = 1500;
export const looksAutomated = (l: { company_url?: string; elapsed: number }) => !!l.company_url || l.elapsed < MIN_ELAPSED_MS;

// --- Rate limiting -----------------------------------------------------------
// In-memory sliding window per instance. On serverless this is best-effort; for
// strict limits plug in a shared store (e.g. Upstash/Vercel KV) — see README.
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 5, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > limit;
}

export function clientKey(req: Request): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim();
}

/** CSRF: JSON-only endpoints, and the Origin (when sent) must match the host. */
export function isSameOrigin(req: Request): boolean {
  if (!req.headers.get('content-type')?.includes('application/json')) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host'));
  } catch {
    return false;
  }
}

// --- Sink ---------------------------------------------------------------------
export function sinkConfigured(): boolean {
  return !!process.env.LEAD_WEBHOOK_URL || airtableLeadsConfigured() || process.env.NODE_ENV !== 'production';
}

export async function deliverLead(lead: Lead): Promise<void> {
  const url = process.env.LEAD_WEBHOOK_URL;
  const { company_url: _hp, elapsed: _e, ...payload } = lead;
  // People who sign up go to the Airtable approval queue (staging base).
  if (lead.kind === 'signup' && airtableLeadsConfigured()) {
    await stageLead({
      kind: lead.kind,
      reason: lead.reason,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      referent: lead.referent,
      company: lead.company,
      marketing: lead.marketing,
      locale: lead.locale,
      utm: lead.utm,
    });
  }
  const body = JSON.stringify({ ...payload, receivedAt: new Date().toISOString(), site: 'italian-rainforest' });
  if (!url) {
    if (airtableLeadsConfigured()) return;
    // Development only: print a redacted summary instead of the email address.
    console.info('[lead:dev]', lead.kind, { ...payload, email: '[redacted]' });
    return;
  }
  const target = new URL(url);
  if (/(^|\.)airtable\.com$/i.test(target.hostname)) throw new Error('LEAD_WEBHOOK_URL must not point to Airtable (use AIRTABLE_LEADS_*)');
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.LEAD_WEBHOOK_SECRET ? { authorization: `Bearer ${process.env.LEAD_WEBHOOK_SECRET}` } : {}),
    },
    body,
  });
  if (!res.ok) throw new Error(`Lead webhook failed (${res.status})`);
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Download is lightly gated by email unless DOWNLOAD_REQUIRES_EMAIL=false. */
export const downloadRequiresEmail = () => process.env.DOWNLOAD_REQUIRES_EMAIL !== 'false';
