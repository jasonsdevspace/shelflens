# ShelfLens

A product search engine, and the store built on it. **[Try the
demo](https://jasonsdevspace.com/shelflens/)**, which opens a tour of the interesting parts on a
first visit.

ShelfLens is a fictional store. Its search has to do what a real store's does: find the right
product from a few typed letters, forgive a typo, know that trainers are sneakers, count how many
of each color are left after a filter, let a merchandiser pin a promotion, and explain why each
result ranked where it did. This repository holds the engine that does that, the catalog it is
tested against, the GraphQL API over both, and the storefront, which runs the whole API inside
the browser.

**Why I built it.** At Adobe I worked on a React storefront search experience backed by a
GraphQL search API. Search looks simple until a shopper types "t shirt" and
the Tees outrank the T-Shirts, or a member's price is served to the next guest from a cache. This
is a small, complete example of how I approach that kind of problem: measure, write the check that
would have caught the mistake, then fix it. It is built only from public documentation of how
such systems behave, with its own names and its own schema.

## Two minutes with the demo

Each step is a link into the live storefront. The tour button in the masthead walks all fourteen
stops with the test behind each.

1. [Type "trail runner" quickly.](https://jasonsdevspace.com/shelflens/) The answer to "tra" can
   arrive after the answer to "trail", and a client that shows whatever came last shows the wrong
   list. This one never does. A burst of keystrokes costs one request, and the popover is a
   combobox you can drive from the keyboard.
2. [Open the product a guest cannot see.](https://jasonsdevspace.com/shelflens/?product=SL-00008)
   Switch to member in the masthead: it appears, and back on the results the brands that give
   members a discount show lower prices. A cache keyed on the query alone would serve a member's
   answer to the next guest, and a test proves it does.
3. [Search "jacket" in explain mode.](https://jasonsdevspace.com/shelflens/?q=jacket&explain=1)
   Two jackets are pinned first by a rule, and every card says which word matched which term in
   which field and what the rule did. Sort by price and the pin is set aside, and the page says so.
4. [Tick a brand under "jacket".](https://jasonsdevspace.com/shelflens/?q=jacket) The other
   brands keep their counts, because a facet counts past its own filter. Everything you did is in
   the address bar, so copy it, share it, or press back.
5. [Search "zzqx jacket".](https://jasonsdevspace.com/shelflens/?q=zzqx%20jacket) Nothing matched,
   and the page shows the results of "jacket" instead, offers a spelling when a word is two typos
   off, and falls back to the most rated products.

## The gotchas, and the test behind each

The project exists for these. Each one that claims a failure has a test that fails on the naive
version, and the tour's stops name them.

| Gotcha                                                                                               | Where it is tested                                                               |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A late answer to an earlier phrase must not win                                                      | `packages/storefront/src/client/latest.test.ts`, `src/search/SearchBox.test.tsx` |
| A burst of keystrokes is one request                                                                 | `packages/storefront/src/search/SearchBox.test.tsx`                              |
| The popover is a combobox: arrow keys, Escape, announcements, an accessibility audit                 | `packages/storefront/src/search/SearchBox.test.tsx`, `e2e/storefront.spec.ts`    |
| A cache keyed on the query alone serves a member's price to a guest                                  | `packages/api/src/cache.test.ts`                                                 |
| "Café" and "cafe", "T-Shirt" and "tshirt", "shoes" and "shoe" match                                  | `packages/engine/src/normalize.test.ts`, `synonyms.test.ts`                      |
| Choosing "Red" never zeroes "Blue"                                                                   | `packages/engine/src/facets.test.ts`                                             |
| The URL is the page, and a value it cannot read is ignored                                           | `packages/storefront/src/app/url.test.ts`                                        |
| Paging never shows a product twice or skips one                                                      | `packages/engine/src/search.test.ts`                                             |
| A page past the end is empty, a page size past the limit is reduced, pins beyond the page still lead | `packages/engine/src/search.test.ts`, `rules.test.ts`                            |
| Pins and boosts disappear under a sort, and the page says so                                         | `packages/engine/src/rules.test.ts`, `packages/storefront/src/App.test.tsx`      |
| A malformed request is a validation error with a code, never a 500                                   | `packages/api/src/api.test.ts`, `http.test.ts`                                   |
| A product with variants shows a range, in the store's currency and locale                            | `packages/storefront/src/format/money.test.ts`                                   |

Two product additions carry the rest of the story. **Explain mode** turns the engine's internal
state, kept on every hit, into a line under each card: the tool a merchandiser needs to answer
"why is this product first". **Nothing is still a page**: when a search finds nothing, the engine
offers a spelling two typos away, a shorter phrase with its results and what the same phrase finds
without its filters, each only if it finds something.

## What is here

| Package                                        | What it is                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@jasonsdevspace/shelflens`](packages/engine) | The search engine, [on npm](https://www.npmjs.com/package/@jasonsdevspace/shelflens): one normalization for catalog and query, exact-then-fuzzy matching, phrase synonyms, facets, merchandising rules, a recovery for nothing, and an explanation on every hit. No dependencies. |
| [`@shelflens/catalog`](packages/catalog)       | A deterministic generator for the store's product catalog, so every test and benchmark runs against the same data                                                                                                                                                                 |
| [`@shelflens/search`](packages/search)         | The catalog mapped onto the engine: field weights, facets, synonyms, customer groups, the golden queries and the benchmark                                                                                                                                                        |
| [`@shelflens/api`](packages/api)               | The GraphQL API the storefront is written against: the schema, its generated types, the resolvers, the one cache key, and the shape over HTTP. Nothing from Node, so it runs in a service worker                                                                                  |
| [`@shelflens/server`](packages/server)         | The same API over HTTP, for local runs and anything that cannot host a service worker                                                                                                                                                                                             |
| [`@shelflens/storefront`](packages/storefront) | The demo: a typed GraphQL client of its own, the popover, the results page, explain mode, the no-results page, the tour, and the service worker that is the API in the browser                                                                                                    |

## What was measured

- **The golden queries.** Things a shopper might type, each with what its top results must be,
  run in the test suite. Their first run found that synonyms expanded word by word, so "t shirt"
  credited a Tee twice for one word and ranked it above an actual T-Shirt.
- **The engine.** `npm run bench` indexes a hundred thousand generated products and times the
  requests a storefront sends. Its first run showed about a gigabyte of memory for the index and a
  third of a second for the widest queries. Flat arrays instead of a Map per posting, and result
  objects built only for the page returned, brought that to 84 MB and about a tenth of a second.
  [The record](docs/benchmarks/results.md) is kept with the machine it ran on.
- **The popover.** Results must be visible within 150 ms of the last keystroke. The search box
  waits 100 ms for the typing to pause, and the slowest suggestion on the demo catalog takes well
  under the 50 ms left. [The record](docs/benchmarks/popover.md).
- **The cold first visit.** With nothing cached, the page is ready to search in about a fifth of a
  second served locally, with the worker spending 38 ms downloading the catalog and the rules and
  55 ms building the store. The catalog ships at 333 KB compressed, the page at 79 KB, the worker
  at 65 KB. [The record](docs/benchmarks/cold-visit.md).
- **Budgets and audits, in CI.** The catalog stays under 400 KB compressed, the API bundled for a
  browser under 90 KB, and the page under 100 KB with nothing from GraphQL in it, or the build
  fails. The storefront runs in a real browser on a desktop and a phone profile with an
  accessibility audit of every page it reaches, and Lighthouse scores a hundred for accessibility
  on the home page, a results page in explain mode, a category and a product.

## Decisions

Each choice with a real alternative is a record in [docs/decisions](docs/decisions), written when
it was made, with the option rejected, what the choice costs, and the test or measurement behind
it. Each has been read again against the code as shipped.

1. [An engine of our own, rather than a library](docs/decisions/0001-an-engine-of-our-own.md)
2. [Flat arrays for the index](docs/decisions/0002-flat-arrays-for-the-index.md)
3. [Synonyms rewrite phrases, scored per typed word](docs/decisions/0003-synonyms-rewrite-phrases.md)
4. [Facets count past their own filter](docs/decisions/0004-facets-count-past-their-own-filter.md)
5. [The shape of the API](docs/decisions/0005-the-shape-of-the-api.md)
6. [The API runs in the browser, and in Node when asked](docs/decisions/0006-the-api-runs-in-the-browser.md)
7. [A GraphQL client of our own, rather than Apollo or urql](docs/decisions/0007-a-client-of-our-own.md)
8. [One cache key, defined once, for three layers](docs/decisions/0008-one-cache-key.md)

## Dev setup

You need [Node.js 24](https://nodejs.org/) and Git.

```bash
git clone https://github.com/jasonsdevspace/shelflens.git
cd shelflens
npm ci
npm run verify
```

`npm run verify` runs what CI runs: type checking, linting, formatting, a prose check and the
tests, golden queries included. Use `npm test` for watch mode while you work. CI also runs the
storefront in a real browser with `npm run e2e` and audits it with `npm run lighthouse`, which
need Chromium once: `npx playwright install chromium`.

To work on the storefront:

```bash
npm run dev
```

That serves the page with hot reloading, and answers the API from the dev server through the
same resolvers and the same rules file the service worker runs in production. `npm run storefront`
builds what the demo deploys: the page, the catalog, the rules and the worker, which `npx vite
preview` in `packages/storefront` then serves. Every merge to main that passes CI deploys it.

More commands worth knowing:

```bash
npm run catalog -- --products 50 --out data/catalog.json
npm run bench
npm run bench:popover
npm run bench:cold
npm run api
```

The first writes a catalog to look at. The next three run the benchmarks and write their results
to `docs/benchmarks/`. The last serves the API on port 8080, so a query can be sent by hand:

```bash
curl localhost:8080/graphql --header 'content-type: application/json' \
  --header 'shelflens-customer-group: member' \
  --data '{ "query": "{ search(input: { phrase: \"boot\" }) { total items { product { name } } } }" }'
```

To release the engine, bump the version in `packages/engine/package.json`, add the entry to
`packages/engine/CHANGELOG.md`, merge that, then push a tag named for the version, such as
`engine-v0.2.0`. The release workflow confirms the tag, the version and the changelog agree and
that the commit is on main, runs every check CI runs, publishes to npm with provenance through
npm's trusted publishing, and creates the GitHub release with the changelog entry as its notes.
A version with a hyphen, such as `0.2.0-rc.1`, is published under the `next` tag and marked as
a prerelease. Nothing is published by hand.

The schema is `packages/api/schema.graphql` and the storefront's operations are in
`packages/storefront/src/operations/`. Changing either means running `npm run codegen` and
committing the generated types and the persisted operations, which CI checks. The demo's
merchandising is `packages/storefront/public/rules.json`, validated when the store is built.

## Layout

```
packages/
├── engine/      the search engine, published as @jasonsdevspace/shelflens
│   └── src/     normalize, index-builder, match, edits, synonyms, filters, facets, rules, search
├── catalog/     the generator, its vocabulary and its types
├── search/      documents, the store config, customer groups, golden queries, the benchmark
├── api/         the schema, its generated types, the resolvers, the cache key, the shape over HTTP
├── server/      the API behind HTTP, with a rate limit and a request id
└── storefront/  the demo page
    ├── public/  the rules file, and the catalog the build writes beside it
    └── src/     app (the URL as state, categories, the store context), client (the GraphQL
                 client, its memory and the latest-request helper), search (the popover),
                 results (facets, sort, pages, explain mode, nothing), product, tour, worker
                 (the API as a service worker), dev (the API inside the dev server), bench
                 (the measurements and the audit), operations, generated
docs/
├── benchmarks/  the recorded measurements
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
