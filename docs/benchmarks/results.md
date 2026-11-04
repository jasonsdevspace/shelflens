# Engine benchmark

Run `npm run bench` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded   | Commit    | Machine                | Node     |
| ---------- | --------- | ---------------------- | -------- |
| 2026-11-04 | `ee783d2` | Apple M2 Max, 12 cores | v24.22.2 |

## The catalog

100,000 generated products from seed 7: 179.5 MB as JSON, 16.5 MB compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| ----- | ---------- | -------------------- | --------- |
| 305   | 1535 ms    | 65,131               | 89 MB     |

## Queries

Each query runs as a guest with every facet counted, 100 times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query                           | Results | p50   | p95   | p99   |
| ------------------------------- | ------- | ----- | ----- | ----- |
| search as you type, two letters | 61,666  | 17.54 | 20.89 | 22.83 |
| one common word                 | 5,627   | 1.25  | 1.39  | 2.74  |
| two words                       | 375     | 0.41  | 0.53  | 0.57  |
| a synonym                       | 10,449  | 2.35  | 2.86  | 3.25  |
| a typo, so the fuzzy pass runs  | 8,310   | 1.88  | 2.05  | 2.93  |
| browse a category by position   | 33,566  | 23.59 | 24.67 | 26.21 |
| a word with two filters         | 304     | 1.7   | 1.83  | 2.92  |
| everything, page fifty          | 99,999  | 16.82 | 18.07 | 18.51 |
| a word under rules              | 5,629   | 2.14  | 2.29  | 2.98  |
