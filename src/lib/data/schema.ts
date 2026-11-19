import { z } from 'zod';
import { CATEGORY_KEYS, STATUSES, type CategoryKey } from './taxonomy';

/**
 * Canonical public schema. Everything in `PublicPlayer` may reach the browser.
 * Sensitive data (direct emails, phone numbers, contact persons) lives only in
 * `GatedContacts`, which is never part of the public payload or the exports.
 */

const categoryKey = z.enum(CATEGORY_KEYS as [CategoryKey, ...CategoryKey[]]);

export const LocationSchema = z.object({
  country: z.string().nullable(),
  region: z.string().nullable(), // region slug, see src/lib/geo/territories.ts
  province: z.string().nullable(), // province slug
  city: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** How precise the position is: street address, city centre or region centre. */
  precision: z.enum(['address', 'city', 'region']).nullable(),
  /** `data` = from the source of truth. `demo` = synthetic preview position, never exported. */
  source: z.enum(['data', 'demo']),
});

export const LogoSchema = z.object({
  /** Site-relative path (/logos/players/…) or https URL (Airtable attachment). */
  src: z.string().regex(/^(\/|https:\/\/)/),
  w: z.number().nullable(),
  h: z.number().nullable(),
  /** `light` = light artwork on transparent background: render on a dark tile. */
  tone: z.enum(['light', 'dark']),
  /** For light artwork: a version recoloured dark, to place directly on white. */
  onLight: z.string().nullable().optional(),
});

export const PublicPlayerSchema = z.object({
  id: z.string(), // pseudonymous, stable (hash of the source record id)
  slug: z.string(),
  name: z.string().min(1),
  categories: z.array(categoryKey).min(1),
  status: z.enum(STATUSES),
  website: z.url().nullable(),
  websiteHost: z.string().nullable(),
  /** The source has one description per player, in Italian or English. */
  description: z.string().nullable(),
  logo: LogoSchema.nullable(),
  industries: z.array(z.string()),
  location: LocationSchema.nullable(),
  hasGatedContacts: z.boolean(),
});

export const GatedContactsSchema = z.object({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  contactPerson: z.string().nullable(),
});

export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;
export type PlayerLocation = z.infer<typeof LocationSchema>;
export type PlayerLogo = z.infer<typeof LogoSchema>;
export type GatedContacts = z.infer<typeof GatedContactsSchema>;

export type Dataset = {
  players: PublicPlayer[];
  /** ISO date of the database export / last successful read from the source. */
  updatedAt: string;
  source: 'snapshot' | 'airtable';
  /** True when at least one player carries a synthetic (demo) position. */
  hasDemoGeo: boolean;
  warnings: string[];
};
