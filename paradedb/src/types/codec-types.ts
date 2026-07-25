import type { PARADEDB_VECTOR_CODEC_ID } from '../core/constants';

export type CodecTypes = {
  readonly [K in typeof PARADEDB_VECTOR_CODEC_ID]: {
    readonly input: ReadonlyArray<number>;
    readonly output: number[];
  };
};
