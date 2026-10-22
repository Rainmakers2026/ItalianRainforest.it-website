import { z } from 'zod';
import { CATEGORY_KEYS, STAGES, type CategoryKey, type StageKey } from './taxonomy';

/**
 * Canonical public schema. Everything in `PublicPlayer` may reach the browser.
 * Sensitive data (direct emails, phone numbers, contact persons) lives only in
 * `GatedContacts`, which is never part of the public payload or the CSV export.
 */

const categoryKey = z.enum(CATEGORY_KEYS as [CategoryKey, ...CategoryKey[]]);
const stageKey = z.enum(STAGES.map((s) => s.key) as [StageKey, ...StageKey[]]);

export const LocationSchema = z.object({
  country: z.string().nullable(),
  region: z.string().nullable(), // region slug, see src/lib/geo/territories.ts
  province: z.string().nullable(), // province slug
  city: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** `data` = from the source of truth. `demo` = synthetic preview position, never exported. */
  source: z.enum(['data', 'demo']),
});

export const PublicPlayerSchema = z.object({
  id: z.string(), // pseudonymous, stable (hash of the source record id)
  slug: z.string(),
  name: z.string().min(1),
  categories: z.array(categoryKey).min(1),
  status: z.enum(['active', 'inactive']),
  website: z.url().nullable(),
  websiteHost: z.string().nullable(),
  description: z.object({ it: z.string().nullable(), en: z.string().nullable() }),
  logo: z.url().nullable(),
  tags: z.array(z.string()),
  stages: z.array(stageKey),
  investmentCountries: z.array(z.string()),
  location: LocationSchema.nullable(),
  publicSocial: z.object({ linkedin: z.url().nullable() }),
  hasGatedContacts: z.boolean(),
  createdAt: z.string().nullable(),
});

export const GatedContactsSchema = z.object({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  contactPerson: z.string().nullable(),
});

export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;
export type PlayerLocation = z.infer<typeof LocationSchema>;
export type GatedContacts = z.infer<typeof GatedContactsSchema>;

export type Dataset = {
  players: PublicPlayer[];
  /** ISO timestamp of the last successful read from the source. */
  updatedAt: string;
  source: 'legacy-snapshot' | 'airtable';
  /** True when at least one player carries a synthetic (demo) position. */
  hasDemoGeo: boolean;
  warnings: string[];
};
