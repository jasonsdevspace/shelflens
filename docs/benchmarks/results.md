# Engine benchmark

Run `npm run bench` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded   | Commit    | Machine                | Node     |
| ---------- | --------- | ---------------------- | -------- |
| 2026-11-04 | `eff7ba6` | Apple M2 Max, 12 cores | v24.22.2 |

## The catalog

100,000 generated products from seed 7: 179.5 MB as JSON, 16.5 MB compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| ----- | ---------- | -------------------- | --------- |
| 305   | 1613 ms    | 61,986               | 89 MB     |

## Queries

Each query runs as a guest with every facet counted, 100 times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query                           | Results | p50   | p95   | p99   |
| ------------------------------- | ------- | ----- | ----- | ----- |
| search as you type, two letters | 61,666  | 17.49 | 21.62 | 24.15 |
| one common word                 | 5,627   | 1.24  | 1.32  | 2.01  |
| three words                     | 375     | 0.38  | 0.48  | 0.51  |
| a synonym                       | 10,449  | 2.33  | 2.9   | 3.55  |
| a typo, so the fuzzy pass runs  | 8,310   | 1.89  | 2     | 2.93  |
| browse a category by position   | 33,566  | 23.79 | 24.62 | 26.98 |
| a word with two filters         | 304     | 1.69  | 1.79  | 2.77  |
| everything, page fifty          | 99,999  | 16.96 | 18.2  | 18.55 |
| a word under rules              | 5,629   | 2.06  | 2.39  | 2.92  |
