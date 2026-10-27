# @shelflens/catalog

A deterministic generator for the store's product catalog.

The same seed and size always produce the same catalog, on any machine. That is what lets the
golden queries name specific products, the benchmark compare runs, and the demo ship a snapshot
that matches what the tests ran against.

```ts
import { generateCatalog } from '@shelflens/catalog';

const catalog = generateCatalog({ seed: 7, products: 2000 });
```

Or write one to disk:

```bash
npm run catalog -- --seed 7 --products 2000 --out data/catalog.json
```

Every brand and product name is invented. The vocabulary in `src/words.ts` includes a few entries
on purpose, such as a name with an accent and words with common synonyms, so the search engine's
normalization and synonym handling have real data to be tested against.
