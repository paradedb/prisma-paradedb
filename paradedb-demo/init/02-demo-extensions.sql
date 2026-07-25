-- Upstream 0.15.0 dropped the automatic `CREATE EXTENSION` control hook, so the
-- demo database gets pg_search (bm25) and pgvector (vector columns) here.
\c demo
CREATE EXTENSION IF NOT EXISTS pg_search;
CREATE EXTENSION IF NOT EXISTS vector;
