import 'server-only';
import { z } from 'zod';

/**
 * Lead / submission handling. Submissions NEVER go to Airtable: they are sent to
 * LEAD_WEBHOOK_URL (e.g. CRM, email workflow, moderation queue). Without a sink in
 * production the API answers 503 and the UI falls back to email.
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

export const ContactRequestSchema = z.object({
  ...common,
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
  format: z.enum(['csv', 'json']),
  query: z.string().max(1000),
});

export type Lead =
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
  return !!process.env.LEAD_WEBHOOK_URL || process.env.NODE_ENV !== 'production';
}

export async function deliverLead(lead: Lead): Promise<void> {
  const url = process.env.LEAD_WEBHOOK_URL;
  const { company_url: _hp, elapsed: _e, ...payload } = lead;
  const body = JSON.stringify({ ...payload, receivedAt: new Date().toISOString(), site: 'italian-rainforest' });
  if (!url) {
    // Development only: print a redacted summary instead of the email address.
    console.info('[lead:dev]', lead.kind, { ...payload, email: '[redacted]' });
    return;
  }
  const target = new URL(url);
  if (/(^|\.)airtable\.com$/i.test(target.hostname)) throw new Error('LEAD_WEBHOOK_URL must not point to Airtable (read-only policy)');
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
