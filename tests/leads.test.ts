import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { ContactRequestSchema, DownloadRequestSchema, SignupSchema } = await import('@/lib/leads');

const base = { consent: true, locale: 'it', elapsed: 3000 } as const;
const person = { firstName: 'Ada', lastName: 'Rossi', email: 'ada@example.com' };
const tracking = () => ({ requestId: crypto.randomUUID(), origin: { page: '/it', section: 'database', cta: 'dialog_all_csv' } });

describe('lead magnet sign-up', () => {
  it('requires first name, last name and email; referent and company are optional', () => {
    expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), reason: 'download_csv' }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), company: 'Acme', reason: 'map_png' }).success).toBe(true);
    for (const k of ['firstName', 'lastName', 'email'] as const) {
      expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), [k]: '', reason: 'download_csv' }).success).toBe(false);
    }
  });

  it('covers the map PDF and the embed code (with its kind)', () => {
    expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), reason: 'map_pdf' }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), reason: 'embed', embedKind: 'map' }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), reason: 'embed' }).success).toBe(false);
  });

  it('requires consent, a known reason, a request id and the provenance', () => {
    expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), consent: false, reason: 'download_csv' }).success).toBe(false);
    for (const reason of ['anything', 'contacts', 'download_json', 'download_pdf']) expect(SignupSchema.safeParse({ ...base, ...person, ...tracking(), reason }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...base, ...person, reason: 'download_csv' }).success).toBe(false);
  });

  it('downloads and contact reveals carry the signed-up profile', () => {
    expect(DownloadRequestSchema.safeParse({ ...base, ...person, ...tracking(), format: 'csv', query: 'locale=it' }).success).toBe(true);
    expect(DownloadRequestSchema.safeParse({ ...base, ...person, format: 'csv', query: 'locale=it' }).success).toBe(false);
    expect(ContactRequestSchema.safeParse({ ...base, ...person, playerId: 'abcd1234' }).success).toBe(true);
    expect(ContactRequestSchema.safeParse({ ...base, ...person, firstName: '', playerId: 'abcd1234' }).success).toBe(false);
  });
});
