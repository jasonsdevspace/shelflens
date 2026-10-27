# ShelfLens

A product search engine, and the store that will be built on it.

ShelfLens is a fictional store. Its search has to do what a real store's does: find the right
product from a few typed letters, forgive a typo, know that trainers are sneakers, count how many
of each color are left after a filter, let a merchandiser pin a promotion, and explain why each
result ranked where it did. This repository holds the engine that does that, the catalog it is
tested against, and the store's own search built on both.

**Why I built it.** I spent eight years at Adobe, where I worked on a React storefront search
experience backed by a GraphQL search API. Search looks simple until a shopper types "t shirt" and
the Tees outrank the T-Shirts. This is a small, complete example of how I approach that kind of
problem: measure, write the check that would have caught the mistake, then fix it. It is built
only from public documentation of how such systems behave, with its own names and its own
schema.

## What is here

| Package                                        | What it is                                                                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@jasonsdevspace/shelflens`](packages/engine) | The search engine: one normalization for catalog and query, exact-then-fuzzy matching, phrase synonyms, facets, merchandising rules, and an explanation on every hit. No dependencies. |
| [`@shelflens/catalog`](packages/catalog)       | A deterministic generator for the store's product catalog, so every test and benchmark runs against the same data                                                                      |
| [`@shelflens/search`](packages/search)         | The catalog mapped onto the engine: field weights, facets, synonyms, customer groups, the golden queries and the benchmark                                                             |
| [`@shelflens/api`](packages/api)               | The GraphQL schema the storefront is written against, with its generated types                                                                                                         |

Three checks keep the search honest, and each has already caught something:

- **The golden queries.** Seventeen things a shopper might type, each with what its top results
  must be, run in the test suite. Their first run found that synonyms expanded word by word, so
  "t shirt" credited a Tee twice for one word and ranked it above an actual T-Shirt.
- **The benchmark.** `npm run bench` indexes a hundred thousand generated products and times the
  requests a storefront sends. Its first run showed about a gigabyte of memory for the index and a
  third of a second for the widest queries. Storing the index in flat arrays instead of a Map per
  posting, and building result objects only for the page returned, brought that to under a hundred
  megabytes and about a tenth of a second. The [current results](docs/benchmarks/results.md) are
  recorded with the machine they ran on.
- **A size budget.** The catalog the demo will ship stays under 400 KB compressed, or the build
  fails.

## Decisions

Each choice with a real alternative is a record in [docs/decisions](docs/decisions), written when
it was made, with the option rejected, what the choice costs, and the test or measurement behind
it.

1. [An engine of our own, rather than a library](docs/decisions/0001-an-engine-of-our-own.md)
2. [Flat arrays for the index](docs/decisions/0002-flat-arrays-for-the-index.md)
3. [Synonyms rewrite phrases, scored per typed word](docs/decisions/0003-synonyms-rewrite-phrases.md)
4. [Facets count past their own filter](docs/decisions/0004-facets-count-past-their-own-filter.md)

## Dev setup

You need [Node.js 24](https://nodejs.org/) and Git.

```bash
git clone https://github.com/jasonsdevspace/shelflens.git
cd shelflens
npm ci
npm run verify
```

`npm run verify` runs what CI runs: type checking, linting, formatting, a prose check and the
tests, golden queries included. Use `npm test` for watch mode while you work.

Two more commands are worth knowing:

```bash
npm run catalog -- --products 50 --out data/catalog.json
npm run bench
```

The first writes a catalog to look at. The second runs the benchmark and writes its results to
`docs/benchmarks/`.

## Layout

```
packages/
├── engine/      the search engine, published as @jasonsdevspace/shelflens
│   └── src/     normalize, index-builder, match, synonyms, filters, facets, rules, search
├── catalog/     the generator, its vocabulary and its types
├── search/      documents, the store config, customer groups, golden queries, the benchmark
└── api/         the GraphQL schema and its generated types
docs/
├── benchmarks/  the recorded benchmark results
└── decisions/   the decision records
```

## Background

The behavior modeled here, search as you type with a two-character minimum, exact search before a
fuzzy pass that allows one edit per word, synonyms, facet buckets of several kinds, merchandising
rules that apply only under relevance sort, and results that vary by customer group, follows what
Adobe documents publicly for its Live Search service. The implementation, the names and the
schema are this project's own.

## License

MIT. See [LICENSE](LICENSE).
