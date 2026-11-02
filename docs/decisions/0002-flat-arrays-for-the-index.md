# 2. Flat arrays for the index

**Status:** accepted

## Context

The first index was written the way it reads: a `Map` from term to a list of postings, each
posting an object holding a `Map` of field counts, each document carrying a `Map` of attributes
and another of field lengths. On the two-thousand-product demo catalog it was fine. The benchmark
over a hundred thousand products put it at 979 MB of memory and about a third of a second for a
two-letter prefix or a browse of everything, with the slowest one percent of queries past a second
from garbage collection pauses under that much allocation.

## Options

**A. Keep the objects and reduce the catalog.** The demo would never notice. The engine would be
unpublishable, and the benchmark would be documenting a problem rather than measuring a design.

**B. Flat arrays.** A posting list is a typed array of document numbers and a typed array of
counts beside it, one small integer per field. Attributes are one column per attribute. Lengths
are one array per field. A search keeps its candidates as parallel arrays and builds result
objects only for the page it returns.

**C. An off-the-shelf index structure.** Trades the memory problem for a dependency, which record
1 rules out.

## Decision

Option B, measured by the same benchmark on the same machine.

|                                         | Objects | Flat arrays |
| --------------------------------------- | ------- | ----------- |
| Index memory, 100,000 products          | 979 MB  | 84 MB       |
| Two-letter prefix with every facet, p50 | 341 ms  | 93 ms       |
| Two-letter prefix, p99                  | 800 ms  | 176 ms      |
| Browse everything with every facet, p50 | 339 ms  | 90 ms       |
| Index build time                        | 1.8 s   | 2.4 s       |

- **The filters are evaluated once per candidate** into a pass set, and every facet without a
  filter on its own attribute shares it. Before, each facet re-evaluated every filter for every
  candidate.
- **Hit objects exist only for the page.** A browse of a hundred thousand products used to build
  a hundred thousand of them, each with a matches array, to return twenty.
- **Ties break on a precomputed id rank**, an integer, rather than comparing id strings while
  sorting.

**Amended with engine 0.4.0.** The flat arrays left work a search did not need, and four changes
take it out without changing a single result. A grid of searches, under rules, under
signals and with neither, across sorts, filters and pages, gave byte for byte the same answers
before and after.

- **Indexing appends straight into the postings.** The first occurrence of a term in a document
  opens its row in the term's list and later ones add to it, where each document's rows used to
  be assembled in a map of their own and copied in. Each field's text is normalized once for its
  terms and its word count, where it was normalized twice.
- **Facets count by code.** Each keyword value has a small integer code, assigned when the index is
  built, and a facet counts into an array by code. [Record
  4](0004-facets-count-past-their-own-filter.md) has the rest.
- **Only the top of the matches is ordered.** A page needs the results up to its last one, and
  when that is fewer than half the matches they are kept in a heap rather than every match being
  sorted. Every sort ends on the id rank, so the order is total and the heap gives exactly what a
  full sort and a slice gave.
- **Scores are adjusted only when something asks.** A search no rule boosts, buries or pins and no
  signal reaches leaves the scores alone without visiting a candidate. Signals are looked up by
  document number, set out once when the engine is configured, rather than by id per candidate.

Both columns were measured the same day, on the same machine and the same generated catalog, the
first at `9327e47` with 0.3.0 and the second at the commit [results.md](../benchmarks/results.md)
names.

|                                         | 0.3.0  | 0.4.0 |
| --------------------------------------- | ------ | ----- |
| Index memory, 100,000 products          | 84 MB  | 89 MB |
| Two-letter prefix with every facet, p50 | 101 ms | 34 ms |
| Two-letter prefix, p99                  | 149 ms | 94 ms |
| Browse a category by position, p50      | 82 ms  | 25 ms |
| Browse everything with every facet, p50 | 100 ms | 18 ms |
| Index build time                        | 2.3 s  | 1.9 s |

The five megabytes are the codes, one integer for every value of every faceted keyword attribute
on every document.

## Consequences

- Index build was a third slower, from assembling each document's rows before appending them.
  Since 0.4.0 the rows are appended in place, and the build takes 1.9 seconds, against 1.8 for
  the objects. It is paid once at startup.
- The code is less idiomatic in places: row-major count arrays and a binary search to find a
  document in a posting list. Each is explained where it sits.
- Typed arrays live in array buffers outside the JavaScript heap, which `heapUsed` does not
  count. The benchmark adds both. Without that, the new index reported twelve megabytes, which
  was not true.
- Facet counting was most of a wide query until 0.4.0 counted by code. [Record
  4](0004-facets-count-past-their-own-filter.md) describes what it costs now.

## How it is tested

- Every engine test passed unchanged across the rewrite, which is what they were written for.
- The benchmark, before and after, in `docs/benchmarks/`.
