# Engine benchmark

Run `npm run bench` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-10-27 | `1ca987a` | Apple M2 Max, 12 cores | v24.3.0 |

## The catalog

100,000 generated products from seed 7: 179.9 MB as JSON, 16.6 MB compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| ----- | ---------- | -------------------- | --------- |
| 306   | 1826 ms    | 54,773               | 979 MB    |

## Queries

Each query runs as a guest with every facet counted, 100 times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query                           | Results | p50    | p95    | p99     |
| ------------------------------- | ------- | ------ | ------ | ------- |
| search as you type, two letters | 61,666  | 341.15 | 357.47 | 800.32  |
| one common word                 | 5,627   | 16.08  | 17.78  | 18.12   |
| two words                       | 375     | 61.88  | 66.84  | 1156.51 |
| a synonym                       | 10,449  | 34.77  | 39.57  | 41.55   |
| a typo, so the fuzzy pass runs  | 8,310   | 24.17  | 29.16  | 32.46   |
| browse a category by position   | 33,566  | 248.29 | 260.64 | 527.93  |
| a word with two filters         | 304     | 14.33  | 17.13  | 17.37   |
| everything, page fifty          | 99,999  | 339.05 | 352.93 | 698.62  |
