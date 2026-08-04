import { defineIndexTypes } from '@prisma-next/sql-contract/index-types';
import { type } from 'arktype';

export const paradedbIndexTypes = defineIndexTypes().add('paradedb', {
  options: type({
    '+': 'reject',
    key_field: 'string',
    // Vector index build options (pg_search 0.25.0+); index-wide, applied to
    // every vector column in the index.
    'centroid_ratio?': '0.000001 <= number <= 1',
    'training_samples_per_centroid?': '1 <= number.integer <= 100000',
    'cluster_replication?': '1 <= number.integer <= 2147483647',
  }),
});

export type IndexTypes = typeof paradedbIndexTypes.IndexTypes;
export type ParadeDbIndexOptions = IndexTypes['paradedb']['options'];
