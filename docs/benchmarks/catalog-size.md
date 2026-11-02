# Catalog size benchmark

Run `npm run bench:sizes` to reproduce it. The raw results are in
[catalog-size.json](catalog-size.json).

A visitor can search their own catalog, and this says how large it can be. Each size is the
[popover benchmark](popover.md) run over a generated catalog of that many products: starting the
store once, then every prefix of every golden query as a suggestion and every golden query as a
search. A visitor may be on a phone, so each time is slowed 4 times, as
Lighthouse slows the processor for mobile. A size fits when, slowed, suggestions and searches
answer within 50 ms at the 95th percentile and the store starts within
2 seconds, the one wait after loading a file.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-11-02 | `9327e47` | Apple M2 Max, 12 cores | v24.3.0 |

Each time is shown as measured on the laptop and then slowed for a phone, which is the number held
to the budget.

| Products | Catalog (uncompressed) | Start     | On a phone | Suggest p95 | On a phone | Search p95 | On a phone | Fits a phone |
| -------- | ---------------------- | --------- | ---------- | ----------- | ---------- | ---------- | ---------- | ------------ |
| 2000     | 3.6 MB                 | 70.67 ms  | 282.68 ms  | 0.8 ms      | 3.2 ms     | 0.41 ms    | 1.64 ms    | yes          |
| 5000     | 8.9 MB                 | 131.07 ms | 524.28 ms  | 1.77 ms     | 7.08 ms    | 0.64 ms    | 2.56 ms    | yes          |
| 10000    | 17.8 MB                | 274.88 ms | 1099.52 ms | 3.41 ms     | 13.64 ms   | 1.01 ms    | 4.04 ms    | yes          |
| 25000    | 44.7 MB                | 701.56 ms | 2806.24 ms | 9.39 ms     | 37.56 ms   | 2.36 ms    | 9.44 ms    | no           |

The largest size that fits, with every smaller one fitting too, is 10000 products,
and that is the cap on a visitor's catalog.
