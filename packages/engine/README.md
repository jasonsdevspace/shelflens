# @jasonsdevspace/shelflens

A product search engine in plain TypeScript. Typo tolerance, synonyms, search as you type,
filters, sorting, stable pagination, and an explanation for every result. No dependencies, no I/O,
so it runs the same in Node, in a browser and in a test.

```bash
npm install @jasonsdevspace/shelflens
```

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
- **Nothing is still an answer.** When a search finds nothing, `recover` offers what would: the
  phrase with a word two typos off replaced by the nearest word in use, the phrase with the words
  nothing matched left out, or failing that without its rarest word, and a count of what the same
  phrase finds without its filters. Each is offered only if it finds something.
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
  filter is absent, and the result reports the sort actually applied. When no sort is asked for,
  a query sorts by relevance, browsing one value of a scope sorts by its scoped sort, and anything
  else comes in index order.
- Pages are one-based. A page past the end is empty rather than an error. The page size is clamped
  to a limit, and a query can be paged only so far, while the total still reports every match.

## Facets

A facet is a filter the shopper could add next, with a count beside each choice. Keyword facets
list an attribute's values, range facets count documents into fixed bands with exclusive upper
bounds, and stats facets report the smallest and largest value for a slider.

Each facet is counted over the documents that match the query and every filter except the ones on
its own attribute. Selecting "Red" never drops "Blue" to zero in the same facet, so a shopper can
always widen a selection, while a filter on a different attribute narrows every facet as expected.

## Merchandising rules

A rule names when it applies, to certain queries or inside a filter and optionally between two
dates, and what it does: pin products to the top, boost or bury them, or hide them. Rules are
checked when the engine is created, so a rule that names a product or an attribute that does not
exist or does nothing is refused at startup. `engine.reconfigure({ rules })` applies new rules over
the same index without rebuilding it.

Beside the rules, `signals` names how often each document was chosen, from whatever the host
collected. A chosen document's relevance score is multiplied by a bounded weight, rising with the
log of the count to a cap of 1.25, so the first few choices count most and a thousand more change
nothing. The cap sits below the smallest boost a merchandiser would write, and a document a rule
pinned or buried takes no signal at all, so the crowd never moves what a merchandiser placed. A
hit that was raised says so, with the count and the weight. `engine.reconfigure({ signals })` applies
new counts over the same index.

Boosts and buries change the relevance score, so they mean nothing under any other sort. Pins and
hides still apply under a sort scoped to the rule's own filter, which is how a category's
merchandising survives its position sort. A rule set aside by the sort is reported in the result,
so a page can say that sorting by price switched the merchandising off. Every effect a rule has on a
result is recorded on that hit, alongside its matches, for explain mode.

## Where it comes from

This is the engine under [ShelfLens](https://github.com/jasonsdevspace/shelflens), a search demo
whose [live storefront](https://jasonsdevspace.com/shelflens/) runs it in a service worker. The
choices behind it, each with the alternative it rejected and the test behind it, are that
repository's [decision records](https://github.com/jasonsdevspace/shelflens/tree/main/docs/decisions).
Versions follow semantic versioning, and the [changelog](CHANGELOG.md) says what each one changed.
