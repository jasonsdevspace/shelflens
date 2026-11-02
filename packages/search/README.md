# @shelflens/search

The store's search: the catalog mapped onto the engine, and everything a product search needs
that the engine deliberately knows nothing about.

- **Documents.** Each product becomes a document whose name, brand, category, colors, material,
  tags and description are searchable, with the name counting most, and whose brand, colors,
  sizes, category, prices, rating and position can be filtered, faceted and sorted.
- **Customer groups.** A guest and a member see different prices and, for one product, a
  different catalog. `searchStore` applies the group in one place: it filters by visibility and
  resolves "price" to the group's own price attribute for filters, sorts and facets, so the rest
  of the system never names a group-specific attribute.
- **Most rated.** `mostRated` is the one list of the products a group may see with the most
  ratings, then the highest rated among equals, found through `searchStore` so visibility and
  rules hold. The rail beside a product falls back on it, and a search that finds nothing offers
  it, so the two never disagree.
- **Synonyms.** The catalog's own vocabulary file supplies the words shoppers use for its
  products, with a few equivalents added here.
- **The golden queries.** `golden.ts` lists what a shopper might type and what the top results
  must be. The test suite runs them against the default catalog, so a change that makes a result
  worse fails the build. The first run of them found a real flaw in how synonyms were applied.
- **A size budget.** The demo ships the default catalog to the browser. A test keeps its
  compressed size under budget.

```bash
npm run bench
```

Runs the engine over a hundred thousand generated products and writes `docs/benchmarks/`, so the
cost of indexing, faceting and the fuzzy pass is measured rather than assumed.
