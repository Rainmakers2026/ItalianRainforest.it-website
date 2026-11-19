import 'server-only';
import { getMockRecords, MOCK_UPDATED_AT } from './mock-data';
import { mapToPublicContact } from './public-contact';
import type { DatabaseResponse, PublicContact } from './types';

/**
 * Single switch point between data sources. Today: mock only.
 *
 * To connect Airtable later, add `getAirtableContacts()` here (server-side
 * only, reading AIRTABLE_TOKEN / AIRTABLE_BASE_ID / AIRTABLE_TABLE_ID /
 * AIRTABLE_VIEW_ID from the environment — never NEXT_PUBLIC_*), fetching raw
 * records through the read-only client and passing them to mapToPublicContact().
 * Real Airtable record ids should be pseudonymised before leaving the server.
 * The API route and the frontend stay unchanged.
 */

export async function getMockContacts(): Promise<PublicContact[]> {
  const records = await getMockRecords();
  return records.map(mapToPublicContact).filter((c): c is PublicContact => !!c);
}

export async function getDatabase(): Promise<DatabaseResponse> {
  const data = await getMockContacts();
  return { source: 'mock', total: data.length, updatedAt: MOCK_UPDATED_AT, data };
}
