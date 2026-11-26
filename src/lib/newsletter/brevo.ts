import 'server-only';
import type { BrevoConfig } from './config';

/**
 * Brevo REST client (API v3), only the documented endpoints used by RAINFOREST RADAR:
 *   POST /v3/contacts/doubleOptinConfirmation  — start the double opt-in (201)
 *   GET  /v3/contacts/{email}?identifierType=email_id — contact state (listIds, blacklist)
 *   POST /v3/smtp/email                        — the welcome email (saved template, 201)
 * It never touches other lists (e.g. GOCCE): includeListIds is the RADAR list only.
 * Errors carry the HTTP status and Brevo's error code only — never a value.
 */

export class BrevoError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`Brevo request failed (${status}${code ? ` ${code}` : ''})`);
    this.status = status;
    this.code = code;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(cfg: BrevoConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        method,
        headers: { 'api-key': cfg.apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      if (attempt < 2) {
        await wait(400 * 2 ** attempt);
        continue;
      }
      throw new BrevoError(0, 'network');
    }
    // Rate limit / transient errors: short backoff, then the reconciliation job retries.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const after = Number(res.headers.get('retry-after'));
      await wait(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 3000) : 400 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok && res.status !== 404) throw new BrevoError(res.status, String((data as { code?: string } | null)?.code ?? '').slice(0, 40));
    return { status: res.status, data: data as T };
  }
}

export type BrevoContact = { id: number; emailBlacklisted: boolean; listIds: number[]; listUnsubscribed: number[] };

/** Starts the double opt-in: Brevo sends the confirmation email (DOI template). */
export async function requestDoubleOptIn(cfg: BrevoConfig, p: { email: string; attributes: Record<string, string>; redirectionUrl: string }): Promise<void> {
  await call(cfg, 'POST', '/v3/contacts/doubleOptinConfirmation', {
    email: p.email,
    attributes: Object.fromEntries(Object.entries(p.attributes).filter(([k, v]) => cfg.attributes.includes(k) && v !== '')),
    includeListIds: [cfg.listId],
    templateId: cfg.doiTemplateId,
    redirectionUrl: p.redirectionUrl,
  });
}

export async function getContact(cfg: BrevoConfig, email: string): Promise<BrevoContact | null> {
  const { status, data } = await call<Partial<BrevoContact>>(cfg, 'GET', `/v3/contacts/${encodeURIComponent(email)}?identifierType=email_id`);
  if (status === 404 || !data || typeof data.id !== 'number') return null;
  return { id: data.id, emailBlacklisted: !!data.emailBlacklisted, listIds: data.listIds ?? [], listUnsubscribed: data.listUnsubscribed ?? [] };
}

/** The contact is an active member of the RADAR list (confirmed, not unsubscribed, not blocklisted). */
export const isActiveMember = (cfg: BrevoConfig, c: BrevoContact | null) =>
  !!c && c.listIds.includes(cfg.listId) && !c.emailBlacklisted && !c.listUnsubscribed.includes(cfg.listId);

/** Sends a saved template (welcome email). Returns Brevo's messageId. */
export async function sendTemplate(cfg: BrevoConfig, p: { templateId: number; email: string; name: string; params: Record<string, string> }): Promise<string> {
  const { data } = await call<{ messageId?: string; messageIds?: string[] }>(cfg, 'POST', '/v3/smtp/email', {
    templateId: p.templateId,
    to: [{ email: p.email, ...(p.name ? { name: p.name } : {}) }],
    params: p.params,
    tags: ['rainforest-radar-welcome'],
  });
  return String(data?.messageId ?? data?.messageIds?.[0] ?? '').slice(0, 200);
}
