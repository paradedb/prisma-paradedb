import { db } from '../prisma/db';

// Top-K nearest neighbors by L2 distance. The `paradeDbAll` (`@@@ pdb.all()`)
// predicate and the LIMIT are both mandatory for bm25 Top-K pushdown; the
// `<->` operator must match the index opclass metric (`vector_l2_ops`).
export async function vectorSearch(queryVector: readonly number[], limit = 5) {
  const plan = db.sql.public.item
    .select('id', 'description', 'category')
    .select('distance', (f, fns) => fns.paradeDbL2Distance(f.embedding, queryVector))
    .where((f, fns) => fns.paradeDbAll(f.id))
    .orderBy((f, fns) => fns.paradeDbL2Distance(f.embedding, queryVector), { direction: 'asc' })
    .limit(limit)
    .build();
  return db.runtime().execute(plan);
}
