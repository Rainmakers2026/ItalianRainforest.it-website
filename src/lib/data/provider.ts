import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { airtableConfigFromEnv, readAllRecords, readTableColumns, type AirtableConfig } from './airtable-readonly';
import { applyDemoGeo, isGeoDemoEnabled } from './demo-geo';
import { buildPublicDataset, readFields, type Lookups, type RawRecord } from './normalize';
import type { Dataset } from './schema';
import { MASTER_COLUMNS, validateExportSchema } from '@/lib/export';

/**
 * Frontend code never talks to a data source directly: it asks a DataProvider.
 * Both implementations are strictly read-only.
 *
 *  - SnapshotProvider: data/snapshot/irf-records.json, generated from the database
 *    export by scripts/import-irf-csv.mjs (default).
 *  - AirtableReadOnlyProvider: the Airtable base "Rainmakers OS", enabled by setting
 *    AIRTABLE_TOKEN / AIRTABLE_BASE_ID / AIRTABLE_TABLE (+ optional AIRTABLE_VIEW,
 *    AIRTABLE_FIELD_MAP). Same columns, same normaliser: map, database and every
 *    number on the site switch over with no code change.
 */
export interface DataProvider {
  readonly name: Dataset['source'];
  /** `columns`: the source's column names (names only), when the source exposes them. */
  readRecords(): Promise<{ records: RawRecord[]; readAt: string; columns?: string[] | null }>;
}

const dataFile = (...p: string[]) => path.join(process.cwd(), 'data', ...p);

let schemaCache: string[] | null = null;
/**
 * Column names and order of the Rainmakers OS master — names only, never values. Used only
 * to shape the downloadable files, and follows the source automatically: the live
 * Airtable table (Metadata API) when available, otherwise the importer's
 * data/snapshot/export-schema.json. A new master column appears as an empty header until
 * its publication is approved (allowlist in src/lib/export.ts).
 */
export async function getExportColumns(): Promise<string[]> {
  const live = (await getCache()).columns;
  if (live) {
    try {
      return validateExportSchema(live);
    } catch (err) {
      console.error('[export] live schema unusable, using the snapshot schema:', (err as Error).message);
    }
  }
  if (schemaCache) return schemaCache;
  try {
    const { columns } = JSON.parse(await readFile(dataFile('snapshot', 'export-schema.json'), 'utf8')) as { columns: unknown };
    return (schemaCache = validateExportSchema(columns));
  } catch (err) {
    console.error('[export] schema metadata unusable, using the documented structure:', (err as Error).message);
  }
  return (schemaCache = [...MASTER_COLUMNS]);
}

export class SnapshotProvider implements DataProvider {
  readonly name = 'snapshot' as const;
  async readRecords() {
    const json = JSON.parse(await readFile(dataFile('snapshot', 'irf-records.json'), 'utf8')) as {
      exportDate?: string;
      importedAt: string;
      records: RawRecord[];
    };
    return { records: json.records, readAt: json.exportDate ?? json.importedAt };
  }
}

export class AirtableReadOnlyProvider implements DataProvider {
  readonly name = 'airtable' as const;
  constructor(private cfg: AirtableConfig) {}
  async readRecords() {
    const columns = await readTableColumns(this.cfg);
    // Only the public allowlist is requested: reserved values are never fetched.
    const records = await readAllRecords(this.cfg, readFields(columns));
    return { records, readAt: new Date().toISOString(), columns };
  }
}

export function getProvider(): DataProvider {
  const cfg = airtableConfigFromEnv();
  return cfg ? new AirtableReadOnlyProvider(cfg) : new SnapshotProvider();
}

/** Logo files and geocoded positions prepared offline; used when the source lacks them. */
async function loadLookups(): Promise<Lookups> {
  const read = async <T,>(file: string, pick: (j: never) => T, fallback: T): Promise<T> => {
    try {
      return pick(JSON.parse(await readFile(dataFile('snapshot', file), 'utf8')) as never);
    } catch {
      return fallback;
    }
  };
  return {
    // Logos scraped from the players' websites only fill the gaps of the curated set.
    logos: {
      ...(await read('logos-scraped.json', (j: { logos: Lookups['logos'] }) => j.logos, {})),
      ...(await read('logos.json', (j: { logos: Lookups['logos'] }) => j.logos, {})),
    },
    geo: await read('geocode-cache.json', (j: Lookups['geo']) => j, {}),
  };
}

const STALE_AFTER_DAYS = Number(process.env.DATA_STALE_AFTER_DAYS ?? 60);
const TTL_MS = Number(process.env.DATA_REVALIDATE_SECONDS ?? 3600) * 1000;

type Cache = { at: number; dataset: Dataset; columns: string[] | null };
let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

async function load(): Promise<Cache> {
  const primary = getProvider();
  let raw: RawRecord[];
  let readAt: string;
  let columns: string[] | null | undefined = null;
  let source = primary.name;
  const warnings: string[] = [];
  try {
    ({ records: raw, readAt, columns } = await primary.readRecords());
  } catch (err) {
    if (primary.name !== 'airtable') throw err;
    // Source temporarily unavailable: keep serving the last good copy or the snapshot.
    if (cache) return cache;
    console.error('[data] Airtable unavailable, falling back to snapshot:', (err as Error).message);
    ({ records: raw, readAt } = await new SnapshotProvider().readRecords());
    source = 'snapshot';
    warnings.push('source-unavailable');
  }

  const lookups = await loadLookups();
  const { players: unique, duplicates } = buildPublicDataset(raw, lookups);
  if (duplicates.length) warnings.push(`duplicates:${duplicates.length}`);
  const players = isGeoDemoEnabled() ? applyDemoGeo(unique) : unique;

  const ageDays = (Date.now() - new Date(readAt).getTime()) / 86_400_000;
  if (ageDays > STALE_AFTER_DAYS) warnings.push(`stale:${Math.round(ageDays)}d`);

  return {
    at: Date.now(),
    columns: columns ?? null,
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

