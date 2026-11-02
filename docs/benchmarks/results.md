# Engine benchmark

Run `npm run bench` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-11-02 | `9327e47` | Apple M2 Max, 12 cores | v24.3.0 |

## The catalog

100,000 generated products from seed 7: 179.5 MB as JSON, 16.5 MB compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| ----- | ---------- | -------------------- | --------- |
| 305   | 1992 ms    | 50,213               | 91 MB     |

## Queries

Each query runs as a guest with every facet counted, 100 times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query                           | Results | p50   | p95   | p99   |
| ------------------------------- | ------- | ----- | ----- | ----- |
| search as you type, two letters | 61,666  | 33.94 | 40.48 | 89.77 |
| one common word                 | 5,627   | 1.49  | 7.09  | 7.64  |
| two words                       | 375     | 15.81 | 18    | 91.84 |
| a synonym                       | 10,449  | 3.24  | 8.88  | 9.53  |
| a typo, so the fuzzy pass runs  | 8,310   | 2.61  | 7.81  | 8.19  |
| browse a category by position   | 33,566  | 26.78 | 30.11 | 33.28 |
| a word with two filters         | 304     | 2.4   | 7.82  | 8.53  |
| everything, page fifty          | 99,999  | 19.96 | 21.88 | 22.86 |
