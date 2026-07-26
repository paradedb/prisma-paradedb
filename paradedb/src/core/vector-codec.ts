import type { JsonValue } from '@prisma-next/contract/types';
import {
  type CodecCallContext,
  CodecDescriptorImpl,
  CodecImpl,
  type CodecInstanceContext,
  type ColumnTypeDescriptor,
} from '@prisma-next/framework-components/codec';
import type { ExpandNativeTypeInput } from '@prisma-next/family-sql/control';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type } from 'arktype';
import { PARADEDB_VECTOR_CODEC_ID } from './constants';

export type VectorParams = { readonly dimensions: number };

const vectorParamsSchema = type({
  dimensions: 'number.integer > 0',
}) satisfies StandardSchemaV1<VectorParams>;

function assertVectorValues(value: unknown): asserts value is readonly number[] {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `${PARADEDB_VECTOR_CODEC_ID}: expected an array of numbers; got ${typeof value}`,
    );
  }
  for (const element of value) {
    if (typeof element !== 'number' || !Number.isFinite(element)) {
      throw new TypeError(
        `${PARADEDB_VECTOR_CODEC_ID}: expected finite numbers; got ${JSON.stringify(element)}`,
      );
    }
  }
}

export function serializeVector(value: readonly number[]): string {
  assertVectorValues(value);
  return `[${value.join(',')}]`;
}

export function parseVector(text: string): number[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new TypeError(
      `${PARADEDB_VECTOR_CODEC_ID}: expected '[x,y,...]' vector text; got ${JSON.stringify(text)}`,
    );
  }
  const body = trimmed.slice(1, -1).trim();
  if (body === '') return [];
  return body.split(',').map((part) => {
    const parsed = Number(part);
    if (!Number.isFinite(parsed)) {
      throw new TypeError(
        `${PARADEDB_VECTOR_CODEC_ID}: non-numeric vector element ${JSON.stringify(part)}`,
      );
    }
    return parsed;
  });
}

export class ParadeDbVectorCodec extends CodecImpl<
  typeof PARADEDB_VECTOR_CODEC_ID,
  readonly ['equality'],
  string,
  number[]
> {
  constructor(
    descriptor: ParadeDbVectorDescriptor,
    private readonly dimensions?: number,
  ) {
    super(descriptor);
  }

  private assertDimensions(value: readonly number[]): void {
    if (this.dimensions !== undefined && value.length !== this.dimensions) {
      throw new TypeError(
        `${PARADEDB_VECTOR_CODEC_ID}: expected ${this.dimensions} dimensions; got ${value.length}`,
      );
    }
  }

  async encode(value: number[], _ctx: CodecCallContext): Promise<string> {
    this.assertDimensions(value);
    return serializeVector(value);
  }

  async decode(wire: string, _ctx: CodecCallContext): Promise<number[]> {
    if (Array.isArray(wire)) {
      assertVectorValues(wire);
      return [...wire];
    }
    if (typeof wire !== 'string') {
      throw new TypeError(
        `${PARADEDB_VECTOR_CODEC_ID}: expected vector text from the driver; got ${typeof wire}`,
      );
    }
    return parseVector(wire);
  }

  encodeJson(value: number[]): JsonValue {
    assertVectorValues(value);
    this.assertDimensions(value);
    return [...value];
  }

  decodeJson(json: JsonValue): number[] {
    assertVectorValues(json);
    return [...json];
  }
}

export class ParadeDbVectorDescriptor extends CodecDescriptorImpl<VectorParams> {
  override readonly codecId = PARADEDB_VECTOR_CODEC_ID;
  override readonly traits = ['equality'] as const;
  override readonly targetTypes = ['vector'] as const;
  override readonly meta = {
    db: { sql: { postgres: { nativeType: 'vector' } } },
  } as const;
  override readonly paramsSchema = vectorParamsSchema satisfies StandardSchemaV1<VectorParams>;
  override factory(params: VectorParams): (ctx: CodecInstanceContext) => ParadeDbVectorCodec {
    return () => new ParadeDbVectorCodec(this, params?.dimensions);
  }
}

export const paradedbVectorDescriptor = new ParadeDbVectorDescriptor();

export function expandVectorNativeType({ nativeType, typeParams }: ExpandNativeTypeInput): string {
  if (!typeParams || !('dimensions' in typeParams)) {
    return nativeType;
  }
  const dimensions = typeParams['dimensions'];
  if (
    typeof dimensions !== 'number' ||
    !Number.isInteger(dimensions) ||
    dimensions <= 0 ||
    !Number.isFinite(dimensions)
  ) {
    throw new Error(
      `Invalid "dimensions" type parameter for "${nativeType}": expected a positive integer, got ${JSON.stringify(dimensions)}`,
    );
  }
  return `${nativeType}(${dimensions})`;
}

export function vectorColumn(dimensions: number): ColumnTypeDescriptor & {
  readonly typeParams: { readonly dimensions: number };
} {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(
      `vectorColumn: dimensions must be a positive integer; got ${String(dimensions)}`,
    );
  }
  return {
    codecId: PARADEDB_VECTOR_CODEC_ID,
    nativeType: 'vector',
    typeParams: { dimensions },
  } as const;
}
