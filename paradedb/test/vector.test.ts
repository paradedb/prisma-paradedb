import { OperationExpr, ParamRef } from '@prisma-next/sql-relational-core/ast';
import { describe, expect, it } from 'vitest';
import { renderParadeDbIndexDdl, VECTOR_DISTANCE_OPERATORS, VECTOR_OPCLASSES } from '../src/exports/ddl';
import { paradedbPackMeta } from '../src/core/descriptor-meta';
import {
  expandVectorNativeType,
  ParadeDbVectorCodec,
  paradedbVectorDescriptor,
  parseVector,
  serializeVector,
  vectorColumn,
} from '../src/core/vector-codec';
import paradedbDescriptor from '../src/exports/runtime';

const VECTOR = 'paradedb/vector@1';
const ctx = {};

describe('vector serialization', () => {
  it('serializes number arrays to pgvector text form', () => {
    expect(serializeVector([1, 2, 3])).toBe('[1,2,3]');
    expect(serializeVector([0.5, -1.25])).toBe('[0.5,-1.25]');
    expect(serializeVector([])).toBe('[]');
  });

  it('rejects non-finite and non-numeric elements', () => {
    expect(() => serializeVector([1, Number.NaN])).toThrow('finite');
    expect(() => serializeVector([Number.POSITIVE_INFINITY])).toThrow('finite');
    expect(() => serializeVector(['a'] as unknown as number[])).toThrow('finite');
    expect(() => serializeVector('nope' as unknown as number[])).toThrow('array');
  });

  it('parses pgvector text form back to numbers', () => {
    expect(parseVector('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseVector(' [0.5, -1.25] ')).toEqual([0.5, -1.25]);
    expect(parseVector('[]')).toEqual([]);
  });

  it('rejects malformed vector text', () => {
    expect(() => parseVector('1,2,3')).toThrow("expected '[x,y,...]'");
    expect(() => parseVector('[1,a]')).toThrow('non-numeric');
  });
});

describe('vector codec', () => {
  const codec = paradedbVectorDescriptor.factory({ dimensions: 3 })({ name: 'vec' });

  it('is a ParadeDbVectorCodec with the vector codec id', () => {
    expect(codec).toBeInstanceOf(ParadeDbVectorCodec);
    expect(codec.id).toBe(VECTOR);
  });

  it('encodes to vector text and decodes both text and array wire forms', async () => {
    expect(await codec.encode([1, 2, 3], ctx)).toBe('[1,2,3]');
    expect(await codec.decode('[1,2,3]', ctx)).toEqual([1, 2, 3]);
    expect(await codec.decode([1, 2, 3] as unknown as string, ctx)).toEqual([1, 2, 3]);
  });

  it('enforces declared dimensions on encode', async () => {
    await expect(codec.encode([1, 2], ctx)).rejects.toThrow('expected 3 dimensions; got 2');
  });

  it('round-trips JSON form', () => {
    expect(codec.encodeJson([1, 2, 3])).toEqual([1, 2, 3]);
    expect(codec.decodeJson([1, 2, 3])).toEqual([1, 2, 3]);
    expect(() => codec.decodeJson('nope')).toThrow('array');
  });

  it('descriptor declares vector identity and params schema', () => {
    expect(paradedbVectorDescriptor.codecId).toBe(VECTOR);
    expect(paradedbVectorDescriptor.targetTypes).toEqual(['vector']);
    expect(paradedbVectorDescriptor.isParameterized).toBe(true);
    expect(paradedbVectorDescriptor.meta.db.sql.postgres.nativeType).toBe('vector');
  });
});

describe('vectorColumn', () => {
  it('builds a vector column descriptor with dimensions', () => {
    expect(vectorColumn(3)).toEqual({
      codecId: VECTOR,
      nativeType: 'vector',
      typeParams: { dimensions: 3 },
    });
  });

  it('rejects non-positive or fractional dimensions', () => {
    expect(() => vectorColumn(0)).toThrow('positive integer');
    expect(() => vectorColumn(1.5)).toThrow('positive integer');
    expect(() => vectorColumn(-2)).toThrow('positive integer');
  });
});

describe('expandVectorNativeType', () => {
  it('expands dimensions into the native type', () => {
    expect(expandVectorNativeType({ nativeType: 'vector', typeParams: { dimensions: 3 } })).toBe(
      'vector(3)',
    );
  });

  it('passes through without typeParams', () => {
    expect(expandVectorNativeType({ nativeType: 'vector' })).toBe('vector');
  });

  it('rejects invalid dimensions', () => {
    expect(() =>
      expandVectorNativeType({ nativeType: 'vector', typeParams: { dimensions: 0 } }),
    ).toThrow('positive integer');
  });
});

describe('renderParadeDbIndexDdl', () => {
  it('renders vector columns with each metric opclass (L2 default)', () => {
    expect(
      renderParadeDbIndexDdl({
        name: 'item_search_idx',
        table: 'item',
        keyField: 'id',
        columns: ['id', 'description', { column: 'embedding' }],
      }),
    ).toBe(
      'CREATE INDEX "item_search_idx" ON "item" USING paradedb ("id", "description", "embedding" vector_l2_ops) WITH (key_field = \'id\')',
    );

    expect(
      renderParadeDbIndexDdl({
        name: 'idx',
        table: 'item',
        schema: 'public',
        keyField: 'id',
        columns: ['id', { column: 'embedding', metric: 'cosine' }],
      }),
    ).toBe(
      'CREATE INDEX "idx" ON "public"."item" USING paradedb ("id", "embedding" vector_cosine_ops) WITH (key_field = \'id\')',
    );

    expect(
      renderParadeDbIndexDdl({
        name: 'idx',
        table: 'item',
        keyField: 'id',
        columns: ['id', { column: 'embedding', metric: 'ip' }],
      }),
    ).toContain('"embedding" vector_ip_ops');
  });

  it('renders vector index build options in the WITH clause', () => {
    expect(
      renderParadeDbIndexDdl({
        name: 'item_search_idx',
        table: 'item',
        keyField: 'id',
        columns: ['id', { column: 'embedding', metric: 'cosine' }],
        centroidRatio: 0.01,
        trainingSamplesPerCentroid: 32,
        clusterReplication: 1,
      }),
    ).toBe(
      'CREATE INDEX "item_search_idx" ON "item" USING paradedb ("id", "embedding" vector_cosine_ops) WITH (key_field = \'id\', centroid_ratio = 0.01, training_samples_per_centroid = 32, cluster_replication = 1)',
    );

    expect(
      renderParadeDbIndexDdl({
        name: 'idx',
        table: 'item',
        keyField: 'id',
        columns: ['id', { column: 'embedding' }],
        centroidRatio: 0.5,
      }),
    ).toBe(
      'CREATE INDEX "idx" ON "item" USING paradedb ("id", "embedding" vector_l2_ops) WITH (key_field = \'id\', centroid_ratio = 0.5)',
    );
  });

  it('rejects out-of-range vector index build options', () => {
    const base = {
      name: 'idx',
      table: 'item',
      keyField: 'id',
      columns: ['id', { column: 'embedding' }],
    } as const;
    expect(() => renderParadeDbIndexDdl({ ...base, centroidRatio: 0 })).toThrow(
      'centroid_ratio must be a number between 0.000001 and 1, got 0',
    );
    expect(() => renderParadeDbIndexDdl({ ...base, trainingSamplesPerCentroid: 0.5 })).toThrow(
      'training_samples_per_centroid must be an integer between 1 and 100000, got 0.5',
    );
    expect(() => renderParadeDbIndexDdl({ ...base, clusterReplication: 0 })).toThrow(
      'cluster_replication must be an integer between 1 and 2147483647, got 0',
    );
  });

  it('requires the key_field to be listed in columns', () => {
    expect(() =>
      renderParadeDbIndexDdl({ name: 'idx', table: 'item', keyField: 'id', columns: ['embedding'] }),
    ).toThrow('key_field "id" must be listed in columns');
  });

  it('rejects empty column lists', () => {
    expect(() =>
      renderParadeDbIndexDdl({ name: 'idx', table: 'item', keyField: 'id', columns: [] }),
    ).toThrow('at least one column');
  });

  it('maps metrics to opclasses and operators consistently', () => {
    expect(VECTOR_OPCLASSES).toEqual({
      l2: 'vector_l2_ops',
      cosine: 'vector_cosine_ops',
      ip: 'vector_ip_ops',
    });
    expect(VECTOR_DISTANCE_OPERATORS).toEqual({ l2: '<->', cosine: '<=>', ip: '<#>' });
  });
});

describe('vector query operations', () => {
  const operations = paradedbDescriptor.queryOperations?.() ?? {};

  function buildAst(method: string, ...args: unknown[]): OperationExpr {
    const op = operations[method];
    if (!op) throw new Error(`${method} not found`);
    const expr = op.impl(...(args as never[])) as unknown as { buildAst(): OperationExpr };
    return expr.buildAst();
  }

  it('paradeDbAll lowers to the mandatory match-all predicate', () => {
    const ast = buildAst('paradeDbAll', ParamRef.of(1, { codec: { codecId: 'pg/int4@1' } }));
    expect(ast).toBeInstanceOf(OperationExpr);
    expect(ast.lowering).toEqual({
      targetFamily: 'sql',
      strategy: 'function',
      template: '{{self}} @@@ pdb.all()',
    });
    expect(ast.returns).toEqual({ codecId: 'pg/bool@1', nullable: false });
  });

  it('distance operations lower to the three pgvector operators', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['paradeDbL2Distance', '<->'],
      ['paradeDbCosineDistance', '<=>'],
      ['paradeDbInnerProduct', '<#>'],
    ];
    for (const [method, operator] of cases) {
      const ast = buildAst(method, ParamRef.of(null, { codec: { codecId: VECTOR } }), [1, 0, 0]);
      expect(ast.lowering).toEqual({
        targetFamily: 'sql',
        strategy: 'function',
        template: `{{self}} ${operator} {{arg0}}`,
      });
      expect(ast.returns).toEqual({ codecId: 'pg/float8@1', nullable: false });
    }
  });

  it('binds the query vector as a codec-tagged parameter', () => {
    const ast = buildAst(
      'paradeDbL2Distance',
      ParamRef.of(null, { codec: { codecId: VECTOR } }),
      [0.1, 0.2, 0.3],
    );
    const queryArg = ast.args?.[0];
    expect(queryArg).toBeInstanceOf(ParamRef);
    const param = queryArg as ParamRef;
    expect(param.value).toEqual([0.1, 0.2, 0.3]);
    expect(param.codec).toEqual({ codecId: VECTOR });
  });

  it('threads the column codec ref (with dimensions) onto the query vector param', () => {
    const columnExpr = {
      returnType: {
        codecId: VECTOR,
        nullable: false,
        codec: { codecId: VECTOR, typeParams: { dimensions: 3 } },
      },
      buildAst: () => ParamRef.of(null, { codec: { codecId: VECTOR } }),
    };
    const ast = buildAst('paradeDbL2Distance', columnExpr, [0.1, 0.2, 0.3]);
    const param = ast.args?.[0] as ParamRef;
    expect(param.codec).toEqual({ codecId: VECTOR, typeParams: { dimensions: 3 } });
  });

  it('distance ops carry the vector codec dispatch hint', () => {
    for (const method of ['paradeDbL2Distance', 'paradeDbCosineDistance', 'paradeDbInnerProduct']) {
      expect(operations[method]?.self).toEqual({ codecId: VECTOR });
    }
    expect(operations['paradeDbAll']?.self).toEqual({ codecId: 'pg/int4@1' });
  });
});

describe('pack metadata', () => {
  it('declares the vector capability', () => {
    expect(paradedbPackMeta.capabilities).toEqual({
      postgres: { 'paradedb/bm25': true, 'paradedb/vector': true },
    });
  });

  it('registers the vector codec descriptor and control-plane hooks', () => {
    expect(paradedbPackMeta.types.codecTypes.codecDescriptors).toEqual([paradedbVectorDescriptor]);
    const hooks = paradedbPackMeta.types.codecTypes.controlPlaneHooks[VECTOR];
    if (!hooks?.expandNativeType) throw new Error('expected vector expandNativeType hook');
    expect(hooks.expandNativeType({ nativeType: 'vector', typeParams: { dimensions: 8 } })).toBe(
      'vector(8)',
    );
    expect(paradedbPackMeta.types.storage).toEqual([
      { typeId: VECTOR, familyId: 'sql', targetId: 'postgres', nativeType: 'vector' },
    ]);
  });

  it('runtime descriptor contributes the vector codec', () => {
    expect(paradedbDescriptor.codecs()).toEqual([paradedbVectorDescriptor]);
  });
});
