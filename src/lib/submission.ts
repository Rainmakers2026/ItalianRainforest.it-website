'use client';

import { getUtm } from './analytics';
import type { Locale } from './i18n/config';
import type { LeadProfile } from './lead-profile';

/**
 * Browser side of the form submissions (CLAUDE.md "Form submissions → Supabase"): the
 * idempotency key of each action, the real page language and the provenance (page,
 * section, CTA). Validated again on the server (src/lib/leads.ts).
 */

/** Where a submission comes from. `section` / `cta`: lowercase slugs, e.g. "database" / "dialog_all_csv". */
export type Origin = { page: string; section: string; cta: string };

/** One id per user action (RFC 4122 v4); a retry of the same action reuses it. */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The language of the page the visitor is on (/it/…, /en/…), not the explorer's: map and
 * database are in English on both home pages.
 */
export function pageLocale(): Locale {
  const seg = window.location.pathname.split('/')[1];
  if (seg === 'it' || seg === 'en') return seg;
  return document.documentElement.lang.toLowerCase().startsWith('it') ? 'it' : 'en';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60) || 'unknown';

export function originOf(section: string, cta: string): Origin {
  const page = window.location.pathname.replace(/[^A-Za-z0-9/_.%-]/g, '').slice(0, 200);
  return { page: page.startsWith('/') ? page : '/', section: slug(section), cta: slug(cta) };
}

export type GatedEvent = {
  reason: 'map_png' | 'map_pdf' | 'embed';
  origin: Origin;
  requestId: string;
  embedKind?: 'map' | 'database';
  embedLocale?: Locale;
  /** Map files: rows in the exported view and the active filters (public query string). */
  rowCount?: number;
  filterQuery?: string;
};

/**
 * A gated action of a signed-up visitor produced in the browser (map PNG / PDF, embed code
 * copy): recorded as an EVENT once the result exists, before it is handed over. Throws when
 * it could not be recorded (then no file / no copy).
 */
export async function recordGatedEvent(p: LeadProfile, ev: GatedEvent): Promise<void> {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      entry: 'event',
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      company: p.company ?? '',
      ...(p.referent ? { referent: p.referent } : {}),
      ...(p.registrationId ? { registrationId: p.registrationId } : {}),
      consent: true,
      marketing: false,
      locale: pageLocale(),
      utm: getUtm(),
      company_url: '',
      elapsed: Math.round(performance.now()),
      ...ev,
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
}
