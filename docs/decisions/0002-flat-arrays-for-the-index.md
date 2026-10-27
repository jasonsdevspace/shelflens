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

## Consequences

- Index build is a third slower, from assembling each document's rows before appending them. It
  is paid once at startup, and the demo catalog builds in well under a tenth of a second.
- The code is less idiomatic in places: row-major count arrays and a binary search to find a
  document in a posting list. Each is explained where it sits.
- Typed arrays live in array buffers outside the JavaScript heap, which `heapUsed` does not
  count. The benchmark adds both. Without that, the new index reported twelve megabytes, which
  was not true.
- Facet counting is still most of a wide query. Record 4 describes what it costs and what the
  next step would be if a catalog needed it.

## How it is tested

- Every engine test passed unchanged across the rewrite, which is what they were written for.
- The benchmark, before and after, in `docs/benchmarks/`.
