# Engine benchmark

Run `npm run bench` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-11-02 | `3e91942` | Apple M2 Max, 12 cores | v24.3.0 |

## The catalog

100,000 generated products from seed 7: 179.5 MB as JSON, 16.5 MB compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| ----- | ---------- | -------------------- | --------- |
| 305   | 1928 ms    | 51,878               | 89 MB     |

## Queries

Each query runs as a guest with every facet counted, 100 times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query                           | Results | p50   | p95   | p99   |
| ------------------------------- | ------- | ----- | ----- | ----- |
| search as you type, two letters | 61,666  | 34.25 | 40.69 | 94.25 |
| one common word                 | 5,627   | 1.49  | 7.08  | 7.9   |
| two words                       | 375     | 15.78 | 18.14 | 90.33 |
| a synonym                       | 10,449  | 3.33  | 9     | 9.41  |
| a typo, so the fuzzy pass runs  | 8,310   | 2.63  | 7.77  | 8.92  |
| browse a category by position   | 33,566  | 24.64 | 27.26 | 27.81 |
| a word with two filters         | 304     | 2.18  | 6.82  | 7.06  |
| everything, page fifty          | 99,999  | 18.12 | 20.14 | 21.73 |
