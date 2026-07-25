import type { SqlControlExtensionDescriptor } from '@prisma-next/family-sql/control';
import { paradedbPackMeta, paradedbQueryOperations } from '../core/descriptor-meta';

// Upstream 0.15.0 removed the `databaseDependencies` hook (automatic `CREATE EXTENSION
// pg_search`); the pg_search and pgvector extensions must now exist before `db init`.
const paradedbExtensionDescriptor: SqlControlExtensionDescriptor<'postgres'> = {
  ...paradedbPackMeta,
  queryOperations: () => paradedbQueryOperations(),
  create: () => ({
    familyId: 'sql' as const,
    targetId: 'postgres' as const,
  }),
};

export { paradedbExtensionDescriptor, paradedbPackMeta };
export default paradedbExtensionDescriptor;
