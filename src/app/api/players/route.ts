import { getDataset } from '@/lib/data/provider';

// Public, sanitised dataset. Contains PublicPlayer fields only (see lib/data/schema.ts).
export const revalidate = 3600;

export async function GET() {
  try {
    const ds = await getDataset();
    return Response.json(
      { players: ds.players, updatedAt: ds.updatedAt, hasDemoGeo: ds.hasDemoGeo },
      { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    console.error('[api/players]', err);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
