import 'dotenv/config';
import { renderBm25IndexDdl } from '@prisma-next/extension-paradedb/ddl';
import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../src/app-config';
import { vectorSearch } from '../src/queries/vector-search';
import { ensureDbConnected } from './db-connection';

const SKIP = process.env['DATABASE_URL'] === undefined;

function distanceL2(a: readonly number[], b: readonly number[]): number {
  return Math.sqrt(a.reduce((sum, x, i) => sum + (x - (b[i] ?? 0)) ** 2, 0));
}

describe.skipIf(SKIP)('paradedb vector integration', () => {
  beforeAll(() => ensureDbConnected());

  it('returns Top-K rows ordered by ascending L2 distance', async () => {
    const query = [0.1, 0.9, 0.1];
    const rows = await vectorSearch(query, 3);
    expect(rows).toHaveLength(3);
    // Seed row 2 (wireless keyboard) carries exactly [0.1, 0.9, 0.1].
    expect(rows[0]?.id).toBe(2);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]?.distance).toBeLessThanOrEqual(rows[i]?.distance ?? 0);
    }
  });

  it('computes distances matching a JS reference implementation', async () => {
    const query = [0.25, 0.15, 0.8];
    const rows = await vectorSearch(query, 2);
    expect(rows[0]?.id).toBe(7);
    expect(rows[0]?.distance).toBeCloseTo(distanceL2(query, [0.2, 0.1, 0.85]), 6);
  });

  // Vector columns inside bm25 indexes need pg_search from branch
  // `mvp/vector-search` (paradedb/paradedb#5685); released builds reject the
  // DDL, so this Top-K pushdown coverage skips against current releases.
  it('creates a bm25 index over the vector column when pg_search supports it', async (ctx) => {
    const { databaseUrl } = loadAppConfig();
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const ddl = renderBm25IndexDdl({
      name: 'item_vector_bm25_idx',
      table: 'item',
      schema: 'public',
      keyField: 'id',
      columns: ['id', { column: 'embedding', metric: 'l2' }],
    });
    try {
      try {
        await client.query(ddl);
      } catch (error) {
        ctx.skip(
          `pg_search build does not support vector columns in bm25 indexes (needs branch mvp/vector-search): ${String(error)}`,
        );
      }
      const result = await client.query(
        `SELECT id FROM public.item WHERE id @@@ pdb.all() ORDER BY embedding <-> '[0.1,0.9,0.1]' LIMIT 2`,
      );
      expect(result.rows[0]?.id).toBe(2);
    } finally {
      await client.query('DROP INDEX IF EXISTS public.item_vector_bm25_idx');
      await client.end();
    }
  });
});
