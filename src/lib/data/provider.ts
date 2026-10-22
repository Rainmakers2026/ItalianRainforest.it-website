import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { airtableConfigFromEnv, readAllRecords, type AirtableConfig } from './airtable-readonly';
import { applyDemoGeo, isGeoDemoEnabled } from './demo-geo';
import { dedupe, extractGatedContacts, normalizeRecord, publicId, type RawRecord } from './normalize';
import type { Dataset, GatedContacts, PublicPlayer } from './schema';

/**
 * Frontend code never talks to a data source directly: it asks a DataProvider.
 * Both implementations are strictly read-only.
 */
export interface DataProvider {
  readonly name: Dataset['source'];
  readRecords(): Promise<{ records: RawRecord[]; readAt: string }>;
}

/** Snapshot of the legacy public dataset (data/snapshot/legacy-records.json). */
export class LegacyReadOnlyProvider implements DataProvider {
  readonly name = 'legacy-snapshot' as const;
  async readRecords() {
    const file = path.join(process.cwd(), 'data', 'snapshot', 'legacy-records.json');
    const json = JSON.parse(await readFile(file, 'utf8')) as { fetchedAt: string; records: RawRecord[] };
    return { records: json.records, readAt: json.fetchedAt };
  }
}

/** Airtable REST API, GET only, token kept server-side. */
export class AirtableReadOnlyProvider implements DataProvider {
  readonly name = 'airtable' as const;
  constructor(private cfg: AirtableConfig) {}
  async readRecords() {
    const records = await readAllRecords(this.cfg);
    return { records, readAt: new Date().toISOString() };
  }
}

export function getProvider(): DataProvider {
  const cfg = airtableConfigFromEnv();
  return cfg ? new AirtableReadOnlyProvider(cfg) : new LegacyReadOnlyProvider();
}

const STALE_AFTER_DAYS = Number(process.env.DATA_STALE_AFTER_DAYS ?? 30);
const TTL_MS = Number(process.env.DATA_REVALIDATE_SECONDS ?? 3600) * 1000;

type Cache = { at: number; dataset: Dataset; raw: RawRecord[] };
let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

async function load(): Promise<Cache> {
  const primary = getProvider();
  let raw: RawRecord[];
  let readAt: string;
  let source = primary.name;
  const warnings: string[] = [];
  try {
    ({ records: raw, readAt } = await primary.readRecords());
  } catch (err) {
    if (primary.name !== 'airtable') throw err;
    // Source temporarily unavailable: keep serving the last good copy or the snapshot.
    if (cache) return cache;
    console.error('[data] Airtable unavailable, falling back to snapshot:', (err as Error).message);
    ({ records: raw, readAt } = await new LegacyReadOnlyProvider().readRecords());
    source = 'legacy-snapshot';
    warnings.push('source-unavailable');
  }

  const normalized = raw.map(normalizeRecord).filter((p): p is PublicPlayer => !!p);
  const { players: unique, duplicates } = dedupe(normalized);
  if (duplicates.length) warnings.push(`duplicates:${duplicates.join(', ')}`);
  const players = (isGeoDemoEnabled() ? applyDemoGeo(unique) : unique).sort((a, b) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }),
  );

  const ageDays = (Date.now() - new Date(readAt).getTime()) / 86_400_000;
  if (ageDays > STALE_AFTER_DAYS) {
    warnings.push(`stale:${Math.round(ageDays)}d`);
    console.warn(`[data] Dataset is ${Math.round(ageDays)} days old (threshold ${STALE_AFTER_DAYS}).`);
  }

  return {
    at: Date.now(),
    raw,
    dataset: {
      players,
      updatedAt: readAt,
      source,
      hasDemoGeo: players.some((p) => p.location?.source === 'demo'),
      warnings,
    },
  };
}

async function getCache(): Promise<Cache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  inflight ??= load()
    .then((c) => (cache = c))
    .finally(() => (inflight = null));
  return inflight;
}

export async function getDataset(): Promise<Dataset> {
  return (await getCache()).dataset;
}

/** Server-only: gated contacts for one public id. Never serialised into public payloads. */
export async function getGatedContacts(id: string): Promise<GatedContacts | null> {
  const { raw } = await getCache();
  const rec = raw.find((r) => publicId(r.id) === id);
  return rec ? extractGatedContacts(rec.fields) : null;
}
