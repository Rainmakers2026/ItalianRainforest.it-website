import { z } from 'zod';

/**
 * Public contact model — the ALLOWLIST. Only these fields may ever leave the
 * server (API response, UI, CSV). Private source fields (email, phone, notes,
 * internal investor status, source record ids…) have no place here by design.
 * Shared by server and browser: no secrets, no server-only imports.
 */
export const PublicContactSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  company: z.string().nullable(),
  contactType: z.array(z.string()),
  jobTitle: z.string().nullable(),
  hasLinkedin: z.boolean(),
});

export type PublicContact = z.infer<typeof PublicContactSchema>;

/** Column order for tables and CSV. Derived from the schema, never from source records. */
export const PUBLIC_CONTACT_FIELDS = Object.keys(PublicContactSchema.shape) as (keyof PublicContact)[];

export const DATA_SOURCES = ['mock', 'airtable'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const DatabaseResponseSchema = z.object({
  source: z.enum(DATA_SOURCES),
  total: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  data: z.array(PublicContactSchema),
});

export type DatabaseResponse = z.infer<typeof DatabaseResponseSchema>;
