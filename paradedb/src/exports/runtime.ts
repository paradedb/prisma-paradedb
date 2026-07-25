import type { SqlRuntimeExtensionDescriptor } from '@prisma-next/sql-runtime';
import { paradedbPackMeta, paradedbQueryOperations } from '../core/descriptor-meta';
import { paradedbVectorDescriptor } from '../core/vector-codec';

const paradedbRuntimeDescriptor: SqlRuntimeExtensionDescriptor<'postgres'> = {
  kind: 'extension' as const,
  id: paradedbPackMeta.id,
  version: paradedbPackMeta.version,
  familyId: 'sql' as const,
  targetId: 'postgres' as const,
  // The adapter derives its render-time codec lookup from each stack
  // component's `types.codecTypes.codecDescriptors`.
  types: paradedbPackMeta.types,
  codecs: () => [paradedbVectorDescriptor],
  queryOperations: () => paradedbQueryOperations(),
  create() {
    return {
      familyId: 'sql' as const,
      targetId: 'postgres' as const,
    };
  },
};

export default paradedbRuntimeDescriptor;
