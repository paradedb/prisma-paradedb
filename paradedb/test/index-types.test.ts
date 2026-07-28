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
  });
});
