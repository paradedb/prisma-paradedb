export type VectorMetric = 'l2' | 'cosine' | 'ip';

// Opclasses registered by pg_search on the paradedb access method. Same names as
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

export interface ParadeDbVectorIndexColumn {
  readonly column: string;
  readonly metric?: VectorMetric;
}

export interface ParadeDbIndexDdlOptions {
  readonly name: string;
  readonly table: string;
  readonly schema?: string;
  readonly keyField: string;
  readonly columns: ReadonlyArray<string | ParadeDbVectorIndexColumn>;
  readonly centroidRatio?: number;
  readonly trainingSamplesPerCentroid?: number;
  readonly clusterReplication?: number;
}

// Vector index build options (pg_search 0.25.0+). Index-wide; applied to every
// vector column in the index.
const VECTOR_INDEX_OPTIONS = [
  { key: 'centroid_ratio', field: 'centroidRatio', min: 0.000001, max: 1, integer: false },
  {
    key: 'training_samples_per_centroid',
    field: 'trainingSamplesPerCentroid',
    min: 1,
    max: 100000,
    integer: true,
  },
  { key: 'cluster_replication', field: 'clusterReplication', min: 1, max: 2147483647, integer: true },
] as const;

function renderVectorIndexOption(
  spec: (typeof VECTOR_INDEX_OPTIONS)[number],
  value: number,
): string {
  const isValid =
    Number.isFinite(value) &&
    value >= spec.min &&
    value <= spec.max &&
    (!spec.integer || Number.isInteger(value));
  if (!isValid) {
    throw new Error(
      `renderParadeDbIndexDdl: ${spec.key} must be ${spec.integer ? 'an integer' : 'a number'} between ${spec.min} and ${spec.max}, got ${value}`,
    );
  }
  return `${spec.key} = ${value}`;
}

function quoteIdentifier(identifier: string): string {
  if (identifier.length === 0) {
    throw new Error('renderParadeDbIndexDdl: identifier cannot be empty');
  }
  if (identifier.includes('\0')) {
    throw new Error('renderParadeDbIndexDdl: identifier cannot contain null bytes');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeLiteral(value: string): string {
  if (value.includes('\0')) {
    throw new Error('renderParadeDbIndexDdl: literal cannot contain null bytes');
  }
  return value.replace(/'/g, "''");
}

/**
 * Renders `CREATE INDEX ... USING paradedb (...) WITH (key_field = '...')` DDL,
 * including per-column vector opclasses that the contract `constraints.index`
 * path cannot express yet. Indexes declared through `constraints.index` get the
 * default `vector_l2_ops` opclass for vector columns; use this helper (in a raw
 * migration) when the index needs the cosine or inner-product metric.
 */
export function renderParadeDbIndexDdl(options: ParadeDbIndexDdlOptions): string {
  if (options.columns.length === 0) {
    throw new Error('renderParadeDbIndexDdl: at least one column is required');
  }
  const columnNames = options.columns.map((entry) =>
    typeof entry === 'string' ? entry : entry.column,
  );
  if (!columnNames.includes(options.keyField)) {
    throw new Error(
      `renderParadeDbIndexDdl: key_field "${options.keyField}" must be listed in columns`,
    );
  }
  const columnList = options.columns
    .map((entry) => {
      if (typeof entry === 'string') return quoteIdentifier(entry);
      const opclass = VECTOR_OPCLASSES[entry.metric ?? 'l2'];
      if (opclass === undefined) {
        throw new Error(
          `renderParadeDbIndexDdl: unknown vector metric ${JSON.stringify(entry.metric)}`,
        );
      }
      return `${quoteIdentifier(entry.column)} ${opclass}`;
    })
    .join(', ');
  const qualifiedTable =
    options.schema === undefined
      ? quoteIdentifier(options.table)
      : `${quoteIdentifier(options.schema)}.${quoteIdentifier(options.table)}`;
  const withEntries = [`key_field = '${escapeLiteral(options.keyField)}'`];
  for (const spec of VECTOR_INDEX_OPTIONS) {
    const value = options[spec.field];
    if (value !== undefined) {
      withEntries.push(renderVectorIndexOption(spec, value));
    }
  }
  return `CREATE INDEX ${quoteIdentifier(options.name)} ON ${qualifiedTable} USING paradedb (${columnList}) WITH (${withEntries.join(', ')})`;
}
