import 'dotenv/config';
import type { Runtime } from '@prisma-next/sql-runtime';
import { loadAppConfig } from '../src/app-config';
import { db } from '../src/prisma/db';

// The 0.15.0 postgres client is single-shot (connect/close once per process)
// and `db` is a shared singleton, so all test files share one connection and
// leave teardown to the vitest worker exit.
let connection: Promise<Runtime> | undefined;

export function ensureDbConnected(): Promise<Runtime> {
  connection ??= db.connect({ url: loadAppConfig().databaseUrl });
  return connection;
}
