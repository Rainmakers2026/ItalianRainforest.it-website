import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without type declarations
import { findViolations } from '../scripts/check-airtable-readonly.mjs';

describe('Airtable read-only policy', () => {
  it('finds no write path in the codebase', async () => {
    expect(await findViolations()).toEqual([]);
  });

  it('the Airtable client only ever issues GET requests', () => {
    const src = readFileSync('src/lib/data/airtable-readonly.ts', 'utf8');
    const methods = [...src.matchAll(/method\s*:\s*['"`](\w+)['"`]/g)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(['GET']));
  });

  it('lead submissions refuse Airtable as a destination', () => {
    const src = readFileSync('src/lib/leads.ts', 'utf8');
    expect(src).toMatch(/airtable\\\.com\$\/i\.test\(target\.hostname\)/);
  });
});
