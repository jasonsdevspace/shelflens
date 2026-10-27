# @jasonsdevspace/shelflens

A product search engine in plain TypeScript. Typo tolerance, synonyms, search as you type,
filters, sorting, stable pagination, and an explanation for every result. No dependencies, no I/O,
so it runs the same in Node, in a browser and in a test.

```ts
import { createEngine } from '@jasonsdevspace/shelflens';

const engine = createEngine(documents, {
    fields: { name: { weight: 3 }, brand: { weight: 2 }, description: { weight: 1 } },
    attributes: { brand: 'keyword', color: 'keyword', price: 'number', inStock: 'boolean' },
    synonyms: [{ kind: 'one-way', from: 'trainers', to: 'sneakers' }],
});

const result = engine.search({
    query: 'trail runn',
    prefixLastTerm: true,
    filters: [{ attribute: 'price', range: { to: 15000 } }],
    sort: [{ by: 'relevance', direction: 'desc' }],
    page: 1,
    pageSize: 20,
});
```

A document is an id, some searchable text by field, and some attributes to filter and sort by.
The engine knows nothing about products. Whoever owns the catalog decides what becomes a document.

## How matching works

- **The same normalization on both sides.** Accents are folded, case is folded, hyphenated words
  produce both their parts and the joined form, and plurals are reduced. Whatever happens to the
  catalog when it is indexed happens to the query when it is searched, so "Café", "T-Shirt" and
  "shoes" are found by "cafe", "tshirt" and "shoe".
- **Every word must match.** A document matches a query when each query word is found, in any
  field, by any of the ways below. A match in a heavily weighted field such as the name outranks
  the same match in a description.
- **Exact first, then one typo.** The fuzzy pass, which allows one inserted, deleted, substituted
  or swapped character per word, runs only when the exact pass finds nothing. A correctly typed
  query is never diluted with corrections of itself, and the result says which pass it came from.
- **Synonyms widen the query, not the index.** A rule can be one way or equivalent, and a
  multi-word synonym counts only where every word is present.
- **The last word can be a prefix**, for search as you type, when the request says so.

Every hit carries its matches: which query word matched which indexed term, in which field, by
which route, and for how much. That is what an explain mode shows.

## Filters, sorting and paging

- Filters narrow the candidates before anything is scored: a single value, any of several, or a
  numeric range whose upper bound is exclusive. A filter on an attribute the config does not
  declare is an `EngineError`, since that is the caller's mistake and not an empty result.
- Sorts take any declared attribute or `relevance`, each clause breaking the ties of the one
  before it, and every sort ends on the id. Documents that tie on everything asked for still come
  back in one fixed order, so paging never shows a document twice or skips one. A sort declared as
  scoped to a filter, such as a position within a category, falls back to relevance when the
  filter is absent, and the result reports the sort actually applied.
- Pages are one-based. A page past the end is empty rather than an error. The page size is clamped
  to a limit, and a query can be paged only so far, while the total still reports every match.

## Not yet in this package

Facets with counts, and merchandising rules. Both are built on the filters and matches above.
