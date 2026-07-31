-- Upstream 0.15.0 dropped the automatic `CREATE EXTENSION` control hook, so the
-- demo database gets pgvector (vector columns) and pg_search (bm25) here.
-- pg_search 0.25.0+ requires vector, so it must be created first.
\c demo
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_search;
