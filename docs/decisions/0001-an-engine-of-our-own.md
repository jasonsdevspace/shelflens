# 1. An engine of our own, rather than a library

**Status:** accepted

## Context

A product search needs an inverted index, scoring, typo tolerance, synonyms, facets and a way to
sort and page. Several JavaScript libraries provide most of that in a few kilobytes, and using one
would have put a working search box on the page in an afternoon.

The project exists to show how a search like this is built and where it goes wrong: why the Tees
outranked the T-Shirts, why selecting "Red" must not zero out "Blue", what a merchandiser's pin
does under a price sort, and how to tell a shopper why a result ranked where it did. Those are the
parts a library hides.

## Options

**A. A search library.** MiniSearch, FlexSearch or Lunr for matching and scoring, with facets,
rules and explanations written around it. Fast to start. The matching is a black box, synonyms
are word-level or absent, facet counting is left to the caller, and an explanation of a score is
not available at all.

**B. An engine of our own.** Normalization, the index, matching, synonyms, facets, rules and
explanations, with no dependencies, published as a package. Every behavior is visible and
testable, and every mistake is ours to find.

## Decision

Option B.

- **The interesting decisions live in the matching.** Exact before fuzzy, phrase synonyms scored
  per typed word, one normalization for catalog and query, disjunctive facet counts and rules that
  know about the sort are each a decision record in this folder. None of them could be made inside
  a library.
- **Explanations need the scores.** Explain mode shows which word matched which indexed term, in
  which field, by which route, for how much. That is the engine's internal state, and it is kept
  on every hit because the engine is ours.
- **No dependencies.** The engine runs in a Node process, a service worker and a test with nothing
  to bundle, and the published package has nothing to audit but itself.

## Consequences

- An engine to own, with its tests. The golden queries guard the behavior and the benchmark
  guards the cost, so a change that makes either worse fails the build.
- The first version was slow and heavy, which record 2 describes. A library would have been
  tuned already. Measuring and fixing it was part of the work, and the before-and-after is on the
  record.
- The vocabulary of a generated catalog is small, so the benchmark understates the fuzzy pass,
  which compares the query against every term of a similar length. On a real catalog that pass
  would need a smarter candidate set, such as a trigram or deletion index, before it was fast.

## How it is tested

- The golden queries in `@shelflens/search`, run on every build.
- The engine's own tests, which include breaking each headline behavior on purpose and watching
  the right test fail.
- The benchmark in `docs/benchmarks/`.
- The tour in the storefront, whose every stop names the test behind the gotcha it shows.
