import type { CodecControlHooks } from '@prisma-next/family-sql/control';
import type { AnyCodecDescriptor } from '@prisma-next/framework-components/codec';
import { LiteralExpr } from '@prisma-next/sql-relational-core/ast';
import { buildOperation, codecOf, toExpr } from '@prisma-next/sql-relational-core/expression';
import type { CodecTypes as ParadeDbCodecTypes } from '../types/codec-types';
import { paradedbIndexTypes } from '../types/index-types';
import type { QueryOperationTypes } from '../types/operation-types';
import { PARADEDB_EXTENSION_ID, PARADEDB_VECTOR_CODEC_ID } from './constants';
import { ParadeDbProximityChain } from './proximity-chain';
import { expandVectorNativeType, paradedbVectorDescriptor } from './vector-codec';

type CodecTypesBase = Record<string, { readonly input: unknown; readonly output: unknown }>;

const TEXT = 'pg/text@1' as const;
const BOOL = 'pg/bool@1' as const;
const FLOAT4 = 'pg/float4@1' as const;
const FLOAT8 = 'pg/float8@1' as const;
const INT4 = 'pg/int4@1' as const;
const VECTOR = PARADEDB_VECTOR_CODEC_ID;

export function paradedbQueryOperations<CT extends CodecTypesBase>(): QueryOperationTypes<CT> {
  return {
    // `@@@` accepts both text and structured query types on its RHS.
    // https://docs.paradedb.com/documentation/full-text/match
    paradeDbMatch: {
      self: { codecId: TEXT },
      impl: (self, query) =>
        buildOperation({
          method: 'paradeDbMatch',
          args: [toExpr(self, { codecId: TEXT }), toExpr(query, { codecId: TEXT })],
          returns: { codecId: BOOL, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}} @@@ {{arg0}}',
          },
        }),
    },
    paradeDbMatchAny: {
      self: { codecId: TEXT },
      impl: (self, query) =>
        buildOperation({
          method: 'paradeDbMatchAny',
          args: [toExpr(self, { codecId: TEXT }), toExpr(query, { codecId: TEXT })],
          returns: { codecId: BOOL, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}} ||| {{arg0}}',
          },
        }),
    },
    paradeDbMatchAll: {
      self: { codecId: TEXT },
      impl: (self, query) =>
        buildOperation({
          method: 'paradeDbMatchAll',
          args: [toExpr(self, { codecId: TEXT }), toExpr(query, { codecId: TEXT })],
          returns: { codecId: BOOL, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}} &&& {{arg0}}',
          },
        }),
    },
    // https://docs.paradedb.com/documentation/full-text/term
    paradeDbTerm: {
      self: { codecId: TEXT },
      impl: (self, query) =>
        buildOperation({
          method: 'paradeDbTerm',
          args: [toExpr(self, { codecId: TEXT }), toExpr(query, { codecId: TEXT })],
          returns: { codecId: BOOL, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}} === {{arg0}}',
          },
        }),
    },
    // https://docs.paradedb.com/documentation/full-text/phrase
    paradeDbPhrase: {
      self: { codecId: TEXT },
      impl: (self, query) =>
        buildOperation({
          method: 'paradeDbPhrase',
          args: [toExpr(self, { codecId: TEXT }), toExpr(query, { codecId: TEXT })],
          returns: { codecId: BOOL, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}} ### {{arg0}}',
          },
        }),
    },
    // https://docs.paradedb.com/documentation/sorting/score
    paradeDbScore: {
      self: { codecId: INT4 },
      impl: (self) =>
        buildOperation({
          method: 'paradeDbScore',
          args: [toExpr(self, { codecId: INT4 })],
          returns: { codecId: FLOAT4, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: 'pdb.score({{self}})',
          },
        }),
    },
    // PG rejects parameterized typmods, so the cast argument lowers to a literal.
    // https://docs.paradedb.com/documentation/full-text/fuzzy
    paradeDbFuzzy: {
      self: { codecId: TEXT },
      impl: (self, distance) => {
        if (!Number.isInteger(distance) || distance < 0 || distance > 2) {
          throw new Error(
            `paradeDbFuzzy: distance must be an integer in [0, 2]; got ${String(distance)}`,
          );
        }
        return buildOperation({
          method: 'paradeDbFuzzy',
          args: [toExpr(self, { codecId: TEXT }), LiteralExpr.of(distance)],
          returns: { codecId: TEXT, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}}::pdb.fuzzy({{arg0}})',
          },
        });
      },
    },
    // https://docs.paradedb.com/documentation/sorting/boost
    paradeDbBoost: {
      self: { codecId: TEXT },
      impl: (self, weight) => {
        if (!Number.isInteger(weight) || weight < -2048 || weight > 2048) {
          throw new Error(
            `paradeDbBoost: boost must be an integer in [-2048, 2048]; got ${String(weight)}`,
          );
        }
        return buildOperation({
          method: 'paradeDbBoost',
          args: [toExpr(self, { codecId: TEXT }), LiteralExpr.of(weight)],
          returns: { codecId: TEXT, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}}::pdb.boost({{arg0}})',
          },
        });
      },
    },
    paradeDbConst: {
      self: { codecId: TEXT },
      impl: (self, value) => {
        if (!Number.isInteger(value)) {
          throw new Error(`paradeDbConst: value must be an integer; got ${String(value)}`);
        }
        return buildOperation({
          method: 'paradeDbConst',
          args: [toExpr(self, { codecId: TEXT }), LiteralExpr.of(value)],
          returns: { codecId: TEXT, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}}::pdb.const({{arg0}})',
          },
        });
      },
    },
    paradeDbSlop: {
      self: { codecId: TEXT },
      impl: (self, slop) => {
        if (!Number.isInteger(slop) || slop < 0) {
          throw new Error(`paradeDbSlop: slop must be a non-negative integer; got ${String(slop)}`);
        }
        return buildOperation({
          method: 'paradeDbSlop',
          args: [toExpr(self, { codecId: TEXT }), LiteralExpr.of(slop)],
          returns: { codecId: TEXT, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}}::pdb.slop({{arg0}})',
          },
        });
      },
    },
    // https://docs.paradedb.com/documentation/full-text/proximity
    paradeDbProximity: {
      self: { codecId: TEXT },
      impl: (start) => new ParadeDbProximityChain(start),
    },
    // `key_field @@@ pdb.all()` — mandatory to activate the bm25 scan when the
    // query is a pure vector Top-K (ORDER BY distance + LIMIT).
    paradeDbAll: {
      self: { codecId: INT4 },
      impl: (self) =>
        buildOperation({
          method: 'paradeDbAll',
          args: [toExpr(self, { codecId: INT4 })],
          returns: { codecId: BOOL, nullable: false },
          lowering: {
            targetFamily: 'sql',
            strategy: 'function',
            template: '{{self}} @@@ pdb.all()',
          },
        }),
    },
    // pgvector distance operators, reused verbatim by ParadeDB. The operator
    // must match the metric of the index opclass for Top-K pushdown:
    // `<->` ↔ vector_l2_ops, `<=>` ↔ vector_cosine_ops, `<#>` ↔ vector_ip_ops.
    paradeDbL2Distance: {
      self: { codecId: VECTOR },
      impl: (self, query) => vectorDistanceExpr('paradeDbL2Distance', '<->', self, query),
    },
    paradeDbCosineDistance: {
      self: { codecId: VECTOR },
      impl: (self, query) => vectorDistanceExpr('paradeDbCosineDistance', '<=>', self, query),
    },
    paradeDbInnerProduct: {
      self: { codecId: VECTOR },
      impl: (self, query) => vectorDistanceExpr('paradeDbInnerProduct', '<#>', self, query),
    },
  };
}

