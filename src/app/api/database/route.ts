import { getDatabase } from '@/lib/database/source';
import { DatabaseResponseSchema } from '@/lib/database/types';

// Read-only contacts database for /[locale]/database-preview. GET only: any other
// method gets 405 from Next. Today the source is mock data (`source: "mock"`).
export const revalidate = 3600;

export async function GET() {
  try {
    // Final gate: the response is re-validated against the public schema, which
    // strips any key outside the allowlist.
    const body = DatabaseResponseSchema.parse(await getDatabase());
    return Response.json(body, {
      headers: {
        'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'x-robots-tag': 'noindex',
      },
    });
  } catch (err) {
    console.error('[api/database]', err);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
