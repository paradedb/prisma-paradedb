import { defineIndexTypes } from '@prisma-next/sql-contract/index-types';
import { type } from 'arktype';

export const paradedbIndexTypes = defineIndexTypes().add('paradedb', {
  options: type({
    '+': 'reject',
    key_field: 'string',
  }),
});

export type IndexTypes = typeof paradedbIndexTypes.IndexTypes;
export type ParadeDbIndexOptions = IndexTypes['paradedb']['options'];
