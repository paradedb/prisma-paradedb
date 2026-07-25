export type VectorMetric = 'l2' | 'cosine' | 'ip';

// Opclasses registered by pg_search on the bm25 access method. Same names as
// pgvector's but distinct catalog objects; `vector_l2_ops` is the AM default.
export const VECTOR_OPCLASSES = {
  l2: 'vector_l2_ops',
  cosine: 'vector_cosine_ops',
  ip: 'vector_ip_ops',
} as const satisfies Record<VectorMetric, string>;

// pgvector distance operators. The ORDER BY operator must match the metric of
// the index opclass, or Top-K index pushdown is silently lost.
export const VECTOR_DISTANCE_OPERATORS = {
  l2: '<->',
  cosine: '<=>',
  ip: '<#>',
} as const satisfies Record<VectorMetric, string>;

export interface Bm25VectorIndexColumn {
  readonly column: string;
  readonly metric?: VectorMetric;
}

export interface Bm25IndexDdlOptions {
  readonly name: string;
  readonly table: string;
  readonly schema?: string;
  readonly keyField: string;
  readonly columns: ReadonlyArray<string | Bm25VectorIndexColumn>;
}

function quoteIdentifier(identifier: string): string {
  if (identifier.length === 0) {
    throw new Error('renderBm25IndexDdl: identifier cannot be empty');
  }
  if (identifier.includes('\0')) {
    throw new Error('renderBm25IndexDdl: identifier cannot contain null bytes');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeLiteral(value: string): string {
  if (value.includes('\0')) {
    throw new Error('renderBm25IndexDdl: literal cannot contain null bytes');
  }
  return value.replace(/'/g, "''");
}

/**
 * Renders `CREATE INDEX ... USING bm25 (...) WITH (key_field = '...')` DDL,
 * including per-column vector opclasses that the contract `constraints.index`
 * path cannot express yet. Indexes declared through `constraints.index` get the
 * default `vector_l2_ops` opclass for vector columns; use this helper (in a raw
 * migration) when the index needs the cosine or inner-product metric.
 */
export function renderBm25IndexDdl(options: Bm25IndexDdlOptions): string {
  if (options.columns.length === 0) {
    throw new Error('renderBm25IndexDdl: at least one column is required');
  }
  const columnNames = options.columns.map((entry) =>
    typeof entry === 'string' ? entry : entry.column,
  );
  if (!columnNames.includes(options.keyField)) {
    throw new Error(
      `renderBm25IndexDdl: key_field "${options.keyField}" must be listed in columns`,
    );
  }
  const columnList = options.columns
    .map((entry) => {
      if (typeof entry === 'string') return quoteIdentifier(entry);
      const opclass = VECTOR_OPCLASSES[entry.metric ?? 'l2'];
      if (opclass === undefined) {
        throw new Error(
          `renderBm25IndexDdl: unknown vector metric ${JSON.stringify(entry.metric)}`,
        );
      }
      return `${quoteIdentifier(entry.column)} ${opclass}`;
    })
    .join(', ');
  const qualifiedTable =
    options.schema === undefined
      ? quoteIdentifier(options.table)
      : `${quoteIdentifier(options.schema)}.${quoteIdentifier(options.table)}`;
  return `CREATE INDEX ${quoteIdentifier(options.name)} ON ${qualifiedTable} USING bm25 (${columnList}) WITH (key_field = '${escapeLiteral(options.keyField)}')`;
}