// The query vector inherits the column's codec ref (via `codecOf`) so encoding
// resolves the per-instance codec — `vector(3)` vs `vector(1536)`.
function vectorDistanceExpr(method: string, operator: string, self: unknown, query: unknown) {
  const codec = codecOf(self) ?? { codecId: VECTOR };
  return buildOperation({
    method,
    args: [toExpr(self, codec), toExpr(query, codec)],
    returns: { codecId: FLOAT8, nullable: false },
    lowering: {
      targetFamily: 'sql',
      strategy: 'function',
      template: `{{self}} ${operator} {{arg0}}`,
    },
  });
}

// Widened to the public framework interfaces so the concrete codec class types
// never leak into the pack type (TS2742 portability at consumer contract sites).
const paradedbCodecContributions: {
  readonly codecDescriptors: ReadonlyArray<AnyCodecDescriptor>;
  readonly controlPlaneHooks: Readonly<Record<string, CodecControlHooks>>;
} = {
  codecDescriptors: [paradedbVectorDescriptor],
  controlPlaneHooks: {
    [PARADEDB_VECTOR_CODEC_ID]: { expandNativeType: expandVectorNativeType },
  },
};

const paradedbPackMetaBase = {
  kind: 'extension',
  id: PARADEDB_EXTENSION_ID,
  familyId: 'sql',
  targetId: 'postgres',
  version: '0.0.1',
  capabilities: {
    postgres: {
      'paradedb/bm25': true,
      'paradedb/vector': true,
    },
  },
  indexTypes: paradedbIndexTypes,
  types: {
    codecTypes: {
      import: {
        package: '@prisma-next/extension-paradedb/codec-types',
        named: 'CodecTypes',
        alias: 'ParadeDbCodecTypes',
      },
      ...paradedbCodecContributions,
    },
    storage: [
      {
        typeId: PARADEDB_VECTOR_CODEC_ID,
        familyId: 'sql',
        targetId: 'postgres',
        nativeType: 'vector',
      },
    ],
    queryOperationTypes: {
      import: {
        package: '@prisma-next/extension-paradedb/operation-types',
        named: 'QueryOperationTypes',
        alias: 'ParadeDbQueryOperationTypes',
      },
    },
  },
} as const;

export const paradedbPackMeta: typeof paradedbPackMetaBase & {
  readonly __codecTypes?: ParadeDbCodecTypes;
} = paradedbPackMetaBase;
