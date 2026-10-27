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
| [`@shelflens/api`](packages/api)               | The GraphQL API the storefront is written against: the schema, its generated types, and the resolvers over the store. Nothing from Node, so it runs in a service worker                |
| [`@shelflens/server`](packages/server)         | The same API over HTTP, for local runs and anything that cannot host a service worker                                                                                                  |
| [`@shelflens/storefront`](packages/storefront) | The demo: a typed GraphQL client of its own, the search popover, and the service worker that is the API in the browser                                                                 |

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
- **Size budgets.** The catalog the demo will ship stays under 400 KB compressed, and the API
  bundled for a browser under 90 KB, or the build fails.

## Decisions

Each choice with a real alternative is a record in [docs/decisions](docs/decisions), written when
it was made, with the option rejected, what the choice costs, and the test or measurement behind
it.

1. [An engine of our own, rather than a library](docs/decisions/0001-an-engine-of-our-own.md)
2. [Flat arrays for the index](docs/decisions/0002-flat-arrays-for-the-index.md)
3. [Synonyms rewrite phrases, scored per typed word](docs/decisions/0003-synonyms-rewrite-phrases.md)
4. [Facets count past their own filter](docs/decisions/0004-facets-count-past-their-own-filter.md)
5. [The shape of the API](docs/decisions/0005-the-shape-of-the-api.md)
6. [The API runs in the browser, and in Node when asked](docs/decisions/0006-the-api-runs-in-the-browser.md)
7. [A GraphQL client of our own, rather than Apollo or urql](docs/decisions/0007-a-client-of-our-own.md)

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

To work on the storefront:

```bash
npm run dev
```

That serves the page with hot reloading, and answers `/graphql` from the dev server through the
same API the service worker runs in production. `npm run storefront` builds what the demo
deploys: the page, the catalog it ships, and the worker, which `npx vite preview` in
`packages/storefront` then serves.

Three more commands are worth knowing:

```bash
npm run catalog -- --products 50 --out data/catalog.json
npm run bench
npm run api
```

The first writes a catalog to look at. The second runs the benchmark and writes its results to
`docs/benchmarks/`. The third serves the API on port 8080, so a query can be sent by hand:

```bash
curl localhost:8080/graphql --header 'content-type: application/json' \
  --header 'shelflens-customer-group: member' \
  --data '{ "query": "{ search(input: { phrase: \"boot\" }) { total items { product { name } } } }" }'
```

The schema is `packages/api/schema.graphql` and the storefront's operations are in
`packages/storefront/src/operations/`. Changing either means running `npm run codegen` and
committing the generated types, which CI checks.

## Layout

```
packages/
├── engine/      the search engine, published as @jasonsdevspace/shelflens
│   └── src/     normalize, index-builder, match, synonyms, filters, facets, rules, search
├── catalog/     the generator, its vocabulary and its types
├── search/      documents, the store config, customer groups, golden queries, the benchmark
├── api/         the GraphQL schema, its generated types, the resolvers and the request limits
├── server/      the API behind POST /graphql, with a rate limit and a request id
└── storefront/  the demo page
    └── src/     client (the GraphQL client and the latest-request helper), search (the popover
                 and results), worker (the API as a service worker), operations, generated
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
