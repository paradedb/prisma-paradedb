import { int4Column, textColumn } from '@prisma-next/adapter-postgres/column-types';
import { vectorColumn } from '@prisma-next/extension-paradedb/column-types';
import paradedb from '@prisma-next/extension-paradedb/pack';
import sqlFamily from '@prisma-next/family-sql/pack';
import { defineContract } from '@prisma-next/sql-contract-ts/contract-builder';
import postgresPack from '@prisma-next/target-postgres/pack';
import { postgresCreateNamespace } from '@prisma-next/target-postgres/types';

export const contract = defineContract(
  {
    family: sqlFamily,
    target: postgresPack,
    extensionPacks: { paradedb },
    createNamespace: postgresCreateNamespace,
  },
  ({ field, model }) => {
    const Item = model('Item', {
      fields: {
        id: field.column(int4Column).id(),
        description: field.column(textColumn),
        category: field.column(textColumn),
        rating: field.column(int4Column),
        embedding: field.column(vectorColumn(3)),
      },
    });

    return {
      models: {
        Item: Item.sql(({ cols, constraints }) => ({
          table: 'item',
          indexes: [
            // Listing `cols.embedding` here requires pg_search with vector-in-bm25
            // support (branch mvp/vector-search); released builds reject vector
            // columns in bm25 indexes, so the demo indexes text fields only and
            // vector Top-K falls back to an unaccelerated sort.
            constraints.index([cols.category, cols.description, cols.id, cols.rating], {
              type: 'bm25',
              options: { key_field: 'id' },
              name: 'item_bm25_idx',
            }),
          ],
        })),
      },
    };
  },
);
