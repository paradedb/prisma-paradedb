# @prisma-next/extension-paradedb

ParadeDB full-text and vector search extension pack for Prisma Next.

## Overview

This extension pack registers a `'bm25'` index type with the SQL family's index-type registry, so contracts can author BM25 full-text search indexes via the standard `constraints.index(...)` surface and the Postgres adapter emits `CREATE INDEX ... USING bm25 WITH (...)` DDL.

The v1 surface covers the `key_field` storage parameter only. Per-field tokenizer and column configuration is deferred to expression-index support.

It also provides native pgvector `vector(n)` column support (no pgvector ORM library required): a `paradedb/vector@1` codec, a `vectorColumn(n)` column helper, the three pgvector distance operators as query operations, and the `@@@ pdb.all()` match-all predicate required for vector Top-K queries.

## Responsibilities

- **bm25 index registration**: declares a `'bm25'` entry via `defineIndexTypes()` carrying an arktype validator for the bm25 options shape
- **Vector columns**: `vectorColumn(dimensions)` maps to `vector(n)` DDL; the `paradedb/vector@1` codec serializes `number[]` ⇄ `'[1,2,3]'` in both directions
- **Vector queries**: `paradeDbL2Distance` (`<->`), `paradeDbCosineDistance` (`<=>`), `paradeDbInnerProduct` (`<#>`), and `paradeDbAll` (`@@@ pdb.all()`)
- **Vector index DDL**: `renderBm25IndexDdl(...)` renders `CREATE INDEX ... USING bm25` statements with per-column vector opclasses for raw migrations
- **Extension descriptor**: declares the `paradedb/bm25` and `paradedb/vector` capabilities for contract-level feature detection
- **Pack ref export**: ships a pure `/pack` entrypoint for TypeScript contract authoring

## Dependencies

- **`@prisma-next/sql-contract`**: index-type registry primitive
- **`@prisma-next/contract`** / **`@prisma-next/contract-authoring`**: core contract types
- **`arktype`**: option-shape validation

## Installation

```bash
pnpm add @prisma-next/extension-paradedb
```

## Usage

### Contract definition

Author bm25 indexes via the standard `constraints.index(...)` surface; the registered `'bm25'` entry narrows `options` per-`type`:

```typescript
import { int4Column, textColumn } from '@prisma-next/adapter-postgres/column-types';
import sqlFamily from '@prisma-next/family-sql/pack';
import { defineContract, field, model } from '@prisma-next/sql-contract-ts/contract-builder';
import paradedb from '@prisma-next/extension-paradedb/pack';
import postgres from '@prisma-next/target-postgres/pack';

export const contract = defineContract({
  family: sqlFamily,
  target: postgres,
  extensionPacks: { paradedb },
  models: {
    Item: model('Item', {
      fields: {
        id: field.column(int4Column).id(),
        body: field.column(textColumn),
      },
    }).sql(({ cols, constraints }) => ({
      table: 'items',
      indexes: [
        constraints.index([cols.body], {
          name: 'item_body_bm25_idx',
          type: 'bm25',
          options: { key_field: 'id' },
        }),
      ],
    })),
  },
});
```

### key_field

ParadeDB BM25 indexes require a `key_field` — a unique column that identifies each document. It is required, must be a string, and is typically (but not always) the table's primary key.

## Vector search

ParadeDB indexes pgvector `vector` columns inside its own bm25 access method. This pack ships the minimal pgvector surface natively — do not install pgvector ORM packages alongside it. Vector-in-bm25 indexing requires a pg_search build from branch `mvp/vector-search` ([paradedb/paradedb#5685](https://github.com/paradedb/paradedb/issues/5685)); on released builds the queries below still run, but without Top-K index acceleration. The `vector` (pgvector) extension must be installed for the column type itself.

### Vector column declaration

```typescript
import { vectorColumn } from '@prisma-next/extension-paradedb/column-types';

const Item = model('Item', {
  fields: {
    id: field.column(int4Column).id(),
    description: field.column(textColumn),
    embedding: field.column(vectorColumn(3)),
  },
});
```

The column emits `vector(3)` DDL and reads/writes `number[]` values.

### Index creation

Vector columns listed in a `constraints.index([...], { type: 'bm25', ... })` declaration get the bm25 AM's default opclass, `vector_l2_ops` (L2). The contract index surface cannot express per-column opclasses yet, so for the cosine or inner-product metric render the DDL for a raw migration:

```typescript
import { renderBm25IndexDdl } from '@prisma-next/extension-paradedb/ddl';

renderBm25IndexDdl({
  name: 'item_vector_idx',
  table: 'item',
  keyField: 'id',
  columns: ['id', 'description', { column: 'embedding', metric: 'cosine' }],
});
// CREATE INDEX "item_vector_idx" ON "item" USING bm25
//   ("id", "description", "embedding" vector_cosine_ops) WITH (key_field = 'id')
```

### Top-K query

A `@@@` predicate is mandatory to activate the bm25 scan — a pure vector query uses the match-all predicate `paradeDbAll` (`@@@ pdb.all()`) on the key field. A `LIMIT` is also required for Top-K pushdown:

```typescript
const plan = db.sql.public.item
  .select('id', 'description')
  .select('distance', (f, fns) => fns.paradeDbL2Distance(f.embedding, [0.1, 0.9, 0.1]))
  .where((f, fns) => fns.paradeDbAll(f.id))
  .orderBy((f, fns) => fns.paradeDbL2Distance(f.embedding, [0.1, 0.9, 0.1]), { direction: 'asc' })
  .limit(5)
  .build();
// SELECT ..., embedding <-> $1 AS distance FROM item
// WHERE id @@@ pdb.all() ORDER BY embedding <-> $1 ASC LIMIT 5
```

The query vector binds as an ordinary prepared-statement parameter serialized to the `'[0.1,0.9,0.1]'` text form.

### Metric ↔ operator coupling

The ORDER BY distance operator must match the index opclass metric; a mismatch does not return wrong results, but it silently loses Top-K index pushdown (plain sort plus a WARNING). Pick one metric per column and use it in both places:

| Metric | Opclass | Operator | Query operation |
| --- | --- | --- | --- |
| L2 (default) | `vector_l2_ops` | `<->` | `paradeDbL2Distance` |
| Cosine | `vector_cosine_ops` | `<=>` | `paradeDbCosineDistance` |
| Inner product | `vector_ip_ops` | `<#>` | `paradeDbInnerProduct` |

## Capabilities

- `paradedb/bm25` — indicates support for BM25 full-text search indexes
- `paradedb/vector` — indicates support for vector columns and distance queries

## Not yet implemented

- Per-column / per-expression tokenizer configuration (deferred to expression-index support)
- Per-column vector opclasses in `constraints.index(...)` (use `renderBm25IndexDdl` meanwhile)
- `halfvec` / `sparsevec` column types
- `CREATE EXTENSION pg_search` / `CREATE EXTENSION vector` via migration planner (removed with upstream's `databaseDependencies` hook; install the extensions before `db init`)
- Aggregation and highlight functions

## References

- [ParadeDB documentation](https://docs.paradedb.com/)
- [ParadeDB CREATE INDEX](https://docs.paradedb.com/documentation/indexing/create-index)
- [ADR 210 — Index-type registry](../../../docs/architecture%20docs/adrs/ADR%20210%20-%20Index-type%20registry.md)
- [Prisma Next Architecture Overview](../../../docs/Architecture%20Overview.md)
