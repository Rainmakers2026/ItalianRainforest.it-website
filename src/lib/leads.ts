import 'server-only';
import { z } from 'zod';
import { airtableLeadsConfigured, stageLead } from './leads-airtable';

/**
 * Lead / submission handling. Sign-ups (downloads, embed code) are appended to the
 * Airtable approval queue (src/lib/leads-airtable.ts, a staging base — never the
 * read-only "Rainmakers OS" data base) and/or sent to LEAD_WEBHOOK_URL (CRM, email
 * workflow). Without any sink in production, open data is still served.
 */

export const emailSchema = z.email().max(200);
const consent = z.literal(true);
const utm = z.record(z.string(), z.string().max(80)).optional();
const common = {
  email: emailSchema,
  consent,
  marketing: z.boolean().optional().default(false),
  locale: z.enum(['it', 'en']),
  utm,
  // Honeypot: real users never fill it in.
  company_url: z.string().max(0).optional().default(''),
  // Time-to-submit check, ms since the form was rendered.
  elapsed: z.number().int().min(0),
};

const personName = z.string().trim().min(1).max(100);
const company = z.string().trim().max(160).optional().default('');
/** Who the visitor is: collected once by the sign-up gate, then sent with every gated action. */
const person = { firstName: personName, lastName: personName, referent: personName.optional(), company };

export const LEAD_REASONS = [
  'download_csv',
  'download_xlsx',
  'download_json',
  'download_pdf',
  'download_bulk',
  'map_png',
  'map_pdf',
  'map_csv',
  'embed',
  'contacts',
] as const;

/** One-time sign-up (lead magnet) before the first download or contact reveal. */
export const SignupSchema = z.object({
  ...common,
  ...person,
  reason: z.enum(LEAD_REASONS),
});
/** Contact reveal from the player profile, for a signed-up visitor. */
export const ContactRequestSchema = z.object({
  ...common,
  ...person,
  playerId: z.string().min(4).max(20),
  message: z.string().max(1000).optional().default(''),
});
export const SuggestionSchema = z.object({
  ...common,
  type: z.enum(['new', 'correction', 'other']),
  organization: z.string().min(1).max(200),
  website: z.string().max(300).optional().default(''),
  details: z.string().min(10).max(3000),
});
export const DownloadRequestSchema = z.object({
  ...common,
  firstName: personName.optional(),
  lastName: personName.optional(),
  referent: personName.optional(),
  company,
  format: z.enum(['csv', 'xlsx', 'table']),
  query: z.string().max(1000),
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
