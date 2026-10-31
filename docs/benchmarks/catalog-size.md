# Catalog size benchmark

Run `npm run bench:sizes` to reproduce it. The raw results are in
[catalog-size.json](catalog-size.json).

A visitor can search their own catalog, and this says how large it can be. Each size is the
[popover benchmark](popover.md) run over a generated catalog of that many products: starting the
store once, then every prefix of every golden query as a suggestion and every golden query as a
search. A visitor may be on a phone, so each number is slowed 4 times, as
Lighthouse slows the processor for mobile. A size fits when, slowed, suggestions and searches
answer within 50 ms at the 95th percentile and the store starts within
2 seconds, the one wait after loading a file.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-10-31 | `55c9a1a` | Apple M2 Max, 12 cores | v24.3.0 |

| Products | Catalog (uncompressed) | Start     | Suggest p95 | Suggest max | Search p95 | Fits a phone |
| -------- | ---------------------- | --------- | ----------- | ----------- | ---------- | ------------ |
| 2000     | 3.6 MB                 | 77.92 ms  | 0.87 ms     | 2.2 ms      | 0.5 ms     | yes          |
| 5000     | 8.9 MB                 | 148.77 ms | 1.75 ms     | 5.05 ms     | 0.67 ms    | yes          |
| 10000    | 17.8 MB                | 312.67 ms | 3.48 ms     | 9.98 ms     | 1.45 ms    | yes          |
| 25000    | 44.8 MB                | 762.2 ms  | 10.37 ms    | 29.84 ms    | 2.82 ms    | no           |

The largest size that fits, with every smaller one fitting too, is 10000 products,
and that is the cap on a visitor's catalog.
