# paradedb-demo

End-to-end demo of `@prisma-next/extension-paradedb` against a live ParadeDB server in Docker.

Exercises:

- `paradeDbMatch(col, query)` / `paradeDbMatchAny` / `paradeDbMatchAll` / `paradeDbTerm` / `paradeDbPhrase` — the five match-mode operators (`@@@` / `|||` / `&&&` / `===` / `###`).
- `paradeDbScore(keyCol)` — BM25 relevance score (`pdb.score`).
- `paradeDbFuzzy` / `paradeDbBoost` / `paradeDbConst` / `paradeDbSlop` — typmod casts (`'q'::pdb.fuzzy(N)` etc.); compose into match operators.
- `paradeDbProximity(start).within(distance, term, { ordered? })…` — chained proximity (`##` / `##>`); composes through `paradeDbMatch`.
- `vectorColumn(3)` — native pgvector `vector(3)` column with `number[]` ⇄ `'[x,y,z]'` codec.
- `paradeDbAll(keyCol)` + `paradeDbL2Distance(vecCol, query)` — vector Top-K (`@@@ pdb.all()` predicate, `<->` ORDER BY, LIMIT).
- `CREATE EXTENSION pg_search` / `vector` via the docker init scripts (`init/*.sql`).
- Automatic `CREATE INDEX ... USING bm25 (...) WITH (key_field='...')` via upstream's index-type registry.

The bm25 index covers the text columns only: released pg_search builds reject vector columns in bm25 indexes (needs branch `mvp/vector-search`, paradedb/paradedb#5685), so vector Top-K runs unaccelerated here. The gated integration test in `test/vector.integration.test.ts` exercises the vector-in-bm25 index (via `renderBm25IndexDdl`) and skips with a clear reason on released builds.

## Run it

```bash
cp .env.example .env
pnpm docker:up
pnpm emit
pnpm db:init
pnpm seed
pnpm start -- match 'headphones'
pnpm start -- top 'laptop' 5
pnpm start -- fuzzy 'laptp' 2
pnpm start -- proximity 'wireless' 'keyboard' 3
pnpm start -- proximity-chain 'cooling' '>1' 'fan' '>1' 'and'
pnpm start -- chain-demo
pnpm start -- mode-tour
pnpm start -- cast-demo
pnpm start -- vector '0.1,0.9,0.1' 3
pnpm test
```

`pnpm db:init` produces the BM25 index directly from the `constraints.index([...], { type: 'bm25', options: { key_field: 'id' } })` declaration in `prisma/contract.ts`.

Teardown:

```bash
pnpm docker:down
```
