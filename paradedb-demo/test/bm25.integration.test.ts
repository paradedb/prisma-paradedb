import 'dotenv/config';
import { beforeAll, describe, expect, it } from 'vitest';
import { ormClientBm25TopMatches } from '../src/orm-client/bm25-top-matches';
import { bm25Match } from '../src/queries/bm25-match';
import { bm25TopByScore } from '../src/queries/bm25-top-by-score';
import { ensureDbConnected } from './db-connection';

const SKIP = process.env['DATABASE_URL'] === undefined;

describe.skipIf(SKIP)('paradedb BM25 integration', () => {
  beforeAll(() => ensureDbConnected());

  it('matchBm25 returns rows whose description matches the query', async () => {
    const rows = await bm25Match('headphones');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.description.toLowerCase().includes('headphones'))).toBe(true);
  });

  it('bm25Score orders matching rows by descending relevance', async () => {
    const rows = await bm25TopByScore('laptop');
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.score).toBeGreaterThanOrEqual(rows[i]!.score);
    }
  });

  it('ORM client returns top matches', async () => {
    const runtime = await ensureDbConnected();
    const rows = await ormClientBm25TopMatches('laptop', 5, runtime);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.description.toLowerCase().includes('laptop'))).toBe(true);
  });
});
