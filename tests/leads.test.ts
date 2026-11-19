import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { ContactRequestSchema, DownloadRequestSchema, SignupSchema } = await import('@/lib/leads');

const base = { consent: true, locale: 'it', elapsed: 3000 } as const;
const person = { firstName: 'Ada', lastName: 'Rossi', email: 'ada@example.com' };

describe('lead magnet sign-up', () => {
  it('requires first name, last name and email; referent and company are optional', () => {
    expect(SignupSchema.safeParse({ ...base, ...person, reason: 'download_csv' }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...base, ...person, company: 'Acme', reason: 'map_png' }).success).toBe(true);
    for (const k of ['firstName', 'lastName', 'email'] as const) {
      expect(SignupSchema.safeParse({ ...base, ...person, [k]: '', reason: 'contacts' }).success).toBe(false);
    }
  });

  it('covers PDF downloads and the embed code', () => {
    for (const reason of ['download_pdf', 'map_pdf', 'embed'] as const) expect(SignupSchema.safeParse({ ...base, ...person, reason }).success).toBe(true);
  });

  it('requires consent and a known reason', () => {
    expect(SignupSchema.safeParse({ ...base, ...person, consent: false, reason: 'download_csv' }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...base, ...person, reason: 'anything' }).success).toBe(false);
  });

  it('downloads and contact reveals carry the signed-up profile', () => {
    expect(DownloadRequestSchema.safeParse({ ...base, ...person, format: 'csv', query: 'locale=it' }).success).toBe(true);
    expect(ContactRequestSchema.safeParse({ ...base, ...person, playerId: 'abcd1234' }).success).toBe(true);
    expect(ContactRequestSchema.safeParse({ ...base, ...person, firstName: '', playerId: 'abcd1234' }).success).toBe(false);
  });
});
