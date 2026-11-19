import 'server-only';
import { PublicContactSchema, type PublicContact } from './types';

/** A raw record as any source returns it (Airtable shape): private fields included. */
export type RawContactRecord = {
  id: string;
  fields: Record<string, unknown>;
};

/**
 * Source field names → public fields. When the real base is connected, adjust
 * these names to the actual Airtable columns; nothing else needs to change.
 * Fields not listed here (Email, Phone, Notes, …) are never read.
 */
export const CONTACT_FIELDS = {
  name: 'Full Name',
  firstName: 'First Name',
  lastName: 'Last Name',
  company: 'Company',
  contactType: 'Contact Type',
  jobTitle: 'Job Title',
  linkedin: 'LinkedIn',
} as const;

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s || null;
};

const textList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(text).filter((s): s is string => !!s))] : [];

/**
 * Allowlist mapping: builds a PublicContact field by field from the raw record.
 * There is no "copy everything, then delete" step. Returns null for records
 * without a usable name. Zod also strips any key outside the public schema.
 */
export function mapToPublicContact(raw: RawContactRecord): PublicContact | null {
  const f = raw.fields;
  const firstName = text(f[CONTACT_FIELDS.firstName]) ?? '';
  const lastName = text(f[CONTACT_FIELDS.lastName]) ?? '';
  const name = text(f[CONTACT_FIELDS.name]) ?? text(`${firstName} ${lastName}`);
  if (!name) return null;

  const parsed = PublicContactSchema.safeParse({
    id: raw.id,
    name,
    firstName,
    lastName,
    company: text(f[CONTACT_FIELDS.company]),
    contactType: textList(f[CONTACT_FIELDS.contactType]),
    jobTitle: text(f[CONTACT_FIELDS.jobTitle]),
    hasLinkedin: !!text(f[CONTACT_FIELDS.linkedin]),
  });
  return parsed.success ? parsed.data : null;
}
