# Engine benchmark

Run `npm run bench` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-10-27 | `8512d4a` | Apple M2 Max, 12 cores | v24.3.0 |

## The catalog

100,000 generated products from seed 7: 179.9 MB as JSON, 16.6 MB compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| ----- | ---------- | -------------------- | --------- |
| 306   | 2375 ms    | 42,113               | 84 MB     |

## Queries

Each query runs as a guest with every facet counted, 100 times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query                           | Results | p50   | p95   | p99    |
| ------------------------------- | ------- | ----- | ----- | ------ |
| search as you type, two letters | 61,666  | 93.21 | 98.31 | 175.66 |
| one common word                 | 5,627   | 4.6   | 9.83  | 10.11  |
| two words                       | 375     | 15.96 | 18.6  | 93.88  |
| a synonym                       | 10,449  | 9.81  | 15.3  | 16.88  |
| a typo, so the fuzzy pass runs  | 8,310   | 7.16  | 12.48 | 13.39  |
| browse a category by position   | 33,566  | 71.29 | 74.71 | 77.53  |
| a word with two filters         | 304     | 2.9   | 7.51  | 8.11   |
| everything, page fifty          | 99,999  | 90.12 | 93.61 | 95.79  |
