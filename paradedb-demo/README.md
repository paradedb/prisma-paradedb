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
- Automatic `CREATE INDEX ... USING paradedb (...) WITH (key_field='...')` via upstream's index-type registry.

Requires a pg_search 0.25.0+ server, which registers the `paradedb` index access method; the docker image pin may lag behind, in which case `pnpm db:init` fails until the image catches up.

The ParadeDB index covers the text columns only: vector columns in ParadeDB indexes also need pg_search 0.25.0+ (paradedb/paradedb#5685), so on older builds vector Top-K runs unaccelerated. The gated integration test in `test/vector.integration.test.ts` exercises the vector-in-index DDL (via `renderParadeDbIndexDdl`) and skips with a clear reason when the server lacks support.

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

`pnpm db:init` produces the ParadeDB index directly from the `constraints.index([...], { type: 'paradedb', options: { key_field: 'id' } })` declaration in `prisma/contract.ts`.

Teardown:

```bash
pnpm docker:down
```
