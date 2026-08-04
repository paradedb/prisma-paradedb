import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { paradedbPackMeta } from '../src/core/descriptor-meta';
import { paradedbIndexTypes } from '../src/types/index-types';

describe('ParadeDB extension', () => {
  describe('paradedbPackMeta', () => {
    it('declares correct extension identity', () => {
      expect(paradedbPackMeta.kind).toBe('extension');
      expect(paradedbPackMeta.id).toBe('paradedb');
      expect(paradedbPackMeta.familyId).toBe('sql');
      expect(paradedbPackMeta.targetId).toBe('postgres');
    });

    it('declares bm25 and vector capabilities', () => {
      expect(paradedbPackMeta.capabilities).toEqual({
        postgres: { 'paradedb/bm25': true, 'paradedb/vector': true },
      });
    });

    it('exposes the paradedb entry in indexTypes', () => {
      expect(paradedbPackMeta.indexTypes.entries).toHaveLength(1);
      expect(paradedbPackMeta.indexTypes.entries[0]?.type).toBe('paradedb');
    });
  });

  describe('paradedbIndexTypes', () => {
    it('declares a single paradedb entry', () => {
      expect(paradedbIndexTypes.entries.map((e) => e.type)).toEqual(['paradedb']);
    });

    it('validates paradedb options with a key_field string', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      const result = entry.options({ key_field: 'id' });
      expect(result instanceof type.errors).toBe(false);
    });

    it('rejects paradedb options without key_field', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      const result = entry.options({});
      expect(result instanceof type.errors).toBe(true);
    });

    it('rejects paradedb options with extra unknown keys', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      const result = entry.options({ key_field: 'id', extra: 'nope' });
      expect(result instanceof type.errors).toBe(true);
    });

    it('rejects paradedb options where key_field is not a string', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      const result = entry.options({ key_field: 42 });
      expect(result instanceof type.errors).toBe(true);
    });

    it('accepts all three vector index build options together', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      const result = entry.options({
        key_field: 'id',
        centroid_ratio: 0.01,
        training_samples_per_centroid: 32,
        cluster_replication: 1,
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it('accepts a single vector index build option alone', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      const result = entry.options({ key_field: 'id', centroid_ratio: 0.5 });
      expect(result instanceof type.errors).toBe(false);
    });

    it('rejects centroid_ratio outside [0.000001, 1]', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      expect(entry.options({ key_field: 'id', centroid_ratio: 0 }) instanceof type.errors).toBe(
        true,
      );
      expect(entry.options({ key_field: 'id', centroid_ratio: 1.5 }) instanceof type.errors).toBe(
        true,
      );
    });

    it('rejects non-integer or out-of-range training_samples_per_centroid', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      expect(
        entry.options({ key_field: 'id', training_samples_per_centroid: 0.5 }) instanceof
          type.errors,
      ).toBe(true);
      expect(
        entry.options({ key_field: 'id', training_samples_per_centroid: 100001 }) instanceof
          type.errors,
      ).toBe(true);
    });

    it('rejects cluster_replication below 1 or above i32 max', () => {
      const entry = paradedbIndexTypes.entries[0];
      if (!entry) throw new Error('expected paradedb entry');
      expect(entry.options({ key_field: 'id', cluster_replication: 0 }) instanceof type.errors).toBe(
        true,
      );
      expect(
        entry.options({ key_field: 'id', cluster_replication: 2147483648 }) instanceof type.errors,
      ).toBe(true);
    });
  });
});
